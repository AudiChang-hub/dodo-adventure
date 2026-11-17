// 豆豆收拾的 4 歲玩法（logic/sort-switch.ts）和蹺蹺板比輕重（games/seesaw）的單元測試（家長 2026-11-17）。
// 執行：npx tsx scripts/test-sort-seesaw.ts（npm run verify 的「單元：豆豆收拾換規則、蹺蹺板」）
// 驗收：
//   豆豆收拾：第 6 級同一堆東西換規則前後都分得對、換規則以後第一個是衝突的、牌子只給一個特徵的線索；第 7 級 4 個籃子要兩個特徵都對；
//            組合 ≥ 300、同一天不重複；原本的 1～5 級沒變（最高級仍是 5，第 5 級熟練了才升到 6）；進度讀寫留著今天用過的組合。
//   蹺蹺板：東西 ≥ 40、圖示都在、每一級的題目 300 局都對（重的那一邊、大小線索、排輕重的答案）、同一天不重複、升降級。
//   台詞都有、每句 ≤ 6 個字、音檔都在；家長區的名稱。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { EMOJI } from '../src/art/emoji.generated'
import { COLOR_IDS, LEVEL_START, MASTER_OF, SHAPE_IDS, SORT_MAX, TOY_IDS, stepLevel, type SortRound, type Thing } from '../src/games/logic/sort-plan'
import { COLOR_PAIRS, SKILL_BOTH, SKILL_SWITCH, SORT_TOP, SWITCH_AT, SWITCH_LINE, TOY_PAIRS, bothKey, byKey, comboCount, noteMix, nowKey, sortRoundX, todaySigs } from '../src/games/logic/sort-switch'
import { normalize } from '../src/games/logic/progress'
import { PATTERN_MAX } from '../src/games/logic/pattern-plan'
import { sortCoplay } from '../src/games/logic/coplay'
import { LOGIC_GAME_NAME, LOGIC_SKILLS } from '../src/games/logic/report'
import { SWITCH_PRAISE, goesKey, sortPraiseKey, sortSceneKey, thatKey, thisKey } from '../src/games/logic/lines'
import { ITEM, ITEMS } from '../src/games/seesaw/data'
import { SEESAW_EMOJI } from '../src/games/seesaw/emoji.generated'
import {
  ORDER_QS,
  PAIR_QS,
  POOL_TRICK,
  SEESAW_MAX,
  SEESAW_START,
  TRICK_BIG,
  TRICK_SMALL,
  afterSeesaw,
  heavyOf,
  isOrderLevel,
  normalizeSeesaw,
  poolSizes,
  seesawRound,
  seesawSkill,
  type OrderQ,
  type PairQ,
  type SeesawLevel,
  type SeesawMemory,
} from '../src/games/seesaw/plan'
import { seesawCoplay } from '../src/games/seesaw/coplay'
import { heavyKey } from '../src/games/seesaw/lines'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'

function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}
const words = (t: string) => t.replace(/[.!?,|]/g, ' ').split(/\s+/).filter(Boolean).length
/** 東西的兩個特徵：顏色、形狀／東西 */
const featOf = (t: Thing) => (t.t === 'toy' ? { c: t.color, v: t.toy } : t.t === 'shape' ? { c: t.color!, v: t.shape } : null)
const key = (t: Thing) => JSON.stringify(t)

function main() {
  const keys = new Set<string>()

  // ── 1. 豆豆收拾第 6 級：換規則 ──
  {
    let flips = 0
    const fams = new Set<string>()
    for (const flip of [false, true]) {
      for (let k = 0; k < 300; k++) {
        const r = sortRoundX(6, seeded(6000 + k + (flip ? 500 : 0)), { flip })
        assert.equal(r.level, 6)
        assert.ok(r.then, '第 6 級有換規則以後的那一半')
        const t = r.then!
        assert.equal(r.items.length, SWITCH_AT)
        assert.equal(t.items.length, SWITCH_AT)
        assert.equal(r.baskets.length, 2)
        assert.equal(t.baskets.length, 2)
        assert.equal(t.skill, SKILL_SWITCH, '換規則以後記 sort:switch')
        assert.equal(r.skill, `sort:${r.dim}`)
        assert.notEqual(r.dim, t.dim, '換了規則')
        assert.ok(r.dim === 'color' || t.dim === 'color', '一邊一定是顏色')
        if (!flip) assert.equal(r.dim, 'color', '還沒示範過：一定先照顏色')
        if (r.dim !== 'color') flips++
        fams.add(featOf(r.items[0].thing)?.v ?? '')
        // 同一堆東西：換規則前後是同樣的 4 個，都不重複
        const a = r.items.map((x) => key(x.thing)).sort()
        const b = t.items.map((x) => key(x.thing)).sort()
        assert.deepEqual(a, b, '換規則以後分的是同一堆東西')
        assert.equal(new Set(a).size, 4, '同一局沒有重複的東西')
        for (const [half, dim] of [
          [r, r.dim],
          [t, t.dim],
        ] as const) {
          const ids = half.baskets.map((x) => x.id)
          assert.equal(new Set(ids).size, 2)
          for (const id of ids) assert.equal(half.items.filter((x) => x.answer === id).length, 2, '每個籃子各 2 個')
          const ans = half.items.map((x) => x.answer)
          assert.ok(!ans.some((x, i) => i >= 2 && x === ans[i - 1] && x === ans[i - 2]), '同一個籃子不連 3 次')
          for (const it of half.items) {
            const f = featOf(it.thing)!
            assert.equal(it.answer, dim === 'color' ? f.c : f.v, `${it.id} 照 ${dim} 分`)
          }
          // 牌子只給這一半要看的特徵：顏色是一團顏料；形狀、東西只有線條、不上色
          for (const bk of half.baskets) {
            if (dim === 'color') assert.ok(bk.sample.t === 'swatch' && bk.sample.color === bk.id)
            else if (bk.sample.t === 'shape') assert.ok(!bk.sample.color && bk.sample.shape === bk.id, '形狀的牌子不上色')
            else assert.ok(bk.sample.t === 'outline' && bk.sample.toy === bk.id, '東西的牌子只有線條')
            keys.add(goesKey(bk.id)).add(thatKey(bk.id)).add(thisKey(bk.id))
          }
          keys.add(sortPraiseKey(dim))
        }
        // 兩個籃子的位置不變：第 k 個籃子換規則前後收同一個「樣子」（紅色↔圓形）
        const conflicts = r.items.filter((it) => {
          const f = featOf(it.thing)!
          const before = r.baskets.findIndex((x) => x.id === (r.dim === 'color' ? f.c : f.v))
          const after = t.baskets.findIndex((x) => x.id === (t.dim === 'color' ? f.c : f.v))
          return before !== after
        })
        assert.equal(conflicts.length, 2, '4 個裡有 2 個換規則以後要放到另一邊（衝突）')
        const f0 = featOf(t.items[0].thing)!
        const b0 = r.baskets.findIndex((x) => x.id === (r.dim === 'color' ? f0.c : f0.v))
        assert.notEqual(b0, t.baskets.findIndex((x) => x.id === t.items[0].answer), '換規則以後第一個一定是衝突的')
        keys.add(sortSceneKey(r.scene)).add(r.intro!).add(nowKey(t.dim)).add(SWITCH_LINE).add(SWITCH_PRAISE)
        assert.equal(r.intro, byKey(r.dim))
      }
    }
    assert.ok(flips > 50 && flips < 160, `示範過了約 1/3 先照形狀（東西）再換顏色：${flips}`)
    assert.ok(fams.size >= 12, `東西的樣子夠多：${fams.size}`)
    console.log(`ok 1 豆豆收拾第 6 級（換規則）：600 局，同一堆東西前後都分得對、每局 2 個衝突、換完第一個是衝突的、牌子只給一個特徵；先形狀再顏色 ${flips} 局`)
  }

  // ── 2. 豆豆收拾第 7 級：兩個一起看 ──
  {
    for (let k = 0; k < 300; k++) {
      const r = sortRoundX(7, seeded(7000 + k))
      assert.equal(r.level, 7)
      assert.equal(r.skill, SKILL_BOTH)
      assert.equal(r.dim, 'both')
      assert.equal(r.baskets.length, 4, '4 個籃子（LOAD-1 最多 4 個選項）')
      assert.equal(r.items.length, 4)
      assert.equal(new Set(r.items.map((x) => key(x.thing))).size, 4, '同一局沒有重複的東西')
      const feats = r.baskets.map((b) => featOf(b.sample)!)
      assert.equal(new Set(feats.map((f) => `${f.c}-${f.v}`)).size, 4, '4 個籃子是 2 個顏色 × 2 種形狀')
      assert.equal(new Set(feats.map((f) => f.c)).size, 2)
      assert.equal(new Set(feats.map((f) => f.v)).size, 2)
      for (const it of r.items) {
        const f = featOf(it.thing)!
        assert.equal(it.answer, `${f.c}-${f.v}`)
        assert.equal(r.baskets.filter((b) => b.id === it.answer).length, 1, '答案只有一個籃子')
        // 只看一個特徵的話有兩個籃子可以放：一定要兩個都看
        assert.equal(feats.filter((g) => g.c === f.c).length, 2)
        assert.equal(feats.filter((g) => g.v === f.v).length, 2)
      }
      for (const b of r.baskets) keys.add(goesKey(b.id)).add(thatKey(b.id)).add(thisKey(b.id))
      keys.add(r.intro!).add(sortPraiseKey('both')).add(sortSceneKey(r.scene))
      assert.equal(r.intro, bothKey(r.items[0].thing.t === 'toy' ? 'thing' : 'shape'))
    }
    console.log('ok 2 豆豆收拾第 7 級（兩個一起看）：300 局，4 個籃子是 2 色 × 2 形、每個東西只看一個特徵會有兩個籃子、答案只有一個')
  }

  // ── 3. 內容量、同一天不重複、原本的玩法沒變、進度 ──
  {
    const n = comboCount()
    assert.ok(n >= 300, `組合 ≥ 300：${n}`)
    for (const [a, b] of TOY_PAIRS) assert.ok(!['cup+bowl', 'bowl+plate', 'ball+balloon'].includes([a, b].join('+')) && !['bowl+cup', 'plate+bowl', 'balloon+ball'].includes([a, b].join('+')), `${a}、${b} 長得太像`)
    for (const lv of [6, 7] as const) {
      let mix = noteMix(undefined, '2026-11-17', 'x')
      mix = { date: '2026-11-17', sigs: [] }
      const sigs: string[] = []
      for (let k = 0; k < 60; k++) {
        const r = sortRoundX(lv, seeded(lv * 31 + k), { avoid: todaySigs(mix, '2026-11-17') })
        assert.ok(!sigs.includes(r.sig!), `同一天不重複：${r.sig}`)
        sigs.push(r.sig!)
        mix = noteMix(mix, '2026-11-17', r.sig!)
      }
      assert.deepEqual(todaySigs(mix, '2026-11-18'), [], '換日就清掉')
    }
    // 原本的玩法：最高級仍是 5、第 5 級熟練了才升到第 6 級
    assert.equal(SORT_MAX, 5, '原本的玩法到第 5 級')
    assert.equal(SORT_TOP, 7)
    let s = { ...LEVEL_START, level: 5 }
    for (let d = 0; d < MASTER_OF; d++) s = stepLevel(s, { date: `2026-11-${10 + (d % 3)}`, first: true, counted: true }, SORT_TOP)
    assert.equal(s.level, 6, '第 5 級熟練了升到第 6 級')
    let s4 = { ...LEVEL_START, level: 5 }
    for (let d = 0; d < MASTER_OF; d++) s4 = stepLevel(s4, { date: `2026-11-${10 + (d % 3)}`, first: true, counted: true }, SORT_MAX)
    assert.equal(s4.level, 5, '照原本的上限不會超過 5')
    let back = { ...LEVEL_START, level: 6 }
    for (let d = 0; d < 6; d++) back = stepLevel(back, { date: '2026-11-17', first: d < 2, counted: true }, SORT_TOP)
    assert.equal(back.level, 5, '第 6 級答不好退回第 5 級')
    // 進度：第 6、7 級讀得回來（不會被夾回 5），今天用過的組合留著
    const p = normalize({ sort: { level: 7, recent: [], taught: [6] }, mix: { date: '2026-11-17', sigs: ['6:thing:a', 3] } }, { sort: SORT_TOP, pattern: PATTERN_MAX })
    assert.equal(p.sort.level, 7)
    assert.deepEqual(p.mix, { date: '2026-11-17', sigs: ['6:thing:a'] })
    assert.equal(normalize({ sort: { level: 7 } }, { sort: SORT_TOP, pattern: PATTERN_MAX }).mix, undefined, '舊進度沒有 mix')
    // 陪玩小字
    for (const d of ['thing', 'both'] as const) assert.ok(sortCoplay('toys', d).play, `陪玩小字：${d}`)
    assert.ok(sortCoplay('toys', 'color', true).play.includes('換規則'))
    assert.ok(COLOR_IDS.length * SHAPE_IDS.length + COLOR_IDS.length * TOY_IDS.length >= 60)
    console.log(`ok 3 豆豆收拾 4 歲玩法：組合 ${n} 種（形狀 ${SHAPE_IDS.length}×2 樣子、東西兩兩一組 ${TOY_PAIRS.length} 組，× 顏色兩兩 ${COLOR_PAIRS.length}）、同一天 60 局不重複；原本最高第 5 級，熟練了升到 6、答不好退回 5；進度留著`)
  }

  // ── 4. 蹺蹺板：東西 ──
  {
    assert.ok(ITEMS.length >= 40, `東西 ≥ 40：${ITEMS.length}`)
    assert.equal(new Set(ITEMS.map((x) => x.id)).size, ITEMS.length, '不重複')
    assert.equal(new Set(ITEMS.map((x) => x.en)).size, ITEMS.length, '英文名字不重複')
    for (const x of ITEMS) {
      assert.ok(EMOJI[x.id] || SEESAW_EMOJI[x.id], `${x.id} 的圖示`)
      assert.ok(x.w >= 1 && x.w <= 9 && x.size >= 1 && x.size <= 5, x.id)
      assert.ok(!(x.big && x.small), x.id)
      if (x.big) assert.ok(x.w <= 3, `${x.id} 大而輕`)
      if (x.small) assert.ok(x.w >= 4, `${x.id} 小而重`)
    }
    assert.ok(ITEMS.filter((x) => x.big).length >= 5 && ITEMS.filter((x) => x.small).length >= 5, '大而輕、小而重各 ≥ 5 種')
    const ps = poolSizes()
    for (const [lv, n] of Object.entries(ps)) assert.ok(n >= 30, `第 ${lv} 級題目 ≥ 30：${n}`)
    console.log(`ok 4 蹺蹺板：東西 ${ITEMS.length} 種（大而輕 ${ITEMS.filter((x) => x.big).length}、小而重 ${ITEMS.filter((x) => x.small).length}），題目 1 級 ${ps[1]}、2 級 ${ps[2]}、3 級 ${ps[3]}、4 級大而輕對小而重 ${ps[4]}、5 級 ${ps[5]}`)
  }

  // ── 5. 蹺蹺板：每一級 300 局 ──
  {
    for (let lv = 1; lv <= SEESAW_MAX; lv++) {
      const level = lv as SeesawLevel
      const mem: SeesawMemory = { date: '2026-11-17', used: [], recent: [] }
      const rnd = seeded(lv * 77)
      const seen = new Set<string>()
      let repeats = 0
      let tricks = 0
      for (let r = 0; r < 300; r++) {
        const before = new Set(mem.used)
        const qs = seesawRound(level, mem, rnd, r === 0)
        assert.equal(qs.length, isOrderLevel(level) ? ORDER_QS : PAIR_QS)
        const ids = qs.flatMap((q) => (q.kind === 'pair' ? [q.left.id, q.right.id] : q.items.map((x) => x.id)))
        assert.equal(new Set(ids).size, ids.length, '同一局同一樣東西不出現兩次')
        for (const q of qs) {
          assert.equal(q.level, level)
          if (before.has(q.sig)) repeats++
          seen.add(q.sig)
          if (q.kind === 'pair') {
            assert.ok(!isOrderLevel(level))
            const p = q as PairQ
            const h = ITEM[heavyOf(p)]
            const l = ITEM[p.heavy === 'left' ? p.right.id : p.left.id]
            assert.ok(h.w - l.w >= 2, `重的明顯比較重：${l.id} ${h.id}`)
            const hs = p.heavy === 'left' ? p.left.size : p.right.size
            const ls = p.heavy === 'left' ? p.right.size : p.left.size
            if (p.trick) {
              tricks++
              assert.equal(level, 4, '只有 4 級有大而輕對小而重')
              assert.ok(l.big && h.small && ls === TRICK_BIG && hs === TRICK_SMALL, '輕的畫最大、重的畫最小')
            } else if (level === 1) assert.ok(h.w - l.w >= 4 && hs > ls, '1 級差很多、重的比較大')
            else assert.ok(h.w - l.w <= 3 && hs >= ls, '一般題：差 2～3 級、重的不比輕的小')
            keys.add(heavyKey(h.id))
          } else {
            const o = q as OrderQ
            assert.ok(isOrderLevel(level))
            const ws = o.answer.map((id) => ITEM[id].w)
            assert.ok(ws[1] - ws[0] >= 2 && ws[2] - ws[1] >= 2, '從輕到重，每兩個差 ≥ 2 級')
            assert.deepEqual([...o.items.map((x) => x.id)].sort(), [...o.answer].sort())
            assert.notDeepEqual(
              o.items.map((x) => x.id),
              o.answer,
              '桌上的順序不是排好的',
            )
            const size = (id: string) => o.items.find((x) => x.id === id)!.size
            if (level === 3) assert.ok(size(o.answer[0]) < size(o.answer[1]) && size(o.answer[1]) < size(o.answer[2]), '3 級越重越大')
            else assert.ok(size(o.answer[0]) === TRICK_BIG || size(o.answer[2]) === TRICK_SMALL, '5 級有大而輕或小而重：照大小排會錯')
          }
        }
        if (level === 4) {
          assert.equal(qs.filter((q) => q.trick).length, 2, '4 級一局 2 題大而輕、2 題一般的')
          if (r === 0) assert.ok(qs[0].trick, '4 級第一次示範的那一題是大而輕對小而重')
        }
        if (!isOrderLevel(level)) {
          const sd = (qs as PairQ[]).map((q) => q.heavy)
          assert.ok(!sd.some((x, i) => i >= 2 && x === sd[i - 1] && x === sd[i - 2]), '重的同一邊不連 3 次')
          assert.ok(sd.includes('left') && sd.includes('right'))
        }
      }
      // 同一天不重複：題庫夠大的級，300 局（1200 題）裡重複的只在題庫用完之後
      const pool = poolSizes()[lv as 1]
      const asked = 300 * (isOrderLevel(level) ? ORDER_QS : PAIR_QS) * (level === 4 ? 0.5 : 1)
      if (asked <= pool) assert.equal(repeats, 0, `第 ${lv} 級同一天不重複`)
      if (level === 4) assert.ok(tricks === 600 && seen.size >= POOL_TRICK.length, '大而輕對小而重都出過')
      // 前 10 局一定不重複（一天玩不到這麼多局）
      const m2: SeesawMemory = { date: '', used: [], recent: [] }
      const sigs = Array.from({ length: 10 }, (_, k) => seesawRound(level, m2, seeded(lv * 13 + k)).map((q) => q.sig)).flat()
      assert.equal(new Set(sigs).size, sigs.length, `第 ${lv} 級一天 10 局不重複`)
    }
    console.log('ok 5 蹺蹺板每一級 300 局：重的明顯比較重、1 級重的也比較大、4 級一局 2 題大而輕對小而重、排輕重答案對、5 級照大小排會錯；重的同一邊不連 3 次；一天 10 局不重複')
  }

  // ── 6. 蹺蹺板：升降級、進度 ──
  {
    let s = { ...SEESAW_START }
    s = afterSeesaw(s, { counted: 4, misses: 0 })
    assert.equal(s.streak, 1)
    s = afterSeesaw(s, { counted: 4, misses: 0 })
    assert.equal(s.level, 2, '連續 2 局全對升級')
    s = afterSeesaw(s, { counted: 2, misses: 0 })
    assert.equal(s.streak, 0, '自己答的太少（示範、一起做）不算')
    s = afterSeesaw({ ...s, level: 3 }, { counted: 2, misses: 0 })
    assert.equal(s.streak, 1, '排輕重一局 3 題，自己答 2 題就算')
    s = afterSeesaw({ ...s, level: 3 }, { counted: 3, misses: 2 })
    assert.equal(s.level, 2, '2 題沒有第一次就對退一級')
    assert.equal(afterSeesaw({ ...SEESAW_START }, { counted: 4, misses: 3 }).level, 1, '最少 1 級')
    let top = { ...SEESAW_START, level: SEESAW_MAX }
    for (let i = 0; i < 3; i++) top = afterSeesaw(top, { counted: 3, misses: 0 })
    assert.equal(top.level, SEESAW_MAX)
    const p = normalizeSeesaw({ level: 9, streak: -1, taught: [1, 'x'], date: '2026-11-16', used: ['a'], recent: ['b', 3] }, '2026-11-17')
    assert.equal(p.level, SEESAW_MAX)
    assert.equal(p.streak, 0)
    assert.deepEqual(p.taught, [1])
    assert.deepEqual(p.used, [], '換日了，今天出過的清掉')
    assert.deepEqual(p.recent, ['b'])
    assert.deepEqual(normalizeSeesaw({ date: '2026-11-17', used: ['a'] }, '2026-11-17').used, ['a'], '同一天留著')
    assert.equal(normalizeSeesaw(null, '2026-11-17').level, 1)
    for (let lv = 1; lv <= SEESAW_MAX; lv++) {
      const c = seesawCoplay(lv as SeesawLevel)
      assert.ok(c.play && c.now.startsWith('現在去做：'), `陪玩小字 ${lv}`)
    }
    console.log('ok 6 蹺蹺板升降級：連續 2 局全對升級、一局 2 題沒對退級、最少 1 級最多 5 級；進度壞掉也讀得進來、換日清掉今天出過的')
  }

  // ── 7. 台詞、音檔、家長區 ──
  {
    for (const k of ['ss.intro', 'ss.ask', 'ss.rule', 'ss.trick', 'ss.look', 'ss.little', 'ss.done', 'ss.again', 'ss.order', 'ss.first', 'ss.next', 'ss.last', 'ss.heavier', 'ss.order.done', 'ss.order.all', 'teach.watch.dodo', 'teach.turn.dodo', 'praise.dodo.0'])
      keys.add(k)
    for (const x of ITEMS) keys.add(heavyKey(x.id))
    for (const c of COLOR_IDS) for (const v of [...SHAPE_IDS, ...TOY_IDS]) keys.add(goesKey(`${c}-${v}`)).add(thatKey(`${c}-${v}`)).add(thisKey(`${c}-${v}`))
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    const mine = [...keys].filter((k) => k.startsWith('ss.') || k.startsWith('lg.sort.'))
    for (const k of mine) assert.ok(words(line(k).text) <= 6, `${k} ≤ 6 個字：${line(k).text}`)
    for (const k of mine) assert.ok(!/[一-鿿]/.test(line(k).text), `${k} 只說英文`)
    const files = new Set(mine.flatMap((k) => segments(line(k)).map((s) => clipName(line(k), s))))
    if (existsSync('public/audio')) {
      const miss = [...files].filter((n) => !existsSync(`public/audio/${n}.mp3`))
      assert.deepEqual(miss.slice(0, 5), [], `缺音檔 ${miss.length} 個`)
      console.log(`ok 7 台詞都有（${keys.size} 句，每句 ≤ 6 個字、只說英文），音檔 ${files.size} 個都在`)
    } else console.log(`ok 7 台詞都有（${keys.size} 句，每句 ≤ 6 個字、只說英文）；（跳過）沒有 public/audio，不檢查音檔`)
    assert.equal(LOGIC_GAME_NAME['logic-seesaw'], '蹺蹺板')
    for (let lv = 1; lv <= SEESAW_MAX; lv++) assert.ok(LOGIC_SKILLS.some((s) => s.skill === seesawSkill(lv as SeesawLevel)), `家長區缺 ${seesawSkill(lv as SeesawLevel)}`)
    for (const sk of ['sort:thing', SKILL_SWITCH, SKILL_BOTH]) assert.ok(LOGIC_SKILLS.some((s) => s.skill === sk), `家長區缺 ${sk}`)
    console.log('ok 8 家長區：蹺蹺板的遊戲名和 5 級技能、豆豆收拾的 sort:thing、sort:switch、sort:both')
  }

  console.log('ALL PASS')
}

main()
