// 恐龍賽跑棋、躲起來了幾隻（家長 2026-11-17）的截圖：node scripts/race-hide-shots.mjs [網址] [輸出資料夾]
// 先自己開 dev server（npx vite --port 5296 --strictPort），再跑這支。用 Playwright 照三歲的操作點：
// 選單、賽跑棋（示範、輪到他擲、一格一格走、跳格、豆豆的回合、終點打開禮物、1～6 點）、躲起來了幾隻（四級、答錯的提示、打開來數），平板橫向 1200×786 和手機直式 390×844。
// 預設寫到主 repo 的 docs/截圖/新遊戲-賽跑躲藏/（worktree 裡的 docs/ 不會留下來）。
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5296/dodo-adventure/'
const OUT = path.resolve(process.argv[3] ?? path.join(process.cwd().replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/, ''), 'docs', '截圖', '新遊戲-賽跑躲藏'))
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 開 App、設定（遊戲角一直開著）、兩個遊戲的進度，停在遊戲角選玩法 */
async function open(browser, viewport, kv) {
  const page = await browser.newPage({ viewport })
  await page.goto(URL)
  await page.waitForSelector('.scene', { timeout: 30_000 })
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
  await page.waitForSelector('[data-logic-pick]', { timeout: 30_000 })
  await wait(1500)
  return page
}

async function tapEl(page, sel) {
  await page.locator(sel).first().waitFor({ timeout: 60_000 })
  const b = await page.locator(sel).first().boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const attr = (page, sel, a) => page.locator(sel).first().getAttribute(a)
const until = async (page, fn, ms = 60_000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await wait(150)
  }
  throw new Error('timeout')
}

const RACE = '[data-logic-game="race"]'
const HIDE = '[data-logic-game="hide"]'
const raceKV = (level, taught) => ({ 'race.progress': { level, recent: [], taught, today: { date: '', tracks: [], rewards: [], runners: [] } } })
const hideKV = (level, taught) => ({ 'hide.progress': { level, recent: [], taught, today: { date: '', scenes: [], animals: [], places: [] } } })

/** 賽跑棋：輪到他就擲、走；skipOnce：第一次走的時候先點太前面的格子 */
async function playRace(page, { shots = {}, skipOnce = false, stopAt = null } = {}) {
  let moves = 0
  let skipped = !skipOnce
  for (;;) {
    if ((await attr(page, RACE, 'data-done')) === '1') return
    const turn = await attr(page, RACE, 'data-turn')
    const phase = await attr(page, RACE, 'data-phase')
    if (turn !== '1') {
      if (shots.dodo && (await attr(page, RACE, 'data-who')) === 'dodo' && phase === 'busy' && Number(await attr(page, RACE, 'data-lit')) >= 1) {
        await shot(page, shots.dodo)
        delete shots.dodo
      }
      await wait(150)
      continue
    }
    await wait(500)
    if (phase === 'roll') {
      if (shots.roll) {
        await shot(page, shots.roll)
        delete shots.roll
      }
      await tapEl(page, `${RACE} [data-die-btn]`)
      await until(page, async () => (await attr(page, RACE, 'data-phase')) === 'step', 15_000).catch(() => {})
      await wait(900)
      if (shots.step) {
        await shot(page, shots.step)
        delete shots.step
      }
    } else if (phase === 'step') {
      const kid = Number(await attr(page, RACE, 'data-kid'))
      if (!skipped && kid + 3 <= 10) {
        skipped = true
        await tapEl(page, `${RACE} [data-cell="${kid + 3}"]`)
        await wait(600)
        await shot(page, shots.skip ?? '賽跑-跳格')
        await wait(1500)
        continue
      }
      await tapEl(page, `${RACE} [data-cell="${kid + 1}"]`)
      await wait(420)
      if (shots.hop && Number(await attr(page, RACE, 'data-lit')) >= 1) {
        await shot(page, shots.hop)
        delete shots.hop
      }
      if ((await attr(page, RACE, 'data-phase')) !== 'step') moves++
      if (stopAt && moves >= stopAt) return
    } else await wait(200)
  }
}

/** 躲起來了幾隻：等到可以答，點 pick（'right'、'wrong'） */
async function hideAnswer(page, pick) {
  await until(page, async () => (await attr(page, HIDE, 'data-turn')) === '1', 90_000)
  await wait(400)
  const sel = pick === 'right' ? `${HIDE} [data-answer="1"]` : `${HIDE} .hd-opt:not([data-answer])`
  await tapEl(page, sel)
}

const browser = await chromium.launch()
const TAB = { width: 1200, height: 786 }
const PHONE = { width: 390, height: 844 }
try {
  // 選單
  {
    const page = await open(browser, TAB, {})
    await shot(page, '平板-選單13張')
    await page.close()
  }
  // 賽跑棋第 1 級：第一次玩（示範）→ 一起做 → 自己走（跳一次格）→ 豆豆的回合 → 終點
  {
    const page = await open(browser, TAB, raceKV(1, []))
    await tapEl(page, '[data-pick="race"]')
    await page.waitForSelector(RACE)
    await until(page, async () => (await attr(page, RACE, 'data-demo')) === '1' && Number(await attr(page, RACE, 'data-lit')) >= 1)
    await wait(300)
    await shot(page, '平板-賽跑1級-示範一格一格點')
    await playRace(page, { shots: { roll: '平板-賽跑1級-輪到他擲骰子', step: '平板-賽跑1級-擲出來了下一格亮著', hop: '平板-賽跑1級-走一格點數變黃', dodo: '平板-賽跑1級-豆豆的回合', skip: '平板-賽跑1級-跳格了一格一格走' }, skipOnce: true })
    await wait(1800)
    await shot(page, '平板-賽跑1級-兩隻都到了打開禮物')
    await wait(4000)
    await shot(page, '平板-賽跑1級-再玩一次或回首頁')
    await page.close()
  }
  // 賽跑棋第 2 級（下一格不亮）、第 3 級（1～6 點）
  for (const [level, tag] of [
    [2, '2級-1到3點不亮'],
    [3, '3級-1到6點'],
  ]) {
    const page = await open(browser, TAB, raceKV(level, [1, 2, 3]))
    await tapEl(page, '[data-pick="race"]')
    await page.waitForSelector(RACE)
    await playRace(page, { shots: { step: `平板-賽跑${tag}`, roll: `平板-賽跑${tag}-輪到他` }, stopAt: 3 })
    await wait(600)
    await shot(page, `平板-賽跑${tag}-走了幾步`)
    await page.close()
  }
  // 躲起來了幾隻：第 1 級（示範 → 一起做 → 答錯兩次的提示 → 答對打開來數）
  {
    const page = await open(browser, TAB, hideKV(1, []))
    await tapEl(page, '[data-pick="hide"]')
    await page.waitForSelector(HIDE)
    await until(page, async () => (await attr(page, HIDE, 'data-stage')) === 'arrive' && !!(await page.locator(`${HIDE} [data-card]`).count()))
    await shot(page, '平板-躲藏1級-數出3隻')
    await until(page, async () => (await attr(page, HIDE, 'data-demo')) === '1' && (await page.locator(`${HIDE} .hd-opt`).count()) > 0)
    await wait(1600)
    await shot(page, '平板-躲藏1級-示範')
    await until(page, async () => (await attr(page, HIDE, 'data-item')) === '1')
    await hideAnswer(page, 'right')
    await until(page, async () => (await attr(page, HIDE, 'data-item')) === '2')
    await until(page, async () => (await attr(page, HIDE, 'data-turn')) === '1', 90_000)
    await wait(300)
    await shot(page, '平板-躲藏1級-躲起來了問幾隻')
    await hideAnswer(page, 'wrong')
    await wait(400)
    await hideAnswer(page, 'wrong')
    await wait(2200)
    await shot(page, '平板-躲藏1級-答錯第2次空心圈亮起來')
    await hideAnswer(page, 'right')
    await until(page, async () => (await attr(page, HIDE, 'data-stage')) === 'open')
    await wait(1600)
    await shot(page, '平板-躲藏1級-打開來一起數')
    for (const _ of [3, 4]) {
      await until(page, async () => ['3', '4'].includes(await attr(page, HIDE, 'data-item')), 60_000)
      await hideAnswer(page, 'right').catch(() => {})
      await wait(500)
    }
    await until(page, async () => (await page.locator('.done-choices, [class*="done"]').count()) > 0, 90_000).catch(() => {})
    await wait(4500)
    await shot(page, '平板-躲藏1級-再一局或回首頁')
    await page.close()
  }
  // 躲起來了幾隻：第 2～4 級
  for (const [level, tag] of [
    [2, '2級-3到4隻圈圈'],
    [3, '3級-4到5隻圈圈加數字'],
    [4, '4級-5隻數字'],
  ]) {
    const page = await open(browser, TAB, hideKV(level, [1, 2, 3, 4]))
    await tapEl(page, '[data-pick="hide"]')
    await page.waitForSelector(HIDE)
    await until(page, async () => (await attr(page, HIDE, 'data-turn')) === '1', 90_000)
    await wait(300)
    await shot(page, `平板-躲藏${tag}`)
    await hideAnswer(page, 'right')
    await until(page, async () => (await attr(page, HIDE, 'data-stage')) === 'open')
    await wait(2200)
    await shot(page, `平板-躲藏${tag}-打開來`)
    await page.close()
  }
  // 手機直式：只要求不跑版
  {
    const page = await open(browser, PHONE, { ...raceKV(1, [1, 2, 3]), ...hideKV(2, [1, 2, 3, 4]) })
    await shot(page, '手機直式-選單13張')
    await tapEl(page, '[data-pick="race"]')
    await page.waitForSelector(RACE)
    await playRace(page, { shots: { step: '手機直式-賽跑' }, stopAt: 1 })
    await page.close()
    const p2 = await open(browser, PHONE, hideKV(2, [1, 2, 3, 4]))
    await tapEl(p2, '[data-pick="hide"]')
    await p2.waitForSelector(HIDE)
    await until(p2, async () => (await attr(p2, HIDE, 'data-turn')) === '1', 90_000)
    await shot(p2, '手機直式-躲藏')
    await p2.close()
  }
} finally {
  await browser.close()
}
console.log(`截圖 → ${OUT}`)
