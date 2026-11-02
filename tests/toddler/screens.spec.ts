import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap, storyToldToday } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, alive, doorAt, enterGame, holdHome, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'
import fs from 'node:fs'
import path from 'node:path'
import { GAMES } from './catalog'
import { FEATURES, hidden } from './lib/features'

const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').trim()
// 指定了遊戲就只跑遊戲；要跑畫面就寫 screens 或畫面名稱（home、map、parent…）
const want = (name: string) => !only || only.split(',').some((s) => s === 'screens' || s === name)

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string, opts: Parameters<typeof boot>[2] = {}) {
  const seed = hashSeed(BASE_SEED, 'screen', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = name
  await boot(page, seed, opts)
  await k.init()
  return { k, c }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`screen-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

/** 等計時的時候亂點一下：學校首頁點屋簷（地面上是門下的字，會進課） */
const idleTap = (k: Toddler) => k.tap({ x: k.r.range(420, 780), y: k.r.range(30, 100) }, '首頁屋簷亂點')

test.describe('畫面', () => {
  // 學校的首頁（三大門）在 home.spec.ts；這一項是今日冒險版的首頁（出發）
  test('家長閘門與家長區', async ({ page }, info) => {
    test.skip(!want('parent'))
    const { k, c } = await setup(page, info, '家長區', { to: 'home' })
    try {
      const vp = page.viewportSize()!
      // PARENT-2：孩子點右上角 10 下不會開閘門
      k.behavior = '孩子點右上角'
      for (let i = 0; i < 10; i++) {
        await k.tap({ x: vp.width - 30, y: 30, nav: true }, '右上角')
        await k.wait(100)
      }
      await k.wait(500)
      const early = await page.$('.gate')
      c.rule('PARENT-2', !early, early ? '點右上角 10 下就出現閘門' : '點 10 下沒有閘門；按住 3 秒才有（見下一項）')
      if (early) await k.tap({ x: 20, y: vp.height - 20 }, '關閘門')
      // 孩子按住右上角 3 秒
      k.behavior = '孩子按住右上角'
      await k.hold({ x: vp.width - 30, y: 30, nav: true }, 3300, '右上角')
      const gate = await page.waitForSelector('.gate', { timeout: 3000 }).catch(() => null)
      c.outcome('右上角按住 3 秒', !!gate, gate ? '出現家長確認' : '沒出現')
      if (gate) {
        // 孩子亂按鍵盤
        k.behavior = '孩子亂按閘門'
        for (let i = 0; i < 12; i++) {
          const keys = await page.$$('.gate .keypad button')
          const b = await k.r.pick(keys).boundingBox()
          if (b) await k.tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, '鍵盤')
        }
        const s = await snap(page)
        c.outcome('亂按閘門', s.live === 'home', `仍在 ${s.live}`)
        // 點遮罩取消
        await k.tap({ x: 20, y: vp.height - 20 }, '點遮罩')
        await k.wait(800)
        const still = await page.$('.gate')
        c.outcome('點遮罩關閉閘門', !still, still ? '沒關' : '關了')
        if (still) await c.once('gate-stuck', '無法返回', '點閘門外面關不掉', '')
      }
      // 大人：答對進家長區
      k.behavior = '家長進出'
      await k.hold({ x: vp.width - 30, y: 30, nav: true }, 3300, '右上角')
      await page.waitForSelector('.gate', { timeout: 3000 })
      const q = await page.$eval('.gate .q', (e) => e.textContent ?? '')
      const m = q.match(/(\d+)\s*\+\s*(\d+)/)
      if (m) {
        for (const ch of String(Number(m[1]) + Number(m[2]))) await page.click(`.gate .keypad button[aria-label="${ch}"]`)
        await page.click('.gate .keypad button:has-text("確定")')
      }
      let live = await waitLive(page, (l) => l === 'parent')
      c.outcome('答對進家長區', live === 'parent', `到 ${live}`)
      await settle(page)
      // 家長區按返回（Android 返回）
      k.act('history.back()')
      await page.evaluate(() => history.back())
      live = await waitLive(page, (l) => l === 'home', 3000)
      c.outcome('家長區按返回', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('parent-back', '無法返回', '家長區按返回沒有回首頁', `停在 ${live}`)
      await c.screenOk('家長區返回')
      // 再進去，按「回到孩子模式」
      await settle(page)
      await k.hold({ x: vp.width - 30, y: 30, nav: true }, 3300, '右上角')
      await page.waitForSelector('.gate', { timeout: 3000 })
      const q2 = await page.$eval('.gate .q', (e) => e.textContent ?? '')
      const m2 = q2.match(/(\d+)\s*\+\s*(\d+)/)!
      for (const ch of String(Number(m2[1]) + Number(m2[2]))) await page.click(`.gate .keypad button[aria-label="${ch}"]`)
      await page.click('.gate .keypad button:has-text("確定")')
      await waitLive(page, (l) => l === 'parent')
      await settle(page)
      await page.click('button:has-text("回到孩子模式")')
      live = await waitLive(page, (l) => l === 'home', 3000)
      c.outcome('家長區「回到孩子模式」', live === 'home', `到 ${live}`)
      await c.screenOk('回到孩子模式')
      await c.flush()
    } finally {
      finish(k, c, '家長區')
    }
  })

  test('護眼休息', async ({ page }, info) => {
    test.skip(!want('eyebreak'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '護眼休息', { settings: { eyeBreakEvery: 1 }, to: 'home' })
    try {
      k.behavior = '等護眼休息'
      // 一分鐘活動後出現；期間在地圖亂點（不進站點）
      const end = Date.now() + 100_000
      let shown = false
      while (Date.now() < end) {
        if (await page.$('.overlay-layer')) {
          shown = true
          break
        }
        await idleTap(k)
        await k.wait(2000)
      }
      c.outcome('護眼休息出現', shown, shown ? '' : '100 秒內沒出現')
      if (shown) {
        k.behavior = '休息中亂玩'
        const t = Date.now()
        while ((await page.$('.overlay-layer')) && Date.now() - t < 90_000) {
          await toddlerStep(k, c)
          if (k.r.chance(0.2)) {
            const h = await homeButton(page)
            if (h) await pressBack(k, h, '休息中按返回')
          }
        }
        const gone = !(await page.$('.overlay-layer'))
        c.outcome('護眼休息結束', gone, `${Math.round((Date.now() - t) / 1000)} 秒`)
        if (!gone) await c.once('eyebreak-stuck', '卡死', '護眼休息 90 秒還沒結束', '')
        await c.screenOk('護眼休息後')
        await alive(k, c, '護眼休息後')
      }
      await c.flush()
    } finally {
      finish(k, c, '護眼休息')
    }
  })

  test('時間到（睡覺畫面）', async ({ page }, info) => {
    test.skip(!want('bedtime'))
    test.skip(!FEATURES.bedtime, hidden('bedtime'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '睡覺畫面', { settings: { dailyMinutes: 1 }, to: 'home' })
    try {
      k.behavior = '等時間到'
      const end = Date.now() + 100_000
      let live: string | null = null
      while (Date.now() < end) {
        live = (await snap(page)).live
        if (live === 'bedtime') break
        await idleTap(k)
        await k.wait(2000)
      }
      c.outcome('時間到出現睡覺畫面', live === 'bedtime', `畫面 ${live}`)
      if (live === 'bedtime') {
        k.behavior = '睡覺畫面亂玩'
        for (let i = 0; i < 15; i++) await toddlerStep(k, c)
        await page.evaluate(() => history.back())
        await k.wait(1000)
        const s = await snap(page)
        c.outcome('睡覺畫面亂玩、按返回', s.live === 'bedtime', `停在 ${s.live}`)
        await c.screenOk('睡覺畫面')
      }
      await c.flush()
    } finally {
      finish(k, c, '睡覺畫面')
    }
  })

  test('減少動態效果（MOTION-5）', async ({ page }, info) => {
    test.skip(!want('motion'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { k, c } = await setup(page, info, '減少動態效果', { to: 'home' })
    try {
      k.behavior = '換畫面'
      const g = GAMES.find((x) => x.id === 'd-free')!
      await enterGame(k, c, g)
      await settle(page)
      await holdHome(k, c, '減少動態：遊戲回首頁')
      await c.flush()
      c.rule('MOTION-5', c.stats.zoomMin >= 0.999 && c.stats.zoomMax <= 1.001, `系統開「減少動態效果」時整頁縮放 ${c.stats.zoomMin}～${c.stats.zoomMax}（準則：= 1）`)
      // 平板不會開這個設定：準則要紙感螢幕預設就減少動態
      c.outcome('減少動態效果', true, `整頁縮放 ${c.stats.zoomMin}～${c.stats.zoomMax}`)
    } finally {
      finish(k, c, '減少動態效果')
    }
  })

  test('預設設定（TIME-1）', async ({}, info) => {
    test.skip(!want('settings') || info.project.name !== 'tab1200')
    // 離線讀 src/lib/settings.ts 的 DEFAULTS
    const src = fs.readFileSync(path.resolve('src/lib/settings.ts'), 'utf8')
    const daily = Number(/dailyMinutes:\s*(\d+)/.exec(src)?.[1])
    const every = Number(/eyeBreakEvery:\s*(\d+)/.exec(src)?.[1])
    const help = /coloringHelp:\s*(true|false)/.exec(src)?.[1]
    const rules = [
      { id: 'TIME-1', ok: daily <= 20 && every <= 10, note: `預設每日 ${daily} 分鐘、每 ${every} 分鐘護眼`, where: '設定' },
      { id: 'DRAW-1', ok: help === 'false', note: `著色輔助 coloringHelp 預設 ${help}（準則：false，不限制畫的位置）`, where: '設定' },
    ]
    const dir = path.join(process.env.TODDLER_OUT || 'test-results/toddler', 'findings')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'tab1200-settings.json'), JSON.stringify({ name: 'settings', screen: '預設設定', viewport: 'tab1200', seed: 0, findings: [], log: [], outcomes: [], rules }, null, 2))
  })

  test('來回換畫面 200 次：圖層、字幕、家長角落（NAV-7、B15）', async ({ page }, info) => {
    test.skip(!want('layers'))
    test.setTimeout(25 * 60_000)
    const { k, c } = await setup(page, info, '來回換畫面', { to: 'home' })
    // 故事門照舊直接進書架（新章節的流程在 story.spec.ts）
    await storyToldToday(page)
    /** 量一次：最高的整頁圖層 z-index、字幕（點恐龍讓它說話）和家長角落是不是在最上面 */
    const measure = async () => {
      const host = await page.evaluate(() => {
        const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
        const d = root.querySelector('svg[role="button"]')
        const r = d?.getBoundingClientRect()
        return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.3 } : null
      })
      if (host) await k.tap(host, '點恐龍')
      await k.wait(900)
      return page.evaluate(() => {
        const z = Math.max(0, ...[...document.querySelectorAll<HTMLElement>('.scene')].map((e) => Number(e.style.zIndex || 0)))
        const top = (el: Element | null) => {
          if (!el) return null
          const b = el.getBoundingClientRect()
          if (b.width < 4) return null
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
          return !!hit && el.contains(hit)
        }
        // 換句時舊的那一句（data-gone）壓在新的下面淡出，本來就會被蓋：量正在說的那一句
        return { z, sub: top(document.querySelector('.sub-pill:not([data-gone])')), corner: top(document.querySelector('.parent-corner')) }
      })
    }
    try {
      k.behavior = '首頁↔每一扇門來回'
      let n = 0
      let bad = ''
      const checks: string[] = []
      // 學校的首頁：首頁 → 一扇門（三堂課、故事、畫畫輪流）→ 返回首頁；在課裡點恐龍量字幕
      const DOORS = ['english', 'chinese', 'math', 'story', 'draw']
      for (let i = 0; n < 200 && i < 140; i++) {
        if (!(await toHome(k, c))) break
        const door = DOORS[i % DOORS.length]
        const p = await doorAt(page, door)
        if (!p) break
        await k.tap(p, `門 ${door}`)
        if ((await waitLive(page, (l) => !!l && l !== 'home')) === 'home') break
        n++
        await settle(page)
        if (i % 7 === 6 || n >= 199) {
          const m = await measure()
          checks.push(`${n} 次：z ${m.z}、字幕${m.sub === null ? '沒出現' : m.sub ? '在上' : '被蓋'}、家長角落${m.corner ? '在上' : '被蓋'}`)
          if (!bad && (m.z > 10 || m.sub === false || m.corner === false)) bad = checks[checks.length - 1]
        }
        const h = await homeButton(page)
        if (h) await pressBack(k, h)
        if ((await waitLive(page, (l) => l === 'home')) === 'home') n++
      }
      const last = checks[checks.length - 1] ?? ''
      c.rule('NAV-7', !bad && n >= 200, `換了 ${n} 次畫面，量了 ${checks.length} 次${bad ? `；第一次出問題：${bad}` : '，圖層 z-index 都 ≤ 10、字幕和家長角落都在最上層'}（最後：${last}）`)
      c.outcome(`換畫面 ${n} 次後的圖層`, !bad && n >= 200, bad || last)
      if (bad) await c.once('z-grow', '困惑', `換了很多次畫面後，整頁圖層蓋過字幕或家長角落（${bad}）`, checks.join('；'))
      await c.flush()
    } finally {
      finish(k, c, '來回換畫面')
    }
  })
})
