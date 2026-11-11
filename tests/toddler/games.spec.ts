import { test, expect } from '@playwright/test'
import { boot, homeButton, inkAt, settle, snap, targets } from './lib/app'
import { Toddler, hashSeed, rng } from './lib/toddler'
import { Checker, alive, attemptsSince, audit, pressBack, background, checkDoubleRecords, doorAt, enterGame, grabDuringTeach, holdHome, idle, linesSince, midBack, reload, toHome, toddlerStep, waitLive, wrongMany } from './lib/flows'
import { DRAWING, STATIONS, selected } from './catalog'
import { HOME_GAMES, upOf } from './lib/features'

const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
/** 沒畫到該畫的地方時，線放開後會淡掉的遊戲（設計如此，墨跡門檻放寬，見 flows.ts toddlerStep） */
const FADING = new Set(['dots', 'trace', 'glyph'])

/**
 * 每個遊戲（現在只有首頁「畫畫」那一扇門進去的自由畫畫）：一個三歲小孩從首頁的門進去，依序做這些事（同一個 seed 動作一樣）：
 * 連點進場 → 搶著操作 → 亂玩 → 一直答錯 → 發呆 → 切背景 → 拖曳中按首頁 → 教學中按首頁 → 轉場中按首頁 → 返回鍵 → 重新整理
 */
for (const g of selected()) {
  test(`${g.id} ${g.title}`, async ({ page }, info) => {
    const lite = !!info.project.metadata?.lite
    const seed = hashSeed(BASE_SEED, g.id, info.project.name)
    const k = new Toddler(page, info, seed, info.project.name)
    const c = new Checker(k, page)
    k.where = `${STATIONS[g.station]}／${g.title}（${g.id}）`
    await boot(page, seed, { to: 'home' })
    await k.init()
    const up = upOf(g)
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
      // 亂玩到一半想回去（T-72）：亂點不會剛好按到返回了，改成用 seed 決定第幾步、一定會發生；回去之後像孩子一樣再點遊戲卡進來
      const backAt = 2 + rng(hashSeed(seed, 'mid-back')).int(steps - 4)
      let backDone = false
      let cheerSeen = false
      for (let i = 0; i < steps; i++) {
        const s = await snap(page)
        if (!(s.live ?? '').startsWith('play-')) {
          // 玩完了（回到站點）或被帶走：記下來、再進去
          k.act(`離開遊戲到 ${s.live}`)
          if (s.live === up) c.outcome('玩完一局', true, `第 ${i} 步回到 ${up}`)
          if (!(await enterGame(k, c, g))) break
          continue
        }
        if (s.rest) {
          // 慶祝看完、停在作品上（T-110）：先點一下畫紙（不該離開），再點大房子回去
          k.behavior = '停在作品上'
          const at = (sel: string) =>
            page.evaluate((sel) => {
              const r = document.querySelector(sel)?.getBoundingClientRect()
              return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
            }, sel)
          const paper = await at('.tool-room')
          if (paper) await k.tap(paper, '作品')
          await k.wait(800)
          const stay = await snap(page)
          c.outcome('停在作品上點畫紙不會離開', stay.live === `play-${g.id}` && stay.rest, `點畫紙後在 ${stay.live}`)
          if (stay.live !== `play-${g.id}`) await c.once('rest-stay', '困惑', '停在作品上點畫紙就被帶走了', `到 ${stay.live}`)
          const house = await at('[data-resting] .draw-home')
          if (house) await k.tap({ ...house, nav: true }, '大房子')
          const live = await waitLive(page, (l) => l === 'home', 4000)
          c.outcome('停在作品上點房子 → 首頁', live === 'home', `到 ${live}`)
          if (live !== 'home') await c.once('rest-home', '無法返回', '停在作品上點大房子沒有回首頁', `停在 ${live}`)
          k.behavior = '亂玩'
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
        if (i >= backAt && !backDone) {
          backDone = true
          if (!(await midBack(k, c, g))) break
          k.behavior = '亂玩'
          continue
        }
        await toddlerStep(k, c, { drawing, free: g.kind === 'coloring' || g.kind === 'free', fading: FADING.has(g.kind) })
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
        c.rule('NAV-2', back === up, `遊戲裡按返回到 ${back}（準則：回上一層 ${up}）`)
      }

      // 9. 轉場中按首頁：點首頁的門後馬上按左上角
      k.behavior = '轉場中按首頁'
      if (await toHome(k, c)) {
        await settle(page)
        await k.wait(700)
        await k.tap((await doorAt(page, HOME_GAMES[g.id]))!, '首頁的門')
        await k.wait(120)
        const h = (await homeButton(page)) ?? { x: 64, y: 57, label: '', tap: true }
        k.act(`轉場還在進行，${h.tap ? '點' : '按住'}左上角`)
        await pressBack(k, h, '轉場中按左上角')
        const live = await waitLive(page, (l) => l === 'home', 3000)
        if (live !== 'home') await c.once('home-transition', '無法返回', '點門後轉場中按左上角沒有回首頁', `停在 ${live}`)
        c.outcome('轉場中按首頁', live === 'home', live === 'home' ? '回到首頁' : `停在 ${live}`)
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

        // 11. 玩到一半重新整理：返回鍵回到上一層了（自由畫畫是「選白紙還是著色本」，T-138），先再進遊戲
        if ((await snap(page)).live !== `play-${g.id}`) await enterGame(k, c, g)
        await k.wait(500)
        for (let i = 0; i < 4; i++) await toddlerStep(k, c, { drawing, free: g.kind === 'coloring' || g.kind === 'free', fading: FADING.has(g.kind) })
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

/**
 * T-127 自由畫畫的今天的世界（固定農場）：背景、印章、魔法筆。一個三歲小孩依序：
 * 連點印章鍵 → 連點畫紙蓋章 → 多指（手掌）蓋章 → 蓋章拖到一半放手（被系統搶走）→ 魔法筆亂畫 → 白紙鍵來回點
 * → 紙感螢幕（停下來時同時在動的東西 ≤ 1）→ 發呆（說今天的一句）→ 拿著印章按返回 → 畫完存檔（縮圖有背景）→ 世界關掉時照舊空白畫紙。
 */
for (const g of selected().filter((x) => x.kind === 'free')) {
  test(`${g.id} 今天的世界：印章、魔法筆`, async ({ page }, info) => {
    const lite = !!info.project.metadata?.lite
    const seed = hashSeed(BASE_SEED, g.id, 't127', info.project.name)
    const k = new Toddler(page, info, seed, info.project.name)
    const c = new Checker(k, page)
    k.where = `${STATIONS[g.station]}／${g.title}（${g.id}）今天的世界`
    // 固定今天是農場（today-world.ts 的測試覆寫），印章是牛、豬、小雞
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('t127.world')) localStorage.setItem('dodo:world', 'farm')
    })
    await boot(page, seed, { to: 'home' })
    await k.init()
    const up = upOf(g)
    const at = (sel: string) =>
      page.evaluate((sel) => {
        const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
        const r = root.querySelector(sel)?.getBoundingClientRect()
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top } : null
      }, sel)
    const attr = (sel: string, name: string) => page.evaluate(({ sel, name }) => document.querySelector(sel)?.getAttribute(name) ?? null, { sel, name })
    const count = async () => Number((await attr('.tool-stamp', 'data-count')) ?? -1)
    /** 畫紙上的一個亂數點（避開右上角的白紙鍵） */
    const spot = async () => {
      const r = (await at('.tool-room'))!
      return { x: r.left + r.w * k.r.range(0.12, 0.7), y: r.top + r.h * k.r.range(0.25, 0.85) }
    }

    try {
      k.behavior = '進場'
      if (!(await enterGame(k, c, g))) return
      await k.wait(1500)
      const bd = await attr('[data-backdrop]', 'data-backdrop')
      const hasStamp = !!(await at('.tool-stamp'))
      const brush = await attr('.tool-magic', 'data-brush')
      c.outcome('今天的世界', bd === 'farm' && hasStamp && !!brush, `背景 ${bd ?? '沒有'}、印章 ${hasStamp ? '有' : '沒有'}、魔法筆 ${brush ?? '沒有'}`)
      if (bd !== 'farm' || !hasStamp || !brush) await c.once('t127-tools', '困惑', '今天的世界：背景、印章或魔法筆沒出來', `背景 ${bd}、印章 ${hasStamp}、魔法筆 ${brush}`)
      if (!hasStamp) return

      // 1. 連點印章鍵：選到印章、不會壞（每多點一下換下一個角色）
      k.behavior = '連點印章'
      await k.spam((await at('.tool-stamp'))!, 6, '印章鍵')
      await k.wait(400)
      const on = (await attr('.tool-stamp', 'aria-pressed')) === 'true'
      c.outcome('連點印章鍵', on, on ? `選到印章，下一個是 ${await attr('.tool-stamp', 'data-stamp')}` : '沒選到印章')
      if (!on) await c.once('t127-stamp-on', '困惑', '連點印章鍵之後沒有選到印章', '')

      // 2. 連點畫紙：一下一個印章
      k.behavior = '連點蓋章'
      {
        const n0 = await count()
        const pts = [await spot(), await spot(), await spot(), await spot()]
        for (const p of pts) await k.spam(p, 1, '畫紙')
        await k.wait(400)
        const p5 = await spot()
        await k.spam(p5, 3, '畫紙同一個地方')
        await k.wait(400)
        const got = (await count()) - n0
        const ink = await inkAt(page, [...pts, p5])
        c.outcome('連點蓋章', got === 7 && ink > 0, `點了 7 下，蓋了 ${got} 個，墨 ${ink}`)
        if (got !== 7 || !ink) await c.once('t127-stamp-tap', '困惑', '點畫紙蓋印章的數量不對', `點 7 下蓋了 ${got} 個，點的地方墨 ${ink}`)
      }

      // 3. 多指蓋章（手掌、兩三根手指一起）：只蓋第一根手指那一個，不會卡住
      k.behavior = '多指蓋章'
      {
        const n0 = await count()
        const p = await spot()
        await k.palm([p, { x: p.x + 60, y: p.y + 30 }, { x: p.x - 50, y: p.y + 50 }], 400)
        await k.wait(400)
        const got = (await count()) - n0
        await k.tap(await spot(), '手掌之後再點一下')
        await k.wait(400)
        const after = (await count()) - n0 - got
        c.outcome('多指蓋章', got <= 1 && after === 1, `手掌一次蓋了 ${got} 個；之後點一下蓋了 ${after} 個`)
        if (got > 1) await c.once('t127-palm', '小問題', '手掌壓一下蓋了好幾個印章', `${got} 個`)
        if (after !== 1) await c.once('t127-palm-stuck', '卡死', '手掌壓過之後點畫紙蓋不出印章', `之後點一下蓋了 ${after} 個`)
      }

      // 4. 拖到一半放手（手指被系統手勢搶走）：挪一點點的印章留在放手的地方；
      //    拿著印章滑動（拖遠了）沿著手指一路蓋（T-132，家長：滑動也要印得出來），算蓋了一次；之後點一下照樣蓋得出來
      k.behavior = '蓋章拖到一半放手'
      {
        const n0 = await count()
        const a = await spot()
        await k.drag([a, { x: a.x + 20, y: a.y - 10 }, { x: a.x + 35, y: a.y + 5 }], { cancel: true, label: '挪一點點' })
        await k.wait(300)
        const nudge = (await count()) - n0
        const b = await spot()
        const line = [b, { x: b.x + 130, y: b.y - 40 }, { x: b.x + 260, y: b.y + 20 }]
        await k.drag(line, { cancel: true, label: '拖遠了' })
        await k.wait(300)
        const drew = (await count()) - n0 - nudge
        const ink = await inkAt(page, [line[1], line[2]])
        await k.tap(await spot(), '再點一下')
        await k.wait(400)
        const after = (await count()) - n0 - nudge - drew
        c.outcome('蓋章拖到一半放手', nudge === 1 && drew === 1 && ink > 0 && after === 1, `挪一點點被搶走：蓋了 ${nudge} 個；滑動：蓋了 ${drew} 次、沿路的墨 ${ink}；再點一下：蓋了 ${after} 個`)
        if (nudge !== 1 || after !== 1) await c.once('t127-cancel', '卡死', '蓋章拖到一半放手之後蓋不出來', `挪一點點 ${nudge} 個、之後點一下 ${after} 個`)
        if (!ink) await c.once('t127-stamp-line', '困惑', '拿著印章滑動，沿路沒有印出來', `蓋了 ${drew} 次、墨 ${ink}`)
      }

      // 5. 魔法筆亂畫：亂畫、手掌、連點，筆跡都在
      k.behavior = '魔法筆亂畫'
      {
        await k.tap((await at('.tool-magic'))!, '魔法筆')
        await k.wait(300)
        const on = (await attr('.tool-magic', 'aria-pressed')) === 'true'
        const room = (await at('.tool-room'))!
        const y = room.top + room.h * 0.5
        const line = [0.12, 0.2, 0.28, 0.36].map((f) => ({ x: room.left + room.w * f, y: y + (f * 400) % 60 }))
        await k.drag(line, { label: '魔法筆一筆' })
        const ink = await inkAt(page, line)
        // 對稱筆：右邊同一個高度也要有鏡像
        const mirror = brush === 'mirror' ? await inkAt(page, line.map((p) => ({ x: 2 * room.x - p.x, y: p.y }))) : null
        for (let i = 0; i < (lite ? 3 : 6); i++) {
          const p = await spot()
          if (i % 3 === 2) await k.palm([p, { x: p.x + 50, y: p.y + 40 }], 300)
          else await k.drag([p, await spot(), await spot()], { stepMs: 8 })
        }
        await k.spam(await spot(), 4, '魔法筆連點')
        const ok = on && ink > 0 && (mirror === null || mirror > 0)
        // 不用 alive()：它會去點畫面上的鍵（例如勾勾），畫畫就結束了，後面的白紙鍵就不在了
        await c.screenOk('魔法筆亂畫')
        c.outcome('魔法筆亂畫', ok, `魔法筆（${brush}）${on ? '選到' : '沒選到'}，筆跡墨 ${ink}${mirror === null ? '' : `、鏡像墨 ${mirror}`}`)
        if (!ok) await c.once('t127-magic', '困惑', '魔法筆畫不出來', `${brush}：選到 ${on}、墨 ${ink}、鏡像 ${mirror}`)
      }

      // 6. 白紙鍵來回點：背景拿掉、拿回來，畫的東西都留著
      k.behavior = '白紙鍵'
      white: {
        const p = await at('.draw-paper-btn')
        if (!p) {
          await c.once('t127-paper-btn', '困惑', '畫畫中看不到右上角的白紙鍵', `畫面 ${(await snap(page)).live}`)
          break white
        }
        const room = (await at('.tool-room'))!
        const probe = [0.12, 0.2, 0.28, 0.36].map((f) => ({ x: room.left + room.w * f, y: room.top + room.h * 0.5 + (f * 400) % 60 }))
        const ink0 = await inkAt(page, probe)
        await k.tap({ ...p, nav: true }, '白紙')
        await k.wait(300)
        const off = !(await at('[data-backdrop]'))
        await k.tap({ ...p, nav: true }, '再點一下白紙')
        await k.wait(300)
        const back = !!(await at('[data-backdrop]'))
        // 連點兩下：拿掉又拿回來，最後還是有背景、不會壞
        await k.spam({ ...p, nav: true }, 2, '白紙連點')
        await k.wait(300)
        const still = !!(await at('[data-backdrop]'))
        const ink1 = await inkAt(page, probe)
        c.outcome('白紙鍵', off && back && still && ink1 >= ink0 * 0.9, `點一下背景${off ? '拿掉' : '還在'}；再點一下${back ? '拿回來' : '沒有回來'}；連點兩下${still ? '還是有背景' : '背景不見了'}；筆跡墨 ${ink0} → ${ink1}`)
        if (!off) await c.once('t127-blank', '困惑', '點白紙鍵背景沒拿掉', '')
        if (ink1 < ink0 * 0.9) await c.once('t127-blank-ink', '困惑', '點白紙鍵把畫的東西弄掉了', `${ink0} → ${ink1}`)
      }

      // 7. 紙感螢幕（MOTION-2、DISPLAY-1）：停下來的時候，畫面上同時在動的東西 ≤ 1
      k.behavior = '紙感螢幕'
      {
        await k.wait(1500)
        let most = 0
        let what = ''
        for (let i = 0; i < 10; i++) {
          const r = await page.evaluate(() => {
            const run = document.getAnimations().filter((a) => a.playState === 'running')
            return { n: run.length, what: run.map((a) => ((a.effect as KeyframeEffect | null)?.target as Element | null)?.className?.toString().split(' ')[0] ?? '?').join(',') }
          })
          if (r.n > most) (most = r.n), (what = r.what)
          await k.wait(200)
        }
        c.rule('MOTION-2', most <= 1, `停下來 2 秒內同時在動的東西最多 ${most} 個${what ? `（${what}）` : ''}`)
        if (most > 1) await c.once('t127-motion', '小問題', '停下來的時候畫面上不只一樣東西在動', what)
      }

      // 8. 發呆：說今天的一句（不是「Draw anything you like!」）
      if (!lite) {
        k.behavior = '發呆'
        const t0 = await page.evaluate(() => performance.now())
        await k.wait(19_000, '完全不動')
        const vs = await linesSince(page, t0)
        const idea = vs.find((v) => /cow/i.test(v.text ?? ''))
        c.outcome('發呆說今天的一句', !!idea, vs.map((v) => `${Math.round((v.t - t0) / 1000)}s ${v.text}`).join('／') || '沒說話')
        if (!idea) await c.once('t127-idea', '困惑', '發呆時沒說今天的一句', vs.map((v) => v.text).join('／') || '沒說話')
      }

      // 9. 拿著印章、手指還按在畫紙上就按返回：回到上一層
      k.behavior = '印章中按返回'
      await k.tap((await at('.tool-stamp'))!, '印章')
      {
        const p0 = await spot()
        await holdHome(k, c, '印章中按返回', { second: [p0, { x: p0.x + 40, y: p0.y - 30 }] })
        const live = (await snap(page)).live
        c.rule('NAV-2', live === up, `印章中按返回到 ${live}（上一層 ${up}）`)
      }

      // 10. 畫完存檔：縮圖底下有今天的背景（淡色線稿的顏色），也有印章
      k.behavior = '存檔'
      if (await enterGame(k, c, g)) {
        await k.wait(1500)
        await k.tap((await at('.tool-stamp'))!, '印章')
        await k.tap(await spot(), '蓋一個')
        await k.tap(await spot(), '再蓋一個')
        await k.wait(800)
        await k.tap((await at('.tool-done'))!, '完成')
        await k.wait(2500)
        const thumb = await page.evaluate(
          () =>
            new Promise<{ line: number; color: number } | null>((res) => {
              const rq = indexedDB.open('dodo-adventure')
              rq.onerror = () => res(null)
              rq.onsuccess = () => {
                const db = rq.result
                const gq = db.transaction('drawings').objectStore('drawings').getAll()
                gq.onsuccess = async () => {
                  db.close()
                  const last = (gq.result as { ts: number; thumb: string }[]).sort((a, b) => b.ts - a.ts)[0]
                  if (!last) return res(null)
                  const img = new Image()
                  img.src = last.thumb
                  await img.decode().catch(() => {})
                  const cv = document.createElement('canvas')
                  cv.width = img.naturalWidth
                  cv.height = img.naturalHeight
                  const ctx = cv.getContext('2d')!
                  ctx.drawImage(img, 0, 0)
                  const d = ctx.getImageData(0, 0, cv.width, cv.height).data
                  let line = 0
                  let color = 0
                  for (let i = 0; i < d.length; i += 4) {
                    const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
                    // 線稿 #D9CDB8
                    if (Math.abs(r - 0xd9) < 14 && Math.abs(g - 0xcd) < 14 && Math.abs(b - 0xb8) < 14) line++
                    // 印章（牛、豬、小雞）的鮮豔顏色
                    else if (Math.max(r, g, b) - Math.min(r, g, b) > 80) color++
                  }
                  res({ line, color })
                }
                gq.onerror = () => res(null)
              }
            }),
        )
        const ok = !!thumb && thumb.line > 200 && thumb.color > 200
        c.outcome('存檔有背景和印章', ok, thumb ? `縮圖線稿像素 ${thumb.line}、鮮豔像素 ${thumb.color}` : '找不到作品')
        if (!ok) await c.once('t127-save', '困惑', '作品縮圖沒有今天的背景或印章', JSON.stringify(thumb))
      }

      // 11. 世界關掉（getTodayWorld 回 null）：照舊空白畫紙、沒有印章，魔法筆還在
      k.behavior = '沒有今天的世界'
      await page.evaluate(() => {
        sessionStorage.setItem('t127.world', 'off')
        localStorage.setItem('dodo:world', 'off')
      })
      if (await toHome(k, c)) {
        if (await enterGame(k, c, g)) {
          await k.wait(1500)
          const bd2 = await at('[data-backdrop]')
          const st2 = await at('.tool-stamp')
          const mg2 = await attr('.tool-magic', 'data-brush')
          const ok = !bd2 && !st2 && !!mg2 && mg2 !== 'trail'
          c.outcome('沒有今天的世界', ok, `背景 ${bd2 ? '有' : '沒有'}、印章 ${st2 ? '有' : '沒有'}、魔法筆 ${mg2}`)
          if (!ok) await c.once('t127-null', '困惑', '沒有今天的世界時畫紙不是照舊', `背景 ${!!bd2}、印章 ${!!st2}、魔法筆 ${mg2}`)
          const p = await spot()
          await k.drag([p, { x: p.x + 100, y: p.y + 40 }])
          const ink = await inkAt(page, [p])
          c.outcome('沒有世界照樣能畫', ink > 0, `墨 ${ink}`)
        }
      }
      await c.flush()
    } finally {
      await c.flush().catch(() => {})
      k.save(`${g.id}-t127`, { game: g, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
    }
    const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
    expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
    expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
  })
}

/**
 * T-132 自由畫畫的橡皮擦（家長 2026-11-11：「畫圖的地方要多橡皮擦的功能」）。一個三歲小孩依序：
 * 魔法筆、印章滑動（一路印出來）和點一下（只有一個），擦掉 → 畫一條線、蓋一個印章 → 連點橡皮擦 → 沿著線擦、擦印章（墨要真的不見，今天的背景還在）→ 擦到一半放手（被系統搶走）
 * → 手掌壓著擦 → 點顏色又能畫（畫在擦過的地方）→ 亂點工具和畫紙 → 擦的時候按返回 → 世界關掉時擦過再存檔（縮圖沒有透明的洞）。
 */
for (const g of selected().filter((x) => x.kind === 'free')) {
  test(`${g.id} 橡皮擦`, async ({ page }, info) => {
    const lite = !!info.project.metadata?.lite
    const seed = hashSeed(BASE_SEED, g.id, 't132', info.project.name)
    const k = new Toddler(page, info, seed, info.project.name)
    const c = new Checker(k, page)
    k.where = `${STATIONS[g.station]}／${g.title}（${g.id}）橡皮擦`
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('t132.world')) localStorage.setItem('dodo:world', 'farm')
    })
    await boot(page, seed, { to: 'home' })
    await k.init()
    const up = upOf(g)
    const at = (sel: string, i = 0) =>
      page.evaluate(
        ({ sel, i }) => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
          const r = root.querySelectorAll(sel)[i]?.getBoundingClientRect()
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top } : null
        },
        { sel, i },
      )
    const pressed = (sel: string) => page.evaluate((sel) => document.querySelector(sel)?.getAttribute('aria-pressed') === 'true', sel)
    /** 選到的顏色有幾個 */
    const colorsOn = () => page.evaluate(() => document.querySelectorAll('.tool-col .tool[aria-label="顏色"][aria-pressed="true"]').length)
    const room = async () => (await at('.tool-room'))!
    /** 畫紙上一條橫線（f 是畫紙高度的比例），點落在畫紙左邊大半（避開右上角的白紙鍵） */
    const lineAt = async (f: number) => {
      const r = await room()
      return [0.12, 0.22, 0.32, 0.42, 0.52].map((x) => ({ x: r.left + r.w * x, y: r.top + r.h * f }))
    }
    const spot = async () => {
      const r = await room()
      return { x: r.left + r.w * k.r.range(0.12, 0.7), y: r.top + r.h * k.r.range(0.25, 0.85) }
    }
    const eraser = async () => (await at('.tool-eraser'))!
    const color = async (i: number) => (await at('.tool-col .tool[aria-label="顏色"]', i))!

    try {
      k.behavior = '進場'
      if (!(await enterGame(k, c, g))) return
      await k.wait(1500)
      if (!(await at('.tool-eraser'))) {
        await c.once('t132-tool', '困惑', '工具欄上找不到橡皮擦', '')
        return
      }

      // 0. 魔法筆、印章：滑動一路印出來，點一下只有一個；橡皮擦擦得掉（家長 2026-11-11：滑動也要印得出來，不然只能一直點）
      k.behavior = '魔法筆、印章滑動'
      slide: {
        /** 沿著 pts 每 10 px 取一個點，回傳有墨的比例、頭尾四分之一各有沒有墨 */
        const cover = async (pts: { x: number; y: number }[]) => {
          const ss: { x: number; y: number }[] = []
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1]
            const b = pts[i]
            const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 10))
            for (let j = 0; j < n; j++) ss.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n })
          }
          const got: boolean[] = []
          for (const p of ss) got.push((await inkAt(page, [p])) > 0)
          const q = Math.max(1, Math.floor(got.length / 4))
          return { ratio: got.filter(Boolean).length / got.length, head: got.slice(0, q).some(Boolean), tail: got.slice(-q).some(Boolean) }
        }
        /** 點一下：點的地方有墨，四周 120 px 外沒有（只有一個） */
        const single = async (p: { x: number; y: number }) => {
          const here = await inkAt(page, [p])
          const around = await inkAt(page, [
            { x: p.x - 120, y: p.y },
            { x: p.x + 120, y: p.y },
            { x: p.x, y: p.y - 120 },
            { x: p.x, y: p.y + 120 },
          ])
          return { here, around }
        }
        const brushNow = await page.evaluate(() => document.querySelector('.tool-magic')?.getAttribute('data-brush') ?? '')
        const tools = [{ sel: '.tool-magic', name: `魔法筆（${brushNow}）` }, ...((await at('.tool-stamp')) ? [{ sel: '.tool-stamp', name: '印章' }] : [])]
        /** 垃圾桶點兩下：畫紙清乾淨，下一支筆從空白開始 */
        const wipe = async () => {
          await k.tap((await at('.tool-clear'))!, '垃圾桶')
          await k.wait(800)
          await k.tap((await at('.tool-clear'))!, '再點一下垃圾桶')
          await k.wait(400)
        }
        for (const t of tools) {
          const btn = await at(t.sel)
          if (!btn) break slide
          await k.tap(btn, t.name)
          await k.wait(200)
          // 滑動在畫紙左邊上半；點一下在右邊中間（離滑動的那條、對稱筆的鏡像都遠）
          const path = await lineAt(0.3)
          await k.drag(path, { label: `${t.name}滑動` })
          await k.wait(300)
          const cv = await cover(path)
          const r = await room()
          const tapAt = { x: r.left + r.w * 0.85, y: r.top + r.h * 0.62 }
          await k.tap(tapAt, `${t.name}點一下`)
          await k.wait(300)
          const one = await single(tapAt)
          const ok = cv.ratio >= 0.5 && cv.head && cv.tail && one.here > 0 && one.around === 0
          c.outcome(`${t.name}滑動、點一下`, ok, `滑動：沿路 ${Math.round(cv.ratio * 100)}% 有墨（頭${cv.head ? '有' : '沒有'}、尾${cv.tail ? '有' : '沒有'}）；點一下：那裡的墨 ${one.here}、四周 ${one.around}`)
          if (!(cv.ratio >= 0.5 && cv.head && cv.tail)) await c.once(`t132-slide-${t.sel}`, '困惑', `${t.name}滑動的時候沒有一路印出來`, `沿路 ${Math.round(cv.ratio * 100)}%、頭 ${cv.head}、尾 ${cv.tail}`)
          if (!(one.here > 0 && one.around === 0)) await c.once(`t132-tap-${t.sel}`, '困惑', `${t.name}點一下不是剛好一個`, `那裡 ${one.here}、四周 ${one.around}`)
          // 橡皮擦擦得掉：滑動印的、點一下的
          await k.tap(await eraser(), '橡皮擦')
          await k.drag(path, { label: '擦掉滑動印的' })
          await k.drag([{ x: tapAt.x - 30, y: tapAt.y }, { x: tapAt.x + 30, y: tapAt.y }], { label: '擦掉點一下的' })
          await k.wait(300)
          const left = (await inkAt(page, path)) + (await inkAt(page, [tapAt]))
          c.outcome(`橡皮擦擦掉${t.name}`, left === 0, `擦過以後沿路和點的地方的墨 ${left}`)
          if (left) await c.once(`t132-erase-${t.sel}`, '困惑', `橡皮擦擦不掉${t.name}印的`, `剩下的墨 ${left}`)
          // 拿著這支筆亂滑、多指、手掌：不會出錯
          await k.tap(btn, t.name)
          for (let i = 0; i < (lite ? 3 : 6); i++) {
            if (i % 3 === 2) await k.palm([await spot(), await spot(), await spot()], 250)
            else await k.drag([await spot(), await spot(), await spot()], { stepMs: 8, cancel: i === 1 })
          }
          await c.screenOk(`${t.name}亂滑`)
          await wipe()
        }
      }

      // 1. 先畫一條線、蓋一個印章
      k.behavior = '畫線、蓋章'
      const line = await lineAt(0.4)
      await k.tap(await color(4), '藍色')
      await k.drag(line, { label: '畫一條線' })
      const stampAt = (await lineAt(0.75))[2]
      const hasStamp = !!(await at('.tool-stamp'))
      if (hasStamp) {
        await k.tap((await at('.tool-stamp'))!, '印章')
        await k.tap(stampAt, '蓋一個')
      }
      await k.wait(400)
      const ink0 = await inkAt(page, line)
      const stamp0 = hasStamp ? await inkAt(page, [stampAt]) : 0
      c.outcome('畫線、蓋章', ink0 > 0 && (!hasStamp || stamp0 > 0), `線上的墨 ${ink0}、印章的墨 ${stamp0}`)

      // 2. 連點橡皮擦：選到橡皮擦，顏色、印章、魔法筆都沒有選到（看得出現在拿的不是蠟筆）
      k.behavior = '連點橡皮擦'
      await k.spam(await eraser(), lite ? 3 : 6, '橡皮擦')
      await k.wait(300)
      {
        const on = await pressed('.tool-eraser')
        const others = (await colorsOn()) + ((await pressed('.tool-stamp')) ? 1 : 0) + ((await pressed('.tool-magic')) ? 1 : 0)
        c.outcome('連點橡皮擦', on && others === 0, `橡皮擦${on ? '選到' : '沒選到'}，同時選到的其他工具 ${others} 個`)
        if (!on || others) await c.once('t132-on', '困惑', '點橡皮擦之後看不出選到橡皮擦', `橡皮擦 ${on}、其他 ${others}`)
      }

      // 3. 沿著線擦、擦印章：墨真的不見，今天的背景還在
      k.behavior = '擦掉'
      {
        // 三歲擦得歪歪的：上下晃 12 px 也要擦得到
        await k.drag(
          line.map((p, i) => ({ x: p.x, y: p.y + (i % 2 ? 12 : -12) })),
          { label: '沿著線擦' },
        )
        if (hasStamp) await k.drag([{ x: stampAt.x - 20, y: stampAt.y }, { x: stampAt.x + 20, y: stampAt.y + 6 }], { label: '擦印章' })
        await k.wait(300)
        const ink1 = await inkAt(page, line)
        const stamp1 = hasStamp ? await inkAt(page, [stampAt]) : 0
        const bd = !!(await at('[data-backdrop]'))
        const ok = ink1 === 0 && stamp1 === 0 && bd
        c.outcome('擦掉', ok, `線上的墨 ${ink0} → ${ink1}；印章的墨 ${stamp0} → ${stamp1}；今天的背景${bd ? '還在' : '不見了'}`)
        if (ink1 || stamp1) await c.once('t132-erase', '困惑', '用橡皮擦擦過，畫的東西還在', `線 ${ink0} → ${ink1}、印章 ${stamp0} → ${stamp1}`)
        if (!bd) await c.once('t132-backdrop', '困惑', '用橡皮擦之後今天的背景不見了', '')
      }

      // 4. 擦到一半放手（手指被系統手勢搶走）：擦過的地方照樣擦掉，之後還能擦
      k.behavior = '擦到一半放手'
      {
        await k.tap(await color(0), '紅色')
        const l2 = await lineAt(0.6)
        await k.drag(l2, { label: '再畫一條' })
        const before = await inkAt(page, l2)
        await k.tap(await eraser(), '橡皮擦')
        await k.drag(l2.slice(0, 3), { cancel: true, label: '擦到一半被搶走' })
        await k.wait(300)
        const half = await inkAt(page, l2.slice(0, 3))
        await k.drag(l2.slice(2), { label: '再擦另一半' })
        await k.wait(300)
        const rest = await inkAt(page, l2)
        const ok = before > 0 && half === 0 && rest === 0
        c.outcome('擦到一半放手', ok, `墨 ${before}；被搶走的那一半 ${half}；再擦完 ${rest}`)
        if (!ok) await c.once('t132-cancel', '卡死', '擦到一半放手之後擦不掉', `墨 ${before} → 一半 ${half} → 全部 ${rest}`)
      }

      // 5. 手掌壓著擦、多指：不會壞
      k.behavior = '手掌擦'
      for (let i = 0; i < (lite ? 2 : 4); i++) {
        const p = await spot()
        await k.palm([p, { x: p.x + 60, y: p.y + 30 }, { x: p.x - 40, y: p.y + 50 }], 300)
      }
      await c.screenOk('手掌擦')

      // 6. 點顏色：回到畫筆，畫在擦過的地方照樣出墨
      k.behavior = '點顏色又能畫'
      {
        await k.tap(await color(3), '綠色')
        await k.wait(200)
        const off = !(await pressed('.tool-eraser'))
        const on = (await colorsOn()) === 1
        await k.drag(line, { label: '在擦過的地方畫' })
        await k.wait(200)
        const ink = await inkAt(page, line)
        const ok = off && on && ink > 0
        c.outcome('點顏色又能畫', ok, `橡皮擦${off ? '放下了' : '還拿著'}、顏色${on ? '選到' : '沒選到'}；擦過的地方再畫墨 ${ink}`)
        if (!ok) await c.once('t132-back-to-pen', '困惑', '用過橡皮擦之後點顏色畫不出來', `橡皮擦 ${!off}、顏色 ${on}、墨 ${ink}`)
      }

      // 7. 亂點：橡皮擦和顏色換來換去，邊點邊畫、手掌、拖到一半放手（不能出錯、畫面不會壞）
      k.behavior = '亂點橡皮擦和顏色'
      {
        const n = lite ? 10 : 24
        for (let i = 0; i < n; i++) {
          const roll = k.r.int(6)
          if (roll === 0) await k.spam(await eraser(), 1 + k.r.int(3), '橡皮擦')
          else if (roll === 1) await k.tap(await color(k.r.int(7)), '顏色')
          else if (roll === 2) await k.palm([await spot(), await spot()], 200)
          else if (roll === 3) await k.spam(await spot(), 2, '畫紙')
          else await k.drag([await spot(), await spot(), await spot()], { stepMs: 8, cancel: roll === 4 && k.r.int(2) === 0 })
        }
        await k.wait(500)
        await c.screenOk('亂點橡皮擦和顏色')
        // 最後點一個顏色畫一筆：一定畫得出來
        await k.tap(await color(1), '橘色')
        const l3 = await lineAt(0.3)
        await k.drag(l3, { label: '亂點完畫一筆' })
        const ink = await inkAt(page, l3)
        c.outcome('亂點之後還能畫', ink > 0, `墨 ${ink}`)
        if (!ink) await c.once('t132-chaos', '卡死', '亂點橡皮擦和顏色之後畫不出來', '')
      }

      // 8. 拿著橡皮擦、手指還按在畫紙上就按返回：回到上一層
      k.behavior = '擦的時候按返回'
      await k.tap(await eraser(), '橡皮擦')
      {
        const p0 = await spot()
        await holdHome(k, c, '擦的時候按返回', { second: [p0, { x: p0.x + 40, y: p0.y - 30 }] })
        const live = (await snap(page)).live
        c.rule('NAV-2', live === up, `擦的時候按返回到 ${live}（上一層 ${up}）`)
      }

      // 9. 沒有今天的世界（空白畫紙）：畫一條、擦一段再存檔，縮圖擦掉的地方是紙色，不是透明的洞
      k.behavior = '擦過再存檔'
      await page.evaluate(() => {
        sessionStorage.setItem('t132.world', 'off')
        localStorage.setItem('dodo:world', 'off')
      })
      if ((await toHome(k, c)) && (await enterGame(k, c, g))) {
        await k.wait(1500)
        await k.tap(await color(6), '黑色')
        const l = await lineAt(0.5)
        await k.drag(l, { label: '畫一條' })
        await k.tap(await eraser(), '橡皮擦')
        await k.drag(l.slice(0, 2), { label: '擦一段' })
        await k.wait(800)
        await k.tap((await at('.tool-done'))!, '完成')
        await k.wait(2500)
        const thumb = await page.evaluate(
          () =>
            new Promise<{ holes: number; ink: number } | null>((res) => {
              const rq = indexedDB.open('dodo-adventure')
              rq.onerror = () => res(null)
              rq.onsuccess = () => {
                const db = rq.result
                const gq = db.transaction('drawings').objectStore('drawings').getAll()
                gq.onsuccess = async () => {
                  db.close()
                  const last = (gq.result as { ts: number; thumb: string }[]).sort((a, b) => b.ts - a.ts)[0]
                  if (!last) return res(null)
                  const img = new Image()
                  img.src = last.thumb
                  await img.decode().catch(() => {})
                  const cv = document.createElement('canvas')
                  cv.width = img.naturalWidth
                  cv.height = img.naturalHeight
                  const ctx = cv.getContext('2d')!
                  ctx.drawImage(img, 0, 0)
                  const d = ctx.getImageData(0, 0, cv.width, cv.height).data
                  let holes = 0
                  let ink = 0
                  for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] < 250) holes++
                    else if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) ink++
                  }
                  res({ holes, ink })
                }
                gq.onerror = () => res(null)
              }
            }),
        )
        const ok = !!thumb && thumb.holes === 0 && thumb.ink > 50
        c.outcome('擦過再存檔', ok, thumb ? `縮圖透明的洞 ${thumb.holes} 個像素、黑色的墨 ${thumb.ink}` : '找不到作品')
        if (!ok) await c.once('t132-save', '困惑', '用過橡皮擦的作品縮圖不對', JSON.stringify(thumb))
      }
      await c.flush()
    } finally {
      await c.flush().catch(() => {})
      k.save(`${g.id}-t132`, { game: g, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
    }
    const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
    expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
    expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
  })
}

/** 確定在遊戲裡（玩完了、被帶走就再進去） */
async function ensureIn(k: Toddler, c: Checker, g: (typeof import('./catalog'))['GAMES'][number]) {
  const s = await snap(k.page)
  if (s.live === `play-${g.id}` && !s.cheer && !s.rest) return true
  return enterGame(k, c, g)
}
