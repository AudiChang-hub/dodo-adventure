// 迷宮走完的「難一點」定點檢查（家長平板錄影：走完迷宮點「難一點」沒反應、最下面的回首頁被切掉一半）
// 只給這次修正用，不在三歲測試的清單裡：
//   rm -rf test-results/maze-harder/dist && node node_modules/vite/bin/vite.js build --outDir test-results/maze-harder/dist
//   TODDLER_PORT=4694 npx playwright test -c tests/toddler/maze-harder.config.ts
// 截圖：MAZE_SHOTS（沒給就寫到 test-results/maze-harder）
// 平板橫向 1200×786：走完第 1 級，等「難一點」和「再一個／回首頁」都出來，
//   1. 三顆鈕整顆都在畫面裡，而且各自的正中間點下去收到的是自己（沒被別的東西蓋住）
//   2. 手指點「難一點」：換成下一級的迷宮
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { boot, settle } from './lib/app'

const SHOTS = path.resolve(process.env.MAZE_SHOTS ?? 'test-results/maze-harder')

const kvSet = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ({ key, value }) =>
      new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key, value })
          tx.oncomplete = () => (db.close(), res())
        }
      }),
    { key, value },
  )

type P = { x: number; y: number }
/** 一根手指：按下、（沿著點移動）、放開 */
async function touch(cdp: CDPSession, pts: P[], stepMs = 40) {
  const tp = (p: P) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) })
  for (const p of pts.slice(1)) {
    await new Promise((r) => setTimeout(r, stepMs))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) })
  }
  await new Promise((r) => setTimeout(r, 90))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const mazeAttr = (page: Page, name: string) => page.evaluate((name) => document.querySelector('[data-logic-game="maze"]')?.getAttribute(name) ?? null, name)
const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect()
    return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, sel)

/** 照畫面上的 data-links 算出起點到終點的路，手指沿路拖過去 */
async function walkToGoal(page: Page, cdp: CDPSession) {
  const cols = Number(await mazeAttr(page, 'data-cols'))
  const links = ((await mazeAttr(page, 'data-links')) ?? '').split(',').map(Number)
  const goal = Number(await mazeAttr(page, 'data-goal'))
  const at = Number(await mazeAttr(page, 'data-at'))
  const prev = new Map<number, number>([[at, -1]])
  const q = [at]
  while (q.length) {
    const cur = q.shift()!
    const x = cur % cols
    const y = Math.floor(cur / cols)
    for (const [dx, dy, bit] of [
      [0, -1, 1],
      [1, 0, 2],
      [0, 1, 4],
      [-1, 0, 8],
    ]) {
      if (!(links[cur] & bit)) continue
      const nb = (y + dy) * cols + (x + dx)
      if (!prev.has(nb)) prev.set(nb, cur), q.push(nb)
    }
  }
  const cells: number[] = []
  for (let c = goal; c !== at && c >= 0; c = prev.get(c)!) cells.unshift(c)
  const pts: P[] = [(await center(page, `.mz-cell[data-cell="${at}"]`))!]
  for (const c of cells) pts.push((await center(page, `.mz-cell[data-cell="${c}"]`))!)
  await touch(cdp, pts, 200)
}

/** 這顆鈕：整顆在畫面裡嗎、正中間點下去收到的是不是它自己 */
const hitOf = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const b = document.querySelector(sel)
    if (!b) return { found: false, inside: false, onTop: false, rect: null, top: '' }
    const r = b.getBoundingClientRect()
    const inside = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const desc = hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : 'none'
    return { found: true, inside, onTop: !!hit && b.contains(hit), rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }, top: desc }
  }, sel)

/** 平板橫向 1200×786 為準；MAZE_VIEWPORTS=1200x700,1280x800 可以多量幾種（平板瀏覽器有網址列時畫面矮一點） */
const VIEWPORTS = (process.env.MAZE_VIEWPORTS ?? '1200x786').split(',').map((v) => v.split('x').map(Number) as [number, number])

for (const [vw, vh] of VIEWPORTS)
test(`迷宮走完（${vw}×${vh}）：難一點、再一個、回首頁都看得到、點得到；點難一點換下一級`, async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await page.setViewportSize({ width: vw, height: vh })
  await boot(page, 164, { to: 'home' })
  // 第 1 級、已經示範過（不跑示範），從邏輯遊戲的選玩法進去
  await kvSet(page, 'maze.progress', { level: 1, recent: [], taught: [1], sigs: [] })
  await page.evaluate(() => sessionStorage.setItem('dodo.resume', 'logic'))
  await page.reload()
  await page.waitForSelector('[data-pick="maze"]', { timeout: 20_000 })
  await settle(page)
  const cdp = await page.context().newCDPSession(page)
  await touch(cdp, [(await center(page, '[data-pick="maze"]'))!])
  await page.waitForSelector('[data-logic-game="maze"][data-turn="1"]', { timeout: 20_000 })
  expect(await mazeAttr(page, 'data-level')).toBe('1')

  await walkToGoal(page, cdp)
  await page.waitForSelector('[data-logic-game="maze"][data-done="1"]', { timeout: 10_000 })
  // 「難一點」先出來，豆豆說完 A bigger maze? 才出「再一個／回首頁」
  await page.waitForSelector('.mz-harder', { timeout: 15_000 })
  await page.waitForSelector('.draw-next-col .draw-home', { timeout: 15_000 })
  // 等彈出來的動畫結束
  await page.waitForTimeout(1500)
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, `${vw}x${vh}-走完三顆鈕.png`) })

  const hits = {
    harder: await hitOf(page, '.mz-harder'),
    again: await hitOf(page, '.draw-next-col .draw-again'),
    home: await hitOf(page, '.draw-next-col .draw-home'),
  }
  const board = await page.evaluate(() => {
    const r = document.querySelector('.mz-board')!.getBoundingClientRect()
    return { t: Math.round(r.top), b: Math.round(r.bottom) }
  })
  console.log(`${vw}x${vh}`, JSON.stringify({ board, ...hits }))
  // 三顆由上往下排、不疊在一起
  expect.soft(hits.harder.rect!.b <= hits.again.rect!.t && hits.again.rect!.b <= hits.home.rect!.t, '三顆由上往下、不重疊').toBe(true)
  for (const [k, h] of Object.entries(hits)) {
    expect.soft(h.inside, `${k} 整顆在畫面裡 ${JSON.stringify(h.rect)}`).toBe(true)
    expect.soft(h.onTop, `${k} 正中間點到的是自己（實際：${h.top}）`).toBe(true)
  }

  // 像錄影裡那樣用手指點「難一點」：要換成高一級的新迷宮（走得順，走完已經自己升一級的話，再往上一級）
  const sig0 = await mazeAttr(page, 'data-sig')
  const saved = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('kv').objectStore('kv').get('maze.progress')
          g.onsuccess = () => (rq.result.close(), res(g.result?.value?.level ?? 0))
        }
      }),
  )
  await touch(cdp, [(await center(page, '.mz-harder'))!])
  await expect.poll(() => mazeAttr(page, 'data-level'), { timeout: 4000, message: `點了難一點，換成第 ${saved + 1} 級` }).toBe(String(saved + 1))
  expect(await mazeAttr(page, 'data-sig')).not.toBe(sig0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SHOTS, `${vw}x${vh}-點難一點之後.png`) })
})
