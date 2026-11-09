// 家長區「本週新故事」的驗收（G-9 的故事審稿頁，T-120 起改成直接上線）：手機直式 390×844、平板 1200×786 兩種尺寸，
// 本週新故事不跑版（沒有橫向捲動、每一句都在畫面寬度內）、能試聽（真的抓了語音檔、那一句亮起來）、
// 沒有「通過」：每一章一開始就是「孩子聽得到」；能撤下（原因可以不寫）、撤下的看得到原因、能放回；
// 宗教經典的那一章標「宗教經典」。
// 孩子端「撤下的不播、沒撤下的直接播」由單元測試 scripts/test-story-live.ts 驗（原本這裡的孩子端流程用的是 T-75 拿掉的冒險出發鍵）。
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

/** 截整頁：家長區的捲動在 main 裡，截圖時暫時攤開 */
async function shot(page, name) {
  await page.addStyleTag({ content: '.parent{position:relative!important;inset:auto!important;min-height:100vh}.parent main{overflow:visible!important}' }).catch(() => {})
  await page.screenshot({ path: join(OUT, name), fullPage: true })
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent?.includes('.parent{position:relative!important') && s.remove()))
}

async function toReview(page) {
  await page.evaluate(() => window.__go({ name: 'parent' }))
  // 等換畫面的動畫結束再點分頁（太早點會點到還在退場的那一份）
  await page.waitForSelector('.parent nav')
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /本週新故事/ }).click()
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
  await shot(page, `${vp.name}-01-本週新故事.png`)
  await noOverflow(page, `${vp.name} 本週新故事`)

  const arc = page.locator('.review-draft').filter({ hasText: '原創長篇' }).first()
  const faith = page.locator('.review-draft.is-faith').first()
  need((await arc.count()) === 1, `${vp.name}：本週新故事裡有原創長篇`)
  need((await faith.count()) === 1 && (await faith.locator('.review-faith').innerText()).includes('宗教經典'), `${vp.name}：宗教經典標「宗教經典」`)
  need((await page.locator('.review-all').count()) === 0, `${vp.name}：沒有「整篇通過」`)
  need((await page.getByRole('button', { name: /^通過|通過這一章/ }).count()) === 0, `${vp.name}：沒有「通過」鍵（不用審稿）`)
  const live = await page.locator('.review-ch .chip.is-live').count()
  const all = await page.locator('.review-ch').count()
  need(all > 0 && live === all, `${vp.name}：每一章一開始就是「孩子聽得到」（${live}/${all}）`)

  // 一開始每一章都收起來：打開第 1 章才看得到句子
  await arc.locator('section[aria-label="第 1 章"] .review-ch-toggle').click()
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

  // 撤下第 2 章（附原因）→ 看得到原因、狀態是已撤下；撤下第 3 章（不寫原因也可以）；放回第 3 章
  const c2 = arc.locator('section[aria-label="第 2 章"]')
  await c2.getByRole('button', { name: '撤下這一章' }).click()
  await c2.locator('input').fill('第二句太長，他聽不懂')
  await c2.getByRole('button', { name: '撤下這一章' }).click()
  await c2.locator('.review-reason').waitFor()
  need((await c2.locator('.review-reason').innerText()).includes('第二句太長') && (await c2.locator('.chip.is-off').count()) === 1, `${vp.name}：第 2 章撤下、看得到原因`)
  const c3 = arc.locator('section[aria-label="第 3 章"]')
  await c3.getByRole('button', { name: '撤下這一章' }).click()
  await c3.getByRole('button', { name: '撤下這一章' }).click()
  await c3.locator('.chip.is-off').waitFor()
  need(true, `${vp.name}：第 3 章不寫原因也能撤下`)
  await c3.getByRole('button', { name: '放回，給孩子聽' }).click()
  await c3.locator('.chip.is-live').waitFor()
  need(true, `${vp.name}：第 3 章放回 → 孩子聽得到`)
  const counts = await page.locator('.review-counts').innerText()
  need(counts.includes(`孩子聽得到 ${all - 1} 章`) && counts.includes('已撤下 1'), `${vp.name}：上面的數字跟著變（${counts.replace(/\s+/g, ' ')}）`)
  await page.waitForTimeout(300)
  await shot(page, `${vp.name}-03-撤下與放回.png`)
  await noOverflow(page, `${vp.name} 按過之後`)
  await page.evaluate(() => document.querySelector('.review-draft.is-faith')?.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(OUT, `${vp.name}-04-宗教經典.png`) })
  return { ctx, page }
}

const browser = await chromium.launch()
try {
  const phone = await reviewFlow(browser, { name: 'phone', width: 390, height: 844, dpr: 2, mobile: true })
  await phone.ctx.close()
  const tab = await reviewFlow(browser, { name: 'tablet', width: 1200, height: 786, dpr: 1.5, mobile: false })
  await tab.ctx.close()
} finally {
  await browser.close()
}
console.log(problems.length ? `\n✗ ${problems.length} 個問題` : '\n✓ 全部通過')
process.exit(problems.length ? 1 : 0)
