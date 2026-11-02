// 下一步準備度（src/lib/readiness.ts）的單元測試：用假的作答紀錄（各種程度的孩子）算每一條，跟手算的一樣。
// 執行：npx tsx scripts/test-readiness.ts（npm run verify 的「單元：下一步準備度」）
// 驗收（docs/全球幼教指引-現況對照.md A2、A4）：只有二選一答對的不算熟練；同一天答對 10 次不算；3 天、10 題對 9 題、隔天複習過才算。
import assert from 'node:assert/strict'
import type { Attempt } from '../src/lib/db'
import { mastery, readiness, OBSERVE, type LessonRun } from '../src/lib/readiness'

let seq = 0
/** 一題：哪一天、哪個技能、幾個選項、第一次對不對 */
function q(date: string, skill: string, ok: boolean, nOpts = 3, extra: Partial<Attempt> = {}): Attempt {
  seq++
  const station = skill.startsWith('zhtext') ? 'mandarin' : skill.startsWith('letter') || skill.startsWith('phonics') ? 'english' : 'math'
  return {
    id: `a${seq}`,
    ts: Date.parse(`${date}T10:00:00`) + seq,
    date,
    sessionId: 's',
    station,
    game: 'g',
    itemId: skill,
    skill,
    phase: 'quiz',
    level: 1,
    options: Array.from({ length: nOpts }, (_, i) => String(i)),
    answer: '0',
    taps: [],
    firstTryCorrect: ok,
    attempts: ok ? 1 : 2,
    responseMs: 1500,
    hintUsed: false,
    synced: 0,
    ...extra,
  } as Attempt
}
/** 一個技能在這幾天各答幾題（全對） */
const days = (skill: string, ds: string[], each: number, nOpts = 3) => ds.flatMap((d) => Array.from({ length: each }, () => q(d, skill, true, nOpts)))

// 1. 只有二選一答對的不算熟練
{
  const xs = days('num:3', ['2026-11-01', '2026-11-04', '2026-11-07'], 4, 2)
  const m = mastery(xs, 'num:3')
  assert.equal(m.ok, false)
  assert.equal(m.recent, 0)
  console.log('ok 1 只有二選一答對的不算熟練')
}

// 2. 三選一、同一天答 10 題全對：不算（要分在 3 天，也沒有隔天再考）
{
  const xs = days('num:3', ['2026-11-01'], 10)
  const m = mastery(xs, 'num:3')
  assert.equal(m.right, 10)
  assert.equal(m.days, 1)
  assert.equal(m.ok, false)
  console.log('ok 2 同一天答對 10 次不算')
}

// 3. 3 天、10 題對 9 題、隔 3 天再考還是對：算
{
  const xs = [...days('num:3', ['2026-11-01'], 4), q('2026-11-01', 'num:3', false), ...days('num:3', ['2026-11-02'], 2), ...days('num:3', ['2026-11-05'], 3)]
  const m = mastery(xs, 'num:3')
  assert.deepEqual([m.recent, m.right, m.days, m.retained, m.ok], [10, 9, 3, true, true])
  console.log('ok 3 三天、10 題對 9 題、隔天複習過：熟練')
}

// 4. 天天練、從來沒隔兩天：記不記得住還不知道，不算
{
  const xs = days('num:3', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], 3)
  const m = mastery(xs, 'num:3')
  assert.equal(m.retained, false)
  assert.equal(m.ok, false)
  assert.match(m.need, /隔 2 天/)
  console.log('ok 4 天天練沒有隔天再考：還不算')
}

// 5. 10 題只對 7 題：不算；教學卡不算、選錯第一次的不算對
{
  const xs = [...days('count:4', ['2026-11-01', '2026-11-04', '2026-11-07'], 2), ...[1, 2, 3, 4].map(() => q('2026-11-08', 'count:4', false)), q('2026-11-08', 'count:4', true, 3, { phase: 'teach' })]
  const m = mastery(xs, 'count:4')
  assert.equal(m.recent, 10)
  assert.equal(m.right, 6)
  assert.equal(m.ok, false)
  console.log('ok 5 最近 10 題對不到 8 題、教學卡不算')
}

// 6. 數數（不是選擇題，選項是空的）照算；比多少（只有兩邊）要 10 題對 9 題
{
  const c = mastery(days('count:2', ['2026-11-01', '2026-11-03', '2026-11-06'], 4, 0), 'count:2')
  assert.equal(c.ok, true)
  const eight = [...days('compare:more', ['2026-11-01', '2026-11-03', '2026-11-06'], 3, 2), q('2026-11-06', 'compare:more', false, 2), q('2026-11-06', 'compare:more', false, 2)]
  assert.equal(mastery(eight, 'compare:more').ok, false)
  const nine = [...days('compare:more', ['2026-11-01', '2026-11-03', '2026-11-06'], 3, 2), q('2026-11-06', 'compare:more', false, 2), q('2026-11-07', 'compare:more', true, 2)]
  assert.equal(mastery(nine, 'compare:more').ok, true)
  console.log('ok 6 數數照算、比多少要 10 題對 9 題')
}

// 7. 整體：剛開始的孩子（什麼都還沒有）→ 再等等，每一條都說得出還差什麼
{
  const r = readiness({ attempts: [], runs: [], observation: null, today: '2026-11-10' })
  assert.equal(r.ready, false)
  assert.deepEqual(
    r.items.map((x) => [x.id, x.ok]),
    [['NEXT-1', false], ['NEXT-2', false], ['NEXT-3', false], ['NEXT-4', false], ['NEXT-5', false], ['NEXT-6', true]],
  )
  assert.match(r.items[0].detail, /有幾個 1、2、3、4、5/)
  assert.match(r.advice, /再等等/)
  console.log('ok 7 剛開始：再等等，每一條都寫還差什麼')
}

// 8. 整體：都做到的孩子 → 可以開始 4 歲；家長勾了「有壓力」→ 先不要往下走
{
  const D = ['2026-10-20', '2026-10-23', '2026-10-27']
  const xs: Attempt[] = []
  for (let n = 1; n <= 5; n++) for (const k of ['count', 'num', 'give']) xs.push(...days(`${k}:${n}`, D, 4))
  for (const k of ['more', 'less']) xs.push(...days(`compare:${k}`, D, 4, 2))
  for (const L of 'ABCDEFGHIJ') xs.push(...days(`letter:${L}`, D, 4))
  xs.push(...days('phonics:a', D, 7))
  xs.push(...days('zhtext:烏龜', D, 7))
  const runs: LessonRun[] = Array.from({ length: 10 }, (_, i) => ({ subject: 'math', date: `2026-10-${20 + i}`, start: 1, done: 2 }))
  const obs = { date: '2026-10-25', checks: OBSERVE.slice(0, 6).map((o) => o.id), stress: false }
  const r = readiness({ attempts: xs, runs, observation: obs, today: '2026-10-30' })
  assert.deepEqual(r.items.filter((x) => !x.ok).map((x) => `${x.id} ${x.detail}`), [])
  assert.equal(r.ready, true)
  assert.match(r.advice, /可以開始 4 歲/)
  const s = readiness({ attempts: xs, runs, observation: { ...obs, stress: true }, today: '2026-10-30' })
  assert.equal(s.ready, false)
  assert.equal(s.items[5].ok, false)
  assert.match(s.advice, /先不要往下走/)
  // 觀察超過一個月：要再勾一次
  const old = readiness({ attempts: xs, runs, observation: obs, today: '2026-12-01' })
  assert.equal(old.items[4].ok, false)
  assert.match(old.items[4].detail, /超過一個月/)
  console.log('ok 8 都做到：可以開始 4 歲；有壓力或觀察過期：不行')
}

// 9. 中途離開：最近 2 週 5 堂離開 2 堂（40%）→ NEXT-4 不行；最近一週離開變多 → NEXT-6 警訊
{
  const runs: LessonRun[] = [
    { subject: 'math', date: '2026-11-01', start: 1, done: 2 },
    { subject: 'math', date: '2026-11-02', start: 1, done: 2 },
    { subject: 'math', date: '2026-11-08', start: 1, done: 2 },
    { subject: 'english', date: '2026-11-09', start: 1 },
    { subject: 'english', date: '2026-11-10', start: 1 },
  ]
  const r = readiness({ attempts: [], runs, observation: null, today: '2026-11-10' })
  assert.equal(r.items[3].ok, false)
  assert.match(r.items[3].detail, /中途離開 40%/)
  assert.equal(r.items[5].ok, false)
  assert.match(r.items[5].detail, /中途離開 67%/)
  console.log('ok 9 中途離開太多：學習的樣子沒過、警訊')
}

console.log('ALL PASS')
