// 數學課出題（src/lessons/math/plan.ts）：1～5 熟練了才開 6（countReady）、比多少不超出開放的範圍、找數字教過 3 個以後 3 選 1、
// 拿給波波只用 1～5、描數字的次數、6 個以上排好再數。對照 docs/全球幼教指引-現況對照.md A1、A5、AI 小男生測試 #8。
// 執行：npx tsx scripts/test-math-plan.ts
import assert from 'node:assert/strict'
import { FIRM, PARTS, compareQs, countIcons, countReady, gameQs, giveRounds, lineUp, range, resumePart, reviewQs, writeReps, type FirmAttempt, type Lesson } from '../src/lessons/math/plan'
import { FIND_DISTRACTORS, FIND_MAX, FIND_THINGS, FINGER_ORDER, WARM_PLAYS, findScene, fingersUp, homeTip, warmFor } from '../src/lessons/math/warmup'
import { GIVE_PLAYS, PLAY_GAME, giveOptions } from '../src/lessons/math/plays'
import { WORLDS, worldOn } from '../src/lib/today-world'
import '../src/content/lines'
import { hasLine } from '../src/content/registry'

const at = (skill: string, ok: boolean, date: string, opts = 3, ts = 0): FirmAttempt => ({
  skill,
  options: range(1, opts).map(String),
  firstTryCorrect: ok,
  date,
  ts,
  phase: 'quiz',
})

/** 10 題：1～5 各兩題，分布在 days 天，前 wrong 題答錯 */
function tenAcross(days: number, wrong = 0, opts = 3) {
  return range(0, 9).map((i) => at(`count:${(i % FIRM) + 1}`, i >= wrong, `2026-11-0${(i % days) + 1}`, opts, 1000 + i))
}

function main() {
  // ── countReady ─────────────────────────────────
  assert.equal(countReady([]).ready, false)
  assert.equal(countReady(tenAcross(3)).ready, true, '3 天、10 題全對、1～5 都有')
  assert.equal(countReady(tenAcross(3, 2)).ready, true, '10 題對 8 題還算熟練')
  assert.equal(countReady(tenAcross(3, 3)).ready, false, '10 題只對 7 題不算')
  assert.equal(countReady(tenAcross(2)).ready, false, '只分布在 2 天不算')
  assert.equal(countReady(tenAcross(3, 0, 2)).ready, false, '2 選 1 的題目不算（用猜的也有一半）')
  console.log('ok 1 熟練：最近 10 題 ≥ 8 題、≥ 3 天、只算 3 選 1 以上')
  {
    const no4 = tenAcross(3).map((a) => (a.skill === 'count:4' ? { ...a, skill: 'count:3' } : a))
    const r = countReady(no4)
    assert.equal(r.ready, false)
    assert.deepEqual(r.missing, [4])
    // 拿給波波拿對 4 個也算
    assert.equal(countReady([...no4, at('give:4', true, '2026-11-04', 8, 1)]).ready, true)
    // 數數那一段（選項是空的）、教學卡、6 以上的都不算
    assert.equal(countReady([...no4, { ...at('count:4', true, '2026-11-04', 0, 2000) }]).ready, false)
    assert.equal(countReady([...no4, { ...at('count:4', true, '2026-11-04', 3, 2000), phase: 'teach' }]).ready, false)
    console.log('ok 2 熟練：1～5 每一個都要答對過；拿給波波算、數數那一段和教學卡不算')
  }
  {
    // 最近的 10 題才算：以前錯很多、最近都對 → 熟練
    const old = range(0, 9).map((i) => at(`count:${(i % FIRM) + 1}`, false, '2026-10-20', 3, i))
    assert.equal(countReady([...old, ...tenAcross(3)]).ready, true)
    console.log('ok 3 熟練：只看最近 10 題')
  }

  // ── 出題 ─────────────────────────────────
  const L = (mode: Lesson['mode'], n: number, max: number): Lesson => ({ mode, n, max, part: 0 })
  for (let run = 0; run < 200; run++) {
    for (let n = 1; n <= FIRM; n++)
      for (const q of compareQs(L('new', n, n))) assert.ok(q.a <= FIRM && q.b <= FIRM && q.a !== q.b, `還沒開 6 卻出了 ${q.a} 比 ${q.b}`)
    for (const q of compareQs(L('mix', 3, FIRM))) assert.ok(q.a <= FIRM && q.b <= FIRM && q.a !== q.b)
    for (const q of compareQs(L('new', 7, 7))) assert.ok(q.a <= 7 && q.b <= 7 && q.a !== q.b)
  }
  console.log('ok 4 比多少：數量不超過開放的範圍（還沒開 6 就在 5 以內），兩邊不一樣多')
  for (let run = 0; run < 200; run++) {
    for (let n = 3; n <= 10; n++) for (const q of reviewQs(L('new', n, n))) assert.equal(q.options.length, 3, `教了 ${n} 個數字，選項應該 3 個`)
    assert.equal(reviewQs(L('new', 1, 1)).length, 0, '只教了 1：不出小複習')
    assert.equal(reviewQs(L('new', 2, 2)).length, 0, '只教了 1、2：不出小複習（湊不到 3 選 1）')
    for (const q of reviewQs(L('mix', 3, FIRM))) assert.equal(q.options.length, 3)
    for (const q of reviewQs(L('mix', 2, FIRM))) assert.ok(q.n <= FIRM && q.options.every((o) => o <= FIRM))
  }
  console.log('ok 5 小複習：一律 3 選 1，只教了 1、2 的時候不出；1～5 混合複習不出 6 以上')
  for (let run = 0; run < 200; run++) {
    for (let n = 1; n <= 10; n++)
      for (const mode of ['new', 'review'] as const) {
        const g = giveRounds(L(mode, n, n))[0]
        assert.ok(g.n >= 1 && g.n <= Math.min(FIRM, n), `第 ${n} 天拿 ${g.n} 個`)
        assert.ok(g.supply > g.n && g.supply <= 7)
        if (n <= FIRM) assert.equal(g.n, n, '5 以內拿今天的數字')
      }
  }
  console.log('ok 6 拿給波波：1～5、不超過教過的、東西比要的多')
  // T-112：手寫多一些，新的數字也描兩次；比多少減成兩題來換。T-147 照舊描兩次（家長 2026-11-14）；比多少的出題照舊兩題，小遊戲只用第一題（gameQs）
  assert.equal(writeReps(L('new', 3, 3)), 2)
  for (const l of [L('new', 3, 3), L('review', 3, 3), L('mix', 3, 10)]) assert.equal(compareQs(l).length, 2)
  assert.equal(writeReps(L('review', 3, 3)), 2)
  assert.equal(writeReps(L('mix', 3, 10)), 2)
  console.log('ok 7 寫數字：一律描兩次（T-112）；比多少兩題')
  assert.equal(lineUp(3, false), true)
  assert.equal(lineUp(3, true), false)
  assert.equal(lineUp(6, true), true)
  assert.equal(lineUp(10, true), true)
  console.log('ok 8 數數：還沒熟的、6 個以上排好再數')

  // ── T-127：小火車、種花記成 give:N，熟練判斷跟拿給波波一樣 ─────────────
  {
    // 選項欄位：新玩法（plays.ts 的 giveOptions）跟拿給波波（Give.tsx：range(0, supply)，supply 是 giveRounds 的）一模一樣
    for (let n = 1; n <= FIRM; n++) {
      const g = giveRounds(L('new', n, n))[0]
      assert.deepEqual(giveOptions(n), range(0, g.supply).map(String), `拿 ${n} 個的選項不一樣`)
      assert.ok(giveOptions(n).length >= 3, `拿 ${n} 個要算進熟練（3 選 1 以上）`)
    }
    // 同一串作答，只是玩法（game）不同：熟練的結果要一模一樣
    type Rec = FirmAttempt & { game: string }
    const asPlay = (game: string, give: boolean[], days: number): Rec[] =>
      give.map((ok, i) => {
        const n = (i % FIRM) + 1
        return { game, skill: `give:${n}`, options: game === 'm-give' ? range(0, giveRounds(L('new', n, n))[0].supply).map(String) : giveOptions(n), firstTryCorrect: ok, date: `2026-11-0${(i % days) + 1}`, ts: 100 + i, phase: 'quiz' }
      })
    const cases: [boolean[], number][] = [
      [range(0, 9).map(() => true), 3],
      [range(0, 9).map((i) => i >= 2), 3],
      [range(0, 9).map((i) => i >= 3), 3],
      [range(0, 9).map(() => true), 2],
      [range(0, 4).map(() => true), 3],
    ]
    for (const [oks, days] of cases) {
      const old = countReady(asPlay('m-give', oks, days))
      for (const p of GIVE_PLAYS) assert.deepEqual(countReady(asPlay(PLAY_GAME[p], oks, days)), old, `${p}：${JSON.stringify(oks)} ${days} 天`)
      // 混著玩（每天不同玩法）也一樣
      const mixed = asPlay('m-give', oks, days).map((a, i) => ({ ...a, game: PLAY_GAME[GIVE_PLAYS[i % 3]] }))
      assert.deepEqual(countReady(mixed), old)
    }
    assert.deepEqual(Object.values(PLAY_GAME), ['m-give', 'm-train', 'm-plant'], '三種玩法的 game id 各自不同')
    console.log('ok 9 小火車、種花：記成 give:N、選項跟拿給波波一樣，熟練判斷結果一模一樣')
  }
  {
    // 今天的世界：數的東西用世界的，每一個都有「Let's count the …!」；世界關掉（不同日期都測）也照樣有東西
    for (let k = 0; k < 20; k++) {
      const d = new Date(2026, 10, 10 + k)
      const w = worldOn(d)
      const icons = countIcons(3, d)
      for (const i of icons) {
        assert.ok(w.things.includes(i), `${w.id} 那天數了 ${i}`)
        assert.ok(hasLine(`ma.count.${i}`), `${i} 沒有 Let's count 的台詞`)
      }
      assert.equal(new Set(icons).size, 3, '一堂裡三回合的東西不一樣')
    }
    for (const w of WORLDS) for (const i of w.things) assert.ok(hasLine(`ma.count.${i}`), `${w.id} 的 ${i} 沒有 Let's count 的台詞`)
    for (let n = 1; n <= FIRM; n++) for (const k of [`ma.train.${n}`, `ma.plant.${n}`]) assert.ok(hasLine(k), `${k} 沒有台詞`)
    console.log('ok 10 今天的世界：數數、拿給波波、比多少用世界的東西，每個都有台詞')
  }

  // ── T-147：開場玩著數數、小遊戲、舊進度 ─────────────────────────────
  {
    // M1 固定的比法（家長家裡的：從食指開始）：1 食指、2 加中指、3 加無名指、4 加小指、5 整個手掌；6 以上第二隻手照同樣的比法
    assert.deepEqual(FINGER_ORDER, ['index', 'middle', 'ring', 'pinky', 'thumb'])
    assert.deepEqual(fingersUp(0), [[], []])
    assert.deepEqual(fingersUp(1), [['index'], []])
    assert.deepEqual(fingersUp(3), [['index', 'middle', 'ring'], []])
    assert.deepEqual(fingersUp(5), [['index', 'middle', 'ring', 'pinky', 'thumb'], []])
    assert.deepEqual(fingersUp(7), [['index', 'middle', 'ring', 'pinky', 'thumb'], ['index', 'middle']])
    assert.deepEqual(fingersUp(10)[1], [...FINGER_ORDER])
    // 每次比同一個數都一樣（每天都一樣，不換）
    for (let k = 1; k <= 10; k++) assert.deepEqual(fingersUp(k), fingersUp(k))
    for (let k = 1; k < 10; k++) assert.ok(fingersUp(k + 1).flat().length === k + 1, `比 ${k + 1} 要伸 ${k + 1} 根`)
    console.log('ok 11 手指數數（M1）：固定從食指開始比，5 是整個手掌，6 以上第二隻手照同樣的比法')
  }
  {
    // M3 找找看：要找的 ≤ 5 個、干擾物少（2～3 個）而且不是同一類、位置不重疊；今天的數字超過 5 改成動作數數
    for (let run = 0; run < 300; run++)
      for (let n = 1; n <= FIND_MAX; n++) {
        const { thing, spots } = findScene(n)
        const targets = spots.filter((x) => x.target)
        const others = spots.filter((x) => !x.target)
        assert.equal(targets.length, n, `找 ${n} 個`)
        assert.ok(targets.every((x) => x.icon === thing.icon))
        assert.ok(others.length >= 2 && others.length <= 3, `干擾物 ${others.length} 個`)
        assert.ok(others.every((x) => (FIND_DISTRACTORS as readonly string[]).includes(x.icon) && x.icon !== thing.icon))
        assert.equal(new Set(spots.map((x) => `${x.x},${x.y}`)).size, spots.length, '位置不重疊')
      }
    for (const p of WARM_PLAYS) for (let n = 1; n <= 10; n++) assert.ok(warmFor(p, n) !== 'find' || n <= FIND_MAX, `${p} ${n}`)
    assert.equal(warmFor('find', 6), 'hop')
    assert.equal(warmFor('find', 5), 'find')
    assert.equal(warmFor('fingers', 8), 'fingers')
    console.log('ok 12 找找看（M3）：要找的 ≤ 5、干擾物 2～3 個不同類、位置不重疊；超過 5 改成動作數數')
  }
  {
    // 台詞：三種玩法的題目、總數；每點一下念的 m.num.N
    for (let n = 1; n <= 10; n++)
      for (const k of [`ma.hop.go.${n}`, `ma.hop.total.${n}`, `ma.fingers.show.${n}`, `ma.fingers.total.${n}`, `m.num.${n}`, `ma.pop.${n}`]) assert.ok(hasLine(k), `${k} 沒有台詞`)
    for (const t of FIND_THINGS) for (let n = 1; n <= FIND_MAX; n++) for (const k of [`ma.find.${t.icon}.${n}`, `ma.found.${t.icon}.${n}`]) assert.ok(hasLine(k), `${k} 沒有台詞`)
    // C1：下課給大人的一句，有今天的數字、同一天固定同一句
    for (let n = 1; n <= 10; n++) {
      const d = new Date(2026, 10, 14)
      assert.equal(homeTip(n, d), homeTip(n, new Date(2026, 10, 14, 20)))
      assert.ok(/[一兩三四五六七八九十]/.test(homeTip(n, d)))
    }
    assert.notEqual(homeTip(3, new Date(2026, 10, 14)), homeTip(3, new Date(2026, 10, 15)), '每天換一句')
    console.log('ok 13 開場的台詞都有；下課給大人的一句（C1）同一天固定、隔天換')
  }
  {
    // 小遊戲：比多少 1 題（照舊的範圍）、找數字 1 題（3 選 1，答案是今天的數字）；只教了 1、2 只有比多少
    for (let run = 0; run < 200; run++) {
      for (let n = 1; n <= 10; n++) {
        for (const mode of ['new', 'review'] as const) {
          const g = gameQs(L(mode, n, n))
          const cap = Math.max(FIRM, n)
          assert.ok(g.compare.a <= cap && g.compare.b <= cap && g.compare.a !== g.compare.b)
          if (n < 3) assert.equal(g.find, null, `只教了 ${n} 不出找數字`)
          else {
            assert.ok(g.find && g.find.kind === 'find' && g.find.n === n && g.find.options.length === 3, `第 ${n} 天找數字`)
            assert.ok(g.find!.options.every((o) => o >= 1 && o <= n), '選項只用教過的')
          }
        }
      }
      const g = gameQs(L('mix', 2, FIRM))
      assert.ok(g.find && g.find.options.every((o) => o <= FIRM))
    }
    assert.equal(writeReps(L('new', 3, 3)), 2, '描數字照舊兩次（家長 2026-11-14）')
    console.log('ok 14 小遊戲：比多少 1 題、找數字 1 題（3 選 1），只教了 1、2 的那兩天只有比多少；描數字兩次')
  }
  {
    // 舊進度（T-147 以前，沒有 pv）：part 是舊的五段的位置，對到新流程（比多少、小複習 → 小遊戲）
    const at = (name: (typeof PARTS)[number]) => PARTS.indexOf(name)
    assert.deepEqual(PARTS, ['warm', 'count', 'give', 'game', 'write'])
    assert.equal(resumePart({ part: 0 }), at('count'), '舊的數數')
    assert.equal(resumePart({ part: 1 }), at('give'), '舊的拿給波波')
    assert.equal(resumePart({ part: 2 }), at('game'), '舊的比多少 → 小遊戲')
    assert.equal(resumePart({ part: 3 }), at('write'), '舊的寫數字')
    assert.equal(resumePart({ part: 4 }), at('game'), '舊的小複習 → 小遊戲')
    assert.equal(resumePart({ part: 5 }), PARTS.length, '舊的上完了')
    assert.equal(resumePart({}), at('count'), '沒有 part 的舊進度從數數開始')
    // 新進度：看 partId（PARTS 再換也對得回來）
    assert.equal(resumePart({ pv: 2, part: 3, partId: 'game' }), at('game'))
    assert.equal(resumePart({ pv: 2, part: 1, partId: 'write' }), at('write'), 'partId 優先')
    assert.equal(resumePart({ pv: 2, part: 5, partId: 'done' }), PARTS.length)
    assert.equal(resumePart({ pv: 2, part: 2 }), 2)
    console.log('ok 15 進度：舊格式（沒有 pv）照舊的五段換算；新格式記 partId')
  }
  console.log('ALL PASS')
}

main()
