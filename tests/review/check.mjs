// 故事審稿頁的驗收（G-9）：手機直式 390×844、平板 1200×786 兩種尺寸，
// 1. 審稿頁不跑版（沒有橫向捲動、每一句都在畫面寬度內）、能試聽（真的抓了語音檔、那一句亮起來）、能通過、能退回（附原因）；
//    宗教經典的那一章有「宗教經典，請特別看」的標記、沒有「整篇通過」，要單獨按通過。
// 2. 孩子端（平板）：通過的章節排得到、播得到；退回的排不到（換成下一個通過的、或門的通用章節）。
// 要先有審稿佇列裡的劇本（scripts/story-weekly.ts 跑過一次），對開發版跑（用 window.__go 進家長區）：
//   npx vite --port 5191 --strictPort   然後   node tests/review/check.mjs [截圖資料夾]
// 環境變數 REVIEW_URL 可以改網址。
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.REVIEW_URL || 'http://localhost:5191/dodo-adventure/'
const OUT = process.argv[2] || 'test-results/review'
mkdirSync(OUT, { recursive: true })

const problems = []
const need = (ok, msg) => {
  if (!ok) problems.push(msg)
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 讀寫 IndexedDB 的 kv、chapters */
const idb = (page, fn, arg) =>
  page.evaluate(
    ({ src, arg }) =>
      new Promise((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction(['kv', 'chapters'], 'readwrite')
          let out = null
          // eslint-disable-next-line no-new-func
          new Function('kv', 'ch', 'arg', 'set', src)(tx.objectStore('kv'), tx.objectStore('chapters'), arg, (v) => (out = v))
          tx.oncomplete = () => {
            db.close()
            res(out)
          }
          tx.onerror = () => rej(tx.error)
        }
      }),
    { src: fn, arg },
  )

/** 截整頁：家長區的捲動在 main 裡，截圖時暫時攤開 */
async function shot(page, name) {
  await page.addStyleTag({ content: '.parent{position:relative!important;inset:auto!important;min-height:100vh}.parent main{overflow:visible!important}' }).catch(() => {})
  await page.screenshot({ path: join(OUT, name), fullPage: true })
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('.parent{position:relative!important') && s.remove()))
}

async function toReview(page) {
  await page.evaluate(() => window.__go({ name: 'parent' }))
  await page.getByRole('button', { name: /故事審稿/ }).click()
  await page.waitForSelector('.review')
  // 家長區的點擊算第一次手勢：之後才能出聲
  await page.locator('.review-head h2').click()
}

function noOverflow(page, label) {
  return page
    .evaluate(() => {
      const w = document.documentElement.clientWidth
      const wide = [...document.querySelectorAll('.review-line, .review-btns button, .review-ch-head, .review-draft')].filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && (r.right > w + 1 || r.left < -1)
      })
      const main = document.querySelector('.parent main')
      return { wide: wide.length, scroll: main ? main.scrollWidth - main.clientWidth : 0 }
    })
    .then((r) => need(r.wide === 0 && r.scroll <= 1, `${label}：不跑版（超出畫面的元素 ${r.wide} 個、橫向捲動 ${r.scroll}px）`))
}

async function reviewFlow(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: true, locale: 'zh-TW', timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const mp3 = []
  page.on('response', (r) => r.url().endsWith('.mp3') && r.ok() && mp3.push(r.url()))
  await page.goto(URL)
  await page.waitForSelector('.scene', { timeout: 20_000 })
  need(new globalThis.URL(page.url()).port === new globalThis.URL(URL).port, `${vp.name}：開的是自己的開發版（port ${new globalThis.URL(URL).port}）`)
  await toReview(page)
  await page.waitForTimeout(400)
  await shot(page, `${vp.name}-01-審稿頁.png`)
  await noOverflow(page, `${vp.name} 審稿頁`)

  const arc = page.locator('.review-draft').filter({ hasText: '原創長篇' }).first()
  const faith = page.locator('.review-draft.is-faith').first()
  need((await arc.count()) === 1, `${vp.name}：審稿佇列裡有原創長篇`)
  need((await faith.count()) === 1 && (await faith.locator('.review-faith').innerText()).includes('宗教經典，請特別看'), `${vp.name}：宗教經典標「宗教經典，請特別看」`)
  need((await faith.locator('.review-all').count()) === 0, `${vp.name}：宗教經典沒有「整篇通過」`)
  need((await arc.locator('.review-all').count()) === 1, `${vp.name}：一般的篇有「整篇通過」`)

  // 試聽一句：那一句亮起來、抓了語音檔
  const c1 = arc.locator('section[aria-label="第 1 章"]')
  const first = c1.locator('.review-line').first()
  const before = mp3.length
  await first.locator('.review-play').click()
  await page.waitForSelector('.review-line.is-playing', { timeout: 5000 })
  await page.waitForTimeout(500)
  // 正在念的那一句捲到畫面中間，截這一個畫面
  await page.evaluate(() => document.querySelector('.review-line.is-playing')?.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: join(OUT, `${vp.name}-02-試聽.png`) })
  await page.waitForFunction(() => !document.querySelector('.review-line.is-playing'), null, { timeout: 15_000 })
  need(mp3.length > before, `${vp.name}：試聽一句有抓到語音檔（${mp3.slice(before).map((u) => u.split('/').pop()).join('、')}）`)
  // 整章試聽：一句念完自己接下一句（亮的那一句往下走）；再按一次就停
  await c1.locator('.review-play-all').click()
  const moved = await page
    .waitForFunction(
      () => {
        const ls = [...document.querySelectorAll('section[aria-label="第 1 章"] .review-line')]
        return ls.findIndex((l) => l.classList.contains('is-playing')) >= 2
      },
      null,
      { timeout: 12_000 },
    )
    .then(() => true, () => false)
  await c1.locator('.review-play-all').click()
  await page.waitForTimeout(300)
  const stopped = (await page.locator('.review-line.is-playing').count()) === 0
  need(moved && stopped, `${vp.name}：整章試聽一句接一句念（念到第 3 句）；再按一次就停`)

  // 通過第 1 章、退回第 2 章（附原因）
  await c1.getByRole('button', { name: '通過', exact: true }).click()
  await c1.locator('.chip.is-ok').waitFor()
  need(true, `${vp.name}：第 1 章按通過 → 已通過`)
  const c2 = arc.locator('section[aria-label="第 2 章"]')
  await c2.getByRole('button', { name: '退回', exact: true }).click()
  await c2.locator('input').fill('第二句太長，他聽不懂')
  await c2.getByRole('button', { name: '送出退回' }).click()
  await c2.locator('.review-reason').waitFor()
  need((await c2.locator('.review-reason').innerText()).includes('第二句太長'), `${vp.name}：第 2 章退回、看得到原因`)
  // 宗教經典單獨通過
  await faith.getByRole('button', { name: '我看過了，通過這一章' }).click()
  await faith.locator('.chip.is-ok').waitFor()
  need(true, `${vp.name}：宗教經典那一章單獨按通過`)
  await page.waitForTimeout(300)
  await shot(page, `${vp.name}-03-通過與退回.png`)
  await noOverflow(page, `${vp.name} 按過之後`)
  await faith.scrollIntoViewIfNeeded()
  await page.evaluate(() => document.querySelector('.review-draft.is-faith')?.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(OUT, `${vp.name}-04-宗教經典.png`) })
  return { ctx, page }
}

/** 孩子端：按出發，看今天排到哪一章 */
async function startAdventure(page) {
  const d = today()
  await idb(page, `kv.delete('plan:' + arg); ch.delete(arg)`, d)
  await page.evaluate(() => sessionStorage.setItem('dodo.resume', 'home'))
  await page.reload()
  await page.waitForSelector('.screen.home', { timeout: 20_000 })
  await page.waitForTimeout(800)
  await page.locator('.go-btn').click()
  await page.waitForTimeout(3500)
  return idb(page, `const g = kv.get('plan:' + arg); g.onsuccess = () => set(g.result?.value ?? null)`, d)
}

async function childFlow(page) {
  // 打開故事（試播），故事講到第 2 篇第 1 章、龜兔賽跑講過了
  await idb(page, `const g = kv.get('settings'); g.onsuccess = () => kv.put({ key: 'settings', value: { ...(g.result?.value ?? {}), story: true, freePlay: 'always', eyeBreakEvery: 60, dailyMinutes: 120 } }); kv.put({ key: 'story', value: { part: 1, arc: 'p1-a02', next: 0, choices: {}, classicsDone: ['A01'], house: ['egg-nest'] } })`)
  const wd = new Date().getDay()
  const classicDay = wd >= 4 || wd === 0
  let plan = await startAdventure(page)
  const want1 = classicDay ? 'classic-j02' : 'p1-a02-c1'
  need(plan?.chapter === want1, `孩子端：通過的${classicDay ? '故事時間 J02（今天是星期四到日）' : '長篇第 1 章'}排得到（今天的章：${plan?.chapter ?? '通用章節'}）`)
  await page.screenshot({ path: join(OUT, `tablet-05-孩子端-通過的${classicDay ? '故事時間' : '長篇'}.png`) })

  // 家長退回 J02 → 孩子端改講長篇第 1 章（通過的）
  await toReview(page)
  const faith = page.locator('.review-draft.is-faith').first()
  await faith.getByRole('button', { name: /已通過|退回/ }).last().click()
  await faith.locator('input').fill('想先聽別的故事')
  await faith.getByRole('button', { name: '送出退回' }).click()
  await faith.locator('.review-reason').waitFor()
  plan = await startAdventure(page)
  need(plan?.chapter === 'p1-a02-c1', `孩子端：故事時間退回之後播不到，改講通過的長篇第 1 章（今天的章：${plan?.chapter ?? '通用章節'}）`)
  await page.screenshot({ path: join(OUT, 'tablet-06-孩子端-退回的不播.png') })
  const told = await idb(page, `const g = ch.get(arg); g.onsuccess = () => set(g.result ?? null)`, today())
  need(told?.ref === 'p1-a02-c1' && told.script?.some((x) => x.k.startsWith('story.p1-a02-c1.')), `孩子端：今天的章節紀錄是 p1-a02-c1，念的是審稿佇列裡的台詞`)

  // 第 2 章被退回：講到第 2 章時播不到，改講門的通用章節
  await idb(page, `kv.put({ key: 'story', value: { part: 1, arc: 'p1-a02', next: 1, choices: {}, classicsDone: ['A01', 'J02'], house: ['egg-nest'] } })`)
  plan = await startAdventure(page)
  need(!plan?.chapter, `孩子端：退回的第 2 章播不到，今天講門的通用章節（今天的章：${plan?.chapter ?? '通用章節'}）`)
  await page.screenshot({ path: join(OUT, 'tablet-07-孩子端-退回的章換通用章節.png') })
}

const browser = await chromium.launch()
try {
  const phone = await reviewFlow(browser, { name: 'phone', width: 390, height: 844, dpr: 2, mobile: true })
  await phone.ctx.close()
  const tab = await reviewFlow(browser, { name: 'tablet', width: 1200, height: 786, dpr: 1.5, mobile: false })
  await childFlow(tab.page)
  await tab.ctx.close()
} finally {
  await browser.close()
}
console.log(problems.length ? `\n✗ ${problems.length} 個問題` : '\n✓ 全部通過')
process.exit(problems.length ? 1 : 0)
