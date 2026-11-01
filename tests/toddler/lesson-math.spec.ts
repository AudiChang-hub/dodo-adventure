import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, alive, audit, checkDoubleRecords, doorAt, grabDuringTeach, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'
import { FEATURES } from './lib/features'
import type { GameDef } from './catalog'

/**
 * 學校的數學課（src/lessons/math/，波波帶）：開場 → 數數 → 比多少 → 寫數字 → 小複習 → 貼紙。
 * 三歲孩子會做的事：連點門進來、亂點、連點、示範時搶著點和畫、上到一半按返回（返回鍵、Android 返回）再進來、同一天再上一次。
 * 一邊亂玩一邊把課往下上（點東西數、挑一張、沿著跑道描），每一段都要走得到、不卡住、不誤記作答。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = () => !only.length || only.some((s) => s === 'screens' || s === 'lesson-math' || s === 'math')

/** grabDuringTeach 只用到 id（記錄用） */
const LESSON = { id: 'lesson-math', station: 'math', kind: 'lesson', title: '數學課' } as unknown as GameDef

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string) {
  const seed = hashSeed(BASE_SEED, 'lesson-math', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `數學課／${name}`
  await boot(page, seed, { to: 'home' })
  await k.init()
  // 今天的數字：每個 seed 不一樣（1～10），10 是兩筆的「10」
  const n = 1 + (seed % 10)
  await setMath(page, { next: n })
  return { k, c, n }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`lesson-math-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

type MathKV = { next: number; day?: string; n?: number; mode?: string; part?: number; asked?: number; missed?: number }

const kvRW = (page: Page, value?: MathKV) =>
  page.evaluate(
    (value) =>
      new Promise<MathKV | null>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const st = db.transaction('kv', 'readwrite').objectStore('kv')
          const g = value ? st.put({ key: 'lesson:math', value }) : st.get('lesson:math')
          g.onsuccess = () => {
            db.close()
            res(value ? value : ((g.result as { value?: MathKV } | undefined)?.value ?? null))
          }
          g.onerror = () => res(null)
        }
        rq.onerror = () => res(null)
      }),
    value,
  )
const setMath = (page: Page, v: MathKV) => kvRW(page, v)
const getMath = (page: Page) => kvRW(page)

/** 課裡現在是哪一段（open、count、compare、write、review、over），不在課裡是 null */
const partNow = (page: Page) =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll('.scene')].filter((e) => !(e as HTMLElement).inert).pop()
    const l = [...(s?.querySelectorAll('[data-lesson-part]') ?? [])].pop()
    return l?.getAttribute('data-lesson-part') ?? null
  })
const stickerUp = (page: Page) => page.evaluate(() => !!document.querySelector('.cheer-scrim .picker'))

/** 把課往下上一步：數下一個、點發光的（沒有就隨便挑一張）、沿著跑道描、點念完的教學卡 */
async function solve(k: Toddler) {
  const page = k.page
  const s = await page.evaluate(() => {
    const live = [...document.querySelectorAll('.scene')].filter((e) => !(e as HTMLElement).inert).pop()
    if (!live) return null
    const c = (el: Element | null | undefined) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return r.width > 4 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
    }
    const card = live.querySelector('.teach-card.ready')
    const thing = [...live.querySelectorAll('.ma-thing:not(.on)')].map(c).filter(Boolean)
    const hint = c(live.querySelector('.ma-tile.hint'))
    const tiles = [...live.querySelectorAll('.ma-tile:not(.correct)')].map(c).filter(Boolean)
    // 寫數字：現在這一筆（有進度的那條跑道）的點，換成螢幕座標
    let stroke: { x: number; y: number }[] | null = null
    const papers = [...live.querySelectorAll('.ma-paper')]
    const paper = papers[papers.length - 1]
    const p = paper && [...paper.querySelectorAll('svg.ma-lane path[stroke-dasharray]')].find((x) => !/3 3/.test(x.getAttribute('stroke-dasharray') ?? ''))
    const svg = paper?.querySelector('svg.ma-lane') as SVGSVGElement | null
    if (p && svg) {
      const m = svg.getScreenCTM()!
      const path = p as SVGPathElement
      const len = path.getTotalLength()
      stroke = Array.from({ length: 31 }, (_, i) => {
        const q = path.getPointAtLength((len * i) / 30)
        return { x: m.a * q.x + m.e, y: m.d * q.y + m.f }
      })
    }
    return { card: c(card), thing: thing[0] ?? null, hint, tiles, stroke }
  })
  if (!s) return
  if (s.card) return k.tap(s.card as Pt, '點教學卡')
  if (s.thing) return k.tap(s.thing as Pt, '數下一個')
  if (s.hint) return k.tap(s.hint as Pt, '點發光的')
  if (s.tiles.length) return k.tap(k.r.pick(s.tiles) as Pt, '挑一張')
  if (s.stroke) return k.drag(s.stroke, { stepMs: 12, label: '沿著跑道描' })
}

/**
 * 一邊亂玩一邊上課，直到 stop（某一段開始、下課的貼紙出現）或逾時。
 * 示範中（波波在數、筆在描）就搶著點、搶著畫（grabDuringTeach），每一段第一次出現時量一次版面（audit）。
 */
async function play(k: Toddler, c: Checker, stop: (part: string | null) => Promise<boolean> | boolean, opts: { budget?: number; mess?: number; seen?: Set<string> } = {}) {
  const page = k.page
  const seen = opts.seen ?? new Set<string>()
  const end = Date.now() + (opts.budget ?? 5 * 60_000)
  let last = ''
  let still = Date.now()
  while (Date.now() < end) {
    const part = await partNow(page)
    if (await stop(part)) return true
    if (part && part !== last) {
      k.behavior = `數學課：${part}`
      k.act(`→ ${part}`)
      still = Date.now()
      last = part
    }
    if (part && !seen.has(part)) {
      seen.add(part)
      await c.screenOk(`數學課 ${part}`)
      if (part !== 'open' && part !== 'over') await audit(k, c, `數學課 ${part}`)
      await c.flush()
    }
    const sn = await snap(page)
    // 示範中搶著點、搶著畫（數數的手、寫數字的筆）
    if (sn.teaching === 'demo' && !seen.has(`grab:${part}`)) {
      seen.add(`grab:${part}`)
      await grabDuringTeach(k, c, LESSON)
      continue
    }
    if (k.r.chance(opts.mess ?? 0.35)) await toddlerStep(k, c, { drawing: part === 'write', fading: part === 'write' })
    else await solve(k)
    await k.wait(250 + k.r.int(400))
    // 同一段停太久：看看是不是卡住了（一直點都沒反應）
    if (Date.now() - still > 60_000) {
      if (!(await alive(k, c, `數學課 ${part}`))) return false
      still = Date.now()
    }
  }
  await c.once(`slow:${last}`, '卡死', `數學課停在「${last}」太久，上不完`, `超過 ${Math.round((opts.budget ?? 5 * 60_000) / 1000)} 秒`)
  return false
}

/** 從首頁進數學課（spam 就連點門） */
async function enter(k: Toddler, c: Checker, spam = false) {
  const page = k.page
  if (!(await toHome(k, c))) return false
  await settle(page)
  await k.wait(500)
  const door = (await doorAt(page, 'math'))!
  if (spam) await k.spam(door, 5 + k.r.int(4), '數學數字')
  else await k.tap(door, '數學數字')
  const live = await waitLive(page, (l) => l === 'lesson-math', 5000)
  if (live !== 'lesson-math') await c.once('enter', '困惑', `${spam ? '連點' : '點'}「數學數字」沒有進到數學課`, `停在 ${live}`)
  return live === 'lesson-math'
}

/** 等開場說完，回傳開始上的那一段 */
async function firstPart(page: Page, ms = 15_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const p = await partNow(page)
    if (p && p !== 'open') return p
    await page.waitForTimeout(250)
  }
  return partNow(page)
}

test.describe('數學課', () => {
  test.skip(FEATURES.adventure, '今日冒險版沒有學校的三堂課')

  test('上完一堂：連點門、亂點、連點、示範時搶著點和畫', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(12 * 60_000)
    const { k, c, n } = await setup(page, info, '上完一堂')
    try {
      k.behavior = '連點「數學數字」'
      if (!(await enter(k, c, true))) return
      await c.screenOk('進數學課')
      // 開場（今天的數字）一進來就搶著點
      k.behavior = '開場搶著點'
      await grabDuringTeach(k, c, LESSON)

      const seen = new Set<string>()
      const done = await play(k, c, async () => stickerUp(page), { seen })
      const parts = ['count', 'compare', 'write', 'review'].filter((p) => seen.has(p))
      c.outcome('四段都走得到', parts.length === 4, `走過：${[...seen].filter((s) => !s.startsWith('grab:')).join(' → ')}`)
      c.outcome('上完有貼紙', done, done ? '貼紙出現' : '沒有出現')
      if (done && parts.length < 4) await c.once('skip-part', '困惑', '有一段沒上到就下課了', `走過：${parts.join('、')}`)

      // 貼紙出來時按 Android 返回：回首頁（貼紙留著下次挑）
      k.behavior = '貼紙時按 Android 返回'
      if (done) {
        await k.wait(1200)
        await page.evaluate(() => history.back())
        const live = await waitLive(page, (l) => l === 'home', 5000)
        c.outcome('貼紙時 Android 返回 → 首頁', live === 'home', `到 ${live}`)
        if (live !== 'home') await c.once('pick-back', '無法返回', '下課挑貼紙時按返回沒有回首頁', `停在 ${live}`)
      }

      // 進度：上完了；沒錯很多就明天教下一個
      const kv = await getMath(page)
      const again = (kv?.missed ?? 0) >= 3 && (kv?.missed ?? 0) * 2 >= (kv?.asked ?? 0)
      const nextOk = kv?.part === 4 && kv.n === n && kv.next === (again ? n : Math.min(11, n + 1))
      c.outcome('進度記下了', !done || nextOk, JSON.stringify(kv))
      if (done && !nextOk) await c.once('progress', '誤記作答', '上完一堂之後進度不對', `今天 ${n}，記成 ${JSON.stringify(kv)}`, false)

      // 作答紀錄：每一段都有、連點不重複記
      const rows = (await attempts(page)).filter((a) => a.phase === 'quiz')
      const games = [...new Set(rows.map((a) => a.game))]
      c.outcome('作答寫進紀錄', !done || ['m-count', 'm-compare', 'd-glyph'].every((g) => games.includes(g)), `${rows.length} 筆：${games.join('、')}`)
      await checkDoubleRecords(k, c)
      await c.flush()
    } finally {
      finish(k, c, '上完一堂')
    }
  })

  test('上到一半返回再進來、同一天再上是複習', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(12 * 60_000)
    const { k, c, n } = await setup(page, info, '中途返回')
    try {
      // 數完就按返回鍵：回首頁；再進來從比多少接著上
      k.behavior = '數數上完按返回'
      if (!(await enter(k, c))) return
      const seen = new Set<string>()
      if (!(await play(k, c, (p) => p === 'compare', { mess: 0.2, seen, budget: 3 * 60_000 }))) return
      await k.wait(800)
      const h = await homeButton(page)
      if (h) await pressBack(k, h)
      let live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('上到一半按返回鍵 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('mid-back', '無法返回', '數學課上到一半按返回鍵沒有回首頁', `停在 ${live}`)

      k.behavior = '再進來'
      if (!(await enter(k, c))) return
      let p = await firstPart(page)
      c.outcome('再進來接著上（比多少）', p === 'compare', `從 ${p} 開始`)
      if (p !== 'compare') await c.once('resume', '困惑', '上到一半離開，再進來沒有接著上', `應該從比多少開始，實際是 ${p}`)

      // 寫數字的示範中按 Android 返回：回首頁，再進來從寫數字開始
      k.behavior = '寫數字示範中按 Android 返回'
      if (!(await play(k, c, (p) => p === 'write', { mess: 0.2, seen, budget: 3 * 60_000 }))) return
      for (let i = 0; i < 20 && (await snap(page)).teaching !== 'demo'; i++) await k.wait(250)
      await page.evaluate(() => history.back())
      live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('寫數字示範中 Android 返回 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('demo-back', '無法返回', '寫數字示範中按 Android 返回沒有回首頁', `停在 ${live}`)
      await k.wait(1500)
      await c.flush()

      k.behavior = '再進來上完'
      if (!(await enter(k, c, true))) return
      p = await firstPart(page)
      c.outcome('再進來接著上（寫數字）', p === 'write', `從 ${p} 開始`)
      if (p !== 'write') await c.once('resume2', '困惑', '寫數字到一半離開，再進來沒有接著上', `應該從寫數字開始，實際是 ${p}`)
      const done = await play(k, c, async () => stickerUp(page), { mess: 0.2, seen, budget: 4 * 60_000 })
      if (done) {
        await k.wait(1000)
        await page.evaluate(() => history.back())
        await waitLive(page, (l) => l === 'home', 5000)
      }

      // 同一天再進來：複習同一個數字（不教新的）
      k.behavior = '同一天再上一次'
      if (!(await enter(k, c))) return
      p = await firstPart(page)
      const kv = await getMath(page)
      const ok = p === 'count' && kv?.mode === 'review' && kv.n === n
      c.outcome('同一天再進來是複習', !done || ok, `從 ${p} 開始，${JSON.stringify(kv)}`)
      if (done && !ok) await c.once('review', '困惑', '同一天再上數學課沒有變成複習', `從 ${p} 開始，進度 ${JSON.stringify(kv)}`)
      // 複習也亂玩一下，再連點返回鍵 6 下：只回首頁
      await play(k, c, (p) => p === 'compare', { mess: 0.5, seen, budget: 2 * 60_000 })
      k.behavior = '複習中連點返回鍵'
      const h2 = await homeButton(page)
      if (h2) await k.spam(h2, 6, h2.label)
      await k.wait(2000)
      await settle(page)
      live = (await snap(page)).live
      c.outcome('連點返回鍵 6 下 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('spam-back', '無法返回', '數學課連點返回鍵沒有停在首頁', `到 ${live}`)
      await checkDoubleRecords(k, c)
      await c.flush()
    } finally {
      finish(k, c, '中途返回')
    }
  })
})
