import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, inkAt, settle, snap, storyToldToday, targets } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, centerOf, doorAt, drawAndMeasure, holdHome, pressBack, tapDoor, toHome, toddlerStep, waitLive } from './lib/flows'

/**
 * 學校的首頁（2026-10-31，src/screens/Home.tsx 的 SchoolHome）：三個大門（英文字母、中文課文、數學數字）＋故事、畫畫，牆上的貼紙板（T-132）。
 * 三歲孩子會做的事：亂點、連點門、一進去就想回來（返回鍵、Android 返回、連點返回鍵）、點了門馬上又按返回、
 * 點了畫畫馬上就畫（轉場還沒走完，T-72 找到的「之後每一筆都沒有墨」）。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (name: string) => !only.length || only.some((s) => s === 'screens' || s === 'home' || s === name)

/** 每一扇門點進去之後應該在的畫面（故事書的書架是故事書裡面那一層 shelf） */
const DOORS = [
  { door: 'english', name: '英文字母', live: 'lesson-english' },
  { door: 'chinese', name: '中文課文', live: 'lesson-chinese' },
  { door: 'math', name: '數學數字', live: 'lesson-math' },
  { door: 'story', name: '故事', live: 'shelf' },
  // 畫畫（T-138）：先到「白紙自由畫／著色本」
  { door: 'draw', name: '畫畫', live: 'draw' },
  // 牆上的貼紙板（T-132）：點進去是貼紙本
  { door: 'stickers', name: '貼紙本', live: 'stickers' },
] as const
const LABELS = new Set<string>(DOORS.map((d) => d.name))
/** 進到這扇門了（故事書剛換上來時外層是 storybook，裡面的書架接著淡入） */
const inDoor = (d: (typeof DOORS)[number], l: string | null) => l === d.live || (d.door === 'story' && l === 'storybook')

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string) {
  const seed = hashSeed(BASE_SEED, 'home', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `學校首頁／${name}`
  await boot(page, seed, { to: 'home' })
  await k.init()
  return { k, c }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`home-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

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

test.describe('學校首頁', () => {

  test('三大門：亂點、連點每一扇門、進出、返回', async ({ page }, info) => {
    test.skip(!want('home-doors'))
    test.setTimeout(10 * 60_000)
    const { k, c } = await setup(page, info, '三大門')
    // 故事門照舊直接進書架（新章節的流程在 story.spec.ts）
    await storyToldToday(page)
    try {
      // 首頁只有五扇門和牆上的貼紙板（家長角落另外量）
      k.behavior = '首頁有什麼'
      await settle(page)
      // 按鈕（門裡面的恐龍、圖是門的一部分，不算）
      const ts = (await targets(page)).filter((t) => t.kind === 'btn').map((t) => t.label)
      const extra = ts.filter((l) => !LABELS.has(l))
      c.outcome('首頁只有三大門＋故事、畫畫、貼紙板', !extra.length && ts.length === LABELS.size, `點得到：${ts.join('、')}`)
      if (extra.length) await c.once('home-extra', '困惑', `首頁多了別的按鈕：${extra.join('、')}`, '')
      const corner = await page.evaluate(() => !!document.querySelector('.parent-corner'))
      c.outcome('家長角落還在', corner, corner ? '右上角' : '不見了')
      if (!corner) await c.once('no-corner', '無法返回', '首頁沒有家長角落', '')

      // 亂點：點到門就進去了，看那一頁沒壞、再回首頁
      k.behavior = '首頁亂點'
      for (let i = 0; i < 14; i++) {
        const s = await snap(page)
        if (s.live !== 'home') {
          k.act(`亂點進了 ${s.live}`)
          await c.screenOk(`亂點進了 ${s.live}`)
          if (!(await toHome(k, c))) break
          continue
        }
        await k.tap({ x: k.r.range(5, (page.viewportSize()?.width ?? 1200) - 5), y: k.r.range(5, 795) }, '亂點')
        await k.wait(300 + k.r.int(600))
      }
      await c.flush()

      for (const d of DOORS) {
        if (!(await toHome(k, c))) break
        await settle(page)
        await k.wait(500)
        // 連點門：進那一扇門，連點的後面幾下不會在新畫面上變成別的事（離開、進別的地方）
        k.behavior = `連點「${d.name}」`
        const p = (await doorAt(page, d.door))!
        await k.spam(p, 5 + k.r.int(4), d.name)
        let live = await waitLive(page, (l) => inDoor(d, l), 5000)
        await k.wait(1500)
        live = (await snap(page)).live
        c.outcome(`連點「${d.name}」`, live === d.live, `到 ${live}`)
        if (live !== d.live) await c.once(`door:${d.door}`, '困惑', `連點「${d.name}」沒有停在那一頁`, `停在 ${live}`)
        await c.screenOk(`進「${d.name}」`)

        // 在裡面亂玩一下
        k.behavior = `「${d.name}」亂玩`
        for (let i = 0; i < 6; i++) {
          if (!inDoor(d, (await snap(page)).live)) break
          await toddlerStep(k, c, { drawing: d.door === 'draw', free: d.door === 'draw' })
        }
        await c.flush()
        live = (await snap(page)).live
        // 故事書亂玩可能點進一本書（重聽、英文版課文）：先回書架
        if (d.door === 'story' && /^(replay|en)/.test(live ?? '')) {
          const h = await homeButton(page)
          if (h) await pressBack(k, h)
          await waitLive(page, (l) => l === 'shelf', 4000)
        }

        // Android 的返回：回首頁
        k.behavior = `「${d.name}」按 Android 返回`
        if (inDoor(d, (await snap(page)).live)) {
          await settle(page)
          // 亂玩時可能剛按過返回（重聽 → 書架）：App 返回之後 1 秒內不收下一次返回（連點不多跳一層，lib/nav.ts），等它過去
          await k.wait(1200)
          k.act('history.back()')
          await page.evaluate(() => history.back())
          live = await waitLive(page, (l) => l === 'home', 4000)
          c.outcome(`「${d.name}」Android 返回 → 首頁`, live === 'home', `到 ${live}`)
          if (live !== 'home') await c.once(`android:${d.door}`, '無法返回', `「${d.name}」按 Android 返回沒有回首頁`, `停在 ${live}`)
        }

        // 再進去，一進去就連點返回鍵 6 下：只回首頁，首頁不會被連點的後面幾下點到別的門
        k.behavior = `「${d.name}」連點返回鍵`
        if (!(await toHome(k, c))) break
        await tapDoor(k, c, d.door, d.name, (l) => inDoor(d, l), 5000)
        await k.wait(900)
        const h = await homeButton(page)
        if (!h) {
          await c.once(`noback:${d.door}`, '無法返回', `「${d.name}」沒有返回鍵`, `畫面 ${(await snap(page)).live}`)
          continue
        }
        await k.spam(h, 6, h.label)
        await k.wait(2000)
        await settle(page)
        live = (await snap(page)).live
        c.outcome(`「${d.name}」連點返回鍵 6 下 → 首頁`, live === 'home', `到 ${live}（返回鍵「${h.label}」）`)
        if (live !== 'home') await c.once(`spam-back:${d.door}`, '無法返回', `「${d.name}」連點返回鍵到了 ${live}`, '應該回到首頁就停住')
        await c.screenOk(`「${d.name}」連點返回後`)
        await c.flush()
      }

      // 點了門馬上又按返回（轉場還沒走完）：回首頁，畫面不閃（透明度只往一個方向變）
      for (const [i, ms] of [60, 150, 260].entries()) {
        const d = DOORS[i * 2]
        k.behavior = `點「${d.name}」後 ${ms}ms 按返回`
        if (!(await toHome(k, c))) break
        await settle(page)
        await k.wait(700)
        await c.flush()
        const before = c.stats.flips
        await k.tap((await doorAt(page, d.door))!, d.name)
        await k.wait(ms)
        const h = (await homeButton(page)) ?? { x: 72, y: 64, label: '', tap: true }
        await pressBack(k, h, '轉場中點左上角')
        const live = await waitLive(page, (l) => l === 'home', 3000)
        await k.wait(800)
        await c.flush()
        c.outcome(`轉場中按返回（點「${d.name}」後 ${ms}ms）`, live === 'home' && c.stats.flips === before, `到 ${live}；透明度來回 ${c.stats.flips - before} 次`)
        if (live !== 'home') await c.once(`trans-back:${d.door}`, '無法返回', `點「${d.name}」後馬上按返回沒有回首頁`, `停在 ${live}`)
      }

      // 平板忙的時候連點門（T-67）：換畫面那一下之後主執行緒卡 1.2 秒，排隊的連點不會在新畫面變成別的事
      for (const d of [DOORS[2], DOORS[4]]) {
        k.behavior = `平板忙時連點「${d.name}」`
        if (!(await toHome(k, c))) break
        await settle(page)
        await k.wait(700)
        await stallAfterNextClick(page, 1200)
        await k.spam((await doorAt(page, d.door))!, 8, d.name)
        await waitLive(page, (l) => inDoor(d, l), 6000)
        await k.wait(1800)
        const live = (await snap(page)).live
        c.outcome(`平板忙時連點「${d.name}」`, live === d.live, `到 ${live}`)
        if (live !== d.live) await c.once(`stall:${d.door}`, '困惑', `平板忙時連點「${d.name}」沒有停在那一頁`, `停在 ${live}`)
        await c.screenOk(`平板忙時連點「${d.name}」`)
      }
      await c.flush()
    } finally {
      finish(k, c, '三大門')
    }
  })

  test('畫畫：點門後馬上就畫（轉場中下筆）', async ({ page }, info) => {
    test.skip(!want('home-draw'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '點門馬上畫')
    try {
      const vp = page.viewportSize()!
      // T-72 的重現：點遊戲卡（現在是首頁的門）後 0.3 秒就從畫紙外畫進來，之後每一筆幾乎沒有墨；改了之後每一筆都要有墨
      for (const ms of [300, 120, 600, 300]) {
        k.behavior = `點畫畫後 ${ms}ms 就畫`
        if (!(await toHome(k, c))) break
        await settle(page)
        await k.wait(600)
        await k.tap((await doorAt(page, 'draw'))!, '畫畫')
        // T-138：畫畫的門先到「白紙自由畫／著色本」；點白紙那一下才進自由畫畫，從那一下開始算「馬上就畫」
        // （選的畫面剛換上來 0.3 秒內的點會被防連點擋掉，那是對的，所以先等它穩定）
        await waitLive(page, (l) => l === 'draw', 4000)
        await settle(page, 4000)
        const free = await centerOf(page, '[data-pick="free"]')
        if (free) await k.tap(free, '白紙自由畫')
        await k.wait(ms)
        k.act(`現在 ${(await snap(page)).live}，從畫紙外畫進來`)
        await k.drag([{ x: 5, y: vp.height * 0.73 }, { x: 345, y: 478 }, { x: 101, y: 312 }, { x: 645, y: 328 }, { x: 415, y: 345 }], { stepMs: 14, label: '畫' })
        await waitLive(page, (l) => l === 'play-d-free', 4000)
        const ratios: number[] = []
        for (let i = 0; i < 3; i++) {
          await k.wait(1500)
          const cv = (await targets(page)).filter((t) => t.kind === 'canvas').sort((a, b) => b.w * b.h - a.w * a.h)[0]
          if (!cv) break
          const m = await drawAndMeasure(k, [{ x: 415 - i * 30, y: 260 + i * 20 }, { x: 600, y: 240 + i * 40 }, { x: 260, y: 560 }, { x: 520, y: 330 }], cv)
          ratios.push(m.ratio)
        }
        const ok = ratios.length === 3 && ratios.every((r) => r >= 0.8)
        const note = `之後 3 筆有墨：${ratios.map((r) => `${Math.round(r * 100)}%`).join('、')}`
        c.outcome(`點畫畫後 ${ms}ms 就畫`, ok, note)
        c.rule('DRAW-1', ok, `點門後 ${ms}ms 就下筆：${note}`)
        if (!ok) await c.once(`ink-after:${ms}`, '困惑', `點畫畫後 ${ms}ms 就畫，之後畫了卻沒有墨`, note)
        await c.flush()
      }
    } finally {
      finish(k, c, '點門馬上畫')
    }
  })

  test('畫畫：白紙還是著色本、著色本（T-138）', async ({ page }, info) => {
    test.skip(!want('home-coloring'))
    test.setTimeout(8 * 60_000)
    const { k, c } = await setup(page, info, '著色本')
    const live = async () => (await snap(page)).live
    const rect = (sel: string, i = 0) =>
      page.evaluate(
        ({ sel, i }) => {
          const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
          const r = root.querySelectorAll(sel)[i]?.getBoundingClientRect()
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top } : null
        },
        { sel, i },
      )
    const attr = (sel: string, name: string) => page.evaluate(({ sel, name }) => document.querySelector(sel)?.getAttribute(name) ?? null, { sel, name })
    const drawings = () =>
      page.evaluate(
        () =>
          new Promise<number>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onerror = () => res(-1)
            rq.onsuccess = () => {
              try {
                const q = rq.result.transaction('drawings', 'readonly').objectStore('drawings').count()
                q.onsuccess = () => (rq.result.close(), res(q.result))
                q.onerror = () => res(-1)
              } catch {
                res(-1)
              }
            }
          }),
      )
    /** 畫紙上的點（0～1 的比例） */
    const onPaper = async (fx: number, fy: number) => {
      const r = (await rect('[data-paper]'))!
      return { x: r.left + r.w * fx, y: r.top + r.h * fy }
    }
    /** 在畫紙上來回塗一塊（cx、cy 中心，w、h 範圍，都是比例） */
    const scribble = async (cx: number, cy: number, w: number, h: number, label: string, cancel = false) => {
      const pts = []
      for (let i = 0; i <= 6; i++) pts.push(await onPaper(cx + (i % 2 ? w / 2 : -w / 2), cy - h / 2 + (h * i) / 6))
      await k.drag(pts, { label, cancel, stepMs: 10 })
    }
    const accepting = async (ms: number) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        if ((await attr('[data-paper]', 'data-accepting')) === 'true') return true
        await k.wait(300)
      }
      return false
    }
    const crayon = async (i: number) => (await rect('.crayon-box [data-crayon]', i))!
    try {
      // 1. 首頁點畫畫：先到「白紙自由畫／著色本」，兩個大圖示
      k.behavior = '進畫畫'
      const l0 = await tapDoor(k, c, 'draw', '畫畫', (l) => l === 'draw', 5000)
      const picks = await page.evaluate(() => [...document.querySelectorAll('[data-pick]')].map((e) => e.getAttribute('data-pick')).join(','))
      c.outcome('畫畫的門進去：選白紙還是著色本', l0 === 'draw' && picks === 'free,book', `到 ${l0}；圖示 ${picks}`)
      await c.screenOk('選白紙還是著色本')

      // 2. 連點著色本：進到著色本（縮圖）
      k.behavior = '連點著色本'
      await settle(page, 4000)
      await k.spam((await centerOf(page, '[data-pick="book"]'))!, 5 + k.r.int(3), '著色本')
      await waitLive(page, (l) => !!l && l !== 'draw', 4000)
      await k.wait(1500)
      let l = await live()
      c.outcome('連點著色本', l === 'coloring' || !!l?.startsWith('play-d-color'), `到 ${l}`)
      if (l !== 'coloring' && l?.startsWith('play-d-color')) {
        await holdHome(k, c, '連點進到一張圖，返回著色本')
        l = await live()
      }
      const cats = await page.evaluate(() => [...document.querySelectorAll('.coloring-cat')].map((e) => e.getAttribute('data-cat')!))
      const pages = await page.evaluate(() => document.querySelectorAll('[data-pic]').length)
      c.outcome('著色本有分類、恐龍很多張', cats.length >= 5 && cats[0] === 'dino' && pages >= 30, `分類 ${cats.join('、')}；恐龍 ${pages} 張`)
      await c.screenOk('著色本')

      // 2b. 往下滑：看得到更多，滑的時候不會打開一張圖
      k.behavior = '往下滑'
      const sc = (await rect('.coloring-scroll'))!
      await k.drag([{ x: sc.x, y: sc.top + sc.h * 0.85 }, { x: sc.x + 10, y: sc.top + sc.h * 0.5 }, { x: sc.x + 20, y: sc.top + sc.h * 0.15 }], { label: '往上推（往下看）', stepMs: 12 })
      await k.wait(900)
      const top1 = await page.evaluate(() => document.querySelector('.coloring-scroll')?.scrollTop ?? 0)
      c.outcome('往下滑看更多、不會打開圖', top1 > 40 && (await live()) === 'coloring', `捲了 ${Math.round(top1)} px；在 ${await live()}`)

      // 2c. 換分類：連點、每一類都點一次，縮圖跟著換；再回到恐龍
      k.behavior = '換分類'
      const seen: string[] = []
      for (const id of [...cats.slice(1), cats[0]]) {
        const t = (await rect(`.coloring-cat[data-cat="${id}"]`))!
        if (id === cats[2]) await k.spam(t, 4, `連點分類 ${id}`)
        else await k.tap(t, `分類 ${id}`)
        await k.wait(700)
        const now = await attr('.coloring-book', 'data-cat')
        const n = await page.evaluate(() => document.querySelectorAll('[data-pic]').length)
        seen.push(`${id}→${now}（${n} 張）`)
        if (now !== id || !n) break
      }
      c.outcome('換分類', seen.length === cats.length && seen.every((x) => !x.includes('（0 張）') && x.split('→')[0] === x.split('→')[1].split('（')[0]), seen.join('、'))
      c.outcome('換分類不會離開著色本', (await live()) === 'coloring', `在 ${await live()}`)
      await c.screenOk('換分類')

      // 2d. 亂點縮圖（連點同一張）：只進一張，返回回著色本
      k.behavior = '連點縮圖'
      await settle(page, 4000)
      await k.spam((await rect('.coloring-page', 1))!, 5 + k.r.int(3), '連點縮圖')
      l = await waitLive(page, (x) => !!x?.startsWith('play-d-color'), 5000)
      c.outcome('連點縮圖進一張圖', !!l?.startsWith('play-d-color'), `到 ${l}`)
      if (l?.startsWith('play-d-color')) await holdHome(k, c, '連點縮圖後返回')
      c.outcome('連點縮圖後返回著色本', (await live()) === 'coloring', `到 ${await live()}`)

      // 3. 返回一下回上一層，再進來
      k.behavior = '著色本返回'
      await holdHome(k, c, '著色本返回')
      c.outcome('著色本返回到選白紙還是著色本', (await live()) === 'draw', `到 ${await live()}`)
      await settle(page, 4000)
      await k.tap((await centerOf(page, '[data-pick="book"]'))!, '著色本')
      await waitLive(page, (l) => l === 'coloring', 4000)
      await settle(page, 4000)

      // 4. 兩根手指同時點兩張圖：只進一張
      k.behavior = '兩根手指點兩張圖'
      const fish = (await rect('.coloring-page', 0))!
      const bf = (await rect('.coloring-page', 1))!
      await k.twoFinger([fish], bf, 120)
      l = await waitLive(page, (x) => !!x?.startsWith('play-d-color'), 5000)
      c.outcome('兩根手指點兩張圖', !!l?.startsWith('play-d-color'), `到 ${l}`)
      if (!l?.startsWith('play-d-color')) return
      await k.wait(800)

      // 5. 第一次進來：手示範怎麼塗；示範時搶著塗，塗不出顏色
      k.behavior = '示範時搶著塗'
      const demo = (await attr('.stage', 'data-demo')) === '1' || (await attr('[data-paper]', 'data-accepting')) === 'false'
      const grab = [await onPaper(0.08, 0.1), await onPaper(0.5, 0.06), await onPaper(0.92, 0.1)]
      await k.drag(grab, { label: '示範時搶著塗', stepMs: 10 })
      await k.spam(await crayon(0), 3, '示範時點蠟筆')
      const inkGrab = await inkAt(page, grab)
      const ok5 = await accepting(30_000)
      c.outcome('第一次進來有示範', demo, demo ? '示範中畫紙不收' : '沒有示範')
      c.outcome('示範時搶著塗', ok5 && inkGrab === 0, `搶著塗的地方墨 ${inkGrab}；${ok5 ? '示範完可以塗' : '示範一直沒結束'}`)
      if (!ok5) return
      const doneEarly = await page.locator('.tool-done').count()
      c.outcome('剛進來沒有完成鍵', doneEarly === 0, `完成鍵 ${doneEarly} 個`)

      // 6. 亂玩：連點蠟筆、手掌壓畫紙、塗到一半被搶走（touchcancel）、亂點畫紙
      k.behavior = '亂玩'
      await k.spam(await crayon(k.r.int(6)), 4 + k.r.int(4), '連點蠟筆')
      await k.palm([await onPaper(0.3, 0.7), await onPaper(0.36, 0.76), await onPaper(0.42, 0.72)])
      await scribble(0.5, 0.5, 0.2, 0.2, '塗到一半放手（被搶走）', true)
      for (let i = 0; i < 6; i++) await k.tap(await onPaper(k.r.range(0.1, 0.9), k.r.range(0.15, 0.9)), '亂點畫紙')
      await c.screenOk('亂玩之後')

      // 7. 塗：選一支蠟筆，在中間來回塗；塗了一些完成鍵才出現
      k.behavior = '塗'
      await k.tap(await crayon(3), '綠色蠟筆')
      const P = await onPaper(0.47, 0.5)
      for (let i = 0; i < 5 && !(await page.locator('.tool-done').count()); i++) await scribble(0.47, 0.5, 0.24 - i * 0.02, 0.26, `塗第 ${i + 1} 下`)
      await k.wait(600)
      const inkP = await inkAt(page, [P])
      const ready = await page.locator('.tool-done').count()
      c.outcome('塗了一些完成鍵才出現', ready === 1 && inkP > 0, `完成鍵 ${ready} 個；塗過的地方墨 ${inkP}`)

      // 7b. 塗出界：從圖的中間一路塗到紙的角落，線外也有顏色（家長 2026-11-11：不要管邊界），黑線還在最上面
      k.behavior = '塗出界'
      const out = await onPaper(0.06, 0.92)
      await k.drag([await onPaper(0.47, 0.5), await onPaper(0.25, 0.75), out], { label: '從裡面塗到紙的角落', stepMs: 10 })
      const inkOut = await inkAt(page, [out])
      const lineOnTop = await page.evaluate(() => {
        const p = document.querySelector('[data-paper]')
        const kids = p ? [...p.children] : []
        const svgAt = kids.findIndex((e) => e.querySelector('svg') || e.tagName.toLowerCase() === 'svg')
        const lastCanvas = kids.map((e) => e.tagName.toLowerCase()).lastIndexOf('canvas')
        return svgAt > lastCanvas
      })
      c.outcome('塗出界有顏色、線稿在最上面', inkOut > 0 && lineOnTop, `紙角落墨 ${inkOut}；線稿在畫布上面 ${lineOnTop}`)
      await c.screenOk('塗出界')

      // 8. 橡皮擦：擦掉，點蠟筆再塗回來
      k.behavior = '橡皮擦'
      await k.tap((await rect('.crayon-box .tool-eraser'))!, '橡皮擦')
      const eOn = await attr('.crayon-box .tool-eraser', 'aria-pressed')
      await k.drag([{ x: P.x - 90, y: P.y }, { x: P.x + 90, y: P.y }, { x: P.x - 90, y: P.y + 4 }], { label: '擦', stepMs: 10 })
      const inkE = await inkAt(page, [P])
      await k.tap(await crayon(1), '橘色蠟筆')
      const eOff = await attr('.crayon-box .tool-eraser', 'aria-pressed')
      await k.drag([{ x: P.x - 60, y: P.y - 20 }, { x: P.x + 60, y: P.y }, { x: P.x - 60, y: P.y + 20 }], { label: '再塗', stepMs: 10 })
      const inkR = await inkAt(page, [P])
      c.outcome('橡皮擦擦得掉、點蠟筆再塗', eOn === 'true' && inkE === 0 && eOff === 'false' && inkR > 0, `選到 ${eOn}；擦完墨 ${inkE}；點蠟筆後 ${eOff}；再塗墨 ${inkR}`)

      // 9. 完成鍵點一下就完成：慶祝、存進作品，停在作品上點大鈕回著色本
      k.behavior = '點一下完成'
      const before = await drawings()
      await k.wait(900)
      const done = await rect('.tool-done')
      if (done) await k.tap(done, '完成（點一下）')
      let rest = false
      const end = Date.now() + 40_000
      while (Date.now() < end) {
        const s = await snap(page)
        if (s.rest || (await page.locator('[data-resting]').count())) {
          rest = true
          break
        }
        if (s.cheer) await k.tap({ x: 600, y: 400 }, '看慶祝')
        await k.wait(1500)
      }
      const after = await drawings()
      c.outcome('點一下完成：慶祝、存進作品', !!done && rest && after === before + 1, `完成鍵 ${done ? '有' : '沒有'}；停在作品上 ${rest}；作品 ${before} → ${after}`)
      await c.screenOk('完成之後')
      const big = await rect('[data-resting] .draw-home')
      if (big) await k.tap(big, '大鈕')
      l = await waitLive(page, (x) => x === 'coloring', 5000)
      c.outcome('作品上的大鈕回著色本', l === 'coloring', `到 ${l}`)

      // 10. 再塗一張，塗到一半按返回（另一根手指還在塗）：一步回著色本
      k.behavior = '塗到一半返回'
      await settle(page, 4000)
      // 跟孩子一樣：點了沒進去就再點一次（著色本剛換上來的那一下會被防連點擋掉）
      const other = await page.evaluate(() => document.querySelectorAll('.coloring-page')[2]?.getAttribute('data-pic') ?? null)
      for (let i = 0; i < 3 && other && (await live()) === 'coloring'; i++) {
        const p2 = await rect(`.coloring-page[data-pic="${other}"]`)
        if (!p2) break
        await k.tap(p2, i ? '再點一次' : '另一張圖')
        await waitLive(page, (x) => x === `play-d-color-${other}`, 3000)
      }
      if ((await live()) !== `play-d-color-${other}`) {
        c.outcome('再進一張圖', false, `停在 ${await live()}`)
        return
      }
      const ok10 = await accepting(10_000)
      c.outcome('第二次進來不再示範', ok10, ok10 ? '馬上可以塗' : '等不到可以塗')
      const q = await onPaper(0.5, 0.5)
      await holdHome(k, c, '塗到一半返回', { second: [q, { x: q.x + 60, y: q.y - 20 }, { x: q.x + 120, y: q.y }] })
      c.outcome('塗到一半返回回著色本', (await live()) === 'coloring', `到 ${await live()}`)

      // 11. 一層一層回首頁：著色本 → 選白紙還是著色本 → 首頁
      k.behavior = '回首頁'
      await holdHome(k, c, '著色本回上一層')
      const l11a = await live()
      await holdHome(k, c, '選白紙還是著色本回首頁')
      const l11b = await live()
      c.outcome('每一層一步回上一層', l11a === 'draw' && l11b === 'home', `著色本 → ${l11a} → ${l11b}`)

      // 12. 白紙自由畫照舊
      k.behavior = '白紙自由畫'
      await tapDoor(k, c, 'draw', '畫畫', (x) => x === 'draw', 5000)
      await settle(page, 4000)
      await k.tap((await centerOf(page, '[data-pick="free"]'))!, '白紙自由畫')
      l = await waitLive(page, (x) => x === 'play-d-free', 5000)
      c.outcome('白紙自由畫進得去', l === 'play-d-free', `到 ${l}`)
      await c.flush()
    } finally {
      finish(k, c, '著色本')
    }
  })
})
