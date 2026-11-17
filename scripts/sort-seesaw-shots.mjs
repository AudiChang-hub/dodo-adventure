// 豆豆收拾的 4 歲玩法、蹺蹺板比輕重（家長 2026-11-17）的截圖：node scripts/sort-seesaw-shots.mjs [輸出資料夾]
// 自己用 vite 的 API 開一個暫時的 dev server（埠 5293），用 Playwright 照孩子的操作點，拍完就關掉。
// 平板橫向 1200×786：選單、收拾第 6 級（照顏色 → 換規則 → 照形狀）、第 7 級、蹺蹺板 1 級（猜之前、歪下去）、4 級、3 級排輕重；
// 手機直式 390×844：收拾第 7 級、蹺蹺板、排輕重（只看不跑版）。
// 預設寫到主 repo 的 docs/截圖/新遊戲-收拾蹺蹺板/（worktree 裡的 docs/ 不會留下來）。
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const PORT = 5293
const OUT = path.resolve(process.argv[2] ?? path.join(process.cwd().replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/, ''), 'docs', '截圖', '新遊戲-收拾蹺蹺板'))
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const TAB = { width: 1200, height: 786 }
const PHONE = { width: 390, height: 844 }

// worktree 的 node_modules 是連到主 repo 的 junction：字型檔在專案資料夾外面，放寬 fs.strict 才拿得到
const server = await createServer({ server: { port: PORT, strictPort: true, fs: { strict: false } }, logLevel: 'error' })
await server.listen()
const URL = `http://localhost:${PORT}${server.config.base}`

/** 開 App、設定（遊戲角一直開著）、進度，停在遊戲角選玩法 */
async function open(browser, viewport, kv) {
  const page = await browser.newPage({ viewport })
  await page.goto(URL)
  await page.waitForSelector('.scene', { timeout: 60_000 })
  await page.evaluate(async (kv) => {
    await new Promise((res, rej) => {
      const rq = indexedDB.open('dodo-adventure')
      rq.onerror = () => rej(rq.error)
      rq.onsuccess = () => {
        const tx = rq.result.transaction('kv', 'readwrite')
        const st = tx.objectStore('kv')
        st.put({ key: 'settings', value: { freePlay: 'always', eyeBreakEvery: 60, dailyMinutes: 120, defaultsV: 4 } })
        for (const [key, value] of Object.entries(kv)) st.put({ key, value })
        tx.oncomplete = () => {
          rq.result.close()
          res()
        }
        tx.onerror = () => rej(tx.error)
      }
    })
    sessionStorage.setItem('dodo.resume', 'logic')
  }, kv)
  await page.reload()
  await page.waitForSelector('[data-logic-pick]', { timeout: 60_000 })
  await wait(1500)
  return page
}

async function tapEl(page, sel) {
  await page.locator(sel).first().waitFor({ timeout: 30_000 })
  await wait(300)
  const b = await page.locator(sel).first().boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('  ', name)
}
/** 等到輪到他點（題目念完） */
const turn = (page, extra = '') => page.waitForSelector(`[data-turn="1"]${extra}`, { timeout: 60_000 })

const sortKv = (level) => ({ 'logic.progress': { sort: { level, recent: [], taught: [1, 2, 3, 4, 5, 6, 7] }, pattern: { level: 1, recent: [], taught: [1] }, scenes: { sort: [], pattern: [] } } })
const seesawKv = (level) => ({ 'seesaw.progress': { level, streak: 0, taught: [1, 2, 3, 4, 5], date: '', used: [], recent: [] } })

/** 收拾：點對的籃子 */
async function sortOne(page) {
  await turn(page)
  const ans = await page.getAttribute('[data-logic-game="sort"]', 'data-answer')
  await tapEl(page, `[data-basket="${ans}"]`)
  await wait(1200)
}

const browser = await chromium.launch()
try {
  // 選單
  {
    const page = await open(browser, TAB, {})
    await shot(page, '00-選單-平板')
    await page.close()
  }
  // 豆豆收拾第 6 級：照顏色 → 換規則 → 照形狀（東西）
  {
    const page = await open(browser, TAB, sortKv(6))
    await tapEl(page, '[data-pick="sort"]')
    await turn(page)
    await wait(300)
    await shot(page, '01-收拾6-照顏色')
    for (let k = 0; k < 3; k++) await sortOne(page)
    await turn(page)
    const ans = await page.getAttribute('[data-logic-game="sort"]', 'data-answer')
    await tapEl(page, `[data-basket="${ans}"]`)
    await page.waitForSelector('.lg-pile', { timeout: 30_000 })
    await wait(1700)
    await shot(page, '02-收拾6-換規則-倒出來牌子翻面')
    await turn(page, '[data-side="1"]')
    await wait(300)
    await shot(page, '03-收拾6-換規則以後')
    await page.close()
  }
  // 豆豆收拾第 7 級：4 個籃子
  for (const [vp, tag] of [
    [TAB, '平板'],
    [PHONE, '手機'],
  ]) {
    const page = await open(browser, vp, sortKv(7))
    await tapEl(page, '[data-pick="sort"]')
    await turn(page)
    await wait(300)
    await shot(page, `04-收拾7-兩個一起看-${tag}`)
    if (tag === '平板') {
      await sortOne(page)
      await sortOne(page)
      await turn(page)
      await shot(page, '05-收拾7-收了兩個')
    }
    await page.close()
  }
  // 蹺蹺板 1 級：猜之前、猜了以後歪下去；4 級大的不一定比較重
  for (const [level, tag] of [
    [1, '1級'],
    [4, '4級-大的不一定重'],
  ]) {
    const page = await open(browser, TAB, seesawKv(level))
    await tapEl(page, '[data-pick="seesaw"]')
    await turn(page)
    await wait(300)
    await shot(page, `10-蹺蹺板${tag}-猜之前`)
    const heavy = await page.getAttribute('[data-logic-game="seesaw"]', 'data-heavy')
    await tapEl(page, `.ss-seat[data-side="${heavy}"] .ss-hit`)
    await wait(1800)
    await shot(page, `11-蹺蹺板${tag}-歪下去`)
    await page.close()
  }
  // 蹺蹺板 3 級：排輕重
  {
    const page = await open(browser, TAB, seesawKv(3))
    await tapEl(page, '[data-pick="seesaw"]')
    await turn(page)
    await wait(300)
    await shot(page, '12-蹺蹺板3級-排輕重')
    const ans = (await page.getAttribute('[data-logic-game="seesaw"]', 'data-answer')).split('>')
    await tapEl(page, `.ss-pick[data-thing="${ans[0]}"]`)
    await wait(1000)
    await turn(page)
    await shot(page, '13-蹺蹺板3級-放了一個')
    await tapEl(page, `.ss-pick[data-thing="${ans[1]}"]`)
    await page.waitForSelector('.ss-slot.is-cheer', { timeout: 30_000 })
    await wait(600)
    await shot(page, '14-蹺蹺板3級-排好了')
    await page.close()
  }
  // 手機直式：蹺蹺板、排輕重（只看不跑版）
  for (const level of [4, 5]) {
    const page = await open(browser, PHONE, seesawKv(level))
    await tapEl(page, '[data-pick="seesaw"]')
    await turn(page)
    await wait(300)
    await shot(page, `20-手機-蹺蹺板${level}級`)
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}
console.log('寫到', OUT)
