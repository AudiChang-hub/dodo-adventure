import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { boot, settle, snap } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, centerOf, holdHome, waitLive } from './lib/flows'

/**
 * 遊戲角的邏輯遊戲（T-152，src/games/logic/）：選玩法 → 豆豆收拾（分類）／串珠珠（規律）。
 * 首頁的入口是 P2 做的；這裡直接從「選玩法」開始（更新前記下的畫面 dodo.resume = logic）。
 * 三歲孩子會做的事：連點、兩根手指一起點兩張、示範時搶著點、拖到一半放手、一直點錯、發呆、亂點、隨時返回。
 * 每一層返回鍵點一下回上一層：玩到一半 → 選玩法 → 首頁。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261116)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = () => !only.length || only.includes('logic')
/** 截圖（給家長、PM 看版面）：test-results/t152 */
const SHOTS = path.resolve('test-results', 't152')

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

/** 邏輯遊戲的作答紀錄（station logic） */
const logicAttempts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ ts: number; game: string; skill: string; phase: string; ok: boolean; tries: number; shown: boolean; led: boolean }[]>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const g = db.transaction('attempts').objectStore('attempts').getAll()
          g.onsuccess = () => {
            db.close()
            res(
              (g.result as any[])
                .filter((a) => a.station === 'logic')
                .map((a) => ({ ts: a.ts, game: a.game, skill: a.skill, phase: a.phase ?? 'quiz', ok: a.firstTryCorrect, tries: a.attempts, shown: !!a.metrics?.shown, led: !!a.metrics?.led }))
                .sort((a, b) => a.ts - b.ts),
            )
          }
          g.onerror = () => res([])
        }
        rq.onerror = () => res([])
      }),
  )

/** 里程碑貼紙（achieve 的 log）有幾筆：邏輯遊戲不該多出來 */
const milestones = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const g = db.transaction('kv').objectStore('kv').get('achieve')
          g.onsuccess = () => {
            db.close()
            res(((g.result as { value?: { log?: unknown[] } } | undefined)?.value?.log ?? []).length)
          }
        }
        rq.onerror = () => res(-1)
      }),
  )

/**
 * 開 App、直接到「選玩法」。progress：kv logic.progress（null＝第一次玩，會示範）；
 * taught：兩種玩法第 1 級都示範過了（直接自己做）。
 */
async function setup(page: Page, info: Info, name: string, opts: { taught?: boolean; settings?: Record<string, unknown> } = {}) {
  const seed = hashSeed(BASE_SEED, 'logic', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `邏輯遊戲／${name}`
  await boot(page, seed, { to: 'home', settings: opts.settings })
  if (opts.taught) {
    const one = { level: 1, recent: [], taught: [1] }
    await kvSet(page, 'logic.progress', { sort: one, pattern: one })
  }
  await page.evaluate(() => sessionStorage.setItem('dodo.resume', 'logic'))
  await page.reload()
  await page.waitForSelector('[data-logic-pick]', { timeout: 20_000 })
  await settle(page)
  await k.init()
  return { k, c }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`logic-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

const shot = async (page: Page, info: Info, name: string) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`) })
}

/** 畫面上（最上層那一個）某個屬性 */
const attr = (page: Page, sel: string, name: string) =>
  page.evaluate(
    ({ sel, name }) => {
      const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
      return root.querySelector(sel)?.getAttribute(name) ?? null
    },
    { sel, name },
  )
const game = (page: Page) => attr(page, '[data-logic-game]', 'data-logic-game')
const itemNo = async (page: Page) => Number((await attr(page, '[data-logic-game]', 'data-item')) ?? -1)
const answer = (page: Page) => attr(page, '[data-logic-game]', 'data-answer')
const inDemo = async (page: Page) => (await attr(page, '[data-logic-game]', 'data-demo')) === '1'
const resting = (page: Page) => page.evaluate(() => !!document.querySelector('[data-logic-game] [data-resting]'))
const necklace = (page: Page) => page.evaluate(() => !!document.querySelector('[data-necklace]'))
/** 擋板開著（剛出來 0.3 秒、示範中）：點了只有圈圈 */
const shielded = (page: Page) => page.evaluate(() => document.querySelector('[data-logic-game] .wait-shield')?.getAttribute('data-accepting') === 'false')

/** 一個可以點的選項：sort 是籃子、pattern 是下面的珠子 */
const optSel = (g: string, id: string) => (g === 'sort' ? `[data-basket="${id}"]` : `[data-option="${id}"]`)
const optIds = (page: Page, g: string) =>
  page.evaluate((g) => [...document.querySelectorAll(g === 'sort' ? '[data-basket]' : '[data-option]')].map((e) => e.getAttribute(g === 'sort' ? 'data-basket' : 'data-option')!), g)

/** 等到輪到他：題目、答錯的提示說完了（畫面的 data-turn），擋板關著（題目說完才點，點錯才算） */
async function waitTurn(k: Toddler, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await attr(k.page, '[data-logic-game]', 'data-turn')) === '1' && !(await shielded(k.page))) return true
    await k.page.waitForTimeout(150)
  }
  return false
}

/** 點對的那一個；回傳有沒有換到下一個（或一局結束） */
async function tapRight(k: Toddler, g: string) {
  const page = k.page
  const i = await itemNo(page)
  const a = (await answer(page))!
  const p = await centerOf(page, optSel(g, a))
  if (!p) return false
  await k.tap(p, `點對的 ${a}`)
  const end = Date.now() + 12_000
  while (Date.now() < end) {
    if ((await itemNo(page)) !== i || (await resting(page)) || (await necklace(page))) return true
    // 一局的最後一個放好、時間到了：去睡覺了
    if ((await snap(page)).live !== `logic-${g}`) return true
    await page.waitForTimeout(150)
  }
  return false
}

/** 點錯的那一個 */
async function tapWrong(k: Toddler, g: string) {
  const page = k.page
  const a = await answer(page)
  const wrong = (await optIds(page, g)).find((x) => x !== a)!
  await k.tap((await centerOf(page, optSel(g, wrong)))!, `點錯的 ${wrong}`)
  // 等畫面收到這一下（data-turn 換掉）再往下
  await page.waitForTimeout(400)
}

/** 一局玩到底（每一個都等輪到他再點對的） */
async function playOut(k: Toddler, c: Checker, g: string) {
  for (let n = 0; n < 8; n++) {
    if ((await resting(k.page)) || (await necklace(k.page)) || (await snap(k.page)).live !== `logic-${g}`) break
    await waitTurn(k)
    if (!(await tapRight(k, g))) {
      await c.once(`stuck-${g}`, '卡死', `${g} 點了對的沒有換下一個`, `第 ${await itemNo(k.page)} 個`)
      return false
    }
  }
  const end = Date.now() + 15_000
  while (Date.now() < end && !(await resting(k.page))) await k.page.waitForTimeout(200)
  return resting(k.page)
}

test.describe('邏輯遊戲', () => {
  test('選玩法：連點、兩根手指、每一層 1 步回上一層', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '選玩法', { taught: true })
    try {
      const picks = await page.evaluate(() => [...document.querySelectorAll('[data-pick]')].map((e) => e.getAttribute('data-pick')).join(','))
      // T-156 加上拼圖、迷宮（tests/toddler/puzzle-maze.spec.ts）
      c.outcome('進來是四個大圖示：籃子、珠子、拼圖、迷宮', picks === 'sort,pattern,puzzle,maze', picks)
      await shot(page, info, '01-選玩法')
      // 連點籃子：只進一次
      k.behavior = '連點豆豆收拾'
      await k.spam((await centerOf(page, '[data-pick="sort"]'))!, 6, '豆豆收拾')
      let l = await waitLive(page, (x) => x === 'logic-sort', 5000)
      await k.wait(1200)
      l = (await snap(page)).live
      c.outcome('連點豆豆收拾：進到豆豆收拾', l === 'logic-sort', `到 ${l}`)
      await c.screenOk('豆豆收拾')
      // 玩到一半返回：回選玩法；再返回：回首頁
      k.behavior = '返回'
      await holdHome(k, c, '豆豆收拾 → 選玩法')
      c.outcome('豆豆收拾點返回：回到選玩法', (await snap(page)).live === 'logic', String((await snap(page)).live))
      await settle(page, 4000)
      // 兩根手指一起點兩張：只進一個
      k.behavior = '兩根手指'
      const a = (await centerOf(page, '[data-pick="pattern"]'))!
      const b = (await centerOf(page, '[data-pick="sort"]'))!
      await k.twoFinger([a], b, 120)
      l = await waitLive(page, (x) => x === 'logic-sort' || x === 'logic-pattern', 5000)
      await k.wait(1500)
      const l2 = (await snap(page)).live
      c.outcome('兩根手指一起點兩張：只進一個、不跳兩次', (l2 === 'logic-sort' || l2 === 'logic-pattern') && l2 === l, `${l} → ${l2}`)
      await holdHome(k, c, '玩法 → 選玩法')
      await settle(page, 4000)
      // 剛返回的 1 秒內同一個位置再點不算（lib/nav.ts 的 BACK_LOCK_MS，連點不多跳一層）：像孩子一樣停一下再點
      await k.wait(1500)
      await holdHome(k, c, '選玩法 → 首頁')
      c.outcome('選玩法點返回：回首頁', (await snap(page)).live === 'home', String((await snap(page)).live))
      // 連點返回鍵：不會多跳（首頁沒有上一層）
      await c.flush()
    } finally {
      finish(k, c, '選玩法')
    }
  })

  for (const g of ['sort', 'pattern'] as const) {
    const name = g === 'sort' ? '豆豆收拾' : '串珠珠'

    test(`${name}：第一次玩（示範中搶著點不算）→ 一起做 → 自己做 → 停在再一局`, async ({ page }, info) => {
      test.skip(!want())
      test.setTimeout(6 * 60_000)
      const { k, c } = await setup(page, info, `${name}第一次`)
      try {
        const m0 = await milestones(page)
        await k.tap((await centerOf(page, `[data-pick="${g}"]`))!, name)
        await waitLive(page, (x) => x === `logic-${g}`, 5000)
        // 1. 示範中搶著點：點選項、點東西、亂點，都只有圈圈，不算作答
        k.behavior = '示範中搶著點'
        let sawDemo = false
        const t0 = Date.now()
        while (Date.now() - t0 < 6000) {
          if (await inDemo(page)) {
            sawDemo = true
            break
          }
          await page.waitForTimeout(100)
        }
        c.outcome('第一次玩：手先示範', sawDemo, sawDemo ? '' : '6 秒內沒有示範')
        if (sawDemo) await shot(page, info, `02-${name}-示範`)
        for (let i = 0; i < 6 && (await inDemo(page)); i++) {
          const ids = await optIds(page, g)
          const p = await centerOf(page, optSel(g, ids[k.r.int(ids.length)]))
          if (p) await k.spam(p, 2 + k.r.int(3), '示範中點選項')
          if (g === 'sort') {
            const it = await centerOf(page, '.lg-item')
            if (it) await k.tap(it, '示範中點東西')
          }
          await k.wait(500)
        }
        const during = (await logicAttempts(page)).filter((a) => a.phase !== 'teach')
        c.outcome('示範中點的都不算作答', during.length === 0, during.length ? `多了 ${during.length} 筆：${during.map((a) => a.phase).join(',')}` : '')
        if (during.length) await c.once('demo-counted', '誤記作答', '示範中點了被記成作答', JSON.stringify(during))
        // 2. 一起做（手停在對的上面）、自己做：點對的，一個一個到底
        k.behavior = '一起做、自己做'
        await waitTurn(k)
        const handOn = await page.evaluate(() => !!document.querySelector('[data-logic-game] .demo-hand'))
        c.outcome('示範完，第 2 個手停在對的上面（一起做）', handOn, '')
        await shot(page, info, `03-${name}-一起做`)
        const done = await playOut(k, c, g)
        c.outcome('一局玩到底：停在再一局／回首頁', done, '')
        if (g === 'pattern') c.outcome('串完：豆豆戴上項鍊', await necklace(page), '')
        await k.wait(1200)
        await shot(page, info, `04-${name}-一局玩完`)
        const rows = await logicAttempts(page)
        const phases = rows.map((a) => a.phase).join(',')
        const expected = g === 'sort' ? 'teach,guided,quiz,quiz' : 'teach,guided,quiz'
        c.outcome('作答紀錄：示範、一起做、自己做', phases === expected, phases)
        if (phases !== expected) await c.once('phases', '誤記作答', `作答紀錄的階段不對：${phases}`, `應該是 ${expected}`)
        c.outcome('記成邏輯遊戲的技能', rows.every((a) => (g === 'sort' ? a.skill === 'sort:color' : a.skill.startsWith('pattern:ab'))), rows.map((a) => a.skill).join(','))
        // 3. 停著不動 8 秒：不自己接下一局、不自己走
        await k.wait(8000, '看再一局 8 秒，不點')
        const still = (await snap(page)).live === `logic-${g}` && (await resting(page))
        c.outcome('一局結束停著，不自己接下一局', still, String((await snap(page)).live))
        const m1 = await milestones(page)
        c.outcome('沒有多出里程碑貼紙', m1 === m0, `${m0} → ${m1}`)
        if (m1 !== m0) await c.once('milestone', '誤記作答', '邏輯遊戲給了里程碑貼紙', `${m0} → ${m1}`)
        // 4. 再一局：新的一局、不再示範
        k.behavior = '再一局'
        await k.tap((await centerOf(page, '[data-next="again"]'))!, '再一局')
        await k.wait(1500)
        const again = !(await resting(page)) && (await itemNo(page)) === 0
        c.outcome('點再一局：新的一局', again, '')
        await k.wait(1500)
        c.outcome('再一局不再示範', !(await inDemo(page)), '')
        // 5. 回首頁的大圖示：玩一局再點房子
        await playOut(k, c, g)
        await k.tap((await centerOf(page, '[data-next="home"]'))!, '回首頁')
        const l = await waitLive(page, (x) => x === 'home', 5000)
        c.outcome('點回首頁：回到首頁', l === 'home', String(l))
        await c.flush()
      } finally {
        finish(k, c, `${name}第一次`)
      }
    })

    test(`${name}：一直點錯（第 2 次亮、第 3 次手帶著）、發呆、亂點多指、中途返回`, async ({ page }, info) => {
      test.skip(!want())
      test.setTimeout(7 * 60_000)
      const { k, c } = await setup(page, info, `${name}點錯`, { taught: true })
      try {
        await k.tap((await centerOf(page, `[data-pick="${g}"]`))!, name)
        await waitLive(page, (x) => x === `logic-${g}`, 5000)
        // 1. 一直點錯：第 2 次對的亮起來、第 3 次手帶著放進去（記一起做）
        k.behavior = '一直點錯'
        await waitTurn(k)
        const i0 = await itemNo(page)
        await tapWrong(k, g)
        await waitTurn(k)
        c.outcome('點錯 1 次：東西回原位、還在同一個', (await itemNo(page)) === i0, '')
        await tapWrong(k, g)
        await k.wait(700)
        const glow = await page.evaluate(() => !!document.querySelector('[data-logic-game] .is-glow'))
        c.outcome('點錯 2 次：對的亮起來', glow, '')
        await shot(page, info, `05-${name}-錯兩次亮起來`)
        await waitTurn(k)
        await tapWrong(k, g)
        const end = Date.now() + 15_000
        while (Date.now() < end && (await itemNo(page)) === i0) await page.waitForTimeout(200)
        c.outcome('點錯 3 次：手帶著放進去、換下一個', (await itemNo(page)) !== i0, '')
        const rows = await logicAttempts(page)
        const last = rows[rows.length - 1]
        c.outcome('手帶著的記成一起做、不算第一次就對', !!last && last.phase === 'guided' && last.shown && !last.ok, JSON.stringify(last))
        if (!last || last.phase !== 'guided') await c.once('guided', '誤記作答', '手帶著放的沒有記成一起做', JSON.stringify(last))

        // 2. 拖到一半放手（豆豆收拾）：東西回中間，不算錯
        if (g === 'sort') {
          k.behavior = '拖到一半放手'
          await waitTurn(k)
          const before = (await logicAttempts(page)).length
          const i1 = await itemNo(page)
          const it = (await centerOf(page, '.lg-item'))!
          await k.drag([it, { x: it.x + 60, y: it.y + 30 }, { x: it.x + 140, y: it.y + 60 }, { x: it.x + 200, y: it.y + 40 }], { label: '拖到空白處放手' })
          await k.wait(900)
          const back = await page.evaluate(() => {
            const el = document.querySelector('.lg-item')
            return el ? getComputedStyle(el).transform : 'none'
          })
          const same = (await itemNo(page)) === i1 && (await logicAttempts(page)).length === before
          c.outcome('拖到空白處放手：東西回中間、不算作答', same && (back === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(back)), `transform ${back}`)
          // 拖到對的籃子：放進去
          const a = (await answer(page))!
          const to = (await centerOf(page, optSel(g, a)))!
          const it2 = (await centerOf(page, '.lg-item'))!
          await k.drag([it2, { x: (it2.x + to.x) / 2, y: (it2.y + to.y) / 2 }, to], { label: '拖到對的籃子' })
          const end2 = Date.now() + 8000
          while (Date.now() < end2 && (await itemNo(page)) === i1 && !(await resting(page))) await page.waitForTimeout(200)
          c.outcome('拖到對的籃子放手：放進去', (await itemNo(page)) !== i1 || (await resting(page)), '')
        }

        // 3. 發呆：15 秒再念一次、再 15 秒手點一下答案
        if (!(await resting(page))) {
          k.behavior = '發呆'
          await waitTurn(k)
          await k.wait(33_000, '發呆 33 秒')
          const hint = await page.evaluate(() => !!document.querySelector('[data-logic-game] .demo-hand'))
          c.outcome('發呆 30 秒：手點一下答案', hint, '')
        }

        // 4. 亂點、連點、多指 20 秒：不壞
        k.behavior = '亂點多指'
        const t = Date.now()
        while (Date.now() - t < 20_000 && (await snap(page)).live === `logic-${g}`) {
          const x = 260 + k.r.int(860)
          const y = 180 + k.r.int(520)
          const r = k.r.int(4)
          if (r === 0) await k.spam({ x, y }, 3 + k.r.int(4), '連點')
          else if (r === 1) await k.twoFinger([{ x, y }], { x: 260 + k.r.int(860), y: 180 + k.r.int(520) }, 100)
          else await k.tap({ x, y }, '亂點')
          await k.wait(200 + k.r.int(400))
        }
        await c.screenOk(`${name}亂點後`)
        const l = (await snap(page)).live
        c.outcome('亂點多指之後還在遊戲裡（或已經玩完停著）', l === `logic-${g}`, String(l))
        // 5. 中途返回：1 步回選玩法
        await holdHome(k, c, `${name}中途返回`)
        c.outcome('中途返回：回選玩法', (await snap(page)).live === 'logic', String((await snap(page)).live))
        await c.flush()
      } finally {
        finish(k, c, `${name}點錯`)
      }
    })
  }

  test('時間到：玩完這一局才進睡覺畫面', async ({ page }, info) => {
    test.skip(!want() || info.project.name !== 'tab1200')
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '時間到', { taught: true, settings: { dailyMinutes: 1 } })
    try {
      await k.tap((await centerOf(page, '[data-pick="sort"]'))!, '豆豆收拾')
      await waitLive(page, (x) => x === 'logic-sort', 5000)
      await waitTurn(k)
      await tapRight(k, 'sort')
      // 等過 1 分鐘：還在玩，不被打斷
      await k.wait(62_000, '玩到時間到')
      const mid = (await snap(page)).live
      c.outcome('時間到了還在一局中間：不打斷', mid === 'logic-sort', String(mid))
      await playOut(k, c, 'sort')
      const l = await waitLive(page, (x) => x === 'bedtime', 10_000)
      c.outcome('玩完這一局：進睡覺畫面', l === 'bedtime', String(l))
      if (l !== 'bedtime') await c.once('bed', '小問題', '時間到了玩完一局沒有去睡覺', `停在 ${l}`)
      await c.flush()
    } finally {
      finish(k, c, '時間到')
    }
  })
})
