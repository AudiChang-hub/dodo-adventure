import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { attempts, boot, settle, snap } from './lib/app'
import { Toddler, hashSeed, rng } from './lib/toddler'
import { Checker, alive, audit, doorAt, ignoreNext, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'
import { homeButton } from './lib/app'
import { pickOf, untilTurn } from './lib/english-play'

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
  // T-127：選擇題每天輪流三種玩法。這個檔測的是找卡片，固定下來（泡泡、餵豆豆各有自己的 spec）
  await page.addInitScript(() => localStorage.setItem('dodo:en-quiz', 'cards'))
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
  // T-127：寫寫看先二選一（描字、塗字母），這裡選描字
  const pick = k.page.locator('[data-write-pick="trace"]')
  if (await pick.waitFor({ timeout: 10_000 }).then(() => true, () => false)) await pick.click()
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
  // 聽字找圖（T-147）：要找的字在豆豆頭上泡泡的 data-word
  const word = await page.evaluate(() => document.querySelector('.en-ask-in[data-word]')?.getAttribute('data-word') ?? null)
  // 大寫題的陪襯可能是同一個字母的小寫（教過的才當陪襯）：照題型比對
  const right = opts.find((o) => (kind === 'big' ? o.label === L : kind === 'little' ? o.label === L?.toLowerCase() : o.label === word))
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
      // 跑道填了多少：這一筆的彩色跑道是 pathLength 的那一條，stroke-dasharray 的第一個數字是描到哪裡
      // （跑道發亮的那一層也有 pathLength，跳過，T-113：描到一半放手會亮）。
      // 量放手之前填到哪裡（T-139 起描過三分之一放手就算過關、補滿、換下一段，放手之後跑道就不在了）
      await page.evaluate(() => {
        const w = window as unknown as { __fill?: number; __up?: boolean }
        w.__fill = 0
        w.__up = false
        const read = () => {
          if (w.__up) return
          const boards = [...document.querySelectorAll('.en-trace-board')]
          const lane = [...(boards[boards.length - 1]?.querySelectorAll('path[pathLength]') ?? [])].find((x) => !x.closest('[data-trace-glow]'))
          if (!lane) return
          const [a] = (lane.getAttribute('stroke-dasharray') ?? '0').split(' ').map(Number)
          w.__fill = Math.max(w.__fill ?? 0, a / Number(lane.getAttribute('pathLength') ?? 1))
        }
        new MutationObserver(read).observe(document.querySelector('.en-trace')!, { subtree: true, attributes: true, childList: true })
        window.addEventListener('pointerup', () => void (read(), (w.__up = true)), true)
      })
      k.behavior = '瞄準綠點、手指落在下面一點，照小 s 的樣子畫一半'
      await k.drag(pts, { stepMs: 16, label: '描小 s（按偏 15 mm、畫一半）' })
      await k.wait(500)
      const filled = await page.evaluate(() => (window as unknown as { __fill?: number }).__fill ?? 0)
      c.outcome('跑道有填（吸到起點、照樣子畫有算）', filled >= 0.25, `填了 ${Math.round(filled * 100)}%`)
      if (filled < 0.25) await c.once('trace-offset', '困惑', '描小 s 手指落在綠點下面一點、照樣子畫：畫得出灰線，跑道卻沒有填', `填了 ${Math.round(filled * 100)}%`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '描小s按偏')
    }
  })

  // T-134（2026-11-11 PM 三歲測試「走完一課」偶發：示範時亂畫就算描完了）：示範時手掌壓上去、滑了一下（三根手指），
  // 第一根手指搶掉示範、畫了 9 mm 以上，被當成一次「沒描好」→ 筆帶著描完、這一輪算描完，他根本沒描到。
  // 要做到：示範時搶畫、多指（手掌）的那一下不算沒描好（還是輪到他、綠點等他）；輪到他時單指真的亂畫，照 T-125 筆帶著描完
  test('描字：示範時手掌壓著滑一下不算沒描好；輪到他單指亂畫才由筆帶著描完（T-134）', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '示範時手掌')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
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
      // 筆正在示範、而且已經收觸碰（剛出來的 0.5 秒過了）
      const demo = await page
        .waitForFunction(() => !!document.querySelector('.en-trace[data-demo]') && document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false', null, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (!demo) return void (await c.once('no-demo', '困惑', '描字沒有示範', ''))
      const board = await page.evaluate(() => {
        const r = document.querySelector('.en-trace-paper')!.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      })
      // 手掌：三根手指壓在描字板下半部（不在起點附近），一邊抖一邊滑 0.9 秒（墨水遠超過 9 mm）
      const at = (fx: number, fy: number) => ({ x: board.x + board.w * fx, y: board.y + board.h * fy })
      k.behavior = '示範時手掌壓著滑'
      await k.palm([at(0.4, 0.72), at(0.55, 0.78), at(0.45, 0.62)], 900)
      await page.waitForTimeout(2500)
      const after = await page.evaluate(() => ({
        done: document.querySelectorAll('.en-trace-rounds .is-done').length,
        finished: !!document.querySelector('.en-trace [data-trace-finished]'),
        demo: !!document.querySelector('.en-trace[data-demo]'),
        accepting: document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false',
      }))
      const kept = !after.done && !after.finished && !after.demo && after.accepting
      c.outcome('示範時手掌壓著滑：示範收掉、輪到他，不算沒描好（沒有被筆帶著描完）', kept, JSON.stringify(after))
      if (!kept) await c.once('palm-miss', '誤記作答', '示範時手掌壓著滑一下，就被當成沒描好、筆帶著描完（他沒描到）', JSON.stringify(after))

      // 對照：輪到他時一根手指在描字板空白的地方亂畫一大段 → 照 T-125：You drew it!、筆帶著描完、往下
      k.behavior = '輪到他單指亂畫'
      const zig = Array.from({ length: 10 }, (_, i) => at(0.15 + (i % 2) * 0.12, 0.3 + i * 0.05))
      await k.drag(zig, { stepMs: 30, label: '單指亂畫' })
      const helped = await page.waitForSelector('.en-trace [data-trace-finished]', { state: 'attached', timeout: 15_000 }).catch(() => null)
      c.outcome('輪到他單指亂畫：照舊由筆帶著描完（T-125 不變）', !!helped)
      if (!helped) await c.once('real-miss', '卡死', '輪到他單指亂畫一大段，筆沒有帶著描完', '')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '示範時手掌')
    }
  })

  // T-139（盲測 61ee1cf 貼紙本 2 第 7～9 步、中文 2 第 10～12 步）：描大 S 從綠點描過上面的彎、斜下來到中間（四成左右）就放手，
  // 以前算「沒描好」→ You drew it! → 筆帶著描完（平平的、沒有彩虹），接著又是小 s 的示範；他說「一直畫都不知道對不對，好久喔」離開。
  // 要做到：(1) 跑道上有小星星，一邊描一邊亮（放手之前就亮）；(2) 照盲測那一筆描到四成放手：算過關、彩虹（不是筆帶著描完），
  // 作答紀錄照樣嚴格（不算描好）；(3) 描不到三分之一就放手：照 T-125 由筆帶著描完（平平的）
  test('描大 S：照盲測那一筆描到四成放手 → 小星星一邊描一邊亮、算過關（彩虹）；描不到三分之一才由筆帶著描完（T-139）', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '描到四成過關')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
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
      const miles = () => page.evaluate(() => [...document.querySelectorAll('.en-trace [data-trace-mile]')].map((m) => m.getAttribute('data-trace-mile')))
      const m0 = await miles()
      c.outcome('大 S 的跑道上有兩顆小星星、還沒亮', m0.length === 2 && m0.every((x) => x === ''), JSON.stringify(m0))
      if (m0.length !== 2) await c.once('no-miles', '困惑', '描大 S 的跑道上沒有小星星，描的時候看不出進度', JSON.stringify(m0))
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1200') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/大S小星星.png` })

      // 記下第一顆星星什麼時候亮、手指什麼時候放開（星星要在放手之前、一邊描一邊亮）
      await page.evaluate(() => {
        const w = window as unknown as { __lit?: number; __up?: number }
        delete w.__lit
        delete w.__up
        new MutationObserver(() => {
          if (w.__lit === undefined && document.querySelector('.en-trace [data-trace-mile="lit"]')) w.__lit = performance.now()
        }).observe(document.querySelector('.en-trace')!, { subtree: true, attributes: true, childList: true })
        window.addEventListener('pointerup', () => void (w.__up ??= performance.now()), true)
      })
      // 盲測那一筆（中文 2 第 11 步截圖上他的墨水，1280×800；描字板在 (427,105) 寬 426 高 600），換算到這個尺寸的描字板
      const BLIND = [
        [733, 240],
        [685, 188],
        [600, 192],
        [557, 258],
        [600, 325],
        [652, 360],
      ]
      const REF = { x: 427, y: 105, w: 426, h: 600 }
      const box = await page.evaluate(() => {
        const r = document.querySelector('.en-trace-paper')!.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      })
      const pts = BLIND.map(([x, y]) => ({ x: box.x + ((x - REF.x) / REF.w) * box.w, y: box.y + ((y - REF.y) / REF.h) * box.h }))
      k.behavior = '照盲測那一筆描大 S，描到中間放手'
      await k.drag(pts, { stepMs: 24, label: '描大 S 到中間（盲測那一筆）' })
      const t = await page.evaluate(() => {
        const w = window as unknown as { __lit?: number; __up?: number }
        return { lit: w.__lit ?? null, up: w.__up ?? null }
      })
      const early = t.lit !== null && t.up !== null && t.lit < t.up
      c.outcome('一邊描、小星星一邊亮（放手之前就亮了）', early, JSON.stringify(t))
      if (!early) await c.once('mile-late', '困惑', '描大 S 描到四成，跑道上的小星星沒有在描的時候亮，看不出自己描到哪裡', JSON.stringify(t))
      const fin = await page
        .waitForSelector('.en-trace [data-trace-finished]', { state: 'attached', timeout: 4000 })
        .then((e) => e.getAttribute('data-trace-neat'))
        .catch(() => null)
      c.outcome('描到四成放手：算過關、彩虹慶祝（不是筆帶著描完）', fin === '1', `data-trace-neat=${fin}`)
      if (fin !== '1') await c.once('short-pass', '困惑', '描大 S 描到四成放手，沒有算過關（沒有彩虹、或筆帶著描完）', `data-trace-neat=${fin}`)
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1200') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/大S描到四成過關.png` })
      await k.wait(1500)
      // 示範（Watch me）也會記一筆 phase 'teach'，只看他自己描的那一筆
      const rec = (await attempts(page)).filter((a) => a.game === 'lesson-en' && a.itemId === 'write:S' && a.phase !== 'teach')
      c.outcome('作答紀錄照樣嚴格：描到四成的不算描好', rec.length === 1 && !rec[0].ok, JSON.stringify(rec.map((a) => a.ok)))
      if (rec.length !== 1 || rec[0].ok) await c.once('short-record', '誤記作答', '描大 S 只描到四成，作答紀錄記成描好了（或記了不只一筆）', JSON.stringify(rec.map((a) => a.ok)))

      // (3) 小 s 只描兩成就放手：照 T-125 由筆帶著描完（平平的、不是彩虹）
      const little = await page
        .waitForFunction(() => document.querySelector('.en-trace-rounds .is-now')?.textContent?.trim() === 's', null, { timeout: 20_000 })
        .then(() => true, () => false)
      if (!little) return void (await c.once('no-little', '卡死', '大 S 過關以後沒有換到小 s', ''))
      await canDraw()
      await k.wait(400)
      const along = await page.evaluate(() => {
        const boards = [...document.querySelectorAll('.en-trace-board')]
        const p = boards[boards.length - 1].querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
        const m = p.getScreenCTM()!
        const len = p.getTotalLength()
        return Array.from({ length: 7 }, (_, i) => {
          const q = p.getPointAtLength(len * 0.2 * (i / 6))
          const s = new DOMPoint(q.x, q.y).matrixTransform(m)
          return { x: s.x, y: s.y }
        })
      })
      k.behavior = '小 s 描兩成就放手'
      await k.drag(along, { stepMs: 24, label: '描小 s 到兩成' })
      const fin2 = await page
        .waitForSelector('.en-trace [data-trace-finished]', { state: 'attached', timeout: 15_000 })
        .then((e) => e.getAttribute('data-trace-neat'))
        .catch(() => null)
      c.outcome('描不到三分之一放手：照 T-125 由筆帶著描完（平平的）', fin2 === '0', `data-trace-neat=${fin2}`)
      if (fin2 !== '0') await c.once('below-pass', '卡死', '小 s 描兩成放手，沒有照 T-125 由筆帶著描完', `data-trace-neat=${fin2}`)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '描到四成過關')
    }
  })

  // T-135（AI 小男生盲測 becf39a 英文 0/2：寫寫看二選一卡關）。今天直接從寫寫看接著上
  async function toWrite(k: Toddler, c: Checker) {
    const page = k.page
    const day = await page.evaluate(() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
    await page.evaluate(
      (day) =>
        new Promise((res) => {
          const rq = indexedDB.open('dodo-adventure')
          rq.onsuccess = () => {
            const tx = rq.result.transaction('kv', 'readwrite')
            tx.objectStore('kv').put({ key: 'lesson.english', value: { idx: 0, seq: 'SABCDEFGHIJKLMNOPQRTUVWXYZ', date: day, done: false, good: false, stage: 'write', round: 0 } })
            tx.oncomplete = () => res(0)
          }
        }),
      day,
    )
    if (!(await enter(k, c))) return false
    const ok = await page.waitForSelector('.en-write-pick', { timeout: 20_000 }).then(() => true, () => false)
    if (!ok) await c.once('no-pick', '卡死', '沒有從寫寫看接著上（沒看到二選一）', `停在 ${await stageOf(page)}`)
    return ok
  }
  const rectOf = (page: Page, sel: string) =>
    page.evaluate((sel) => {
      const r = document.querySelector(sel)!.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height }
    }, sel)

  // 盲測 becf39a 英文 1 第 45、46 步：他照著描字卡上示範的手，在卡片上「描」了兩次（拖一下），卡片沒有被選到、也沒有任何回應。
  // 拖一下（不是點一下）也要選到描字；選到之後描到一半放手，照 T-125 由筆帶著描完
  test('寫寫看二選一：照著卡片上的手在描字卡上拖一下就選到描字；描到一半放手由筆帶著描完（T-135）', async ({ page }, info) => {
    test.skip(!want('lesson-english-write'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '描字卡上拖一下')
    try {
      if (!(await toWrite(k, c))) return
      await page.waitForTimeout(1500)
      const card = await rectOf(page, '[data-write-pick="trace"]')
      const at = (fx: number, fy: number) => ({ x: card.x + card.w * fx, y: card.y + card.h * fy })
      k.behavior = '照著卡片上的手描一下'
      await k.drag([at(0.65, 0.3), at(0.5, 0.25), at(0.35, 0.35), at(0.45, 0.48), at(0.6, 0.58)], { stepMs: 24, label: '在描字卡上描' })
      const picked = await page.waitForSelector('.en-trace', { timeout: 4000 }).then(() => true, () => false)
      c.outcome('在描字卡上拖一下：選到描字', picked)
      if (!picked) return void (await c.once('drag-card', '卡死', '在描字卡上照著手拖一下，卡片沒有被選到、沒有回應（盲測 becf39a 英文 1 第 45、46 步）', ''))

      // 描到一半放手（盲測：拖 2～3 次都半途放手）→ 帶著描完（T-125；T-139 起描過三分之一算過關、補滿）
      k.behavior = '描到一半放手'
      await page.waitForFunction(() => document.querySelector('.en-trace')?.getAttribute('data-accepting') !== 'false', null, { timeout: 20_000 })
      const half = await page.evaluate(() => {
        const boards = [...document.querySelectorAll('.en-trace-board')]
        const p = boards[boards.length - 1].querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
        const m = p.getScreenCTM()!
        const len = p.getTotalLength()
        return Array.from({ length: 9 }, (_, i) => {
          const q = p.getPointAtLength((len * 0.45 * i) / 8)
          const s = new DOMPoint(q.x, q.y).matrixTransform(m)
          return { x: s.x, y: s.y }
        })
      })
      await k.drag(half, { stepMs: 24, label: '描到一半放手' })
      const helped = await page.waitForSelector('.en-trace [data-trace-finished]', { state: 'attached', timeout: 15_000 }).then(() => true, () => false)
      c.outcome('描到一半放手：帶著描完（T-125、T-139）', helped)
      if (!helped) await c.once('half-lift', '卡死', '寫寫看描到一半放手，沒有回應、筆沒有帶著描完', '')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '描字卡上拖一下')
    }
  })

  // 盲測 becf39a：塗字母塗幾筆，點右下的勾勾（以前要按住 1.2 秒），12 輪點了 19 次沒有一次完成。點一下就要完成、慶祝、出「下一步」
  test('塗字母：塗一筆、點一下勾勾就完成、出下一步（T-135）', async ({ page }, info) => {
    test.skip(!want('lesson-english-write'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '塗字母點勾勾', false, false)
    try {
      if (!(await toWrite(k, c))) return
      await page.waitForTimeout(800)
      await k.tap(await page.locator('[data-write-pick="color"]').boundingBox().then((b) => ({ x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 })), '塗字母卡')
      if (!(await page.waitForSelector('.en-color', { timeout: 4000 }).then(() => true, () => false))) return void (await c.once('no-color', '卡死', '點塗字母卡沒有進到塗字母', ''))
      // 在字母裡面塗一小筆（第一筆的前 30%，不到完成的六成）
      const pts = await page.evaluate(() => {
        const p = document.querySelector<SVGPathElement>('.wc-board mask path')!
        const m = p.getScreenCTM()!
        const len = p.getTotalLength()
        return Array.from({ length: 8 }, (_, i) => {
          const q = p.getPointAtLength((len * 0.3 * i) / 7)
          const s = new DOMPoint(q.x, q.y).matrixTransform(m)
          return { x: s.x, y: s.y }
        })
      })
      k.behavior = '塗一筆'
      await k.drag(pts, { stepMs: 24, label: '塗一筆' })
      const btn = await page.waitForSelector('[data-color-check]', { timeout: 4000 }).catch(() => null)
      if (!btn) return void (await c.once('no-check', '卡死', '塗了一筆，勾勾沒有出來', ''))
      await page.waitForTimeout(500)
      const done0 = await page.locator('.en-color[data-color-done]').count()
      c.outcome('塗一筆還沒到六成：不會自己完成', done0 === 0)
      // 塗過以後發呆：手指向勾勾（不說話）
      k.behavior = '塗了一筆就發呆'
      const pointed = await page.waitForSelector('.en-color .demo-hand', { timeout: 16_000 }).then(() => true, () => false)
      c.outcome('塗過以後發呆：手指向勾勾', pointed)
      if (!pointed) await c.once('no-point-check', '困惑', '塗了一筆就發呆，沒有手指向勾勾', '')
      const b = (await btn.boundingBox())!
      k.behavior = '點一下勾勾'
      await k.tap({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, '勾勾')
      const done = await page.waitForSelector('.en-color[data-color-done]', { state: 'attached', timeout: 3000 }).then(() => true, () => false)
      c.outcome('點一下勾勾：完成、慶祝', done)
      if (!done) return void (await c.once('tap-check', '卡死', '塗字母點一下勾勾沒有完成（盲測 becf39a：19 次都沒完成）', ''))
      const next = await page.waitForSelector('.next-step', { timeout: 10_000 }).then(() => true, () => false)
      c.outcome('完成後出「下一步」', next)
      if (!next) await c.once('no-next', '卡死', '塗字母完成後沒有出「下一步」', '')
      const rec = (await attempts(page)).filter((a) => a.game === 'en-color')
      const recOk = rec.length === 1 && rec[0].phase === 'guided' && rec[0].itemId === 'write:S'
      c.outcome('記一筆 en-color（phase guided，不算描字熟練）', recOk, JSON.stringify(rec.map((a) => ({ phase: a.phase, itemId: a.itemId }))))
      if (!recOk) await c.once('color-rec', '誤記作答', '塗字母的作答紀錄不對（要一筆 en-color、phase guided）', JSON.stringify(rec))
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '塗字母點勾勾')
    }
  })

  // T-132（家長：「英文描字的部分大小寫都要有格線，這樣才知道大小寫的差異」）：大 S、小 s 都在四線格上，
  // 大 S 從頂線到底線、小 s 從中線到底線；格線是畫面上的圖，點不到、不算要描的線，描字照舊描得完、往下一輪
  test('描字的四線格：大 S、小 s 都有格線，大 S 頂線到底線、小 s 中線到底線', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '四線格')
    try {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
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
      /** 這一輪的格線（四條線的 y，描字板單位）、這一筆跑道實際的上下（getBBox）、在螢幕上多高 */
      const measure = () =>
        page.evaluate(() => {
          const boards = [...document.querySelectorAll('.en-trace-board')]
          const b = boards[boards.length - 1]
          const lines = Object.fromEntries([...b.querySelectorAll<SVGLineElement>('[data-grid] line')].map((l) => [l.getAttribute('data-line'), Number(l.getAttribute('y1'))]))
          const grid = b.querySelector('[data-grid]')
          const lane = b.querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
          const bb = lane.getBBox()
          const px = lane.getBoundingClientRect().height
          return { n: Object.keys(lines).length, lines, top: bb.y, bottom: bb.y + bb.height, px, events: grid ? getComputedStyle(grid).pointerEvents : null, now: document.querySelector('.en-trace-rounds .is-now')?.textContent?.trim() ?? null }
        })
      const near = (a: number, b: number) => Math.abs(a - b) <= 2.5
      const shotTo = async (name: string) => {
        if (!SHOTS || info.project.name !== 'tab1200') return
        fs.mkdirSync(SHOTS, { recursive: true })
        await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
      }

      // 大 S：示範完、輪到他
      await canDraw()
      const big = await measure()
      c.outcome('大 S 有四線格（4 條、點不到）', big.n === 4 && big.events === 'none', `${big.n} 條、pointer-events ${big.events}`)
      c.outcome('大 S 從頂線到底線', near(big.top, big.lines.top) && near(big.bottom, big.lines.base), `${big.top.toFixed(1)}～${big.bottom.toFixed(1)}（頂線 ${big.lines.top}、底線 ${big.lines.base}）`)
      if (big.n !== 4) await c.once('grid-big', '困惑', '描大寫時沒有四線格', `${big.n} 條`)
      await shotTo('大S-四線格')

      // 照常描：一筆描到八成放手（格線不影響描字），完成、往下一輪
      const pts = await page.evaluate(() => {
        const boards = [...document.querySelectorAll('.en-trace-board')]
        const p = boards[boards.length - 1].querySelector<SVGPathElement>('path[stroke-dasharray="3 3"]')!
        const m = p.getScreenCTM()!
        const len = p.getTotalLength()
        return Array.from({ length: 9 }, (_, i) => {
          const q = p.getPointAtLength(len * 0.8 * (i / 8))
          const s = new DOMPoint(q.x, q.y).matrixTransform(m)
          return { x: s.x, y: s.y }
        })
      })
      k.behavior = '在四線格上描大 S'
      await k.drag(pts, { stepMs: 10, label: '描 S（到八成）' })
      const fx = await page.waitForSelector('[data-trace-finished]', { state: 'attached', timeout: 4000 }).catch(() => null)
      c.outcome('有格線照樣描得完（完成效果）', !!fx)
      if (!fx) await c.once('grid-trace', '卡死', '加了四線格以後，大 S 描到八成放手沒有完成', '')

      // 小 s：同一個四線格，從中線到底線
      const little = await page
        .waitForFunction(() => document.querySelector('.en-trace-rounds .is-now')?.textContent?.trim() === 's', null, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (!little) return void (await c.once('no-little', '卡死', '大 S 描完沒有到小 s', ''))
      await canDraw()
      const small = await measure()
      c.outcome('小 s 有四線格（同一個位置）', small.n === 4 && JSON.stringify(small.lines) === JSON.stringify(big.lines), JSON.stringify(small.lines))
      c.outcome('小 s 從中線到底線', near(small.top, small.lines.mid) && near(small.bottom, small.lines.base), `${small.top.toFixed(1)}～${small.bottom.toFixed(1)}（中線 ${small.lines.mid}、底線 ${small.lines.base}）`)
      c.outcome('大 S 和小 s 一眼看得出高度不一樣（小 s 不到大 S 的六成）', small.px / big.px < 0.6, `大 S ${Math.round(big.px)} px、小 s ${Math.round(small.px)} px`)
      if (small.px / big.px >= 0.6) await c.once('grid-height', '困惑', '大 S 和小 s 看起來一樣高，看不出大小寫的差異', `${Math.round(big.px)} / ${Math.round(small.px)} px`)
      await shotTo('小s-四線格')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '四線格')
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

      // (1) 大寫 S 描到四成放手：不用重描、帶著描完（T-122，盲測 ca0d1e1：描到一半放手被說 Nice try 要重描，「好煩」離開；T-139 起描過三分之一算過關、補滿）
      k.behavior = '大寫 S 描到四成放手'
      await k.drag(await along(0, 0.4), { stepMs: 16, label: '描大 S 到四成' })
      const half = await filled()
      const carried = await finished(10_000)
      if (process.env.TODDLER_SHOTS && info.project.name === 'tab1280') await page.screenshot({ path: `${process.env.TODDLER_SHOTS}/大S描到四成放手.png` })
      c.outcome('描到四成放手：不用重描，帶著描完（T-122；T-139 起描過三分之一算過關、補滿）', carried, `放手時填了 ${Math.round(half * 100)}%${carried ? '' : `；10 秒後 ${Math.round((await filled()) * 100)}%`}`)
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
      // T-149 E1：描好了，慶祝之前念一次字母名（S…）。只看有沒有念到（筆帶著描完的那一種念的是 Big S.）
      const named = await page.evaluate((L) => window.__toddler.voices.some((v) => (v.text ?? '').trim() === `${L}…`), L)
      c.outcome('描好了念一次字母名（E1）', named, `${L}…`)
      await c.flush()

      // 3. 單字：一直點圖
      k.behavior = '單字亂點'
      await page.waitForTimeout(2500)
      await shot(page, '5-單字', info)
      // T-149 E3：陪玩小字是代表字的生活連結（不是只有「跟他一起說」）
      const tip = await page.evaluate(() => document.querySelector('.en-coplay')?.textContent ?? '')
      c.outcome('單字的陪玩小字是生活連結（E3）', tip.length > 6 && !/跟他一起說：/.test(tip), tip.slice(0, 40))
      if (!tip) await c.once('words-tip', '小問題', '單字那一段沒有陪玩小字', '')
      await page.evaluate(() => {
        ;(window as unknown as { __enWords?: string[] }).__enWords = [...document.querySelectorAll('.en-word-card')].map((e) => (e.getAttribute('aria-label') ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      })
      // T-147：一個字母教 2 個代表字
      const nWords = await page.evaluate(() => document.querySelectorAll('.en-word-card').length)
      c.outcome('單字 2 張（T-147）', nWords === 2, `${nWords} 張`)
      if (nWords !== 2) await c.once('words-2', '小問題', '單字範例不是 2 張', `${nWords} 張`)
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
      // 5. 泡泡派對（T-147）：連點同一顆、兩根手指一起點、點空白，都不會壞、不記作答；10 秒左右自己到下課
      const party = await waitStage(page, 'party', 15_000)
      c.outcome('遊戲回合做完 → 泡泡派對', party, party ? '' : `停在 ${await stageOf(page)}`)
      if (!party) await c.once('party', '卡死', '遊戲回合做完沒有出現泡泡派對', `停在 ${await stageOf(page)}`)
      if (party) {
        k.behavior = '泡泡派對亂點'
        const tParty = Date.now()
        await page.waitForTimeout(800)
        await shot(page, '6b-泡泡派對', info)
        const bubbles = () =>
          page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.en-party-bubble')].map((e) => {
              const r = e.getBoundingClientRect()
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
            }),
          )
        const n0 = (await attempts(page)).filter((a) => a.phase !== 'teach').length
        const b0 = await bubbles()
        c.outcome('泡泡派對：滿畫面都是泡泡', b0.length >= 6, `${b0.length} 顆`)
        if (b0[0]) await k.spam(b0[0], 4, '連點同一顆泡泡')
        // 點破的那顆還在淡出（AnimatePresence 留在畫面上一下）：等它消失再找下一顆，不然兩根手指可能點到正在消失的那顆
        await page.waitForTimeout(700)
        const b1 = await bubbles()
        if (b1.length >= 2) await k.twoFinger([b1[0]], b1[1], 150)
        await k.tap({ x: 600, y: 140 }, '派對時點空白')
        await page.waitForTimeout(700)
        const left = (await bubbles()).length
        c.outcome('點破的泡泡不見了（連點、多指都有反應）', left <= b0.length - 2, `${b0.length} → ${left} 顆`)
        if (left > b0.length - 2) await c.once('party-pop', '困惑', '泡泡派對點了泡泡沒有破', `${b0.length} → ${left} 顆`)
        const n1 = (await attempts(page)).filter((a) => a.phase !== 'teach').length
        c.outcome('泡泡派對不記作答', n1 === n0, `多了 ${n1 - n0} 筆`)
        if (n1 !== n0) await c.once('party-rec', '誤記作答', '泡泡派對點泡泡被記成作答', `多了 ${n1 - n0} 筆`)
        const gone = await waitStage(page, 'end', 15_000)
        const secs = Math.round((Date.now() - tParty) / 100) / 10
        c.outcome('泡泡派對自己結束（約 10 秒）', gone && secs <= 13, `${secs} 秒`)
        if (!gone) await c.once('party-end', '卡死', '泡泡派對一直不結束', `停在 ${await stageOf(page)}`)
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
      // T-149 C1：下課時給大人一句「今天在家可以做的事」，看得到、不擋恐龍和房子
      const home = await page.evaluate(() => {
        const e = document.querySelector('.en-bye-tip')
        if (!e) return null
        const r = e.getBoundingClientRect()
        const hit = [...document.querySelectorAll('.lb-host, .lb-home, .lesson-next')].some((x) => {
          const q = x.getBoundingClientRect()
          return q.width && !(q.right < r.left || q.left > r.right || q.bottom < r.top || q.top > r.bottom)
        })
        return { text: e.textContent ?? '', visible: r.width > 0 && getComputedStyle(e).display !== 'none', hit }
      })
      c.outcome('下課：今天在家可以做的事（C1）', !!home?.visible && !home.hit && /開頭/.test(home.text), home ? `${home.text.slice(0, 40)}${home.hit ? '（疊到恐龍或房子）' : ''}` : '沒有')
      if (!home?.visible || home.hit) await c.once('bye-tip', '小問題', '下課沒有「今天在家可以做的事」，或疊到恐龍、房子', JSON.stringify(home))
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
        // T-147：今天上完了又進來是字母遊戲時間（字母牆第一塊是今天的字母），不再從頭複習
        { name: '今天上完了又進來 → 字母遊戲時間（牆上第一塊是今天的字母）', p: { idx: 3, date: today, done: true, good: true }, want: 'D', again: true },
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
        await page.waitForSelector(cs.again ? '.en-wall .en-block' : '.en-meet .en-letter.is-big', { timeout: 10_000 }).catch(() => null)
        const L = cs.again ? await page.evaluate(() => document.querySelector('.en-wall .en-block')?.getAttribute('aria-label') ?? null) : await letterOf(page)
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
      // 返回鍵點得到：回首頁；再進來是字母遊戲時間（回去過一次就清掉；T-147 以前是從頭複習）
      k.behavior = '晚安道別按返回'
      const h = await homeButton(page)
      if (h) await pressBack(k, h, '晚安道別按返回')
      const back = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('晚安道別按返回 → 首頁', back === 'home', `到 ${back}`)
      if (back !== 'home') await c.once('end-back', '無法返回', '回到晚安道別時按返回沒有回首頁', `停在 ${back}`)
      k.behavior = '再進來'
      if (!(await enter(k, c))) return
      const wall2 = await page.waitForSelector('.en-wall', { timeout: 8000 }).catch(() => null)
      c.outcome('再進來：字母遊戲時間（字母牆）', !!wall2, `停在 ${await stageOf(page)}`)
      if (!wall2) await c.once('end-review', '誤記作答', '回過晚安道別以後再進來，沒有到字母遊戲時間', `停在 ${await stageOf(page)}`)
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

  test('下課畫面一出來就知道要點恐龍說晚安，點了馬上有反應（T-141）', async ({ page }, info) => {
    // 盲測 c9bb003 英文 1、2：下課畫面出來後「好久喔、不知道要做什麼」，先按了返回，回來才點晚安。
    // 那時下課畫面沒有聲音（最後聽到的是 See you tomorrow!）、手 3 秒後才來指恐龍、
    // 左下角還留著一隻淡淡的豆豆（孩子點它，是空白處，沒有反應）、站著的恐龍會閉眼（看起來已經睡著，孩子就去點房子）。
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '下課馬上知道')
    try {
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // 上完了的樣子（同 T-122）：進課直接回到晚安道別，跟上完一堂出來的是同一個下課畫面
      await page.evaluate(
        (p) =>
          new Promise<void>((res) => {
            const rq = indexedDB.open('dodo-adventure')
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              tx.objectStore('kv').put({ key: 'lesson.english', value: p })
              tx.oncomplete = () => (rq.result.close(), res())
            }
          }),
        { idx: 0, date: today, done: true, good: true, stage: 'end' },
      )
      k.behavior = '下課畫面發呆'
      if (!(await enter(k, c))) return
      const bye = await page.waitForSelector('.cheer-scrim .lesson-bye', { timeout: 6000 }).catch(() => null)
      c.outcome('回到晚安道別', !!bye, bye ? '' : `停在 ${await stageOf(page)}`)
      if (!bye) return void (await c.once('t141-bye', '卡死', '上完了回來沒有回到晚安道別', `停在 ${await stageOf(page)}`))
      // 下課畫面出來的前 5 秒（孩子不碰）：聲音、手、恐龍的眼睛、左下角的豆豆
      const s = await page.evaluate(async () => {
        const t0 = performance.now()
        let hand: number | null = null
        const eyes = new Set<number>()
        let corner = 0
        while (performance.now() - t0 < 5000) {
          const t = performance.now() - t0
          if (hand == null && document.querySelector('.lb-hand-dino')) hand = Math.round(t)
          // 只數恐龍本身（.lb-host 的第一層）：示範的手也在 .lb-host 裡，不算。閉眼時眼睛的橢圓會不見
          eyes.add(document.querySelectorAll('.lb-host > :first-child ellipse').length)
          const h = document.querySelector('.en-host')
          if (t > 1500 && h) corner = Math.max(corner, Number(getComputedStyle(h).opacity))
          await new Promise((r) => setTimeout(r, 80))
        }
        const voice = window.__toddler.voices.filter((v) => v.t >= t0 - 300 && v.t <= t0 + 2500).map((v) => Math.round(v.t - t0))
        return { hand, eyes: [...eyes], corner, voice, still: document.querySelector('.lesson-bye')?.getAttribute('data-bye') ?? null }
      })
      await shot(page, '9-下課等點恐龍', info)
      c.outcome('下課畫面一出來就說要點恐龍', s.voice.length > 0, `語音 ${s.voice.join('、') || '沒有'} ms`)
      if (!s.voice.length) await c.once('t141-voice', '困惑', '下課畫面出來 2.5 秒內沒有聲音告訴他要點恐龍', '只看得到恐龍，不知道下一步')
      c.outcome('手 1.5 秒內指著恐龍', s.hand != null && s.hand <= 1500, `${s.hand ?? '沒有'} ms`)
      if (s.hand == null || s.hand > 1500) await c.once('t141-hand', '困惑', '下課畫面的手太晚才指恐龍', `${s.hand ?? '5 秒內沒有'} ms`)
      c.outcome('還沒道別的恐龍不閉眼（不像已經睡著）', s.eyes.length === 1, `眼睛的橢圓數 ${s.eyes.join('、')}`)
      if (s.eyes.length !== 1) await c.once('t141-eyes', '困惑', '還沒道別的恐龍會閉眼，看起來已經睡著了', `眼睛的橢圓數 ${s.eyes.join('、')}`)
      c.outcome('左下角的豆豆收起來，只有一隻恐龍', s.corner < 0.05, `左下角豆豆的透明度 ${s.corner}`)
      if (s.corner >= 0.05) await c.once('t141-corner', '困惑', '下課畫面左下角還有一隻豆豆，點它沒有反應', `透明度 ${s.corner}`)
      c.outcome('5 秒不碰：還停在晚安道別', s.still === 'awake', `${s.still}`)
      if (s.still !== 'awake') await c.once('t141-still', '卡死', '下課畫面不碰卻自己往下走或離開了', `${s.still}`)
      // 點恐龍：馬上揮手（一按就有反應）
      k.behavior = '點恐龍說晚安'
      const dino = await page.evaluate(() => {
        const r = document.querySelector('.lb-host')?.getBoundingClientRect()
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
      })
      if (dino) {
        const t1 = await page.evaluate(() => performance.now())
        await k.tap(dino, '恐龍')
        const wave = await page.waitForSelector('.lesson-bye[data-bye="wave"]', { timeout: 1500 }).catch(() => null)
        const dt = Math.round((await page.evaluate(() => performance.now())) - t1)
        c.outcome('點恐龍馬上揮手', !!wave, `${dt} ms`)
        if (!wave) await c.once('t141-wave', '卡死', '下課畫面點恐龍沒有馬上反應', `${dt} ms`)
      }
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '下課馬上知道')
    }
  })

  /** 英文進度直接放到今天的某一段（同一天中途離開又回來的樣子） */
  const putProgress = (page: Page, p: Record<string, unknown>) =>
    page.evaluate(
      (p) =>
        new Promise<void>((res) => {
          const d = new Date()
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const rq = indexedDB.open('dodo-adventure')
          rq.onsuccess = () => {
            const tx = rq.result.transaction('kv', 'readwrite')
            tx.objectStore('kv').put({ key: 'lesson.english', value: { ...p, date: today } })
            tx.oncomplete = () => (rq.result.close(), res())
          }
        }),
      p,
    )

  test('最後一題答對：馬上是泡泡派對，派對完 1.1 秒內就是下課畫面、手已經指著恐龍，You did it! 不被切掉（T-143、T-147）', async ({ page }, info) => {
    // 盲測 9231aa6 英文 2、貼紙本 2 的英文：最後一題答對後看到「恐龍笑笑、You did it」就按返回（5 次裡 2 次）。
    // 那時答對 → Yes!（0.6 秒）→ 慶祝畫面（1.1 秒，沒有下一步的提示）→ 下課畫面淡入 → 再 0.6 秒手才指恐龍：約 2.6 秒都看不出要點恐龍。
    // AI 小男生點完 1.1 秒截圖，看到的就是「做完了」的慶祝畫面。
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '下課一眼就知道')
    try {
      // 同一天回來，從最後一題接著問（round 超過題數＝最後一題）
      await putProgress(page, { idx: 0, done: false, good: false, stage: 'quiz', round: 9 })
      k.behavior = '最後一題答對'
      if (!(await enter(k, c))) return
      const q = await untilTurn(page, 30_000, true)
      const right = q && pickOf(q).right
      c.outcome('到最後一題', !!right, q ? `要找 ${q.want}` : `停在 ${await stageOf(page)}`)
      if (!right) return void (await c.once('t143-quiz', '卡死', '回到選擇題沒有出現可以點的題目', `停在 ${await stageOf(page)}`))
      const t0 = await page.evaluate(() => performance.now())
      await k.tap(right, `答案 ${right.label}`)
      // 點下去以後：泡泡派對什麼時候出來、派對什麼時候結束、下課畫面什麼時候出來、手什麼時候指著恐龍（T-147：派對約 10 秒，中間不點）
      const s = await page.evaluate(async (t0) => {
        let party: number | null = null
        let over: number | null = null
        let bye: number | null = null
        let hand: number | null = null
        while (performance.now() - t0 < 20_000 && hand == null) {
          const t = Math.round(performance.now() - t0)
          const ph = document.querySelector('.en-lesson')?.getAttribute('data-phase')
          if (party == null && ph === 'party') party = t
          if (party != null && over == null && ph !== 'party') over = t
          if (bye == null && document.querySelector('.cheer-scrim .lesson-bye')) bye = t
          if (hand == null && document.querySelector('.cheer-scrim .lesson-bye .lb-hand-dino')) hand = t
          await new Promise((r) => setTimeout(r, 40))
        }
        return { party, over, bye, hand }
      }, t0)
      await page.waitForTimeout(800)
      await shot(page, '10-派對完1秒半', info)
      c.outcome('答對 1.5 秒內：泡泡派對', s.party != null && s.party <= 1500, `派對 ${s.party ?? '沒有'} ms`)
      if (s.party == null || s.party > 1500) await c.once('t147-party', '困惑', '最後一題答對後，太久才出現泡泡派對', `派對 ${s.party ?? '沒有'} ms`)
      const after = s.hand != null && s.over != null ? s.hand - s.over : null
      c.outcome('派對完 1.1 秒內：下課畫面、手指著恐龍', after != null && after <= 1100, `派對 ${s.party}～${s.over} ms、下課畫面 ${s.bye ?? '沒有'} ms、手 ${s.hand ?? '沒有'} ms`)
      if (after == null || after > 1100) await c.once('t143-fast', '困惑', '泡泡派對完，太久才看得出要點恐龍說晚安', `派對 ${s.party}～${s.over} ms、下課畫面 ${s.bye ?? '沒有'} ms、手 ${s.hand ?? '20 秒內沒有'} ms`)
      // You did it! 要說完，Tap me! 接在後面（不把它切掉）
      await page.waitForTimeout(3500)
      const vs = await page.evaluate(
        (t0) => window.__toddler.voices.filter((v) => v.t >= t0).map((v) => ({ text: v.text ?? '', cut: v.stopped != null && v.stopped < v.end - 120 })),
        t0,
      )
      const did = vs.find((v) => /You did it/i.test(v.text))
      const ask = vs.findIndex((v) => /Tap me/i.test(v.text))
      c.outcome('You did it! 說完、Tap me! 接在後面', !!did && !did.cut && ask > vs.indexOf(did), vs.map((v) => `${v.text}${v.cut ? '（被切）' : ''}`).join('／'))
      if (!did || did.cut || ask < vs.indexOf(did)) await c.once('t143-voice', '小問題', '上完的 You did it! 被切掉或晚安提示沒有接在後面', vs.map((v) => `${v.text}${v.cut ? '（被切）' : ''}`).join('／'))
      c.outcome('不碰：還停在晚安道別', (await page.evaluate(() => document.querySelector('.lesson-bye')?.getAttribute('data-bye'))) === 'awake')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '下課一眼就知道')
    }
  })

  test('下課畫面還沒說晚安就按返回：回到首頁，豆豆溫和地說再見（T-143）', async ({ page }, info) => {
    // 盲測 9231aa6：2 次在下課畫面按返回，回到首頁什麼都沒有（像被丟回首頁）
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '下課按返回')
    try {
      await putProgress(page, { idx: 0, done: true, good: true, stage: 'end' })
      k.behavior = '下課畫面按返回'
      if (!(await enter(k, c))) return
      const bye = await page.waitForSelector('.cheer-scrim .lesson-bye', { timeout: 6000 }).catch(() => null)
      if (!bye) return void (await c.once('t143-bye', '卡死', '上完了回來沒有回到晚安道別', `停在 ${await stageOf(page)}`))
      // 等請他點恐龍的那一句說完，再按返回
      await page.waitForTimeout(4500)
      const h = await homeButton(page)
      const t0 = await page.evaluate(() => performance.now())
      if (h) await pressBack(k, h, '下課畫面按返回')
      const back = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('下課畫面按返回 → 首頁（一步）', back === 'home', `到 ${back}`)
      if (back !== 'home') return void (await c.once('t143-back', '無法返回', '下課畫面按返回沒有回首頁', `停在 ${back}`))
      await page.waitForTimeout(3500)
      await shot(page, '11-下課按返回後的首頁', info)
      const vs = await page.evaluate((t0) => window.__toddler.voices.filter((v) => v.t >= t0).map((v) => v.text ?? ''), t0)
      const bye2 = vs.filter((v) => !/Tap me/i.test(v))
      c.outcome('回到首頁有一句再見', bye2.length > 0, vs.join('／') || '沒有聲音')
      if (!bye2.length) await c.once('t143-farewell', '困惑', '下課畫面按返回，回到首頁什麼都沒有（像被丟回首頁）', vs.join('／') || '沒有聲音')
      const ask = vs.some((v) => /Tap me/i.test(v))
      c.outcome('首頁不會聽到 Tap me!（那裡沒有恐龍可以點）', !ask, vs.join('／'))
      if (ask) await c.once('t143-ask-home', '困惑', '回到首頁還聽到 Tap me! Let\'s say good night!', vs.join('／'))
      // 首頁不是上課：再見的字幕說完就收，不一直掛在首頁（T-140⑤ 首頁介紹同一條）
      await page.waitForTimeout(3500)
      const sub = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.sub-pill')].some((e) => e.getBoundingClientRect().width > 2 && getComputedStyle(e).opacity !== '0'))
      c.outcome('再見的字幕說完就收', !sub, sub ? '還掛在首頁' : '')
      if (sub) await c.once('t143-caption', '小問題', '回到首頁的再見字幕說完還一直掛著', '')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '下課按返回')
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
      if (st !== 'quiz') return result(st === 'end' || st === 'party' || st === null ? Math.round((Date.now() - t0) / 1000) : null)
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

// ── T-147 英文門案 A：今天上完再進英文門 → 字母遊戲時間（字母牆＋放進籃子或翻翻卡） ──────────────

type Raw = { ts: number; game: string; skill: string; itemId: string; phase: string; ok: boolean }
/** 作答紀錄（要 skill，lib/app 的 attempts 沒有） */
const rawAttempts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Raw[]>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('attempts').objectStore('attempts').getAll()
          g.onsuccess = () => {
            rq.result.close()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res((g.result as any[]).map((a) => ({ ts: a.ts, game: a.game, skill: a.skill, itemId: a.itemId, phase: a.phase ?? 'quiz', ok: a.firstTryCorrect })))
          }
          g.onerror = () => res([])
        }
        rq.onerror = () => res([])
      }),
  )
const kvOf = (page: Page, key: string) =>
  page.evaluate(
    (key) =>
      new Promise<unknown>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('kv').objectStore('kv').get(key)
          g.onsuccess = () => {
            rq.result.close()
            res(g.result?.value ?? null)
          }
        }
      }),
    key,
  )

/** 今天的課上完了：學過 seq 的前 idx+1 個字母；game 固定今天的配對遊戲（lib/variety 的 dodo:variety:english.abc） */
async function seedPlay(page: Page, idx: number, game: 'pair' | 'flip' | null) {
  await page.evaluate(
    ({ idx, game }) =>
      new Promise<void>((res) => {
        if (game) localStorage.setItem('dodo:variety:english.abc', game)
        const d = new Date()
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const tx = rq.result.transaction('kv', 'readwrite')
          const st = tx.objectStore('kv')
          st.put({ key: 'lesson.english', value: { idx, seq: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', date: today, done: true, good: true } })
          st.delete('lesson.english.play')
          tx.oncomplete = () => {
            rq.result.close()
            res()
          }
        }
      }),
    { idx, game },
  )
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const wallNow = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.en-wall .en-block')].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, L: e.getAttribute('aria-label') ?? '' }
    }),
  )
const pairNow = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('.en-pair')
    if (!root) return null
    const b = root.querySelector('.en-basket')!.getBoundingClientRect()
    const L = root.querySelector('.en-basket-letter')?.getAttribute('aria-label') ?? ''
    const opts = [...root.querySelectorAll<HTMLElement>('.en-findpic')].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, key: e.dataset.id ?? '', w: e.getAttribute('aria-label') ?? '', no: e.classList.contains('is-no'), yes: e.classList.contains('is-yes') }
    })
    return { L, answer: root.getAttribute('data-answer') ?? '', round: Number(root.getAttribute('data-round')), accepting: root.getAttribute('data-accepting') !== 'false', demo: !!root.querySelector('.demo-hand'), basket: { x: b.left + b.width / 2, y: b.top + b.height / 2 }, opts }
  })
/** 放進籃子（聽字找圖，T-147）：要找的字在 .en-pair 的 data-answer */
const rightOf = (p: NonNullable<Awaited<ReturnType<typeof pairNow>>>) => p.opts.find((o) => o.key === p.answer) ?? null
const wrongOf = (p: NonNullable<Awaited<ReturnType<typeof pairNow>>>) => p.opts.find((o) => o.key !== p.answer && !o.no) ?? null
/** 等放進籃子第 r 回合可以玩（收作答、圖停好） */
async function untilPair(page: Page, r: number, ms = 25_000) {
  const end = Date.now() + ms
  let last = ''
  while (Date.now() < end) {
    const p = await pairNow(page)
    if (p && p.round === r && p.accepting && !p.demo && !p.opts.some((o) => o.yes)) {
      const sig = p.opts.map((o) => `${Math.round(o.x)},${Math.round(o.y)}`).join('|')
      if (sig === last) return p
      last = sig
    }
    await page.waitForTimeout(200)
  }
  return null
}
const flipNow = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('.en-flip')
    if (!root) return null
    const cards = [...root.querySelectorAll<HTMLElement>('.en-flipcard')].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, key: e.dataset.id ?? '', pair: e.dataset.pair ?? '', up: e.classList.contains('is-up'), matched: e.classList.contains('is-matched') }
    })
    return { board: Number(root.getAttribute('data-board')), accepting: root.getAttribute('data-accepting') !== 'false', demo: !!root.querySelector('.demo-hand'), cards }
  })

test.describe('英文課：字母遊戲時間（T-147）', () => {
  test('字母牆亂點連點、放進籃子示範時搶著拖、拖到一半放手、放錯、連點、多指：玩得完、只出學過的、記 enword', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '字母遊戲-放進籃子')
    try {
      await seedPlay(page, 4, 'pair')
      const t0 = await page.evaluate(() => Date.now())
      k.behavior = '今天上完再進英文門'
      if (!(await enter(k, c))) return
      const wall = await page.waitForSelector('.en-wall .en-block', { timeout: 10_000 }).catch(() => null)
      c.outcome('今天上完再進來：字母遊戲時間（字母牆）', !!wall, wall ? '' : `停在 ${await stageOf(page)}`)
      if (!wall) return void (await c.once('abc-wall', '卡死', '今天上完再進英文門，沒有出現字母牆', `停在 ${await stageOf(page)}`))
      await page.waitForTimeout(900)
      await shot(page, 'abc-1-字母牆', info)
      const blocks = await wallNow(page)
      const labels = blocks.map((b) => b.L)
      // T-149 E5：今天新學的 E 第一次放上牆，只有它有放上去的動畫
      const fresh = await page.evaluate(() => [...document.querySelectorAll('.en-wall .en-block[data-new]')].map((e) => e.getAttribute('aria-label')))
      c.outcome('今天新學的那一塊有放上牆的動畫，只有它（E5）', fresh.join('') === 'E', fresh.join('') || '沒有')
      if (fresh.join('') !== 'E') await c.once('abc-fresh', '小問題', '字母牆今天新學的那一塊沒有放上去的動畫（或不只一塊在動）', fresh.join(''))
      const onlyLearned = labels.every((L) => 'ABCDE'.includes(L)) && labels[0] === 'E' && labels.length === 5
      c.outcome('牆上只有學過的字母（A～E），今天的 E 在第一塊', onlyLearned, labels.join(''))
      if (!onlyLearned) await c.once('abc-wall-letters', '誤記作答', '字母牆出現沒學過的字母，或今天的字母不在第一塊', labels.join(''))

      // 字母牆：連點同一塊、很快點不同塊（搶掉上一塊）、兩根手指
      k.behavior = '字母牆亂點連點'
      await k.spam(blocks[0], 4, `連點 ${blocks[0].L}`)
      await page.waitForTimeout(500)
      const peek = await page.evaluate(() => !!document.querySelector('.en-wall .en-block-peek'))
      c.outcome('點積木：代表字的圖探出來', peek)
      if (!peek) await c.once('abc-peek', '困惑', '點字母牆的積木，沒有看到代表字的圖', '')
      for (const b of blocks.slice(1, 4)) {
        await k.tap(b, `點 ${b.L}`)
        await k.wait(200)
      }
      if (blocks[4]) await k.twoFinger([blocks[4]], blocks[0], 150)
      await k.tap(blocks[1], `點 ${blocks[1].L}`)
      await shot(page, 'abc-2-字母牆點了', info)

      // 放進籃子第一回合：示範的手在動的時候搶著拖，拖到一半在別的地方放手
      const shown = await page.waitForSelector('.en-pair .demo-hand', { timeout: 30_000 }).catch(() => null)
      c.outcome('字母牆點夠了 → 大箭頭 → 放進籃子（第一次有手示範）', !!shown, shown ? '' : `停在 ${await page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-abc'))}`)
      if (!shown) return void (await c.once('abc-pair-demo', '卡死', '字母牆之後沒有出現放進籃子的示範', ''))
      await shot(page, 'abc-3-放進籃子示範', info)
      await page.waitForTimeout(1200)
      const p0 = await pairNow(page)
      const r0 = p0 && rightOf(p0)
      if (p0 && r0) {
        k.behavior = '示範時搶著拖、拖到一半放手'
        await k.drag([r0, { x: r0.x + 60, y: r0.y - 40 }, { x: r0.x + 140, y: r0.y - 60 }], { label: `拖 ${r0.w} 到一半放手` })
        await page.waitForTimeout(700)
        const after = await pairNow(page)
        const still = !!after && after.round === 0 && !after.opts.some((o) => o.yes)
        const recs = (await rawAttempts(page)).filter((a) => a.game === 'abc-find')
        c.outcome('拖到一半放手：回原位、不算答', still && recs.length === 0, `${recs.length} 筆`)
        if (!still || recs.length) await c.once('abc-half', '誤記作答', '放進籃子拖到一半放手，被當成放進籃子', `${recs.length} 筆`)
        // 放錯一次，再把對的拖進籃子
        const now = await untilPair(page, 0, 10_000)
        const w = now && wrongOf(now)
        if (w) {
          k.behavior = '放錯'
          await k.tap(w, `錯的 ${w.w}`)
          await page.waitForTimeout(600)
          const dim = (await pairNow(page))?.opts.find((o) => o.key === w.key)?.no
          c.outcome('放錯：那張淡掉、不打叉', !!dim)
          await page.waitForTimeout(1800)
        }
        const p1 = await pairNow(page)
        const r1 = p1 && rightOf(p1)
        if (p1 && r1) {
          k.behavior = '拖進籃子'
          await k.drag([r1, { x: (r1.x + p1.basket.x) / 2, y: (r1.y + p1.basket.y) / 2 }, p1.basket], { label: `把 ${r1.w} 拖進籃子` })
          await page.waitForTimeout(800)
          const yes = (await pairNow(page))?.opts.some((o) => o.yes)
          c.outcome('拖進籃子：放對了', !!yes)
          if (!yes) await c.once('abc-drag', '卡死', '放進籃子把對的圖拖進籃子，沒有算放對', '')
          await shot(page, 'abc-4-放進籃子放對', info)
        }
      } else await c.once('abc-pair0', '卡死', '放進籃子第一回合讀不到題目', '')

      // 第 2～4 回合：連點對的、兩根手指一起點
      for (let r = 1; r < 4; r++) {
        const p = await untilPair(page, r, 30_000)
        if (!p) {
          await c.once(`abc-pair-${r}`, '卡死', `放進籃子第 ${r + 1} 回合沒有出來`, `停在 ${await page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-abc'))}`)
          break
        }
        const right = rightOf(p)
        const wrong = wrongOf(p)
        if (!right) break
        k.behavior = r === 2 && wrong ? '兩根手指一起點' : '連點對的'
        if (r === 2 && wrong) await k.twoFinger([right], wrong, 150)
        else await k.spam(right, 3, `連點 ${right.w}`)
        await page.waitForTimeout(400)
      }
      const ended = await page.waitForSelector('.cheer-scrim', { timeout: 40_000 }).catch(() => null)
      const secs = Math.round(((await page.evaluate(() => Date.now())) - t0) / 1000)
      c.outcome('字母遊戲時間玩得完（到下課）', !!ended, `${secs} 秒`)
      if (!ended) await c.once('abc-end', '卡死', '字母遊戲時間玩不完、到不了下課', '')
      const rs = (await rawAttempts(page)).filter((a) => a.ts >= t0 && a.phase !== 'teach')
      // 學過 A～E 教過的字（每個字母 2 個）
      const taught = /^enword:(apple|ant|bus|ball|car|cat|dinosaur|dog|egg|elephant)$/
      const pair = rs.filter((a) => a.game === 'abc-find')
      const skills = pair.every((a) => taught.test(a.skill))
      c.outcome('作答紀錄：4 回合各一筆、都記 enword:（只有教過的字）', pair.length === 4 && skills, pair.map((a) => `${a.skill}${a.ok ? '' : '✗'}`).join('、'))
      if (pair.length !== 4 || !skills) await c.once('abc-rec', '誤記作答', '放進籃子的作答紀錄不對（要 4 筆、skill 是 enword:教過的字）', pair.map((a) => a.skill).join('、'))
      const other = rs.filter((a) => a.game !== 'abc-find')
      c.outcome('沒有記到 letter:／phonics:（不改家長區準備度）', !other.length, other.map((a) => `${a.game}/${a.skill}`).join('、'))
      if (other.length) await c.once('abc-rec-other', '誤記作答', '字母遊戲時間記了別的作答', other.map((a) => `${a.game}/${a.skill}`).join('、'))
      const en = (await kvOf(page, 'lesson.english')) as { idx: number; done: boolean; stage?: string } | null
      c.outcome('英文課的進度沒動（今天上完了、不寫 stage）', !!en && en.idx === 4 && en.done && !en.stage, JSON.stringify(en))
      if (!en || en.idx !== 4 || !en.done || en.stage) await c.once('abc-kv', '誤記作答', '字母遊戲時間改到英文課的進度', JSON.stringify(en))
      const pl = (await kvOf(page, 'lesson.english.play')) as { sessions?: number; cur?: unknown } | null
      c.outcome('玩完：記一次（sessions 1、cur 清掉）', pl?.sessions === 1 && !pl?.cur, JSON.stringify(pl))
      await page.waitForTimeout(1200)
      await shot(page, 'abc-5-下課', info)
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '字母遊戲-放進籃子')
    }
  })

  test('字母牆發呆有手、翻翻卡示範時搶點、翻錯、翻錯時又點、連點翻開的：配得完、記 enword', async ({ page }, info) => {
    test.skip(!want('lesson-english'))
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '字母遊戲-翻翻卡')
    try {
      await seedPlay(page, 4, 'flip')
      const t0 = await page.evaluate(() => Date.now())
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-wall .en-block', { timeout: 10_000 }).catch(() => null)
      k.behavior = '字母牆發呆'
      const hand = await page.waitForSelector('.en-wall .demo-hand', { timeout: 8000 }).catch(() => null)
      c.outcome('字母牆發呆 4 秒：手出來點今天的字母', !!hand)
      if (!hand) await c.once('abc-wall-idle', '困惑', '字母牆發呆，沒有手提示要點積木', '')
      // 一直不點：20 秒後大箭頭（autoNext 會點）→ 翻翻卡
      const demo = await page.waitForSelector('.en-flip .demo-hand', { timeout: 40_000 }).catch(() => null)
      c.outcome('字母牆 20 秒 → 翻翻卡（第一次有手示範）', !!demo)
      if (!demo) return void (await c.once('abc-flip-demo', '卡死', '字母牆之後沒有出現翻翻卡的示範', ''))
      await shot(page, 'abc-6-翻翻卡示範', info)
      await page.waitForTimeout(700)
      // 示範時搶點一張：示範停下、蓋回去，直接輪到他
      k.behavior = '示範時搶點'
      const f0 = await flipNow(page)
      const any = f0?.cards.find((x) => !x.up)
      if (any) await k.tap(any, '示範時點一張卡')
      await page.waitForTimeout(800)
      const f1 = await flipNow(page)
      c.outcome('示範時搶點：手收起來、輪到他', !!f1 && !f1.demo)
      for (let board = 0; board < 2; board++) {
        // 等這一盤可以翻（沒有翻開的、還沒配的）
        const end = Date.now() + 30_000
        let f = await flipNow(page)
        while (Date.now() < end && !(f && f.board === board && f.accepting && !f.demo && f.cards.some((x) => !x.matched))) {
          await page.waitForTimeout(250)
          f = await flipNow(page)
        }
        if (!f || f.board !== board) {
          await c.once(`abc-board-${board}`, '卡死', `翻翻卡第 ${board + 1} 盤沒有出來`, '')
          break
        }
        // 先蓋回去還開著的那一張（搶點時翻開的）
        await page.waitForTimeout(400)
        f = (await flipNow(page))!
        const open = f.cards.filter((x) => x.up && !x.matched)
        if (open.length === 1) {
          const mate = f.cards.find((x) => x.pair === open[0].pair && x.key !== open[0].key)!
          await k.tap(mate, `翻 ${mate.key}`)
          await k.wait(2600)
        }
        if (board === 0) {
          // 翻錯：兩張不同對；蓋回去之前又點第三張（不能翻開）
          k.behavior = '翻錯、翻錯時又點'
          f = (await flipNow(page))!
          const rest = f.cards.filter((x) => !x.matched)
          const a = rest[0]
          const b = rest.find((x) => x.pair !== a.pair)
          if (b) {
            await k.tap(a, `翻 ${a.key}`)
            await k.wait(500)
            await k.tap(b, `翻 ${b.key}`)
            await k.wait(250)
            const third = rest.find((x) => x.key !== a.key && x.key !== b.key)
            if (third) await k.tap(third, `翻錯時又點 ${third.key}`)
            await page.waitForTimeout(300)
            const ups = (await flipNow(page))!.cards.filter((x) => x.up && !x.matched).length
            c.outcome('翻錯時又點：第三張不會翻開', ups <= 2, `開著 ${ups} 張`)
            await shot(page, 'abc-7-翻翻卡翻錯', info)
            await page.waitForTimeout(1600)
            const back = (await flipNow(page))!.cards.filter((x) => x.up && !x.matched).length
            c.outcome('翻錯：停一下就蓋回去', back === 0, `開著 ${back} 張`)
            if (back) await c.once('abc-miss', '卡死', '翻翻卡翻錯以後沒有蓋回去', `開著 ${back} 張`)
          }
        }
        // 一對一對翻；配好的再連點一下（不能壞）
        k.behavior = '配對'
        for (let n = 0; n < 4; n++) {
          f = (await flipNow(page))!
          if (!f || f.board !== board) break
          const left = f.cards.filter((x) => !x.matched)
          if (!left.length) break
          const a = left[0]
          const b = left.find((x) => x.pair === a.pair && x.key !== a.key)!
          await k.tap(a, `翻 ${a.key}`)
          await k.wait(600)
          await k.tap(b, `翻 ${b.key}`)
          await k.wait(400)
          await k.spam(b, 2, '連點配好的')
          await k.wait(2600)
        }
        if (board === 0) await shot(page, 'abc-8-翻翻卡配完一盤', info)
      }
      const ended = await page.waitForSelector('.cheer-scrim', { timeout: 40_000 }).catch(() => null)
      c.outcome('翻翻卡配得完（到下課）', !!ended, ended ? `${Math.round(((await page.evaluate(() => Date.now())) - t0) / 1000)} 秒` : '')
      if (!ended) await c.once('abc-flip-end', '卡死', '翻翻卡配不完、到不了下課', '')
      const rs = (await rawAttempts(page)).filter((a) => a.ts >= t0 && a.game === 'abc-flip' && a.phase !== 'teach')
      const ok = rs.length >= 4 && rs.length <= 5 && rs.every((a) => /^enword:(apple|ant|bus|ball|car|cat|dinosaur|dog|egg|elephant)$/.test(a.skill))
      c.outcome('作答紀錄：配好一對一筆、記 enword:（4～5 對）', ok, rs.map((a) => `${a.skill}${a.ok ? '' : '✗'}`).join('、'))
      if (!ok) await c.once('abc-flip-rec', '誤記作答', '翻翻卡的作答紀錄不對', rs.map((a) => a.skill).join('、'))
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '字母遊戲-翻翻卡')
    }
  })

  test('中途離開接著玩、每一段 1 步回首頁、玩完再進來換另一種配對遊戲', async ({ page }, info) => {
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '字母遊戲-接著玩')
    try {
      await seedPlay(page, 2, 'pair')
      const back = async (where: string) => {
        const h = await homeButton(page)
        if (h) await pressBack(k, h, `${where}按返回`)
        const to = await waitLive(page, (l) => l === 'home', 4000)
        c.outcome(`${where}按返回 → 首頁（1 步）`, to === 'home', `到 ${to}`)
        if (to !== 'home') await c.once(`back-${where}`, '無法返回', `字母遊戲時間：${where}按返回沒有回首頁`, `停在 ${to}`)
      }
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-wall .en-block', { timeout: 10_000 })
      await back('字母牆')
      // 再進來：還是字母牆（還沒看完）；點 6 下到放進籃子
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-wall .en-block', { timeout: 10_000 })
      const again = await page.evaluate(() => document.querySelectorAll('.en-wall .en-block[data-new]').length)
      c.outcome('同一個字母第二次看到牆：不再播放上去的動畫（E5）', again === 0, `${again} 塊`)
      await page.waitForTimeout(700)
      for (let i = 0; i < 7; i++) {
        const bs = await wallNow(page)
        if (!bs.length) break
        await k.tap(bs[i % bs.length], '點積木')
        await k.wait(300)
      }
      // 第一回合（示範完）照常放對
      let p = await untilPair(page, 0, 40_000)
      if (p && rightOf(p)) await k.tap(rightOf(p)!, '放對')
      p = await untilPair(page, 1, 30_000)
      c.outcome('到放進籃子第 2 回合', !!p)
      if (!p) return void (await c.once('abc-r2', '卡死', '放進籃子第 2 回合沒有出來', ''))
      await back('放進籃子')
      if (!(await enter(k, c))) return
      const resumed = await untilPair(page, 1, 20_000)
      const wall = await page.evaluate(() => !!document.querySelector('.en-wall'))
      c.outcome('同一天回來：從放進籃子第 2 回合接著玩（不再看字母牆）', !!resumed && !wall, resumed ? '' : `停在 ${await page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-abc'))}`)
      if (!resumed) await c.once('abc-resume', '誤記作答', '放進籃子玩到一半離開，同一天回來沒有接著玩', '')
      for (let r = 1; r < 4; r++) {
        const q = await untilPair(page, r, 30_000)
        if (!q || !rightOf(q)) break
        await k.tap(rightOf(q)!, '放對')
      }
      const ended = await page.waitForSelector('.cheer-scrim', { timeout: 40_000 }).catch(() => null)
      c.outcome('玩完到下課', !!ended)
      // 第二次進來：字母牆 → 換成翻翻卡
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-wall .en-block', { timeout: 10_000 }).catch(() => null)
      await page.waitForTimeout(700)
      for (let i = 0; i < 7; i++) {
        const bs = await wallNow(page)
        if (!bs.length) break
        await k.tap(bs[i % bs.length], '點積木')
        await k.wait(300)
      }
      const flip = await page.waitForSelector('.en-flip', { timeout: 30_000 }).catch(() => null)
      c.outcome('今天第二次玩：換成翻翻卡', !!flip)
      if (!flip) await c.once('abc-swap', '困惑', '同一天第二次進來，配對遊戲沒有換', `停在 ${await page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-abc'))}`)
      await page.waitForTimeout(1500)
      await back('翻翻卡')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '字母遊戲-接著玩')
    }
  })

  test('新帳號第一天上完再進來：只有字母牆（只學過 1 個字母），點夠了就下課', async ({ page }, info) => {
    test.skip(!want('lesson-english') || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '字母遊戲-第一天')
    try {
      await seedPlay(page, 0, null)
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-wall .en-block', { timeout: 10_000 }).catch(() => null)
      const labels = (await wallNow(page)).map((b) => b.L)
      c.outcome('牆上只有 A', labels.join('') === 'A', labels.join(''))
      if (labels.join('') !== 'A') await c.once('abc-day1', '誤記作答', '第一天的字母牆出現沒學過的字母', labels.join(''))
      await page.waitForTimeout(700)
      for (let i = 0; i < 6; i++) {
        const bs = await wallNow(page)
        if (!bs.length) break
        await k.tap(bs[0], '點 A')
        await k.wait(1800)
      }
      const ended = await page.waitForSelector('.cheer-scrim', { timeout: 30_000 }).catch(() => null)
      const game = await page.evaluate(() => !!document.querySelector('.en-pair, .en-flip'))
      c.outcome('只有字母牆就下課（沒有配對遊戲）', !!ended && !game)
      if (!ended || game) await c.once('abc-day1-end', '卡死', '第一天的字母遊戲時間沒有在字母牆之後下課', '')
    } finally {
      await c.flush().catch(() => {})
      finish(k, c, '字母遊戲-第一天')
    }
  })
})
