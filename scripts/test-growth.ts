// 成長系統 G-1 的純函式（src/lib/growth.ts）：月齡、年段、4 週放寬、家長覆寫。不碰資料庫。
// 執行：npx tsx scripts/test-growth.ts
// 測試用的生日都是虛構的（以 2030 年為「今天」往回推），不是任何真實孩子的生日。
import assert from 'node:assert/strict'
import { BANDS, FRAMES, RAMP_WEEK, type Band } from '../src/content/growth'
import { bandForMonths, blendFrame, monthsOld, rampWeek, reconcile, statusOf, targetBand, validBirth, type GrowthState, type Profile } from '../src/lib/growth'
import { asksHowOf, bandOf, capOptions, hintDelayOf, idleTimesOf, maxTeachOf, optionCapOf, retryLineOf, roundItemsOf, wrongStepOf } from '../src/games/frame'

const P = (birth: string): Profile => ({ birth, setAt: 0 })
const EMPTY: GrowthState = { locks: {} }
/** 從某一天往後 n 天 */
const plus = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// 1. 月齡：生日只記到月，當月算 0 個月
assert.equal(monthsOld('2027-01', '2030-03-15'), 38)
assert.equal(monthsOld('2027-03', '2030-03-01'), 36)
assert.equal(monthsOld('2027-13', '2030-03-01'), null)
assert.equal(monthsOld('2027-3', '2030-03-01'), null)
assert.ok(validBirth('2027-01', '2030-03-15'))
assert.ok(!validBirth('2030-04', '2030-03-15'), '未來的生日不行')
assert.ok(!validBirth('2010-01', '2030-03-15'), '超過 12 歲不行')
console.log('ok 1 月齡')

// 2. 年段：未滿 3 歲也是小班段，48 個月起中班段，60 個月起大班段，6 歲以上停在大班段
assert.deepEqual([20, 35, 36, 47, 48, 59, 60, 72, 100].map(bandForMonths), ['small', 'small', 'small', 'small', 'middle', 'middle', 'big', 'big', 'big'])
console.log('ok 2 年段邊界')

// 3. 沒設生日：小班段、外框就是小班段，不寫任何東西
{
  const t = targetBand(null, EMPTY, '2030-03-15')
  assert.deepEqual(t, { band: 'small', source: 'default', ageBand: 'small' })
  const r = reconcile(null, EMPTY, '2030-03-15')
  assert.equal(r.growth, EMPTY, '沒設生日不必寫回 kv')
  assert.equal(r.log.length, 0)
  assert.equal(statusOf(null, EMPTY, '2030-03-15').frame, FRAMES.small)
  console.log('ok 3 沒設生日＝小班段，什麼都不寫')
}

// 4. 外框表照設計 v0.3.1 §1.2（準則第十四章 FRAME-1～11）
{
  const { small: s, middle: m, big: b } = FRAMES
  // FRAME-1、2：觸控大小不縮小，三段都最多 4 個選項、新內容先 2 個
  for (const f of [s, m, b]) {
    assert.deepEqual([f.touchCm, f.primaryCm, f.gapCm], [2, 2.5, 0.6])
    assert.deepEqual([f.maxOptions, f.newOptions], [4, 2])
    // FRAME-8：一回合最多 1 個新概念
    assert.equal(f.newPerRound, 1)
  }
  assert.deepEqual([s.drag, m.drag, b.drag], ['tap', 'short', 'long'])
  // FRAME-4
  assert.deepEqual([s.maxWords, m.maxWords, b.maxWords], [6, 8, 10])
  assert.deepEqual([s.steps, m.steps, b.steps], [[1, 2], [2, 2], [2, 3]])
  // FRAME-5
  assert.deepEqual([s.roundItems, m.roundItems, b.roundItems], [[3, 5], [4, 6], [5, 8]])
  assert.deepEqual([s.roundMinutes, m.roundMinutes, b.roundMinutes], [3, 5, 6])
  // FRAME-6、7
  assert.deepEqual([s.dailyMinutes, m.dailyMinutes, b.dailyMinutes], [20, 25, 30])
  assert.deepEqual([s.eyeBreakEvery, m.eyeBreakEvery, b.eyeBreakEvery], [[10, 10], [10, 10], [10, 15]])
  // FRAME-8、9、10
  assert.deepEqual([s.weeklyConcepts, m.weeklyConcepts, b.weeklyConcepts], [[2, 2], [2, 3], [3, 3]])
  assert.deepEqual([s.idleSec, m.idleSec, b.idleSec], [[8, 15, 30], [10, 20, 40], [12, 25, 45]])
  assert.deepEqual([s.hintDelayMs, m.hintDelayMs, b.hintDelayMs], [4000, 5000, 6000])
  assert.deepEqual([s.afterWrong, m.afterWrong, b.afterWrong], ['retry', 'contrast', 'findStep'])
  // FRAME-11
  assert.deepEqual([s.story.segment, m.story.segment, b.story.segment], [[1, 3], [3, 5], [5, 8]])
  assert.deepEqual([s.story.sentences, m.story.sentences, b.story.sentences], [[8, 10], [12, 15], [20, 30]])
  assert.deepEqual([s.story.words, m.story.words, b.story.words], [45, 100, 200])
  assert.deepEqual([s.storyChoices, m.storyChoices, b.storyChoices], [0, 1, 2])
  // 年段往上，外框只會變寬，不會變窄
  for (let i = 1; i < BANDS.length; i++) {
    const a = FRAMES[BANDS[i - 1]]
    const c = FRAMES[BANDS[i]]
    assert.ok(c.touchCm >= a.touchCm && c.maxOptions >= a.maxOptions && c.maxWords >= a.maxWords && c.dailyMinutes >= a.dailyMinutes && c.hintDelayMs >= a.hintDelayMs)
    assert.ok(c.idleSec.every((x, k) => x >= a.idleSec[k]) && c.roundItems[1] >= a.roundItems[1])
  }
  // 每一項都排在放寬的某一週
  for (const k of Object.keys(FRAMES.small)) assert.ok(k in RAMP_WEEK, `${k} 沒有排在放寬的哪一週`)
  console.log('ok 4 外框表')
}

// 5. 第一次設生日、已經是中班段：從小班段開始 4 週放寬
{
  const day = '2030-03-15'
  const p = P('2026-01') // 50 個月
  const r = reconcile(p, EMPTY, day)
  assert.deepEqual(r.growth.ramp, { from: 'small', to: 'middle', start: day })
  assert.equal(r.growth.band, undefined, '放寬完才算換段')
  assert.deepEqual(r.log, [{ kind: 'band', data: { from: 'small', to: 'middle', step: 'start' } }])
  // 同一天再整理一次：不變
  assert.equal(reconcile(p, r.growth, day).growth, r.growth)

  const weeks: number[] = []
  for (let n = 0; n < 28; n += 7) weeks.push(rampWeek(r.growth.ramp, plus(day, n)))
  assert.deepEqual(weeks, [1, 2, 3, 4])
  assert.equal(rampWeek(r.growth.ramp, plus(day, 27)), 4)
  assert.equal(rampWeek(r.growth.ramp, plus(day, 28)), 0)

  // 第 1 週只換時間；句長、操作、選項都還是小班段
  const w1 = statusOf(p, r.growth, day)
  assert.equal(w1.band, 'middle')
  assert.deepEqual(w1.ramp, { from: 'small', to: 'middle', start: day, week: 1 })
  assert.equal(w1.frame.dailyMinutes, 25)
  assert.deepEqual(w1.frame.roundItems, [4, 6])
  assert.deepEqual(w1.frame.idleSec, [10, 20, 40])
  assert.equal(w1.frame.maxWords, 6)
  assert.equal(w1.frame.drag, 'tap')
  assert.equal(w1.frame.maxOptions, 4)
  // 第 2 週句長，第 3 週操作，第 4 週選項與觸控
  const w2 = statusOf(p, r.growth, plus(day, 7)).frame
  assert.equal(w2.maxWords, 8)
  assert.equal(w2.drag, 'tap')
  const w3 = statusOf(p, r.growth, plus(day, 14)).frame
  assert.equal(w3.drag, 'short')
  assert.equal(w3.maxOptions, 4)
  const w4 = statusOf(p, r.growth, plus(day, 21)).frame
  // 中班段的選項上限、觸控大小跟小班段一樣（v0.3.1 不縮小、不加選項），第 4 週換過去也不變
  assert.equal(w4.maxOptions, 4)
  assert.equal(w4.primaryCm, 2.5)
  assert.equal(w4.newOptions, 2)

  // 4 週後：換段完成
  const done = reconcile(p, r.growth, plus(day, 28))
  assert.equal(done.growth.band, 'middle')
  assert.equal(done.growth.ramp, undefined)
  assert.deepEqual(done.log, [{ kind: 'band', data: { from: 'small', to: 'middle', step: 'done' } }])
  assert.equal(statusOf(p, done.growth, plus(day, 28)).frame, FRAMES.middle)
  console.log('ok 5 跨段 4 週放寬：時間 → 句長 → 操作 → 選項與觸控')
}

// 6. 每一週的混合外框：該週以前的項目是新年段，以後的是舊年段
for (const [from, to] of [['small', 'middle'], ['middle', 'big'], ['small', 'big']] as [Band, Band][]) {
  for (let week = 1; week <= 4; week++) {
    const f = blendFrame(from, to, week)
    for (const k of Object.keys(RAMP_WEEK) as (keyof typeof RAMP_WEEK)[]) assert.deepEqual(f[k], (RAMP_WEEK[k] <= week ? FRAMES[to] : FRAMES[from])[k], `${from}→${to} 第 ${week} 週的 ${k}`)
  }
}
console.log('ok 6 每週的混合外框')

// 7. 生日當月第一天跨段（一直有在玩）：那天開始放寬
{
  const p = P('2026-04') // 2030-03 是 47 個月，2030-04 滿 48 個月
  const before = reconcile(p, EMPTY, '2030-03-31')
  assert.equal(before.log.length, 0)
  assert.equal(before.growth.ramp, undefined)
  const on = reconcile(p, before.growth, '2030-04-01')
  assert.deepEqual(on.growth.ramp, { from: 'small', to: 'middle', start: '2030-04-01' })
  console.log('ok 7 生日月第一天開始放寬')
}

// 8. 往下換段當天就換：家長把生日改小
{
  const mid: GrowthState = { locks: {}, band: 'middle' }
  const r = reconcile(P('2027-01'), mid, '2030-03-15') // 38 個月
  assert.equal(r.growth.band, 'small')
  assert.equal(r.growth.ramp, undefined)
  assert.deepEqual(r.log, [{ kind: 'band', data: { from: 'middle', to: 'small', step: 'down' } }])
  // 放寬到一半發現生日設錯：取消放寬，回到原本確定的年段
  const ramping: GrowthState = { locks: {}, ramp: { from: 'small', to: 'middle', start: '2030-03-10' } }
  const back = reconcile(P('2027-01'), ramping, '2030-03-15')
  assert.equal(back.growth.ramp, undefined)
  assert.equal(back.growth.band, 'small')
  assert.equal(statusOf(P('2027-01'), back.growth, '2030-03-15').frame, FRAMES.small)
  // 放寬到一半改成更大：從確定的年段重新開始
  const re = reconcile(P('2025-01'), ramping, '2030-03-15') // 62 個月
  assert.deepEqual(re.growth.ramp, { from: 'small', to: 'big', start: '2030-03-15' })
  console.log('ok 8 往下當天換；放寬中改生日會重新算')
}

// 9. 家長覆寫：當天就換、不放寬；到期後回到跟著年齡
{
  const p = P('2027-01') // 38 個月，照年齡是小班段
  const ov: GrowthState = { locks: {}, override: { band: 'big', until: '2030-04-01', setAt: 0 } }
  const t = targetBand(p, ov, '2030-03-15')
  assert.deepEqual(t, { band: 'big', source: 'override', months: 38, ageBand: 'small' })
  const r = reconcile(p, ov, '2030-03-15')
  assert.equal(r.growth.band, 'big')
  assert.equal(r.growth.ramp, undefined)
  assert.equal(statusOf(p, r.growth, '2030-03-15').frame, FRAMES.big)
  // 到期日當天起回到年齡（往下，當天換）
  const after = reconcile(p, r.growth, '2030-04-01')
  assert.equal(targetBand(p, r.growth, '2030-04-01').source, 'age')
  assert.equal(after.growth.band, 'small')
  // 提早一段、延後一段跟著年齡走，到頂、到底就停
  const shift = (s: -1 | 1, birth: string) => targetBand(P(birth), { locks: {}, override: { shift: s, setAt: 0 } }, '2030-03-15').band
  assert.equal(shift(1, '2027-01'), 'middle')
  assert.equal(shift(-1, '2027-01'), 'small')
  assert.equal(shift(1, '2025-01'), 'big')
  assert.equal(shift(-1, '2025-01'), 'middle')
  // 沒設生日也能覆寫
  assert.equal(targetBand(null, { locks: {}, override: { band: 'middle', setAt: 0 } }, '2030-03-15').band, 'middle')
  // 覆寫放寬中的孩子：取消放寬，直接用覆寫的年段
  const ramping: GrowthState = { locks: {}, ramp: { from: 'small', to: 'middle', start: '2030-03-10' }, override: { band: 'small', setAt: 0 } }
  const o = reconcile(P('2026-01'), ramping, '2030-03-15')
  assert.equal(o.growth.ramp, undefined)
  assert.equal(o.growth.band, 'small')
  // 鎖定支線不受影響
  const locked: GrowthState = { locks: { 'num:count': 2 } }
  assert.deepEqual(reconcile(P('2026-01'), locked, '2030-03-15').growth.locks, { 'num:count': 2 })
  console.log('ok 9 家長覆寫')
}

// 10. 遊戲怎麼讀外框（G-3，src/games/frame.ts）：三段都照外框；小班段一回合也照準則改短（家長 2026-10-30 決定），沒設生日＝小班段
{
  const day = '2030-03-15'
  const small = statusOf(null, EMPTY, day)
  const fixed = (band: Band) => statusOf(null, reconcile(null, { locks: {}, override: { band, setAt: 0 } }, day).growth, day)
  const middle = fixed('middle')
  const big = fixed('big')
  assert.equal(middle.frame, FRAMES.middle)
  assert.equal(bandOf(big, 'drag'), 'big')

  // 小班段（沒設生日）：選擇題 6 題 → 5 題、最多教 1 個（LOAD-3、ADAPT-3）；選項數不動、閒置 15／15／40 秒、延遲提示照 adaptive、錯 2 次就標出答案
  assert.equal(small.source, 'default')
  assert.deepEqual([3, 4, 6, 9].map((n) => roundItemsOf(small, n)), [3, 4, 5, 5])
  assert.equal(maxTeachOf(small, 2), 1)
  // 家長把年段固定在小班段，跟沒設生日一樣
  const fixedSmall = fixed('small')
  assert.equal(roundItemsOf(fixedSmall, 6), 5)
  assert.equal(maxTeachOf(fixedSmall, 2), 1)
  assert.equal(optionCapOf(small, true), null)
  assert.deepEqual(idleTimesOf(small), { repeat: 15_000, hint: 15_000, again: 40_000 })
  assert.equal(hintDelayOf(small, 4000), 4000)
  assert.equal(hintDelayOf(small, 7000), 7000)
  assert.deepEqual([1, 2, 3].map((n) => wrongStepOf(small, n)), ['retry', 'reveal', 'reveal'])
  assert.equal(retryLineOf(small), 'retry')
  assert.equal(asksHowOf(small), false)

  // 中班段：題數夾在 4–6、一回合最多 1 個新的、新內容 2 個選項、閒置 20／20／40、延遲 +1 秒、多一層「哪裡不一樣？」
  assert.deepEqual([3, 4, 6, 9].map((n) => roundItemsOf(middle, n)), [4, 4, 6, 6])
  assert.equal(maxTeachOf(middle, 2), 1)
  assert.deepEqual([optionCapOf(middle, true), optionCapOf(middle, false)], [2, 4])
  assert.deepEqual(idleTimesOf(middle), { repeat: 20_000, hint: 20_000, again: 40_000 })
  assert.equal(hintDelayOf(middle, 4000), 5000)
  assert.deepEqual([1, 2, 3].map((n) => wrongStepOf(middle, n)), ['retry', 'contrast', 'reveal'])
  assert.equal(retryLineOf(middle), 'think')
  assert.equal(asksHowOf(middle), false)

  // 大班段：題數夾在 5–8、閒置 25／20／45、延遲 +2 秒（不超過上限 10 秒）、換個方法、答對後問 How did you know?
  assert.deepEqual([3, 6, 8].map((n) => roundItemsOf(big, n)), [5, 6, 8])
  assert.deepEqual(idleTimesOf(big), { repeat: 25_000, hint: 20_000, again: 45_000 })
  assert.equal(hintDelayOf(big, 4000), 6000)
  assert.equal(hintDelayOf(big, 9500), 10_000)
  assert.equal(retryLineOf(big), 'another')
  assert.equal(asksHowOf(big), true)

  // 放寬中：每一項照它那一週是哪一段（第 1 週題數、閒置換了；第 4 週才換選項）
  const p = P('2026-01')
  const ramp = reconcile(p, EMPTY, day).growth
  const w1 = statusOf(p, ramp, day)
  assert.equal(roundItemsOf(w1, 3), 4)
  assert.deepEqual(idleTimesOf(w1), idleTimesOf(middle))
  assert.equal(maxTeachOf(w1, 2), 1)
  assert.equal(optionCapOf(w1, true), null)
  const w3 = statusOf(p, ramp, plus(day, 14))
  assert.equal(maxTeachOf(w3, 2), 1)
  assert.equal(optionCapOf(w3, true), null)
  assert.equal(optionCapOf(statusOf(p, ramp, plus(day, 21)), true), 2)

  // 只留幾個選項時答案一定在，其他照原本的順序；不用刪的回傳同一個陣列
  const opts = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  assert.deepEqual(capOptions(opts, 'd', 2).map((o) => o.id), ['a', 'd'])
  assert.deepEqual(capOptions(opts, 'a', 3).map((o) => o.id), ['a', 'b', 'c'])
  assert.equal(capOptions(opts, 'a', 4), opts)
  assert.equal(capOptions(opts, 'a', null), opts)
  console.log('ok 10 遊戲讀外框：小班段（沒設生日）一回合 5 題、教 1 個；中班段大班段照外框；放寬中逐項換')
}

console.log('ALL PASS')
