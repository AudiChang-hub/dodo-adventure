// T-108 搶點的定點檢查（只給這次開發用，不在三歲測試的清單裡）：
//   TODDLER_PORT=4391 npx playwright test -c tests/toddler/t108.config.ts
import { expect, test, type Page } from '@playwright/test'
import { boot } from './lib/app'
import { Toddler, type Pt } from './lib/toddler'

const today = (page: Page) =>
  page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

const setMath = (page: Page, value: Record<string, unknown>) =>
  page.evaluate(
    (value) =>
      new Promise<void>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key: 'lesson:math', value })
          tx.oncomplete = () => {
            db.close()
            res()
          }
        }
      }),
    value,
  )

const center = (page: Page, sel: string, i = 0) =>
  page.evaluate(
    ({ sel, i }) => {
      const r = document.querySelectorAll(sel)[i]?.getBoundingClientRect()
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
    },
    { sel, i },
  )
const part = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') ?? null)
const demo = (page: Page) => page.evaluate(() => !!document.querySelector('[data-demo="1"]'))
const voicesSince = (page: Page, t: number) => page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t && v.text).map((v) => v.text), t)
const attempts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ game: string; phase: string; ok: boolean }[]>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          if (!db.objectStoreNames.contains('attempts')) return res([])
          const g = db.transaction('attempts').objectStore('attempts').getAll()
          g.onsuccess = () => res((g.result as { game: string; phase: string; firstTryCorrect: boolean }[]).map((a) => ({ game: a.game, phase: a.phase, ok: a.firstTryCorrect })))
        }
      }),
  )

async function enterMath(page: Page, k: Toddler) {
  const door = (await center(page, '.door[data-door="math"], .side-door[data-door="math"]'))!
  await k.tap(door, '數學門')
  await page.waitForSelector('[data-lesson-part]', { timeout: 10_000 })
}

test('數學：開場點一下直接開始；數數示範中點東西 → 示範收掉、那一下算 1', async ({ page }, info) => {
  test.setTimeout(3 * 60_000)
  const k = new Toddler(page, info, 108, info.project.name)
  await boot(page, 108, { to: 'home' })
  await k.init()
  await setMath(page, { next: 3, firm: false, day: await today(page), n: 3, mode: 'new', part: 0, asked: 0, missed: 0 })
  await enterMath(page, k)
  // 開場：0.8 秒後點大數字 → 1.5 秒內到數數
  await page.waitForTimeout(800)
  const hero = (await center(page, '.ma-hero'))!
  const t0 = Date.now()
  await k.tap(hero, '開場點大數字')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') === 'count', null, { timeout: 3000 })
  console.log(`開場點一下 → 數數：${Date.now() - t0} ms`)
  // 數數示範中：等手數到第一個，再點還沒數的那一個
  await page.waitForFunction(() => !!document.querySelector('[data-demo="1"]'), null, { timeout: 10_000 })
  await page.waitForFunction(() => document.querySelectorAll('.ma-count .ma-thing.on').length >= 1, null, { timeout: 10_000 })
  const n = await page.evaluate(() => document.querySelectorAll('.ma-count .ma-thing').length)
  const idx = await page.evaluate(() => [...document.querySelectorAll('.ma-count .ma-thing')].findIndex((e) => !e.classList.contains('on')))
  const target = (await center(page, '.ma-count .ma-thing', idx))!
  const t1 = await page.evaluate(() => performance.now())
  await k.tap(target, '示範中搶著點')
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({
    demo: !!document.querySelector('[data-demo="1"]'),
    on: [...document.querySelectorAll('.ma-count .ma-thing')].map((e) => (e.classList.contains('on') ? e.textContent : '')).filter(Boolean),
    hand: !!document.querySelector('.ma-count .demo-hand'),
  }))
  console.log('示範中點了之後：', JSON.stringify(after), '聽到：', (await voicesSince(page, t1)).join('、'))
  expect(after.demo).toBe(false)
  expect(after.on.length).toBe(1)
  // 再把剩下的點完：數完、往下走（不卡住）
  for (let i = 0; i < n; i++) {
    const j = await page.evaluate(() => [...document.querySelectorAll('.ma-count .ma-thing')].findIndex((e) => !e.classList.contains('on')))
    if (j < 0) break
    await k.tap((await center(page, '.ma-count .ma-thing', j))!, '數')
    await page.waitForTimeout(700)
  }
  console.log('數完聽到：', (await voicesSince(page, t1)).join('、'))
  await page.waitForFunction(() => [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') !== 'count' || document.querySelectorAll('.ma-count .ma-thing.on').length === 0, null, { timeout: 15_000 })
  console.log('之後：', await part(page))
})

test('數學：拿給波波示範中點東西 → 示範收掉、盤子只有他拿的；說明時點勾勾 → 手指著下一步', async ({ page }, info) => {
  test.setTimeout(3 * 60_000)
  const k = new Toddler(page, info, 109, info.project.name)
  await boot(page, 109, { to: 'home' })
  await k.init()
  await setMath(page, { next: 3, firm: false, day: await today(page), n: 3, mode: 'new', part: 1, asked: 0, missed: 0 })
  await enterMath(page, k)
  await page.waitForFunction(() => !!document.querySelector('.ma-give') && !!document.querySelector('[data-demo="1"]'), null, { timeout: 15_000 })
  // 手放進第一個以後再搶
  await page.waitForFunction(() => [...document.querySelectorAll('.ma-give-thing')].some((e) => e.getAttribute('aria-label')?.startsWith('拿回')), null, { timeout: 10_000 })
  const free = await page.evaluate(() => [...document.querySelectorAll('.ma-give-thing')].findIndex((e) => !e.getAttribute('aria-label')?.startsWith('拿回')))
  const t1 = await page.evaluate(() => performance.now())
  await k.tap((await center(page, '.ma-give-thing', free))!, '示範中搶著拿')
  await page.waitForTimeout(600)
  const s = await page.evaluate(() => ({
    demo: !!document.querySelector('[data-demo="1"]'),
    plate: [...document.querySelectorAll('.ma-give-thing')].filter((e) => e.getAttribute('aria-label')?.startsWith('拿回')).length,
  }))
  console.log('拿給波波示範中搶著拿：', JSON.stringify(s), '聽到：', (await voicesSince(page, t1)).join('、'))
  expect(s.demo).toBe(false)
  expect(s.plate).toBe(1)
  // 再拿兩個、打勾：交出去
  for (let i = 0; i < 2; i++) {
    const j = await page.evaluate(() => [...document.querySelectorAll('.ma-give-thing')].findIndex((e) => !e.getAttribute('aria-label')?.startsWith('拿回')))
    await k.tap((await center(page, '.ma-give-thing', j))!, '拿')
    await page.waitForTimeout(500)
  }
  await k.tap((await center(page, '.ma-give-done'))!, '打勾')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') === 'compare', null, { timeout: 15_000 })
  const rows = (await attempts(page)).filter((a) => a.game === 'm-give')
  console.log('拿給波波的作答紀錄：', JSON.stringify(rows))
  expect(rows.length).toBe(1)
  // 比多少第一次是手的示範（T-135，以前是教學卡）：示範中點空白只有圈圈、不會跳過；點「多」的那一堆就直接換他
  await page.waitForSelector('[data-teach-demo]', { timeout: 10_000 })
  await page.waitForTimeout(1800)
  const t2 = await page.evaluate(() => performance.now())
  await k.tap((await page.evaluate(() => { const t = [...document.querySelectorAll('.ma-teach .ma-tile')].map((e) => e.getBoundingClientRect()); return { x: (t[0].right + t[1].left) / 2, y: Math.min(...t.map((r) => r.top)) - 50 } })) as Pt, '示範中點空白')
  await page.waitForTimeout(300)
  const still = await page.evaluate(() => !!document.querySelector('[data-teach-demo]'))
  console.log('示範中點空白：', still ? '示範照常' : '被跳過了', '聽到：', (await voicesSince(page, t2)).join('、'))
  expect(still).toBe(true)
  await page.waitForFunction(() => [...document.querySelectorAll('.ma-teach .ma-tile[data-answer]')].some((e) => getComputedStyle(e).opacity === '1'), null, { timeout: 10_000 })
  await k.tap((await center(page, '.ma-teach .ma-tile[data-answer]'))!, '示範中點多的那一堆')
  await page.waitForSelector('.ma-quiz', { timeout: 10_000 })
  // 題目念的時候點空白 → 黃框馬上亮
  await page.waitForTimeout(700)
  const t3 = await page.evaluate(() => performance.now())
  await k.tap({ x: 1180, y: 700 } as Pt, '念題目時點空白')
  await page.waitForTimeout(250)
  const cue = await page.evaluate(() => document.querySelectorAll('.ma-quiz .ma-tile.cue').length)
  console.log('念題目時點空白：黃框', cue, '聽到：', (await voicesSince(page, t3)).join('、'))
  expect(cue).toBeGreaterThan(0)
})

test('數學：寫數字示範中下筆 → 示範收掉、那一筆照常描', async ({ page }, info) => {
  test.setTimeout(3 * 60_000)
  const k = new Toddler(page, info, 110, info.project.name)
  await boot(page, 110, { to: 'home' })
  await k.init()
  await setMath(page, { next: 1, firm: false, day: await today(page), n: 1, mode: 'new', part: 3, asked: 0, missed: 0 })
  await enterMath(page, k)
  await page.waitForFunction(() => !!document.querySelector('.ma-write') && !!document.querySelector('[data-demo="1"]'), null, { timeout: 15_000 })
  await page.waitForTimeout(1500)
  // 「1」這一筆：從上往下（描字板座標 41,20 → 41,120）
  const box = await page.evaluate(() => {
    const r = document.querySelector('.ma-paper svg.ma-lane')!.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  const at = (x: number, y: number) => ({ x: box.x + (x / 100) * box.w, y: box.y + (y / 140) * box.h })
  const pts = Array.from({ length: 24 }, (_, i) => at(50, 20 + (100 * i) / 23))
  const t1 = await page.evaluate(() => performance.now())
  await k.drag(pts, { stepMs: 30, label: '示範中搶著描' })
  await page.waitForTimeout(800)
  const s = await page.evaluate(() => ({ demo: !!document.querySelector('[data-demo="1"]'), finished: !!document.querySelector('[data-trace-finished]') }))
  console.log('寫數字示範中搶著描：', JSON.stringify(s), '聽到：', (await voicesSince(page, t1)).join('、'))
  expect(s.demo).toBe(false)
})
