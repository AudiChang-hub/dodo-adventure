import { test, type Page } from '@playwright/test'
import { homeButton } from './lib/app'
import { pressBack, waitLive } from './lib/flows'
import { enter, finish, setup, shot, stageOf, want } from './lib/english-play'

/** 字的形狀（Paint 的描字板）上一筆一筆的螢幕座標 */
const letterPaths = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('.en-paint .en-trace-svg')
    if (!svg) return []
    // 字的每一筆（白色那一條，data-stroke）
    return [...svg.querySelectorAll<SVGPathElement>('path[data-stroke]')].map((p) => {
      const m = p.getScreenCTM()!
      const len = p.getTotalLength()
      const n = Math.max(6, Math.round(len / 4))
      return Array.from({ length: n + 1 }, (_, i) => {
        const q = p.getPointAtLength((len * i) / n)
        const s = new DOMPoint(q.x, q.y).matrixTransform(m)
        return { x: s.x, y: s.y }
      })
    })
  })
const ratioOf = (page: Page) => page.evaluate(() => Number(document.querySelector('.en-paint')?.getAttribute('data-ratio') ?? -1))
const cardAt = (page: Page, m: 'trace' | 'paint') =>
  page.evaluate((m) => {
    const r = document.querySelector(`.en-choose-card.is-${m}`)?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, m)
const toolAt = (page: Page, kind: 'color' | 'stamp', i = 0) =>
  page.evaluate(
    ({ kind, i }) => {
      const r = document.querySelectorAll(`.en-paint-tool.is-${kind}`)[i]?.getBoundingClientRect()
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
    },
    { kind, i },
  )

/**
 * 英文課「寫寫看」的另一種：先選描字或塗色，選了塗色就幫字母塗顏色、蓋印章（T-127，src/lessons/english/Paint.tsx）的三歲模擬測試。
 * 選的時候：手示範時搶著點、連點、兩根手指同時點兩張；塗的時候：示範時搶著塗、塗到一半放手、兩根手指、
 * 印章蓋在字外面、連點印章、塗好了出「下一步」走到選擇題；塗的時候按返回。
 */
test.describe('英文課：寫寫看塗色', () => {
  test('先選塗色，再塗顏色、蓋印章：搶著點、連點、多指、塗到一半放手，一樣走得到選擇題', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '塗色', { quiz: 'cards', write: null, stage: 'write' })
    try {
      if (!(await enter(k, c))) return
      // 1. 先選：兩張大卡，手會去點一下描字、一下塗色（關掉聲音也看得懂）
      const choose = await page.waitForSelector('.en-choose', { timeout: 15_000 }).catch(() => null)
      c.outcome('寫寫看先讓他選（描字／塗色兩張卡）', !!choose, choose ? '' : `停在 ${await stageOf(page)}`)
      if (!choose) return void (await c.once('no-choose', '卡死', '寫寫看沒有出現描字／塗色的選擇', ''))
      const hand = await page.waitForSelector('.en-choose .demo-hand', { timeout: 6000 }).catch(() => null)
      c.outcome('選的時候有手示範', !!hand)
      await shot(page, info, '寫寫看-選')
      // 手還在示範時搶著點：兩根手指同時點兩張（第一根在塗色），連點
      k.behavior = '示範時搶著點、兩根手指'
      const p = await cardAt(page, 'paint')
      const t = await cardAt(page, 'trace')
      if (p && t) await k.twoFinger([p], t, 150)
      if (p) await k.spam(p, 4, '連點塗色卡')
      const paint = await page.waitForSelector('.en-paint', { timeout: 6000 }).catch(() => null)
      const traced = await page.$('.en-trace')
      c.outcome('兩根手指：只算第一根（塗色），沒有跑去描字', !!paint && !traced)
      if (!paint) return void (await c.once('pick', '卡死', '點了塗色卡沒有進到塗色', ''))

      // 2. 塗色：手先示範（塗一段、拿印章蓋一個）；示範時搶著塗：示範收掉、他塗的留著
      const demo = await page.waitForSelector('.en-paint .demo-hand', { timeout: 6000 }).catch(() => null)
      c.outcome('塗色有手示範（塗一段、蓋印章）', !!demo)
      if (!demo) await c.once('no-demo', '困惑', '塗色沒有手示範', '')
      await page.waitForTimeout(900)
      await shot(page, info, '寫寫看-塗色示範')
      let ps = await letterPaths(page)
      if (!ps.length) return void (await c.once('no-letter', '卡死', '塗色找不到字的形狀', ''))
      k.behavior = '示範時搶著塗、塗到一半放手'
      const first = ps[0]
      await k.drag(first.slice(0, Math.ceil(first.length / 2)), { stepMs: 16, label: '塗一半放手' })
      await page.waitForTimeout(600)
      const r1 = await ratioOf(page)
      const stillDemo = await page.$('.en-paint .demo-hand')
      c.outcome('示範時搶著塗：示範收掉，他塗的留著', !stillDemo && r1 > 0 && r1 < 60, `塗了 ${r1}%`)
      // 3. 兩根手指一起塗：只有第一根有顏色（不會兩條一起畫、也不會卡住）
      k.behavior = '兩根手指塗'
      ps = await letterPaths(page)
      const last = ps[ps.length - 1]
      await k.twoFinger(last.slice(0, 6), { x: last[0].x + 200, y: last[0].y }, 150)
      const r2 = await ratioOf(page)
      c.outcome('兩根手指塗：照樣塗得上、不卡住', r2 >= r1, `塗了 ${r2}%`)
      // 4. 印章：連點印章，蓋在字外面（字亮一下、不蓋），再蓋在字上
      k.behavior = '印章'
      const st = await toolAt(page, 'stamp', 0)
      if (st) await k.spam(st, 3, '連點印章')
      const vp = page.viewportSize()!
      const outside = { x: vp.width * 0.5, y: vp.height * 0.9 }
      const n0 = await page.evaluate(() => document.querySelectorAll('.en-paint-stamp').length)
      await k.tap(outside, '印章蓋在字外面')
      await k.tap(first[Math.floor(first.length * 0.8)], '印章蓋在字上')
      await page.waitForTimeout(300)
      const n1 = await page.evaluate(() => document.querySelectorAll('.en-paint-stamp').length)
      c.outcome('印章：蓋在字外面不算、蓋在字上有一個', n1 - n0 === 1, `多了 ${n1 - n0} 個`)
      await shot(page, info, '寫寫看-塗色中')
      // 5. 換蠟筆、把整個字塗完：彩虹、出「下一步」，走到選擇題（大箭頭由測試自動點）
      k.behavior = '塗完'
      const col = await toolAt(page, 'color', 1)
      if (col) await k.tap(col, '換藍色蠟筆')
      for (const s of await letterPaths(page)) {
        if (await page.$('.en-paint[data-done]')) break
        await k.drag(s, { stepMs: 12, label: '塗' })
      }
      const done = await page.waitForSelector('.en-paint[data-done]', { timeout: 8000 }).catch(() => null)
      c.outcome('塗夠了：整個字亮起來（塗好了）', !!done, `塗了 ${await ratioOf(page)}%`)
      if (!done) await c.once('not-done', '卡死', '整個字都塗了，還是沒有塗好', `${await ratioOf(page)}%`)
      await shot(page, info, '寫寫看-塗好了')
      const quiz = await page.waitForFunction(() => document.querySelector('.en-lesson')?.getAttribute('data-phase') === 'quiz', null, { timeout: 20_000 }).catch(() => null)
      c.outcome('塗好了點「下一步」走到選擇題', !!quiz, quiz ? '' : `停在 ${await stageOf(page)}`)
      if (!quiz) await c.once('to-quiz', '卡死', '塗色塗好了，走不到選擇題', `停在 ${await stageOf(page)}`)
      await c.flush()
    } finally {
      finish(k, c, '塗色')
    }
  })

  test('塗色：塗到一半按返回 → 回首頁', async ({ page }, info) => {
    test.skip(!want() || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '塗色返回', { quiz: 'cards', write: 'paint', stage: 'write' })
    try {
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-paint', { timeout: 15_000 })
      await page.waitForTimeout(800)
      const ps = await letterPaths(page)
      if (ps[0]) await k.drag(ps[0].slice(0, 8), { label: '塗一點' })
      k.behavior = '塗到一半按返回'
      const h = await homeButton(page)
      if (h) await pressBack(k, h, '塗到一半按返回')
      const back = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('塗色：按返回回首頁', back === 'home', `到 ${back}`)
      if (back !== 'home') await c.once('back', '無法返回', '塗色時按返回沒有回首頁', `停在 ${back}`)
      await c.flush()
    } finally {
      finish(k, c, '塗色返回')
    }
  })
})

