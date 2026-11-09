// T-114 定點檢查（只給這次開發用，不在三歲測試的清單裡）：
//   rm -rf test-results/t114/dist && node node_modules/vite/bin/vite.js build --outDir test-results/t114/dist && TODDLER_PORT=4677 npx playwright test -c tests/toddler/t114.config.ts
//   改前：T114_DIST=test-results/t114/dist-main T114_LABEL=main
// 1. 中文選圖最後一題點錯：不能出現打勾、不能下課（回歸測試：盲測 940c8cd 中文 seed 2、3「點了烏龜卻出現兔子的打勾」）
// 2. 數學「給波波 1 個」多拿一個：多的自己退回去、不念 Two／There are two、勾勾跳一下；交出去不算一次就對
// 3. 數學：點在勾勾旁邊一點點算按到；點在別的空白，勾勾跳一下
// 4. 中文故事頁：亮的那一行的圖發亮、念過的淡下去；點空白處算點了亮的圖；8 秒沒點自己跳一下；陪玩小字
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

const LABEL = process.env.T114_LABEL ?? 'run'
const OUT = `test-results/t114/${LABEL}.json`
const result: Record<string, unknown> = {}
test.afterAll(() => {
  fs.mkdirSync('test-results/t114', { recursive: true })
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
  fs.writeFileSync(OUT, JSON.stringify({ ...prev, ...result }, null, 1))
})
/** 改前的打包只量、不判（第 2～4 點是新功能，改前本來就沒有） */
const before = LABEL === 'main'
const want = (ok: boolean, msg: string) => {
  if (!before) expect(ok, msg).toBe(true)
}

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
const all = (page: Page, store: string) =>
  page.evaluate(
    (store) =>
      new Promise<Record<string, unknown>[]>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction(store).objectStore(store).getAll()
          g.onsuccess = () => (rq.result.close(), res(g.result))
          g.onerror = () => rej(g.error)
        }
      }),
    store,
  )
const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].pop()
    const r = e?.getBoundingClientRect()
    return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null
  }, sel)
async function touch(cdp: CDPSession, pts: { x: number; y: number }[], holdMs = 90) {
  const tp = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) })
  for (const p of pts.slice(1)) {
    await new Promise((r) => setTimeout(r, 16))
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
async function startReading(page: Page, cdp: CDPSession) {
  await page.waitForSelector('.zh-read, .zh-intro', { timeout: 20_000 })
  for (let i = 0; i < 15 && !(await page.$('.zh-read')); i++) {
    const go = await center(page, '.zh-intro .zh-go')
    if (go) await touch(cdp, [go])
    await page.waitForTimeout(800)
  }
}

test('中文選圖最後一題點錯：不打勾、不下課', async ({ page }) => {
  test.setTimeout(4 * 60_000)
  await boot(page, 151, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await door(page, cdp, 'chinese')
  await startReading(page, cdp)
  for (let i = 0; i < 30 && !(await page.$('.zh-quiz')); i++) {
    const go = await center(page, '.zh-controls.on .zh-go-quiz')
    const nx = await center(page, '.zh-next')
    if (go) await touch(cdp, [go])
    else if (nx) await touch(cdp, [nx])
    await page.waitForTimeout(1100)
  }
  // 前面的題目答對（上面的進度寫「最後一題」才停），最後一題點錯的那張
  const rows: string[] = []
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('.zh-quiz .tile.cue', { timeout: 30_000 })
    if (/最後一題/.test((await page.getAttribute('.progress', 'aria-label')) ?? '')) break
    const w = await page.evaluate(() => document.querySelector('.zh-ask-word')?.textContent)
    await touch(cdp, [(await center(page, '.zh-quiz .tile[data-answer]'))!])
    rows.push(`第 ${i + 1} 題「${w}」點對`)
    await page.waitForFunction((w) => document.querySelector('.zh-ask-word')?.textContent !== w && document.querySelector('.zh-quiz .tile.cue'), w, { timeout: 8000 })
  }
  await page.waitForSelector('.zh-quiz .tile.cue', { timeout: 30_000 })
  const word = await page.evaluate(() => document.querySelector('.zh-ask-word')?.textContent)
  const wrong = (await center(page, '.zh-quiz .tile:not([data-answer])'))!
  await touch(cdp, [wrong])
  await page.waitForTimeout(250)
  await touch(cdp, [wrong])
  await page.waitForTimeout(3000)
  const s = await page.evaluate(() => ({
    yes: document.querySelectorAll('.zh-yes').length,
    correct: document.querySelectorAll('.zh-quiz .tile.correct').length,
    end: !!document.querySelector('.cheer-scrim'),
    quiz: !!document.querySelector('.zh-quiz'),
  }))
  rows.push(`最後一題「${word}」點錯兩下，3 秒後：打勾 ${s.yes}、亮綠框 ${s.correct}、下課 ${s.end ? '有' : '沒有'}、還在選圖 ${s.quiz ? '是' : '否'}`)
  expect(s.yes, '點錯不能出現打勾').toBe(0)
  expect(s.correct, '點錯不能亮綠框').toBe(0)
  expect(s.end, '點錯不能下課').toBe(false)
  // 點對才下課
  await touch(cdp, [(await center(page, '.zh-quiz .tile[data-answer]'))!])
  const end = await page.waitForSelector('.cheer-scrim', { timeout: 8000 }).then(() => true).catch(() => false)
  rows.push(`再點對 → 下課 ${end ? '有' : '沒有'}`)
  expect(end, '最後一題點對要下課').toBe(true)
  const att = (await all(page, 'attempts')).filter((a) => a.game === 'zh-lesson' && a.phase !== 'teach').pop()
  rows.push(`紀錄：${att ? `answer=${att.answer} firstTryCorrect=${att.firstTryCorrect} taps=${JSON.stringify(att.taps)}` : '沒有'}`)
  if (att) expect(att.firstTryCorrect, '點錯過不能記成一次就對').toBe(false)
  console.log('中文最後一題點錯：\n' + rows.map((x) => '  ' + x).join('\n'))
  result.zhWrongLast = rows
})

/** 數學：直接進「給波波」（數字 1，不示範） */
async function giveOne(page: Page, cdp: CDPSession, seed: number) {
  await boot(page, seed, { to: 'home' })
  await put(page, 'kv', { key: 'lesson:math', value: { next: 2, firm: false, day: await today(page), n: 1, mode: 'new', max: 1, part: 1, asked: 0, missed: 0 } })
  await put(page, 'skills', { key: 'give:1', box: 1, seen: 1, firstTry: 1, streak: 1, lastTs: 1 })
  await put(page, 'kv', { key: 'lesson-format-solo', value: { 'ma-give': 5 } })
  await door(page, cdp, 'math')
  await page.waitForSelector('.ma-give', { timeout: 30_000 })
  // 等波波說完「Give me one!」、輪到他（勾勾是灰的、東西都出來了）
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.ma-give-thing')].every((e) => getComputedStyle(e).opacity === '1'), null, { timeout: 20_000 })
  await page.waitForTimeout(2500)
}
const plateCount = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.ma-give-thing')].filter((e) => e.getAttribute('aria-label')?.startsWith('拿回')).length)

test('數學給波波 1 個：多拿的自己退回去、勾勾跳一下', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  const cdp = await page.context().newCDPSession(page)
  await giveOne(page, cdp, 152)
  const rows: string[] = []
  const v0 = (await voices(page)).length
  await touch(cdp, [(await center(page, '.ma-give-thing[aria-label="拿第 1 個給波波"]'))!])
  await page.waitForTimeout(1200)
  rows.push(`拿 1 個：盤子裡 ${await plateCount(page)} 個`)
  await touch(cdp, [(await center(page, '.ma-give-thing[aria-label="拿第 2 個給波波"]'))!])
  await page.waitForTimeout(500)
  const mid = await page.evaluate(() => ({ extra: document.querySelectorAll('.ma-give-thing.is-extra').length }))
  const midPlate = await plateCount(page)
  await page.screenshot({ path: `test-results/t114/shots/${LABEL}-give-over.png` })
  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => ({ poke: document.querySelector('.ma-give-done')?.className ?? '' }))
  const afterPlate = await plateCount(page)
  const said = (await voices(page)).slice(v0)
  rows.push(`再拿第 2 個：0.5 秒時盤子 ${midPlate} 個、在搖的 ${mid.extra} 個；2 秒後盤子 ${afterPlate} 個、勾勾「${after.poke}」`)
  rows.push(`這段聽到：${said.join(' / ') || '（沒有）'}`)
  want(mid.extra === 1, '多拿的那一個要搖一搖')
  want(afterPlate === 1, '多的要自己退回去，盤子剩 1 個')
  want(/\bpoke\b/.test(after.poke), '勾勾要跳一下')
  want(!said.some((s) => /two/i.test(s)), '不要念 Two／There are two')
  // 交出去
  await touch(cdp, [(await center(page, '.ma-give-done'))!])
  await page.waitForTimeout(3500)
  const att = (await all(page, 'attempts')).filter((a) => a.game === 'm-give').pop()
  rows.push(`交出去：${(await voices(page)).slice(v0 + said.length).join(' / ')}；紀錄 firstTryCorrect=${att?.firstTryCorrect} metrics=${JSON.stringify(att?.metrics)}`)
  want(att?.firstTryCorrect === false, '多拿過不算一次就對')
  console.log('給波波 1 個、多拿：\n' + rows.map((x) => '  ' + x).join('\n'))
  result.giveOver = rows
})

test('數學給波波：點在勾勾旁邊算按到，點別的空白勾勾跳一下', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  const cdp = await page.context().newCDPSession(page)
  await giveOne(page, cdp, 153)
  const rows: string[] = []
  await touch(cdp, [(await center(page, '.ma-give-thing[aria-label="拿第 1 個給波波"]'))!])
  await page.waitForTimeout(1200)
  // 點在離勾勾很遠的空白（畫面中下）
  const d = (await center(page, '.ma-give-done'))!
  const box = (await center(page, '.ma-give'))!
  await touch(cdp, [{ x: box.x - box.w * 0.25, y: d.y + d.h * 0.3 }])
  await page.waitForTimeout(300)
  const far = await page.evaluate(() => document.querySelector('.ma-give-done')?.className ?? '')
  rows.push(`點遠處空白：勾勾「${far}」`)
  want(/\bpoke\b/.test(far), '點空白時勾勾要跳一下')
  // 點在勾勾正下方、邊緣外 20 px（三歲手指偏開）
  const v0 = (await voices(page)).length
  await touch(cdp, [{ x: d.x, y: d.y + d.h / 2 + 20 }])
  await page.waitForTimeout(2500)
  const s = await page.evaluate(() => ({ done: !!document.querySelector('.ma-give-done.is-done') }))
  rows.push(`點勾勾外 20 px：交出去 ${s.done ? '有' : '沒有'}；聽到 ${(await voices(page)).slice(v0).join(' / ') || '（沒有）'}`)
  want(s.done, '點在勾勾旁邊要算按到')
  console.log('點偏勾勾：\n' + rows.map((x) => '  ' + x).join('\n'))
  result.giveNear = rows
})

test('中文故事頁：亮的那一行的圖發亮、點空白算點圖、8 秒沒點自己跳', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 154, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await door(page, cdp, 'chinese')
  await startReading(page, cdp)
  await page.waitForSelector('.zh-line.on .zh-pic', { timeout: 20_000 })
  const rows: string[] = []
  const hint = await page.evaluate(() => document.querySelector('.shell-hint, [class*="hint"]')?.textContent ?? '')
  rows.push(`陪玩小字：${hint}`)
  want(/念到這行時.*點亮起來的圖/.test(hint), '陪玩小字要寫「念到這行時請他點亮起來的圖」')
  // 下一行兩次，看亮的和念過的
  for (let i = 0; i < 2; i++) {
    await touch(cdp, [(await center(page, '.zh-next'))!])
    await page.waitForTimeout(1300)
  }
  await page.waitForTimeout(600)
  const look = await page.evaluate(() => {
    const on = document.querySelector<HTMLElement>('.zh-line.on .zh-pic')!
    const past = document.querySelector<HTMLElement>('.zh-line.seen:not(.on) .zh-pic')!
    return { glow: getComputedStyle(on).boxShadow, pastOpacity: getComputedStyle(past).opacity }
  })
  await page.screenshot({ path: `test-results/t114/shots/${LABEL}-zh-read.png` })
  rows.push(`亮的那一行的圖：box-shadow「${look.glow.slice(0, 90)}」；念過的行的圖 opacity ${look.pastOpacity}`)
  want(/255, 214, 120/.test(look.glow), '亮的那一行的圖要發亮')
  want(Number(look.pastOpacity) < 0.7, '念過的行的圖要淡一點')
  // 8 秒沒點：自己跳一下
  await page.waitForTimeout(8600)
  const again = await page.evaluate(() => document.querySelector('.zh-line.on .zh-pic [data-cue-again]')?.getAttribute('data-cue-again') ?? null)
  rows.push(`8.6 秒沒點：自己跳一下 ${again ? `有（第 ${again} 次）` : '沒有'}`)
  want(!!again, '8 秒沒點，圖要自己跳一下')
  // 點空白（課本標題旁、還沒念的行）：亮的那一行的圖有反應
  const blanks = await page.evaluate(() => {
    const t = document.querySelector('.zh-title')!.getBoundingClientRect()
    const later = document.querySelector('.zh-line.later')?.getBoundingClientRect()
    const page = document.querySelector('.zh-page')!.getBoundingClientRect()
    return [
      { name: '課本標題右邊', x: Math.min(t.right + 60, page.right - 20), y: t.top + t.height / 2 },
      ...(later ? [{ name: '還沒念的行', x: later.left + later.width * 0.3, y: later.top + later.height / 2 }] : []),
      { name: '課本左下角', x: page.left + 24, y: page.bottom - 24 },
    ]
  })
  for (const b of blanks) {
    const before = await page.evaluate(() => {
      const p = document.querySelector('.zh-line.on .zh-pic')!
      return `${p.querySelector('.zh-pic-in')?.className}|${p.querySelectorAll('.zh-bit, .sparkle, [class*="spark"]').length}`
    })
    await touch(cdp, [b])
    await page.waitForTimeout(250)
    const after = await page.evaluate(() => {
      const p = document.querySelector('.zh-line.on .zh-pic')!
      return { cls: p.querySelector('.zh-pic-in')?.className, bits: p.querySelectorAll('.zh-bit, .sparkle, [class*="spark"]').length, act: p.querySelector('[data-act]')?.getAttribute('data-act') ?? null }
    })
    const moved = `${after.cls}|${after.bits}` !== before || !!after.act
    rows.push(`點${b.name}：亮的圖 ${moved ? `有反應（${after.act ?? (after.bits ? '撒星星' : after.cls)}）` : '沒反應'}`)
    want(moved, `點${b.name}，亮的那一行的圖要有反應`)
    await page.waitForTimeout(700)
  }
  console.log('中文故事頁：\n' + rows.map((x) => '  ' + x).join('\n'))
  result.zhRead = rows
})
