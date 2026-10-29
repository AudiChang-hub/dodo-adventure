import { test, expect } from '@playwright/test'
import { boot, homeButton, settle, snap, targets } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, alive, attemptsSince, audit, pressBack, background, checkDoubleRecords, enterGame, grabDuringTeach, holdHome, idle, reload, toMap, toddlerStep, waitLive, wrongMany } from './lib/flows'
import { DRAWING, STATIONS, selected } from './catalog'

const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)

/**
 * 每個遊戲：一個三歲小孩從地圖進去，依序做這些事（同一個 seed 動作一樣）：
 * 連點進場 → 搶著操作 → 亂玩 → 一直答錯 → 發呆 → 切背景 → 拖曳中按首頁 → 教學中按首頁 → 轉場中按首頁 → 返回鍵 → 重新整理
 */
for (const g of selected()) {
  test(`${g.id} ${g.title}`, async ({ page }, info) => {
    const lite = !!info.project.metadata?.lite
    const seed = hashSeed(BASE_SEED, g.id, info.project.name)
    const k = new Toddler(page, info, seed, info.project.name)
    const c = new Checker(k, page)
    k.where = `${STATIONS[g.station]}／${g.title}（${g.id}）`
    await boot(page, seed)
    await k.init()
    const drawing = DRAWING.has(g.kind)

    try {
      // 1. 連點進場：站牌、遊戲卡各狂點
      k.behavior = '連點進場'
      const entered = await enterGame(k, c, g, { spam: true })
      c.outcome('連點進場', entered, entered ? '進到遊戲' : '沒進去')
      if (!entered) return
      await c.screenOk('連點進場')
      await c.flush()

      // 2. 搶著操作（教學卡、示範、說明語音）
      await grabDuringTeach(k, c, g)
      if ((await snap(page)).live === `play-${g.id}`) await audit(k, c, `${g.id} 作答中`)

      // 3. 亂玩：亂點、連點、拖到一半放手、手掌、亂畫
      k.behavior = '亂玩'
      const steps = lite ? 14 : 30
      let cheerSeen = false
      for (let i = 0; i < steps; i++) {
        const s = await snap(page)
        if (!(s.live ?? '').startsWith('play-')) {
          // 玩完了（回到站點）或被帶走：記下來、再進去
          k.act(`離開遊戲到 ${s.live}`)
          if (s.live === `st-${g.station}`) c.outcome('玩完一局', true, `第 ${i} 步回到站點`)
          if (!(await enterGame(k, c, g))) break
          continue
        }
        if (s.cheer && !cheerSeen) {
          cheerSeen = true
          // 慶祝中按首頁
          k.behavior = '慶祝中按首頁'
          await holdHome(k, c, '慶祝中按首頁')
          if (!(await enterGame(k, c, g))) break
          k.behavior = '亂玩'
          continue
        }
        await toddlerStep(k, c, { drawing, free: g.kind === 'coloring' || g.kind === 'free' })
        if (i % 6 === 5) {
          await c.flush()
          await c.screenOk('亂玩')
        }
      }
      const okPlay = await alive(k, c, '亂玩')
      const dup = await checkDoubleRecords(k, c)
      c.outcome('亂玩', okPlay, `${steps} 個動作，作答紀錄 ${dup.rows} 筆、重複 ${dup.dup}`)
      await c.flush()

      // 4. 一直答錯（有選項的遊戲才有意義，其他遊戲照樣亂點）
      if (!(await ensureIn(k, c, g))) return
      await wrongMany(k, c, lite ? 15_000 : 35_000)

      // 5. 發呆
      if (!lite) {
        if (!(await ensureIn(k, c, g))) return
        await idle(k, c, 75_000)
      }

      // 6. 切到背景再回來
      if (!(await ensureIn(k, c, g))) return
      await background(k, c)

      // 7. 拖曳中（另一根手指）按首頁
      if (!(await ensureIn(k, c, g))) return
      k.behavior = '拖曳中按首頁'
      {
        const ts = await targets(page)
        const src = ts.find((t) => t.kind === 'drag') ?? ts.find((t) => t.kind === 'canvas') ?? ts.find((t) => t.kind === 'btn')
        const p0 = src ? { x: src.x, y: src.y } : { x: 600, y: 450 }
        await holdHome(k, c, '拖曳中按首頁', { second: [p0, { x: p0.x + 40, y: p0.y - 30 }, { x: p0.x + 90, y: p0.y - 10 }] })
      }

      // 8. 一進遊戲（教學、說明語音中）就按首頁
      k.behavior = '教學中按首頁'
      if (await enterGame(k, c, g)) {
        // MOTION-4：一進遊戲就三歲亂點 1 秒，不該有作答
        const t1 = await page.evaluate(() => Date.now())
        for (let i = 0; i < 4; i++) await k.tap({ x: k.r.range(150, 1050), y: k.r.range(150, 750) }, '進場亂點')
        const rows = await attemptsSince(page, t1)
        const quiz = rows.filter((a) => a.phase !== 'teach')
        c.rule('MOTION-4', !quiz.length, `進遊戲 1 秒內亂點 4 下：作答紀錄 ${quiz.length} 筆`)
        if (quiz.length) await c.once('motion4', '誤記作答', `一進遊戲就亂點被記成作答（${quiz.length} 筆）`, quiz.map((a) => `${a.phase} ${a.itemId}`).join('；'))
        await k.wait(600)
        const s = await snap(page)
        k.act(`狀態 ${s.teaching ?? s.phase ?? '說明中'}，說話中 ${s.speaking}`)
        await holdHome(k, c, `教學中按首頁（${s.teaching ?? (s.speaking ? '說明語音' : '題目')}）`)
        const back = (await snap(page)).live
        c.rule('NAV-2', back === `st-${g.station}`, `遊戲裡按返回到 ${back}（準則：回站點 st-${g.station}）`)
      }

      // 9. 轉場中按首頁：點遊戲卡後馬上按住左上角
      k.behavior = '轉場中按首頁'
      if (await toMap(k, c)) {
        const stop = await page.evaluate((name) => {
          const el = document.querySelector(`.map-stop[aria-label="${name}"]`)
          const r = el!.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }, STATIONS[g.station])
        await k.tap(stop, '站牌')
        await waitLive(page, (l) => l === `st-${g.station}`)
        await settle(page)
        const tile = await page.evaluate((title) => {
          const el = [...document.querySelectorAll('.scene')].filter((e) => !(e as HTMLElement).inert).pop()!.querySelector(`.game-tile[aria-label="${title}"]`)
          const r = el!.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }, g.title)
        await k.tap(tile, '遊戲卡')
        await k.wait(120)
        // 回首頁鈕的位置（遊戲和站點的左上角鈕在同一個地方）
        const h = (await homeButton(page)) ?? { x: 64, y: 57, label: '', tap: false }
        k.act(`轉場還在進行，${h.tap ? '點' : '按住'}左上角`)
        await pressBack(k, h, '轉場中按左上角')
        const live = await waitLive(page, (l) => l === 'home' || l === 'map' || l === `st-${g.station}`, 3000)
        const ok = live === 'home' || live === 'map' || live === `st-${g.station}`
        if (!ok) await c.once('home-transition', '無法返回', '轉場中按住左上角 1.5 秒沒有回去', `停在 ${live}；新畫面在轉場剛開始的 ${'ARM_MS'} 內不收點擊，孩子按下去的那一下被吃掉，要再按一次`)
        c.outcome('轉場中按首頁', ok, ok ? `回到 ${live}` : `停在 ${live}，要再按一次`)
        await c.screenOk('轉場中按首頁')
        await c.flush()
      }

      // 10. 返回鍵（Android 返回、瀏覽器上一頁）
      k.behavior = '返回鍵'
      if (await enterGame(k, c, g)) {
        await k.wait(1500)
        k.act('history.back()')
        await page.evaluate(() => history.back())
        await k.wait(1500)
        const live = (await snap(page)).live
        c.outcome('返回鍵', live !== null, live === `play-${g.id}` ? '被吃掉（留在遊戲，lock.ts 的設計）' : `到 ${live}`)
        c.rule('NAV-4', live !== `play-${g.id}`, `遊戲裡 history.back() → ${live === `play-${g.id}` ? '沒反應' : live}`)
        await c.screenOk('返回鍵')
        await c.flush()

        // 11. 玩到一半重新整理
        await k.wait(500)
        for (let i = 0; i < 4; i++) await toddlerStep(k, c, { drawing, free: g.kind === 'coloring' || g.kind === 'free' })
        await reload(k, c)
      }
    } finally {
      await c.flush().catch(() => {})
      const st = c.stats
      c.rule('MOTION-1', st.zoomMin >= 0.95 && st.zoomMax <= 1.05 && st.cardZoomMin >= 0.95 && st.cardZoomMax <= 1.05, `整頁縮放 ${st.zoomMin}～${st.zoomMax}、題目層 ${st.cardZoomMin}～${st.cardZoomMax}（準則 0.95～1.05）`)
      k.save(`${g.id}`, { game: g, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
    }
    const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
    expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
    expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
  })
}

/** 確定在遊戲裡（玩完了、被帶走就再進去） */
async function ensureIn(k: Toddler, c: Checker, g: (typeof import('./catalog'))['GAMES'][number]) {
  const s = await snap(k.page)
  if (s.live === `play-${g.id}` && !s.cheer) return true
  return enterGame(k, c, g)
}
