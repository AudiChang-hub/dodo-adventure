// T-112 第 5 點：每一段花多久（只給這次開發用，不在三歲測試的清單裡）。
//   TODDLER_PORT=4677 npx playwright test -c tests/toddler/t112.config.ts -g 時間
// 「理想的孩子」：念完、輪到他就照著描、點對的答案（不搶、不亂點），記下每一段（data-phase／data-lesson-part）開始的時間。
// 結果寫到 test-results/t112/time-<T112_LABEL>.json。
import { test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

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

const save = (name: string, v: unknown) => {
  const f = `test-results/t112/time-${process.env.T112_LABEL ?? 'run'}.json`
  const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}
  fs.writeFileSync(f, JSON.stringify({ ...prev, [name]: v }, null, 1))
}

test('時間：英文一整堂（第一天 S）', async ({ page }) => {
  test.setTimeout(8 * 60_000)
  await boot(page, 130, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: '2000-01-01', done: true, good: false } })
  await page.reload()
  await page.waitForSelector('.scene')
  const door = await page.evaluate(() => {
    const r = document.querySelector('.door[data-door="english"], .side-door[data-door="english"]')!.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await touch(cdp, [door])
  await page.waitForSelector('.en-lesson')
  const t0 = Date.now()
  const marks: { stage: string; at: number }[] = []
  let quizTaps = 0
  while (Date.now() - t0 < 7 * 60_000) {
    const s = await page.evaluate(() => {
      const l = document.querySelector('.en-lesson')
      const stage = l?.getAttribute('data-phase') ?? (document.querySelector('.cheer-scrim') ? 'end' : 'gone')
      // 描字：可以畫了就描現在這一筆
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
      // 選擇題：黃框出來（輪到他）就點答案
      let ans: { x: number; y: number } | null = null
      if (document.querySelector('.en-opt.is-cue')) {
        const kind = document.querySelector('.en-options.is-little') ? 'little' : document.querySelector('.en-options.is-word') ? 'word' : 'big'
        const want = [...document.querySelectorAll('.en-ask-in b')].map((b) => b.textContent)
        const L = want[0] ?? 'S'
        const el =
          kind === 'word'
            ? null
            : [...document.querySelectorAll<HTMLElement>('.en-opt')].find((e) => e.getAttribute('aria-label') === (kind === 'big' ? L : L!.toLowerCase()))
        const r = el?.getBoundingClientRect()
        if (r) ans = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }
      return { stage, pts, ans }
    })
    if (marks[marks.length - 1]?.stage !== s.stage) marks.push({ stage: s.stage, at: (Date.now() - t0) / 1000 })
    if (s.stage === 'end' || s.stage === 'gone') break
    if (s.pts) await touch(cdp, s.pts, 18)
    else if (s.ans) {
      quizTaps++
      await touch(cdp, [s.ans])
    }
    await page.waitForTimeout(s.pts || s.ans ? 900 : 200)
  }
  const segs = marks.map((m, i) => ({ stage: m.stage, secs: Math.round(((marks[i + 1]?.at ?? m.at) - m.at) * 10) / 10 }))
  console.log('英文：', segs.map((x) => `${x.stage} ${x.secs}s`).join('、'), `｜選擇題點了 ${quizTaps} 下`)
  save('english', segs)
})

test('時間：數學比多少一題、寫數字一次', async ({ page }) => {
  test.setTimeout(6 * 60_000)
  await boot(page, 131, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  // 新的數字 3，從比多少開始（「多」教過了，不上教學卡）
  await put(page, 'kv', { key: 'lesson:math', value: { next: 3, firm: false, day: await today(page), n: 3, mode: 'new', max: 3, part: 2, asked: 0, missed: 0 } })
  await put(page, 'skills', { key: 'compare:more', box: 1, seen: 1, firstTry: 1, streak: 1, lastTs: 1 })
  await page.reload()
  await page.waitForSelector('.scene')
  const door = await page.evaluate(() => {
    const r = document.querySelector('.door[data-door="math"], .side-door[data-door="math"]')!.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await touch(cdp, [door])
  const t0 = Date.now()
  const marks: { part: string; at: number }[] = []
  let answers = 0
  let reps = 0
  while (Date.now() - t0 < 5 * 60_000) {
    const s = await page.evaluate(() => {
      const sc = [...document.querySelectorAll('.scene')].filter((e) => !(e as HTMLElement).inert).pop()
      const part = [...(sc?.querySelectorAll('[data-lesson-part]') ?? [])].pop()?.getAttribute('data-lesson-part') ?? (document.querySelector('.cheer-scrim') ? 'end' : 'open')
      let tile: { x: number; y: number } | null = null
      const cue = [...document.querySelectorAll('.ma-quiz .ma-tile.cue')]
      if (cue.length) {
        const best = cue.map((e) => ({ e, n: e.querySelectorAll('svg, img').length })).sort((a, b) => b.n - a.n)[0].e.getBoundingClientRect()
        tile = { x: best.left + best.width / 2, y: best.top + best.height / 2 }
      }
      let stroke: { x: number; y: number }[] | null = null
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
      return { part, tile, stroke }
    })
    if (marks[marks.length - 1]?.part !== s.part) marks.push({ part: s.part, at: (Date.now() - t0) / 1000 })
    if (s.part === 'review' || s.part === 'end') break
    if (s.part === 'compare' && s.tile) {
      answers++
      await touch(cdp, [s.tile])
      await page.waitForTimeout(900)
    } else if (s.part === 'write' && s.stroke) {
      reps++
      await touch(cdp, s.stroke, 18)
      await page.waitForTimeout(900)
    } else await page.waitForTimeout(200)
  }
  const segs = marks.map((m, i) => ({ part: m.part, secs: Math.round(((marks[i + 1]?.at ?? m.at) - m.at) * 10) / 10 }))
  console.log('數學：', segs.map((x) => `${x.part} ${x.secs}s`).join('、'), `｜比多少點了 ${answers} 題、寫數字描了 ${reps} 筆`)
  save('math', { segs, answers, reps })
})
