import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap, storyToldToday } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, alive, doorAt, enterGame, holdHome, linesSince, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'
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

  // 貼紙本（T-132，src/screens/StickerBook.tsx）：首頁牆上的貼紙板點進去，只看不改。
  // 有貼紙：每一張都在、最新的在最前面、點了會跳一下念名字；亂點、連點、多指、拖到一半放手都不出錯、不改資料；返回鍵點一下回首頁。
  // 沒有貼紙：本子上是虛線剪影、沒有字；返回鍵點一下回首頁。
  test('貼紙本', async ({ page }, info) => {
    test.skip(!want('stickers'))
    test.setTimeout(8 * 60_000)
    const { k, c } = await setup(page, info, '貼紙本', { to: 'home' })
    /** 寫進 n 張挑過的貼紙（舊 → 新，跟 lib/achievements 存的一樣），重新載入回首頁 */
    const seed = async (n: number) => {
      await page.evaluate(async (n) => {
        const ARTS = ['t-rex', 'rocket', 'lion', 'strawberry', 'rainbow', 'dolphin', 'fire-engine', 'teddy-bear', 'butterfly']
        await new Promise<void>((res, rej) => {
          const rq = indexedDB.open('dodo-adventure')
          rq.onerror = () => rej(rq.error)
          rq.onsuccess = () => {
            const db = rq.result
            const tx = db.transaction('kv', 'readwrite')
            const st = tx.objectStore('kv')
            const g = st.get('achieve')
            g.onsuccess = () => {
              const v = g.result?.value ?? { v: 2, best: {}, fixes: 0, picks: [], since: 0 }
              const t0 = Date.now() - n * 3_600_000
              const log = Array.from({ length: n }, (_, i) => ({ id: `stk-test-${i}`, ts: t0 + i * 3_600_000, date: '2026-11-01', kind: 'sticker', art: ARTS[i % ARTS.length], seed: 500 + i * 13, why: { round: 1, learn: 0, fix: 0, level: 0 } }))
              st.put({ key: 'achieve', value: { ...v, v: 2, log, seen: log.map((m) => m.id), since: 0 } })
            }
            tx.oncomplete = () => {
              db.close()
              res()
            }
            tx.onerror = () => rej(tx.error)
          }
        })
        sessionStorage.setItem('dodo.resume', 'home')
      }, n)
      await page.reload()
      await page.waitForSelector('.screen.home', { timeout: 20_000 })
      await settle(page)
    }
    /** 貼紙本裡的資料（achieve）有沒有被改：只看不改 */
    const achieve = () =>
      page.evaluate(
        () =>
          new Promise<string>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const db = rq.result
              const g = db.transaction('kv').objectStore('kv').get('achieve')
              g.onsuccess = () => {
                db.close()
                res(JSON.stringify(g.result?.value ?? null))
              }
            }
          }),
      )
    /** 現在這一層畫面 */
    const live = async () => (await snap(page)).live
    /** 點首頁的貼紙板進貼紙本 */
    const enter = async (ctx: string) => {
      if (!(await toHome(k, c))) return false
      const p = await doorAt(page, 'stickers')
      if (!p) {
        await c.once('no-board', '困惑', '首頁找不到貼紙板', '')
        return false
      }
      await k.tap(p, '貼紙板')
      const l = await waitLive(page, (x) => x === 'stickers', 5000)
      c.outcome(`${ctx}：點貼紙板進貼紙本`, l === 'stickers', `到 ${l}`)
      if (l !== 'stickers') await c.once(`enter:${ctx}`, '卡死', `點首頁的貼紙板沒有進貼紙本（${ctx}）`, `停在 ${l}`)
      await settle(page)
      return l === 'stickers'
    }
    /** 返回鍵點一下就回首頁 */
    const backOnce = async (ctx: string) => {
      await k.wait(1200)
      const h = await homeButton(page)
      if (!h) {
        await c.once(`noback:${ctx}`, '無法返回', `貼紙本沒有返回鍵（${ctx}）`, '')
        return
      }
      await pressBack(k, h, `${ctx}：${h.label}`)
      const l = await waitLive(page, (x) => x === 'home', 4000)
      c.outcome(`${ctx}：返回鍵點一下 → 首頁`, l === 'home', `到 ${l}`)
      if (l !== 'home') await c.once(`back:${ctx}`, '無法返回', `貼紙本點一下返回鍵沒有回首頁（${ctx}）`, `停在 ${l}`)
    }
    /** 貼紙本裡的貼紙（畫面上的順序） */
    const items = () =>
      page.evaluate(() => {
        const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
        return [...(root?.querySelectorAll<HTMLElement>('.sb-item') ?? [])].map((e) => ({ key: e.dataset.sticker ?? '', ts: Number(e.dataset.ts) }))
      })
    try {
      // ── 沒有貼紙 ──
      k.behavior = '沒有貼紙'
      await seed(0)
      if (await enter('沒有貼紙')) {
        const empty = await page.evaluate(() => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
          const album = root.querySelector<HTMLElement>('.sb-album')
          return { empty: !!root.querySelector('[data-empty]'), ghosts: root.querySelectorAll('.sb-ghost').length, items: root.querySelectorAll('.sb-item').length, text: (album?.innerText ?? '').trim() }
        })
        const ok = empty.empty && empty.ghosts > 0 && !empty.items && !empty.text
        c.outcome('沒有貼紙：虛線剪影、沒有字', ok, `剪影 ${empty.ghosts} 張、貼紙 ${empty.items} 張、字「${empty.text}」`)
        if (!ok) await c.once('empty', '困惑', '沒有貼紙時貼紙本不是空的剪影（或出現了字）', JSON.stringify(empty))

        // T-135（AI 小男生盲測 becf39a）：空的貼紙本點灰貼紙、點空白處、點豆豆都沒反應，32 秒就走了。
        // 要有引導（返回鍵那裡亮起來：去玩）、點哪裡都有回應（動一下＋豆豆說話）。
        k.behavior = '沒有貼紙：點灰貼紙、點空白、點豆豆'
        const hint = await page.evaluate(() => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
          return !!root.querySelector('.sb-back[data-hint] [data-back]')
        })
        c.outcome('沒有貼紙：返回首頁的鍵亮起來，帶他去玩', hint, hint ? '' : '沒有引導')
        if (!hint) await c.once('empty-hint', '困惑', '空的貼紙本沒有引導孩子去哪裡拿貼紙', '')
        await k.wait(5000)
        const where = await page.evaluate(() => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
          const mid = (e: Element | null) => {
            const r = e?.getBoundingClientRect()
            return r?.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
          }
          const a = root.querySelector('.sb-album')!.getBoundingClientRect()
          return { ghost: mid(root.querySelector('.sb-ghost')), blank: { x: a.right - 36, y: a.bottom - 36 }, dodo: mid(root.querySelector('.sb-host')) }
        })
        const nudges = () =>
          page.evaluate(() => {
            const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
            return Number(root.querySelector<HTMLElement>('[data-nudge]')?.dataset.nudge ?? 0)
          })
        const pokes: [string, { x: number; y: number } | null][] = [
          ['灰貼紙', where.ghost],
          ['本子的空白處', where.blank],
          ['豆豆', where.dodo],
        ]
        for (const [what, p] of pokes) {
          if (!p || (await live()) !== 'stickers') continue
          const n0 = await nudges()
          const t1 = await page.evaluate(() => performance.now())
          await k.tap(p, what)
          await k.wait(300)
          const moved = (await nudges()) > n0
          await k.wait(3500)
          const said = (await linesSince(page, t1)).map((l) => l.text ?? '')
          c.outcome(`沒有貼紙：點${what}有回應`, moved && said.length > 0, `動了 ${moved}；說了「${said.join('／')}」`)
          if (!moved || !said.length) await c.once(`poke:${what}`, '困惑', `空的貼紙本點${what}沒有回應`, `動了 ${moved}；語音 ${said.length} 句`)
        }

        k.behavior = '沒有貼紙：亂點、多指'
        for (let i = 0; i < 8; i++) {
          if ((await live()) !== 'stickers') break
          await toddlerStep(k, c)
        }
        await c.flush()
        if ((await live()) === 'stickers') await backOnce('沒有貼紙')
        await c.screenOk('沒有貼紙返回後')
      }

      // ── 有貼紙 ──
      const N = 14
      k.behavior = `有 ${N} 張貼紙`
      await seed(N)
      const board = await page.evaluate(() => document.querySelectorAll('.sticker-board .sbd-stk:not(.is-ghost)').length)
      c.outcome('首頁貼紙板露出最新的 3 張', board === 3, `${board} 張`)
      const before = await achieve()
      if (await enter('有貼紙')) {
        const list = await items()
        const newest = list.every((x, i) => !i || list[i - 1].ts >= x.ts)
        const ok = list.length === N && newest && list[0]?.key === `stk-test-${N - 1}`
        c.outcome(`有 ${N} 張：每一張都在、最新的在最前面`, ok, `${list.length} 張；第一張 ${list[0]?.key}；由新到舊 ${newest}`)
        if (!ok) await c.once('list', '困惑', '貼紙本沒有列出全部的貼紙，或最新的不在最前面', JSON.stringify(list.slice(0, 5)))

        // 點一張：跳一下（波紋）、念名字
        k.behavior = '點一張貼紙'
        await k.wait(1500)
        const first = await page.evaluate(() => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
          const r = root.querySelector('.sb-item')!.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })
        const t0 = await page.evaluate(() => performance.now())
        await k.tap(first, '第一張貼紙')
        await k.wait(250)
        const ring = await page.evaluate(() => !!document.querySelector('.sb-ring'))
        await k.wait(1800)
        const said = (await linesSince(page, t0)).map((l) => l.text ?? '')
        c.outcome('點一張：跳一下、念名字', ring && said.length > 0, `波紋 ${ring}；說了「${said.join('／')}」`)
        if (!ring || !said.length) await c.once('tap', '困惑', '點貼紙本裡的貼紙沒有反應', `波紋 ${ring}；語音 ${said.length} 句`)

        // T-139（AI 小男生盲測 becf39a、61ee1cf：點 8～9 張就說「一直點都一樣」「好多都在講話，我聽不懂」）：
        // 名字念單字三明治（有中文音檔的詞）；同一張再點換一個反應；不同種類的貼紙動作不一樣
        k.behavior = '同一張再點、點別種貼紙'
        await k.wait(2500)
        const allSaid0 = (await linesSince(page, t0)).map((l) => l.text ?? '')
        const zhSaid = allSaid0.some((t) => /[一-鿿]/.test(t))
        c.outcome('點一張：名字念中文三明治', zhSaid, `說了「${allSaid0.join('／')}」`)
        if (!zhSaid) await c.once('zh', '困惑', '貼紙的名字沒有念中文三明治（這個詞有中文音檔）', allSaid0.join('／'))
        /** 第 i 張貼紙現在的動作 */
        const moveOf = (i: number) =>
          page.evaluate((i) => {
            const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
            return root.querySelectorAll<HTMLElement>('.sb-item')[i]?.dataset.move ?? ''
          }, i)
        const move0 = await moveOf(0)
        const t2 = await page.evaluate(() => performance.now())
        await k.tap(first, '第一張貼紙（第二下）')
        await k.wait(300)
        const move1 = await moveOf(0)
        await k.wait(2500)
        const said2 = (await linesSince(page, t2)).map((l) => l.text ?? '')
        const changed = !!move1 && move1 !== move0 && said2.join('／') !== allSaid0.join('／')
        c.outcome('同一張點第二下：換一個反應', changed, `動作 ${move0} → ${move1}；第二下說「${said2.join('／')}」`)
        if (!changed) await c.once('same', '困惑', '同一張貼紙再點一次，反應跟第一次一樣', `動作 ${move0} → ${move1}`)
        const second = await page.evaluate(() => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
          const r = root.querySelectorAll('.sb-item')[1]!.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })
        await k.tap(second, '第二張貼紙（別種）')
        await k.wait(300)
        const moveB = await moveOf(1)
        const differ = !!moveB && moveB !== move0
        c.outcome('不同種類的貼紙：動作不一樣', differ, `第一張 ${move0}、第二張 ${moveB}`)
        if (!differ) await c.once('kind', '困惑', '不同種類的貼紙點了動作都一樣', `${move0} / ${moveB}`)
        await k.wait(2500)

        // 連點同一張、點別張、手掌壓、拖到一半放手、捲動：不出錯、不離開
        k.behavior = '連點、多指、亂點'
        await k.spam(first, 8, '連點第一張')
        for (let i = 0; i < 14; i++) {
          if ((await live()) !== 'stickers') break
          await toddlerStep(k, c)
        }
        await c.flush()
        // 亂點可能點到返回鍵：回首頁也是對的，再進來
        if ((await live()) === 'home') await enter('亂點回首頁後再進來')
        const still = await live()
        c.outcome('亂點、連點、多指之後還在貼紙本', still === 'stickers', `在 ${still}`)
        await c.screenOk('貼紙本亂玩後')
        await alive(k, c, '貼紙本亂玩', 20_000)

        // 捲到最舊的那一張
        k.behavior = '捲到最下面'
        await page.evaluate(() => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
          const all = root.querySelectorAll('.sb-item')
          all[all.length - 1]?.scrollIntoView({ block: 'center' })
        })
        await k.wait(600)
        const lastVisible = await page.evaluate(() => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()!
          const all = root.querySelectorAll('.sb-item')
          const r = all[all.length - 1]?.getBoundingClientRect()
          return !!r && r.top >= 0 && r.bottom <= innerHeight
        })
        c.outcome('捲得到最舊的那一張', lastVisible, lastVisible ? '' : '最後一張捲不進畫面')
        if (!lastVisible) await c.once('scroll', '困惑', '貼紙本捲不到最舊的那一張', '')

        // Android 返回
        k.behavior = 'Android 返回'
        await k.wait(1200)
        k.act('history.back()')
        await page.evaluate(() => history.back())
        let l = await waitLive(page, (x) => x === 'home', 4000)
        c.outcome('貼紙本 Android 返回 → 首頁', l === 'home', `到 ${l}`)
        if (l !== 'home') await c.once('android', '無法返回', '貼紙本按 Android 返回沒有回首頁', `停在 ${l}`)

        // 再進來，一進來就連點返回鍵 6 下：只回首頁
        k.behavior = '連點返回鍵'
        if (await enter('再進來')) {
          await k.wait(900)
          const h = await homeButton(page)
          if (h) {
            await k.spam(h, 6, h.label)
            await k.wait(2000)
            await settle(page)
            l = await live()
            c.outcome('貼紙本連點返回鍵 6 下 → 首頁', l === 'home', `到 ${l}`)
            if (l !== 'home') await c.once('spam-back', '無法返回', `貼紙本連點返回鍵到了 ${l}`, '應該回到首頁就停住')
          }
        }
        if ((await live()) === 'stickers') await backOnce('有貼紙')
        await c.screenOk('有貼紙返回後')
      }
      const after = await achieve()
      c.outcome('只看不改：貼紙的資料沒有變', before === after, before === after ? '' : '貼紙本改到了 achieve')
      if (before !== after) await c.once('write', '誤記作答', '貼紙本改到了貼紙的資料（應該只看不改）', '')
      await c.flush()
    } finally {
      finish(k, c, '貼紙本')
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
