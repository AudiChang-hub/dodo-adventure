// 故事排順序、聽兩步驟指令、心情臉「為什麼」（T-164）的截圖：node scripts/lang-shots.mjs [網址] [輸出資料夾]
// 先自己開 dev server（npx vite --port 5292 --strictPort），再跑這支。用 Playwright 照孩子的操作點：
// 選單 13 張；三個遊戲每一級剛開始、做到一半、點錯的提示、做完；第一次玩的示範；平板橫向 1200×786 和手機直式 390×844。
// 預設寫到主 repo 的 docs/截圖/新遊戲-順序指令心情/（worktree 裡的 docs/ 不會留下來）。
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const URL = process.argv[2] || 'http://localhost:5292/dodo-adventure/'
const OUT = path.resolve(process.argv[3] || path.join(process.cwd().replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/, ''), 'docs', '截圖', '新遊戲-順序指令心情'))
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const TABLET = { width: 1200, height: 786 }
const PHONE = { width: 390, height: 844 }
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

/** 開 App、設定（遊戲角一直開著）、寫進度，停在遊戲角選玩法 */
async function open(browser, viewport, kv = {}) {
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
  const loc = page.locator(sel).first()
  await loc.waitFor()
  const b = await loc.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}
/** 等擋板拿掉（可以點了） */
const accepting = (page, ms = 40_000) => page.waitForSelector('.wait-shield[data-accepting="true"]', { timeout: ms })

async function pick(page, game) {
  await tapEl(page, `[data-pick="${game}"]`)
  await page.waitForSelector(`[data-logic-game="${game}"]`, { timeout: 20_000 })
}

// ── 故事排順序 ──
/** 下一張對的：還在下面那排、data-card 最小的 */
async function orderNext(page) {
  const cards = await page.$$eval('.or-deck button.or-card', (bs) => bs.map((b) => Number(b.getAttribute('data-card'))))
  return Math.min(...cards)
}
async function orderPlace(page) {
  const c = await orderNext(page)
  await tapEl(page, `.or-deck button.or-card[data-card="${c}"]`)
  await wait(700)
}
async function orderWrong(page) {
  const cards = await page.$$eval('.or-deck button.or-card', (bs) => bs.map((b) => Number(b.getAttribute('data-card'))))
  const c = Math.max(...cards)
  if (c === Math.min(...cards)) return false
  await tapEl(page, `.or-deck button.or-card[data-card="${c}"]`)
  return true
}

async function orderShots(browser) {
  for (const level of [1, 2, 3]) {
    const page = await open(browser, TABLET, { 'order.progress': { level, streak: 0, taught: [1, 2, 3], day: '', today: [], recent: [] } })
    await pick(page, 'order')
    await accepting(page)
    await wait(2500)
    await shot(page, `order-${level}級-開始`)
    await orderPlace(page)
    await wait(1500)
    if (await orderWrong(page)) {
      await wait(250)
      await shot(page, `order-${level}級-點錯晃一下`)
      await wait(2500)
    }
    await shot(page, `order-${level}級-排一半`)
    // 排完：照順序再念一遍
    while ((await page.$$('.or-deck button.or-card')).length) {
      await orderPlace(page)
      await wait(1800)
    }
    await wait(2500)
    await shot(page, `order-${level}級-排好了再念一遍`)
    await page.close()
  }
  // 第一次玩：示範
  {
    const page = await open(browser, TABLET, {})
    await pick(page, 'order')
    await page.waitForSelector('[data-logic-game="order"][data-demo="1"]')
    // 示範的手要放第二張的時候
    await page.waitForSelector('[data-logic-game="order"][data-placed="2"]', { timeout: 40_000 })
    await wait(600)
    await shot(page, 'order-第一次玩-示範')
    await page.close()
  }
  // 手機直式
  {
    const page = await open(browser, PHONE, { 'order.progress': { level: 3, streak: 0, taught: [1, 2, 3], day: '', today: [], recent: [] } })
    await shot(page, '選單-手機直式')
    await pick(page, 'order')
    await accepting(page)
    await orderPlace(page)
    await wait(1500)
    await shot(page, 'order-3級-手機直式')
    await page.close()
  }
}

// ── 聽兩步驟指令 ──
async function listenTarget(page, step) {
  const t = await page.getAttribute('[data-logic-game="listen"]', 'data-targets')
  return t.split(',').map(Number)[step]
}
async function listenShots(browser) {
  for (const level of [1, 2, 3, 4]) {
    const page = await open(browser, TABLET, { 'listen.progress': { level, streak: 0, taught: [1, 2, 3, 4], day: '', today: [] } })
    await pick(page, 'listen')
    await page.waitForSelector('[data-logic-game="listen"][data-turn="1"]', { timeout: 40_000 })
    await shot(page, `listen-${level}級-開始`)
    const targets = (await page.getAttribute('[data-logic-game="listen"]', 'data-targets')).split(',').map(Number)
    const n = (await page.$$('.ls-thing')).length
    const wrong = [...Array(n).keys()].find((k) => !targets.includes(k))
    await tapEl(page, `.ls-thing[data-k="${wrong}"]`)
    await wait(300)
    await shot(page, `listen-${level}級-點錯晃一下`)
    await page.waitForSelector('[data-logic-game="listen"][data-turn="1"]', { timeout: 20_000 })
    await tapEl(page, `.ls-thing[data-k="${await listenTarget(page, 0)}"]`)
    await wait(600)
    if (targets.length > 1) {
      await shot(page, `listen-${level}級-第一步點對了`)
      await tapEl(page, `.ls-thing[data-k="${await listenTarget(page, 1)}"]`)
      await wait(600)
    }
    await shot(page, `listen-${level}級-做對了`)
    await page.close()
  }
  {
    const page = await open(browser, PHONE, { 'listen.progress': { level: 4, streak: 0, taught: [1, 2, 3, 4], day: '', today: [] } })
    await pick(page, 'listen')
    await page.waitForSelector('[data-logic-game="listen"][data-turn="1"]', { timeout: 40_000 })
    await shot(page, 'listen-4級-手機直式')
    await page.close()
  }
  {
    const page = await open(browser, TABLET, {})
    await pick(page, 'listen')
    await page.waitForSelector('[data-logic-game="listen"][data-demo="1"]')
    await page.waitForSelector('.ls-thing.is-done', { timeout: 30_000 })
    await shot(page, 'listen-第一次玩-示範')
    await page.close()
  }
}

// ── 心情臉「為什麼」 ──
const feelProg = (whyLevel, open = true) => ({ level: 3, streak: 2, taught: [1, 2, 3], sits: [], heroes: [], whyOpen: open, why: { level: whyLevel, streak: 0, taught: [1, 2, 3], sits: [], heroes: [] } })
async function feelShots(browser) {
  for (const level of [1, 2, 3]) {
    const page = await open(browser, TABLET, { 'feel.progress': feelProg(level) })
    await pick(page, 'feel')
    for (let q = 0; q < (level === 3 ? 2 : 1); q++) {
      await page.waitForSelector('[data-logic-game="feel"][data-turn="1"]', { timeout: 40_000 })
      const mode = await page.getAttribute('[data-logic-game="feel"]', 'data-mode')
      await shot(page, `feel-為什麼-${level}級-${mode === 'face' ? '看情境選心情' : '看臉選情境'}`)
      const a = Number(await page.getAttribute('[data-logic-game="feel"]', 'data-answer'))
      const n = (await page.$$('[data-opt]')).length
      const wrong = [...Array(n).keys()].find((k) => k !== a)
      await tapEl(page, `[data-opt="${q === 0 ? wrong : a}"]`)
      await wait(q === 0 ? 2600 : 1500)
      await shot(page, `feel-為什麼-${level}級-${mode === 'face' ? '看情境選心情' : '看臉選情境'}-${q === 0 ? '選了別的' : '選對了'}`)
      await page.waitForFunction((i) => document.querySelector('[data-logic-game="feel"]')?.getAttribute('data-item') !== String(i), q, { timeout: 30_000 })
    }
    await page.close()
  }
  {
    const page = await open(browser, PHONE, { 'feel.progress': feelProg(2) })
    await pick(page, 'feel')
    await page.waitForSelector('[data-logic-game="feel"][data-turn="1"]', { timeout: 40_000 })
    await shot(page, 'feel-為什麼-2級-手機直式')
    await page.close()
  }
  // 驚訝的臉（五種心情的大頭照：直接用元件畫不方便，改成在「為什麼」裡找一題驚訝的）
  {
    const page = await open(browser, TABLET, { 'feel.progress': feelProg(3) })
    await pick(page, 'feel')
    for (let q = 0; q < 4; q++) {
      await page.waitForSelector('[data-logic-game="feel"][data-turn="1"]', { timeout: 40_000 })
      const has = await page.$('[data-face="surprised"]')
      if (has) {
        await shot(page, 'feel-為什麼-驚訝的臉')
        break
      }
      const a = Number(await page.getAttribute('[data-logic-game="feel"]', 'data-answer'))
      await tapEl(page, `[data-opt="${a}"]`)
      await page.waitForFunction((i) => document.querySelector('[data-logic-game="feel"]')?.getAttribute('data-item') !== String(i), q, { timeout: 30_000 })
    }
    await page.close()
  }
  // 原本的心情臉（還沒熟練）完全不變
  {
    const page = await open(browser, TABLET, { 'feel.progress': { ...feelProg(1, false), streak: 0 } })
    await pick(page, 'feel')
    await page.waitForSelector('[data-logic-game="feel"][data-turn="1"]', { timeout: 40_000 })
    await shot(page, 'feel-原本的玩法-沒熟練不變')
    await page.close()
  }
}

const browser = await chromium.launch()
try {
  const which = process.argv[4] ?? 'menu,order,listen,feel'
  if (which.includes('menu')) {
    const page = await open(browser, TABLET, {})
    await shot(page, '選單-平板橫向')
    await page.close()
  }
  if (which.includes('order')) await orderShots(browser)
  if (which.includes('listen')) await listenShots(browser)
  if (which.includes('feel')) await feelShots(browser)
} finally {
  await browser.close()
}
console.log(`截圖在 ${OUT}`)
