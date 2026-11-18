// 邏輯遊戲（src/games/logic/，T-152 P3）的單元測試。
// 執行：npx tsx scripts/test-logic.ts（npm run verify 的「單元：邏輯遊戲」）
// 驗收（設計稿第五節）：每一級出 200 局，答案一定在選項裡、選項 2～3 個不重複、規律正確、同一局沒有重複的題；
// 升降級：差 1 題、差 1 天不升；最近 6 題對 ≤ 3 降一級；手帶著的不算熟練；邏輯作答不觸發里程碑貼紙、不叫 lessonDone。
// T-157：情境、串的東西每一局換、不跟最近兩局一樣；東西都在 emoji.generated.ts；複習學過的特徵只在第 3 級以上、不算升降級。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  KIND_BIN,
  KIND_ICONS,
  KIND_IDS,
  KIND_PARTNERS,
  LEVEL_DIM,
  SCENES,
  SCENE_IDS,
  scenesFor,
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
import { OBJ_ICON, OBJ_IDS, PATTERN_MAX, PATTERN_QS, STRAND, THEMES, THEME_IDS, patternRound, themesFor, type PatLevel } from '../src/games/logic/pattern-plan'
import { SCENES_KEEP, noteScene, normalize } from '../src/games/logic/progress'
import { patternCoplay, sortCoplay } from '../src/games/logic/coplay'
import { EMOJI } from '../src/art/emoji.generated'
import { logicSkillLabel, logicSummary } from '../src/games/logic/report'
import { stickerFor } from '../src/content/stickers'
import '../src/content/lines'
import { hasLine } from '../src/content/registry'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { ANSWER_TAP, useTaps } from '../src/ui/tap'
import { goesKey, patDoneKey, patThemeKey, sortPraiseKey, sortSceneKey, thatKey, thisKey, wordKey } from '../src/games/logic/lines'

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
  // 1. 豆豆收拾：每一級 200 局（照實際玩的方式：記著最近的情境、示範過了可以複習）
  {
    /** 複習的那一局是第幾級的內容（第 1 級的顏色用第 2 級的） */
    const SUB: Record<string, SortLevel> = { color: 2, kind: 3, shape: 4 }
    for (let lv = 1; lv <= SORT_MAX; lv++) {
      for (const three of [false, true]) {
        if (three && lv !== 4) continue
        let recent: string[] = []
        const seen = { scenes: new Set<string>(), items: new Set<string>(), review: 0 }
        for (let k = 0; k < 200; k++) {
          const r = sortRound(lv as SortLevel, seeded(lv * 1000 + k + (three ? 500 : 0)), three, { recent, review: true })
          const ids = r.baskets.map((b) => b.id)
          assert.equal(r.items.length, SORT_ITEMS, '一局 4 個')
          assert.equal(new Set(ids).size, ids.length, '籃子不重複')
          assert.ok(ids.length >= 2 && ids.length <= 3, '籃子 2～3 個（LOAD-1）')
          assert.equal(ids.length, lv === 4 && three && !r.review ? 3 : 2, '只有第 4 級（形狀）、不是複習的那一局會有 3 個籃子')
          for (const it of r.items) assert.ok(ids.includes(it.answer), `答案在籃子裡：${it.id}`)
          for (const b of ids) assert.ok(r.items.some((it) => it.answer === b), '每個籃子至少收到一個')
          assert.equal(new Set(r.items.map((it) => it.id)).size, r.items.length, `同一局沒有重複的東西：${r.items.map((x) => x.id)}`)
          const ans = r.items.map((x) => x.answer)
          assert.ok(!ans.some((a, i) => i >= 2 && a === ans[i - 1] && a === ans[i - 2]), '同一個籃子不連 3 次')
          // 複習：只在第 3 級以上，分的是前面幾級學過的特徵；不是複習就是這一級的特徵
          assert.equal(r.level, lv)
          const sub = r.review ? SUB[r.dim] : (lv as SortLevel)
          if (r.review) {
            assert.ok(lv >= 3, '第 1、2 級不複習')
            assert.ok(sub && sub < lv && r.dim !== LEVEL_DIM[lv as SortLevel], `第 ${lv} 級複習學過的 ${r.dim}`)
            seen.review++
          } else assert.equal(r.dim, LEVEL_DIM[lv as SortLevel])
          assert.equal(r.skill, `sort:${r.dim}`, '作答紀錄的技能是實際分的特徵')
          // 情境：這個特徵用得上、不跟最近兩局一樣（只有 2 個能挑時不跟上一局一樣）
          const valid = scenesFor(sub)
          assert.ok(valid.includes(r.scene), `第 ${sub} 級的內容可以用 ${r.scene}`)
          assert.ok(!recent.slice(-Math.min(2, valid.length - 1)).includes(r.scene), `不跟最近的情境一樣：${recent} → ${r.scene}`)
          recent = [...recent, r.scene].slice(-3)
          seen.scenes.add(r.scene)
          // 每一級的特徵真的對得上
          for (const it of r.items) {
            seen.items.add(it.id)
            const t = it.thing
            if (t.t === 'emoji') assert.ok(EMOJI[t.icon], `${t.icon} 在 emoji.generated.ts 裡`)
            if (sub === 1) assert.ok(t.t === 'toy' && t.color === it.answer && SCENES[r.scene].toys!.includes(t.toy))
            if (sub === 2) {
              if (t.t === 'toy') assert.ok(t.color === it.answer && SCENES[r.scene].toys!.includes(t.toy))
              else assert.ok(t.t === 'emoji' && SCENES[r.scene].colors![it.answer as 'red']!.includes(t.icon), `${t.t === 'emoji' && t.icon} 是 ${it.answer}`)
            }
            if (sub === 3) assert.ok(t.t === 'emoji' && KIND_ICONS[it.answer as 'food'].includes(t.icon), '種類對')
            if (sub === 4) assert.ok(t.t === 'shape' && t.shape === it.answer && !!t.color && t.look === SCENES[r.scene].shapes!.look)
            if (sub === 5) assert.ok(t.t === 'emoji' && SCENES[r.scene].sizes!.includes(t.icon) && (it.answer === 'big' ? (t.scale ?? 1) === 1 : (t.scale ?? 1) < 1))
          }
          if (sub === 1) {
            // 同一種東西、只差顏色：每一種都有兩個顏色
            const toys = r.items.map((x) => (x.thing.t === 'toy' ? x.thing.toy : ''))
            for (const ty of new Set(toys)) assert.equal(toys.filter((x) => x === ty).length, 2, `第 1 級每一種東西兩個顏色各一：${r.items.map((x) => x.id)}`)
          }
          if (sub === 2) {
            // 不同的東西、同一個顏色：一個東西只出現一次（不會變成第 1 級的「同一種只差顏色」）
            const things = r.items.map((x) => (x.thing.t === 'toy' ? x.thing.toy : x.thing.t === 'emoji' ? x.thing.icon : ''))
            assert.equal(new Set(things).size, things.length, `第 2 級每個東西都不一樣：${things}`)
          }
          if (sub === 3) {
            const [a, b] = ids as ('animal' | 'food')[]
            assert.ok(KIND_PARTNERS[a].includes(b) && KIND_PARTNERS[b].includes(a), `${a}、${b} 可以一起分`)
            for (const bk of r.baskets) {
              assert.equal(bk.bin, KIND_BIN[bk.id as 'animal'], '每一種收進自己的容器')
              assert.ok(bk.sample.t === 'emoji' && KIND_ICONS[bk.id as 'food'].includes(bk.sample.icon) && EMOJI[bk.sample.icon])
              const icon = bk.sample.t === 'emoji' ? bk.sample.icon : ''
              assert.ok(!r.items.some((x) => x.thing.t === 'emoji' && x.thing.icon === icon), '樣品不拿來收')
            }
          } else for (const bk of r.baskets) assert.equal(bk.bin, sub === 4 ? SCENES[r.scene].shapes!.bin : SCENES[r.scene].bin, '容器跟著情境')
          // 籃子上的形狀樣品不上色（顏色不是線索）
          if (sub === 4) for (const b of r.baskets) assert.ok(b.sample.t === 'shape' && !b.sample.color)
          if (sub === 5)
            for (const b of r.baskets) {
              const icon = b.sample.t === 'emoji' ? b.sample.icon : ''
              assert.ok(EMOJI[icon] && !r.items.some((x) => x.thing.t === 'emoji' && x.thing.icon === icon), '大小的樣品不拿來收')
            }
        }
        // 三個籃子（形狀）只在第 4 級的形狀局，情境照樣輪
        const want = new Set(scenesFor(lv as SortLevel))
        for (const x of want) assert.ok(seen.scenes.has(x), `第 ${lv} 級每一種情境都出現過：${[...seen.scenes]}`)
        assert.ok(seen.items.size >= 30, `第 ${lv} 級 200 局東西夠多樣：${seen.items.size} 種`)
        if (lv >= 3) assert.ok(seen.review > 30 && seen.review < 110, `第 ${lv} 級約 1/3 的局複習：${seen.review}`)
        else assert.equal(seen.review, 0)
      }
    }
    // 沒有說可以複習（這一級還沒示範過）：一定是這一級的特徵
    for (let k = 0; k < 100; k++) assert.equal(sortRound(5, seeded(k)).review, false, '沒有說可以複習就不複習')
    // 情境都有內容；每個 emoji 都在
    for (const id of SCENE_IDS) {
      const d = SCENES[id]
      for (const x of [...Object.values(d.colors ?? {}).flat(), ...(d.sizes ?? [])]) assert.ok(EMOJI[x], `${id} 的 ${x} 在 emoji.generated.ts 裡`)
      if (d.toys) assert.equal(d.toys.length, 4, `${id} 自己畫的東西 4 種（第 2 級兩個顏色各 2 種不重複）`)
    }
    for (const k of KIND_IDS) for (const x of KIND_ICONS[k]) assert.ok(EMOJI[x], `${k} 的 ${x} 在 emoji.generated.ts 裡`)
    for (const k of KIND_IDS) for (const o of KIND_PARTNERS[k]) assert.ok(KIND_PARTNERS[o].includes(k), `${k}、${o} 兩邊都配`)
    for (let lv = 1; lv <= SORT_MAX; lv++) assert.ok(scenesFor(lv as SortLevel).length >= 2, `第 ${lv} 級至少 2 種情境`)
    console.log('ok 1 豆豆收拾：每一級 200 局，答案在籃子裡、籃子 2～3 個不重複、每個籃子都有、同一局沒有重複、特徵對得上；情境不跟最近兩局一樣、每一種都出現；第 3 級以上約 1/3 複習學過的特徵')
  }

  // 2. 串珠珠：每一級 200 局（照實際玩的方式：記著最近串過的東西）
  {
    for (const o of OBJ_IDS) assert.ok(EMOJI[OBJ_ICON[o]], `${o}（${OBJ_ICON[o]}）在 emoji.generated.ts 裡`)
    for (const t of THEME_IDS) for (const o of THEMES[t].objs) assert.ok(OBJ_IDS.includes(o), `${t} 的 ${o} 有圖、念得出來`)
    for (let lv = 1; lv <= PATTERN_MAX; lv++) {
      let recent: string[] = []
      const themes = new Set<string>()
      const combos = new Set<string>()
      for (let k = 0; k < 200; k++) {
        const qs = patternRound(lv as PatLevel, seeded(lv * 777 + k), recent)
        assert.equal(qs.length, PATTERN_QS, '一局 3 題')
        const theme = qs[0].theme
        assert.ok(themesFor(lv as PatLevel).includes(theme), `第 ${lv} 級可以串 ${theme}`)
        assert.ok(!recent.slice(-2).includes(theme), `不跟最近兩局串一樣的：${recent} → ${theme}`)
        recent = [...recent, theme].slice(-3)
        themes.add(theme)
        const pairs = qs.map((q) => [q.seq[0].id, q.seq[1].id].sort().join())
        assert.equal(new Set(pairs).size, pairs.length, '同一局三題用不一樣的組合')
        for (const q of qs) {
          combos.add(`${theme}:${q.itemId}`)
          assert.equal(q.theme, theme, '同一局串一樣的東西')
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
          if (lv === 1 || lv === 3) assert.ok(!objs, '第 1、3 級是顏色')
          if (lv === 2) assert.ok(objs, '第 2 級是東西')
          for (const o of opts) assert.ok(objs ? THEMES[theme].objs.includes(o) : THEMES[theme].colors!.includes(o as 'red'), `${o} 是 ${theme} 的`)
          assert.equal(q.skill, objs ? 'pattern:ab-obj' : 'pattern:ab')
          for (const o of opts) assert.ok(hasLine(wordKey(o)), `念得出來：${o}`)
        }
      }
      assert.equal(themes.size, themesFor(lv as PatLevel).length, `第 ${lv} 級每一種都串過：${[...themes]}`)
      assert.ok(combos.size >= (lv === 2 ? 100 : 40), `第 ${lv} 級 200 局組合夠多樣：${combos.size} 種`)
    }
    assert.ok(!themesFor(1).includes('animals') && themesFor(2).includes('animals'), '排隊的小動物只串東西')
    console.log('ok 2 串珠珠：每一級 200 局，ABAB 正確、答案在選項裡、選項 2～3 個不重複、同一局不重複、每顆都念得出來；串的東西不跟最近兩局一樣、每一種都出現')
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
    // 舊格式（T-152，沒有 scenes）：讀得進來，級數、示範過的都留著
    const old = normalize({ sort: { level: 3, recent: [{ date: '2026-11-15', ok: true }], taught: [1, 2, 3] }, pattern: { level: 2, recent: [], taught: [1, 2] } }, { sort: SORT_MAX, pattern: PATTERN_MAX })
    assert.equal(old.sort.level, 3)
    assert.deepEqual(old.sort.taught, [1, 2, 3])
    assert.deepEqual(old.sort.recent, [{ date: '2026-11-15', ok: true }])
    assert.deepEqual(old.scenes, { sort: [], pattern: [] }, '舊進度沒有 scenes：當成空的')
    assert.deepEqual(normalize({ scenes: { sort: ['toys', 3, 'farm'], pattern: 'x' } }, { sort: SORT_MAX, pattern: PATTERN_MAX }).scenes, { sort: ['toys', 'farm'], pattern: [] })
    for (const sc of ['toys', 'fruit', 'farm', 'clothes', 'kitchen']) noteScene(old, 'sort', sc)
    assert.deepEqual(old.scenes.sort, ['farm', 'clothes', 'kitchen'], `只記最近 ${SCENES_KEEP} 局`)
    assert.deepEqual(old.scenes.pattern, [])
    console.log('ok 4 進度 kv 壞掉、舊格式：補預設、級數夾在範圍內；舊進度（沒有最近的情境）讀得進來；最近的情境只記 3 個')
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
    // 複習的那一局不算升降級（T-157）
    const sortSrc = fs.readFileSync(path.join(dir, 'Sort.tsx'), 'utf8')
    assert.match(sortSrc, /counted: phase === 'quiz' && !review/, '豆豆收拾：複習的那一局不算進升降級')
    console.log('ok 5 邏輯作答不觸發里程碑貼紙（noteAttempt 擋 station logic）、不叫 lessonDone、不挑貼紙；複習的那一局不算升降級')
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
    for (const k of KIND_IDS) keys.push(goesKey(k), thatKey(k), thisKey(k))
    for (const id of SCENE_IDS) keys.push(sortSceneKey(id))
    for (const t of THEME_IDS) keys.push(patThemeKey(t), patDoneKey(t))
    for (const o of OBJ_IDS) keys.push(wordKey(o))
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    // 陪玩小字：每個情境、特徵、串的東西都有
    for (const id of SCENE_IDS)
      for (const d of ['color', 'kind', 'shape', 'size'] as const) {
        const c = sortCoplay(id, d)
        assert.ok(c.play && c.now.startsWith('現在去做：'), `陪玩小字：${id} ${d}`)
      }
    for (const t of THEME_IDS) assert.ok(patternCoplay(t).play && patternCoplay(t).now.startsWith('現在去做：'), `陪玩小字：${t}`)
    console.log(`ok 7 台詞都有（${new Set(keys).size} 句）、每個情境和串的東西都有陪玩小字`)
  }

  // 8. 一直點錯（三歲測試 B02，2026-11-18）：同一個錯的籃子／珠子 0.6 秒內點兩下，兩下都要算。
  // 以前 ui/tap 的 useTaps 把同一個按鈕 0.7 秒內的第二下當成「同一下按壓的 click」丟掉：
  // 孩子點了沒反應，第 3 次錯只算第 2 次，手不會帶著放（也就沒有那筆「一起做」的紀錄）。
  {
    let now = 1000
    const realNow = performance.now.bind(performance)
    performance.now = () => now
    try {
      let tap: ReturnType<typeof useTaps> | null = null
      const Probe = () => {
        tap = useTaps()
        return null
      }
      renderToString(createElement(Probe))
      const pt = (id: number) => ({ pointerId: id, clientX: 100, clientY: 100 }) as unknown as PointerEvent
      /** 手指按下、放開，瀏覽器接著送 click（同一下按壓） */
      const press = (props: ReturnType<NonNullable<typeof tap>>, id: number) => {
        props.onPointerDown(pt(id) as never)
        now += 80
        props.onPointerUp(pt(id) as never)
        props.onClick({} as never)
      }
      // 作答的選項（豆豆收拾的籃子、串珠珠的珠子）：每一下按壓都算
      let n = 0
      press(tap!('basket-blue', () => n++, ANSWER_TAP), 1)
      assert.equal(n, 1, '一下按壓（pointerup＋click）只算一次')
      now += 520 // 第二下在第一下之後 0.6 秒
      press(tap!('basket-blue', () => n++, ANSWER_TAP), 2)
      assert.equal(n, 2, '同一個選項 0.6 秒內點第二下也要算')
      now += 120
      press(tap!('basket-blue', () => n++, ANSWER_TAP), 3)
      assert.equal(n, 3, '連點三下：三下都算（交給遊戲自己判斷要不要收）')
      // 鍵盤、滑鼠沒有 pointerup 的 click：照樣算
      now += 2000
      tap!('basket-blue', () => n++, ANSWER_TAP).onClick({} as never)
      assert.equal(n, 4, '只有 click（鍵盤）也算')
      // 其他按鈕（首頁的門等）不變：同一個按鈕 0.7 秒內的第二下照舊不算
      let m = 0
      now += 2000
      press(tap!('door', () => m++), 4)
      now += 520
      press(tap!('door', () => m++), 5)
      assert.equal(m, 1, '沒有指定的按鈕照舊擋 0.7 秒內的第二下')
    } finally {
      performance.now = realNow
    }
    // 兩個遊戲的作答選項都用 ANSWER_TAP
    const src = (f: string) => fs.readFileSync(path.resolve('src/games/logic', f), 'utf8')
    assert.match(src('Sort.tsx'), /tap\(`basket-\$\{b\.id\}`, \(\) => void choose\(b\.id\), ANSWER_TAP\)/, '豆豆收拾的籃子用 ANSWER_TAP')
    assert.match(src('Pattern.tsx'), /tap\(`opt-\$\{o\.id\}`, \(\) => void choose\(o\.id\), ANSWER_TAP\)/, '串珠珠的珠子用 ANSWER_TAP')
    console.log('ok 8 一直點錯：同一個籃子／珠子 0.6 秒內點兩下，兩下都算（其他按鈕照舊擋）')
  }

  console.log('ALL PASS')
}

main()
