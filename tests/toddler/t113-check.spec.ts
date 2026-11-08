// T-113 定點檢查（只給這次開發用，不在三歲測試的清單裡）：
//   rm -rf test-results/t113/dist && npx vite build --outDir test-results/t113/dist && TODDLER_PORT=4677 npx playwright test -c tests/toddler/t113.config.ts
// 1. 英文描字：拖到一半放手（進度有走、不到六成）也算「沒描好」→ Nice try!、跑道亮、筆帶到終點；第二次 You drew it!、往下一輪
// 2. 中文故事頁：連點同一張圖 6 下，每一下的反應都不一樣
// 3. 三堂課最後一題答對 → 慶祝、下課畫面要多久
// 4. 英文大小 S：一直點同一個錯的，第幾下手指出現
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

const OUT = `test-results/t113/${process.env.T113_LABEL ?? 'run'}.json`
const SHOTS = 'test-results/t113/shots'
const result: Record<string, unknown> = {}
test.afterAll(() => {
  fs.mkdirSync('test-results/t113', { recursive: true })
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
  fs.writeFileSync(OUT, JSON.stringify({ ...prev, ...result }, null, 1))
})

const today = (page: Page) =>
  page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
const put = (page: Page, store: string, row: Record<string, unknown>) =>
  page.evaluate(
    ({ store, row }) =>
      new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const tx = rq.result.transaction(store, 'readwrite')
          tx.objectStore(store).put(row)
          tx.oncomplete = () => (rq.result.close(), res())
          tx.onerror = () => rej(tx.error)
        }
      }),
    { store, row },
  )
const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].pop()
    const r = e?.getBoundingClientRect()
    return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, sel)
async function touch(cdp: CDPSession, pts: { x: number; y: number }[], stepMs = 16, holdMs = 90) {
  const tp = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) })
  for (const p of pts.slice(1)) {
    await new Promise((r) => setTimeout(r, stepMs))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) })
  }
  await new Promise((r) => setTimeout(r, holdMs))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const voices = (page: Page) =>
  page.evaluate(() => [...window.__toddler.voices.map((v) => ({ t: v.t, s: v.text })), ...window.__toddler.tts.map((v) => ({ t: v.t, s: v.text }))].filter((v) => v.s).sort((a, b) => a.t - b.t).map((v) => v.s!))
async function door(page: Page, cdp: CDPSession, name: string) {
  await page.reload()
  await page.waitForSelector('.scene')
  const d = (await center(page, `.door[data-door="${name}"], .side-door[data-door="${name}"]`))!
  await touch(cdp, [d])
}
/** 中文課：說明卡（第一次）按「開始念」，等課本出來 */
async function startReading(page: Page, cdp: CDPSession) {
  await page.waitForSelector('.zh-read, .zh-intro', { timeout: 20_000 })
  for (let i = 0; i < 15 && !(await page.$('.zh-read')); i++) {
    const go = await center(page, '.zh-intro .zh-go')
    if (go) await touch(cdp, [go])
    await page.waitForTimeout(800)
  }
}
/** 從按下去到某個選擇器出現要多久（ms；沒出現 null） */
const until = (page: Page, sel: string, ms = 15_000) =>
  page
    .waitForSelector(sel, { state: 'attached', timeout: ms })
    .then(() => page.evaluate(() => performance.now()))
    .catch(() => null)

/** 描字板上的點：這一筆從 a 到 b（0～1）照著跑道 */
const along = (page: Page, a: number, b: number) =>
  page.evaluate(
    ({ a, b }) => {
      const board = [...document.querySelectorAll('.en-trace-board')].pop()!
      const p = board.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
      const m = p.getScreenCTM()!
      const len = p.getTotalLength()
      return Array.from({ length: 13 }, (_, i) => {
        const q = p.getPointAtLength(len * (a + ((b - a) * i) / 12))
        const s = new DOMPoint(q.x, q.y).matrixTransform(m)
        return { x: s.x, y: s.y }
      })
    },
    { a, b },
  )
const canDraw = (page: Page) =>
  page.waitForFunction(() => document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false' && !document.querySelector('.en-trace[data-demo]'), null, { timeout: 60_000 })

test('英文描字：拖到一半放手也走 Nice try!／You drew it!，不會只有顏色沒有聲音', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  await boot(page, 140, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  // 寫寫看（盲測 seed 1 第 9 步就是在這一段拖到一半放手）
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: await today(page), done: false, good: false, stage: 'write', round: 0 } })
  await door(page, cdp, 'english')
  await page.waitForSelector('.en-lesson[data-phase="write"] .en-trace', { timeout: 20_000 })
  await canDraw(page)
  await page.waitForTimeout(3200)
  const n0 = (await voices(page)).length
  // 照著描 0～40% 就放手（盲測：拖 5 點、中途放手）
  await touch(cdp, await along(page, 0, 0.4), 30)
  await page.waitForTimeout(500)
  const glow = await page.evaluate(() => !!document.querySelector('[data-trace-glow]'))
  await page.screenshot({ path: `${SHOTS}/1-拖到一半放手.png` })
  await page.waitForTimeout(2500)
  const said1 = (await voices(page)).slice(n0)
  const lane = await page.evaluate(() => getComputedStyle([...document.querySelectorAll('.en-trace-board svg path')][1]).stroke)
  console.log(`第一次拖到一半：聽到 ${said1.join('、') || '（沒有聲音）'}；跑道亮 ${glow}；跑道顏色 ${lane}`)
  result.trace1 = { said: said1, glow, lane }
  // 第二次還是拖一小段就放手
  const n1 = (await voices(page)).length
  await touch(cdp, await along(page, 0.4, 0.55), 30)
  const moved = await page
    .waitForSelector('.en-lesson[data-phase="quiz"]', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  const said2 = (await voices(page)).slice(n1)
  console.log(`第二次：聽到 ${said2.join('、') || '（沒有聲音）'}；往下走到選擇題 ${moved}`)
  result.trace2 = { said: said2, moved }
  expect(said1.join(' ')).toMatch(/Nice try!/)
  expect(glow).toBe(true)
  expect(said2.join(' ')).toMatch(/You drew it!/)
  expect(moved).toBe(true)
})

test('中文故事頁：連點同一張圖，每一下的反應都不一樣', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 141, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await door(page, cdp, 'chinese')
  await startReading(page, cdp)
  await page.waitForSelector('.zh-line.on .zh-pic', { timeout: 20_000 })
  await page.waitForTimeout(800)
  // 每一下之後 0.25 秒看那張圖：transform（動到哪）、多出來的東西
  const looks: string[] = []
  for (let i = 0; i < 6; i++) {
    const p = (await center(page, '.zh-line.on .zh-pic'))!
    const sfx0 = await page.evaluate(() => window.__toddler.sfx)
    await touch(cdp, [p])
    await page.waitForTimeout(250)
    looks.push(
      await page.evaluate((s0) => {
        const b = [...document.querySelectorAll('.zh-line.on .zh-pic')][0] as HTMLElement
        const inner = b.querySelector('.zh-pic-in') as HTMLElement
        const act = b.getAttribute('data-act') ?? inner?.getAttribute('data-act') ?? ''
        const bits = b.querySelectorAll('.zh-bit, .sparkle, [class*="spark"]').length
        return `動作 ${act || '—'}｜transform ${getComputedStyle(b).transform.slice(0, 40)}｜內層 ${getComputedStyle(inner).transform.slice(0, 40)}｜小東西 ${bits}｜音效 ${window.__toddler.sfx - s0}`
      }, sfx0),
    )
    await page.waitForTimeout(900)
  }
  console.log('連點同一張圖：\n' + looks.map((x, i) => `  第 ${i + 1} 下：${x}`).join('\n'))
  result.zhTaps = looks
  const acts = looks.map((x) => x.split('｜')[0])
  expect(new Set(acts.slice(1)).size).toBeGreaterThanOrEqual(4)
})

test('英文：問小 s 一直點大 S，第幾下手指出現', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 142, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  // 從選擇題第 1 題開始（同一天回來接著上會把小寫題換成大寫，所以從第 1 題、先答對大 S）
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: await today(page), done: false, good: false, stage: 'words', round: 0 } })
  await put(page, 'kv', { key: 'lesson-format-solo', value: { 'en-big': 5, 'en-little': 5, 'en-word': 5 } })
  await door(page, cdp, 'english')
  // 單字念完 → 寫寫看（有的話，筆會在 45 秒後帶著描完；這裡直接描）→ 選擇題第 1 題答對
  for (let i = 0; i < 120 && !(await page.$('.en-lesson[data-phase="quiz"]')); i++) {
    if (await page.$('.en-lesson[data-phase="write"] .en-trace:not([data-accepting="false"]):not([data-demo])')) {
      const pts = await along(page, 0, 1).catch(() => null)
      if (pts) await touch(cdp, pts, 20)
      await page.waitForTimeout(1500)
    } else await page.waitForTimeout(500)
  }
  await page.waitForSelector('.en-options.is-big .en-opt.is-cue', { timeout: 40_000 })
  await touch(cdp, [(await center(page, '.en-opt[aria-label="S"]'))!])
  await page.waitForSelector('.en-options.is-little .en-opt.is-cue', { timeout: 40_000 })
  const rows: string[] = []
  for (let i = 0; i < 3; i++) {
    const big = await center(page, '.en-opt[aria-label="S"]')
    if (!big) break
    const n = (await voices(page)).length
    await touch(cdp, [big])
    await page.waitForTimeout(1500)
    const s = await page.evaluate(() => ({
      hand: !!document.querySelector('.en-opt-hand, .en-quiz .demo-hand, .en-quiz [data-demo-hand]'),
      hint: !!document.querySelector('.en-opt.is-hint'),
      done: document.querySelector('.en-steps .is-quiz')?.getAttribute('data-done') ?? (document.querySelector('.en-lesson')?.getAttribute('data-phase') ?? '?'),
    }))
    rows.push(`第 ${i + 1} 下：手 ${s.hand}、答案外框 ${s.hint}、聽到 ${(await voices(page)).slice(n).join('、') || '（沒有）'}、進度 ${s.done}`)
    await page.waitForTimeout(1200)
  }
  console.log('一直點大 S：\n' + rows.map((x) => '  ' + x).join('\n'))
  result.wrongTaps = rows
})

test('三堂課最後一題答對 → 慶祝、下課畫面', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  await boot(page, 143, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  const out: Record<string, unknown> = {}

  // 英文：第一天第 2 題（最後一題）
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: await today(page), done: false, good: false, stage: 'quiz', round: 1, answers: [{ kind: 'big', first: true, heard: true }] } })
  await put(page, 'kv', { key: 'lesson-format-solo', value: { 'en-big': 5, 'en-little': 5, 'en-word': 5 } })
  await door(page, cdp, 'english')
  await page.waitForSelector('.en-opt.is-cue', { timeout: 40_000 })
  const kind = await page.evaluate(() => (document.querySelector('.en-options.is-little') ? 's' : 'S'))
  const t0 = await page.evaluate(() => performance.now())
  await touch(cdp, [(await center(page, `.en-opt[aria-label="${kind}"]`))!])
  const [endEn, byeEn] = await Promise.all([until(page, '.en-lesson[data-phase="end"]'), until(page, '.cheer-scrim')])
  out.english = { celebrate: endEn && Math.round(endEn - t0), bye: byeEn && Math.round(byeEn - t0) }

  // 數學：小複習（數字 4）一題一題答，量最後一題
  await put(page, 'kv', { key: 'lesson:math', value: { next: 4, firm: false, day: await today(page), n: 4, mode: 'new', max: 4, part: 4, asked: 0, missed: 0 } })
  await put(page, 'kv', { key: 'lesson-format-solo', value: { 'ma-find': 5, 'ma-howmany': 5, 'en-big': 5, 'en-little': 5, 'en-word': 5 } })
  await door(page, cdp, 'math')
  let tLast = 0
  for (let i = 0; i < 12; i++) {
    const ok = await page.waitForSelector('.ma-quiz .ma-tile.cue, .ma-quiz .ma-tile.hint, .cheer-scrim', { timeout: 40_000 }).catch(() => null)
    if (!ok || (await page.$('.cheer-scrim'))) break
    const hint = await center(page, '.ma-quiz .ma-tile.hint')
    const any = hint ?? (await center(page, '.ma-quiz .ma-tile.cue'))
    if (!any) {
      await page.waitForTimeout(300)
      continue
    }
    tLast = await page.evaluate(() => performance.now())
    await touch(cdp, [any])
    await page.waitForTimeout(400)
    if (!(await page.$('.ma-quiz .ma-tile.correct'))) await page.waitForSelector('.ma-quiz .ma-tile.hint', { timeout: 40_000 }).catch(() => null)
    else await page.waitForFunction(() => !document.querySelector('.ma-quiz .ma-tile.correct') || document.querySelector('.cheer-scrim'), null, { timeout: 20_000 }).catch(() => null)
  }
  const byeMa = await until(page, '.cheer-scrim', 20_000)
  out.math = { bye: byeMa && Math.round(byeMa - tLast) }

  // 中文：大人念完、去選圖，量最後一題
  await door(page, cdp, 'chinese')
  await startReading(page, cdp)
  for (let i = 0; i < 30 && !(await page.$('.zh-quiz')); i++) {
    const go = await center(page, '.zh-controls.on .zh-go-quiz')
    const nx = await center(page, '.zh-next')
    if (go) await touch(cdp, [go])
    else if (nx) await touch(cdp, [nx])
    await page.waitForTimeout(1100)
  }
  let tZh = 0
  for (let i = 0; i < 10; i++) {
    const s = await page.waitForSelector('.zh-quiz .tile.cue, .cheer-scrim', { timeout: 30_000 }).catch(() => null)
    if (!s || (await page.$('.cheer-scrim'))) break
    tZh = await page.evaluate(() => performance.now())
    await touch(cdp, [(await center(page, '.zh-quiz .tile[data-answer]'))!])
    await page.waitForFunction(() => !document.querySelector('.zh-quiz .tile.cue'), null, { timeout: 10_000 }).catch(() => null)
    await page.waitForTimeout(300)
  }
  const byeZh = await until(page, '.cheer-scrim', 20_000)
  out.chinese = { bye: byeZh && Math.round(byeZh - tZh) }
  console.log('最後一題答對 → （ms）', JSON.stringify(out))
  result.endDelay = out
})
