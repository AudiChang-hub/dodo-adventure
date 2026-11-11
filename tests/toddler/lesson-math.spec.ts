import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, alive, audit, checkDoubleRecords, doorAt, grabDuringTeach, ignoreNext, linesSince, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'
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

/** 「拿給波波」那一段的玩法（T-127，src/lessons/math/plays.ts）：每天輪流，測試指定一種（localStorage 的 dodo:variety:math.give） */
type GivePlay = 'give' | 'train' | 'plant'

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string, lessonSticker?: boolean, autoNext = true, play: GivePlay = 'give') {
  const seed = hashSeed(BASE_SEED, 'lesson-math', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `數學課／${name}`
  // 原本的測試都是測「拿給波波」：固定用那一種（不然每天輪到小火車、種花，.ma-give-plate 那些就找不到）
  await page.addInitScript((play) => localStorage.setItem('dodo:variety:math.give', play), play)
  await boot(page, seed, { to: 'home', lessonSticker, autoNext })
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

/** 把課往下上一步：數下一個、拿給波波（盤子裡不夠就拿、太多就拿回來、剛好就點勾勾）、點發光的（沒有就隨便挑一張）、沿著跑道描 */
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
    return { give, thing: thing[0] ?? null, hint, tiles, stroke }
  })
  if (!s) return
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

  test('開場說完不點大箭頭（T-118）：亂點、連點、手掌壓、發呆 30 秒，不會自己開始、返回鍵點得到；點了才往下', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '不點大箭頭', false, false)
    try {
      if (!(await enter(k, c))) return
      await ignoreNext(k, c, '開場說完', () =>
        page.evaluate(() => {
          const sc = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
          return [...(sc?.querySelectorAll('[data-lesson-part]') ?? [])].pop()?.getAttribute('data-lesson-part') ?? null
        }),
      )
      await c.flush()
    } finally {
      finish(k, c, '不點大箭頭')
    }
  })

  // T-104（第一、四次盲測）：拿給波波按完打勾，同一個位置馬上冒出別的功能（下一段的教學卡「再聽一次」），他一直點、聽到重播，看不懂。
  // 按完打勾後在同一個位置連點：不能觸發別的功能（T-135 起比多少第一次是手的示範：示範要照常做完、不能被記成作答）；停一下點答案才算作答
  test('拿給波波：按完打勾連點同一個位置，不會觸發別的功能', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '打勾後連點')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 同一天從「拿給波波」接著上，今天的數字 1（新的：比多少會先由手示範）
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
      const before = (await attempts(page)).length
      await k.tap(ok, '打勾')
      // 按完打勾，在同一個位置一直點（三歲：按了好像就好了，再點點看）
      k.behavior = '打勾後連點同一個位置'
      // 一直連點到比多少手的示範做完、輪到他選（最多 22 秒）。輪到他選以後還在連點，點到的那一堆就是他選的（選擇題本來就這樣，T-108）
      const end = Date.now() + 22_000
      let seenDemo = false
      while (Date.now() < end) {
        await k.tap(ok, '同一個位置')
        await k.wait(300)
        const d = await page.evaluate(() => !!document.querySelector('[data-teach-demo]'))
        if (d) seenDemo = true
        else if (seenDemo) break
      }
      const st = await page.evaluate(() => ({ part: [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') ?? null, demo: !!document.querySelector('[data-teach-demo]') }))
      const rows = (await attempts(page)).slice(before).filter((a) => a.game === 'm-compare')
      const taught = rows.some((a) => a.phase === 'teach')
      const answered = rows.filter((a) => a.phase !== 'teach').length
      const held = st.part === 'compare' && taught && answered === 0
      c.outcome('連點不會觸發別的功能（比多少手的示範照常做完、沒有被記成作答）', held, `${st.part}，示範${taught ? '做完了' : st.demo ? '還在' : '沒有做'}，作答 ${answered} 筆`)
      if (!held) await c.once('carry-tap', '困惑', '按完打勾後連點同一個位置，比多少的示範被跳過或被記成作答', `停在 ${st.part}，示範${taught ? '做完了' : '沒做完'}，作答 ${answered} 筆`)
      // 停一下、點答案：照常作答（原本的功能還在）
      if (held) {
        k.behavior = '停一下再點答案'
        await k.wait(1500)
        await k.tap((await at('.ma-quiz .ma-tile[data-answer]'))!, '點答案')
        let got = false
        for (let i = 0; i < 20 && !got; i++) {
          await k.wait(250)
          got = (await attempts(page)).slice(before).some((a) => a.game === 'm-compare' && a.phase !== 'teach')
        }
        c.outcome('停一下再點答案：記一筆作答', got, got ? '' : '點了沒有反應')
        if (!got) await c.once('compare-dead', '卡死', '比多少停一下再點答案沒有反應', '')
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
      // 能動手了：比多少出來、擋板收掉（手的示範中點「多」的那一堆就換他，T-135）
      // 等 1.5 秒（中間一能動手就記下那一刻，用頁面裡的時間）
      const canAct = () =>
        page
          .waitForFunction(
            () => {
              const part = [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part')
              const can = part === 'compare' && !!document.querySelector('.ma-lesson [data-accepting="true"]')
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
      /** T-124：交出去以後勾勾變灰；等的時候點畫面，勾勾晃一下（還沒好） */
      let grey = false
      let shook = 0
      let tapsInGive = 0
      const end = Date.now() + 30_000
      while (Date.now() < end) {
        const now = await canAct()
        if (now) {
          waited = now - t0
          if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') {
            await k.wait(600)
            await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/比多少能動手.png` })
          }
          break
        }
        // 點一下打勾原本的位置：要有「看這裡、等一下」的圈圈
        const before = await page.evaluate(() => performance.now())
        const inGive = await page.evaluate(() => !!document.querySelector('.ma-give-done.is-done:not(.is-gone)'))
        await k.tap(ok, '等的時候點一下')
        taps++
        if (inGive) {
          tapsInGive++
          const look = await page.evaluate(() => {
            const b = document.querySelector('.ma-give-done')
            return { grey: !!b?.classList.contains('is-used'), moving: (b?.getAnimations() ?? []).some((a) => a.playState === 'running') }
          })
          if (look.grey) grey = true
          if (look.moving) shook++
        }
        const ring = await page
          .waitForFunction((t) => [...document.querySelectorAll('.not-yet')].length > 0 && performance.now() - t < 900, before, { timeout: 600 })
          .then(() => true)
          .catch(() => false)
        if (ring) answered++
        if (!ring) silent.push(`${((before - t0) / 1000).toFixed(1)}s ${await page.evaluate(() => (document.querySelector('[data-teach-demo]') ? '比多少示範' : ([...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') ?? '?')))}`)
      }
      const heard = await page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t && v.text).map((v) => `${((v.t - t) / 1000).toFixed(1)}s ${v.text}`), t0)
      const secs = waited < 0 ? -1 : Math.round(waited / 100) / 10
      c.outcome('按完打勾 13 秒內就能動手', secs > 0 && secs <= 13, `${secs < 0 ? '30 秒內都不能動手' : `${secs} 秒`}；聽到：${heard.join('、')}`)
      if (!(secs > 0 && secs <= 13)) await c.once('give-wait', '困惑', '拿給波波按完打勾，要等很久才能動手', `${secs} 秒；聽到：${heard.join('、')}`)
      c.outcome('等的時候點畫面，每一下都有「等一下」的圈圈', taps > 0 && answered === taps, `${answered}/${taps}${silent.length ? `；沒有回應：${silent.join('、')}` : ''}`)
      // 交出去以後、波波道謝的時候（盲測 f255333 數學 3/3：點了擋板看不到反應）：勾勾變灰、點了晃一下
      c.outcome('道謝的時候：勾勾變灰、點畫面勾勾晃一下（T-124）', tapsInGive === 0 || (grey && shook === tapsInGive), `點了 ${tapsInGive} 下，變灰：${grey ? '有' : '沒有'}，晃了 ${shook} 次`)
      if (tapsInGive > 0 && !(grey && shook === tapsInGive)) await c.once('give-nope', '困惑', '交給波波以後點畫面，勾勾沒有變灰或沒有晃（看不出還沒好）', `點了 ${tapsInGive} 下，變灰：${grey ? '有' : '沒有'}，晃了 ${shook} 次`)
      if (taps > 0 && answered < taps) await c.once('give-silent', '困惑', '按完打勾等的時候點畫面，看不出要等一下（沒有「看這裡」的圈圈）', `${answered}/${taps}；沒有回應：${silent.join('、')}`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '打勾後多久能動手')
    }
  })

  // T-106（第六次盲測第 7、8 步，報告標「要再確認」）：按完打勾（手多點一下），下一個動作是從恐龍拖到盤子，程式記到的卻是「再聽一次」。
  // 重現：按完打勾後 0.3～2 秒內點同一個位置、點附近、從恐龍拖到盤子 → 不能觸發「再聽一次」（下一段的教學卡要停在等他點），每一下都有「等一下」的回應。
  // 再照盲測的時間點（AI 小男生的大腦想了 11 秒：截圖在打勾後 2 秒，拖的時候已經是打勾後約 13 秒）拖一次，記下那時候手指落在什麼上面。
  test('拿給波波：按完打勾 0.3～2 秒內再點、再拖，不會跳過比多少的示範', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '打勾後馬上再點')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 跟盲測一樣：同一天從「拿給波波」接著上，今天的數字 1（新的：比多少會先由手示範）
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
      /** 這一點現在是什麼（aria-label 或 class） */
      const what = (p: Pt) =>
        page.evaluate(({ x, y }) => {
          const e = document.elementFromPoint(x, y)?.closest('[aria-label],button,[class]')
          return e?.getAttribute('aria-label') ?? e?.getAttribute('class')?.split(' ')[0] ?? '?'
        }, p)
      k.behavior = '拿一個給波波、按打勾（手多點一下）'
      await k.tap((await at('.ma-give-thing'))!, '拿一個')
      await k.wait(700)
      const ok = (await at('.ma-give-done'))!
      // 盲測他想再拿的那一隻：盤子外面還沒拿的第二個
      const pile = await page.evaluate(() => {
        const r = [...document.querySelectorAll('.ma-give-thing')].filter((e) => !e.getAttribute('aria-label')?.startsWith('拿回'))[1]?.getBoundingClientRect()
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
      })
      const plate = await page.evaluate(() => {
        const r = document.querySelector('.ma-give-plate')!.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      const t0 = await page.evaluate(() => performance.now())
      await k.tap(ok, '打勾')
      await k.wait(60)
      await k.tap(ok, '手多點一下')
      // 0.3～2 秒內：點同一個位置、點附近、從恐龍拖到盤子
      k.behavior = '按完打勾 0.3～2 秒內再點、再拖'
      const plan: { ms: number; how: string; p: Pt; drag?: Pt[] }[] = [
        { ms: 300, how: '點同一個位置', p: ok },
        { ms: 650, how: '點附近（右下 30 px）', p: { x: ok.x + 30, y: ok.y + 30 } },
        { ms: 1000, how: '點同一個位置', p: ok },
        { ms: 1300, how: '點附近（上面 40 px）', p: { x: ok.x, y: ok.y - 40 } },
        // 拖一次要 1 秒多，放最後：2 秒內按下去
        { ms: 1700, how: '從恐龍拖到盤子', p: pile!, drag: [pile!, plate] },
      ]
      const early: string[] = []
      let answered = 0
      for (const s of plan) {
        const now = await page.evaluate(() => performance.now())
        if (now - t0 < s.ms) await k.wait(s.ms - (now - t0))
        const t = await page.evaluate(() => performance.now())
        const hit = await what(s.p)
        // 先開始看有沒有「等一下」的圈圈（拖的時候圈圈在按下去那一刻出來，拖完可能已經淡掉）
        await page.evaluate(() => document.querySelectorAll('.not-yet').forEach((e) => e.setAttribute('data-seen', '')))
        const watch = page
          .waitForFunction(() => !!document.querySelector('.not-yet:not([data-seen])'), null, { timeout: 2500, polling: 30 })
          .then(() => true)
          .catch(() => false)
        if (s.drag) await k.drag(s.drag, { stepMs: 8, label: s.how })
        else await k.tap(s.p, s.how)
        const ring = await watch
        if (ring) answered++
        early.push(`${((t - t0) / 1000).toFixed(1)}s ${s.how}→${hit}${ring ? '（等一下的圈圈）' : ''}`)
      }
      // 等比多少手的示範做完、輪到他選（T-135）：早先那幾下不能把示範跳過，也不能被記成作答
      const demoEnd = await page
        .waitForFunction(() => (!document.querySelector('[data-teach-demo]') && document.querySelector('.ma-quiz .ma-tile') ? performance.now() : false), null, { timeout: 30_000, polling: 50 })
        .then((h) => h.jsonValue() as Promise<number>)
        .catch(() => null)
      const voices = () => page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t && v.text).map((v) => `${((v.t - t) / 1000).toFixed(1)}s ${v.text}`), t0)
      const rows = (await attempts(page)).filter((a) => a.game === 'm-compare')
      const shown = rows.some((a) => a.phase === 'teach')
      const picked = rows.filter((a) => a.phase !== 'teach').length
      const heard = await voices()
      const held = !!demoEnd && shown && picked === 0 && heard.some((v) => /This side has (more|fewer)/.test(v))
      c.outcome('0.3～2 秒內的點擊不會跳過比多少的示範（手點了多的那一堆、念了 This side has more）', held, `${early.join('、')}；示範做完是打勾後 ${demoEnd ? ((demoEnd - t0) / 1000).toFixed(1) : '?'} 秒；作答 ${picked} 筆；聽到：${heard.join('、')}`)
      if (!held) await c.once('give-early-skip', '困惑', '按完打勾 0.3～2 秒內的點擊，跳過了比多少的示範或被記成作答', early.join('、'))
      c.outcome('0.3～2 秒內每一下都有「等一下」的回應', answered === plan.length, `${answered}/${plan.length}`)
      if (answered < plan.length) await c.once('give-early-silent', '困惑', '按完打勾 0.3～2 秒內點畫面，看不出要等一下', `${answered}/${plan.length}：${early.join('、')}`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '打勾後馬上再點')
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
      // 每一段出現過就記下來（T-108 之後開場、示範都可以搶，搶著點的時候數數可能整段就做完了，play() 看不到）
      await page.evaluate(() => {
        const w = window as unknown as { __parts?: string[] }
        w.__parts = []
        setInterval(() => {
          const p = [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part')
          if (p && !w.__parts!.includes(p)) w.__parts!.push(p)
        }, 100)
      })
      // 開場（今天的數字）一進來就搶著點
      k.behavior = '開場搶著點'
      await grabDuringTeach(k, c, LESSON)

      const seen = new Set<string>()
      const done = await play(k, c, async () => lessonEnd(page), { seen })
      for (const p of await page.evaluate(() => (window as unknown as { __parts?: string[] }).__parts ?? [])) seen.add(p)
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

      // 作答紀錄：每一段都有、連點不重複記。
      // 拿給波波：新的數字那一天先示範（plan.ts 的 giveRounds，demo），手剛示範過同一個數量再交出去記成一起練（guided，T-111），
      // 所以只看「有沒有記」（quiz 或 guided），不只看 quiz（T-123：以前只看 quiz，新數字那天一定少 m-give，報告一直打 ❌）
      const rows = (await attempts(page)).filter((a) => a.phase === 'quiz' || a.phase === 'guided')
      const games = [...new Set(rows.map((a) => a.game))]
      const byPhase = (ph: string) => [...new Set(rows.filter((a) => a.phase === ph).map((a) => a.game))].join('、') || '無'
      const recOk = ['m-count', 'm-give', 'm-compare', 'd-glyph'].every((g) => games.includes(g))
      c.outcome('作答寫進紀錄', !done || recOk, `${rows.length} 筆；自己答：${byPhase('quiz')}；一起練：${byPhase('guided')}`)
      if (done && !recOk) await c.once('records', '誤記作答', '上完一堂，有一段沒有寫進作答紀錄', `有記的：${games.join('、')}`, false)
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

  // T-106（第六次盲測描小 s 快描完還說「不知道對不對」）：寫數字跟英文描字一樣——
  // 描到四成放手：剩下的那一段有會動的引導、終點有星星；接著描到 66%（盲測小 s 放手的地方）放手：帶著描完
  test('寫數字：描到一半看得到還剩哪一段，描過六成多放手就帶著描完', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '描數字快完')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 今天的數字 2（一筆、起點終點不在同一個地方），同一天從寫數字接著上
      await setMath(page, { next: 2, firm: true, day, n: 2, mode: 'review', part: PARTS.indexOf('write'), asked: 0, missed: 0 })
      if (!(await enter(k, c))) return
      const p = await firstPart(page)
      if (p !== 'write') return void (await c.once('to-write', '困惑', '沒有從寫數字開始', `從 ${p} 開始`))
      const ready = await page
        .waitForFunction(() => !![...document.querySelectorAll('.ma-paper canvas[data-accepting="true"]')].length, null, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (!ready) return void (await c.once('write-ready', '卡死', '寫數字一直不能畫', ''))
      await k.wait(400)
      const along = (from: number, to: number, n = 12) =>
        page.evaluate(
          ({ from, to, n }) => {
            const p = [...document.querySelectorAll('.ma-paper')].pop()!.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
            const m = p.getScreenCTM()!
            const len = p.getTotalLength()
            return Array.from({ length: n + 1 }, (_, i) => {
              const q = p.getPointAtLength(len * (from + ((to - from) * i) / n))
              return new DOMPoint(q.x, q.y).matrixTransform(m)
            }).map((s) => ({ x: s.x, y: s.y }))
          },
          { from, to, n },
        )
      k.behavior = '寫 2 描到四成放手'
      await k.drag(await along(0, 0.4), { stepMs: 16, label: '描 2 到四成' })
      await k.wait(900)
      const guide = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.ma-paper')].pop()
        const box = (e: Element | null | undefined) => {
          const r = e?.getBoundingClientRect()
          return !!r && r.width > 2 && r.height > 2
        }
        return { rest: box(b?.querySelector('[data-trace-rest]')), goal: box(b?.querySelector('[data-trace-goal]')) }
      })
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/寫數字描到四成放手.png` })
      c.outcome('描到四成放手：看得到剩下的那一段（會動的引導）和終點', guide.rest && guide.goal, `引導${guide.rest ? '有' : '沒有'}、終點記號${guide.goal ? '有' : '沒有'}`)
      if (!(guide.rest && guide.goal)) await c.once('write-rest', '困惑', '寫數字描到一半放手，剩下的那一段看不出還要描哪裡、描到哪裡算好', `引導${guide.rest ? '有' : '沒有'}、終點記號${guide.goal ? '有' : '沒有'}`)
      k.behavior = '從斷掉的地方接著描到 66% 放手'
      await k.drag(await along(0.38, 0.66, 8), { stepMs: 16, label: '接著描到 66%' })
      const ok = await page
        .waitForFunction(() => !!document.querySelector('.ma-paper [data-trace-finished]'), null, { timeout: 2500 })
        .then(() => true)
        .catch(() => false)
      c.outcome('描過六成多放手：帶著描完', ok, ok ? '' : '還在等他描剩下的')
      if (!ok) await c.once('write-almost', '困惑', '寫數字描過六成多放手，沒有帶著描完，還要他自己描剩下的', '')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '描數字快完')
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
  // ── T-135（盲測 becf39a 數學 2、9792b5d 數學 2：比多少「一直點都不知道要幹嘛」離開）────────────────
  // 比多少第一次：手先點「多」的那一堆給他看（不靠英文）；示範中點空白、點另一堆不會跳過示範；點「多」的那一堆就換他；
  // 輪到他選 10 秒沒點：手再指一次答案、再念一次題目，那一下算一起練
  /** 同一天從比多少接著上（今天的數字 1，比多少第一次：先由手示範）；回傳示範有沒有出來 */
  async function toCompareDemo(page: Page, k: Toddler, c: Checker) {
    const day = await page.evaluate(() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
    await setMath(page, { next: 2, firm: false, day, n: 1, mode: 'new', part: PARTS.indexOf('compare'), asked: 0, missed: 0 })
    if (!(await enter(k, c))) return false
    const ok = await page
      .waitForFunction(() => !!document.querySelector('[data-teach-demo]'), null, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    if (!ok) await c.once('no-demo', '困惑', '比多少第一次沒有手的示範', `停在 ${await partNow(page)}`)
    return ok
  }
  const box = (page: Page, sel: string) =>
    page.evaluate((sel) => {
      const r = [...document.querySelectorAll(sel)].pop()?.getBoundingClientRect()
      return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom } : null
    }, sel)

  test('比多少第一次（T-135）：手先點多的那一堆；示範中亂點不會跳過；10 秒沒點手再指一次', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '比多少示範')
    try {
      if (!(await toCompareDemo(page, k, c))) return
      const t0 = await page.evaluate(() => performance.now())
      // 兩堆出來（念題目）以後：點空白、點另一堆（少的那一堆）——都只有「看這裡」的圈圈，示範照常做
      await page.waitForFunction(() => [...document.querySelectorAll('.ma-teach .ma-tile')].some((e) => getComputedStyle(e).opacity === '1'), null, { timeout: 10_000 }).catch(() => {})
      k.behavior = '示範中點空白、點另一堆'
      const other = await box(page, '.ma-teach .ma-tile:not([data-answer])')
      const ring = () =>
        page
          .waitForFunction(() => !!document.querySelector('.not-yet'), null, { timeout: 900, polling: 30 })
          .then(() => true)
          .catch(() => false)
      let rings = 0
      // 示範畫面裡、兩堆上面的空白（離兩堆都超過 NEAR_PX）
      const blank = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.ma-teach .ma-tile')].map((e) => e.getBoundingClientRect())
        const top = Math.min(...t.map((r) => r.top))
        return { x: (t[0].right + t[1].left) / 2, y: top - 50 }
      })
      await k.tap(blank, '示範中點空白')
      if (await ring()) rings++
      await k.wait(400)
      if (other) {
        await k.tap({ x: other.x, y: other.y }, '示範中點另一堆')
        if (await ring()) rings++
      }
      const still = await page.evaluate(() => !!document.querySelector('[data-teach-demo]'))
      c.outcome('示範中點空白、點另一堆：示範照常做、有「看這裡」的圈圈', still && rings === 2, `示範${still ? '還在' : '被跳過了'}，圈圈 ${rings}/2`)
      if (!still) await c.once('demo-skipped', '困惑', '比多少的示範被亂點跳過了（他沒看到手點多的那一堆）', '')
      // 手移到「多」的那一堆、點下去：那一堆亮綠框（不用聽懂英文）
      let onPile = false
      const lit = await page
        .waitForFunction(() => !!document.querySelector('.ma-teach .ma-tile[data-answer].correct'), null, { timeout: 12_000, polling: 50 })
        .then(() => true)
        .catch(() => false)
      const hand = await box(page, '.ma-teach .demo-hand')
      const pile = await box(page, '.ma-teach .ma-tile[data-answer]')
      if (hand && pile) onPile = hand.x >= pile.l && hand.x <= pile.r && hand.y >= pile.t - 40 && hand.y <= pile.b + 40
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/比多少示範-手點多的那一堆.png` })
      c.outcome('手點了多的那一堆、那一堆亮起來', lit && onPile, `亮${lit ? '了' : '沒有'}，手${onPile ? '在那一堆上' : hand ? '不在那一堆上' : '不見了'}`)
      if (!(lit && onPile)) await c.once('demo-hand', '困惑', '比多少的示範看不出手點的是哪一堆', '')
      // 示範做完換題目：記一筆教學、還沒有作答
      const quiz = await page
        .waitForFunction(() => !document.querySelector('[data-teach-demo]') && !!document.querySelector('.ma-quiz .ma-tile.cue'), null, { timeout: 15_000, polling: 50 })
        .then(() => true)
        .catch(() => false)
      const tq = await page.evaluate(() => performance.now())
      const rows = (await attempts(page)).filter((a) => a.game === 'm-compare')
      c.outcome('示範做完換他選：記一筆教學、沒有作答', quiz && rows.some((a) => a.phase === 'teach') && !rows.some((a) => a.phase !== 'teach'), `${quiz ? '換題目了' : '沒有換題目'}；紀錄：${rows.map((a) => a.phase).join('、') || '沒有'}；示範 ${((tq - t0) / 1000).toFixed(1)} 秒`)
      if (!quiz) return void (await c.once('demo-stuck', '卡死', '比多少示範做完沒有換題目', ''))
      // 發呆：10 秒沒點，手再指一次答案（答案亮起來）、再念一次題目
      k.behavior = '輪到他選，發呆'
      const nudged = await page
        .waitForFunction(() => (document.querySelector('.ma-quiz .ma-tile.hint') && document.querySelector('.ma-quiz .demo-hand') ? performance.now() : false), null, { timeout: 16_000, polling: 100 })
        .then((h) => h.jsonValue() as Promise<number>)
        .catch(() => null)
      const secs = nudged ? (nudged - tq) / 1000 : -1
      c.outcome('輪到他選 10 秒沒點：手再指一次答案', secs >= 8 && secs <= 13, secs < 0 ? '16 秒內手都沒有出來' : `${secs.toFixed(1)} 秒`)
      if (!(secs >= 8 && secs <= 13)) await c.once('compare-nudge', '困惑', '比多少發呆時，手沒有在 10 秒左右再指一次答案', `${secs.toFixed(1)} 秒`)
      // 照著手點答案：算一起練（不是自己答的）
      await k.tap((await box(page, '.ma-quiz .ma-tile[data-answer]'))!, '照著手點答案')
      let row: { phase: string } | undefined
      for (let i = 0; i < 20 && !row; i++) {
        await k.wait(250)
        row = (await attempts(page)).find((a) => a.game === 'm-compare' && a.phase !== 'teach')
      }
      c.outcome('照著手點答案：記成一起練', row?.phase === 'guided', row ? row.phase : '沒有記')
      if (row?.phase !== 'guided') await c.once('compare-led', '誤記作答', '比多少照著發呆手點的答案沒有記成一起練', row?.phase ?? '沒有記')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '比多少示範')
    }
  })

  test('比多少第一次（T-135）：示範中點多的那一堆，直接換他', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '比多少示範搶點')
    try {
      if (!(await toCompareDemo(page, k, c))) return
      // 兩堆出來就點「多」的那一堆（看手學會了）
      await page.waitForFunction(() => [...document.querySelectorAll('.ma-teach .ma-tile[data-answer]')].some((e) => getComputedStyle(e).opacity === '1'), null, { timeout: 10_000 }).catch(() => {})
      k.behavior = '示範中點多的那一堆'
      const t1 = await page.evaluate(() => performance.now())
      await k.tap((await box(page, '.ma-teach .ma-tile[data-answer]'))!, '示範中點多的那一堆')
      const quiz = await page
        .waitForFunction(() => (!document.querySelector('[data-teach-demo]') && document.querySelector('.ma-quiz .ma-tile') ? performance.now() : false), null, { timeout: 4000, polling: 50 })
        .then((h) => h.jsonValue() as Promise<number>)
        .catch(() => null)
      const rows = (await attempts(page)).filter((a) => a.game === 'm-compare')
      c.outcome('示範中點多的那一堆：直接換他（不等示範念完、不記成作答）', !!quiz && rows.some((a) => a.phase === 'teach') && !rows.some((a) => a.phase !== 'teach'), quiz ? `${((quiz - t1) / 1000).toFixed(1)} 秒換題目` : '4 秒內沒有換題目')
      if (!quiz) await c.once('demo-grab', '困惑', '比多少示範中點了多的那一堆，還要等示範念完', '')
      // 題目照常可以答
      if (quiz) {
        await page.waitForFunction(() => !!document.querySelector('.ma-quiz .ma-tile.cue'), null, { timeout: 10_000 }).catch(() => {})
        await k.tap((await box(page, '.ma-quiz .ma-tile[data-answer]'))!, '點答案')
        let got = false
        for (let i = 0; i < 20 && !got; i++) {
          await k.wait(250)
          got = (await attempts(page)).some((a) => a.game === 'm-compare' && a.phase !== 'teach')
        }
        c.outcome('換他以後照常作答', got, got ? '' : '點了沒有反應')
        if (!got) await c.once('compare-dead', '卡死', '比多少示範被搶掉以後，點答案沒有反應', '')
      }
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '比多少示範搶點')
    }
  })

  test('寫數字（T-135）：沒描好兩次，筆帶著描完、算過關；第二遍不說 One more time', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '描數字沒描好')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 今天的數字 1（盲測描的就是 1），同一天從寫數字接著上
      await setMath(page, { next: 2, firm: true, day, n: 1, mode: 'review', part: PARTS.indexOf('write'), asked: 0, missed: 0 })
      if (!(await enter(k, c))) return
      const p = await firstPart(page)
      if (p !== 'write') return void (await c.once('to-write', '困惑', '沒有從寫數字開始', `從 ${p} 開始`))
      const ready = () =>
        page
          .waitForFunction(() => !![...document.querySelectorAll('.ma-paper canvas[data-accepting="true"]')].length && !document.querySelector('[data-demo="1"]'), null, { timeout: 30_000 })
          .then(() => true)
          .catch(() => false)
      if (!(await ready())) return void (await c.once('write-ready', '卡死', '寫數字一直不能畫', ''))
      await k.wait(400)
      const along = (from: number, to: number, n = 10) =>
        page.evaluate(
          ({ from, to, n }) => {
            const p = [...document.querySelectorAll('.ma-paper')].pop()!.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
            const m = p.getScreenCTM()!
            const len = p.getTotalLength()
            return Array.from({ length: n + 1 }, (_, i) => {
              const q = p.getPointAtLength(len * (from + ((to - from) * i) / n))
              return new DOMPoint(q.x, q.y).matrixTransform(m)
            }).map((s) => ({ x: s.x, y: s.y }))
          },
          { from, to, n },
        )
      const finished = () => page.evaluate(() => !!document.querySelector('.ma-paper [data-trace-finished]'))
      // 第一次：描到三成放手（沒描好一次：綠點等他接著描，不帶著描完）
      k.behavior = '描到三成放手'
      await k.drag(await along(0, 0.3), { stepMs: 16, label: '描 1 到三成' })
      await k.wait(1500)
      const first = await finished()
      c.outcome('沒描好一次：還讓他自己描', !first, first ? '第一次就帶著描完了' : '')
      // 第二次：從斷掉的地方再描一點又放手 → 筆帶著描完、照樣慶祝
      k.behavior = '接著描一點又放手'
      await k.drag(await along(0.28, 0.45), { stepMs: 16, label: '接著描到四成五放手' })
      const t2 = Date.now()
      const done = await page
        .waitForFunction(() => !!document.querySelector('.ma-paper [data-trace-finished]'), null, { timeout: 5000 })
        .then(() => true)
        .catch(() => false)
      c.outcome('沒描好兩次：筆帶著描完、慶祝（算過關）', done, done ? `${((Date.now() - t2) / 1000).toFixed(1)} 秒` : '5 秒內沒有描完')
      if (!done) await c.once('write-twice', '困惑', '寫數字沒描好兩次，還要他一直描', '')
      let row: { ok: boolean } | undefined
      for (let i = 0; i < 12 && !row; i++) {
        await k.wait(250)
        row = (await attempts(page)).find((a) => a.game === 'd-glyph' && a.phase !== 'teach')
      }
      c.outcome('筆帶著描完的記成沒有自己描好', !!row && !row.ok, row ? (row.ok ? '記成描好' : '記成筆帶著的') : '沒有記')
      if (row?.ok) await c.once('write-helped', '誤記作答', '寫數字筆帶著描完，記成自己描好', '')
      // 第二遍（點下一步之後）：開頭說 Let's write one!，不說 One more time!（聽起來像沒描好要重來）
      const t3 = await page.evaluate(() => performance.now())
      if (!(await ready())) return void (await c.once('write-ready2', '卡死', '第二遍一直不能畫', ''))
      const said = await page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t && v.text).map((v) => v.text ?? ''), t3)
      const okLine = said.some((v) => /write/i.test(v)) && !said.some((v) => /one more time/i.test(v))
      c.outcome('第二遍開頭說 Let’s write one!、不說 One more time', okLine, said.join('、'))
      if (!okLine) await c.once('write-again-line', '困惑', '寫數字第二遍的開頭聽起來像沒描好要重來', said.join('、'))
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '描數字沒描好')
    }
  })

  // T-139（盲測 9792b5d 2:31、becf39a 1:24、61ee1cf 1:09，數學 2 都在這裡離開）：小火車按勾勾交出去、火車開走以後，
  // 左邊剩下的東西、灰色的勾勾還留在畫面上，看起來像還有一題要做；他一直點、只有圈圈，「我一直點都不對，不知道要幹嘛」按返回。
  // 交出去以後：剩下的東西收起來、勾勾不留著讓他點，要幾個的數字念完也收起來；點畫面看得出等一下；很快就出現下一步的大箭頭
  test('小火車開走（T-139）：交出去以後沒有看起來還要做的東西，點了看得出等一下，很快就能往下', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '火車開走', false, true, 'train')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 跟盲測一樣：今天的數字 1、從「拿給波波」那一段接著上，抽到小火車
      await setMath(page, { next: 2, firm: false, day, n: 1, mode: 'new', part: 1, asked: 0, missed: 0 })
      if (!(await enter(k, c))) return
      const ready = await page
        .waitForFunction(() => !!document.querySelector('.ma-load .ma-give-thing:not(.is-on)') && !document.querySelector('.ma-load [data-accepting="false"]') && !document.querySelector('[data-demo="1"]'), null, { timeout: 60_000 })
        .then(() => true)
        .catch(() => false)
      if (!ready) return void (await c.once('no-train', '卡死', '沒有走到小火車（或一直不能放）', `停在 ${await partNow(page)}`))
      await k.wait(500)
      const at = (sel: string) =>
        page.evaluate((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect()
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
        }, sel)
      k.behavior = '放一個上火車、按勾勾（手多點一下）'
      const left = (await at('.ma-load .ma-give-thing:not(.is-on)'))!
      await k.tap(left, '放一個上火車')
      await k.wait(800)
      const ok = (await at('.ma-give-done'))!
      const t0 = await page.evaluate(() => performance.now())
      await k.tap(ok, '按勾勾')
      await k.wait(60)
      await k.tap(ok, '手多點一下')
      await k.wait(1000)
      /** 畫面上還看得到（不透明度 0.3 以上）的：剩下的東西、勾勾、要幾個的數字 */
      const look = () =>
        page.evaluate(() => {
          const vis = (e: Element | null) => !!e && Number(getComputedStyle(e).opacity) > 0.3 && (e as HTMLElement).getBoundingClientRect().width > 2
          const root = [...document.querySelectorAll('.ma-load')].pop()
          return {
            left: [...(root?.querySelectorAll('.ma-give-thing:not(.is-on)') ?? [])].filter(vis).length,
            check: vis(root?.querySelector('.ma-give-done') ?? null),
            want: vis(root?.querySelector('.ma-give-want') ?? null),
          }
        })
      const l1 = await look()
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/小火車開走-1秒.png` })
      c.outcome('火車開走 1 秒：剩下的東西收起來、勾勾不留著讓他點', l1.left === 0 && !l1.check, `剩下的東西還看得到 ${l1.left} 個，勾勾${l1.check ? '還在' : '收起來了'}`)
      if (l1.left > 0 || l1.check) await c.once('train-leftover', '困惑', '小火車開走以後，剩下的東西、勾勾還在畫面上，看起來像還有一題要做', `剩下 ${l1.left} 個，勾勾${l1.check ? '還在' : '不在'}`)
      // 點剛剛剩下的東西那裡：要有「看這裡、等一下」的圈圈
      k.behavior = '火車開走的時候點剩下的東西'
      const before = await page.evaluate(() => performance.now())
      await k.tap(left, '點剛剛剩下的東西那裡')
      const ring = await page
        .waitForFunction((t) => [...document.querySelectorAll('.not-yet')].length > 0 && performance.now() - t < 900, before, { timeout: 600 })
        .then(() => true)
        .catch(() => false)
      c.outcome('火車開走的時候點畫面：有「等一下」的圈圈', ring, '')
      if (!ring) await c.once('train-silent', '困惑', '小火車開走的時候點畫面沒有反應', '')
      // 下一步的大箭頭：多久出來；那時候要幾個的數字也收起來了
      const arrow = await page
        .waitForFunction(() => {
          const b = document.querySelector('.next-step')
          return b && b.getBoundingClientRect().width > 4 ? performance.now() : false
        }, null, { timeout: 15_000, polling: 50 })
        .then((h) => h.jsonValue() as Promise<number>)
        .catch(() => null)
      const secs = arrow ? (arrow - t0) / 1000 : -1
      // 箭頭出來 0.6 秒內（收起來的淡出做完）。自動點箭頭是出來 1.5 秒以後
      await k.wait(600)
      const l2 = await look()
      const heard = await page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t && v.text).map((v) => `${((v.t - t) / 1000).toFixed(1)}s ${v.text}`), t0)
      c.outcome('按勾勾後 4 秒內出現下一步的大箭頭', secs > 0 && secs <= 4, `${secs < 0 ? '15 秒內都沒有' : `${secs.toFixed(1)} 秒`}；聽到：${heard.join('、')}`)
      if (!(secs > 0 && secs <= 4)) await c.once('train-wait', '困惑', '小火車開走以後要等很久才能往下', `${secs.toFixed(1)} 秒`)
      c.outcome('大箭頭出來時：畫面上只剩火車開走的樣子（要幾個的數字、剩下的東西、勾勾都收起來）', !l2.want && l2.left === 0 && !l2.check, JSON.stringify(l2))
      if (l2.want || l2.left > 0 || l2.check) await c.once('train-end', '困惑', '小火車做完、出現大箭頭時，畫面上還有看起來要做的東西', JSON.stringify(l2))
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '火車開走')
    }
  })

  // ── T-127：拿給波波的另外兩種玩法（小火車 Train.tsx、種花 Plant.tsx，流程在 Load.tsx）────────────────
  // 三歲的操作全部做一次：示範時搶點、連點同一個、多指（手掌）、拖到一半放手、多拿（小火車）、空的就按勾勾、發呆、
  // 返回再進來（同一天同一種玩法、接著上）、做完記成 give:N（選項照拿給波波）、往下一段走得到。
  for (const play of ['train', 'plant'] as const) {
    const title = play === 'train' ? '小火車' : '種花'
    test(`${title}（T-127）：示範時搶點、連點、多指、拖到一半放手、發呆、返回再進來，做完記成 give:N`, async ({ page }, info) => {
      test.skip(!want())
      test.setTimeout(6 * 60_000)
      const lite = !!info.project.metadata?.lite
      const { k, c } = await setup(page, info, title, false, true, play)
      try {
        const day = await page.evaluate(() => {
          const d = new Date()
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        })
        // 同一天從「拿給波波」那一段接著上，今天的數字 3（第一次拿 3 個、第一次玩這種：先示範）
        const N = 3
        await setMath(page, { next: N + 1, firm: false, day, n: N, mode: 'new', part: 1, asked: 0, missed: 0 })
        k.behavior = '連點「數學數字」進來'
        if (!(await enter(k, c, true))) return

        const st = () =>
          page.evaluate(() => {
            const root = [...document.querySelectorAll('.ma-load')].pop()
            if (!root) return null
            const c = (el: Element | null | undefined) => {
              if (!el) return null
              const r = el.getBoundingClientRect()
              return r.width > 4 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
            }
            const things = [...root.querySelectorAll('.ma-give-thing')]
            const taken = (e: Element) => (e.getAttribute('aria-label') ?? '').startsWith('拿回')
            const slots = [...root.querySelectorAll('.ma-slot')]
            return {
              play: root.getAttribute('data-play'),
              want: Number(root.querySelector('.ma-give-num')?.textContent ?? 0),
              dots: root.querySelectorAll('.ma-give-dots i').length,
              slots: slots.length,
              filled: slots.filter((e) => e.classList.contains('is-full')).length,
              free: things.filter((e) => !taken(e)).map(c).filter(Boolean) as { x: number; y: number }[],
              taken: things.filter(taken).map(c).filter(Boolean) as { x: number; y: number }[],
              done: c(root.querySelector('.ma-give-done')),
              extra: root.querySelectorAll('.is-extra').length,
              demo: !!document.querySelector('[data-demo="1"]'),
              glad: !!root.querySelector('.ma-give-done.is-done'),
            }
          })
        type St = NonNullable<Awaited<ReturnType<typeof st>>>
        const until = async (pred: (s: St) => boolean, ms: number) => {
          const end = Date.now() + ms
          while (Date.now() < end) {
            const s = await st()
            if (s && pred(s)) return s
            await k.wait(150)
          }
          return null
        }

        // 1. 示範（第一次玩這種）：手在放的時候搶著點一個 → 示範收掉、那一下照常算（放進去 1 個）
        const demo = await until((s) => s.demo && s.free.length > 0, 25_000)
        c.outcome(`${title}：第一次玩先示範（熟練前不考）`, !!demo, demo ? '' : '沒有看到示範')
        if (!demo) await c.once(`${play}-no-demo`, '困惑', `第一次玩${title}沒有先示範`, '')
        const first = await st()
        const mute = !!first && first.want === N && first.dots === N && first.slots === N
        c.outcome(`${title}：靜音也看得懂（大數字、點點、${play === 'train' ? '車廂' : '洞'}都是 ${N} 個）`, mute, JSON.stringify(first && { want: first.want, dots: first.dots, slots: first.slots }))
        if (!mute) await c.once(`${play}-mute`, '困惑', `${title}看不出要幾個（數字、點點、位置數不一樣）`, JSON.stringify(first))
        if (demo) {
          k.behavior = '示範時搶著點'
          await k.wait(600)
          const s0 = (await st())!
          const target = s0.free[s0.free.length - 1]
          if (target) await k.tap(target, '搶點一個')
          const after = await until((s) => !s.demo, 3000)
          await k.wait(500)
          const s1 = await st()
          const ok = !!after && !!s1 && s1.filled === 1
          c.outcome(`${title}：示範時搶點 → 示範收掉、放進 1 個`, ok, JSON.stringify(s1 && { demo: s1.demo, filled: s1.filled }))
          if (!ok) await c.once(`${play}-grab`, '困惑', `${title}示範時搶點，示範沒收掉或那一下沒算`, JSON.stringify(s1))
        }

        // 2. 連點同一個：放進去、拿出來，不會亂（位置數不超過 N、沒有卡住）
        k.behavior = '連點同一個'
        let s = await until((s) => !s.demo && s.free.length > 0, 10_000)
        if (s) {
          await k.spam(s.free[0], 5, '連點同一個')
          await k.wait(700)
          s = (await st())!
          c.outcome(`${title}：連點同一個不會亂`, s.filled <= N, `放了 ${s.filled} 個`)
          if (s.filled > N) await c.once(`${play}-spam`, '困惑', `${title}連點以後放了超過 ${N} 個`, JSON.stringify(s))
        }

        // 3. 手掌壓（多指）：只算第一根手指，最多多放一個
        k.behavior = '手掌壓在東西上'
        s = (await st())!
        if (s.free.length >= 2) {
          const before = s.filled
          await k.palm(s.free.slice(0, 3), 400)
          await k.wait(700)
          s = (await st())!
          const ok = Math.abs(s.filled - before) <= 1
          c.outcome(`${title}：多指只算一根手指`, ok, `${before} → ${s.filled}`)
          if (!ok) await c.once(`${play}-palm`, '困惑', `${title}手掌一壓放了好幾個`, `${before} → ${s.filled}`)
        }

        // 4. 拖到一半放手（touchcancel）：不會卡住，之後照樣點得動
        k.behavior = '拖到一半放手'
        s = (await st())!
        if (s.free[0]) {
          const a = s.free[0]
          await k.drag([a, { x: a.x + 80, y: a.y + 60 }, { x: a.x + 160, y: a.y + 120 }], { cancel: true, label: '拖到一半手指滑走' })
          await k.wait(700)
          s = (await st())!
          c.outcome(`${title}：拖到一半放手不會亂`, s.filled <= N, `放了 ${s.filled} 個`)
        }

        // 5. 返回：回首頁；再進來同一種玩法、接著上這一段（同一天不換玩法）
        k.behavior = '上到一半按返回'
        const h = await homeButton(page)
        if (h) await pressBack(k, h)
        const live = await waitLive(page, (l) => l === 'home', 4000)
        c.outcome(`${title}：上到一半按返回 → 首頁`, live === 'home', `到 ${live}`)
        if (live !== 'home') await c.once(`${play}-back`, '無法返回', `${title}上到一半按返回沒有回首頁`, `停在 ${live}`)
        await k.wait(800)
        if (!(await enter(k, c))) return
        const again = await until((s) => s.free.length > 0, 30_000)
        const part = await partNow(page)
        c.outcome(`${title}：再進來還是同一種玩法、接著上`, !!again && again.play === play && part === 'give', `${part}，${again?.play}`)
        if (!again || again.play !== play || part !== 'give') await c.once(`${play}-resume`, '困惑', `${title}上到一半離開，再進來換了玩法或沒接著上`, `${part}，${again?.play}`)
        await until((s) => !s.demo, 25_000)

        // 6. 空的就按勾勾：不算錯、不記錄，再說一次要幾個（放了東西的話先全部拿出來）
        k.behavior = '空的就按勾勾'
        for (let i = 0; i < 8; i++) {
          s = (await st())!
          if (!s.taken.length) break
          await k.tap(s.taken[0], '拿出來')
          await k.wait(500)
        }
        s = (await st())!
        if (s.done && s.filled === 0) {
          await k.tap(s.done, '空的按勾勾')
          await k.wait(1500)
        }
        // 示範看完會記一筆教學（teach），那不是作答
        const rows0 = (await attempts(page)).filter((a) => a.game === `m-${play}` && a.phase !== 'teach')
        c.outcome(`${title}：空的按勾勾不記錄`, rows0.length === 0, `${rows0.length} 筆`)
        if (rows0.length) await c.once(`${play}-empty`, '誤記作答', `${title}空的按勾勾就記了作答`, JSON.stringify(rows0))

        // 7. 發呆：15 秒重說一次要幾個、30 秒手出來指下一步，之後照樣點得動
        if (!lite) {
          k.behavior = '發呆'
          const t0 = await page.evaluate(() => performance.now())
          let hand = false
          const end = Date.now() + 34_000
          while (Date.now() < end) {
            if (await page.evaluate(() => !!document.querySelector('.ma-load .demo-hand'))) hand = true
            await k.wait(500)
          }
          const vs = (await linesSince(page, t0)).map((v) => Math.round((v.t - t0) / 1000))
          const ok = vs.some((t) => t >= 12 && t <= 18) && hand
          c.outcome(`${title}：發呆時重說、手出來指`, ok, `語音 ${vs.join('s ')}s；手${hand ? '有' : '沒有'}`)
          if (!ok) await c.once(`${play}-idle`, '困惑', `${title}發呆時沒有重說或沒有手來指`, `語音 ${vs.join('、')} 秒；手${hand ? '有' : '沒有'}`)
        }

        // 8. 放夠；小火車再多拿一個（搖一搖、不會多坐一個）；按勾勾：火車開走／花長大，記成 give:N
        k.behavior = '放夠、按勾勾'
        for (let i = 0; i < 12; i++) {
          s = (await st())!
          if (s.filled >= N || !s.free.length) break
          await k.tap(s.free[0], '放一個')
          await k.wait(600)
        }
        s = (await st())!
        if (play === 'train' && s.free.length) {
          await k.tap(s.free[0], '坐滿了還拿一個')
          await k.wait(300)
          const x = (await st())!
          const ok = x.filled === N && x.extra === 1
          c.outcome('小火車：坐滿了還拿 → 搖一搖、不會多坐', ok, `坐了 ${x.filled}，搖 ${x.extra}`)
          if (!ok) await c.once('train-over', '困惑', '小火車坐滿了還拿，看不出多了', JSON.stringify(x))
          await k.wait(1400)
          s = (await st())!
        }
        c.outcome(`${title}：放夠了`, s.filled === N, `放了 ${s.filled}`)
        if (s.done) await k.tap(s.done, '按勾勾')
        const fin = await until((s) => s.glad, 4000)
        c.outcome(`${title}：按勾勾 → 完成（勾勾變綠）`, !!fin, '')
        if (!fin) await c.once(`${play}-done`, '卡死', `${title}放夠了按勾勾沒有完成`, JSON.stringify(await st()))
        await k.wait(1500)
        const recs = await page.evaluate(
          () =>
            new Promise<{ game: string; skill: string; options: string[]; phase: string; ok: boolean }[]>((res) => {
              const rq = indexedDB.open('dodo-adventure')
              rq.onsuccess = () => {
                const g = rq.result.transaction('attempts').objectStore('attempts').getAll()
                g.onsuccess = () => {
                  rq.result.close()
                  res((g.result as { game: string; skill: string; options: string[]; phase: string; firstTryCorrect: boolean }[]).map((a) => ({ game: a.game, skill: a.skill, options: a.options, phase: a.phase, ok: a.firstTryCorrect })))
                }
              }
            }),
        )
        const mine = recs.filter((r) => r.game === `m-${play}` && r.phase !== 'teach')
        const r0 = mine[0]
        // 示範過、又被手指過（發呆）：記成一起練（guided），不計入熟練（熟練前不考）
        const recOk = mine.length === 1 && r0.skill === `give:${N}` && r0.options.join(',') === '0,1,2,3,4,5' && r0.phase === 'guided'
        c.outcome(`${title}：記成一筆 give:${N}、選項跟拿給波波一樣、示範過記成一起練`, recOk, JSON.stringify(mine))
        if (!recOk) await c.once(`${play}-record`, '誤記作答', `${title}的作答紀錄不對`, JSON.stringify(mine), false)

        // 9. 往下一段（比多少）走得到
        k.behavior = '等下一段'
        const next = await page
          .waitForFunction(() => [...document.querySelectorAll('[data-lesson-part]')].pop()?.getAttribute('data-lesson-part') === 'compare', null, { timeout: 30_000 })
          .then(() => true)
          .catch(() => false)
        c.outcome(`${title}：做完往下一段（比多少）`, next, `停在 ${await partNow(page)}`)
        if (!next) await c.once(`${play}-next`, '卡死', `${title}做完沒有往下一段`, `停在 ${await partNow(page)}`)
        await checkDoubleRecords(k, c)
        await c.flush()
      } finally {
        await c.flush().catch(() => {})
        finish(k, c, title)
      }
    })
  }
})
