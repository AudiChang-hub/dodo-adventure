import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, alive, audit, checkDoubleRecords, doorAt, grabDuringTeach, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'
import type { GameDef } from './catalog'

/**
 * 學校的數學課（src/lessons/math/，波波帶）：開場 → 數數 → 拿給波波 → 比多少 → 寫數字 → 小複習 → 貼紙。
 * 三歲孩子會做的事：連點門進來、亂點、連點、示範時搶著點和畫、上到一半按返回（返回鍵、Android 返回）再進來、同一天再上一次。
 * 一邊亂玩一邊把課往下上（點東西數、挑一張、沿著跑道描），每一段都要走得到、不卡住、不誤記作答。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = () => !only.length || only.some((s) => s === 'screens' || s === 'lesson-math' || s === 'math')

/** grabDuringTeach 只用到 id（記錄用） */
const LESSON = { id: 'lesson-math', station: 'math', kind: 'lesson', title: '數學課' } as unknown as GameDef

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string, lessonSticker?: boolean) {
  const seed = hashSeed(BASE_SEED, 'lesson-math', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `數學課／${name}`
  await boot(page, seed, { to: 'home', lessonSticker })
  await k.init()
  // 今天的數字：每個 seed 不一樣（1～10），10 是兩筆的「10」。
  // firm：1～5 已經熟練（不然 6 以上的數字還不會開，會變成 1～5 的混合複習；熟練的判斷在 scripts/test-math-plan.ts 測）
  const n = 1 + (seed % 10)
  await setMath(page, { next: n, firm: true })
  return { k, c, n }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`lesson-math-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

type MathKV = { next: number; firm?: boolean; day?: string; n?: number; mode?: string; part?: number; asked?: number; missed?: number }

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

/** 課裡現在是哪一段（open、count、give、compare、write、review、over），不在課裡是 null */
const PARTS = ['count', 'give', 'compare', 'write', 'review']
const partNow = (page: Page) =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll('.scene')].filter((e) => !(e as HTMLElement).inert).pop()
    const l = [...(s?.querySelectorAll('[data-lesson-part]') ?? [])].pop()
    return l?.getAttribute('data-lesson-part') ?? null
  })
/** 下課畫面出來了（挑貼紙，或沒有貼紙的那堂的 LessonBye：貼紙平均每 3～4 堂一次、不固定） */
const lessonEnd = (page: Page) => page.evaluate(() => !!document.querySelector('.cheer-scrim'))
const stickerUp = (page: Page) => page.evaluate(() => !!document.querySelector('.cheer-scrim .picker'))

/** 把課往下上一步：數下一個、拿給波波（盤子裡不夠就拿、太多就拿回來、剛好就點勾勾）、點發光的（沒有就隨便挑一張）、沿著跑道描、點念完的教學卡 */
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
    // 拿給波波：要幾個（大數字）、盤子裡有幾個（拿回…的那幾個）
    const want = Number(live.querySelector('.ma-give-num')?.textContent ?? 0)
    const inPlate = [...live.querySelectorAll('.ma-give-thing')].filter((e) => e.getAttribute('aria-label')?.startsWith('拿回'))
    const inPile = [...live.querySelectorAll('.ma-give-thing')].filter((e) => !e.getAttribute('aria-label')?.startsWith('拿回'))
    const give = want
      ? inPlate.length < want
        ? c(inPile[0])
        : inPlate.length > want
          ? c(inPlate[inPlate.length - 1])
          : c(live.querySelector('.ma-give-done'))
      : null
    const thing = [...live.querySelectorAll('.ma-thing:not(.on):not(.ma-give-thing)')].map(c).filter(Boolean)
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
    return { card: c(card), give, thing: thing[0] ?? null, hint, tiles, stroke }
  })
  if (!s) return
  if (s.card) return k.tap(s.card as Pt, '點教學卡')
  if (s.give) return k.tap(s.give as Pt, '拿給波波')
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

/**
 * 描到一半再描（2026-11-01，track.ts 的 penDown）：沿著現在這一筆（虛線）描到一半，
 * restart＝被手掌打斷（touchcancel）、再從綠點從頭描；continue＝抬筆、從斷掉的地方接著描。
 * 回傳這一筆有沒有描完（換到下一筆、或這一次描完了）；還不能畫、找不到這一筆時回傳 null。
 */
async function halfThenAgain(k: Toddler, how: 'restart' | 'continue', sel: { board: string; done: string }) {
  const page = k.page
  const now = () =>
    page.evaluate((sel) => {
      const boards = [...document.querySelectorAll(sel.board)]
      const b = boards[boards.length - 1]
      const p = b?.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')
      const done = document.querySelectorAll(sel.done).length
      if (!p) return { d: null as string | null, done, pts: [] as { x: number; y: number }[] }
      const m = p.getScreenCTM()!
      const len = p.getTotalLength()
      const n = Math.max(8, Math.round(len / 4))
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const q = p.getPointAtLength((len * i) / n)
        const s = new DOMPoint(q.x, q.y).matrixTransform(m)
        return { x: s.x, y: s.y }
      })
      return { d: p.getAttribute('d'), done, pts }
    }, sel)
  const a = await now()
  if (!a.d || a.pts.length < 4) return null
  const mid = Math.round(a.pts.length * 0.55)
  await k.drag(a.pts.slice(0, mid), { stepMs: 16, cancel: how === 'restart', label: how === 'restart' ? '描到一半被手掌打斷' : '描到一半抬筆' })
  await k.wait(700)
  await k.drag(how === 'restart' ? a.pts : a.pts.slice(mid - 1), { stepMs: 16, label: how === 'restart' ? '從綠點重描' : '從斷掉的地方接著描' })
  await k.wait(900)
  const b = await now()
  return b.d !== a.d || b.done > a.done
}

test.describe('數學課', () => {

  // T-104（第一、四次盲測）：拿給波波按完打勾，同一個位置馬上冒出別的功能（下一段的教學卡「再聽一次」），他一直點、聽到重播，看不懂。
  // 按完打勾後在同一個位置連點：不能觸發別的功能（教學卡要停在「等他點」）；停一下再點一次，教學卡才重播、往下走
  test('拿給波波：按完打勾連點同一個位置，不會觸發別的功能', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '打勾後連點')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 同一天從「拿給波波」接著上，今天的數字 1（新的：比多少會先出教學卡）
      await setMath(page, { next: 2, firm: false, day, n: 1, mode: 'new', part: 1, asked: 0, missed: 0 })
      if (!(await enter(k, c))) return
      const ready = await page
        .waitForFunction(() => !!document.querySelector('.ma-give') && !document.querySelector('.ma-give [data-accepting="false"]') && !document.querySelector('[data-demo="1"]'), null, { timeout: 60_000 })
        .then(() => true)
        .catch(() => false)
      if (!ready) return void (await c.once('no-give', '卡死', '沒有走到拿給波波（或一直不能拿）', `停在 ${await partNow(page)}`))
      await k.wait(500)
      const at = (sel: string) =>
        page.evaluate((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
        }, sel)
      k.behavior = '拿一個給波波、按打勾'
      await k.tap((await at('.ma-give-thing'))!, '拿一個')
      await k.wait(700)
      const ok = (await at('.ma-give-done'))!
      await k.tap(ok, '打勾')
      // 按完打勾，在同一個位置一直點（三歲：按了好像就好了，再點點看）
      k.behavior = '打勾後連點同一個位置'
      // 22 秒：蓋過下一段教學卡念完、變成「等他點」的時間（兩句，大約按完打勾後 12 秒；以前三句 16 秒）
      const end = Date.now() + 22_000
      while (Date.now() < end) {
        await k.tap(ok, '同一個位置')
        await k.wait(300)
      }
      const st = await page.evaluate(() => ({ part: [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') ?? null, card: !!document.querySelector('.teach-card'), ready: !!document.querySelector('.teach-card.ready') }))
      const held = st.part === 'compare' && st.card
      c.outcome('連點不會觸發別的功能（教學卡還在等他點）', held, `${st.part}，教學卡${st.card ? (st.ready ? '在等他點' : '還在') : '已經被點掉了'}`)
      if (!held) await c.once('carry-tap', '困惑', '按完打勾後連點同一個位置，觸發了下一段教學卡的重播、往下走', `停在 ${st.part}`)
      // 停一下、再點一次教學卡：重播、往下走（原本的功能還在）
      if (held) {
        k.behavior = '停一下再點教學卡'
        await k.wait(1500)
        await k.tap((await at('.teach-card'))!, '教學卡')
        const gone = await page
          .waitForFunction(() => !document.querySelector('.teach-card'), null, { timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
        c.outcome('停一下再點教學卡：重播、往下走', gone, gone ? '' : '教學卡沒有反應')
        if (!gone) await c.once('card-dead', '卡死', '停一下再點教學卡沒有反應', '')
      }
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '打勾後連點')
    }
  })

  // 第一、四、五次盲測：拿給波波按完打勾，他說「不知道要幹嘛，好久喔」。按完打勾到下一個能動手的時候（比多少教學卡念完、等他點）
  // 舊版大約 16 秒，中間只能看、聽；他在這段時間點畫面，教學卡只有很小的跳一下，看不出「現在是聽的時候、等一下」。
  // 按完打勾後每 1.5 秒點一下畫面（不是連點）：要在 13 秒內就能動手（舊版 16.2 秒），而且每一下都有「等一下、先看」的回應（看這裡的圈圈）
  test('拿給波波：按完打勾很快就能動手，等的時候點畫面看得出要等一下', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '打勾後多久能動手')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 同一天從「拿給波波」接著上，今天的數字 1（新的：比多少會先出教學卡），跟盲測一樣
      await setMath(page, { next: 2, firm: false, day, n: 1, mode: 'new', part: 1, asked: 0, missed: 0 })
      if (!(await enter(k, c))) return
      const ready = await page
        .waitForFunction(() => !!document.querySelector('.ma-give') && !document.querySelector('.ma-give [data-accepting="false"]') && !document.querySelector('[data-demo="1"]'), null, { timeout: 60_000 })
        .then(() => true)
        .catch(() => false)
      if (!ready) return void (await c.once('no-give', '卡死', '沒有走到拿給波波（或一直不能拿）', `停在 ${await partNow(page)}`))
      await k.wait(500)
      const at = (sel: string) =>
        page.evaluate((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
        }, sel)
      k.behavior = '拿一個給波波、按打勾'
      await k.tap((await at('.ma-give-thing'))!, '拿一個')
      await k.wait(700)
      const ok = (await at('.ma-give-done'))!
      const t0 = await page.evaluate(() => performance.now())
      await k.tap(ok, '打勾')
      // 能動手了：比多少的教學卡念完、等他點（或已經直接到題目、選項收作答）
      // 等 1.5 秒（中間一能動手就記下那一刻，用頁面裡的時間）
      const canAct = () =>
        page
          .waitForFunction(
            () => {
              const part = [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part')
              const can = !!document.querySelector('.teach-card.ready') || (part === 'compare' && !document.querySelector('.teach-card') && !!document.querySelector('.ma-lesson [data-accepting="true"]'))
              return can ? performance.now() : false
            },
            null,
            { timeout: 1500, polling: 50 },
          )
          .then((h) => h.jsonValue() as Promise<number>)
          .catch(() => null)
      k.behavior = '按完打勾，每 1.5 秒點一下畫面'
      let waited = -1
      let taps = 0
      let answered = 0
      const silent: string[] = []
      const end = Date.now() + 30_000
      while (Date.now() < end) {
        const now = await canAct()
        if (now) {
          waited = now - t0
          if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') {
            await k.wait(600)
            await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/教學卡念完等他點.png` })
          }
          break
        }
        // 點一下打勾原本的位置（教學卡也會蓋在這裡）：要有「看這裡、等一下」的圈圈
        const before = await page.evaluate(() => performance.now())
        await k.tap(ok, '等的時候點一下')
        taps++
        const ring = await page
          .waitForFunction((t) => [...document.querySelectorAll('.not-yet')].length > 0 && performance.now() - t < 900, before, { timeout: 600 })
          .then(() => true)
          .catch(() => false)
        if (ring) answered++
        if (ring && process.env.TODDLER_SHOTS && info.project.name === 'tab1280' && (await page.evaluate(() => !!document.querySelector('.teach-card'))))
          await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/教學卡念的時候點-${taps}.png` })
        if (!ring) silent.push(`${((before - t0) / 1000).toFixed(1)}s ${await page.evaluate(() => (document.querySelector('.teach-card') ? '教學卡' : ([...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') ?? '?')))}`)
      }
      const heard = await page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t && v.text).map((v) => `${((v.t - t) / 1000).toFixed(1)}s ${v.text}`), t0)
      const secs = waited < 0 ? -1 : Math.round(waited / 100) / 10
      c.outcome('按完打勾 13 秒內就能動手', secs > 0 && secs <= 13, `${secs < 0 ? '30 秒內都不能動手' : `${secs} 秒`}；聽到：${heard.join('、')}`)
      if (!(secs > 0 && secs <= 13)) await c.once('give-wait', '困惑', '拿給波波按完打勾，要等很久才能動手', `${secs} 秒；聽到：${heard.join('、')}`)
      c.outcome('等的時候點畫面，每一下都有「等一下」的圈圈', taps > 0 && answered === taps, `${answered}/${taps}${silent.length ? `；沒有回應：${silent.join('、')}` : ''}`)
      if (taps > 0 && answered < taps) await c.once('give-silent', '困惑', '按完打勾等的時候點畫面，看不出要等一下（沒有「看這裡」的圈圈）', `${answered}/${taps}；沒有回應：${silent.join('、')}`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '打勾後多久能動手')
    }
  })

  // T-99（盲測三次都碰到）：下課畫面剛出來時，左上角的房子還看得到，點下去卻沒反應。
  // 同一天停在最後一段（小複習），只教過 1 的那一天沒有小複習：開場說完就直接下課，很快就走到下課畫面。
  for (const sticker of [false, true]) {
    test(`下課畫面一出現就點左上角的房子 → 回首頁（${sticker ? '有' : '沒有'}貼紙）`, async ({ page }, info) => {
      test.skip(!want())
      test.setTimeout(2 * 60_000)
      const { k, c } = await setup(page, info, `下課點左上角-${sticker ? '貼紙' : '沒貼紙'}`, sticker)
      try {
        const day = await page.evaluate(() => {
          const d = new Date()
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        })
        await setMath(page, { next: 2, firm: false, day, n: 1, mode: 'new', part: 4, asked: 0, missed: 0 })
        k.behavior = '進數學課'
        if (!(await enter(k, c))) return
        const end = await page.waitForSelector('.cheer-scrim', { timeout: 20_000 }).catch(() => null)
        c.outcome('走到下課畫面', !!end, end ? ((await stickerUp(page)) ? '挑貼紙' : '沒有貼紙的下課') : '沒有走到下課')
        if (!end) return void (await c.once('end', '卡死', '開場說完沒有下課', `停在 ${await partNow(page)}`))
        // 一出現就點左上角：返回鍵原本的位置（Shell 的 stage-top、英文課的 en-back 都在這裡）
        k.behavior = '下課畫面一出現就點左上角的房子'
        const corner = await page.evaluate(() => {
          const hits = document.elementsFromPoint(72, 64)
          const top = hits[0] as HTMLElement | undefined
          return { top: top?.closest('[data-back]') ? 'back' : (top?.className?.toString() ?? '') }
        })
        await k.tap({ x: 72, y: 64, nav: true }, '左上角的房子')
        const home = await waitLive(page, (l) => l === 'home', 4000)
        c.outcome('點左上角 → 首頁', home === 'home', `到 ${home}（最上面的是 ${corner.top}）`)
        if (home !== 'home') await c.once('end-corner', '無法返回', '下課畫面左上角的房子看得到卻點不動', `停在 ${home}，左上角最上面是 ${corner.top}`)
      } finally {
        await c.flush().catch(() => {})
        finish(k, c, `下課點左上角-${sticker ? '貼紙' : '沒貼紙'}`)
      }
    })
  }

  test('上完一堂：連點門、亂點、連點、示範時搶著點和畫', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(12 * 60_000)
    // 這一堂指定有貼紙：要測挑貼紙時按返回（沒有貼紙的下課畫面在英文課測）
    const { k, c, n } = await setup(page, info, '上完一堂', true)
    try {
      k.behavior = '連點「數學數字」'
      if (!(await enter(k, c, true))) return
      await c.screenOk('進數學課')
      // 開場（今天的數字）一進來就搶著點
      k.behavior = '開場搶著點'
      await grabDuringTeach(k, c, LESSON)

      const seen = new Set<string>()
      const done = await play(k, c, async () => lessonEnd(page), { seen })
      // 今天的數字是 1、2：教過的數字湊不到 3 選 1，沒有小複習（plan.ts 的 reviewQs）
      const want = n < 3 ? PARTS.filter((p) => p !== 'review') : PARTS
      const parts = want.filter((p) => seen.has(p))
      c.outcome(`${want.length} 段都走得到`, parts.length === want.length, `走過：${[...seen].filter((s) => !s.startsWith('grab:')).join(' → ')}`)
      const pick = done && (await stickerUp(page))
      c.outcome('上完有貼紙', pick, pick ? '貼紙出現' : done ? '出現的是沒有貼紙的下課畫面' : '沒有走到下課')
      if (n < 3 && seen.has('review')) await c.once('review-1-2', '困惑', '只教了 1、2 卻出了小複習（湊不到 3 選 1）', `今天 ${n}`)
      if (done && parts.length < want.length) await c.once('skip-part', '困惑', '有一段沒上到就下課了', `走過：${parts.join('、')}`)

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
      const nextOk = kv?.part === PARTS.length && kv.n === n && kv.next === (again ? n : Math.min(11, n + 1))
      c.outcome('進度記下了', !done || nextOk, JSON.stringify(kv))
      if (done && !nextOk) await c.once('progress', '誤記作答', '上完一堂之後進度不對', `今天 ${n}，記成 ${JSON.stringify(kv)}`, false)

      // 作答紀錄：每一段都有、連點不重複記
      const rows = (await attempts(page)).filter((a) => a.phase === 'quiz')
      const games = [...new Set(rows.map((a) => a.game))]
      c.outcome('作答寫進紀錄', !done || ['m-count', 'm-give', 'm-compare', 'd-glyph'].every((g) => games.includes(g)), `${rows.length} 筆：${games.join('、')}`)
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
      const done = await play(k, c, async () => lessonEnd(page), { mess: 0.2, seen, budget: 4 * 60_000 })
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

  test('波波數到一半按返回：回到首頁就不再數（T-92）', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    const { k, c, n: seedN } = await setup(page, info, '數到一半返回')
    // 今天的新數字（3～6）：數數第一回合波波先示範，手指一個一個點、邊點邊數
    const n = 3 + (seedN % 4)
    await setMath(page, { next: n, firm: true })
    // 字幕會留著上一句（「One! Two!」），所以看結尾：波波數的數字（大寫開頭）、或「There are four!」
    const NUM = /\b(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)!$|There (are|is)/
    try {
      if (!(await enter(k, c))) return
      // 舊畫面淡出要一下子才卸載：剛數完一個數字、下一個還沒開始（波波的手指移到下一個）時按 Android 返回最容易出事
      for (let round = 0; round < 2; round++) {
        k.behavior = `示範數數中按 Android 返回（第 ${round + 1} 次）`
        const back = await page.evaluate(
          (src) =>
            new Promise<number | null>((res) => {
              const re = new RegExp(src)
              const end = performance.now() + 30_000
              const tick = () => {
                const now = performance.now()
                const vs = window.__toddler.voices
                const last = vs[vs.length - 1]
                const over = last ? (last.stopped ?? last.end) : Infinity
                if (last?.text && re.test(last.text) && !/There (are|is)/.test(last.text) && over <= now && now - over < 80) {
                  history.back()
                  return res(performance.now())
                }
                if (now > end) return res(null)
                setTimeout(tick, 15)
              }
              tick()
            }),
          NUM.source,
        )
        const heard = back == null ? await page.evaluate(() => window.__toddler.voices.slice(-12).map((v) => v.text ?? '（沒有字幕）').join('、')) : ''
        c.outcome('等到波波數數', back != null, back == null ? `30 秒內沒聽到數字：${heard}` : '')
        if (back == null) break
        const live = await waitLive(page, (l) => l === 'home', 4000)
        c.outcome('數數中 Android 返回 → 首頁', live === 'home', `到 ${live}`)
        if (live !== 'home') await c.once('count-back', '無法返回', '波波數數時按 Android 返回沒有回首頁', `停在 ${live}`)
        await k.wait(2500)
        const late = await page.evaluate(
          ({ t, src }) => window.__toddler.voices.filter((v) => v.t > t + 30 && v.text && new RegExp(src).test(v.text)).map((v) => `${Math.round(v.t - t)}ms ${v.text}`),
          { t: back, src: NUM.source },
        )
        c.outcome('返回後波波不再數', !late.length, late.join('、'))
        if (late.length) await c.once('count-after-back', '困惑', '波波數數時按返回，回到首頁還在數', late.join('、'))
        await c.flush()
        // 再進來一次（同一天、同一個數字），再試一次
        if (round === 0 && !(await enter(k, c))) return
      }
    } finally {
      finish(k, c, '數到一半返回')
    }
  })

  test('寫數字：描到一半抬筆，再從綠點重描', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(6 * 60_000)
    const { k, c, n } = await setup(page, info, '描到一半')
    try {
      // 今天的數字已經上到寫數字（中途離開過）：一進來就從寫數字開始。用複習（描兩次）才有第二次可以再描
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      await setMath(page, { next: n, firm: true, day, n, mode: 'review', part: PARTS.indexOf('write'), asked: 0, missed: 0 })
      if (!(await enter(k, c))) return
      const p = await firstPart(page)
      if (p !== 'write') return void (await c.once('to-write', '困惑', '沒有從寫數字開始', `從 ${p} 開始`))
      const ready = async () => {
        for (let i = 0; i < 80; i++) {
          if (await page.evaluate(() => !![...document.querySelectorAll('.ma-paper canvas[data-accepting="true"]')].length)) return true
          await k.wait(250)
        }
        return false
      }
      for (const how of ['restart', 'continue', 'restart'] as const) {
        // 兩次都描完、換到小複習了：不是卡住
        if ((await partNow(page)) !== 'write') break
        k.behavior = how === 'restart' ? '描到一半被打斷，從綠點重描' : '描到一半抬筆，接著描'
        if (!(await ready())) {
          await c.once('write-ready', '卡死', '寫數字一直不能畫', '')
          break
        }
        await k.wait(300)
        const ok = await halfThenAgain(k, how, { board: '.ma-paper', done: '.ma-reps i.on' })
        if (ok === null) continue
        c.outcome(k.behavior, ok, `今天的數字 ${n}`)
        if (!ok) await c.once(`half:${how}`, '卡死', `寫數字${how === 'restart' ? '描到一半被打斷，從綠點重描' : '描到一半抬筆再接著描'}，這一筆描不完`, `今天的數字 ${n}`)
        await c.flush()
      }
    } finally {
      finish(k, c, '描到一半')
    }
  })
})
