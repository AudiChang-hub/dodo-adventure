import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, now, settle, snap, storyToldToday, targets } from './lib/app'
import fs from 'node:fs'
import path from 'node:path'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, doorAt, drawAndMeasure, pressBack, tapDoor, toHome, toddlerStep, waitLive } from './lib/flows'

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
  { door: 'draw', name: '畫畫', live: 'play-d-free' },
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

// ── T-137 記住三隻恐龍的名字 ───────────────────────────────────
// 首頁：前 5 次打開 App，豆豆介紹大家（說到誰、門口那隻跳一下），之後不再介紹；介紹時亂點、連點門不疊音，點門馬上進課、介紹停掉。
// 點門口的恐龍：照舊進課（門口的恐龍是門的一部分），進課第一句就是恐龍自己的名字（英文 Hi! I'm Dodo!、數學 Hi! I'm Bobo!），
// 開場被點擊打斷（T-108）；中文課不出聲，莫莫腳邊有名牌「莫莫 Momo」。
// 只跑這一組：npm run test:toddler -- home-names
const INTRO_KEY = 'home.dinoIntro'
const SHOTS = path.resolve('test-results', 't137')

const kvGet = (page: Page, key: string) =>
  page.evaluate(
    (key) =>
      new Promise<unknown>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const g = db.transaction('kv').objectStore('kv').get(key)
          g.onsuccess = () => {
            db.close()
            res((g.result as { value?: unknown } | undefined)?.value ?? null)
          }
        }
      }),
    key,
  )
const kvSet = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ({ key, value }) =>
      new Promise<void>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key, value })
          tx.oncomplete = () => {
            db.close()
            res()
          }
        }
      }),
    { key, value },
  )
/** 從 t 開始的每一段語音（字幕在開始 120ms 後才填進來） */
const voiceRecs = (page: Page, t: number) =>
  page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t).map((v) => ({ t: v.t, end: v.end, text: v.text ?? '', stopped: v.stopped })), t)
const textsOf = (vs: { text: string }[]) => vs.map((v) => v.text).join(' / ')
/** 等到某一句開始說（回傳那一段語音） */
async function waitVoice(page: Page, t: number, re: RegExp, ms = 6000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = (await voiceRecs(page, t)).find((x) => re.test(x.text))
    if (v) return v
    await page.waitForTimeout(80)
  }
  return null
}
/** 首頁上沒有按鈕的一點（點了只是解鎖聲音，什麼都不會開） */
const blankAt = (page: Page) =>
  page.evaluate(() => {
    for (const [x, y] of [
      [40, innerHeight * 0.45],
      [innerWidth - 40, innerHeight * 0.5],
      [innerWidth / 2, innerHeight * 0.2],
    ]) {
      const el = document.elementFromPoint(x, y)
      if (el && !el.closest('button, [role="button"], a, .parent-corner')) return { x, y, nav: true }
    }
    return { x: 40, y: innerHeight * 0.45, nav: true }
  })
/** 記下門口哪幾隻恐龍跳過（data-hop 變了就記那扇門） */
const watchHops = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __hops: string[] }
    w.__hops = []
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as Element
        if (el.getAttribute('data-hop')) w.__hops.push(el.closest('[data-door]')?.getAttribute('data-door') ?? '?')
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-hop'] })
  })
const hops = (page: Page) => page.evaluate(() => (window as unknown as { __hops?: string[] }).__hops ?? [])
const dinoAt = (page: Page, door: string) =>
  page.evaluate((door) => {
    const r = document.querySelector(`.door[data-door="${door}"] .door-host`)?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.45 } : null
  }, door)
const shot = async (page: Page, info: { project: { name: string } }, name: string) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`) })
}
async function reopen(page: Page) {
  await page.reload()
  await page.waitForSelector('.screen.home', { timeout: 20_000 })
  await settle(page)
}

test.describe('T-137 恐龍的名字', () => {
  const on = () => want('home-names') || want('home-doors')

  test('首頁介紹：前 5 次打開 App 才介紹、說到誰誰跳一下、亂點不疊音', async ({ page }, info) => {
    test.skip(!on())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '恐龍介紹')
    try {
      // 第 1 次打開：點空白處（瀏覽器要點一下才出聲），接著亂點、連點空白處
      k.behavior = '第 1 次打開：介紹時亂點空白處'
      await watchHops(page)
      const t0 = await now(page)
      const blank = await blankAt(page)
      await k.tap(blank, '空白處（解鎖聲音）')
      const first = await waitVoice(page, t0, /Dodo/)
      await k.wait(250)
      await shot(page, info, '首頁介紹-豆豆')
      await k.spam(blank, 6, '連點空白處')
      const momo = await waitVoice(page, t0, /Momo/, 8000)
      if (momo) {
        await k.wait(250)
        await shot(page, info, '首頁介紹-莫莫')
      }
      await k.wait(2500)
      const v1 = await voiceRecs(page, t0)
      const order = ['Dodo', 'Bobo', 'Momo'].map((n) => v1.findIndex((v) => v.text.includes(n)))
      const okSay = !!first && order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2]
      c.outcome('第 1 次打開：豆豆說 I am Dodo、介紹 Bobo、Momo（依序）', okSay, textsOf(v1))
      if (!okSay) await c.once('intro-1', '困惑', '第 1 次打開 App 沒有聽到三隻恐龍的介紹', textsOf(v1))
      const h1 = await hops(page)
      const want3 = ['english', 'math', 'chinese']
      const okHop = want3.every((d) => h1.includes(d)) && h1.indexOf('english') < h1.indexOf('math') && h1.indexOf('math') < h1.indexOf('chinese')
      c.outcome('說到誰、門口那隻跳一下（豆豆 → 波波 → 莫莫）', okHop, h1.join(' → '))
      if (!okHop) await c.once('intro-hop', '困惑', '介紹時門口的恐龍沒有依序跳', h1.join(' → '))
      const n1 = await kvGet(page, INTRO_KEY)
      c.outcome('記下介紹過 1 次', n1 === 1, String(n1))
      if (n1 !== 1) await c.once('intro-count', '小問題', '介紹的次數沒有記下來', String(n1))
      await c.flush()

      // 第 5 次打開（前面已經介紹 4 次）：還會介紹，記成 5
      k.behavior = '第 5 次打開'
      await kvSet(page, INTRO_KEY, 4)
      await reopen(page)
      const t5 = await now(page)
      await k.tap(await blankAt(page), '空白處（解鎖聲音）')
      const m5 = await waitVoice(page, t5, /Momo/, 9000)
      const n5 = await kvGet(page, INTRO_KEY)
      c.outcome('第 5 次打開還會介紹', !!m5 && n5 === 5, `${textsOf(await voiceRecs(page, t5))}；次數 ${n5}`)
      if (!m5 || n5 !== 5) await c.once('intro-5', '困惑', '第 5 次打開 App 沒有介紹', `次數 ${n5}`)
      await k.wait(1500)
      await c.flush()

      // 第 6 次打開：不再介紹，照舊 Hi, 名字! Let's go!
      k.behavior = '第 6 次打開'
      await reopen(page)
      await watchHops(page)
      const t6 = await now(page)
      await k.tap(await blankAt(page), '空白處（解鎖聲音）')
      const go = await waitVoice(page, t6, /Let's go/, 5000)
      await k.wait(3000)
      const v6 = await voiceRecs(page, t6)
      const h6 = await hops(page)
      const n6 = await kvGet(page, INTRO_KEY)
      const okSix = !!go && !v6.some((v) => /Dodo|Bobo|Momo/.test(v.text)) && !h6.length && n6 === 5
      c.outcome('第 6 次打開不再介紹（照舊 Let us go）', okSix, `${textsOf(v6)}；跳：${h6.join(',') || '沒有'}；次數 ${n6}`)
      if (!okSix) await c.once('intro-6', '困惑', '介紹過 5 次之後還在介紹（或沒有招呼）', textsOf(v6))
      await c.flush()
    } finally {
      finish(k, c, '恐龍介紹')
    }
  })

  test('介紹時連點門：馬上進課、介紹停掉、不疊音', async ({ page }, info) => {
    test.skip(!on())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '介紹時點門')
    try {
      for (const d of [
        { door: 'math', live: 'lesson-math' },
        { door: 'english', live: 'lesson-english' },
      ]) {
        k.behavior = `介紹到一半連點 ${d.door} 門`
        await toHome(k, c)
        await kvSet(page, INTRO_KEY, 0)
        await reopen(page)
        const t0 = await now(page)
        await k.tap(await blankAt(page), '空白處（解鎖聲音）')
        await waitVoice(page, t0, /Dodo/)
        await k.wait(300)
        const t1 = await now(page)
        await k.spam((await doorAt(page, d.door))!, 4, `連點 ${d.door} 門`)
        const live = await waitLive(page, (l) => l === d.live, 5000)
        c.outcome(`介紹時連點門：進到 ${d.live}`, live === d.live, `${live}`)
        if (live !== d.live) await c.once(`intro-door:${d.door}`, '卡死', `介紹時點 ${d.door} 門沒有進課`, `停在 ${live}`)
        await k.wait(4000)
        const after = (await voiceRecs(page, t1)).filter((v) => v.t > t1 + 250)
        const leak = after.filter((v) => /This is Bobo|this is Momo/.test(v.text))
        // 點門時正在說的那一句介紹：點了就停（不會說完）
        const talking = (await voiceRecs(page, t0)).filter((v) => v.t < t1 && v.end > t1 + 1200)
        const late = talking.filter((v) => v.stopped == null || v.stopped > t1 + 1200)
        const ok = !leak.length && !late.length
        c.outcome('點門之後介紹停掉、沒有帶到課裡', ok, `點門之後：${textsOf(after)}`)
        if (!ok) await c.once(`intro-leak:${d.door}`, '小問題', '點門進課之後首頁的介紹還在說', textsOf(after))
        await c.flush()
      }
    } finally {
      finish(k, c, '介紹時點門')
    }
  })

  test('點門口的恐龍：照舊進課、恐龍說自己的名字、開場點一下就停；中文課有莫莫的名牌', async ({ page }, info) => {
    test.skip(!on())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '點恐龍')
    try {
      // 已經介紹過 5 次：只看點恐龍、進課
      await kvSet(page, INTRO_KEY, 5)
      for (const d of [
        { door: 'english', live: 'lesson-english', hi: /I'm Dodo/, next: /Today's letter|practice|is back/, cut: '.en-letter.is-big' },
        { door: 'math', live: 'lesson-math', hi: /I'm Bobo/, next: /Today's number/, cut: '.stage-main' },
      ]) {
        k.behavior = `點 ${d.door} 門口的恐龍`
        await toHome(k, c)
        await k.wait(600)
        const t0 = await now(page)
        await k.tap((await dinoAt(page, d.door))!, `${d.door} 門口的恐龍`)
        const live = await waitLive(page, (l) => l === d.live, 5000)
        c.outcome(`點門口的恐龍：照舊進 ${d.live}`, live === d.live, `${live}`)
        if (live !== d.live) await c.once(`dino-door:${d.door}`, '卡死', `點 ${d.door} 門口的恐龍沒有進課`, `停在 ${live}`)
        const hi = await waitVoice(page, t0, d.hi, 6000)
        c.outcome(`進課第一句是恐龍自己的名字（${d.hi.source}）`, !!hi, textsOf(await voiceRecs(page, t0)))
        if (!hi) {
          await c.once(`dino-hi:${d.door}`, '困惑', `${d.door} 課的開場沒有叫恐龍自己的名字`, textsOf(await voiceRecs(page, t0)))
          continue
        }
        // 開場搶著點（T-108）：名字還在說就點，整串停掉
        await page.waitForTimeout(Math.max(0, hi.t + 650 - (await now(page))))
        const box = await page.evaluate((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
        }, d.cut)
        const tc = await now(page)
        await k.tap(box ?? { x: 600, y: 420 }, '開場搶著點')
        await k.wait(2500)
        const rec = (await voiceRecs(page, t0)).find((v) => v.t === hi.t)!
        const cutOk = rec.end <= tc + 100 || (rec.stopped != null && rec.stopped <= tc + 400)
        const nextAfter = (await voiceRecs(page, tc + 100)).filter((v) => d.next.test(v.text))
        c.outcome('開場叫名字時點一下：馬上停、不接著念開場', cutOk && !nextAfter.length, `停在 ${rec.stopped == null ? '沒停' : Math.round(rec.stopped - tc) + 'ms'}；之後：${textsOf(await voiceRecs(page, tc))}`)
        if (!cutOk || nextAfter.length) await c.once(`dino-cut:${d.door}`, '困惑', `${d.door} 課開場叫名字時點畫面，語音沒有停`, `之後還念：${textsOf(nextAfter)}`)
        const plate = await page.evaluate(() => !!document.querySelector('.stage-host-name'))
        c.outcome(`${d.door} 課沒有名牌（恐龍自己會說）`, !plate)
        if (plate) await c.once(`plate:${d.door}`, '小問題', `${d.door} 課也出現了名牌`, '')
        await c.flush()
      }

      k.behavior = '點中文門口的莫莫'
      await toHome(k, c)
      await k.wait(600)
      const t0 = await now(page)
      await k.tap((await dinoAt(page, 'chinese'))!, '中文門口的莫莫')
      const live = await waitLive(page, (l) => l === 'lesson-chinese', 5000)
      c.outcome('點莫莫：照舊進中文課', live === 'lesson-chinese', `${live}`)
      if (live !== 'lesson-chinese') await c.once('dino-door:chinese', '卡死', '點中文門口的莫莫沒有進課', `停在 ${live}`)
      await settle(page)
      await k.wait(1500)
      const plate = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('.stage-host-name')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { text: el.textContent ?? '', inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 0, pe: getComputedStyle(el).pointerEvents }
      })
      const okPlate = !!plate && plate.text.includes('莫莫') && plate.text.includes('Momo') && plate.inView && plate.pe === 'none'
      c.outcome('中文課莫莫腳邊有名牌「莫莫 Momo」（不接收點擊）', okPlate, JSON.stringify(plate))
      if (!okPlate) await c.once('plate:chinese', '困惑', '中文課沒有莫莫的名牌', JSON.stringify(plate))
      await shot(page, info, '中文課名牌')
      const zhVoice = (await voiceRecs(page, t0)).filter((v) => v.text.includes('Momo'))
      c.outcome('中文課照舊不出聲（沒有念莫莫的名字）', !zhVoice.length, textsOf(zhVoice))
      if (zhVoice.length) await c.once('zh-voice', '小問題', '中文課念出了名字（中文課應該不出聲）', textsOf(zhVoice))
      await c.flush()
    } finally {
      finish(k, c, '點恐龍')
    }
  })
})
