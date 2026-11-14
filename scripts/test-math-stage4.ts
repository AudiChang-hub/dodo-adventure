// 數學 4 歲內容（src/lessons/math/stage4.ts、sub-plan.ts、path-plan.ts，T-150 M）的單元測試。
// 執行：npx tsx scripts/test-math-stage4.ts（npm run verify 的「單元：數學 4 歲內容」）
// 驗收（設計稿第八節）：門檻差一點都不開；開了不關；退一級；一天一道門；頭 14 天一堂一個；暫停；
// 一眼看出的排法不重疊、2 選 1 時差 ≥ 2、4～5 只用骰子點和五格框；數字小路骰子只有 1～2、不會走超過、一局一定走得到 10；開場數字小路不會連兩天。
import assert from 'node:assert/strict'
import type { Attempt } from '../src/lib/db'
import { chooseVariety, type VarietyState } from '../src/lib/variety'
import {
  FLASH_MIN,
  GAME_SETS,
  GAME_SET_IDS,
  GATE_IDS,
  NO_STAGE4,
  PAUSE_KEY,
  STAGE4_KEY,
  advance,
  flashMs,
  gameKinds,
  gates,
  planToday,
  stepSub,
  subAllowed,
  type Stage4Kv,
  type SubKv,
} from '../src/lessons/math/stage4'
import { LAYOUTS, levelNums, spots, subOptions, subRound } from '../src/lessons/math/sub-plan'
import { DIE_FACES, PATH_END, rollDie, stepOnce, stepsFor } from '../src/lessons/math/path-plan'
import { WARM_PLAYS, WARM_PLAYS4 } from '../src/lessons/math/warmup'
import '../src/content/lines'
import { hasLine } from '../src/content/registry'

const day = (i: number) => new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10)
const tsOf = (i: number) => Date.UTC(2026, 11, 1 + i)
let seq = 0
/** 一筆作答（預設：三選一、自己答、第一次就對） */
function at(o: { skill: string; d: number; ok?: boolean; options?: number; phase?: 'quiz' | 'guided'; heard?: boolean; led?: boolean; level?: number }): Attempt {
  seq++
  const n = o.skill.split(':')[1]
  return {
    id: `a${seq}`,
    ts: tsOf(o.d) + seq,
    date: day(o.d),
    sessionId: 's',
    station: 'math',
    game: 'm',
    itemId: n,
    skill: o.skill,
    phase: o.phase ?? 'quiz',
    level: o.level ?? 1,
    options: ['1', '2', '3', '4'].slice(0, o.options ?? 3),
    answer: n,
    taps: [],
    firstTryCorrect: o.ok ?? true,
    attempts: 1,
    responseMs: 1500,
    hintUsed: false,
    ...(o.heard === undefined ? {} : { heard: o.heard }),
    ...(o.led ? { metrics: { led: 1 } } : {}),
    synced: 0,
  }
}

/** 一組技能（例：count:1～5）的 10 題，分在 days 天（從 d0 開始；前 9 題在前 days-1 天，最後一題再隔 2 天：記得住），前 wrong 題答錯 */
function ten(prefix: string, k: number, d0: number, o: { days?: number; wrong?: number; options?: number; heard?: boolean; led?: boolean; n?: number } = {}) {
  const days = o.days ?? 3
  return Array.from({ length: o.n ?? 10 }, (_, i) =>
    at({ skill: `${prefix}:${(i % k) + 1}`, d: d0 + (i < 9 ? Math.min(days - 2, Math.floor((i * (days - 1)) / 9)) : days), ok: i >= (o.wrong ?? 0), options: o.options, heard: o.heard, led: o.led }),
  )
}

const firm = () => ten('count', 5, 0)
const nums = () => ten('num', 5, 0)
const subs = (d0 = 10, o: Parameters<typeof ten>[3] = {}) => ten('sub', 3, d0, o)
const go = (kv: Stage4Kv, xs: Attempt[], d: number, o: { paused?: boolean; firm?: boolean } = {}) => advance(kv, xs, day(d), { ...o, now: tsOf(d) + 999_999 })

function main() {
  // 1. 門檻差一點都不開（一眼看出 1～3 看 countReady）
  {
    assert.deepEqual(go({}, [], 20), {}, '沒有作答：kv 不變')
    const kv0 = {}
    assert.equal(go(kv0, [], 20), kv0, '沒變就是同一個物件（不寫資料庫）')
    for (const [why, xs] of [
      ['只有 9 題', ten('count', 5, 0, { n: 9 })],
      ['10 題對 7 題', ten('count', 5, 0, { wrong: 3 })],
      ['只分在 2 天', ten('count', 5, 0, { days: 2 })],
      ['2 選 1', ten('count', 5, 0, { options: 2 })],
      ['沒聽完就點', ten('count', 5, 0, { heard: false })],
      ['4、5 沒答對過', ten('count', 3, 0)],
    ] as const)
      assert.equal(go({}, [...xs], 20)['math-sub'], undefined, why)
    // 手帶著做的（guided）：countReady 只算 quiz
    assert.equal(go({}, ten('count', 5, 0).map((a) => ({ ...a, phase: 'guided' as const })), 20)['math-sub'], undefined, '手帶著做的')
    const kv = go({}, firm(), 20)
    assert.equal(kv['math-sub']?.opened, day(20))
    assert.equal(kv.sub?.level, 1, '剛開從第 1 級（2 選 1）')
    assert.equal(go({}, [], 20, { firm: true })['math-sub']?.opened, day(20), 'plan.ts 記著 1～5 熟練過了也算')
    assert.equal(go({}, [], 20, { firm: true }).firm, true, '熟練過了記進 kv')
    console.log('ok 1 一眼看出 1～3：1～5 熟練才開（差 1 題、差 1 天、2 選 1、沒聽完、手帶著、少一個數字都不開）')
  }

  // 2. 一天最多開一道門；照順序
  {
    const xs = [...firm(), ...nums()]
    const a = go({}, xs, 20)
    assert.ok(a['math-sub'] && !a['math-path'], '同一天只開一眼看出')
    const b = go(a, xs, 21)
    assert.equal(b['math-path']?.opened, day(21), '隔天開數字小路')
    assert.equal(go(a, xs, 20), a, '同一天再進來不再開')
    // 數字小路：找數字差一點不開
    assert.equal(go(a, [...firm(), ...ten('num', 5, 0, { wrong: 3 })], 21)['math-path'], undefined, '找數字 10 題對 7 題')
    assert.equal(go(a, [...firm(), ...ten('num', 4, 0)], 21)['math-path'], undefined, '找數字 5 沒答對過')
    console.log('ok 2 一天最多開一道門，先開一眼看出，數字小路要找數字 1～5 熟練')
  }

  // 3. 一眼看出 4～5：前一天以前開了 1～3，sub:1～3 熟練；開了直接第 3 級
  {
    const a = go({}, firm(), 9)
    assert.equal(go(a, [...firm(), ...subs(10)], 9)['math-sub45'], undefined, '跟 1～3 同一天不開')
    assert.equal(go(a, [...firm(), ...subs(10, { options: 2 })], 20)['math-sub45'], undefined, '2 選 1 的不算')
    assert.equal(go(a, [...firm(), ...subs(10, { wrong: 3 })], 20)['math-sub45'], undefined, '10 題對 7 題')
    const b = go(a, [...firm(), ...subs(10)], 20)
    assert.equal(b['math-sub45']?.opened, day(20))
    assert.equal(b.sub?.level, 3, '4～5 開了換到第 3 級')
    console.log('ok 3 一眼看出 4～5：1～3 開了隔天以後、sub:1～3 熟練才開，開了出 4～5')
  }

  // 4. 開了不關，答不好退一級；答穩升回去
  {
    const open: Stage4Kv = { 'math-sub': { opened: day(0) }, 'math-sub45': { opened: day(1) }, sub: { level: 3, since: tsOf(2) } }
    const bad = Array.from({ length: 6 }, (_, i) => at({ skill: 'sub:4', d: 3 + i, ok: i < 3 }))
    const a = go(open, bad, 10)
    assert.ok(a['math-sub'] && a['math-sub45'], '全錯門也不關')
    assert.equal(a.sub?.level, 2, '最近 6 題對 3 題：退回 1～3')
    // 退了以後的作答才算：再 5 題對 4 題升回去
    const good = Array.from({ length: 5 }, (_, i) => at({ skill: 'sub:2', d: 11 + i, ok: i > 0 }))
    const b = go(a, [...bad, ...good], 20)
    assert.equal(b.sub?.level, 3, '答穩升回 4～5')
    // 沒開 4～5：最多到第 2 級
    const s: SubKv = { level: 2, since: 0 }
    assert.equal(stepSub(s, good, 2, 1).level, 2, '4～5 沒開不會升到第 3 級')
    assert.equal(stepSub({ level: 1, since: 0 }, good, 2, 1).level, 2, '第 1 級答穩升到 3 選 1')
    assert.equal(stepSub({ level: 1, since: 0 }, bad, 2, 1).level, 1, '第 1 級不會再退')
    // 沒聽完、手帶著的不算進升降
    const guessed = bad.map((x) => ({ ...x, heard: false }))
    assert.equal(stepSub({ level: 3, since: 0 }, guessed, 3, 1).level, 3, '沒聽完就點的不算')
    console.log('ok 4 開了不關；最近 6 題對 ≤ 3 題退一級、最近 5 題對 ≥ 4 題升一級')
  }

  // 5. 暫停：門不開、照 3 歲的上；開了的門記著
  {
    const xs = [...firm(), ...nums()]
    const kv0 = {}
    assert.equal(go(kv0, xs, 20, { paused: true }), kv0, '暫停中不開門')
    const open: Stage4Kv = { 'math-sub': { opened: day(0) }, 'math-path': { opened: day(1) }, sub: { level: 2, since: 0 } }
    assert.deepEqual(planToday(open, xs, day(30), true), NO_STAGE4, '暫停中照 3 歲的上')
    assert.ok(go(open, xs, 30, { paused: true })['math-path'], '暫停中開了的門記著')
    assert.equal(PAUSE_KEY, 'stage4.paused.math')
    assert.equal(STAGE4_KEY, 'lesson.math.stage4')
    console.log('ok 5 暫停：不開門、這一堂沒有 4 歲內容、開了的門記著；kv 名稱跟家長區約定的一樣')
  }

  // 6. 怎麼混著出：頭 14 天開場是數字小路就不出一眼看出；第一次出一眼看出先示範
  {
    const kv: Stage4Kv = { 'math-sub': { opened: day(0) }, 'math-path': { opened: day(0) }, sub: { level: 2, since: 0 } }
    const fresh = planToday(kv, [], day(13))
    assert.equal(fresh.fresh, true)
    assert.equal(subAllowed(fresh, 'path'), false, '剛開：數字小路那天不出一眼看出')
    assert.equal(subAllowed(fresh, 'hop'), true)
    assert.equal(fresh.sub?.demo, true, '第一次先示範')
    const later = planToday(kv, [], day(14))
    assert.equal(later.fresh, false)
    assert.equal(subAllowed(later, 'path'), true, '14 天以後可以兩個都有（一堂最多一半）')
    assert.equal(planToday({ ...kv, sub: { level: 2, since: 0, demoed: true } }, [], day(14)).sub?.demo, false)
    assert.equal(planToday({}, [], day(1)).sub, null)
    assert.equal(planToday({}, [], day(1)).path, false)
    // 小遊戲：一堂 2 題，一眼看出最多 1 題；三組輪流，連續兩天不一樣
    for (const set of GAME_SET_IDS) {
      const k = gameKinds(true, set)
      assert.equal(k.length, 2)
      assert.ok(k.filter((x) => x === 'sub').length <= 1)
    }
    assert.deepEqual(gameKinds(true, null), ['compare', 'find'], '門沒開：照舊船、氣球')
    assert.deepEqual(gameKinds(false, null), ['compare'])
    let st: VarietyState = {}
    let prev = ''
    for (let i = 0; i < 40; i++) {
      const r = chooseVariety(st, 'math.game', GAME_SET_IDS, day(i))
      assert.notEqual(r.kind, prev, '連續兩天不一樣')
      prev = r.kind
      st = r.state
    }
    assert.deepEqual(Object.keys(GAME_SETS).sort(), ['boat+balloon', 'boat+dots', 'dots+balloon'])
    console.log('ok 6 頭 14 天一堂最多 1 個 4 歲回合；第一題先示範；小遊戲三種輪兩種、連續兩天不一樣')
  }

  // 7. 開場：數字小路門開了才輪得到，每 2 天最多 1 次
  {
    assert.ok(!(WARM_PLAYS as readonly string[]).includes('path'), '門沒開的三種裡沒有數字小路')
    let st: VarietyState = {}
    let last = -9
    let n = 0
    for (let i = 0; i < 200; i++) {
      const r = chooseVariety(st, 'math.warm', WARM_PLAYS4, day(i))
      st = r.state
      if (r.kind === 'path') {
        assert.ok(i - last >= 2, `第 ${i} 天：數字小路隔不到 2 天`)
        last = i
        n++
      }
    }
    assert.ok(n >= 40, `200 天裡有輪到數字小路（${n} 次）`)
    console.log('ok 7 開場數字小路：門開了才輪得到、不會連兩天')
  }

  // 8. 一眼看出的排法、選項
  {
    assert.deepEqual(levelNums(1), [1, 3])
    for (let i = 0; i < 300; i++) {
      for (const level of [1, 2, 3] as const) {
        const r = subRound(level, ['a', 'b', 'c'])
        const ns = r.cards.map((c) => c.n)
        assert.equal(new Set(ns).size, ns.length, '選項不重複')
        assert.ok(ns.includes(r.n), '選項裡有答案')
        assert.equal(ns.length, level === 1 ? 2 : 3)
        if (level === 1) assert.ok(Math.abs(ns[0] - ns[1]) >= 2, '2 選 1 時差 2 以上')
        if (level < 3) assert.ok(ns.every((x) => x <= 3), '1～3')
        for (const c of [...r.cards, { n: r.n, layout: r.layout }]) {
          if (c.n >= 4) assert.ok(['dice', 'frame'].includes(c.layout), '4～5 只用骰子點和五格框')
          assert.ok(LAYOUTS[c.n].includes(c.layout))
        }
        const ans = r.cards.find((c) => c.n === r.n)!
        if (LAYOUTS[r.n].length > 1) assert.notEqual(ans.layout, r.layout, '答案那張換一種排法')
        assert.equal(new Set(r.cards.map((c) => c.icon)).size, r.cards.length, '每張卡一種東西')
      }
    }
    // 位置在框裡、不重疊（點的大小 17%）
    for (const [n, ls] of Object.entries(LAYOUTS))
      for (const l of ls) {
        const ps = spots(Number(n), l)
        assert.equal(ps.length, Number(n))
        for (const p of ps) assert.ok(p.x >= 8 && p.x <= 92 && p.y >= 8 && p.y <= 92, `${n}-${l} 在框裡`)
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) >= 18, `${n}-${l} 不重疊`)
      }
    assert.deepEqual(subOptions(2, 2), [1, 2, 3])
    for (let i = 0; i < 100; i++) {
      const o = subOptions(4, 3)
      assert.ok(o.some((x) => Math.abs(x - 4) >= 2), '第 3 級有一個差很多的')
    }
    // 閃的時間不短於 1.5 秒；第 1 級、剛換級 3 秒
    assert.equal(flashMs({ level: 1, since: 0 }, []), 3000)
    assert.equal(flashMs({ level: 2, since: 0 }, []), 3000, '剛換到這一級')
    const three = Array.from({ length: 3 }, (_, i) => at({ skill: 'sub:2', d: i }))
    assert.equal(flashMs({ level: 2, since: 0 }, three), 2000)
    assert.ok(flashMs({ level: 3, since: 0 }, three) >= FLASH_MIN)
    console.log('ok 8 一眼看出：選項不重複、2 選 1 差 ≥ 2、4～5 只用骰子點和五格框、答案換排法、不重疊、閃 2～3 秒')
  }

  // 9. 數字小路：骰子只有 1～2；不會走超過；一局一定走得到 10
  {
    assert.deepEqual([...DIE_FACES], [1, 2])
    for (let i = 0; i < 500; i++) assert.ok([1, 2].includes(rollDie()))
    assert.equal(rollDie(() => 0), 1)
    assert.equal(rollDie(() => 0.999), 2)
    assert.equal(stepsFor(9, 2), 1, '在 9 擲到 2 只走 1 格')
    assert.equal(stepsFor(10, 1), 0)
    assert.deepEqual(stepOnce(3, 0), { pos: 3, left: 0, moved: false }, '沒有步數點小恐龍不走')
    let maxRolls = 0
    for (let g = 0; g < 1000; g++) {
      let pos = 0
      let rolls = 0
      while (pos < PATH_END && rolls < 50) {
        let left = stepsFor(pos, rollDie())
        rolls++
        // 連點：步數走完以後多點的都不算
        for (let t = 0; t < 5; t++) {
          const s = stepOnce(pos, left)
          pos = s.pos
          left = s.left
        }
        assert.ok(pos <= PATH_END)
      }
      assert.equal(pos, PATH_END, '一局一定走得到 10')
      maxRolls = Math.max(maxRolls, rolls)
    }
    assert.ok(maxRolls <= 10, `最多擲 ${maxRolls} 次`)
    console.log('ok 9 數字小路：骰子 1～2、不會走超過 10、一局一定走得到 10（最多擲 10 次）')
  }

  // 10. 家長區看的門（三科同一個形狀）
  {
    const g0 = gates([], {}, day(1))
    assert.deepEqual(
      g0.map((g) => g.id),
      [...GATE_IDS],
    )
    for (const g of g0) {
      assert.equal(g.open, false)
      assert.ok(g.need.length > 0, `${g.id} 寫還差什麼`)
    }
    const kv: Stage4Kv = { 'math-sub': { opened: day(0) }, 'math-sub45': { opened: day(3) }, sub: { level: 2, since: 0 } }
    const g1 = gates([], kv, day(5))
    assert.equal(g1[0].open, true)
    assert.equal(g1[0].openedOn, day(0))
    assert.equal(g1[0].level, 2)
    assert.match(g1[1].need, /先回到 1～3/, '退一級時寫現在的狀況')
    assert.equal(g1[2].open, false)
    assert.doesNotThrow(() => gates([], null as unknown as Stage4Kv, day(1)), 'kv 壞掉也不會壞')
    console.log('ok 10 家長區：三道門、沒開的寫還差什麼、開了的寫哪天開和目前級數')
  }

  // 11. 台詞都有
  {
    for (const k of ['ma.sub.peek', 'ma.sub.ask', 'ma.sub.again', 'ma.path.go', 'ma.path.roll', 'ma.path.walk', 'ma.path.done']) assert.ok(hasLine(k), k)
    for (let n = 1; n <= 10; n++) assert.ok(hasLine(`m.num.${n}`), `m.num.${n}`)
    console.log('ok 11 新台詞都有（一眼看出 3 句、數字小路 4 句；數字沿用 m.num.N）')
  }

  console.log('ALL PASS')
}

main()
