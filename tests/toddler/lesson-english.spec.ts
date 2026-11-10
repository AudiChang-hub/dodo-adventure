import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { attempts, boot, settle, snap } from './lib/app'
import { Toddler, hashSeed, rng } from './lib/toddler'
import { Checker, alive, audit, doorAt, ignoreNext, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'
import { homeButton } from './lib/app'

/**
 * 英文字母課（src/lessons/english）的三歲模擬測試：
 * 一進課就想回去、念的時候一直點、示範時搶著畫、亂點亂畫、點錯、發呆、中途返回再進來；一天一個字母的進度規則。
 * 截圖：TODDLER_SHOTS=資料夾 時，走完一課那一項把每一段拍下來（docs/簡化截圖/英文課/）。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (name: string) => !only.length || only.some((s) => s === 'lesson-english' || s === name)
const LIVE = 'lesson-english'
const SHOTS = process.env.TODDLER_SHOTS

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string, lessonSticker?: boolean, autoNext = true) {
  const seed = hashSeed(BASE_SEED, 'lesson-english', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `英文課／${name}`
  await boot(page, seed, { to: 'home', lessonSticker, autoNext })
  await k.init()
  return { k, c, seed }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`lesson-english-${name}`, { screen: `英文課／${name}`, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

/** 這一課現在在哪一段（.en-lesson 的 data-phase） */
const stageOf = (page: Page) => page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-phase') ?? null)
/** 今天的字母（大寫）：認字母的大字；中途離開再回來會從離開的那一段接著上（T-95），不在認字母就看描字上面的大小寫格子 */
/** 選擇題的小點：答完幾題／共幾題（沒有小點：null） */
const quizDots = (page: Page) =>
  page.evaluate(() => {
    const e = document.querySelector('.en-steps .is-quiz')
    return e ? { done: Number(e.getAttribute('data-done')), total: Number(e.getAttribute('data-total')) } : null
  })
const letterOf = (page: Page) =>
  page.evaluate(
    () =>
      // 到了單字範例：上面走過的小石頭寫著今天的小寫
      (document.querySelector('.en-meet .en-letter.is-big') ?? document.querySelector('.en-trace-rounds span') ?? document.querySelector('.en-steps .is-done'))?.textContent?.trim().toUpperCase() || null,
  )

async function shot(page: Page, name: string, info: { project: { name: string } }) {
  if (!SHOTS || info.project.name !== 'tab1200') return
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

/** 從首頁點英文課的門（spam：連點） */
async function enter(k: Toddler, c: Checker, spam = false) {
  if (!(await toHome(k, c))) return false
  const door = await doorAt(k.page, 'english')
  if (!door) {
    await c.once('no-door', '小問題', '首頁找不到英文字母的門', '')
    return false
  }
  if (spam) await k.spam(door, 5 + k.r.int(4), '英文字母的門')
  else await k.tap(door, '英文字母的門')
  const live = await waitLive(k.page, (l) => l === LIVE, 6000)
  if (live !== LIVE) await c.once('enter', '卡死', `點英文字母的門沒有進到英文課（停在 ${live}）`, '')
  return live === LIVE
}

async function waitStage(page: Page, want: string, ms = 60_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await stageOf(page)) === want) return true
    await page.waitForTimeout(250)
  }
  return false
}

/** 單字念完會到「寫寫看」（T-112，自己再描一次大寫）：描完才到選擇題；回傳有沒有走過去 */
async function passWrite(k: Toddler) {
  if (!(await waitStage(k.page, 'write', 60_000))) return (await stageOf(k.page)) === 'quiz'
  return traceRound(k)
}

/** 描字：等到可以畫，沿著現在這一筆（虛線）從頭描到尾；描完一回合（右邊的 A A a a 多一個綠的）就回傳 */
async function traceRound(k: Toddler) {
  const page = k.page
  const doneBefore = await page.evaluate(() => document.querySelectorAll('.en-trace-rounds .is-done').length)
  const end = Date.now() + 60_000
  while (Date.now() < end) {
    const st = await page.evaluate(() => {
      const t = document.querySelector('.en-trace')
      const done = document.querySelectorAll('.en-trace-rounds .is-done').length
      if (!t) return { gone: true, done, pts: null as null | { x: number; y: number }[] }
      if (t.getAttribute('data-accepting') === 'false') return { gone: false, done, pts: null }
      // 現在這一筆：虛線那一條
      const boards = [...document.querySelectorAll('.en-trace-board')]
      const board = boards[boards.length - 1]
      const p = board?.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')
      if (!p) return { gone: false, done, pts: null }
      const m = p.getScreenCTM()!
      const len = p.getTotalLength()
      const pts = Array.from({ length: Math.max(6, Math.round(len / 4)) + 1 }, (_, i) => {
        const q = p.getPointAtLength((len * i) / Math.max(6, Math.round(len / 4)))
        const s = new DOMPoint(q.x, q.y).matrixTransform(m)
        return { x: s.x, y: s.y }
      })
      return { gone: false, done, pts }
    })
    if (st.gone || st.done > doneBefore) return true
    if (!st.pts) {
      await page.waitForTimeout(300)
      continue
    }
    await k.drag(st.pts, { stepMs: 18, label: '描' })
    await page.waitForTimeout(500)
  }
  return false
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

/** 選擇：今天的字母、今天的字是答案；複習題（以前的字母）先點錯兩次、看亮起來的答案再點 */
async function answer(k: Toddler, wrongFirst: boolean) {
  const page = k.page
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => {
      const box = [...document.querySelectorAll('.en-options')].pop()
      return { accepting: !!box && box.getAttribute('data-accepting') !== 'false', n: document.querySelectorAll('.en-options').length }
    })
    if (s.accepting && s.n === 1) break
    await page.waitForTimeout(250)
  }
  const { kind, opts } = await page.evaluate(() => {
    const box = [...document.querySelectorAll('.en-options')].pop()
    const kind = (['big', 'little', 'word'] as const).find((k) => box?.classList.contains(`is-${k}`)) ?? null
    const opts = [...(box?.querySelectorAll<HTMLElement>('.en-opt') ?? [])].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: e.getAttribute('aria-label') ?? '', hint: e.classList.contains('is-hint') }
    })
    return { kind, opts }
  })
  if (!opts.length) return false
  const L = await page.evaluate(() => (window as unknown as { __enL?: string }).__enL ?? null)
  const words = await page.evaluate(() => (window as unknown as { __enWords?: string[] }).__enWords ?? [])
  // 大寫題的陪襯可能是同一個字母的小寫（教過的才當陪襯）：照題型比對
  const right = opts.find((o) => (kind === 'big' ? o.label === L : kind === 'little' ? o.label === L?.toLowerCase() : words.includes(o.label)))
  if (wrongFirst || !right) {
    const wrong = opts.find((o) => o !== right)!
    await k.tap(wrong, `選錯 ${wrong.label}`)
    await k.wait(2600)
    if (!right) {
      await k.tap(wrong, `又選錯 ${wrong.label}`)
      await k.wait(3500)
      const hint = await page.evaluate(() => {
        const e = [...document.querySelectorAll('.en-options')].pop()?.querySelector<HTMLElement>('.en-opt.is-hint')
        if (!e) return null
        const r = e.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: e.getAttribute('aria-label') ?? '' }
      })
      if (hint) await k.tap(hint, `亮起來的 ${hint.label}`)
      return !!hint
    }
  }
  // 答對時連點（三歲會一直點）：只能記一次
  await k.spam(right!, 3, `答案 ${right!.label}`)
  return true
}

/** 記下今天的字母、今天的字（給 answer 用）：從認字母那一段讀 */
async function remember(page: Page) {
  await page.evaluate(() => {
    const L = document.querySelector('.en-meet .en-letter.is-big')?.textContent?.trim()
    if (L) (window as unknown as { __enL?: string }).__enL = L
  })
}

test.describe('英文字母課', () => {

  test('做完一段不點大箭頭（T-118）：亂點、連點、手掌壓、發呆 30 秒，不會自己往下走、返回鍵點得到；點了才往下', async ({ page }, info) => {
    test.skip(!want('lesson-english-next'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '不點大箭頭', false, false)
    try {
      if (!(await enter(k, c))) return
      await ignoreNext(k, c, '認識字母做完', () => stageOf(page))
      await c.flush()
    } finally {
      finish(k, c, '不點大箭頭')
    }
  })
  // T-101（第三次盲測：描 S 描到下面那個彎就以為描完了，畫面一直停在 Your turn!）：
  // 跟 AI 小男生一樣快速一筆，點很少（折線、彎的地方切過去），描到大約八成就放手 → 要看到完成效果、自己往下一輪
  test('描字：快速一筆描到八成就放手 → 完成效果、往下一輪', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '一筆描到八成')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 同一天從描字接著上（T-95），今天的字母是 S（最長的一筆）
      await page.evaluate(
        (day) =>
          new Promise((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              tx.objectStore('kv').put({ key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: day, done: false, good: false, stage: 'trace', round: 0 } })
              tx.oncomplete = () => res(0)
            }
          }),
        day,
      )
      if (!(await enter(k, c))) return
      if (!(await waitStage(page, 'trace', 20_000))) return void (await c.once('no-trace', '卡死', '沒有從描字接著上', `停在 ${await stageOf(page)}`))
      await page.waitForFunction(() => document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false', null, { timeout: 60_000 })
      await k.wait(400)
      const pts = await page.evaluate(() => {
        const boards = [...document.querySelectorAll('.en-trace-board')]
        const p = boards[boards.length - 1].querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
        const m = p.getScreenCTM()!
        const len = p.getTotalLength()
        // 九個點，到全長的 80%
        return Array.from({ length: 9 }, (_, i) => {
          const q = p.getPointAtLength(len * 0.8 * (i / 8))
          const s = new DOMPoint(q.x, q.y).matrixTransform(m)
          return { x: s.x, y: s.y }
        })
      })
      k.behavior = '快速一筆描到八成就放手'
      await k.drag(pts, { stepMs: 10, label: '描 S（到八成）' })
      const fx = await page.waitForSelector('[data-trace-finished]', { state: 'attached', timeout: 3000 }).catch(() => null)
      c.outcome('放手後出現完成效果（彩虹、跳一下）', !!fx, fx ? '' : '沒有出現，還在等他描')
      if (!fx) await c.once('no-finish', '卡死', '描到八成放手，畫面一直停在 Your turn!（沒有完成效果、不往下走）', '')
      const next = await page
        .waitForFunction(() => document.querySelectorAll('.en-trace-rounds .is-done').length >= 1, null, { timeout: 6000 })
        .then(() => true)
        .catch(() => false)
      c.outcome('自己往下一輪（小寫）', next, next ? '' : '沒有往下走')
      if (fx && !next) await c.once('no-next', '卡死', '完成效果之後沒有往下一輪', '')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '一筆描到八成')
    }
  })

  // 第五次盲測（2026-11-06）描小 s：他瞄準綠點，手指落在綠點正下方約 15 mm（77 px），照著小 s 的樣子畫了一半，
  // 灰灰的線畫得出來、跑道卻一點都沒有填，他說「畫不好」就離開。15 mm 在起點吸附範圍（SNAP_MM）裡，應該吸到起點、整筆平移再比對；
  // 但小 s 很小，按下去的地方離起點附近的跑道還不到「接著描」的範圍，就被當成直接描（沒有平移），之後每一點都偏在跑道外面
  test('描小 s：手指落在綠點下面一點、照樣子畫 → 吸到起點，跑道有填', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '描小s按偏')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 同一天從描字的第二輪（小寫）接著上，今天的字母是 S
      await page.evaluate(
        (day) =>
          new Promise((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              tx.objectStore('kv').put({ key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: day, done: false, good: false, stage: 'trace', round: 1 } })
              tx.oncomplete = () => res(0)
            }
          }),
        day,
      )
      if (!(await enter(k, c))) return
      if (!(await waitStage(page, 'trace', 20_000))) return void (await c.once('no-trace', '卡死', '沒有從描字接著上', `停在 ${await stageOf(page)}`))
      await page.waitForFunction(() => document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false', null, { timeout: 60_000 })
      const little = await page.evaluate(() => document.querySelector('.en-trace-rounds .is-now')?.textContent?.trim() ?? null)
      c.outcome('這一輪是小 s', little === 's', String(little))
      await k.wait(400)
      // 小 s 這一筆的前一半（盲測他畫了大約一半就放手），整筆往下平移 15 mm（PX_PER_MM 5.2）
      const DOWN = 15 * 5.2
      const pts = await page.evaluate((down) => {
        const boards = [...document.querySelectorAll('.en-trace-board')]
        const p = boards[boards.length - 1].querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
        const m = p.getScreenCTM()!
        const len = p.getTotalLength()
        return Array.from({ length: 9 }, (_, i) => {
          const q = p.getPointAtLength(len * 0.5 * (i / 8))
          const s = new DOMPoint(q.x, q.y).matrixTransform(m)
          return { x: s.x, y: s.y + down }
        })
      }, DOWN)
      k.behavior = '瞄準綠點、手指落在下面一點，照小 s 的樣子畫一半'
      await k.drag(pts, { stepMs: 16, label: '描小 s（按偏 15 mm、畫一半）' })
      await k.wait(500)
      // 跑道填了多少：這一筆的彩色跑道是 pathLength 的那一條，stroke-dasharray 的第一個數字是描到哪裡
      // （跑道發亮的那一層也有 pathLength，跳過，T-113：描到一半放手會亮）
      const prog = await page.evaluate(() => {
        const boards = [...document.querySelectorAll('.en-trace-board')]
        const lane = [...boards[boards.length - 1].querySelectorAll('path[pathLength]')].find((x) => !x.closest('[data-trace-glow]'))
        const [a] = (lane?.getAttribute('stroke-dasharray') ?? '0').split(' ').map(Number)
        return { at: a, total: Number(lane?.getAttribute('pathLength') ?? 1) }
      })
      const filled = prog.at / prog.total
      c.outcome('跑道有填（吸到起點、照樣子畫有算）', filled >= 0.25, `填了 ${Math.round(filled * 100)}%`)
      if (filled < 0.25) await c.once('trace-offset', '困惑', '描小 s 手指落在綠點下面一點、照樣子畫：畫得出灰線，跑道卻沒有填', `填了 ${Math.round(filled * 100)}%`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '描小s按偏')
    }
  })

  // 第六次盲測（2026-11-06）描小 s：他從綠點描過上面的彎、斜下來，停在右下的彎（只剩尾巴往左彎回去那一段），放手。
  // 描好的部分變藍、綠點停在斷掉的地方，剩下的尾巴只有淡淡的虛線；他說「還是不知道對不對，我不要畫了」，按房子離開。
  // 要做到：(1) 大寫 S 描到四成放手：不用重描，筆從斷掉的地方帶著描完（T-122；以前是看得到剩下的那一段、讓他接著描）；
  // (2) 小 s 照盲測那一筆（截圖 1280×800 的座標，換算到描字板）描到右下的彎放手：帶著描完（彩虹、往下走），不用再描尾巴
  test('描 S、小 s：描到一半放手、描到大部分（盲測那一筆）放手，都帶著描完', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '描小s快完')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      // 同一天從描字的第一輪（大寫）接著上，今天的字母是 S
      await page.evaluate(
        (day) =>
          new Promise((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              tx.objectStore('kv').put({ key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: day, done: false, good: false, stage: 'trace', round: 0 } })
              tx.oncomplete = () => res(0)
            }
          }),
        day,
      )
      if (!(await enter(k, c))) return
      if (!(await waitStage(page, 'trace', 20_000))) return void (await c.once('no-trace', '卡死', '沒有從描字接著上', `停在 ${await stageOf(page)}`))
      const canDraw = () => page.waitForFunction(() => document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false' && !document.querySelector('.en-trace[data-demo]'), null, { timeout: 60_000 })
      await canDraw()
      await k.wait(400)
      /** 這一筆（虛線）上 from～to 的點，換成螢幕座標 */
      const along = (from: number, to: number, n = 12) =>
        page.evaluate(
          ({ from, to, n }) => {
            const boards = [...document.querySelectorAll('.en-trace-board')]
            const p = boards[boards.length - 1].querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
            const m = p.getScreenCTM()!
            const len = p.getTotalLength()
            return Array.from({ length: n + 1 }, (_, i) => {
              const q = p.getPointAtLength(len * (from + ((to - from) * i) / n))
              return new DOMPoint(q.x, q.y).matrixTransform(m)
            }).map((s) => ({ x: s.x, y: s.y }))
          },
          { from, to, n },
        )
      const filled = () =>
        page.evaluate(() => {
          const boards = [...document.querySelectorAll('.en-trace-board')]
          const lane = [...boards[boards.length - 1].querySelectorAll('path[pathLength]')].find((x) => !x.closest('[data-trace-glow]'))
          const [a] = (lane?.getAttribute('stroke-dasharray') ?? '0').split(' ').map(Number)
          return a / Number(lane?.getAttribute('pathLength') ?? 1)
        })
      const finished = (ms: number) =>
        page
          .waitForFunction(() => !!document.querySelector('.en-trace [data-trace-finished]'), null, { timeout: ms })
          .then(() => true)
          .catch(() => false)

      // (1) 大寫 S 描到四成放手：不用重描，筆從斷掉的地方帶著描完（T-122，盲測 ca0d1e1：描到一半放手被說 Nice try 要重描，「好煩」離開）
      k.behavior = '大寫 S 描到四成放手'
      await k.drag(await along(0, 0.4), { stepMs: 16, label: '描大 S 到四成' })
      const half = await filled()
      const carried = await finished(10_000)
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/大S描到四成放手.png` })
      c.outcome('描到四成放手：不用重描，筆帶著描完（T-122）', carried, `放手時填了 ${Math.round(half * 100)}%${carried ? '' : `；10 秒後 ${Math.round((await filled()) * 100)}%`}`)
      if (!carried) return void (await c.once('trace-half', '困惑', '描到一半放手，沒有帶著描完，還要他重描', `放手時填了 ${Math.round(half * 100)}%`))

      // (2) 小 s：盲測那一筆（1280×800 截圖上的座標，描字板在 (427,105) 寬 426 高 600），換算到這個尺寸的描字板
      await page.waitForFunction(() => document.querySelector('.en-trace-rounds .is-now')?.textContent?.trim() === 's', null, { timeout: 20_000 })
      await canDraw()
      await k.wait(400)
      const BLIND = [
        [717, 417],
        [664, 382],
        [600, 399],
        [573, 438],
        [620, 475],
        [692, 502],
        [711, 532],
      ]
      const REF = { x: 427, y: 105, w: 426, h: 600 }
      const box = await page.evaluate(() => {
        const r = document.querySelector('.en-trace-paper')!.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      })
      const pts = BLIND.map(([x, y]) => ({ x: box.x + ((x - REF.x) / REF.w) * box.w, y: box.y + ((y - REF.y) / REF.h) * box.h }))
      k.behavior = '照盲測那一筆描小 s，描到右下的彎放手'
      await k.drag(pts, { stepMs: 16, label: '描小 s 到右下的彎（盲測那一筆）' })
      const lifted = await filled()
      const ok = await finished(2500)
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/小s盲測那一筆放手.png` })
      c.outcome('盲測那一筆（停在右下的彎）放手：帶著描完', ok, `放手時填了 ${Math.round(lifted * 100)}%${ok ? '' : `；2.5 秒後 ${Math.round((await filled()) * 100)}%，還在等他描尾巴`}`)
      if (!ok) await c.once('trace-almost', '困惑', '描小 s 描到右下的彎放手（只剩尾巴），沒有帶著描完，還要他自己描尾巴', `放手時填了 ${Math.round(lifted * 100)}%`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '描小s快完')
    }
  })

  test('走完一課：念的時候一直點、示範時搶著畫、點錯、連點答案', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(10 * 60_000)
    // 這一堂指定沒有貼紙（貼紙平均每 3～4 堂一次、不固定）：測沒有貼紙的下課畫面；挑貼紙在數學課測
    const { k, c } = await setup(page, info, '走完一課', false)
    try {
      k.behavior = '連點門進課'
      const ok = await enter(k, c, true)
      c.outcome('連點門進課', ok, ok ? '進到英文課' : '沒進去')
      if (!ok) return
      await settle(page, 3000)
      // 1. 認字母：念的時候一直點字母（不能每點一下就重念、不能卡住）
      k.behavior = '認字母搶著點'
      await page.waitForSelector('.en-meet .en-letter.is-big', { timeout: 10_000 })
      await remember(page)
      await shot(page, '1-認字母', info)
      const L = await letterOf(page)
      for (let i = 0; i < 6; i++) {
        const big = await page.evaluate(() => {
          const e = document.querySelector('.en-meet .en-letter.is-big')
          if (!e) return null
          const r = e.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })
        if (!big) break
        await k.spam(big, 2 + k.r.int(3), '大寫字母')
        await k.wait(700)
      }
      await page.waitForTimeout(1500)
      await shot(page, '2-認字母念完', info)
      const toTrace = await waitStage(page, 'trace', 40_000)
      c.outcome('認字母自己往下走到描字', toTrace, toTrace ? '' : `停在 ${await stageOf(page)}`)
      if (!toTrace) await c.once('meet-stuck', '卡死', '認字母念完沒有往下走到描字', `停在 ${await stageOf(page)}`)
      await c.flush()

      // 2. 描字：示範時搶著畫（不能留下墨、不能算描完），之後照筆順描到下一段（大寫、小寫各一次，A5；以前是四回合）
      k.behavior = '示範時搶著畫'
      await page.waitForSelector('.en-trace', { timeout: 10_000 })
      let grabbed = 0
      for (let i = 0; i < 20; i++) {
        const s = await snap(page)
        if (s.teaching === 'demo' || s.teaching === 'wait') {
          await shot(page, '3-描字示範', info)
          for (let j = 0; j < 4; j++) await toddlerStep(k, c, { drawing: true, fading: true })
          grabbed++
          break
        }
        await page.waitForTimeout(250)
      }
      const doneEarly = await page.evaluate(() => document.querySelectorAll('.en-trace-rounds .is-done').length)
      c.outcome('示範時搶著畫', doneEarly === 0, `搶畫 ${grabbed ? '有' : '沒有'}做到；描完的回合 ${doneEarly}`)
      if (doneEarly) await c.once('trace-early', '誤記作答', '示範時亂畫就算描完了', `描完的回合 ${doneEarly}`)
      k.behavior = '描字'
      for (let r = 0; r < 4 && (await stageOf(page)) === 'trace'; r++) {
        if (r === 1) await shot(page, '4-描小寫', info)
        const ok2 = await traceRound(k)
        if (!ok2) {
          await c.once('trace-stuck', '卡死', `描字第 ${r + 1} 回合描不完`, `沿著虛線描了 60 秒`)
          break
        }
        // 描好之後亂點一下（不能跳過、不能壞）
        if (k.r.chance(0.5)) await k.tap({ x: k.r.range(300, 900), y: k.r.range(250, 700) }, '描完亂點')
      }
      const toWords = await waitStage(page, 'words', 30_000)
      c.outcome('描完大小寫到單字', toWords, toWords ? '' : `停在 ${await stageOf(page)}`)
      await c.flush()

      // 3. 單字：一直點圖
      k.behavior = '單字亂點'
      await page.waitForTimeout(2500)
      await shot(page, '5-單字', info)
      await page.evaluate(() => {
        ;(window as unknown as { __enWords?: string[] }).__enWords = [...document.querySelectorAll('.en-word-card')].map((e) => (e.getAttribute('aria-label') ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      })
      for (let i = 0; i < 5; i++) {
        const cards = await page.$$('.en-word-card')
        const b = await cards[k.r.int(cards.length)]?.boundingBox()
        if (b) await k.tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, '單字卡')
        await k.wait(900)
      }
      await passWrite(k)
      const toQuiz = await waitStage(page, 'quiz', 60_000)
      c.outcome('單字念完到選擇', toQuiz, toQuiz ? '' : `停在 ${await stageOf(page)}`)
      if (!toQuiz) await c.once('words-stuck', '卡死', '單字念完沒有往下走到選擇', `停在 ${await stageOf(page)}`)
      await c.flush()

      // 4. 選擇：第一題點錯一次，其他照答；答對時連點
      k.behavior = '選擇'
      const t0 = await page.evaluate(() => Date.now())
      // 這一堂幾題（T-112：第一天 2 題、之後 3 題，quiz-plan.ts 的 makeQuiz）
      const nQ = (await quizDots(page))?.total ?? 2
      for (let q = 0; q < 6 && (await stageOf(page)) === 'quiz'; q++) {
        if (q === 1) await shot(page, '6-選擇', info)
        await answer(k, q === 0)
        await k.wait(2500)
      }
      const toEnd = await waitStage(page, 'end', 20_000)
      c.outcome('選完到上完', toEnd || (await snap(page)).cheer, `停在 ${await stageOf(page)}`)
      await page.waitForTimeout(1500)
      await shot(page, '7-上完', info)
      // 作答紀錄：每一題一筆、連點不重複。題數看畫面上的小點（quiz-plan.ts 的 makeQuiz：第一天 2 題、之後 3 題），看筆數
      const rows = (await attempts(page)).filter((a) => a.game === 'lesson-en' && a.ts >= t0 && a.phase !== 'teach')
      const keys = rows.map((a) => a.itemId)
      const dup = Math.max(0, rows.length - nQ)
      c.outcome('作答紀錄', rows.length >= nQ && !dup, `${rows.length} 筆／${nQ} 題（${keys.join('、')}），重複 ${dup}`)
      if (dup) await c.once('dup', '誤記作答', `選擇題連點答案被記了兩次（${dup} 筆）`, keys.join('、'))
      if (rows.length < nQ) await c.once('rows', '誤記作答', `選擇題的作答紀錄少了（${rows.length} 筆）`, keys.join('、'))
      // 上完：這一堂沒有貼紙 → 安靜的下課畫面（恐龍、回首頁的房子、大人的「現在去做」），不會出現挑貼紙
      const bye = await page.waitForSelector('.cheer-scrim .lesson-bye', { timeout: 10_000 }).catch(() => null)
      const picker = await page.evaluate(() => !!document.querySelector('.picker'))
      c.outcome('沒有貼紙的那堂：下課畫面', !!bye && !picker, bye ? (picker ? '卻出現挑貼紙' : '') : '沒有出現下課畫面')
      if (!bye) await c.once('bye', '卡死', '上完一堂沒有出現下課畫面', `停在 ${await stageOf(page)}`)
      await page.waitForTimeout(1500)
      await shot(page, '8-下課', info)
      const prog = await page.evaluate(
        () =>
          new Promise<unknown>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const g = rq.result.transaction('kv').objectStore('kv').get('lesson.english')
              g.onsuccess = () => res(g.result?.value ?? null)
            }
          }),
      )
      const p = prog as { idx: number; done: boolean } | null
      c.outcome('進度記成上完', !!p?.done, JSON.stringify(p))
      if (!p?.done) await c.once('prog', '誤記作答', '上完了進度沒有記成上完', JSON.stringify(p))
      c.outcome('今天的字母', true, `${L}`)

      // 下課畫面（T-118 晚安道別）：陪玩小字先請大人讓他點恐龍說晚安；連點恐龍：說晚安、睡著，不會跳走；睡著後才有房子、「現在去做」，點房子回首頁
      if (bye) {
        const hint0 = await page.evaluate(() => document.querySelector('.lesson-next')?.textContent ?? '')
        c.outcome('下課畫面先請他說晚安', /說晚安/.test(hint0), hint0.slice(0, 40))
        k.behavior = '下課畫面亂點恐龍'
        const at = (sel: string) =>
          page.evaluate((sel) => {
            const r = document.querySelector(sel)?.getBoundingClientRect()
            return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
          }, sel)
        const dino = await at('.lb-host')
        if (dino) await k.spam(dino, 3, '恐龍')
        await k.wait(800)
        const still = await page.evaluate(() => !!document.querySelector('.lesson-bye'))
        c.outcome('亂點恐龍不會跳走', still, still ? '' : '點恐龍就離開了')
        const slept = await page.waitForSelector('.lesson-bye[data-bye="asleep"] ~ .lb-home, .lesson-bye[data-bye="asleep"] .lb-home', { timeout: 8000 }).catch(() => null)
        c.outcome('點恐龍：說晚安、睡著、房子出來', !!slept, slept ? '' : '恐龍沒睡著或房子沒出來')
        if (!slept) await c.once('bye-sleep', '卡死', '下課畫面點恐龍之後，恐龍沒有睡著、房子沒有出來', '')
        await k.wait(1200)
        const hint = await page.evaluate(() => document.querySelector('.lesson-next')?.textContent ?? '')
        c.outcome('睡著後有「現在去做」', /現在去做/.test(hint), hint.slice(0, 40))
        k.behavior = '下課畫面點房子'
        const house = await at('.lb-home')
        if (house) await k.tap(house, '房子')
        const home = await waitLive(page, (l) => l === 'home', 4000)
        c.outcome('點房子 → 首頁', home === 'home', `到 ${home}`)
        if (home !== 'home') await c.once('bye-home', '卡死', '下課畫面點房子沒有回首頁', `停在 ${home}`)
      }
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '走完一課')
    }
  })

  test('中途返回再進來、亂點、發呆', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(8 * 60_000)
    const { k, c, seed } = await setup(page, info, '中途返回')
    try {
      // 一進課就按返回
      k.behavior = '一進課就按返回'
      if (!(await enter(k, c))) return
      const h = await homeButton(page)
      if (h) await pressBack(k, h, '一進課就按返回')
      const back1 = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('一進課就按返回 → 首頁', back1 === 'home', `到 ${back1}`)
      if (back1 !== 'home') await c.once('back-enter', '無法返回', '一進英文課就按返回沒有回首頁', `停在 ${back1}`)

      // 再進來：用 seed 決定在哪一段（認字母、描字、單字）亂玩幾下之後按返回
      const mid = rng(hashSeed(seed, 'mid-back'))
      const at = (['meet', 'trace', 'words'] as const)[mid.int(3)]
      k.behavior = `${at} 亂玩`
      if (!(await enter(k, c))) return
      const L1 = (await page.waitForSelector('.en-meet .en-letter.is-big', { timeout: 10_000 }).catch(() => null)) && (await letterOf(page))
      if (at !== 'meet') await waitStage(page, at, 60_000)
      for (let i = 0; i < 8; i++) await toddlerStep(k, c, { drawing: at === 'trace', fading: true })
      k.behavior = `${at} 中途返回`
      const h2 = await homeButton(page)
      if (h2) await pressBack(k, h2, `${at} 中途返回`)
      const back2 = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome(`${at} 中途返回 → 首頁`, back2 === 'home', `到 ${back2}`)
      if (back2 !== 'home') await c.once('back-mid', '無法返回', `英文課 ${at} 中途按返回沒有回首頁`, `停在 ${back2}`)
      await c.screenOk('中途返回')

      // 再進來：同一個字母從頭上（今天還沒上完）
      k.behavior = '返回後再進來'
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-meet .en-letter.is-big, .en-trace-rounds span, .en-steps .is-done', { timeout: 10_000 }).catch(() => null)
      const L2 = await letterOf(page)
      c.outcome('返回後再進來：同一個字母', !!L1 && L1 === L2, `${L1} → ${L2}`)
      if (L1 && L2 && L1 !== L2) await c.once('letter-skip', '誤記作答', '中途離開再進來換了字母', `${L1} → ${L2}`)

      // 亂點、亂畫一陣子，再發呆：一直有反應、發呆有提示
      k.behavior = '亂玩'
      for (let i = 0; i < (info.project.metadata?.lite ? 12 : 24); i++) {
        if ((await snap(page)).live !== LIVE) break
        await toddlerStep(k, c, { drawing: (await stageOf(page)) === 'trace', fading: true })
        if (i % 6 === 5) await c.flush()
      }
      const okPlay = (await snap(page)).live === LIVE || (await snap(page)).cheer
      c.outcome('亂玩之後還在課裡', okPlay, `${(await snap(page)).live}，${await stageOf(page)}`)
      await audit(k, c, `英文課 ${await stageOf(page)}`)
      if (!info.project.metadata?.lite) {
        k.behavior = '發呆'
        await k.wait(35_000, '完全不動')
      }
      const okAlive = await alive(k, c, '英文課亂玩、發呆')
      c.outcome('亂玩、發呆之後還能繼續', okAlive, `${await stageOf(page)}`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '中途返回')
    }
  })

  test('進度：隔天換下一個字母、錯很多重上、同一天複習', async ({ page }, info) => {
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '進度')
    try {
      const d = new Date()
      const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
      const today = fmt(d)
      const yesterday = fmt(new Date(d.getTime() - 86_400_000))
      const cases = [
        { name: '昨天上完、答得好 → 下一個字母', p: { idx: 0, date: yesterday, done: true, good: true }, want: 'B', again: false },
        { name: '昨天錯很多 → 重上同一個字母', p: { idx: 1, date: yesterday, done: true, good: false }, want: 'B', again: false },
        { name: '昨天沒上完 → 重上同一個字母', p: { idx: 2, date: yesterday, done: false, good: false }, want: 'C', again: false },
        { name: '今天上完了又進來 → 複習今天的字母', p: { idx: 3, date: today, done: true, good: true }, want: 'D', again: true },
        { name: 'Z 上完 → 從 A 再來', p: { idx: 25, date: yesterday, done: true, good: true }, want: 'A', again: false },
      ]
      for (const cs of cases) {
        k.behavior = cs.name
        await toHome(k, c)
        await page.evaluate(
          (p) =>
            new Promise<void>((res) => {
              const rq = indexedDB.open('dodo-adventure')
              rq.onsuccess = () => {
                const tx = rq.result.transaction('kv', 'readwrite')
                tx.objectStore('kv').put({ key: 'lesson.english', value: p })
                tx.oncomplete = () => res()
              }
            }),
          cs.p,
        )
        if (!(await enter(k, c))) break
        await page.waitForSelector('.en-meet .en-letter.is-big', { timeout: 10_000 }).catch(() => null)
        const L = await letterOf(page)
        c.outcome(cs.name, L === cs.want, `今天的字母 ${L}（應為 ${cs.want}）`)
        if (L !== cs.want) await c.once(`plan:${cs.name}`, '誤記作答', `進度規則不對：${cs.name}`, `今天的字母 ${L}，應為 ${cs.want}`)
        const h = await homeButton(page)
        if (h) await pressBack(k, h)
        await waitLive(page, (l) => l === 'home', 4000)
      }
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '進度')
    }
  })
  test('上完了、還沒說完晚安就離開，同一天回來回到晚安道別，不從頭複習（T-122）', async ({ page }, info) => {
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '上完回來')
    try {
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // 題目都做完了（plan.ts 的 markDone 記成 end），慶祝的時候按返回離開
      await page.evaluate(
        (p) =>
          new Promise<void>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              tx.objectStore('kv').put({ key: 'lesson.english', value: p })
              tx.oncomplete = () => res()
            }
          }),
        { idx: 0, date: today, done: true, good: true, stage: 'end' },
      )
      k.behavior = '上完了回來'
      if (!(await enter(k, c))) return
      const bye = await page.waitForSelector('.cheer-scrim .lesson-bye', { timeout: 6000 }).catch(() => null)
      const meet = await page.evaluate(() => !!document.querySelector('.en-meet'))
      c.outcome('回到晚安道別', !!bye && !meet, bye ? (meet ? '又從認識字母開始' : '') : `停在 ${await stageOf(page)}`)
      if (!bye || meet) await c.once('end-resume', '誤記作答', '上完了還沒說完晚安就離開，回來沒有回到晚安道別', `停在 ${await stageOf(page)}`)
      // 返回鍵點得到：回首頁；再進來是從頭複習（回去過一次就清掉）
      k.behavior = '晚安道別按返回'
      const h = await homeButton(page)
      if (h) await pressBack(k, h, '晚安道別按返回')
      const back = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('晚安道別按返回 → 首頁', back === 'home', `到 ${back}`)
      if (back !== 'home') await c.once('end-back', '無法返回', '回到晚安道別時按返回沒有回首頁', `停在 ${back}`)
      k.behavior = '再進來'
      if (!(await enter(k, c))) return
      const meet2 = await page.waitForSelector('.en-meet', { timeout: 8000 }).catch(() => null)
      c.outcome('再進來：從頭複習', !!meet2, `停在 ${await stageOf(page)}`)
      if (!meet2) await c.once('end-review', '誤記作答', '回過晚安道別以後再進來，沒有從頭複習', `停在 ${await stageOf(page)}`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '上完回來')
    }
  })
  test('在晚安道別離開、同一天回來：先回到晚安道別，不會變成挑貼紙（T-125）', async ({ page }, info) => {
    // 盲測 0f3363f 英文 seed 2：題目做完、晚安道別出來時按返回，去畫畫，回來直接出現挑貼紙。
    // 這一堂上完時已經算過一堂（下課是晚安道別、沒有貼紙）；回來接上晚安道別時又算一堂，貼紙的間隔剛好到了，就變成挑貼紙
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '道別離開回來')
    try {
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // 上完時的樣子：英文進度記成 end（plan.ts 的 markDone），貼紙的間隔已經算過這一堂（since 1），下一堂就有貼紙（next 2）
      await page.evaluate(
        ({ p, today }) =>
          new Promise<void>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              const st = tx.objectStore('kv')
              st.put({ key: 'lesson.english', value: { ...p, date: today } })
              const a = st.get('achieve')
              a.onsuccess = () => st.put({ key: 'achieve', value: { ...(a.result?.value ?? { v: 2 }), gap: { since: 1, next: 2 } } })
              tx.oncomplete = () => {
                rq.result.close()
                res()
              }
            }
          }),
        { p: { idx: 0, done: true, good: true, stage: 'end' }, today },
      )
      await page.evaluate(() => sessionStorage.setItem('dodo.resume', 'home'))
      await page.reload()
      await page.waitForSelector('.screen.home', { timeout: 20_000 })
      k.behavior = '道別離開回來'
      if (!(await enter(k, c))) return
      const end = await page.waitForSelector('.cheer-scrim .lesson-bye, .cheer-scrim .picker', { timeout: 6000 }).catch(() => null)
      const got = await page.evaluate(() => (document.querySelector('.cheer-scrim .picker') ? 'picker' : document.querySelector('.cheer-scrim .lesson-bye') ? 'bye' : null))
      c.outcome('回來先是晚安道別（不是挑貼紙）', !!end && got === 'bye', got === 'picker' ? '直接出現挑貼紙' : got ?? `停在 ${await stageOf(page)}`)
      if (got !== 'bye') await c.once('end-sticker', '誤記作答', '在晚安道別離開、同一天回來，沒有回到晚安道別', got === 'picker' ? '直接出現挑貼紙（同一堂又算了一次）' : `停在 ${await stageOf(page)}`)
      // 同一堂不再算一次：貼紙的間隔還是 since 1
      const gap = await page.evaluate(
        () =>
          new Promise<{ since: number; next: number } | null>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const g = rq.result.transaction('kv').objectStore('kv').get('achieve')
              g.onsuccess = () => {
                rq.result.close()
                res(g.result?.value?.gap ?? null)
              }
            }
          }),
      )
      c.outcome('同一堂沒有再算一次', gap?.since === 1, `since ${gap?.since}／next ${gap?.next}`)
      if (gap?.since !== 1) await c.once('end-count', '誤記作答', '回到晚安道別時同一堂又算了一次', `since ${gap?.since}`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '道別離開回來')
    }
  })

  test('找大 S、小 s：照示範的手剛剛點的位置點下去，要點到對的那張（T-100）', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '照示範的位置點')
    try {
      // 今天已經上到單字（同一天中途離開又回來）：念完單字就到選擇題，小寫題不會被換成大寫題（只有回到選擇題才退一級）
      k.behavior = '從單字接著上'
      await page.evaluate(
        () =>
          new Promise<void>((res) => {
            const d = new Date()
            const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              tx.objectStore('kv').put({ key: 'lesson.english', value: { idx: 0, date: today, done: false, good: false, stage: 'words' } })
              tx.oncomplete = () => res()
            }
          }),
      )
      if (!(await enter(k, c))) return
      await passWrite(k)
      const toQuiz = await waitStage(page, 'quiz', 60_000)
      c.outcome('從單字走到選擇題', toQuiz, toQuiz ? '' : `停在 ${await stageOf(page)}`)
      if (!toQuiz) return void (await c.once('to-quiz', '卡死', '單字念完沒有往下走到選擇', `停在 ${await stageOf(page)}`))
      // 大寫題是新帳號第一次碰到的題型：手先示範。記下手點的那張卡在畫面上的位置，輪到孩子時照那個位置點
      // 小寫題跟大寫題算同一輪，不再示範（T-125，盲測 0f3363f：Watch me 走兩遍，「一直點都一樣」）：直接問、選項出來就收作答
      for (const kind of ['big', 'little']) {
        if (kind === 'little') {
          k.behavior = '找小寫：不再示範，直接問'
          const first = await page
            .waitForSelector('.en-options.is-little .en-opt.is-yes, .en-options.is-little:not([data-accepting="false"]) .en-opt.is-cue', { timeout: 30_000 })
            .catch(() => null)
          const demoed = !!first && (await first.evaluate((el) => el.classList.contains('is-yes')))
          c.outcome('little：跟大寫同一輪，不再示範（T-125）', !!first && !demoed, first ? (demoed ? '小寫題又示範了一次' : '') : '沒有等到小寫題')
          if (!first) await c.once('little-ask', '卡死', '大寫題答完，沒有出現小寫題', `停在 ${await stageOf(page)}`)
          else if (demoed) await c.once('little-demo', '困惑', '小寫題又示範一次（Watch me 走兩遍，看起來一直一樣）', '')
          continue
        }
        k.behavior = `找${kind === 'big' ? '大寫' : '小寫'}：照手剛剛點的位置點`
        const shown = await page.waitForSelector(`.en-options.is-${kind} .en-opt.is-yes`, { timeout: 30_000 }).catch(() => null)
        if (!shown) {
          c.outcome(`${kind}：手有示範`, false, '沒有看到手點答案')
          await c.once(`demo-${kind}`, '困惑', `找${kind === 'big' ? '大寫' : '小寫'}的第一題沒有示範`, '')
          continue
        }
        const box = (await shown.boundingBox())!
        const want = await shown.getAttribute('aria-label')
        const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        // 輪到孩子：選項外面一圈淡黃框（念完 Your turn!、開始收作答）
        await page.waitForSelector(`.en-options.is-${kind}:not([data-accepting="false"]) .en-opt.is-cue`, { timeout: 20_000 })
        const there = await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y)?.closest('.en-opt') as HTMLElement | null)?.getAttribute('aria-label') ?? null, at)
        const t0 = await page.evaluate(() => Date.now())
        k.act(`tap ${Math.round(at.x)},${Math.round(at.y)} 手剛剛點的位置（${there}）`)
        await page.mouse.click(at.x, at.y)
        await page.waitForTimeout(400)
        const row = (await attempts(page)).filter((a) => a.game === 'lesson-en' && a.ts >= t0 - 50).pop()
        const ok = there === want && !!row?.ok
        c.outcome(`${kind}：照示範的位置點到對的`, ok, `示範點 ${want}，輪到孩子時那個位置是 ${there}；作答紀錄 ${row ? (row.ok ? '一次就對' : '點錯') : '沒有'}`)
        if (!ok) await c.once(`moved-${kind}`, '困惑', '示範完選項換了位置：照手剛剛點的地方點，點到的不是答案', `示範 ${want}、那個位置變成 ${there}`)
        // 等下一題開始
        await page.waitForSelector(`.en-options.is-${kind} .en-opt.is-yes`, { timeout: 10_000 }).catch(() => null)
        await page.waitForTimeout(1500)
      }
      await c.flush()
    } finally {
      finish(k, c, '照示範的位置點')
    }
  })

  /** 英文課的進度直接寫進 IndexedDB（今天、還沒上完、停在哪一段） */
  const seedEnglish = (page: Page, v: Record<string, unknown>) =>
    page.evaluate(
      (v) =>
        new Promise<void>((res) => {
          const d = new Date()
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const rq = indexedDB.open('dodo-adventure')
          rq.onsuccess = () => {
            const tx = rq.result.transaction('kv', 'readwrite')
            tx.objectStore('kv').put({ key: 'lesson.english', value: { idx: 0, date: today, done: false, good: false, ...v } })
            tx.oncomplete = () => res()
          }
        }),
      v,
    )
  /** 收作答的時候，點最大的那張（聽不懂 big／little 的孩子只會點大大的）；不收作答回傳 null */
  const bigCard = (page: Page) =>
    page.evaluate(() => {
      const box = document.querySelector('.en-options:not([data-accepting="false"])')
      if (!box) return null
      let best: { x: number; y: number; label: string } | null = null
      let area = 0
      for (const b of box.querySelectorAll<HTMLElement>('.en-opt')) {
        const r = b.getBoundingClientRect()
        if (r.width * r.height > area) {
          area = r.width * r.height
          best = { x: r.x + r.width / 2, y: r.y + r.height / 2, label: b.getAttribute('aria-label') ?? '' }
        }
      }
      return best
    })
  /** 一直只點大的那張，直到上完（stage end）或時間到；回傳花了幾秒（沒上完：null），以及小點每次有沒有往前 */
  async function onlyBig(k: Toddler, limit: number) {
    const page = k.page
    const t0 = Date.now()
    const seen: number[] = []
    /** 每次進度變了：答完幾題、填滿的點有幾顆（T-124：猜對、點錯過的也要填滿） */
    const fills: { done: number; filled: number }[] = []
    /** 每一題的選項：題型和那一組卡片的顏色（q0、q1…） */
    const cards: string[] = []
    let total = 0
    let taps = 0
    const result = (secs: number | null) => ({ secs, seen, total, taps, fills, cards })
    while (Date.now() - t0 < limit) {
      const st = await stageOf(page)
      if (st !== 'quiz') return result(st === 'end' || st === null ? Math.round((Date.now() - t0) / 1000) : null)
      const d = await quizDots(page)
      if (d) total = d.total
      if (d && seen[seen.length - 1] !== d.done) {
        seen.push(d.done)
        fills.push({ done: d.done, filled: await page.evaluate(() => document.querySelectorAll('.en-steps .is-quiz i.on').length) })
      }
      const set = await page.evaluate(() => {
        const box = [...document.querySelectorAll('.en-options')].pop()
        if (!box) return null
        const kind = ['big', 'little', 'word'].find((x) => box.classList.contains(`is-${x}`))
        const q = [...box.classList].find((x) => /^q\d$/.test(x))
        return `${kind}/${q}`
      })
      if (set && cards[cards.length - 1] !== set) cards.push(set)
      const b = await bigCard(page)
      if (b) {
        taps++
        await k.tap({ x: b.x, y: b.y }, `只點大的（${b.label}）`)
        await page.waitForTimeout(700)
      } else await page.waitForTimeout(250)
    }
    return result(null)
  }

  test('只會點大的那張：選擇題也要在合理時間內上完，答完一題進度亮一顆（T-104）、填滿、換一組卡片（T-124）', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '只點大的')
    try {
      // 今天上到單字（描字已經描過）：念完單字到選擇題。第一天的 2 題是 大 A、小 a（T-112：以前 4 題，大 A、小 a 各問兩次）
      k.behavior = '從單字接著上'
      await seedEnglish(page, { stage: 'words' })
      if (!(await enter(k, c))) return
      await passWrite(k)
      const toQuiz = await waitStage(page, 'quiz', 60_000)
      if (!toQuiz) return void (await c.once('to-quiz', '卡死', '單字念完沒有往下走到選擇', `停在 ${await stageOf(page)}`))
      k.behavior = '只點大的'
      // 每題最多錯兩次手就帶著做：2 分鐘一定夠（盲測裡 8 分鐘上不完）
      const r = await onlyBig(k, 120_000)
      c.outcome('只點大的也上得完（2 分鐘內）', r.secs !== null, r.secs !== null ? `選擇題 ${r.secs} 秒、點了 ${r.taps} 下` : `2 分鐘還在選擇題，點了 ${r.taps} 下`)
      if (r.secs === null) await c.once('only-big', '卡死', '只會點大的那張：問小寫一直點錯，選擇題一直上不完', `點了 ${r.taps} 下`)
      const steps = r.seen.join('→')
      // 小點從 0 亮到 題數-1（答完最後一題就下課了）
      const forward = r.total > 0 && r.seen.length >= r.total && r.seen.every((x, j) => j === 0 || x === r.seen[j - 1] + 1)
      c.outcome('答完一題，進度小點亮一顆', forward, steps ? `小點 ${steps}` : '沒有小點')
      if (!forward) await c.once('dots', '困惑', '選擇題答完一題，看不出進度往前', steps ? `小點 ${steps}` : '畫面上沒有選擇題的進度')
      // T-124（盲測 f255333：「一直點都一樣」）：點錯過、手帶著做的那一題，進度點也要填滿；每一題換一組卡片；小寫題不會被換成大寫題
      const filled = r.fills.filter((f) => f.done > 0)
      const fillOk = filled.length > 0 && filled.every((f) => f.filled === f.done)
      c.outcome('答完一題（點錯過也算）進度點就填滿', fillOk, r.fills.map((f) => `${f.done} 題／填滿 ${f.filled}`).join('、'))
      if (!fillOk) await c.once('dots-fill', '困惑', '選擇題答完一題，進度點沒有填滿（看不出往前走）', r.fills.map((f) => `${f.done} 題／填滿 ${f.filled}`).join('、'))
      const sets = r.cards.map((x) => x.split('/')[1])
      const fresh = sets.length >= 2 && sets.every((q, j) => j === 0 || q !== sets[j - 1])
      c.outcome('每一題換一組卡片', fresh, r.cards.join(' → '))
      if (!fresh) await c.once('cards-same', '困惑', '選擇題換下一題，卡片看起來跟上一題一樣', r.cards.join(' → '))
      const both = r.cards.some((x) => x.startsWith('big/')) && r.cards.some((x) => x.startsWith('little/'))
      c.outcome('大寫、小寫都問到（小寫題沒有換成大寫題）', both, r.cards.join(' → '))
      if (!both) await c.once('cases', '困惑', '選擇題只問到大寫（小寫題被換成大寫題，同一題問兩次）', r.cards.join(' → '))
      await c.flush()
    } finally {
      finish(k, c, '只點大的')
    }
  })

  test('選擇題答到一半離開，回來先示範這一題、進度還在（T-104）', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '選擇題回來')
    try {
      // 選擇題已經答完 1 題（大 A 一次就對），離開又回來
      k.behavior = '選擇題回來'
      await seedEnglish(page, { stage: 'quiz', round: 1, answers: [{ kind: 'big', first: true }] })
      if (!(await enter(k, c))) return
      const inQuiz = await waitStage(page, 'quiz', 15_000)
      c.outcome('回到選擇題', inQuiz, inQuiz ? '' : `停在 ${await stageOf(page)}`)
      if (!inQuiz) return void (await c.once('back-quiz', '卡死', '選擇題中途離開，回來沒有接著選擇題', `停在 ${await stageOf(page)}`))
      const d = await quizDots(page)
      c.outcome('進度還在（亮 1 顆）', d?.done === 1, d ? `小點 ${d.done}/${d.total}` : '沒有小點')
      if (d?.done !== 1) await c.once('dots-kept', '困惑', '選擇題回來以後，進度從頭開始', d ? `小點 ${d.done}/${d.total}` : '畫面上沒有選擇題的進度')
      // 先示範：手出來點答案（T-108 之後示範中也可以搶，所以看示範的樣子 .is-demo，不看還收不收作答）
      const demo = await page
        .waitForFunction(() => document.querySelector('.en-options.is-demo .en-opt.is-yes'), null, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
      c.outcome('回來先示範這一題', demo, demo ? '' : '直接開始收作答')
      if (!demo) await c.once('replay', '困惑', '選擇題中途離開再回來，沒有先示範就直接問', '')
      k.behavior = '只點大的'
      const r = await onlyBig(k, 120_000)
      c.outcome('接著上完', r.secs !== null, r.secs !== null ? `${r.secs} 秒` : '2 分鐘還在選擇題')
      if (r.secs === null) await c.once('resume-finish', '卡死', '選擇題回來以後上不完', `點了 ${r.taps} 下`)
      await c.flush()
    } finally {
      finish(k, c, '選擇題回來')
    }
  })

  test('描字：描到一半抬筆，再從綠點重描', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '描到一半')
    try {
      if (!(await enter(k, c))) return
      const toTrace = await waitStage(page, 'trace', 60_000)
      if (!toTrace) return void (await c.once('to-trace', '卡死', '沒有走到描字', `停在 ${await stageOf(page)}`))
      /** 可以畫了 → true；一直不能畫 → false；已經描完、走到下一段了 → null（描字只有大寫、小寫各一次，A5） */
      const ready = async () => {
        for (let i = 0; i < 80; i++) {
          if ((await stageOf(page)) !== 'trace') return null
          if (await page.evaluate(() => {
            const t = document.querySelector('.en-trace')
            return !!t && t.getAttribute('data-accepting') !== 'false' && !t.hasAttribute('data-demo')
          }))
            return true
          await k.wait(250)
        }
        return false
      }
      for (const how of ['restart', 'continue', 'restart'] as const) {
        k.behavior = how === 'restart' ? '描到一半被打斷，從綠點重描' : '描到一半抬筆，接著描'
        const r = await ready()
        if (r === null) break
        if (!r) {
          await c.once('trace-ready', '卡死', '描字一直不能畫', `停在 ${await stageOf(page)}`)
          break
        }
        await k.wait(300)
        const ok = await halfThenAgain(k, how, { board: '.en-trace-board', done: '.en-trace-rounds .is-done' })
        if (ok === null) continue
        c.outcome(k.behavior, ok, '')
        if (!ok) await c.once(`half:${how}`, '卡死', `描字${how === 'restart' ? '描到一半被打斷，從綠點重描' : '描到一半抬筆再接著描'}，這一筆描不完`, '')
        await c.flush()
      }
    } finally {
      finish(k, c, '描到一半')
    }
  })
})
