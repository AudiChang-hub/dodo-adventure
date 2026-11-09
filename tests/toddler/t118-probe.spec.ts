// T-118 盤點：每日時間上限到的時候，正在上的課、故事會不會被直接換成睡覺畫面（只量、不改程式）
//   rm -rf test-results/t118/dist && node node_modules/vite/bin/vite.js build --outDir test-results/t118/dist && TODDLER_PORT=4679 npx playwright test -c tests/toddler/t118.config.ts
// 做法：每日上限設 1 分鐘，一進首頁就點門進去，之後完全不碰畫面，每秒記一次在哪個畫面。
import { test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].pop()
    const r = e?.getBoundingClientRect()
    return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, sel)
async function touch(cdp: CDPSession, p: { x: number; y: number }) {
  const tp = [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp })
  await new Promise((r) => setTimeout(r, 90))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const where = (page: Page) =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
    const cls = s?.querySelector('.screen')?.className ?? s?.className ?? ''
    if (document.querySelector('.bedtime, [class*="bedtime"]')) return 'bedtime'
    if (document.querySelector('.cheer-scrim')) return 'lesson-end'
    return (location.hash || '') + ' ' + cls.split(' ').slice(0, 3).join(' ')
  })

for (const [door, seed] of [['english', 181], ['math', 182], ['chinese', 183], ['story', 184]] as const) {
  test(`每日上限 1 分鐘：在「${door}」裡不碰畫面，會不會被換成睡覺畫面`, async ({ page }) => {
    test.setTimeout(3 * 60_000)
    await boot(page, seed, { to: 'home', settings: { dailyMinutes: 1 } })
    const cdp = await page.context().newCDPSession(page)
    await page.reload()
    await page.waitForSelector('.scene')
    const t0 = Date.now()
    await touch(cdp, (await center(page, `.door[data-door="${door}"], .side-door[data-door="${door}"]`))!)
    const log: { s: number; at: string }[] = []
    let last = ''
    while (Date.now() - t0 < 100_000) {
      const at = await where(page)
      if (at !== last) log.push({ s: Math.round((Date.now() - t0) / 1000), at }), (last = at)
      await page.waitForTimeout(1000)
    }
    fs.mkdirSync('test-results/t118', { recursive: true })
    fs.writeFileSync(`test-results/t118/bedtime-${door}.json`, JSON.stringify(log, null, 1))
    console.log(door, JSON.stringify(log))
  })
}
