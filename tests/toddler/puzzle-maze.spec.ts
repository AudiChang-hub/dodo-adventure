import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { boot, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, centerOf, holdHome, waitLive } from './lib/flows'

/**
 * 遊戲角的拼圖、迷宮（T-156，src/games/puzzle、src/games/maze）：從邏輯遊戲的「選玩法」進去。
 * 三歲孩子會做的事：示範時搶著點、連點、兩根手指、拖到一半放手、一直放錯、撞牆、發呆、亂點、隨時返回（1 步回選玩法）。
 * 名稱（TODDLER_GAMES）：puzzle、maze。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261116)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (g: 'puzzle' | 'maze') => !only.length || only.includes(g)
/** 截圖（給家長、PM 看版面）：test-results/t156 */
const SHOTS = path.resolve('test-results', 't156')

type Info = Parameters<Parameters<typeof test>[2]>[1]

const kvSet = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ({ key, value }) =>
      new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
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

/** 這個遊戲的作答紀錄（示範的 teach 那一筆不算，logTeach 記的） */
const rowsOf = (page: Page, game: string) =>
  page.evaluate(
    (game) =>
      new Promise<{ ts: number; skill: string; phase: string; ok: boolean; tries: number; shown: boolean; led: boolean; itemId: string }[]>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const g = db.transaction('attempts').objectStore('attempts').getAll()
          g.onsuccess = () => {
            db.close()
            res(
              (g.result as any[])
                .filter((a) => a.game === game && (a.phase ?? 'quiz') !== 'teach')
                .map((a) => ({ ts: a.ts, skill: a.skill, phase: a.phase ?? 'quiz', ok: a.firstTryCorrect, tries: a.attempts, shown: !!a.metrics?.shown, led: !!a.metrics?.led, itemId: a.itemId }))
                .sort((a, b) => a.ts - b.ts),
            )
          }
          g.onerror = () => res([])
        }
        rq.onerror = () => res([])
      }),
    game,
  )

async function setup(page: Page, info: Info, name: string, opts: { taught?: boolean } = {}) {
  const seed = hashSeed(BASE_SEED, 'puzzle-maze', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `遊戲角／${name}`
  await boot(page, seed, { to: 'home' })
  if (opts.taught) {
    await kvSet(page, 'puzzle.progress', { level: 1, recent: [], taught: [1], pics: [] })
    await kvSet(page, 'maze.progress', { level: 1, recent: [], taught: [1], sigs: [] })
  }
  await page.evaluate(() => sessionStorage.setItem('dodo.resume', 'logic'))
  await page.reload()
  await page.waitForSelector('[data-logic-pick]', { timeout: 20_000 })
  await settle(page)
  await k.init()
  return { k, c }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`puzzle-maze-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

const shot = async (page: Page, info: Info, name: string) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`) })
}

/** 最上層畫面裡遊戲的某個屬性 */
const attr = (page: Page, name: string) =>
  page.evaluate((name) => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    return root.querySelector('[data-logic-game]')?.getAttribute(name) ?? null
  }, name)
const inDemo = async (page: Page) => (await attr(page, 'data-demo')) === '1'
const resting = (page: Page) => page.evaluate(() => !!document.querySelector('[data-logic-game] [data-resting]'))
const handOn = (page: Page) => page.evaluate(() => !!document.querySelector('[data-logic-game] .demo-hand'))
const shielded = (page: Page) => page.evaluate(() => document.querySelector('[data-logic-game] .wait-shield')?.getAttribute('data-accepting') === 'false')

async function waitTurn(page: Page, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await attr(page, 'data-turn')) === '1' && !(await shielded(page)) && !(await inDemo(page))) return true
    await page.waitForTimeout(150)
  }
  return false
}
async function until(page: Page, fn: () => Promise<boolean>, ms = 10_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn()) return true
    await page.waitForTimeout(150)
  }
  return false
}

async function open(k: Toddler, g: 'puzzle' | 'maze') {
  await k.tap((await centerOf(k.page, `[data-pick="${g}"]`))!, g === 'puzzle' ? '拼圖' : '迷宮')
  return waitLive(k.page, (x) => x === `logic-${g}`, 6000)
}

// ── 拼圖 ──────────────────────────────────────────────────

const pieceAt = (page: Page, i: number) => centerOf(page, `[data-piece="${i}"]`)
const slotAt = (page: Page, i: number) => centerOf(page, `[data-slot="${i}"]`)
const homeOf = (page: Page, i: number) => page.evaluate((i) => document.querySelector(`[data-piece="${i}"]`)?.getAttribute('data-home') ?? null, i)
const placedN = async (page: Page) => Number((await attr(page, 'data-placed')) ?? 0)
const piecesN = async (page: Page) => Number((await attr(page, 'data-pieces')) ?? 0)
/** 托盤裡還沒放的片 */
const trayPieces = async (page: Page) => {
  const n = await piecesN(page)
  const out: number[] = []
  for (let i = 0; i < n; i++) if ((await homeOf(page, i)) === 'tray') out.push(i)
  return out
}
/** 等片停好（彈簧動畫）再量位置 */
const still = (page: Page) => page.waitForTimeout(650)

/** 拖第 i 片到第 j 格 */
async function dragPiece(k: Toddler, i: number, j: number, label: string) {
  await still(k.page)
  const a = (await pieceAt(k.page, i))!
  const b = (await slotAt(k.page, j))!
  await k.drag([a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 20 }, b], { label })
}
/** 點第 i 片、再點第 j 格 */
async function tapPlace(k: Toddler, i: number, j: number, label: string) {
  await still(k.page)
  await k.tap((await pieceAt(k.page, i))!, `${label}：拿起第 ${i} 片`)
  await k.wait(250)
  await k.tap((await slotAt(k.page, j))!, `${label}：放第 ${j} 格`)
}

test.describe('拼圖', () => {
  test('第一次玩：示範中搶著點不算 → 拖過去吸附、點片再點位置 → 拼完停在再一張 → 換一張圖', async ({ page }, info) => {
    test.skip(!want('puzzle'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '拼圖第一次')
    try {
      const picks = await page.evaluate(() => [...document.querySelectorAll('[data-pick]')].map((e) => e.getAttribute('data-pick')).join(','))
      c.outcome('選玩法有拼圖、迷宮', picks.includes('puzzle') && picks.includes('maze'), picks)
      await shot(page, info, '01-選玩法')
      // 連點拼圖的卡：只進一次
      k.behavior = '連點拼圖'
      await k.spam((await centerOf(page, '[data-pick="puzzle"]'))!, 5, '拼圖')
      await waitLive(page, (x) => x === 'logic-puzzle', 6000)
      await k.wait(1000)
      c.outcome('連點拼圖：進到拼圖', (await snap(page)).live === 'logic-puzzle', String((await snap(page)).live))
      c.outcome('第一次玩：2×2 四片', (await piecesN(page)) === 4, String(await piecesN(page)))
      // 家長 2026-11-16：拼盤沒有淡淡的原圖，旁邊一張小的完整圖；托盤打亂，每一片都不在跟拼盤一樣的位置
      const look = await page.evaluate(() => ({
        ghost: !!document.querySelector('.pz-ghost'),
        ref: !!document.querySelector('[data-logic-game="puzzle"] [data-ref]'),
        same: [...document.querySelectorAll('[data-piece]')].filter((e) => e.getAttribute('data-piece') === e.getAttribute('data-tray')).length,
      }))
      c.outcome('拼盤只有空格子、旁邊有參考小圖', !look.ghost && look.ref, JSON.stringify(look))
      c.outcome('托盤打亂：每一片都不在跟拼盤一樣的位置', look.same === 0, `${look.same} 片在原位`)
      // 1. 示範中搶著點：點片、點板子，都只有圈圈，不算作答
      k.behavior = '示範中搶著點'
      const sawDemo = await until(page, () => inDemo(page), 6000)
      c.outcome('第一次玩：手先示範', sawDemo, '')
      if (sawDemo) await shot(page, info, '02-拼圖-示範')
      for (let n = 0; n < 5 && (await inDemo(page)); n++) {
        const p = await pieceAt(page, k.r.int(4))
        if (p) await k.spam(p, 2 + k.r.int(2), '示範中點片')
        const s = await slotAt(page, k.r.int(4))
        if (s) await k.tap(s, '示範中點板子')
        await k.wait(400)
      }
      await waitTurn(page)
      c.outcome('示範中點的都不算作答', (await rowsOf(page, 'logic-puzzle')).length === 0, '')
      c.outcome('示範放好一片', (await placedN(page)) === 1, String(await placedN(page)))
      await shot(page, info, '03-拼圖-輪到他')
      // 2. 拖過去放（放在格子附近就吸過去）、點片再點位置
      k.behavior = '拖過去、點片再點位置'
      let mode = 0
      for (let guard = 0; guard < 6; guard++) {
        const left = await trayPieces(page)
        if (!left.length) break
        const i = left[0]
        if (mode++ % 2 === 0) await dragPiece(k, i, i, `拖第 ${i} 片到對的位置`)
        else await tapPlace(k, i, i, '點片再點位置')
        const ok = await until(page, async () => (await homeOf(page, i)) === 'board', 4000)
        if (!ok) await c.once(`pz-place-${i}`, '卡死', `第 ${i} 片放到對的位置沒有吸進去`, mode % 2 ? '拖' : '點')
      }
      const done = await until(page, () => resting(page), 15_000)
      c.outcome('拼完：停在再一張／回首頁', done, '')
      c.outcome('拼完：整張圖（格線不見）', (await attr(page, 'data-done')) === '1', '')
      await k.wait(1000)
      await shot(page, info, '04-拼圖-拼完')
      const rows = await rowsOf(page, 'logic-puzzle')
      c.outcome('作答紀錄：一張一筆、示範過記一起做', rows.length === 1 && rows[0].phase === 'guided' && rows[0].skill === 'puzzle:4', JSON.stringify(rows))
      if (rows.length !== 1) await c.once('pz-rows', '誤記作答', `拼完一張記了 ${rows.length} 筆`, JSON.stringify(rows))
      // 3. 停著不動：不自己接下一張
      await k.wait(6000, '看再一張 6 秒，不點')
      c.outcome('拼完停著，不自己接下一張', (await resting(page)) && (await snap(page)).live === 'logic-puzzle', '')
      // 4. 再一張：換一張圖、不再示範
      k.behavior = '再一張'
      const pic0 = await attr(page, 'data-pic')
      await k.tap((await centerOf(page, '[data-next="again"]'))!, '再一張')
      await k.wait(1500)
      const pic1 = await attr(page, 'data-pic')
      c.outcome('再一張：換一張圖', !!pic1 && pic1 !== pic0, `${pic0} → ${pic1}`)
      c.outcome('再一張不再示範', !(await inDemo(page)), '')
      // 5. 中途返回：1 步回選玩法
      await holdHome(k, c, '拼圖中途返回')
      c.outcome('拼圖返回：回選玩法', (await snap(page)).live === 'logic', String((await snap(page)).live))
      await c.flush()
    } finally {
      finish(k, c, '拼圖第一次')
    }
  })

  test('放錯（第 2 次亮、第 3 次手帶著）、拖到一半放手、兩根手指、發呆、亂點、中途返回', async ({ page }, info) => {
    test.skip(!want('puzzle'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '拼圖放錯', { taught: true })
    try {
      await open(k, 'puzzle')
      await waitTurn(page)
      // 1. 拖到一半放手（托盤旁的空白）：回托盤，不算
      k.behavior = '拖到一半放手'
      await still(page)
      const i0 = (await trayPieces(page))[0]
      const a = (await pieceAt(page, i0))!
      await k.drag([a, { x: a.x - 40, y: a.y + 30 }, { x: a.x - 80, y: Math.min(a.y + 60, 700) }], { label: '拖一點點就放手' })
      await k.wait(800)
      c.outcome('拖到一半放手：回托盤、不算作答', (await homeOf(page, i0)) === 'tray' && (await rowsOf(page, 'logic-puzzle')).length === 0, '')
      // 2. 兩根手指一起按兩片：只有第一根算
      k.behavior = '兩根手指'
      const left = await trayPieces(page)
      if (left.length >= 2) {
        await still(page)
        await k.twoFinger([(await pieceAt(page, left[0]))!], (await pieceAt(page, left[1]))!, 150)
        await k.wait(500)
        const lifted = await page.evaluate(() => document.querySelectorAll('.pz-piece.is-lifted').length)
        c.outcome('兩根手指按兩片：最多拿起一片', lifted <= 1, `${lifted} 片拿起來`)
      }
      // 3. 一直放錯同一片：第 1 次回托盤、第 2 次對的位置亮起來、第 3 次手帶著放進去
      k.behavior = '一直放錯'
      const i = (await trayPieces(page))[0]
      const n = await piecesN(page)
      const wrong = Array.from({ length: n }, (_, j) => j).find((j) => j !== i && true)!
      await dragPiece(k, i, wrong, `第 ${i} 片拖到錯的第 ${wrong} 格`)
      await k.wait(900)
      c.outcome('放錯 1 次：片回托盤', (await homeOf(page, i)) === 'tray', '')
      await tapPlace(k, i, wrong, '再放錯')
      await k.wait(900)
      const glow = await page.evaluate((i) => !!document.querySelector(`[data-slot="${i}"].is-glow`), i)
      c.outcome('放錯 2 次：對的位置亮起來', glow, '')
      await shot(page, info, '05-拼圖-錯兩次亮起來')
      await dragPiece(k, i, wrong, '第 3 次放錯')
      const carried = await until(page, async () => (await homeOf(page, i)) === 'board', 8000)
      c.outcome('放錯 3 次：手帶著放進去', carried, '')
      // 4. 發呆 33 秒：手點一片、對的位置亮起來
      if ((await trayPieces(page)).length) {
        k.behavior = '發呆'
        await waitTurn(page)
        await k.wait(33_000, '發呆 33 秒')
        const hint = (await handOn(page)) && (await page.evaluate(() => !!document.querySelector('.pz-slot.is-glow')))
        c.outcome('發呆 30 秒：手點一片、對的位置亮起來', hint, '')
        await shot(page, info, '06-拼圖-發呆提示')
      }
      // 5. 拼完：放錯過的記錄（手帶著的記一起做、不算第一次就對）
      for (let guard = 0; guard < 6; guard++) {
        const t = await trayPieces(page)
        if (!t.length) break
        await dragPiece(k, t[0], t[0], '放好剩下的')
        await until(page, async () => (await homeOf(page, t[0])) === 'board', 4000)
      }
      await until(page, () => resting(page), 12_000)
      const rows = await rowsOf(page, 'logic-puzzle')
      const last = rows[rows.length - 1]
      c.outcome('手帶著放的：記一起做、不算第一次就對', !!last && last.phase === 'guided' && last.shown && !last.ok, JSON.stringify(last))
      if (!last || last.phase !== 'guided' || !last.shown) await c.once('pz-guided', '誤記作答', '手帶著放的沒有記成一起做', JSON.stringify(last))
      // 6. 再一張，亂點多指 20 秒：不壞
      await k.tap((await centerOf(page, '[data-next="again"]'))!, '再一張')
      await k.wait(1200)
      k.behavior = '亂點多指'
      const t0 = Date.now()
      while (Date.now() - t0 < 20_000 && (await snap(page)).live === 'logic-puzzle') {
        // 不點右邊那一欄（再一個／回首頁）：亂點到回首頁就離開遊戲了
        const x = 200 + k.r.int(700)
        const y = 170 + k.r.int(520)
        const r = k.r.int(5)
        if (r === 0) await k.spam({ x, y }, 3 + k.r.int(4), '連點')
        else if (r === 1) await k.twoFinger([{ x, y }], { x: 200 + k.r.int(700), y: 170 + k.r.int(520) }, 100)
        else if (r === 2) await k.drag([{ x, y }, { x: x + k.r.range(-200, 200), y: y + k.r.range(-150, 150) }], { label: '亂拖' })
        else await k.tap({ x, y }, '亂點')
        await k.wait(150 + k.r.int(350))
      }
      await c.screenOk('拼圖亂點後')
      c.outcome('亂點多指之後還在拼圖裡', (await snap(page)).live === 'logic-puzzle', String((await snap(page)).live))
      // 7. 中途返回：1 步回選玩法
      await holdHome(k, c, '拼圖中途返回')
      c.outcome('中途返回：回選玩法', (await snap(page)).live === 'logic', String((await snap(page)).live))
      await c.flush()
    } finally {
      finish(k, c, '拼圖放錯')
    }
  })
})

// ── 迷宮 ──────────────────────────────────────────────────

const cellPt = (page: Page, c: number) => centerOf(page, `[data-cell="${c}"]`)
const atCell = async (page: Page) => Number((await attr(page, 'data-at')) ?? -1)
const nextCell = async (page: Page) => Number((await attr(page, 'data-next')) ?? -1)
/** 迷宮資料：大小、通的方向 */
const mazeInfo = async (page: Page) => ({
  cols: Number(await attr(page, 'data-cols')),
  rows: Number(await attr(page, 'data-rows')),
  links: ((await attr(page, 'data-links')) ?? '').split(',').map(Number),
  goal: Number(await attr(page, 'data-goal')),
})
/** 隔著牆的鄰格（沒有：-1） */
async function wallNeighbor(page: Page) {
  const m = await mazeInfo(page)
  const at = await atCell(page)
  const x = at % m.cols
  const y = Math.floor(at / m.cols)
  const dirs = [
    [0, -1, 1],
    [1, 0, 2],
    [0, 1, 4],
    [-1, 0, 8],
  ]
  for (const [dx, dy, bit] of dirs) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= m.cols || ny >= m.rows) continue
    if (!(m.links[at] & bit)) return ny * m.cols + nx
  }
  return -1
}

/** 手指拖著恐龍照提示的方向一路走到終點（一筆畫完） */
async function dragToGoal(k: Toddler, c: Checker) {
  const page = k.page
  const m = await mazeInfo(page)
  // 照 data-next 算出整條路（data-next 是從現在位置往終點的下一格）
  const pts: Pt[] = [(await cellPt(page, await atCell(page)))!]
  const before = await atCell(page)
  const cells: number[] = []
  // 用 BFS 在測試這邊算路（只依賴畫面上的 data-links）
  const prev = new Map<number, number>([[before, -1]])
  const q = [before]
  while (q.length) {
    const cur = q.shift()!
    const x = cur % m.cols
    const y = Math.floor(cur / m.cols)
    for (const [dx, dy, bit] of [
      [0, -1, 1],
      [1, 0, 2],
      [0, 1, 4],
      [-1, 0, 8],
    ]) {
      if (!(m.links[cur] & bit)) continue
      const nb = (y + dy) * m.cols + (x + dx)
      if (!prev.has(nb)) prev.set(nb, cur), q.push(nb)
    }
  }
  for (let cur = m.goal; cur !== before && cur >= 0; cur = prev.get(cur)!) cells.unshift(cur)
  for (const cell of cells) pts.push((await cellPt(page, cell))!)
  await k.drag(pts, { stepMs: 22, label: `拖著恐龍走 ${cells.length} 格到終點` })
  const ok = await until(page, async () => (await attr(page, 'data-done')) === '1', 5000)
  if (!ok) await c.once('mz-drag', '卡死', '拖著恐龍沿路走沒有走到終點', `停在 ${await atCell(page)}，終點 ${m.goal}`)
  return ok
}

test.describe('迷宮', () => {
  test('第一次玩：示範中搶著點不算 → 拖著恐龍走到終點 → 停在再一個 → 換一個迷宮', async ({ page }, info) => {
    test.skip(!want('maze'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '迷宮第一次')
    try {
      await open(k, 'maze')
      await k.wait(800)
      const m = await mazeInfo(page)
      c.outcome('第一次玩：3×3', m.cols === 3 && m.rows === 3, `${m.cols}×${m.rows}`)
      // 1. 示範中搶著點
      k.behavior = '示範中搶著點'
      const sawDemo = await until(page, () => inDemo(page), 6000)
      c.outcome('第一次玩：手先示範', sawDemo, '')
      if (sawDemo) await shot(page, info, '07-迷宮-示範')
      const at0 = await atCell(page)
      for (let n = 0; n < 5 && (await inDemo(page)); n++) {
        const p = await cellPt(page, k.r.int(9))
        if (p) await k.spam(p, 2 + k.r.int(2), '示範中點格子')
        await k.wait(400)
      }
      await waitTurn(page)
      c.outcome('示範中點的都不算作答', (await rowsOf(page, 'logic-maze')).length === 0, '')
      c.outcome('示範：恐龍走了一步', (await atCell(page)) !== at0, `${at0} → ${await atCell(page)}`)
      await shot(page, info, '08-迷宮-輪到他')
      // 2. 拖著恐龍沿著路走到終點
      k.behavior = '拖著走'
      await dragToGoal(k, c)
      const done = await until(page, () => resting(page), 12_000)
      c.outcome('走到終點：停在再一個／回首頁', done, '')
      await k.wait(800)
      await shot(page, info, '09-迷宮-走到了')
      const rows = await rowsOf(page, 'logic-maze')
      c.outcome('作答紀錄：一個一筆、示範過記一起做', rows.length === 1 && rows[0].phase === 'guided' && rows[0].skill === 'maze:3x3', JSON.stringify(rows))
      if (rows.length !== 1) await c.once('mz-rows', '誤記作答', `走完一個記了 ${rows.length} 筆`, JSON.stringify(rows))
      await k.wait(6000, '看再一個 6 秒，不點')
      c.outcome('走完停著，不自己接下一個', (await resting(page)) && (await snap(page)).live === 'logic-maze', '')
      // 3. 再一個：換一個迷宮
      k.behavior = '再一個'
      const sig0 = await attr(page, 'data-sig')
      const th0 = await attr(page, 'data-theme')
      await k.tap((await centerOf(page, '[data-next="again"]'))!, '再一個')
      await k.wait(1500)
      const sig1 = await attr(page, 'data-sig')
      const th1 = await attr(page, 'data-theme')
      c.outcome('再一個：迷宮不一樣、主題換了', !!sig1 && sig1 !== sig0 && th1 !== th0, `${th0} → ${th1}`)
      c.outcome('再一個不再示範', !(await inDemo(page)), '')
      await shot(page, info, '10-迷宮-再一個')
      // 走完第二個，點回首頁
      await waitTurn(page)
      await dragToGoal(k, c)
      await until(page, () => resting(page), 12_000)
      await k.tap((await centerOf(page, '[data-next="home"]'))!, '回首頁')
      const l = await waitLive(page, (x) => x === 'home', 6000)
      c.outcome('點回首頁：回到首頁', l === 'home', String(l))
      await c.flush()
    } finally {
      finish(k, c, '迷宮第一次')
    }
  })

  test('撞牆停住、點旁邊的格子走一步、拖到一半放手、發呆提示方向、亂點多指、中途返回', async ({ page }, info) => {
    test.skip(!want('maze'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '迷宮撞牆', { taught: true })
    try {
      await open(k, 'maze')
      await waitTurn(page)
      // 1. 撞牆：拖到隔著牆的格子，恐龍停住
      k.behavior = '撞牆'
      const w = await wallNeighbor(page)
      const at0 = await atCell(page)
      if (w >= 0) {
        await k.drag([(await cellPt(page, at0))!, (await cellPt(page, w))!], { label: '往牆那邊拖' })
        await k.wait(600)
        c.outcome('撞牆：恐龍停在原地', (await atCell(page)) === at0, `${at0} → ${await atCell(page)}`)
        await k.tap((await cellPt(page, w))!, '點隔著牆的格子')
        await k.wait(500)
        c.outcome('點隔著牆的格子：不走', (await atCell(page)) === at0, '')
      }
      // 2. 點旁邊相通的格子：走一步
      k.behavior = '點格子走一步'
      const nx = await nextCell(page)
      await k.tap((await cellPt(page, nx))!, '點下一格')
      await until(page, async () => (await atCell(page)) === nx, 3000)
      c.outcome('點旁邊相通的格子：走一步', (await atCell(page)) === nx, `${at0} → ${await atCell(page)}`)
      // 3. 連點同一格：不會多走、不會壞
      const at1 = await atCell(page)
      await k.spam((await cellPt(page, at1))!, 6, '連點恐龍')
      await k.wait(500)
      c.outcome('連點恐龍：不亂走', (await atCell(page)) === at1, '')
      // 4. 拖到一半放手：手指在同一格裡放開，恐龍不動
      const p = (await cellPt(page, at1))!
      await k.drag([p, { x: p.x + 20, y: p.y + 10 }], { label: '拖一點點就放手' })
      await k.wait(400)
      c.outcome('拖到一半放手：恐龍不動', (await atCell(page)) === at1, '')
      // 5. 兩根手指：第二根不帶著走
      const sec = await nextCell(page)
      if (sec >= 0 && (await attr(page, 'data-done')) !== '1') {
        await k.twoFinger([(await cellPt(page, at1))!], (await cellPt(page, (await mazeInfo(page)).goal))!, 150)
        await k.wait(500)
        c.outcome('兩根手指：沒有跳到終點', (await attr(page, 'data-done')) !== '1', '')
      }
      // 6. 發呆 33 秒：手指著下一格、那一格亮起來
      if ((await attr(page, 'data-done')) !== '1') {
        k.behavior = '發呆'
        await waitTurn(page)
        await k.wait(33_000, '發呆 33 秒')
        const hint = (await handOn(page)) && (await page.evaluate(() => !!document.querySelector('.mz-glow')))
        c.outcome('發呆 30 秒：手指著下一格、那一格亮起來', hint, '')
        await shot(page, info, '11-迷宮-發呆提示')
        await dragToGoal(k, c)
        await until(page, () => resting(page), 12_000)
        const rows = await rowsOf(page, 'logic-maze')
        const last = rows[rows.length - 1]
        c.outcome('靠提示走完：記一起做、不算第一次就對', !!last && last.phase === 'guided' && last.led && !last.ok, JSON.stringify(last))
        if (!last || last.phase !== 'guided') await c.once('mz-led', '誤記作答', '靠提示走完的沒有記成一起做', JSON.stringify(last))
      }
      // 7. 再一個，亂點多指 20 秒
      if (await resting(page)) {
        await k.tap((await centerOf(page, '[data-next="again"]'))!, '再一個')
        await k.wait(1200)
      }
      k.behavior = '亂點多指'
      const t0 = Date.now()
      while (Date.now() - t0 < 20_000 && (await snap(page)).live === 'logic-maze') {
        // 不點右邊那一欄（再一個／回首頁）：亂點到回首頁就離開遊戲了
        const x = 200 + k.r.int(700)
        const y = 170 + k.r.int(520)
        const r = k.r.int(5)
        if (r === 0) await k.spam({ x, y }, 3 + k.r.int(4), '連點')
        else if (r === 1) await k.twoFinger([{ x, y }], { x: 200 + k.r.int(700), y: 170 + k.r.int(520) }, 100)
        else if (r === 2) await k.drag([{ x, y }, { x: x + k.r.range(-250, 250), y: y + k.r.range(-200, 200) }], { label: '亂拖' })
        else await k.tap({ x, y }, '亂點')
        await k.wait(150 + k.r.int(350))
      }
      await c.screenOk('迷宮亂點後')
      c.outcome('亂點多指之後還在迷宮裡', (await snap(page)).live === 'logic-maze', String((await snap(page)).live))
      // 8. 中途返回：1 步回選玩法
      await holdHome(k, c, '迷宮中途返回')
      c.outcome('中途返回：回選玩法', (await snap(page)).live === 'logic', String((await snap(page)).live))
      await c.flush()
    } finally {
      finish(k, c, '迷宮撞牆')
    }
  })
})
