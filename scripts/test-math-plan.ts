// 數學課出題（src/lessons/math/plan.ts）：1～5 熟練了才開 6（countReady）、比多少不超出開放的範圍、找數字教過 3 個以後 3 選 1、
// 拿給波波只用 1～5、描數字的次數、6 個以上排好再數。對照 docs/全球幼教指引-現況對照.md A1、A5、AI 小男生測試 #8。
// 執行：npx tsx scripts/test-math-plan.ts
import assert from 'node:assert/strict'
import { FIRM, compareQs, countReady, giveRounds, lineUp, range, reviewQs, writeReps, type FirmAttempt, type Lesson } from '../src/lessons/math/plan'

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
  // T-112：手寫多一些，新的數字也描兩次；比多少減成兩題來換
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
  console.log('ALL PASS')
}

main()
