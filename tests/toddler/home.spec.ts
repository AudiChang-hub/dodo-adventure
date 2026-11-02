import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap, storyToldToday, targets } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, doorAt, drawAndMeasure, pressBack, tapDoor, toHome, toddlerStep, waitLive } from './lib/flows'

/**
 * 學校的首頁（2026-10-31，src/screens/Home.tsx 的 SchoolHome）：三個大門（英文字母、中文課文、數學數字）＋故事、畫畫。
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
  { door: 'draw', name: '畫畫', live: 'play-d-free' },
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
      // 首頁只有五扇門（家長角落另外量）
      k.behavior = '首頁有什麼'
      await settle(page)
      // 按鈕（門裡面的恐龍、圖是門的一部分，不算）
      const ts = (await targets(page)).filter((t) => t.kind === 'btn').map((t) => t.label)
      const extra = ts.filter((l) => !LABELS.has(l))
      c.outcome('首頁只有三大門＋故事、畫畫', !extra.length && ts.length === LABELS.size, `點得到：${ts.join('、')}`)
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
        // 故事書亂玩可能點進一本書（重聽）：先回書架
        if (d.door === 'story' && (live ?? '').startsWith('replay-')) {
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
})
