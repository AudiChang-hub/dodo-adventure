// T-112 第 3 點「點了沒反應」的量測（只給這次開發用，不在三歲測試的清單裡）：
//   npx vite build --outDir test-results/t112/dist2 && TODDLER_PORT=4677 npx playwright test -c tests/toddler/t112.config.ts -g 點擊
// 用觸控（CDP touch）在各種時機按下去，量「手指按下 → 按的地方附近畫面有變化」要多久、有沒有聲音、有沒有算作答。
// 「看得見」只算按的地方附近（80 px 內）的 class／元素增減，不算遠處的字幕、恐龍（以前的探針只要畫面任何地方有變就算有反應）。
import { test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

const OUT = 'test-results/t112/tap-measure.json'

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
          const db = rq.result
          const tx = db.transaction(store, 'readwrite')
          tx.objectStore(store).put(row)
          tx.oncomplete = () => (db.close(), res())
          tx.onerror = () => rej(tx.error)
        }
      }),
    { store, row },
  )

/** 量測器：每一下按下去記時間、位置；附近第一個看得見的變化、第一個聲音 */
const METER = () => {
  type Tap = { t: number; x: number; y: number; vis: number | null; what: string | null; snd: number | null }
  const w = window as unknown as { __taps: Tap[] }
  w.__taps = []
  let cur: Tap | null = null
  addEventListener(
    'pointerdown',
    (e) => {
      cur = { t: performance.now(), x: e.clientX, y: e.clientY, vis: null, what: null, snd: null }
      w.__taps.push(cur)
    },
    true,
  )
  const near = (el: Element) => {
    if (!cur || el.closest('.sub-pill')) return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.width * r.height > innerWidth * innerHeight * 0.5) return false
    const dx = Math.max(r.left - cur.x, 0, cur.x - r.right)
    const dy = Math.max(r.top - cur.y, 0, cur.y - r.bottom)
    return Math.hypot(dx, dy) <= 80
  }
  new MutationObserver((list) => {
    const c = cur
    if (!c || c.vis != null) return
    const t = performance.now() - c.t
    if (t > 2000) return
    for (const m of list) {
      const els = m.type === 'childList' ? [...m.addedNodes].filter((n): n is Element => n instanceof Element) : m.target instanceof Element ? [m.target] : []
      const hit = els.find(near)
      if (hit) {
        c.vis = Math.round(t)
        c.what = `${m.type === 'childList' ? '新增' : '改'} ${hit.tagName.toLowerCase()}.${(hit.getAttribute('class') ?? '').split(' ').slice(0, 3).join('.')}`
        return
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-pressed', 'data-state'] })
  const mark = () => {
    if (cur && cur.snd == null && performance.now() - cur.t < 2000) cur.snd = Math.round(performance.now() - cur.t)
  }
  const s1 = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...a: Parameters<typeof s1>) {
    mark()
    return s1.apply(this, a)
  }
  const s2 = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (...a: Parameters<typeof s2>) {
    mark()
    return s2.apply(this, a)
  }
}

async function touch(cdp: CDPSession, x: number, y: number, holdMs = 120, slide = 0) {
  const pt = (px: number, py: number) => [{ x: Math.round(px), y: Math.round(py), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) })
  const steps = slide ? 4 : 0
  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, holdMs / (steps + 1)))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (slide * i) / steps, y + (slide * i) / steps / 2) })
  }
  await new Promise((r) => setTimeout(r, steps ? holdMs / (steps + 1) : holdMs))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const rect = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].pop()
    const r = e?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom } : null
  }, sel)

type Row = { case: string; vis: number | null; what: string | null; snd: number | null; took: string }
const rows: Row[] = []
async function measure(page: Page, cdp: CDPSession, name: string, x: number, y: number, opt: { hold?: number; slide?: number; took?: () => Promise<string> } = {}) {
  const n = await page.evaluate(() => (window as unknown as { __taps: unknown[] }).__taps.length)
  await touch(cdp, x, y, opt.hold ?? 120, opt.slide ?? 0)
  await page.waitForTimeout(900)
  if (process.env.T112_DEBUG) console.log(await page.evaluate(() => JSON.stringify((window as unknown as { __taps: unknown[] }).__taps)))
  const tap = await page.evaluate((n) => (window as unknown as { __taps: { vis: number | null; what: string | null; snd: number | null }[] }).__taps[n], n)
  const row = { case: name, vis: tap?.vis ?? null, what: tap?.what ?? null, snd: tap?.snd ?? null, took: opt.took ? await opt.took() : '' }
  rows.push(row)
  console.log(`${name}｜看得見 ${row.vis == null ? '無' : row.vis + ' ms'}（${row.what ?? '—'}）｜聲音 ${row.snd == null ? '無' : row.snd + ' ms'}｜${row.took}`)
}

test.afterAll(() => {
  fs.mkdirSync('test-results/t112', { recursive: true })
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
  fs.writeFileSync(OUT, JSON.stringify({ ...prev, [process.env.T112_LABEL ?? 'run']: rows }, null, 1))
})

test('點擊：英文選擇題各種時機按下去的反應', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await page.addInitScript(METER)
  await boot(page, 120, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: await today(page), done: false, good: false, stage: 'quiz', round: 0, answers: [] } })
  await put(page, 'kv', { key: 'lesson-format-solo', value: { 'en-big': 5, 'en-little': 5, 'en-word': 5 } })
  await page.reload()
  await page.waitForSelector('.scene')
  const door = (await rect(page, '.door[data-door="english"], .side-door[data-door="english"]'))!
  await touch(cdp, door.x, door.y)
  await page.waitForSelector('.en-quiz .en-opt', { timeout: 20_000 })
  const answered = () => page.evaluate(() => (document.querySelector('.en-steps .is-quiz')?.getAttribute('data-done') ?? '?') + ' 題答完')
  const state = () => page.evaluate(() => [...document.querySelectorAll('.en-opt')].map((e) => `${e.getAttribute('aria-label')}:${e.className.replace(/en-opt|turn-hop|is-upper|is-lower|is-cue/g, '').trim() || '—'}`).join(' '))
  // 1. 題目剛出來（0.5 秒內）就點答案的位置
  const ans = (await rect(page, '.en-opt[aria-label="S"]'))!
  await measure(page, cdp, 'E1 題目剛出來 0.5 秒內點', ans.x, ans.y, { took: answered })
  // 2. 輪到他：點在答案外面一點點（15 px）
  await page.waitForSelector('.en-opt.is-cue', { timeout: 20_000 })
  await measure(page, cdp, 'E2 點在選項外 15 px', ans.x, ans.b + 15, { took: answered })
  // 3. 輪到他：手指按著滑一下（14 px）點錯的那張
  const wrong = (await rect(page, '.en-opt[aria-label="s"]'))!
  await measure(page, cdp, 'E3 按著滑 14 px（點錯的那張）', wrong.x, wrong.y, { slide: 14, hold: 200, took: state })
  await page.waitForTimeout(2500)
  // 4. 正常點答案
  const ans2 = (await rect(page, '.en-opt[aria-label="S"]'))!
  await measure(page, cdp, 'E4 正常點（按 120 ms）', ans2.x, ans2.y, { took: answered })
  // 5. 答對、稱讚中又點
  await measure(page, cdp, 'E5 答對之後稱讚中再點', ans2.x, ans2.y, { took: answered })
  // 6. 第 2 題：按久一點（0.6 秒）
  // 前面幾下可能已經把 2 題都答完（修正後點在旁邊、滑一下也算），還有第 2 題才量
  const q2 = await page
    .waitForFunction(() => document.querySelector('.en-steps .is-quiz')?.getAttribute('data-done') === '1' && document.querySelector('.en-opt.is-cue'), null, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  if (!q2) return void console.log(JSON.stringify(rows))
  const kind = await page.evaluate(() => (document.querySelector('.en-options.is-little') ? 's' : 'S'))
  const little = (await rect(page, `.en-opt[aria-label="${kind}"]`))!
  await measure(page, cdp, 'E6 按久一點（0.6 秒）', little.x, little.y, { hold: 600, took: answered })
  console.log(JSON.stringify(rows))
})

test('點擊：數學比多少各種時機按下去的反應', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await page.addInitScript(METER)
  await boot(page, 121, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await put(page, 'kv', { key: 'lesson:math', value: { next: 4, firm: false, day: await today(page), n: 4, mode: 'new', max: 4, part: 2, asked: 0, missed: 0 } })
  await put(page, 'skills', { key: 'compare:more', box: 1, seen: 1, firstTry: 1, streak: 1, lastTs: 1 })
  await page.reload()
  await page.waitForSelector('.scene')
  const door = (await rect(page, '.door[data-door="math"], .side-door[data-door="math"]'))!
  await touch(cdp, door.x, door.y)
  await page.waitForSelector('.ma-quiz .ma-tile.cue', { timeout: 30_000 })
  const tiles = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.ma-quiz .ma-tile')].map((e) => {
        const r = e.getBoundingClientRect()
        return { n: e.querySelectorAll('svg, img').length, x: r.left + r.width / 2, y: r.top + r.height / 2, b: r.bottom, cls: e.className }
      }),
    )
  const done = () => page.evaluate(() => (document.querySelector('.ma-quiz .ma-tile.correct') ? '答對了' : '還沒答'))
  let ts = await tiles()
  let more = ts.sort((a, b) => b.n - a.n)[0]
  await measure(page, cdp, 'M2 點在選項外 15 px', more.x, more.b + 15, { took: done })
  await measure(page, cdp, 'M3 按著滑 14 px（多的那邊）', more.x, more.y, { slide: 14, hold: 200, took: done })
  if ((await done()) === '還沒答') await measure(page, cdp, 'M4 正常點（按 120 ms）', more.x, more.y, { took: done })
  await measure(page, cdp, 'M5 答對之後稱讚中再點', more.x, more.y, { took: done })
  // 下一題剛出來（選項還點不到）就點
  await page.waitForFunction(() => !document.querySelector('.ma-quiz .ma-tile.correct'), null, { timeout: 20_000 })
  ts = await tiles()
  more = ts.sort((a, b) => b.n - a.n)[0]
  await measure(page, cdp, 'M1 下一題剛出來就點', more.x, more.y, { took: done })
  console.log(JSON.stringify(rows))
})
