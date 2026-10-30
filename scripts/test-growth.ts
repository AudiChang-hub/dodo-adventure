// 成長系統 G-1 的純函式（src/lib/growth.ts）：月齡、年段、4 週放寬、家長覆寫。不碰資料庫。
// 執行：npx tsx scripts/test-growth.ts
// 測試用的生日都是虛構的（以 2030 年為「今天」往回推），不是任何真實孩子的生日。
import assert from 'node:assert/strict'
import { BANDS, FRAMES, RAMP_WEEK, type Band } from '../src/content/growth'
import { bandForMonths, blendFrame, monthsOld, rampWeek, reconcile, statusOf, targetBand, validBirth, type GrowthState, type Profile } from '../src/lib/growth'

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

// 4. 小班段的外框就是 App 現在的樣子（T-49 的數字）
{
  const f = FRAMES.small
  assert.equal(f.maxOptions, 4)
  assert.equal(f.drag, 'tap')
  assert.equal(f.maxWords, 6)
  assert.deepEqual(f.roundItems, [3, 5])
  assert.equal(f.dailyMinutes, 20)
  assert.equal(f.hintDelayMs, 4000)
  assert.equal(f.newPerRound, 2)
  assert.deepEqual(f.weeklyConcepts, [2, 2])
  // 年段往上，外框只會變寬，不會變窄（觸控大小例外：大班段要放比較多個字母卡）
  for (let i = 1; i < BANDS.length; i++) {
    const a = FRAMES[BANDS[i - 1]]
    const b = FRAMES[BANDS[i]]
    assert.ok(b.maxOptions >= a.maxOptions && b.maxWords >= a.maxWords && b.dailyMinutes >= a.dailyMinutes && b.hintDelayMs >= a.hintDelayMs)
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
  assert.deepEqual(w1.frame.roundItems, [5, 7])
  assert.equal(w1.frame.maxWords, 6)
  assert.equal(w1.frame.drag, 'tap')
  assert.equal(w1.frame.maxOptions, 4)
  // 第 2 週句長，第 3 週操作，第 4 週選項與觸控
  const w2 = statusOf(p, r.growth, plus(day, 7)).frame
  assert.equal(w2.maxWords, 9)
  assert.equal(w2.drag, 'tap')
  const w3 = statusOf(p, r.growth, plus(day, 14)).frame
  assert.equal(w3.drag, 'short')
  assert.equal(w3.maxOptions, 4)
  const w4 = statusOf(p, r.growth, plus(day, 21)).frame
  assert.equal(w4.maxOptions, 5)
  assert.equal(w4.primaryCm, 2.2)

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

console.log('ALL PASS')
