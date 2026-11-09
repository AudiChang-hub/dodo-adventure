// T-122 定點檢查（只給這次開發用，不在三歲測試的清單裡）：盲測 ca0d1e1 英文課的兩個離開點
//   rm -rf test-results/t122/dist && node node_modules/vite/bin/vite.js build --outDir test-results/t122/dist && TODDLER_PORT=4693 npx playwright test -c tests/toddler/t122.config.ts
//   改前：T122_DIST=test-results/t122/dist-main T122_LABEL=main
// 「沒耐心的孩子」：每次輪到他描字，都只描 45% 就放手（盲測 seed 1、seed 2 重跑「拖到一半放手」）；選擇題點對的答案。
// 量：每一輪描字他要畫幾次才過（改前：第一次 Nice try 要重描）；選擇題答完、大箭頭出來後多久手來點（改前 2.5 秒）。
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

const LABEL = process.env.T122_LABEL ?? 'run'
const before = LABEL === 'main'

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

test('定點：英文課，描字每次都描一半就放手、選擇題答完的大箭頭', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  await boot(page, 222, { to: 'home', autoNext: false })
  const cdp = await page.context().newCDPSession(page)
  await page.evaluate(
    (p) =>
      new Promise<void>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const tx = rq.result.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key: 'lesson.english', value: p })
          tx.oncomplete = () => (rq.result.close(), res())
        }
      }),
    { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: '2000-01-01', done: true, good: false },
  )
  await page.reload()
  await page.waitForSelector('.scene')
  await touch(cdp, [(await center(page, '.door[data-door="english"], .side-door[data-door="english"]'))!])
  await page.waitForSelector('.en-lesson')
  const t0 = Date.now()
  /** 每一輪描字（段落:第幾輪）他畫了幾次 */
  const draws: Record<string, number> = {}
  /** 每一個大箭頭：在哪一段、出來後多久手來點 */
  const gates: { at: string; handMs: number | null }[] = []
  let roundKey = ''
  while (Date.now() - t0 < 8 * 60_000) {
    if (await page.$('.next-step')) {
      const at = (await page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-phase'))) ?? '?'
      const g0 = Date.now()
      const hand = await page.waitForSelector('.next-step-hand', { timeout: 4000 }).catch(() => null)
      gates.push({ at, handMs: hand ? Date.now() - g0 : null })
      await page.waitForTimeout(400)
      const nx = await center(page, '.next-step')
      if (nx) await touch(cdp, [nx])
      await page.waitForTimeout(500)
      roundKey = ''
      continue
    }
    const s = await page.evaluate(() => {
      const stage = document.querySelector('.cheer-scrim') ? 'end' : (document.querySelector('.en-lesson')?.getAttribute('data-phase') ?? 'gone')
      const t = document.querySelector('.en-trace')
      let pts: { x: number; y: number }[] | null = null
      const round = document.querySelectorAll('.en-trace-rounds .is-done').length
      if (t && t.getAttribute('data-accepting') !== 'false' && !t.hasAttribute('data-demo') && !t.querySelector('[data-trace-finished]')) {
        const board = [...document.querySelectorAll('.en-trace-board')].pop()
        const p = board?.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')
        if (p) {
          const m = p.getScreenCTM()!
          const len = p.getTotalLength()
          // 只描 45% 就放手
          pts = Array.from({ length: 15 }, (_, i) => {
            const q = p.getPointAtLength((len * 0.45 * i) / 14)
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
      return { stage, pts, ans, round }
    })
    if (s.stage === 'end' || s.stage === 'gone') break
    if (s.pts) {
      roundKey = `${s.stage}:${s.round + 1}`
      draws[roundKey] = (draws[roundKey] ?? 0) + 1
      await touch(cdp, s.pts, 18)
      await page.waitForTimeout(900)
    } else if (s.ans) {
      await touch(cdp, [s.ans])
      await page.waitForTimeout(900)
    } else await page.waitForTimeout(200)
  }
  const tEnd = Date.now()
  const reached = !!(await page.waitForSelector('.cheer-scrim .lesson-bye, .cheer-scrim .picker', { timeout: 15_000 }).catch(() => null))
  const quizGates = gates.filter((g) => g.at === 'quiz')
  const row = {
    上到下課: reached,
    一堂多長_秒: Math.round((tEnd - t0) / 100) / 10,
    每一輪描字畫幾次: draws,
    要重描的輪數: Object.values(draws).filter((n) => n > 1).length,
    選擇題大箭頭出來後手來點_毫秒: quizGates.map((g) => g.handMs),
    其他大箭頭手來點_毫秒: gates.filter((g) => g.at !== 'quiz').map((g) => `${g.at}:${g.handMs}`),
  }
  console.log(LABEL, JSON.stringify(row, null, 1))
  fs.mkdirSync('test-results/t122', { recursive: true })
  fs.writeFileSync(`test-results/t122/check-${LABEL}.json`, JSON.stringify(row, null, 1))
  if (!before) {
    expect(reached, '要上到下課').toBe(true)
    expect(row.要重描的輪數, '描到一半放手不要他重描').toBe(0)
    for (const g of quizGates) expect(g.handMs ?? 99_999, '選擇題答完：手馬上來點大箭頭').toBeLessThan(1500)
  }
})
