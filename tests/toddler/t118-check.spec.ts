// T-118 定點檢查（只給這次開發用，不在三歲測試的清單裡）：課程不自己換頁、不自己結束
//   rm -rf test-results/t118/dist && node node_modules/vite/bin/vite.js build --outDir test-results/t118/dist && TODDLER_PORT=4679 npx playwright test -c tests/toddler/t118.config.ts -g 定點
//   改前：T118_DIST=test-results/t118/dist-main T118_LABEL=main（改前沒有大箭頭，只量一堂多長）
// 「理想的孩子」：念完、輪到他就照著描、點對的答案；大箭頭出來 1 秒後點它。
// 每一次大箭頭出來，先停 HOLD 秒不點：畫面不能自己換（段落、題目都一樣），返回鍵要點得到；點一下別的地方，也不能往下走。
// 一堂多長＝進課到下課畫面出來，扣掉這些故意停的時間。下課畫面：25 秒不碰不能自己離開；點恐龍說晚安、睡著、點房子才回首頁。
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

const LABEL = process.env.T118_LABEL ?? 'run'
const before = LABEL === 'main'
const HOLD = 6000
const SHOTS = `test-results/t118/shots-${LABEL}`
const result: Record<string, unknown> = {}
test.afterAll(() => {
  fs.mkdirSync('test-results/t118', { recursive: true })
  const f = `test-results/t118/check-${LABEL}.json`
  const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}
  fs.writeFileSync(f, JSON.stringify({ ...prev, ...result }, null, 1))
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
async function touch(cdp: CDPSession, pts: { x: number; y: number }[], stepMs = 16) {
  const tp = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) })
  for (const p of pts.slice(1)) {
    await new Promise((r) => setTimeout(r, stepMs))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) })
  }
  await new Promise((r) => setTimeout(r, 90))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].pop()
    const r = e?.getBoundingClientRect()
    return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, sel)
async function door(page: Page, cdp: CDPSession, name: string) {
  await page.reload()
  await page.waitForSelector('.scene')
  await touch(cdp, [(await center(page, `.door[data-door="${name}"], .side-door[data-door="${name}"]`))!])
}
/** 現在在哪一段（英文 data-phase、數學 data-lesson-part、中文第幾題） */
const where = (page: Page) =>
  page.evaluate(() => {
    if (document.querySelector('.bedtime')) return 'bedtime'
    if (document.querySelector('.cheer-scrim')) return 'end'
    const en = document.querySelector('.en-lesson')?.getAttribute('data-phase')
    if (en) return `en:${en}`
    const sc = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
    const ma = [...(sc?.querySelectorAll('[data-lesson-part]') ?? [])].pop()?.getAttribute('data-lesson-part')
    if (ma) return `ma:${ma}`
    if (sc?.querySelector('.zh-glyph')) return 'zh:glyph'
    if (sc?.querySelector('.zh-quiz')) return `zh:q:${sc.querySelector('.zh-ask-word')?.textContent ?? ''}`
    if (sc?.querySelector('.zh-read')) return 'zh:read'
    if (sc?.querySelector('.door')) return 'home'
    return 'other'
  })
/** 返回鍵在不在、有沒有被蓋住（點它那一點最上面的是不是它） */
const backOk = (page: Page) =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLElement>('.back-btn, [data-back]')].filter((e) => e.getBoundingClientRect().width > 2).pop()
    if (!b) return false
    const r = b.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!top && (b === top || b.contains(top))
  })

type Gate = { at: string; still: boolean; same: boolean; back: boolean; blank: boolean }
/** 大箭頭出來了：停 HOLD 不點，看畫面有沒有自己換；點別的地方一下；再點大箭頭 */
async function atGate(page: Page, cdp: CDPSession, gates: Gate[]) {
  const at = await where(page)
  // 截圖等大箭頭跳出來的動畫做完
  await page.waitForTimeout(1200)
  if (gates.length === 0) await page.screenshot({ path: `${SHOTS}/gate-${at.replace(/[:]/g, '-')}.png` })
  await page.waitForTimeout(HOLD - 1200)
  const still = !!(await page.$('.next-step'))
  const same = (await where(page)) === at
  const back = await backOk(page)
  // 點別的地方（畫面上方中間）：不能往下走
  await touch(cdp, [{ x: 640, y: 150 }])
  await page.waitForTimeout(700)
  const blank = !!(await page.$('.next-step')) && (await where(page)) === at
  gates.push({ at, still, same, back, blank })
  const nx = await center(page, '.next-step')
  if (nx) await touch(cdp, [nx])
  await page.waitForTimeout(300)
}

/** 下課畫面：25 秒不碰不能自己離開；點恐龍說晚安 → 睡著 → 點房子（或月亮） */
async function goodnight(page: Page, cdp: CDPSession) {
  const out: Record<string, unknown> = {}
  if (before) return out
  // 挑貼紙（有的話）：點一張、再點一下收下，看完點大箭頭
  if (await page.$('.cheer-scrim .picker')) {
    await page.waitForSelector('.pk-opt', { timeout: 20_000 })
    await page.waitForTimeout(1500)
    const s = (await center(page, '.pk-opt'))!
    await touch(cdp, [s])
    await page.waitForTimeout(800)
    await touch(cdp, [s])
    await page.waitForSelector('.next-step', { timeout: 20_000 })
    await page.waitForTimeout(HOLD)
    out.貼紙本停著 = !!(await page.$('.cheer-scrim .picker')) && !!(await page.$('.next-step'))
    await touch(cdp, [(await center(page, '.next-step'))!])
  }
  await page.waitForSelector('.lesson-bye', { timeout: 20_000 })
  await page.waitForTimeout(25_000)
  out.下課畫面25秒還在 = !!(await page.$('.lesson-bye'))
  out.道別前有房子 = !!(await page.$('.lb-home'))
  out.返回鍵點得到 = await backOk(page)
  await page.screenshot({ path: `${SHOTS}/bye-1-道別前.png` })
  await touch(cdp, [(await center(page, '.lb-host'))!])
  await page.waitForSelector('.lesson-bye[data-bye="asleep"]', { timeout: 10_000 })
  await page.waitForSelector('.lb-home', { timeout: 5000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/bye-2-睡著.png` })
  out.時間到是月亮 = !!(await page.$('.lb-home.is-bed'))
  await page.waitForTimeout(HOLD)
  out.睡著後還在 = !!(await page.$('.lesson-bye'))
  await touch(cdp, [(await center(page, '.lb-home'))!])
  await page.waitForTimeout(1500)
  out.點了之後在 = await where(page)
  return out
}

function summary(name: string, t0: number, tEnd: number, gates: Gate[], extra: Record<string, unknown>) {
  const held = gates.length * (HOLD + 700 + 300)
  const row = {
    大箭頭幾次: gates.length,
    一堂多長_秒: Math.round((tEnd - t0 - held) / 100) / 10,
    每一次大箭頭: gates.map((g) => `${g.at}${g.still && g.same ? '' : ' ✗自己走了'}${g.back ? '' : ' ✗返回鍵點不到'}${g.blank ? '' : ' ✗點別處就走了'}`),
    ...extra,
  }
  result[name] = row
  console.log(name, JSON.stringify(row, null, 1))
  if (!before) {
    for (const g of gates) {
      expect(g.still && g.same, `${g.at}：大箭頭出來 ${HOLD / 1000} 秒內畫面自己換了`).toBe(true)
      expect(g.back, `${g.at}：返回鍵點不到`).toBe(true)
      expect(g.blank, `${g.at}：點別的地方就往下走了`).toBe(true)
    }
  }
  return row
}

test('定點：英文一整堂（每日上限 1 分鐘：中間不被打斷，下課後點月亮才去睡覺）', async ({ page }) => {
  test.setTimeout(12 * 60_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  await boot(page, 141, { to: 'home', settings: { dailyMinutes: 1 }, autoNext: false })
  const cdp = await page.context().newCDPSession(page)
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: '2000-01-01', done: true, good: false } })
  await door(page, cdp, 'english')
  await page.waitForSelector('.en-lesson')
  const t0 = Date.now()
  const gates: Gate[] = []
  let bed = false
  while (Date.now() - t0 < 10 * 60_000) {
    if (await page.$('.next-step')) {
      await atGate(page, cdp, gates)
      continue
    }
    const s = await page.evaluate(() => {
      const stage = document.querySelector('.bedtime') ? 'bedtime' : (document.querySelector('.en-lesson')?.getAttribute('data-phase') ?? (document.querySelector('.cheer-scrim') ? 'end' : 'gone'))
      const t = document.querySelector('.en-trace')
      let pts: { x: number; y: number }[] | null = null
      if (t && t.getAttribute('data-accepting') !== 'false' && !t.hasAttribute('data-demo') && !t.querySelector('[data-trace-finished]')) {
        const board = [...document.querySelectorAll('.en-trace-board')].pop()
        const p = board?.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')
        if (p) {
          const m = p.getScreenCTM()!
          const len = p.getTotalLength()
          pts = Array.from({ length: 31 }, (_, i) => {
            const q = p.getPointAtLength((len * i) / 30)
            const v = new DOMPoint(q.x, q.y).matrixTransform(m)
            return { x: v.x, y: v.y }
          })
        }
      }
      let ans: { x: number; y: number } | null = null
      if (document.querySelector('.en-opt.is-cue')) {
        const kind = document.querySelector('.en-options.is-little') ? 'little' : 'big'
        const L = [...document.querySelectorAll('.en-ask-in b')].map((b) => b.textContent)[0] ?? 'S'
        const el = [...document.querySelectorAll<HTMLElement>('.en-opt')].find((e) => e.getAttribute('aria-label') === (kind === 'big' ? L : L!.toLowerCase()))
        const r = el?.getBoundingClientRect()
        if (r) ans = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }
      return { stage, pts, ans }
    })
    if (s.stage === 'bedtime') bed = true
    if (s.stage === 'end' || s.stage === 'gone' || s.stage === 'bedtime') break
    if (s.pts) await touch(cdp, s.pts, 18)
    else if (s.ans) await touch(cdp, [s.ans])
    await page.waitForTimeout(s.pts || s.ans ? 900 : 200)
  }
  const tEnd = Date.now()
  const end = await goodnight(page, cdp)
  summary('english', t0, tEnd, gates, { 上課中被換成睡覺畫面: bed, ...end })
  if (!before) {
    expect(bed, '上課中不能被換成睡覺畫面').toBe(false)
    expect(end.下課畫面25秒還在, '下課畫面不能自己離開').toBe(true)
    expect(end.時間到是月亮, '時間到的那一天是月亮').toBe(true)
    expect(end.點了之後在, '點月亮去睡覺畫面').toBe('bedtime')
  }
})

test('定點：數學一整堂', async ({ page }) => {
  test.setTimeout(14 * 60_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  await boot(page, 142, { to: 'home', autoNext: false })
  const cdp = await page.context().newCDPSession(page)
  await door(page, cdp, 'math')
  const t0 = Date.now()
  const gates: Gate[] = []
  while (Date.now() - t0 < 12 * 60_000) {
    if (await page.$('.next-step')) {
      await atGate(page, cdp, gates)
      continue
    }
    const s = await page.evaluate(() => {
      const sc = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
      const part = document.querySelector('.cheer-scrim') ? 'end' : ([...(sc?.querySelectorAll('[data-lesson-part]') ?? [])].pop()?.getAttribute('data-lesson-part') ?? 'open')
      const pt = (e: Element | null | undefined) => {
        const r = e?.getBoundingClientRect()
        return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
      }
      let tap: { x: number; y: number } | null = null
      let stroke: { x: number; y: number }[] | null = null
      // 教學卡念完、手在招手：點那一邊（點了才出題）
      const card = sc?.querySelector('.teach-card.ready')
      if (card) tap = pt(card.querySelector('.teach-item.turn-hop')) ?? pt(card)
      else if (part === 'count') tap = pt(sc?.querySelector('.ma-count .ma-thing:not(.on)'))
      if (!card && part === 'give') {
        const n = Number(/(\d+)/.exec(sc?.querySelector('.ma-give-want')?.getAttribute('aria-label') ?? '')?.[1] ?? 0)
        const on = sc?.querySelectorAll('.ma-give-thing[aria-label^="拿回"]').length ?? 0
        tap = on < n ? pt(sc?.querySelector('.ma-give-thing[aria-label^="拿第"]')) : pt(sc?.querySelector('.ma-give-done.on'))
      }
      if (!card && (part === 'compare' || part === 'review') && sc?.querySelector('.ma-tile.cue, .ma-tile.hint')) tap = pt(sc?.querySelector('.ma-tile[data-answer]'))
      if (!card && part === 'write') {
        const paper = [...(sc?.querySelectorAll('.ma-paper') ?? [])].pop()
        const acc = paper?.closest('[data-accepting]')?.getAttribute('data-accepting')
        const p = paper && [...paper.querySelectorAll('svg.ma-lane path[stroke-dasharray]')].find((x) => !/3 3/.test(x.getAttribute('stroke-dasharray') ?? ''))
        const svg = paper?.querySelector('svg.ma-lane') as SVGSVGElement | null
        if (p && svg && acc !== 'false' && !sc?.querySelector('[data-demo="1"]')) {
          const m = svg.getScreenCTM()!
          const path = p as SVGPathElement
          const len = path.getTotalLength()
          stroke = Array.from({ length: 31 }, (_, i) => {
            const q = path.getPointAtLength((len * i) / 30)
            return { x: m.a * q.x + m.e, y: m.d * q.y + m.f }
          })
        }
      }
      return { part, tap, stroke }
    })
    if (s.part === 'end') break
    if (s.stroke) await touch(cdp, s.stroke, 18)
    else if (s.tap) await touch(cdp, [s.tap])
    await page.waitForTimeout(s.stroke ? 900 : s.tap ? 650 : 200)
  }
  const tEnd = Date.now()
  const end = await goodnight(page, cdp)
  summary('math', t0, tEnd, gates, end)
  if (!before) {
    expect(end.下課畫面25秒還在, '下課畫面不能自己離開').toBe(true)
    expect(end.點了之後在, '點房子回首頁').toBe('home')
  }
})

test('定點：中文一整堂（有貼紙的那一堂）', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  await boot(page, 143, { to: 'home', lessonSticker: true, autoNext: false })
  const cdp = await page.context().newCDPSession(page)
  await door(page, cdp, 'chinese')
  const t0 = Date.now()
  const gates: Gate[] = []
  while (Date.now() - t0 < 8 * 60_000) {
    if (await page.$('.next-step')) {
      await atGate(page, cdp, gates)
      continue
    }
    const at = await where(page)
    if (at === 'end') break
    // 大人：說明卡「開始念」、下一行、去選圖
    const adult = (await center(page, '.zh-intro .zh-go')) ?? (await center(page, '.zh-controls.on .zh-go-quiz')) ?? (await center(page, '.zh-controls.on .zh-next'))
    const ans = (await page.$('.zh-quiz .tile.cue, .zh-quiz .tile.hint')) ? await center(page, '.zh-quiz .tile[data-answer]') : null
    if (ans) await touch(cdp, [ans])
    else if (adult && at !== 'zh:glyph' && !at.startsWith('zh:q')) await touch(cdp, [adult])
    await page.waitForTimeout(ans || adult ? 1100 : 250)
  }
  const tEnd = Date.now()
  const end = await goodnight(page, cdp)
  summary('chinese', t0, tEnd, gates, end)
  if (!before) {
    expect(end.貼紙本停著, '貼紙本要停著等大箭頭').toBe(true)
    expect(end.下課畫面25秒還在, '下課畫面不能自己離開').toBe(true)
    expect(end.點了之後在, '點房子回首頁').toBe('home')
  }
})
