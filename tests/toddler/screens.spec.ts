import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap, targets, voicesSince } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, alive, audit, enterGame, holdHome, pressBack, toMap, toddlerStep, waitLive } from './lib/flows'
import fs from 'node:fs'
import path from 'node:path'
import { GAMES, STATIONS, type StationId } from './catalog'

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

async function center(page: Page, sel: string) {
  return page.evaluate((sel) => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const el = root.querySelector(sel) ?? document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, sel)
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`screen-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

/** 在某個畫面亂玩 n 步；被帶到別的畫面就記下來 */
async function play(k: Toddler, c: Checker, live: string, n: number) {
  const left: string[] = []
  for (let i = 0; i < n; i++) {
    const s = await snap(k.page)
    if (s.live !== live) {
      left.push(s.live ?? '?')
      break
    }
    await toddlerStep(k, c)
    if (i % 5 === 4) await c.flush()
  }
  await c.screenOk(`${live} 亂玩`)
  return left
}

test.describe('畫面', () => {
  test('首頁', async ({ page }, info) => {
    test.skip(!want('home'))
    const { k, c } = await setup(page, info, '首頁', { to: 'home' })
    try {
      k.behavior = '亂點'
      // 首頁的「出發」會進今日冒險：亂點時先避開，另外測
      for (let i = 0; i < 16; i++) {
        const ts = (await targets(page)).filter((t) => !/出發|去地圖|地圖|我的朋友/.test(t.label))
        const s = await snap(page)
        if (s.live !== 'home') break
        if (ts.length && k.r.chance(0.5)) await k.tap(k.r.pick(ts), k.r.pick(ts).label)
        else await k.tap({ x: k.r.range(5, 1195), y: k.r.range(5, 795) }, '亂點')
        await k.wait(300 + k.r.int(600))
      }
      const s = await snap(page)
      c.outcome('首頁亂點', await c.screenOk('首頁亂點'), s.live === 'home' ? '還在首頁' : `點到按鈕到了 ${s.live}`)
      await c.flush()
      if (s.live !== 'home') {
        await holdHome(k, c, `${s.live} 回首頁`)
        await settle(page)
      }
      // 狂點出發
      k.behavior = '狂點出發'
      const go = await center(page, '.go-btn')
      if (go) {
        await k.spam(go, 8, '出發')
        // 今日冒險裡面還有一疊自己的畫面（route、travel-0…），live 會是裡面那一層
        const live = await waitLive(page, (l) => !!l && l !== 'home', 4000)
        await k.wait(2500)
        const s2 = await snap(page)
        const adv = s2.scenes.some((x) => x.id === 'adventure')
        c.outcome('狂點出發', adv, `到 ${live}，之後圖層 ${s2.scenes.map((x) => x.id).join(',')}`)
        await c.screenOk('狂點出發')
        await c.flush()
        // 冒險一開始就想回家
        k.behavior = '冒險開場按首頁'
        const h = await homeButton(page)
        if (!h) {
          // 冒險的路線圖、旁白卡沒有回首頁鈕
          await c.once('adv-nohome', '無法返回', '今日冒險的路線、旁白畫面沒有回首頁鈕', `畫面 ${s2.live}：只能等到進了遊戲才有左上角的回首頁`)
          c.outcome('冒險開場按首頁', false, '沒有回首頁鈕')
        } else {
          await holdHome(k, c, '冒險開場按首頁')
          // 路線圖的上一層是首頁：淡出中的冒險不能先換成旁白卡
          const back = await waitLive(page, (l) => l === 'home', 3000)
          c.outcome('冒險路線圖按返回 → 首頁', back === 'home', `到 ${back}`)
          if (back !== 'home') await c.once('adv-route-home', '無法返回', '冒險路線圖按返回沒有回首頁', `停在 ${back}`)
        }
      }
    } finally {
      finish(k, c, '首頁')
    }
  })

  test('地圖與站點', async ({ page }, info) => {
    test.skip(!want('map'))
    const { k, c } = await setup(page, info, '地圖與站點')
    try {
      await audit(k, c, '地圖')
      // 回首頁鈕短按（孩子不會按住）
      k.behavior = '短按回首頁'
      const h = await homeButton(page)
      if (h) {
        await k.spam(h, 3, h.label)
        await k.wait(1500)
        const s = await snap(page)
        c.outcome('地圖：短按回首頁', s.live === 'home', s.live === 'home' ? '回到首頁' : `留在 ${s.live}（要按住 0.6 秒）`)
        if (s.live !== 'home')
          await c.once('short-home', '困惑', '回首頁鈕要「按住」，孩子短按沒有反應', `地圖、站點、貼紙本要按住 0.6 秒，遊戲裡要按住 1.2 秒；短按只閃一下圈圈，沒有任何說明（孩子會以為壞了）`)
      }
      for (const st of Object.keys(STATIONS) as StationId[]) {
        k.behavior = `站點 ${STATIONS[st]}`
        if (!(await toMap(k, c))) break
        // 地圖亂點幾下再進站
        for (let i = 0; i < 3; i++) await k.tap({ x: k.r.range(5, 1195), y: k.r.range(5, 795) }, '地圖亂點')
        await settle(page)
        // 亂點到站牌就被帶進站點了：回地圖再來
        if ((await snap(page)).live !== 'map' && !(await toMap(k, c))) break
        const p = await center(page, `.map-stop[aria-label="${STATIONS[st]}"]`)
        if (!p) continue
        const t0 = await page.evaluate(() => performance.now())
        await k.spam(p, 6, STATIONS[st])
        const live = await waitLive(page, (l) => l === `st-${st}`)
        await k.wait(3000)
        // 每個站點一進去恐龍會說歡迎（StationScreen 的 welcome.<站>）
        const said = await voicesSince(page, t0)
        if (live === `st-${st}` && !said.length)
          await c.once('welcome-cut', '小問題', '進站點的歡迎語音沒有播出來', `${STATIONS[st]}：進站 3 秒內沒有任何語音。StationScreen 的 say('welcome.…') 在子元件的 effect 先跑，接著 App 換畫面時的 stopSpeech() 把它切掉`)
        c.outcome(`狂點站牌 ${STATIONS[st]}`, live === `st-${st}`, `到 ${live}`)
        await c.screenOk(`狂點站牌 ${STATIONS[st]}`)
        // 站點裡的遊戲都在清單上
        const tiles = await page.evaluate(() => [...([...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document).querySelectorAll('.game-tile')].map((e) => e.getAttribute('aria-label')))
        const known = GAMES.filter((g) => g.station === st).map((g) => g.title)
        const missing = tiles.filter((t) => t && !known.includes(t))
        if (missing.length) await c.once(`catalog:${st}`, '小問題', `測試清單少了遊戲：${missing.join('、')}`, '請加進 tests/toddler/catalog.ts', false)
        if (live === `st-${st}`) await audit(k, c, `站點 ${STATIONS[st]}`)
        // 站點亂點（不點遊戲卡）
        k.behavior = `站點亂點 ${STATIONS[st]}`
        for (let i = 0; i < 5; i++) await k.tap({ x: k.r.range(5, 1195), y: k.r.chance(0.5) ? k.r.range(5, 140) : k.r.range(650, 795) }, '站點邊緣亂點')
        await c.flush()
        // 站點按住回地圖
        if ((await snap(page)).live === `st-${st}`) await holdHome(k, c, `站點 ${STATIONS[st]} 回地圖`)
      }
    } finally {
      finish(k, c, '地圖與站點')
    }
  })

  test('貼紙本', async ({ page }, info) => {
    test.skip(!want('collection'))
    const { k, c } = await setup(page, info, '貼紙本', { to: 'home' })
    try {
      k.behavior = '進貼紙本'
      const p = await center(page, '.home-dock [aria-label="我的朋友"]')
      await k.spam(p!, 4, '我的朋友')
      const live = await waitLive(page, (l) => l === 'collection')
      c.outcome('進貼紙本', live === 'collection', `到 ${live}`)
      if (live === 'collection') await audit(k, c, '貼紙本')
      k.behavior = '亂玩'
      const left = await play(k, c, 'collection', 20)
      c.outcome('貼紙本亂玩', !left.length, left.length ? `被帶到 ${left.join(',')}` : '')
      await alive(k, c, '貼紙本亂玩')
      k.behavior = '回首頁'
      if ((await snap(page)).live === 'collection') await holdHome(k, c, '貼紙本回首頁')
    } finally {
      finish(k, c, '貼紙本')
    }
  })

  test('家長閘門與家長區', async ({ page }, info) => {
    test.skip(!want('parent'))
    const { k, c } = await setup(page, info, '家長區', { to: 'home' })
    try {
      const vp = page.viewportSize()!
      // PARENT-2：孩子點右上角 10 下不會開閘門
      k.behavior = '孩子點右上角'
      for (let i = 0; i < 10; i++) {
        await k.tap({ x: vp.width - 30, y: 30 }, '右上角')
        await k.wait(100)
      }
      await k.wait(500)
      const early = await page.$('.gate')
      c.rule('PARENT-2', !early, early ? '點右上角 10 下就出現閘門' : '點 10 下沒有閘門；按住 3 秒才有（見下一項）')
      if (early) await k.tap({ x: 20, y: vp.height - 20 }, '關閘門')
      // 孩子按住右上角 3 秒
      k.behavior = '孩子按住右上角'
      await k.hold({ x: vp.width - 30, y: 30 }, 3300, '右上角')
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
      await k.hold({ x: vp.width - 30, y: 30 }, 3300, '右上角')
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
      await k.hold({ x: vp.width - 30, y: 30 }, 3300, '右上角')
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

  test('返回鍵在孩子畫面', async ({ page }, info) => {
    test.skip(!want('back'))
    const { k, c } = await setup(page, info, '返回鍵', { to: 'home' })
    try {
      const res: string[] = []
      const tryBack = async (name: string) => {
        await settle(page)
        const before = (await snap(page)).live
        k.act(`history.back() 在 ${before}`)
        await page.evaluate(() => history.back())
        await k.wait(1200)
        const after = (await snap(page)).live
        res.push(`${name}：${before === after ? '沒反應' : `→ ${after}`}`)
        await c.screenOk(`返回鍵 ${name}`)
        return before !== after
      }
      k.behavior = '返回鍵'
      await tryBack('首頁')
      await toMap(k, c)
      const map = await tryBack('地圖')
      // 新版返回手勢會回首頁：再回地圖
      await toMap(k, c)
      const p = await center(page, `.map-stop[aria-label="${STATIONS.math}"]`)
      await k.tap(p!, '站牌')
      await waitLive(page, (l) => l === 'st-math')
      const st = await tryBack('站點')
      // 遊戲裡的返回手勢、連點返回鍵：都只回一層（遊戲 → 站點）
      const g = GAMES.find((x) => x.id === 'm-match')!
      if (await enterGame(k, c, g)) {
        await k.wait(1500)
        await tryBack('遊戲')
        const live1 = (await snap(page)).live
        c.outcome('遊戲裡按返回手勢', live1 === 'st-math', `到 ${live1}（上一層是 st-math）`)
        if (await enterGame(k, c, g)) {
          await k.wait(1500)
          const h = await homeButton(page)
          if (h?.tap) {
            k.behavior = '連點返回鍵'
            await k.spam(h, 6, h.label)
            await k.wait(2000)
            await settle(page)
            const live2 = (await snap(page)).live
            c.outcome('遊戲裡連點返回鍵 6 下', live2 === 'st-math', `到 ${live2}（應只回一層到 st-math）`)
            if (live2 !== 'st-math') await c.once('back-spam', '無法返回', `連點返回鍵 6 下跑到 ${live2}`, '新版返回鍵設計是連點只回一層')
          }
        }
      }
      // B02：一根手指還按在畫面上（拖東西、手掌靠著），另一根手指點返回鍵：要回到站點
      k.behavior = '一指按著點返回'
      if (await enterGame(k, c, g)) {
        await k.wait(1500)
        const ok = await holdHome(k, c, '一指按著點返回', { second: [{ x: 600, y: 520 }, { x: 640, y: 490 }, { x: 690, y: 510 }] })
        const live3 = (await snap(page)).live
        c.outcome('B02 一指按著點返回', ok && live3 === 'st-math', `到 ${live3}（應回 st-math）`)
      }
      await c.flush()

      // B07：在地圖連點站牌，站點畫面出現後，後面幾下不能點進同一個位置的遊戲卡
      for (const [gid, n] of [['m-give', 8], ['p-solid', 9]] as const) {
        const gg = GAMES.find((x) => x.id === gid)
        if (!gg || !(await toMap(k, c))) continue
        k.behavior = `連點站牌 ${STATIONS[gg.station]}`
        const stop = await center(page, `.map-stop[aria-label="${STATIONS[gg.station]}"]`)
        if (!stop) continue
        await k.spam(stop, n, '站牌')
        await k.wait(1500)
        const live4 = (await snap(page)).live
        c.outcome(`B07 連點站牌 ${STATIONS[gg.station]} ${n} 下`, live4 === `st-${gg.station}`, `停在 ${live4}`)
        if ((live4 ?? '').startsWith('play-')) await c.once('spam-stop', '困惑', `連點站牌直接掉進遊戲「${live4!.slice(5)}」`, `在地圖連點「${STATIONS[gg.station]}」站牌 ${n} 下`)
        // 連點停下來之後，站點的遊戲卡要點得到
        await k.wait(600)
        const tile = await center(page, `.game-tile[aria-label="${gg.title}"]`)
        if (tile && live4 === `st-${gg.station}`) {
          await k.tap(tile, '遊戲卡')
          const live5 = await waitLive(page, (l) => l === `play-${gg.id}`, 3000)
          c.outcome('B07 之後點遊戲卡', live5 === `play-${gg.id}`, `到 ${live5}`)
        }
      }
      await c.flush()

      // B16：轉場中按返回（點遊戲卡後馬上點左上角），離開的畫面透明度只往一個方向變
      for (const ms of [60, 150, 260]) {
        k.behavior = `轉場中按返回 ${ms}ms`
        if (!(await toMap(k, c))) break
        await k.tap((await center(page, `.map-stop[aria-label="${STATIONS.math}"]`))!, '站牌')
        await waitLive(page, (l) => l === 'st-math')
        await settle(page)
        await k.wait(700)
        await c.flush()
        const before = c.stats.flips
        await k.tap((await center(page, `.game-tile[aria-label="${g.title}"]`))!, '遊戲卡')
        await k.wait(ms)
        const h = (await homeButton(page)) ?? { x: 72, y: 64, label: '', tap: true }
        await pressBack(k, h, '轉場中點左上角')
        const live6 = await waitLive(page, (l) => l === 'st-math', 3000)
        await k.wait(800)
        await c.flush()
        c.outcome(`B16 轉場中按返回（點卡後 ${ms}ms）`, live6 === 'st-math' && c.stats.flips === before, `到 ${live6}；透明度來回 ${c.stats.flips - before} 次`)
      }

      if (!map && !st)
        await c.once('back-swallowed', '無法返回', 'Android 返回鍵在孩子畫面一律沒反應', `${res.join('；')}。lock.ts 刻意吃掉返回（防誤觸），但孩子想回上一頁時按返回不會有任何反應，只能找左上角並「按住」`, false)
      c.outcome('返回鍵', true, res.join('；'))
      await c.flush()
    } finally {
      finish(k, c, '返回鍵')
    }
  })

  test('今日冒險每一段都能返回（B04、V-32）', async ({ page }, info) => {
    test.skip(!want('back') && !want('adventure-back'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '冒險返回', { to: 'home' })
    /** 點現在這一層的返回鍵（冒險裡面還有一疊自己的畫面，homeButton 找的是裡面那一層） */
    const tapBack = async (ctx: string, want: (l: string | null) => boolean, ms = 3000) => {
      const h = await homeButton(page)
      if (!h) {
        await c.once(`adv-noback:${ctx}`, '無法返回', `今日冒險「${ctx}」沒有返回鍵`, `畫面 ${(await snap(page)).live}`)
        return null
      }
      await pressBack(k, h, `${ctx}：${h.label}`)
      const live = await waitLive(page, want, ms)
      if (!want(live)) await c.once(`adv-back:${ctx}`, '無法返回', `今日冒險「${ctx}」點返回沒有回上一層`, `按鈕「${h.label}」，停在 ${live}`)
      return { live, label: h.label }
    }
    const start = async () => {
      await settle(page)
      await k.tap((await center(page, '.go-btn'))!, '出發')
      return waitLive(page, (l) => l === 'route' || (l ?? '').startsWith('travel-'), 5000)
    }
    try {
      k.behavior = '路線圖'
      let live = await start()
      c.outcome('出發到路線圖', live === 'route', `到 ${live}`)
      await settle(page, 3000)
      await audit(k, c, '冒險 路線圖')
      // 旁白卡（路線圖約 3 秒後自己往下走）
      k.behavior = '旁白卡按返回'
      live = await waitLive(page, (l) => (l ?? '').startsWith('travel-'), 12_000)
      const travel0 = live
      await settle(page, 2000)
      await audit(k, c, '冒險 旁白卡')
      let r = await tapBack('旁白卡', (l) => l === 'route')
      c.outcome('旁白卡按返回 → 路線圖', r?.live === 'route', `「${r?.label}」→ ${r?.live}`)
      // 返回的路線圖停著等孩子：不自己往下走，有「出發」
      await k.wait(5000)
      const stay = (await snap(page)).live
      const go2 = await center(page, '[aria-label="出發"]')
      c.outcome('返回的路線圖停著等孩子', stay === 'route' && !!go2, `5 秒後在 ${stay}，${go2 ? '有' : '沒有'}出發鍵`)
      if (stay !== 'route') await c.once('adv-autogo', '困惑', '按返回回到路線圖後又自己出發了', `5 秒後到 ${stay}`)
      await audit(k, c, '冒險 停著的路線圖')
      // 出發 → 同一站的旁白卡 → 遊戲；遊戲裡返回 → 路線圖
      k.behavior = '冒險遊戲按返回'
      if (go2) await k.tap(go2, '出發')
      live = await waitLive(page, (l) => (l ?? '').startsWith('travel-'), 5000)
      c.outcome('停著的路線圖按出發 → 同一站', live === travel0, `到 ${live}（原本 ${travel0}）`)
      live = await waitLive(page, (l) => (l ?? '').startsWith('play-'), 15_000)
      await k.wait(1500)
      r = await tapBack('遊戲', (l) => l === 'route')
      c.outcome('冒險遊戲按返回 → 路線圖', r?.live === 'route', `「${r?.label}」→ ${r?.live}`)
      // 路線圖按返回 → 首頁。孩子是看到路線圖之後才再按一次：剛返回的 1 秒內再按返回是「連點只回一層」，設計上不理（lib/nav.ts 的 BACK_LOCK_MS）
      k.behavior = '路線圖按返回'
      await settle(page)
      await k.wait(1200)
      r = await tapBack('路線圖', (l) => l === 'home')
      c.outcome('路線圖按返回 → 首頁', r?.live === 'home', `「${r?.label}」→ ${r?.live}`)
      await c.flush()

      // 第一站算走完（直接改存檔），再出發：小路線上看得到走過一站，接著走第二站
      k.behavior = '走完一站後再出發'
      const marked = await page.evaluate(
        () =>
          new Promise<boolean>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const db = rq.result
              const tx = db.transaction('kv', 'readwrite')
              const st = tx.objectStore('kv')
              const all = st.getAll()
              all.onsuccess = () => {
                const row = (all.result as { key: string; value: { items: { done: boolean }[] } }[]).filter((x) => x.key.startsWith('plan:')).sort((a, b) => (a.key < b.key ? 1 : -1))[0]
                if (row) {
                  row.value.items[0].done = true
                  st.put(row)
                }
              }
              tx.oncomplete = () => {
                db.close()
                sessionStorage.setItem('dodo.resume', 'home')
                res(true)
              }
              tx.onerror = () => res(false)
            }
            rq.onerror = () => res(false)
          }),
      )
      if (marked) {
        await page.reload()
        await page.waitForSelector('.screen.home', { timeout: 20_000 })
        await start()
        live = await waitLive(page, (l) => (l ?? '').startsWith('travel-'), 12_000)
        const chips = await page.evaluate(() => document.querySelectorAll('.route-chip.is-done').length)
        c.outcome('走完一站後再出發：接著走第二站', live === 'travel-1' && chips >= 1, `到 ${live}，小路線上走過的 ${chips} 站`)
        r = await tapBack('第二站旁白卡', (l) => l === 'route')
        c.outcome('第二站旁白卡按返回 → 路線圖', r?.live === 'route', `→ ${r?.live}`)
      }
      await c.flush()
    } finally {
      finish(k, c, '冒險返回')
    }
  })

  test('今日冒險', async ({ page }, info) => {
    test.skip(!want('adventure'))
    test.setTimeout(15 * 60_000)
    const { k, c } = await setup(page, info, '今日冒險', { to: 'home' })
    try {
      k.behavior = '出發'
      const go = await center(page, '.go-btn')
      await k.tap(go!, '出發')
      await waitLive(page, (l) => l !== 'home', 4000)
      // 冒險裡亂玩 4 分鐘：會經過路線、旁白卡、遊戲、蛋
      k.behavior = '冒險亂玩'
      const seen = new Set<string>()
      const end = Date.now() + 4 * 60_000
      let homeTested = false
      while (Date.now() < end) {
        const s = await snap(page)
        if (s.live) {
          const ph = s.live.replace(/-\d+$/, '')
          if (!seen.has(ph) && s.scenes.length <= 2) {
            seen.add(ph)
            await settle(page, 3000)
            if (!(await page.$('.cheer'))) await audit(k, c, `冒險 ${ph}`)
          }
        }
        if (s.live === 'home') {
          // 被帶回首頁（按到回首頁、或冒險結束）：再出發
          const g = await center(page, '.go-btn')
          if (!g) break
          await settle(page)
          await k.tap(g, '再出發')
          await waitLive(page, (l) => l !== 'home', 4000)
          continue
        }
        if (!homeTested && (s.live ?? '').startsWith('play-') && s.teaching) {
          homeTested = true
          k.behavior = '冒險遊戲教學中按首頁'
          await holdHome(k, c, '冒險遊戲教學中按首頁')
          k.behavior = '冒險亂玩'
          continue
        }
        await toddlerStep(k, c)
        if (k.r.chance(0.15)) await c.flush()
      }
      await c.flush()
      c.outcome('冒險亂玩 4 分鐘', true, `經過 ${[...seen].join('、')}`)
      await alive(k, c, '冒險亂玩')
      // 冒險中重新整理
      k.behavior = '冒險中重新整理'
      await page.reload()
      await page.waitForSelector('.scene', { timeout: 15_000 })
      const live = await waitLive(page, (l) => !!l)
      c.outcome('冒險中重新整理', !!live, `回到 ${live}`)
      await c.screenOk('冒險中重新整理')
      await c.flush()
    } finally {
      finish(k, c, '今日冒險')
    }
  })

  test('護眼休息', async ({ page }, info) => {
    test.skip(!want('eyebreak'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '護眼休息', { settings: { eyeBreakEvery: 1 } })
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
        await k.tap({ x: k.r.range(300, 900), y: k.r.range(700, 790) }, '地圖下方亂點')
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
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '睡覺畫面', { settings: { dailyMinutes: 1 } })
    try {
      k.behavior = '等時間到'
      const end = Date.now() + 100_000
      let live: string | null = null
      while (Date.now() < end) {
        live = (await snap(page)).live
        if (live === 'bedtime') break
        await k.tap({ x: k.r.range(300, 900), y: k.r.range(700, 790) }, '地圖下方亂點')
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
    const { k, c } = await setup(page, info, '減少動態效果')
    try {
      k.behavior = '換畫面'
      const g = GAMES.find((x) => x.id === 'm-match')!
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
    const { k, c } = await setup(page, info, '來回換畫面')
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
        return { z, sub: top(document.querySelector('.sub-pill')), corner: top(document.querySelector('.parent-corner')) }
      })
    }
    try {
      k.behavior = '地圖↔站點↔遊戲來回'
      let n = 0
      let bad = ''
      const checks: string[] = []
      const g = GAMES.find((x) => x.id === 'm-match')!
      for (let i = 0; n < 200 && i < 120; i++) {
        if (!(await toMap(k, c))) break
        n++
        const p = await center(page, `.map-stop[aria-label="${STATIONS.math}"]`)
        if (!p) break
        await k.tap(p, '站牌')
        if ((await waitLive(page, (l) => l === 'st-math')) !== 'st-math') break
        n++
        // 每三趟進一次遊戲（站點 → 遊戲 → 站點）
        if (i % 3 === 2) {
          await settle(page)
          await k.wait(400)
          const t = await center(page, `.game-tile[aria-label="${g.title}"]`)
          if (t) {
            await k.tap(t, '遊戲卡')
            if ((await waitLive(page, (l) => l === `play-${g.id}`)) === `play-${g.id}`) {
              n++
              await k.wait(600)
              const h = await homeButton(page)
              if (h) await pressBack(k, h)
              if ((await waitLive(page, (l) => l === 'st-math')) === 'st-math') n++
            }
          }
        }
        await settle(page)
        if (i % 7 === 6 || n >= 200) {
          const m = await measure()
          checks.push(`${n} 次：z ${m.z}、字幕${m.sub === null ? '沒出現' : m.sub ? '在上' : '被蓋'}、家長角落${m.corner ? '在上' : '被蓋'}`)
          if (!bad && (m.z > 10 || m.sub === false || m.corner === false)) bad = checks[checks.length - 1]
        }
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
