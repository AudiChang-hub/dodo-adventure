// T-112 定點檢查（只給這次開發用，不在三歲測試的清單裡）：
//   npx vite build --outDir test-results/t112/dist2 && TODDLER_PORT=4612 npx playwright test -c tests/toddler/t112.config.ts
// 1. 描字：照盲測 b637ff7 seed 3 的那一筆（從綠點往右下畫、跳過 S 上面的彎）→ 不說 Almost；Nice try!、跑道亮、筆帶一次；
//    再一筆沒描上 → You drew it!、筆帶著描完、往下一輪（字填色、沒有彩虹）；小寫照著跑道描（手抖）→ 彩虹、Great writing!；
//    作答紀錄：大寫不算描好（helped、tries），小寫算描好。
// 2. 選擇題：第一天只有 2 題（大 S、小 s）；發呆 8 秒手安靜地指著答案、15 秒再念一次題目。
import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'
import { Toddler } from './lib/toddler'

const SHOTS = 'test-results/t112/shots'

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

const attempts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ skill: string; ok: boolean; metrics?: Record<string, number>; ts: number }[]>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('attempts').objectStore('attempts').getAll()
          g.onsuccess = () =>
            res(
              (g.result as { skill: string; firstTryCorrect: boolean; metrics?: Record<string, number>; ts: number }[])
                .map((a) => ({ skill: a.skill, ok: a.firstTryCorrect, metrics: a.metrics, ts: a.ts }))
                .sort((a, b) => a.ts - b.ts),
            )
        }
      }),
  )

/** 念過的句子：音檔（字幕）和平板內建語音（缺音檔時） */
const voices = (page: Page) => page.evaluate(() => [...window.__toddler.voices.map((v) => ({ t: v.t, s: v.text })), ...window.__toddler.tts.map((v) => ({ t: v.t, s: v.text }))].filter((v) => v.s).sort((a, b) => a.t - b.t).map((v) => v.s!))
const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, sel)

/** 描字板的座標（viewBox 0..100 × 0..140）→ 螢幕 */
const toScreen = (page: Page, pts: [number, number][]) =>
  page.evaluate((pts) => {
    const svg = [...document.querySelectorAll<SVGSVGElement>('.en-trace-board svg')].pop()!
    const m = svg.getScreenCTM()!
    return pts.map(([x, y]) => {
      const s = new DOMPoint(x, y).matrixTransform(m)
      return { x: s.x, y: s.y }
    })
  }, pts)

/** 照著這一筆的跑道描（左右晃 amp 單位） */
const along = (page: Page, amp: number) =>
  page.evaluate((amp) => {
    const board = [...document.querySelectorAll('.en-trace-board')].pop()!
    const p = board.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
    const m = p.getScreenCTM()!
    const len = p.getTotalLength()
    const n = 24
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = p.getPointAtLength((len * i) / n)
      const b = p.getPointAtLength(Math.min(len, (len * i) / n + 0.5))
      const tx = b.x - a.x, ty = b.y - a.y, k = Math.hypot(tx, ty) || 1
      const w = amp * Math.sin(i * 1.3)
      const s = new DOMPoint(a.x - (ty / k) * w, a.y + (tx / k) * w).matrixTransform(m)
      return { x: s.x, y: s.y }
    })
  }, amp)

const canDraw = (page: Page) =>
  page.waitForFunction(() => document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false' && !document.querySelector('.en-trace[data-demo]'), null, { timeout: 60_000 })

test('描字：沒描上不說 Almost、最多重試一次就往下；照著線描就稱讚；熟練照樣嚴格', async ({ page }, info) => {
  test.setTimeout(4 * 60_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  const k = new Toddler(page, info, 112, info.project.name)
  await boot(page, 112, { to: 'home' })
  await k.init()
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: await today(page), done: false, good: false, stage: 'trace', round: 0 } })
  await page.reload()
  await page.waitForSelector('.scene')
  await k.tap((await center(page, '.door[data-door="english"], .side-door[data-door="english"]'))!, '英文門')
  await page.waitForSelector('.en-trace', { timeout: 20_000 })
  await canDraw(page)
  await page.waitForTimeout(600)
  const before = (await voices(page)).length

  // 盲測 seed 3 第 3 步：從綠點往右下、斜到左邊、再畫下面（跳過 S 上面的彎）
  const seed3: [number, number][] = [[75.3, 29.1], [85.4, 44.7], [66.0, 60.3], [39.8, 71.0], [34.6, 87.3], [63.3, 95.0], [75.2, 108.9], [48.1, 116.6], [24.4, 107.9]]
  await k.drag(await toScreen(page, seed3), { stepMs: 16, label: '像盲測那樣畫（跳過上面的彎）' })
  const glowSeen: string[] = []
  for (let i = 0; i < 6; i++) {
    glowSeen.push(await page.evaluate(() => {
      const g = document.querySelectorAll('[data-trace-glow]')
      const e = g[g.length - 1] as SVGGElement | undefined
      const p = e?.querySelector('path')
      return e ? `${g.length} 層 透明度 ${Number(getComputedStyle(e).opacity).toFixed(2)}` : '無'
    }))
    if (i === 2) await page.screenshot({ path: `${SHOTS}/1-沒描上-NiceTry.png` })
    await page.waitForTimeout(150)
  }
  console.log('跑道發亮：', glowSeen.join(' ｜ '))
  const glow1 = await page.evaluate(() => !!document.querySelector('[data-trace-glow]'))
  console.log('語音紀錄：', JSON.stringify(await page.evaluate(() => ({ v: window.__toddler.voices.slice(-4), tts: window.__toddler.tts.slice(-4) }))))
  await page.screenshot({ path: `${SHOTS}/1-沒描上-NiceTry.png` })
  await page.waitForTimeout(2500)
  const said1 = (await voices(page)).slice(before)
  console.log('第一次沒描上：聽到', said1.join('、'), '；跑道亮', glow1)
  expect(said1.join(' ')).toMatch(/Nice try!/)
  expect(said1.join(' ')).not.toMatch(/Almost/)
  expect(glow1).toBe(true)
  // 還在大寫這一輪（重試一次）
  expect(await page.evaluate(() => document.querySelectorAll('.en-trace-rounds .is-done').length)).toBe(0)

  // 再亂畫一次（鋸齒）
  const mid = (await voices(page)).length
  await k.drag(await toScreen(page, [[20, 30], [80, 50], [20, 70], [80, 90], [20, 110]]), { stepMs: 16, label: '亂畫鋸齒' })
  await page.waitForSelector('.en-trace [data-trace-finished]', { state: 'attached', timeout: 15_000 })
  const neat1 = await page.evaluate(() => document.querySelector('[data-trace-finished]')?.getAttribute('data-trace-neat'))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/2-再一次-YouDrewIt.png` })
  await page.waitForFunction(() => document.querySelector('.en-trace-rounds .is-now')?.textContent?.trim() === 's', null, { timeout: 20_000 })
  const said2 = (await voices(page)).slice(mid)
  console.log('第二次沒描上：聽到', said2.join('、'), '；data-trace-neat', neat1)
  expect(said2.join(' ')).toMatch(/You drew it!/)
  expect(said2.join(' ')).not.toMatch(/Almost|Great writing/)
  expect(neat1).toBe('0')

  // 小寫：照著跑道描、手抖（左右晃 1.2 個跑道半寬）
  await canDraw(page)
  await page.waitForTimeout(600)
  const t2 = (await voices(page)).length
  await k.drag(await along(page, 12), { stepMs: 16, label: '照著小 s 描（手抖）' })
  await page.waitForSelector('.en-trace [data-trace-finished]', { state: 'attached', timeout: 15_000 })
  const neat2 = await page.evaluate(() => document.querySelector('[data-trace-finished]')?.getAttribute('data-trace-neat'))
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOTS}/3-照著描-GreatWriting.png` })
  await page.waitForTimeout(1500)
  const said3 = (await voices(page)).slice(t2)
  console.log('照著描：聽到', said3.join('、'), '；data-trace-neat', neat2)
  expect(neat2).toBe('1')
  expect(said3.join(' ')).toMatch(/Great writing!/)

  // 描字的作答紀錄（示範那一筆 logTeach 沒有 metrics，不算）
  const rows = (await attempts(page)).filter((a) => a.skill.startsWith('write:') && a.metrics)
  console.log('作答紀錄：', JSON.stringify(rows))
  expect(rows.find((a) => a.skill === 'write:S')).toMatchObject({ ok: false, metrics: { helped: 1, tries: 2 } })
  expect(rows.find((a) => a.skill === 'write:s')).toMatchObject({ ok: true })
  expect(rows.find((a) => a.skill === 'write:s')?.metrics?.tries).toBeUndefined()
  // 新句子都有音檔（沒有退回平板內建語音）
  const tts = await page.evaluate(() => window.__toddler.tts.map((v) => v.text))
  console.log('內建語音：', tts.join('、') || '（沒有）')
  expect(tts).toEqual([])
  console.log('全部語音：', (await voices(page)).join(' | '))
})

test('選擇題：第一天 2 題；發呆 8 秒手指著答案（不說話）、15 秒再念一次題目', async ({ page }, info) => {
  test.setTimeout(3 * 60_000)
  const k = new Toddler(page, info, 113, info.project.name)
  await boot(page, 113, { to: 'home' })
  await k.init()
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: await today(page), done: false, good: false, stage: 'quiz', round: 0, answers: [] } })
  await put(page, 'kv', { key: 'lesson-format-solo', value: { 'en-big': 5, 'en-little': 5, 'en-word': 5 } })
  await page.reload()
  await page.waitForSelector('.scene')
  await k.tap((await center(page, '.door[data-door="english"], .side-door[data-door="english"]'))!, '英文門')
  await page.waitForSelector('.en-quiz', { timeout: 20_000 })
  const total = await page.evaluate(() => Number(document.querySelector('.en-steps .is-quiz')?.getAttribute('data-total')))
  console.log('選擇題題數：', total)
  expect(total).toBe(2)
  // 等到收作答（黃框），開始計時
  await page.waitForSelector('.en-opt.is-cue', { timeout: 30_000 })
  const t0 = Date.now()
  const n0 = (await voices(page)).length
  await page.waitForSelector('.en-opt.is-hint', { timeout: 12_000 })
  const handAt = (Date.now() - t0) / 1000
  const quiet = (await voices(page)).slice(n0)
  await page.screenshot({ path: `${SHOTS}/4-發呆8秒-手.png` })
  console.log(`手出來：${handAt.toFixed(1)} 秒；這段聽到：${quiet.join('、') || '（安靜）'}`)
  expect(handAt).toBeGreaterThan(6.5)
  expect(handAt).toBeLessThan(10)
  expect(quiet.length).toBe(0)
  await page.waitForFunction((n) => window.__toddler.voices.filter((v) => v.text).length > n, n0, { timeout: 12_000 })
  const askAt = (Date.now() - t0) / 1000
  console.log(`再念題目：${askAt.toFixed(1)} 秒，${(await voices(page)).slice(n0).join('、')}`)
  expect(askAt).toBeGreaterThan(13)
  expect(askAt).toBeLessThan(18)
})
