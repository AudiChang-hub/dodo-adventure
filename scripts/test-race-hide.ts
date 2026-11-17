// 遊戲角的「恐龍賽跑棋」「躲起來了幾隻」（家長 2026-11-17，src/games/race、src/games/hide）的單元測試。
// 執行：npx tsx scripts/test-race-hide.ts（npm run verify 的「單元：恐龍賽跑棋、躲起來了幾隻」）
// 驗收：內容量（棋盤場景 ≥ 18、驚喜 ≥ 30；動物 ≥ 40、躲藏處 ≥ 20、場景 ≥ 16）、圖示都在、同一天不重複；
// 骰子點數在範圍內、走的格子一格一格不超過 10；選項含答案、數量 ≤ 5（LOAD-2）、第 1 級 2 個選項（LOAD-1）；升降級；台詞 ≤ 6 個字、不說輸贏、音檔都在；家長區的名稱。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { EMOJI } from '../src/art/emoji.generated'
import { PLAY_EMOJI } from '../src/games/play-emoji.generated'
import { COUNT_EMOJI } from '../src/games/hide/emoji.generated'
import { ITEMS } from '../src/art/storybook/meta'
import { REWARDS, RUNNERS, TRACKS, RACE_EMOJI } from '../src/games/race/data'
import { GOAL, RACE_COMBOS, RACE_LEVELS, RACE_MAX, RACE_START, demoRoll, makeRace, normalizeRace, raceSkill, rollDie, stepRace, stepsFrom, type RaceLevel, type RaceState } from '../src/games/race/plan'
import { ANIMALS, DRAWN, PLACES, SCENES, HIDE_EMOJI, placesFor } from '../src/games/hide/data'
import { HIDE_LEVELS, HIDE_MAX, HIDE_QS, HIDE_START, MAX_TOTAL, hideCombos, hideOptions, hideSkill, makeHide, normalizeHide, stepHide, type HideLevel, type HideState } from '../src/games/hide/plan'
import { logicSkillLabel, LOGIC_GAME_NAME } from '../src/games/logic/report'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { gotKey, hopsKey, numKey as rcNum } from '../src/games/race/lines'
import { allKey, hidKey, numKey as hdNum, sumKey } from '../src/games/hide/lines'

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
const hasEmoji = (n: string) => !!(EMOJI[n] || PLAY_EMOJI[n] || COUNT_EMOJI[n])
let n = 0
const ok = (msg: string) => console.log(`ok ${++n} ${msg}`)

function main() {
  // ── 恐龍賽跑棋 ──
  {
    assert.ok(TRACKS.length >= 18, `棋盤場景 ≥ 18：${TRACKS.length}`)
    assert.ok(REWARDS.length >= 30, `終點驚喜 ≥ 30：${REWARDS.length}`)
    assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length, '場景不重複')
    assert.equal(new Set(REWARDS.map((r) => r.id)).size, REWARDS.length, '驚喜不重複')
    assert.equal(new Set(REWARDS.map((r) => r.emoji)).size, REWARDS.length, '驚喜的圖不重複')
    for (const e of RACE_EMOJI) assert.ok(hasEmoji(e), `圖示 ${e}`)
    for (const r of [...RUNNERS, 'dodo']) assert.ok(ITEMS[r], `恐龍 ${r} 在故事繪本裡`)
    for (const t of TRACKS) if (Array.isArray(t.fill)) assert.ok(t.fill.length >= GOAL, `${t.id} 每一格都有顏色`)
    // 場景 × 格子的樣子：至少 8 種不同的格子
    assert.ok(new Set(TRACKS.map((t) => t.cell)).size >= 8, '格子的樣子 ≥ 8 種')
    ok(`恐龍賽跑棋：棋盤場景 ${TRACKS.length}、格子樣子 ${new Set(TRACKS.map((t) => t.cell)).size}、終點驚喜 ${REWARDS.length}、孩子的恐龍 ${RUNNERS.length}，組合 ${RACE_COMBOS} 種`)
  }
  {
    // 同一天不重複：一天玩 18 局，場景都不一樣；驚喜 30 局都不一樣；恐龍不跟上一局一樣；換一天重新算
    let s: RaceState = { ...RACE_START, taught: [1, 2, 3] }
    const rnd = seeded(7)
    const tracks: string[] = []
    const rewards: string[] = []
    let lastRunner = ''
    for (let i = 0; i < REWARDS.length; i++) {
      const r = makeRace(s, '2026-11-17', rnd)
      s = r.state
      tracks.push(r.race.track)
      rewards.push(r.race.reward)
      assert.notEqual(r.race.runner, lastRunner, '孩子的恐龍不跟上一局一樣')
      lastRunner = r.race.runner
      assert.equal(r.race.demo, false)
    }
    assert.equal(new Set(tracks.slice(0, TRACKS.length)).size, TRACKS.length, `一天 ${TRACKS.length} 局場景都不一樣`)
    assert.equal(new Set(rewards).size, REWARDS.length, `一天 ${REWARDS.length} 局驚喜都不一樣`)
    // 都用過了（第 19 局起）：不跟上一局一樣
    for (let i = TRACKS.length; i < tracks.length; i++) assert.notEqual(tracks[i], tracks[i - 1], '用完了也不跟上一局一樣')
    const next = makeRace(s, '2026-11-18', rnd)
    assert.deepEqual(next.state.today.tracks, [next.race.track], '換一天重新算')
    // 第一次到這一級要示範
    assert.equal(makeRace(RACE_START, '2026-11-17', rnd).race.demo, true)
    ok(`恐龍賽跑棋同一天不重複：${TRACKS.length} 局場景都不同、${REWARDS.length} 局驚喜都不同，換一天重新算`)
  }
  {
    // 骰子：在範圍內、每一面都會出現、不連續三次一樣；第 1、2 級 ≤ 3（LOAD-2）
    for (const level of [1, 2, 3] as RaceLevel[]) {
      const rnd = seeded(level * 31)
      const last: number[] = []
      const seen = new Set<number>()
      for (let i = 0; i < 3000; i++) {
        const v = rollDie(level, last, rnd)
        assert.ok(v >= 1 && v <= RACE_LEVELS[level].die, `第 ${level} 級骰子 ${v}`)
        if (last.length >= 2) assert.ok(!(last[last.length - 1] === v && last[last.length - 2] === v), '不連續三次一樣')
        last.push(v)
        if (last.length > 4) last.shift()
        seen.add(v)
      }
      assert.equal(seen.size, RACE_LEVELS[level].die, `第 ${level} 級每一面都會出現`)
      assert.ok(demoRoll(level) <= RACE_LEVELS[level].die)
    }
    assert.equal(RACE_LEVELS[1].die, 3)
    assert.equal(RACE_LEVELS[2].die, 3)
    assert.equal(RACE_LEVELS[3].die, 6)
    // 走的格子：一格一格、不超過終點
    for (let p = 0; p <= GOAL; p++)
      for (let v = 1; v <= 6; v++) {
        const s = stepsFrom(p, v)
        assert.equal(s.length, Math.min(v, GOAL - p))
        s.forEach((c, i) => assert.equal(c, p + i + 1))
        assert.ok(s.every((c) => c <= GOAL))
      }
    // 模擬整局：兩隻輪流，一定會走到終點、步數合理（三歲的一局不會太長，LOAD-3）
    for (const level of [1, 2, 3] as RaceLevel[]) {
      const rnd = seeded(level * 97)
      let maxTurns = 0
      for (let g = 0; g < 500; g++) {
        const pos = [0, 0]
        const last: number[] = []
        let turns = 0
        while (pos[0] < GOAL || pos[1] < GOAL) {
          for (const w of [0, 1]) {
            if (pos[w] >= GOAL) continue
            const v = rollDie(level, last, rnd)
            last.push(v)
            pos[w] += stepsFrom(pos[w], v).length
            turns++
          }
          assert.ok(turns < 60, '一局會結束')
        }
        maxTurns = Math.max(maxTurns, turns)
      }
      assert.ok(maxTurns <= 22, `第 ${level} 級一局最多 ${maxTurns} 回合`)
    }
    ok('骰子：第 1、2 級 1～3 點、第 3 級 1～6 點，每一面都會出現、不連續三次一樣；走的格子一格一格、停在 10；一局一定會結束')
  }
  {
    // 升降級
    let s: RaceState = { ...RACE_START }
    for (let i = 0; i < 5; i++) s = stepRace(s, { first: true, counted: true })
    assert.equal(s.level, 1, '5 步還不升')
    s = stepRace(s, { first: true, counted: true })
    assert.equal(s.level, 2, '6 步有 6 步對：升')
    for (let i = 0; i < 6; i++) s = stepRace(s, { first: i !== 2, counted: true })
    assert.equal(s.level, 3, '6 步有 5 步對：升')
    for (let i = 0; i < 6; i++) s = stepRace(s, { first: true, counted: true })
    assert.equal(s.level, RACE_MAX, '最高停在 3')
    for (let i = 0; i < 4; i++) s = stepRace(s, { first: i === 0, counted: true })
    assert.equal(s.level, 2, '4 步只有 1 步對：退')
    const before = s
    s = stepRace(s, { first: false, counted: false })
    assert.equal(s, before, '示範、手帶著走的不算')
    assert.deepEqual(normalizeRace(null), RACE_START)
    assert.equal(normalizeRace({ level: 99 }).level, RACE_MAX)
    assert.deepEqual(normalizeRace({ today: { date: 'x', tracks: ['meadow', 'nope', 3] } }).today.tracks, ['meadow'])
    assert.deepEqual([1, 2, 3].map((l) => raceSkill(l as RaceLevel)), ['race:1-3-glow', 'race:1-3', 'race:1-6'])
    ok('恐龍賽跑棋升降級：6 步有 5 步第一次就對升一級、4 步只有 ≤ 1 步退一級、示範不算；壞掉的進度補預設')
  }

  // ── 躲起來了幾隻 ──
  {
    assert.ok(ANIMALS.length >= 40, `動物 ≥ 40：${ANIMALS.length}`)
    assert.ok(PLACES.length >= 20, `躲藏處 ≥ 20：${PLACES.length}`)
    assert.ok(SCENES.length >= 16, `場景 ≥ 16：${SCENES.length}`)
    assert.equal(new Set(ANIMALS).size, ANIMALS.length, '動物不重複')
    assert.equal(new Set(PLACES.map((p) => p.id)).size, PLACES.length, '躲藏處不重複')
    assert.equal(new Set(SCENES.map((p) => p.id)).size, SCENES.length, '場景不重複')
    for (const e of HIDE_EMOJI) assert.ok(hasEmoji(e), `圖示 ${e}`)
    for (const p of PLACES) if (p.drawn) assert.ok(DRAWN.includes(p.art as never), `${p.id} 自己畫的`)
    // 山洞、箱子、樹叢都有（家長指定的三種）
    for (const id of ['cave', 'box', 'bush']) assert.ok(PLACES.some((p) => p.id === id), id)
    for (const sc of SCENES) assert.ok(placesFor(sc).length >= 6, `${sc.id} 放得下的躲藏處 ≥ 6：${placesFor(sc).length}`)
    for (const p of PLACES) assert.ok(SCENES.some((sc) => placesFor(sc).includes(p)), `${p.id} 至少放在一個場景`)
    ok(`躲起來了幾隻：動物 ${ANIMALS.length}、躲藏處 ${PLACES.length}（自己畫的 ${DRAWN.length}）、場景 ${SCENES.length}，組合 ${hideCombos()} 種（場景 × 躲藏處 × 動物 × 分法）`)
  }
  {
    // 每一級 300 局：數量、選項、答案、不重複
    for (const level of [1, 2, 3, 4] as HideLevel[]) {
      const spec = HIDE_LEVELS[level]
      const rnd = seeded(level * 13)
      let s: HideState = { ...HIDE_START, level, taught: [1, 2, 3, 4] }
      const pairs = new Set<string>()
      for (let g = 0; g < 300; g++) {
        const r = makeHide(s, `2026-11-${(g % 28) + 1}`, rnd)
        s = r.state
        assert.equal(r.round.qs.length, HIDE_QS)
        const sc = SCENES.find((x) => x.id === r.round.scene)!
        r.round.qs.forEach((q, i) => {
          assert.ok(spec.totals.includes(q.total), `第 ${level} 級全部 ${q.total}`)
          assert.ok(q.total <= MAX_TOTAL && q.total <= 5, '數量 ≤ 5（LOAD-2）')
          assert.ok(q.hidden >= 1 && q.hidden <= q.total - 1, '至少躲 1 隻、外面至少 1 隻')
          assert.equal(q.options.length, spec.options, `第 ${level} 級 ${spec.options} 個選項`)
          assert.ok(q.options.length <= 4, '選項 ≤ 4（LOAD-1）')
          assert.ok(q.options.includes(q.hidden), '選項含答案')
          assert.equal(new Set(q.options).size, q.options.length, '選項不重複')
          assert.deepEqual(q.options, [...q.options].sort((a, b) => a - b), '選項由小到大')
          assert.ok(q.options.every((v) => v >= 1 && v <= q.total), '選項在 1～全部')
          assert.ok(placesFor(sc).some((p) => p.id === q.place), `${q.place} 放得進 ${sc.id}`)
          if (i > 0) assert.notEqual(q.hidden, r.round.qs[i - 1].hidden, '躲起來的數量不跟上一題一樣')
          pairs.add(`${q.total}-${q.hidden}`)
        })
        assert.equal(new Set(r.round.qs.map((q) => q.animal)).size, HIDE_QS, '一局的動物都不一樣')
        assert.equal(new Set(r.round.qs.map((q) => q.place)).size, HIDE_QS, '一局的躲藏處都不一樣')
      }
      // 每一種分法都會出現
      const want = spec.totals.reduce((a, t) => a + t - 1, 0)
      assert.equal(pairs.size, want, `第 ${level} 級的分法都會出現：${[...pairs].join(' ')}`)
    }
    assert.equal(HIDE_LEVELS[1].options, 2, '第 1 級 2 個選項')
    assert.deepEqual(HIDE_LEVELS[1].totals, [3], '從 3 隻開始')
    assert.ok(HIDE_LEVELS[HIDE_MAX].totals.includes(5), '最高到 5 隻')
    // 第一次到這一級：多一題示範（3 隻躲 1 隻、2 個選項）
    const d = makeHide({ ...HIDE_START, level: 3 }, '2026-11-17', seeded(5)).round
    assert.equal(d.demo, true)
    assert.equal(d.qs.length, HIDE_QS + 1)
    assert.equal(d.qs[0].total, 3)
    assert.equal(d.qs[0].hidden, 1)
    assert.equal(d.qs[0].options.length, 2)
    // 選項一定有「外面那幾隻」這個最容易搞混的（不跟答案一樣時）
    for (let t = 3; t <= 5; t++) for (let k = 1; k < t; k++) if (t - k !== k) assert.ok(hideOptions(t, k, 2, seeded(t * k)).includes(t - k), `${t} 躲 ${k}：選項有 ${t - k}`)
    ok('躲起來了幾隻每一級 300 局：3～5 隻、至少躲 1 隻、選項含答案且由小到大、第 1 級 2 個選項、分法都會出現、一局動物和躲藏處不重複；第一次先示範')
  }
  {
    // 同一天不重複：16 局場景都不一樣；前 8 局（32 題）動物都不一樣
    let s: HideState = { ...HIDE_START, taught: [1, 2, 3, 4] }
    const rnd = seeded(99)
    const scenes: string[] = []
    const animals: string[] = []
    for (let g = 0; g < SCENES.length; g++) {
      const r = makeHide(s, '2026-11-17', rnd)
      s = r.state
      scenes.push(r.round.scene)
      animals.push(...r.round.qs.map((q) => q.animal))
    }
    assert.equal(new Set(scenes).size, SCENES.length, `一天 ${SCENES.length} 局場景都不一樣`)
    assert.equal(new Set(animals.slice(0, ANIMALS.length)).size, ANIMALS.length, `一天前 ${ANIMALS.length} 題動物都不一樣`)
    const next = makeHide(s, '2026-11-18', rnd)
    assert.deepEqual(next.state.today.scenes, [next.round.scene], '換一天重新算')
    ok(`躲起來了幾隻同一天不重複：${SCENES.length} 局場景都不同、前 ${ANIMALS.length} 題動物都不同，換一天重新算`)
  }
  {
    let s: HideState = { ...HIDE_START }
    for (let i = 0; i < 6; i++) s = stepHide(s, { first: true, counted: true })
    assert.equal(s.level, 2)
    for (let i = 0; i < 6; i++) s = stepHide(s, { first: true, counted: true })
    for (let i = 0; i < 6; i++) s = stepHide(s, { first: true, counted: true })
    for (let i = 0; i < 6; i++) s = stepHide(s, { first: true, counted: true })
    assert.equal(s.level, HIDE_MAX, '最高停在 4')
    for (let i = 0; i < 4; i++) s = stepHide(s, { first: false, counted: true })
    assert.equal(s.level, 3, '4 題全錯：退')
    assert.equal(stepHide(s, { first: false, counted: false }), s, '示範不算')
    assert.deepEqual(normalizeHide('壞掉'), HIDE_START)
    assert.equal(normalizeHide({ level: 0 }).level, 1)
    assert.deepEqual([1, 2, 3, 4].map((l) => hideSkill(l as HideLevel)), ['hide:3-frame', 'hide:3-4', 'hide:4-5', 'hide:5-num'])
    ok('躲起來了幾隻升降級：6 題有 5 題第一次就對升一級、4 題只有 ≤ 1 題退一級、示範不算；壞掉的進度補預設')
  }

  // ── 台詞、家長區 ──
  {
    const keys = ['rc.intro', 'rc.roll', 'rc.tap', 'rc.my', 'rc.one', 'rc.you', 'rc.me', 'rc.both', 'rc.open', 'rc.again', 'hd.intro', 'hd.hide', 'hd.ask', 'hd.out', 'hd.dots', 'hd.peek', 'hd.done', 'hd.again']
    for (let i = 1; i <= GOAL; i++) keys.push(rcNum(i))
    for (let i = 1; i <= 6; i++) keys.push(hopsKey(i))
    for (const r of REWARDS) keys.push(gotKey(r.id))
    for (let i = 1; i <= MAX_TOTAL; i++) keys.push(hdNum(i))
    for (let t = 3; t <= MAX_TOTAL; t++) {
      keys.push(allKey(t))
      for (let k = 1; k < t; k++) keys.push(hidKey(k), sumKey(t - k, k))
    }
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    for (const k of keys) assert.ok(words(line(k).text) <= 6, `${k} ≤ 6 個字：${line(k).text}`)
    for (const k of keys) assert.ok(!/\b(lose|lost|loser|win|winner|won)\b/i.test(line(k).text), `不說輸贏：${line(k).text}`)
    for (const k of keys) assert.ok(!/[一-鿿]/.test(line(k).text), `不念中文：${k}`)
    assert.equal(line(sumKey(2, 1)).text, 'Two and one make three!')
    const files = new Set(keys.flatMap((k) => segments(line(k)).map((s) => clipName(line(k), s))))
    if (existsSync('public/audio')) {
      const miss = [...files].filter((f) => !existsSync(`public/audio/${f}.mp3`))
      assert.deepEqual(miss, [], `缺音檔 ${miss.length} 個`)
      ok(`台詞都有（${keys.length} 句、每句 ≤ 6 個字、不說輸贏、不念中文），音檔 ${files.size} 個都在`)
    } else ok(`台詞都有（${keys.length} 句、每句 ≤ 6 個字、不說輸贏、不念中文）；（跳過）沒有 public/audio，不檢查音檔`)
  }
  {
    assert.equal(LOGIC_GAME_NAME['logic-race'], '恐龍賽跑棋')
    assert.equal(LOGIC_GAME_NAME['logic-hide'], '躲起來了幾隻')
    for (const l of [1, 2, 3] as RaceLevel[]) assert.ok(logicSkillLabel(raceSkill(l)), raceSkill(l))
    for (const l of [1, 2, 3, 4] as HideLevel[]) assert.ok(logicSkillLabel(hideSkill(l)), hideSkill(l))
    ok('家長區看得到兩個遊戲的名稱、每一級的技能名稱')
  }
  console.log('ALL PASS')
}

main()
