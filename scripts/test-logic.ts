// 邏輯遊戲（src/games/logic/，T-152 P3）的單元測試。
// 執行：npx tsx scripts/test-logic.ts（npm run verify 的「單元：邏輯遊戲」）
// 驗收（設計稿第五節）：每一級出 200 局，答案一定在選項裡、選項 2～3 個不重複、規律正確、同一局沒有重複的題；
// 升降級：差 1 題、差 1 天不升；最近 6 題對 ≤ 3 降一級；手帶著的不算熟練；邏輯作答不觸發里程碑貼紙、不叫 lessonDone。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  COLOR_ICONS,
  KIND_ICONS,
  LEVEL_DIM,
  LEVEL_START,
  MASTER_OF,
  SORT_ITEMS,
  SORT_MAX,
  sortRound,
  sortSkill,
  sortThree,
  stepLevel,
  type LevelState,
  type SortLevel,
} from '../src/games/logic/sort-plan'
import { OBJ_IDS, PATTERN_MAX, PATTERN_QS, STRAND, patternRound, type PatLevel } from '../src/games/logic/pattern-plan'
import { normalize } from '../src/games/logic/progress'
import { logicSkillLabel, logicSummary } from '../src/games/logic/report'
import { stickerFor } from '../src/content/stickers'
import '../src/content/lines'
import { hasLine } from '../src/content/registry'
import { goesKey, sortPraiseKey, thatKey, thisKey, wordKey } from '../src/games/logic/lines'

/** 固定的亂數（每個 seed 一串） */
function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

function main() {
  // 1. 豆豆收拾：每一級 200 局
  {
    for (let lv = 1; lv <= SORT_MAX; lv++) {
      for (const three of [false, true]) {
        if (three && lv !== 4) continue
        for (let k = 0; k < 200; k++) {
          const r = sortRound(lv as SortLevel, seeded(lv * 1000 + k + (three ? 500 : 0)), three)
          const ids = r.baskets.map((b) => b.id)
          assert.equal(r.items.length, SORT_ITEMS, '一局 4 個')
          assert.equal(new Set(ids).size, ids.length, '籃子不重複')
          assert.ok(ids.length >= 2 && ids.length <= 3, '籃子 2～3 個（LOAD-1）')
          assert.equal(ids.length, lv === 4 && three ? 3 : 2, '只有第 4 級（形狀）會有 3 個籃子')
          for (const it of r.items) assert.ok(ids.includes(it.answer), `答案在籃子裡：${it.id}`)
          for (const b of ids) assert.ok(r.items.some((it) => it.answer === b), '每個籃子至少收到一個')
          assert.equal(new Set(r.items.map((it) => it.id)).size, r.items.length, `同一局沒有重複的東西：${r.items.map((x) => x.id)}`)
          const ans = r.items.map((x) => x.answer)
          assert.ok(!ans.some((a, i) => i >= 2 && a === ans[i - 1] && a === ans[i - 2]), '同一個籃子不連 3 次')
          assert.equal(r.dim, LEVEL_DIM[lv as SortLevel])
          // 每一級的特徵真的對得上
          for (const it of r.items) {
            const t = it.thing
            if (lv === 1) assert.ok(t.t === 'toy' && t.color === it.answer)
            if (lv === 2) assert.ok(t.t === 'emoji' && COLOR_ICONS[it.answer as 'red']!.includes(t.icon), `${t.t === 'emoji' && t.icon} 是 ${it.answer}`)
            if (lv === 3) assert.ok(t.t === 'emoji' && KIND_ICONS[it.answer as 'food'].slice(1).includes(t.icon), '種類對、樣品不拿來收')
            if (lv === 4) assert.ok(t.t === 'shape' && t.shape === it.answer && !!t.color)
            if (lv === 5) assert.ok(t.t === 'emoji' && (it.answer === 'big' ? (t.scale ?? 1) === 1 : (t.scale ?? 1) < 1))
          }
          // 籃子上的形狀樣品不上色（顏色不是線索）
          if (lv === 4) for (const b of r.baskets) assert.ok(b.sample.t === 'shape' && !b.sample.color)
        }
      }
    }
    // 第 2 級要忽略「是什麼」：同一個籃子會收到不一樣的東西
    const r2 = sortRound(2, seeded(7))
    for (const b of r2.baskets) {
      const things = r2.items.filter((x) => x.answer === b.id).map((x) => (x.thing.t === 'emoji' ? x.thing.icon : ''))
      assert.equal(new Set(things).size, things.length)
    }
    console.log('ok 1 豆豆收拾：每一級 200 局，答案在籃子裡、籃子 2～3 個不重複、每個籃子都有、同一局沒有重複、特徵對得上')
  }

  // 2. 串珠珠：每一級 200 局
  {
    for (let lv = 1; lv <= PATTERN_MAX; lv++) {
      for (let k = 0; k < 200; k++) {
        const qs = patternRound(lv as PatLevel, seeded(lv * 777 + k))
        assert.equal(qs.length, PATTERN_QS, '一局 3 題')
        const pairs = qs.map((q) => [q.seq[0].id, q.seq[1].id].sort().join())
        assert.equal(new Set(pairs).size, pairs.length, '同一局三題用不一樣的組合')
        for (const q of qs) {
          assert.equal(q.seq.length, STRAND)
          assert.notEqual(q.seq[0].id, q.seq[1].id, 'A、B 不一樣')
          for (let i = 0; i < STRAND; i++) assert.equal(q.seq[i].id, q.seq[i % 2].id, `ABAB 規律正確：${q.seq.map((b) => b.id)}`)
          const opts = q.options.map((o) => o.id)
          assert.equal(new Set(opts).size, opts.length, '選項不重複')
          assert.equal(opts.length, lv === 4 ? 3 : 2, '選項 2 個（第 4 級 3 個）')
          assert.ok(opts.includes(q.answer), '答案在選項裡')
          assert.equal(q.answer, q.seq[q.blank].id)
          assert.equal(q.blank, lv === 3 ? 2 : STRAND - 1, '第 3 級空在中間，其他空第 5 格')
          const objs = q.seq[0].thing.t === 'emoji'
          if (lv === 1 || lv === 3) assert.ok(!objs, '第 1、3 級是珠子')
          if (lv === 2) assert.ok(objs && OBJ_IDS.includes(q.answer), '第 2 級是東西')
          assert.equal(q.skill, objs ? 'pattern:ab-obj' : 'pattern:ab')
          for (const o of opts) assert.ok(hasLine(wordKey(o)), `念得出來：${o}`)
        }
      }
    }
    console.log('ok 2 串珠珠：每一級 200 局，ABAB 正確、答案在選項裡、選項 2～3 個不重複、同一局不重複、每顆都念得出來')
  }

  // 3. 升降級
  {
    const day = (i: number) => `2026-12-${String(1 + i).padStart(2, '0')}`
    const run = (s: LevelState, oks: boolean[], days: number[], max = SORT_MAX, counted = true) =>
      oks.reduce((x, ok, i) => stepLevel(x, { date: day(days[i] ?? 0), first: ok, counted }, max), s)
    // 8 題 7 對、3 天 → 升
    const up = run(LEVEL_START, [true, true, true, false, true, true, true, true], [0, 0, 0, 1, 1, 1, 2, 2])
    assert.equal(up.level, 2, '8 題 7 對、3 天：升一級')
    assert.deepEqual(up.recent, [], '升級後重新算')
    // 差 1 題（7 題）不升
    assert.equal(run(LEVEL_START, Array(7).fill(true), [0, 0, 1, 1, 2, 2, 2]).level, 1, '差 1 題不升')
    // 差 1 天（2 天）不升
    assert.equal(run(LEVEL_START, Array(8).fill(true), [0, 0, 0, 0, 1, 1, 1, 1]).level, 1, '差 1 天不升')
    // 8 題 6 對不升
    assert.equal(run(LEVEL_START, [true, false, true, true, false, true, true, true], [0, 0, 1, 1, 2, 2, 2, 2]).level, 1, '8 題只對 6 題不升')
    // 最近 6 題對 ≤ 3：退一級
    const at3: LevelState = { level: 3, recent: [], taught: [1, 2, 3] }
    const down = run(at3, [true, false, true, false, false, true], [0, 0, 0, 1, 1, 1])
    assert.equal(down.level, 2, '最近 6 題對 3 題：退一級')
    assert.deepEqual(down.taught, [1, 2, 3], '退級不忘記示範過的級')
    assert.equal(run(at3, [true, false, true, true, false, true], [0, 0, 0, 1, 1, 1]).level, 3, '6 題對 4 題不退')
    assert.equal(run(LEVEL_START, Array(6).fill(false), [0, 0, 0, 0, 0, 0]).level, 1, '第 1 級不再退')
    // 手帶著的、一起做的不算熟練
    assert.equal(run(LEVEL_START, Array(10).fill(true), [0, 0, 0, 1, 1, 1, 2, 2, 2, 3], SORT_MAX, false).level, 1, '不算的（一起做、手帶著放）不升級')
    assert.deepEqual(run(LEVEL_START, Array(10).fill(true), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], SORT_MAX, false).recent, [], '不算的不記進最近幾題')
    // 最高級不再升
    const top: LevelState = { level: PATTERN_MAX, recent: [], taught: [] }
    assert.equal(run(top, Array(8).fill(true), [0, 0, 0, 1, 1, 1, 2, 2], PATTERN_MAX).level, PATTERN_MAX, '最高級不再升')
    // 第 4 級 3 個籃子：自己對 4 題以後
    assert.equal(sortThree({ level: 4, recent: Array(3).fill({ date: day(0), ok: true }), taught: [] }), false)
    assert.equal(sortThree({ level: 4, recent: Array(4).fill({ date: day(0), ok: true }), taught: [] }), true)
    assert.equal(sortThree({ level: 3, recent: Array(8).fill({ date: day(0), ok: true }), taught: [] }), false)
    assert.ok(MASTER_OF === 8)
    console.log('ok 3 升降級：8 題 7 對 3 天才升，差 1 題、差 1 天不升；最近 6 題對 ≤ 3 退一級；手帶著的不算；第 4 級對 4 題後換 3 個籃子')
  }

  // 4. 進度壞掉也不會壞
  {
    const p = normalize(null, { sort: SORT_MAX, pattern: PATTERN_MAX })
    assert.equal(p.sort.level, 1)
    assert.equal(p.pattern.level, 1)
    const q = normalize({ sort: { level: 99, recent: 'x', taught: [1, 'a'] }, pattern: { level: 0 } }, { sort: SORT_MAX, pattern: PATTERN_MAX })
    assert.equal(q.sort.level, SORT_MAX, '級數夾在最高級')
    assert.deepEqual(q.sort.recent, [])
    assert.deepEqual(q.sort.taught, [1])
    assert.equal(q.pattern.level, 1, '級數最少 1')
    console.log('ok 4 進度 kv 壞掉、舊格式：補預設、級數夾在範圍內')
  }

  // 5. 不給貼紙、不算上完一堂
  {
    // 技能 sort:* 本來就沒有貼紙；pattern:ab 跟以前程式車庫同名，有貼紙 → 要靠 achievements 的 station === 'logic' 擋
    for (let lv = 1; lv <= SORT_MAX; lv++) assert.equal(stickerFor(sortSkill(lv as SortLevel)), null, `${sortSkill(lv as SortLevel)} 沒有貼紙`)
    const ach = fs.readFileSync(path.resolve('src/lib/achievements.ts'), 'utf8')
    const body = ach.slice(ach.indexOf('export function noteAttempt'))
    assert.match(body.slice(0, 600), /if \(a\.station === 'logic'\) return/, 'noteAttempt 一開頭就擋掉邏輯遊戲的作答（不給里程碑貼紙）')
    // 邏輯遊戲的程式不叫 lessonDone、不挑貼紙
    const dir = path.resolve('src/games/logic')
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      assert.ok(!/lessonDone|afterLesson|StickerPicker|finishRun/.test(src), `${f} 不叫 lessonDone、不挑貼紙、不算上完一堂`)
    }
    console.log('ok 5 邏輯作答不觸發里程碑貼紙（noteAttempt 擋 station logic）、不叫 lessonDone、不挑貼紙')
  }

  // 6. 家長區：名稱、會了什麼
  {
    assert.equal(logicSkillLabel('sort:color', 'logic'), '依顏色分類')
    assert.equal(logicSkillLabel('pattern:ab', 'code'), null, '以前程式車庫的 pattern:ab 照原本的名稱')
    const mk = (skill: string, i: number, ok: boolean, phase: 'quiz' | 'guided' = 'quiz') => ({ station: 'logic' as const, skill, phase, firstTryCorrect: ok, date: `2026-12-0${1 + (i % 3)}`, ts: i, metrics: undefined })
    const rows = [...Array.from({ length: 8 }, (_, i) => mk('sort:color', i, i !== 3)), mk('pattern:ab', 1, true), ...Array.from({ length: 8 }, (_, i) => mk('sort:kind', 20 + i, true, 'guided'))]
    const s = logicSummary(rows)
    assert.deepEqual(
      s.map((x) => [x.skill, x.status]),
      [
        ['sort:color', 'ok'],
        ['pattern:ab', 'learning'],
      ],
      '會了、還在學；一起做的不算、沒玩過的不列',
    )
    console.log('ok 6 家長區：邏輯技能的名稱、總覽「會了什麼」（一起做的不算）')
  }

  // 7. 台詞都有
  {
    const keys = ['lg.pick.intro', 'lg.again', 'lg.sort.ask', 'lg.sort.done', 'lg.pat.ask', 'lg.pat.mid', 'lg.pat.done', 'teach.watch.dodo', 'teach.turn.dodo', 'praise.dodo.0', 'd.next.home']
    for (let lv = 1; lv <= SORT_MAX; lv++) {
      const r = sortRound(lv as SortLevel, seeded(lv), lv === 4)
      for (const b of r.baskets) keys.push(goesKey(b.id), thatKey(b.id), thisKey(b.id))
      keys.push(sortPraiseKey(r.dim))
    }
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    console.log(`ok 7 台詞都有（${new Set(keys).size} 句）`)
  }

  console.log('ALL PASS')
}

main()
