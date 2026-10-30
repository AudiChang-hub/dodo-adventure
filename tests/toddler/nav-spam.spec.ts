import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, pressBack, toMap, waitLive } from './lib/flows'
import { GAMES, STATIONS, type StationId } from './catalog'

/**
 * 換畫面時的連點穿透（T-67）：連點的後面幾下不能落到新畫面同一個位置的東西上。
 * 每一段都跑兩次：平常、平板忙（換畫面那一下之後主執行緒卡 1.2 秒）。
 * 以前 B07 只在機器很忙的時候偶爾出現：卡住的時候排隊的連點、和畫面一出現就按下去的那幾下被當成新的點擊（ui/Scenes.tsx 的 Gate）。
 * 1. 地圖連點站牌 → 停在站點，沒有掉進遊戲。
 * 2. 連點停下來之後，正常點一下站牌底下那張遊戲卡 → 一次就進得去。
 * 3. 站點連點遊戲卡 → 進那一個遊戲，連點的後面幾下沒有變成作答。
 * 4. 遊戲裡點返回鍵、又在同一處連點 → 只回一層（站點）。
 * 5. 首頁連點「地圖」→ 停在地圖，沒有掉進站點。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (st: StationId) =>
  !only.length || only.some((s) => s === 'screens' || s === 'nav-spam' || s === st || GAMES.some((g) => g.id === s && g.station === st))
const STALL_MS = 1200

/** 平板忙：下一次 click 之後（換畫面的那一下），主執行緒卡 ms */
const stallAfterNextClick = (page: Page, ms: number) =>
  page.evaluate((ms) => {
    window.addEventListener(
      'click',
      () =>
        setTimeout(() => {
          const end = performance.now() + ms
          while (performance.now() < end);
        }, 0),
      { capture: true, once: true },
    )
  }, ms)

const centerIn = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const el = root.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, sel)

/** 現在畫面上，這一點底下的遊戲卡（沒有就第一張） */
const tileAt = (page: Page, p: Pt) =>
  page.evaluate(({ x, y }) => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
    const under = [...(root?.querySelectorAll<HTMLElement>('.game-tile') ?? [])].find((t) => {
      const r = t.getBoundingClientRect()
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    })
    const el = under ?? root?.querySelector<HTMLElement>('.game-tile')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, title: el.getAttribute('aria-label') ?? '', under: !!under }
  }, p)

const idOf = (title: string) => GAMES.find((g) => g.title === title)?.id ?? title

for (const st of Object.keys(STATIONS) as StationId[]) {
  if (!want(st)) continue
  const name = STATIONS[st]
  test(`換畫面連點穿透：${name}（${st}）`, async ({ page }, info) => {
    test.setTimeout(5 * 60_000)
    const seed = hashSeed(BASE_SEED, 'nav-spam', st, info.project.name)
    const k = new Toddler(page, info, seed, info.project.name)
    const c = new Checker(k, page)
    k.where = `換畫面連點／${name}`
    await boot(page, seed)
    await k.init()

    for (const stall of [0, STALL_MS]) {
      const busy = stall ? '（平板忙）' : ''

      // 1. 地圖連點站牌
      expect(await toMap(k, c)).toBe(true)
      await settle(page)
      k.behavior = `連點站牌${busy}`
      const stop = (await centerIn(page, `.map-stop[aria-label="${name}"]`))!
      const n = 6 + k.r.int(4)
      if (stall) await stallAfterNextClick(page, stall)
      await k.spam(stop, n, '站牌')
      await waitLive(page, (l) => l !== 'map', 4000)
      await k.wait(1500)
      const live1 = (await snap(page)).live
      c.outcome(`連點站牌 ${n} 下${busy}`, live1 === `st-${st}`, `停在 ${live1}`)
      if ((live1 ?? '').startsWith('play-')) await c.once(`spam-stop${busy}`, '困惑', `連點站牌直接掉進遊戲「${live1!.slice(5)}」${busy}`, `在地圖連點「${name}」站牌 ${n} 下`)
      if (live1 !== `st-${st}`) continue

      // 2. 連點停下來之後，正常點一下站牌底下那張遊戲卡：一次就進得去
      k.behavior = `點一下遊戲卡${busy}`
      await k.wait(400)
      const tile = (await tileAt(page, stop))!
      const t0 = Date.now()
      await k.tap(tile, `遊戲卡 ${tile.title}`)
      const live2 = await waitLive(page, (l) => l === `play-${idOf(tile.title)}`, 3000)
      const in1 = live2 === `play-${idOf(tile.title)}`
      c.outcome(`連點停了之後點一下${tile.under ? '站牌底下的' : ''}遊戲卡${busy}`, in1, in1 ? `${Date.now() - t0} ms 進到 ${live2}` : `停在 ${live2}`)
      if (!in1) await c.once(`one-tap${busy}`, '卡死', `連點停了之後點一下遊戲卡沒有進去${busy}`, `點「${tile.title}」後停在 ${live2}`)

      // 3. 回站點，連點遊戲卡：進那一個遊戲，連點的後面幾下不會變成作答
      if (in1) {
        await pressBack(k, (await homeButton(page))!)
        await waitLive(page, (l) => l === `st-${st}`, 4000)
      }
      await settle(page)
      await k.wait(600)
      k.behavior = `連點遊戲卡${busy}`
      const tile2 = (await tileAt(page, stop))!
      const before = (await attempts(page)).length
      if (stall) await stallAfterNextClick(page, stall)
      await k.spam(tile2, 6 + k.r.int(4), `遊戲卡 ${tile2.title}`)
      await k.wait(1500)
      const live3 = (await snap(page)).live
      const added = (await attempts(page)).length - before
      const ok3 = live3 === `play-${idOf(tile2.title)}` && added === 0
      c.outcome(`連點遊戲卡${busy}`, ok3, `到 ${live3}，連點記了 ${added} 題`)
      if (live3 === `play-${idOf(tile2.title)}` && added) await c.once(`spam-answer${busy}`, '誤記作答', `連點遊戲卡的後面幾下變成作答${busy}`, `連點「${tile2.title}」，進遊戲後記了 ${added} 題`, false)
      else if (live3 !== `play-${idOf(tile2.title)}`) await c.once(`spam-tile${busy}`, '困惑', `連點遊戲卡沒有停在那個遊戲${busy}`, `連點「${tile2.title}」後停在 ${live3}`)

      // 4. 遊戲裡點返回鍵，又在同一處連點：只回一層
      if ((live3 ?? '').startsWith('play-')) {
        k.behavior = `連點返回鍵${busy}`
        const h = (await homeButton(page))!
        if (stall) await stallAfterNextClick(page, stall)
        await k.spam(h, 4 + k.r.int(3), '返回鍵')
        await k.wait(1500)
        const live4 = (await snap(page)).live
        c.outcome(`遊戲裡連點返回鍵${busy}`, live4 === `st-${st}`, `到 ${live4}（應只回一層到 st-${st}）`)
        if (live4 !== `st-${st}`) await c.once(`back-spam${busy}`, '無法返回', `遊戲裡連點返回鍵跑到 ${live4}${busy}`, '連點返回只回一層')
      }

      // 5. 首頁連點「地圖」
      expect(await toMap(k, c)).toBe(true)
      await settle(page)
      await pressBack(k, (await homeButton(page))!)
      await waitLive(page, (l) => l === 'home', 4000)
      await settle(page)
      await k.wait(1100)
      k.behavior = `首頁連點地圖${busy}`
      const dock = await centerIn(page, '.home-dock [aria-label="地圖"]')
      if (dock) {
        if (stall) await stallAfterNextClick(page, stall)
        await k.spam(dock, 6 + k.r.int(4), '地圖')
        await waitLive(page, (l) => l !== 'home', 4000)
        await k.wait(1500)
        const live5 = (await snap(page)).live
        c.outcome(`首頁連點地圖${busy}`, live5 === 'map', `停在 ${live5}`)
        if (live5 !== 'map') await c.once(`spam-dock${busy}`, '困惑', `首頁連點「地圖」沒有停在地圖${busy}`, `停在 ${live5}`)
      }
    }

    await c.flush()
    k.save(`screen-nav-spam-${st}`, { screen: `換畫面連點／${name}`, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
    expect.soft(k.findings.map((f) => `${f.severity}：${f.title}`), '全部問題').toEqual([])
  })
}
