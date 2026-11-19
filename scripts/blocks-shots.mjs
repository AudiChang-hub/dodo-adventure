// 積木蓋蓋看（T-162）的截圖：node scripts/blocks-shots.mjs [網址] [輸出資料夾]
// 先自己開 dev server（npx vite --port 5291 --strictPort），再跑這支。用 Playwright 照三歲的操作拖積木：
// 選單 11 張、選照圖蓋／自由蓋、四個難度（剛開始、蓋到一半、蓋好）、自由蓋，平板橫向 1200×786 和手機直式 390×844。
// 預設寫到主 repo 的 docs/截圖/新遊戲-積木/（worktree 裡的 docs/ 不會留下來）。
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5291/dodo-adventure/'
const OUT = path.resolve(process.argv[3] ?? path.join(process.cwd().replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/, ''), 'docs', '截圖', '新遊戲-積木'))
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 開 App、設定（遊戲角一直開著）、積木的級數（示範過了），停在遊戲角選玩法 */
async function open(browser, viewport, level, models = []) {
  const page = await browser.newPage({ viewport })
  await page.goto(URL)
  await page.waitForSelector('.scene', { timeout: 30_000 })
  await page.evaluate(
    async ({ level, models }) => {
      await new Promise((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
        rq.onsuccess = () => {
          const tx = rq.result.transaction('kv', 'readwrite')
          const st = tx.objectStore('kv')
          st.put({ key: 'settings', value: { freePlay: 'always', eyeBreakEvery: 60, dailyMinutes: 120, defaultsV: 5 } })
          st.put({ key: 'blocks.progress', value: { level, recent: [], taught: [1, 2, 3, 4], models } })
          tx.oncomplete = () => {
            rq.result.close()
            res()
          }
          tx.onerror = () => rej(tx.error)
        }
      })
      sessionStorage.setItem('dodo.resume', 'logic')
    },
    { level, models },
  )
  await page.reload()
  await page.waitForSelector('[data-logic-pick]', { timeout: 30_000 })
  await wait(1500)
  return page
}

async function tapEl(page, sel) {
  await page.locator(sel).first().waitFor()
  await wait(400)
  const b = await page.locator(sel).first().boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}

/** 拖一塊：從托盤的格子拖到 (x, y)（client px） */
async function dragTo(page, from, x, y) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((x - from.x) * i) / 12, from.y + ((y - from.y) * i) / 12)
  await page.mouse.up()
  await wait(250)
}

/** 照圖蓋：放 n 塊（從下面的位置先放；放不上去的換下一個） */
async function build(page, n) {
  for (let done = 0; done < n; ) {
    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-logic-game="blocks"]')
      const play = el?.querySelector('.bk-play')?.getBoundingClientRect()
      const slots = JSON.parse(el?.getAttribute('data-slots') ?? '[]')
      const cells = [...document.querySelectorAll('.bk-cell[data-kind]')].map((c) => {
        const r = c.getBoundingClientRect()
        return { k: c.getAttribute('data-kind'), x: r.left + r.width / 2, y: r.top + r.height / 2, extra: c.hasAttribute('data-extra') }
      })
      return { slots: slots.map((s, i) => s && { ...s, i, x: s.x + play.left, y: s.y + play.top }).filter(Boolean), cells, placed: Number(el?.getAttribute('data-placed') ?? 0) }
    })
    if (!info.slots.length) return
    const order = [...info.slots].sort((a, b) => b.y - a.y || a.x - b.x)
    let moved = false
    for (const s of order) {
      const c = info.cells.find((c) => c.k === s.k && !c.extra)
      if (!c) continue
      await dragTo(page, c, s.x, s.y)
      await wait(400)
      const placed = Number(await page.locator('[data-logic-game="blocks"]').getAttribute('data-placed'))
      if (placed > info.placed) {
        done++
        moved = true
        break
      }
      // 彈回來了（下面還沒撐住）：等豆豆說完再試下一個
      await wait(1800)
    }
    if (!moved) return
  }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

const browser = await chromium.launch()
const TAB = { width: 1200, height: 786 }
const PHONE = { width: 390, height: 844 }
const names = { 1: '1-平面3到4塊', 2: '2-平面6到8塊', 3: '3-前後兩排', 4: '4-步驟圖' }
try {
  // 選單（11 張）、選照圖蓋／自由蓋
  {
    const page = await open(browser, TAB, 1)
    await shot(page, '平板-選單11張')
    await tapEl(page, '[data-pick="blocks"]')
    await page.waitForSelector('[data-blocks-pick]')
    await wait(1200)
    await shot(page, '平板-選照圖蓋或自由蓋')
    await page.close()
  }
  for (const level of [1, 2, 3, 4]) {
    const page = await open(browser, TAB, level)
    await tapEl(page, '[data-pick="blocks"]')
    await page.waitForSelector('[data-blocks-pick]')
    await wait(800)
    await tapEl(page, '[data-blocks-pick] [data-pick="copy"]')
    await page.waitForSelector('[data-logic-game="blocks"]')
    await wait(2200)
    await shot(page, `平板-${names[level]}-開始`)
    const total = Number(await page.locator('[data-logic-game="blocks"]').getAttribute('data-bricks'))
    await build(page, Math.ceil(total / 2))
    await wait(1600)
    await shot(page, `平板-${names[level]}-蓋到一半`)
    await build(page, total)
    await wait(1500)
    await shot(page, `平板-${names[level]}-蓋好`)
    await wait(3500)
    await shot(page, `平板-${names[level]}-再蓋一個`)
    await page.close()
  }
  // 自由蓋：選幾個顏色、拖幾塊上去，按完成
  for (const [vp, tag] of [
    [TAB, '平板'],
    [PHONE, '手機直式'],
  ]) {
    const page = await open(browser, vp, 1)
    if (tag === '手機直式') await shot(page, `${tag}-選單11張`)
    await tapEl(page, '[data-pick="blocks"]')
    await page.waitForSelector('[data-blocks-pick]')
    await wait(800)
    if (tag === '手機直式') await shot(page, `${tag}-選照圖蓋或自由蓋`)
    await tapEl(page, '[data-blocks-pick] [data-pick="free"]')
    await page.waitForSelector('[data-logic-game="blocks-free"]')
    await wait(1500)
    const board = await page.evaluate(() => {
      const r = document.querySelector('.bk-board').getBoundingClientRect()
      const plate = document.querySelector('.bk-board g').getBoundingClientRect()
      return { x: plate.left, y: plate.top, w: plate.width, h: plate.height, r }
    })
    const cell = async (sel) => {
      const b = await page.locator(sel).first().boundingBox()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    const u = board.w / 12
    const groundY = board.y + board.h - u * 0.6
    const put = async (shape, color, col) => {
      await tapEl(page, `[data-color="${color}"]`)
      await dragTo(page, await cell(`[data-shape="${shape}"]`), board.x + u * col, groundY - u * 3)
    }
    // 一台車子＋一棵樹＋一間房子
    await put('wheel-1', 'R', 1.5)
    await put('wheel-1', 'R', 4.5)
    await put('brick-4', 'B', 3)
    await put('brick-2', 'Y', 3)
    await put('brick-1', 'N', 8.5)
    await put('brick-3', 'G', 8.5)
    await put('round-1', 'R', 8.5)
    await put('brick-2', 'O', 10.9)
    await put('slopeR-2', 'P', 10.9)
    await wait(600)
    await shot(page, `${tag}-自由蓋`)
    await tapEl(page, '.tool-done')
    await wait(4500)
    await shot(page, `${tag}-自由蓋-存好了`)
    await page.close()
  }
  // 手機直式的照圖蓋（第 2 級、第 4 級）
  for (const level of [2, 4]) {
    const page = await open(browser, PHONE, level)
    await tapEl(page, '[data-pick="blocks"]')
    await page.waitForSelector('[data-blocks-pick]')
    await wait(800)
    await tapEl(page, '[data-blocks-pick] [data-pick="copy"]')
    await page.waitForSelector('[data-logic-game="blocks"]')
    await wait(2200)
    await build(page, 3)
    await wait(1200)
    await shot(page, `手機直式-${names[level]}`)
    await page.close()
  }
} finally {
  await browser.close()
}
console.log(`截圖 → ${OUT}`)
