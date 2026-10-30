// 成長系統 G-2「支線與階梯」的單元測試（docs/成長系統設計.md §1.3、§1.4、§5.4）：
// 前置條件、穩固、遷移、卡關保險、回補、舊資料升級（補記）、家長鎖支線、依支線的負擔控制、太順加速、內容庫存、
// 一回合最多 1 個新概念（FRAME-8）、描字母那一階。
// 執行：npx tsx scripts/test-ladder.ts（失敗就 exit 1）
import assert from 'node:assert/strict'
import { addDays, contentWeeks, isFirm, ladderCalc, stepLadder, emptyLadder, type LadderFacts, type LadderState, type SkillView } from '../src/lib/growth'
import { fastStrands, strandLoad } from '../src/lib/tracks'
import { RUNGS, entryRung, levelRung, strandOfSkill, unitOfSkill, unitsOf } from '../src/content/ladder'
import type { Attempt } from '../src/lib/db'

// 學習引擎會順手寫 IndexedDB，Node 裡沒有：忽略那些錯誤
process.on('unhandledRejection', () => {})

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

// ── 造資料 ─────────────────────────────────────────────────
type Sk = Partial<SkillView> & { games?: string[] }
/** firm：已熟＋兩次到期複習；mastered：已熟但還沒複習；seen：學過但不熟 */
const FIRM: Sk = { box: 4, rev: 2, seen: 8 }
const MASTERED: Sk = { box: 3, rev: 0, seen: 4 }
const SEEN: Sk = { box: 1, seen: 2 }
function facts(rows: Record<string, Sk>): LadderFacts {
  const skills = new Map<string, SkillView>()
  const okGames = new Map<string, Set<string>>()
  for (const [k, v] of Object.entries(rows)) {
    skills.set(k, { box: v.box ?? 0, seen: v.seen ?? 0, rev: v.rev, lastReview: v.lastReview })
    if (v.games) okGames.set(k, new Set(v.games))
  }
  return { skills, okGames }
}
const D0 = '2026-11-02'
const step = (st: LadderState, f: LadderFacts, day = D0, opts = {}) => stepLadder(st, f, day, opts)

// 1. 單位對照：每個技能點只屬於一階
{
  assert.equal(unitOfSkill('phonics:m')?.rung, 'L5')
  assert.equal(unitOfSkill('phonics:n')?.rung, 'L9')
  assert.equal(unitOfSkill('count:3')?.rung, 'N1')
  assert.equal(unitOfSkill('num:3')?.unit.id, 'n:3')
  assert.equal(unitOfSkill('give:7')?.rung, 'N2')
  assert.equal(unitOfSkill('num:14')?.unit.id, 'n:11-15')
  assert.equal(unitOfSkill('arrow:left')?.rung, 'T12')
  assert.equal(unitOfSkill('route:2')?.rung, 'P1')
  assert.equal(unitOfSkill('trace:7')?.unit.id, 'lv:d-trace:6', '最高級的第三條路算在第 6 級')
  assert.equal(unitOfSkill('dots:house')?.unit.id, 'lv:d-dots:2')
  assert.equal(unitOfSkill('part:slide')?.rung, 'H6b')
  assert.equal(unitOfSkill('glyph:O')?.rung, 'H7')
  assert.equal(unitOfSkill('glyph:Q')?.rung, 'H7b')
  assert.equal(unitOfSkill('all:eat')?.unit.id, 'use:eat', '做什麼用的 all: 分得出來')
  assert.equal(unitOfSkill('all:red')?.unit.id, 'sort:color')
  assert.equal(unitOfSkill('lasso:apple')?.rung, 'H3')
  assert.equal(unitOfSkill('coloring:c1'), null)
  assert.equal(strandOfSkill('vocab:dog'), 'vocab')
  // 每個前置都排在前面
  RUNGS.forEach((r, i) => r.prereq.forEach((p) => assert.ok(RUNGS.findIndex((x) => x.id === p) < i, `${r.id} 的前置 ${p} 要排在前面`)))
  // 難度型的遊戲：每一級都對得到一階
  assert.equal(levelRung('c-drive', 2), 'T12')
  assert.equal(levelRung('d-glyph', 3), 'H7')
  assert.equal(entryRung('m-order'), 'T2')
  assert.equal(entryRung('d-dots'), 'H2')
  // 還沒做出來的階沒有單位
  assert.equal(unitsOf('L6').length, 0)
  ok('單位對照')
}

// 2. 穩固：已熟＋通過 2 次到期複習
{
  assert.equal(isFirm({ box: 3, seen: 3, rev: 1 }), false)
  assert.equal(isFirm({ box: 3, seen: 3, rev: 2 }), true)
  assert.equal(isFirm({ box: 2, seen: 9, rev: 4 }), false, '掉出已熟就不算穩固')
  assert.equal(isFirm({ box: 4, seen: 9, rev: 0, firmAt: 1 }), true, '穩固過、之後偶爾答錯一題（rev 從頭算）仍然算')
  assert.equal(isFirm({ box: 2, seen: 9, rev: 0, firmAt: 1 }), false)
  ok('穩固的定義')
}

// 3. 空資料：沒有前置的階一開始就開，其他都關著；沒有任何補記
{
  const r = step(emptyLadder(), facts({}))
  const v = r.view.rungs
  for (const id of ['L1', 'L5', 'N1', 'N7', 'N10', 'N12', 'T1', 'T6', 'T10', 'H1', 'H6', 'H11']) assert.ok(v.get(id)!.open, `${id} 一開始就開`)
  for (const id of ['L9', 'N2', 'N11', 'T2', 'T12', 'P1', 'H2', 'H3', 'H6b', 'H7']) assert.ok(!v.get(id)!.open, `${id} 要等前置`)
  assert.equal(r.log.length, 0, '一開始就開的階不寫時間軸')
  ok('空資料：沒有前置的階開著')
}

// 4. 前置條件：N1 80% 穩固＋一半以上遷移才完成，完成才開 N2；不看年齡
{
  const base = { 'count:1': { ...FIRM, games: ['m-count', 'm-find'] }, 'count:2': { ...FIRM, games: ['m-count', 'm-give'] }, 'count:3': FIRM, 'count:4': FIRM, 'count:5': SEEN }
  let r = step(emptyLadder(), facts(base))
  assert.equal(r.view.rungs.get('N1')!.firm, 4)
  assert.equal(r.view.rungs.get('N1')!.transferred, 2)
  assert.ok(!r.view.rungs.get('N1')!.complete, '遷移不到一半，還不算完成')
  assert.ok(!r.view.rungs.get('N2')!.open)
  r = step(r.state, facts({ ...base, 'num:3': { ...MASTERED, games: ['m-find'] }, 'count:3': { ...FIRM, games: ['m-count'] } }))
  assert.ok(r.view.rungs.get('N1')!.complete, '同一個數字在兩個遊戲都第一次就答對＝遷移，3/5 過一半')
  assert.ok(r.view.rungs.get('N2')!.open)
  assert.equal(r.view.rungs.get('N2')!.by, 'prereq')
  assert.deepEqual(
    r.log.map((x) => `${x.data.rung} ${x.data.event}`),
    ['N1 done', 'N2 open', 'T2 open', 'H2 open'],
    '完成、開放都寫進時間軸（照順序）；還沒有內容的 N14 也開了，但不寫進時間軸',
  )
  assert.equal(r.log[0].track, 'num')
  assert.equal(r.log[0].strand, 'count')
  assert.equal(r.log[0].rung, 1)
  assert.ok(r.view.rungs.get('N14')!.open)
  // 完成了不收回：之後 N1 的熟練度只掉一點（沒到 30%），仍然是完成
  const r2 = step(r.state, facts({ ...base, 'count:4': SEEN }), addDays(D0, 1))
  assert.ok(r2.view.rungs.get('N1')!.complete)
  ok('前置條件：完成才開下一階')
}

// 5. 能遷移的單位只有 1 種遊戲的階（箭頭卡開車）：不要求遷移；左右要等上下穩固（LOAD-4）
{
  let r = step(emptyLadder(), facts({ 'arrow:up': FIRM, 'arrow:down': MASTERED }))
  assert.ok(!r.view.rungs.get('T12')!.open, '下還沒穩固，左右不開')
  r = step(r.state, facts({ 'arrow:up': FIRM, 'arrow:down': FIRM }))
  assert.ok(r.view.rungs.get('T10')!.complete)
  assert.ok(r.view.rungs.get('T12')!.open)
  assert.ok(r.view.rungs.get('P1')!.open, '指令卡（P1）也是等上下')
  ok('只有一種遊戲的階不要求遷移；左右等上下')
}

// 6. 難度型的遊戲：高一級穩固，低的也算（運筆小路到 5 級就不再開直線）
{
  const r = step(emptyLadder(), facts({ 'trace:1': MASTERED, 'trace:2': SEEN, 'trace:5': FIRM }))
  const h1 = r.view.rungs.get('H1')!
  assert.equal(h1.firm, 5, '第 5 級穩固 → 1–5 級都算穩固')
  assert.ok(h1.complete, '5/6 > 80%')
  assert.ok(r.view.rungs.get('H3')!.open, '用筆圈起來等運筆小路')
  ok('難度型的遊戲：高一級穩固，低的也算')
}

// 7. 描字母（H7）：運筆小路、連點成圖、零件第 2 組三階都完成才開
{
  const n1 = { 'count:1': { ...FIRM, games: ['m-count', 'm-find'] }, 'count:2': { ...FIRM, games: ['m-count', 'm-find'] }, 'count:3': { ...FIRM, games: ['m-count', 'm-find'] }, 'count:4': FIRM, 'count:5': FIRM }
  const pen = { 'trace:6': FIRM, 'dots:star': FIRM }
  const parts1 = { 'part:down': FIRM, 'part:across': FIRM, 'part:circle': FIRM, 'part:cross': FIRM }
  const parts2 = Object.fromEntries(['slide', 'slide2', 'moon', 'cup', 'corner'].map((p) => [`part:${p}`, FIRM]))
  let r = step(emptyLadder(), facts({ ...n1, ...pen }))
  // H2 要等 N1 完成才開；開的那一步還不能同時完成（要先開）
  r = step(r.state, facts({ ...n1, ...pen }))
  assert.ok(r.view.rungs.get('H1')!.complete && r.view.rungs.get('H2')!.complete)
  assert.ok(!r.view.rungs.get('H7')!.open, '零件還沒練，描字母不開')
  r = step(r.state, facts({ ...n1, ...pen, ...parts1 }))
  assert.ok(r.view.rungs.get('H6b')!.open)
  assert.ok(!r.view.rungs.get('H7')!.open)
  r = step(r.state, facts({ ...n1, ...pen, ...parts1, ...parts2 }))
  assert.ok(r.view.rungs.get('H6b')!.complete, '6 個零件 5 個穩固 > 80%')
  assert.ok(r.view.rungs.get('H7')!.open)
  // 運筆、連點只要有一個沒完成就不開（另一個孩子）
  const r2 = step(step(emptyLadder(), facts({ ...n1, 'trace:6': FIRM, 'dots:triangle': FIRM, ...parts1 })).state, facts({ ...n1, 'trace:6': FIRM, 'dots:triangle': FIRM, ...parts1, ...parts2 }))
  assert.ok(!r2.view.rungs.get('H2')!.complete && !r2.view.rungs.get('H7')!.open, '連點成圖只到第 1 級，描字母不開')
  ok('描字母那一階：運筆小路、連點成圖、零件第 2 組都完成才開')
}

// 8. 卡關保險：前一階 60% 穩固、開放滿 3 週，下一階就開（前一階繼續複習）
{
  const f = facts({ 'count:1': FIRM, 'count:2': FIRM, 'count:3': FIRM, 'count:4': SEEN, 'count:5': SEEN })
  let r = step(emptyLadder(), f, D0)
  assert.equal(r.state.rungs.N1.open, D0)
  r = step(r.state, f, addDays(D0, 20))
  assert.ok(!r.view.rungs.get('N2')!.open, '20 天還不到')
  r = step(r.state, f, addDays(D0, 21))
  assert.ok(r.view.rungs.get('N2')!.open)
  assert.equal(r.view.rungs.get('N2')!.by, 'stuck')
  assert.deepEqual(r.log.find((x) => x.data.rung === 'N2')!.data.from, ['N1'])
  assert.ok(!r.view.rungs.get('N1')!.complete, 'N1 沒有因此算完成')
  // 不到 60% 的不觸發
  const low = facts({ 'count:1': FIRM, 'count:2': FIRM, 'count:3': SEEN, 'count:4': SEEN, 'count:5': SEEN })
  const r2 = step(step(emptyLadder(), low, D0).state, low, addDays(D0, 60))
  assert.ok(!r2.view.rungs.get('N2')!.open)
  ok('卡關保險')
}

// 9. 回補：完成的階 30% 以上掉出已熟，或連續 2 次到期複習失敗
{
  const all = { 'phonics:m': FIRM, 'phonics:s': FIRM, 'phonics:a': FIRM, 'phonics:t': FIRM, 'phonics:b': FIRM, 'phonics:f': FIRM }
  const t = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { ...v, games: ['ph-start', 'ph-letter'] }]))
  let r = step(emptyLadder(), facts(t))
  assert.ok(r.view.rungs.get('L5')!.complete && r.view.rungs.get('L9')!.open)
  // 2/6 掉出已熟 = 33%
  const d1 = addDays(D0, 10)
  r = step(r.state, facts({ ...t, 'phonics:m': { box: 2, seen: 12 }, 'phonics:s': { box: 1, seen: 12 } }), d1)
  const ro = r.view.rungs.get('L5')!.reopen!
  assert.equal(ro.why, 'drop')
  assert.equal(ro.until, addDays(d1, 7))
  assert.deepEqual(ro.reteach.sort(), ['phonics:m', 'phonics:s'])
  assert.ok(r.view.rungs.get('L9')!.open, '已經開放的下一階不收回')
  assert.ok(r.view.rungs.get('L5')!.complete, '完成不收回')
  assert.deepEqual(r.view.strands.find((s) => s.id === 'phon')!.reopen, ['L5'])
  assert.equal(r.log.find((x) => x.kind === 'reopen')!.data.event, 'start')
  // 一週後補回來了：結束
  r = step(r.state, facts(t), addDays(d1, 7))
  assert.ok(!r.view.rungs.get('L5')!.reopen)
  assert.equal(r.log.find((x) => x.kind === 'reopen')!.data.event, 'end')
  // 只掉 1/6（17%）不回補
  const r2 = step(step(emptyLadder(), facts(t)).state, facts({ ...t, 'phonics:m': { box: 2, seen: 9 } }), d1)
  assert.ok(!r2.view.rungs.get('L5')!.reopen)
  // 連續 2 次到期複習失敗
  const fail = (ts: number) => ({ ts, result: 'no' as const })
  const r3 = step(step(emptyLadder(), facts(t)).state, facts({ ...t, 'phonics:a': { ...FIRM, lastReview: fail(2) }, 'phonics:t': { ...FIRM, lastReview: fail(3) }, 'phonics:b': { ...FIRM, lastReview: { ts: 1, result: 'ok' } } }), d1)
  assert.equal(r3.view.rungs.get('L5')!.reopen?.why, 'fail')
  const r4 = step(step(emptyLadder(), facts(t)).state, facts({ ...t, 'phonics:a': { ...FIRM, lastReview: fail(2) }, 'phonics:t': { ...FIRM, lastReview: { ts: 3, result: 'ok' } } }), d1)
  assert.ok(!r4.view.rungs.get('L5')!.reopen, '失敗之後又通過一次，不算連續')
  ok('回補')
}

// 10. 舊資料升級（§5.4）：已經玩過的階算開放，時間軸補記
{
  const t = { 'phonics:m': { ...FIRM, games: ['ph-start', 'ph-same'] }, 'phonics:s': { ...FIRM, games: ['ph-start', 'ph-same'] }, 'phonics:a': { ...FIRM, games: ['ph-start', 'ph-same'] }, 'phonics:t': FIRM, 'phonics:b': FIRM, 'phonics:f': SEEN, 'phonics:n': SEEN, 'arrow:left': SEEN, 'glyph:1': SEEN }
  const first: Record<string, string> = { L5: '2026-09-01', L9: '2026-10-01', T12: '2026-10-05', H7: '2026-10-07' }
  const last: Record<string, string> = { L5: '2026-10-20' }
  const r = step(emptyLadder(), facts(t), '2026-11-02', { migrate: { first: (id: string) => first[id], last: (id: string) => last[id], open: ['H7'] } })
  const v = r.view.rungs
  assert.ok(v.get('L5')!.complete)
  assert.equal(v.get('L5')!.doneDate, '2026-10-20', '完成的日期用最後一次作答（約略）')
  assert.ok(v.get('L9')!.open)
  assert.equal(v.get('L9')!.by, 'prereq', 'L5 完成了，L9 是照前置開的')
  assert.equal(v.get('T12')!.by, 'legacy', '以前已經玩到左右：開放、不收回')
  assert.equal(v.get('T12')!.openDate, '2026-10-05')
  assert.equal(v.get('H7')!.by, 'legacy', 'G-33 的暫時門檻開過描字母')
  assert.ok(!v.get('N2')!.open, '沒玩過、前置也沒到的不開')
  assert.ok(r.log.length > 0 && r.log.every((x) => x.data.backfill === true), '每一筆都標成補記')
  assert.ok(r.log.some((x) => x.data.rung === 'L5' && x.data.event === 'open' && x.date === '2026-09-01'), '有玩過的起點階也補記開始的日期')
  assert.ok(!r.log.some((x) => x.data.rung === 'N1'), '沒玩過的起點階不補記')
  // 升級之後再走一步：不會重複補記
  const again = step(r.state, facts(t), '2026-11-02')
  assert.equal(again.log.length, 0)
  ok('舊資料升級：算出每條支線在第幾階、補記時間軸')
}

// 11. 家長鎖住支線：鎖的那一階之後不開（已經開的不收回）
{
  const t = { 'count:1': { ...FIRM, games: ['m-count', 'm-find'] }, 'count:2': { ...FIRM, games: ['m-count', 'm-find'] }, 'count:3': { ...FIRM, games: ['m-count', 'm-find'] }, 'count:4': FIRM, 'count:5': FIRM }
  const r = step(emptyLadder(), facts(t), D0, { locks: { count: 1 } })
  assert.ok(r.view.rungs.get('N1')!.complete)
  assert.ok(!r.view.rungs.get('N2')!.open)
  assert.ok(r.view.rungs.get('N2')!.locked)
  assert.ok(r.view.rungs.get('H2')!.open, '別條支線不受影響')
  const r2 = step(r.state, facts(t), D0, {})
  assert.ok(r2.view.rungs.get('N2')!.open, '解鎖就照常開')
  ok('家長鎖支線')
}

// 12. 內容庫存
{
  const t = { 'pattern:AB': FIRM, 'pattern:AABB': SEEN, 'pattern:ABC': SEEN }
  const r = step(step(emptyLadder(), facts(t)).state, facts(t))
  const p = r.view.strands.find((s) => s.id === 'pattern')!
  assert.deepEqual(p.done, ['N10'])
  assert.deepEqual(p.current, ['N11'])
  assert.equal(p.left, 0)
  assert.ok(p.out, '規律現有的內容都出現過了：要提醒家長')
  const c = r.view.strands.find((s) => s.id === 'count')!
  assert.ok(!c.out && c.left === 12, '數數與數字：1–5、6–10 各 5 個，11–20 兩段')
  assert.equal(contentWeeks(6, ['2026-10-10', '2026-10-20', '2026-10-25', '2026-10-30'], '2026-11-02'), 6, '最近 4 週教了 4 個＝一週 1 個，剩 6 個約 6 週')
  assert.equal(contentWeeks(6, [], '2026-11-02'), null)
  assert.equal(contentWeeks(0, [], '2026-11-02'), 0)
  ok('內容庫存')
}

// ── 依支線的負擔控制、太順加速（lib/tracks.ts）──────────────────
let id = 0
function att(date: string, game: string, skill: string, okay: boolean, ms = 2000): Attempt {
  return { id: String(id++), ts: id, date, sessionId: date, station: 'math', game, itemId: skill, skill, phase: 'quiz', level: 1, options: [], answer: '', taps: [], firstTryCorrect: okay, attempts: 1, responseMs: ms, hintUsed: !okay, synced: 1 }
}
const strandOf = (a: Pick<Attempt, 'skill'>) => strandOfSkill(a.skill)
const days = ['2026-11-02', '2026-11-03', '2026-11-04']
function dayOf(date: string, mathOk: number, langOk: number) {
  return [...Array.from({ length: 5 }, (_, i) => att(date, 'm-count', `count:${(i % 5) + 1}`, i < mathOk)), ...Array.from({ length: 5 }, (_, i) => att(date, 'ph-start', 'phonics:m', i < langOk))]
}

// 13. 整天都很差（生病）：全部暫停；錯集中在一條支線：只暫停那一條
{
  const sick = days.flatMap((d) => dayOf(d, 2, 2))
  const a = strandLoad(sick, '2026-11-05', strandOf, 3)
  assert.ok(a.global, '每條支線都低於 6 成 → 全部暫停')
  const lang = days.flatMap((d) => dayOf(d, 4, 1))
  const b = strandLoad(lang, '2026-11-05', strandOf, 3)
  assert.ok(!b.global, '整天 50%，但錯都在語音')
  assert.deepEqual(b.strands, ['phon'])
  // 整天沒有低於 6 成，但某條支線自己連續 3 天都低於 6 成：只暫停那一條
  const c = strandLoad(days.flatMap((d) => dayOf(d, 5, 2)), '2026-11-05', strandOf, 3)
  assert.ok(!c.global)
  assert.deepEqual(c.strands, ['phon'])
  // 只看今天以前的完整日子
  assert.equal(strandLoad(lang, '2026-11-04', strandOf, 3).strands.length, 0)
  ok('依支線的負擔控制')
}

// 14. 太順就加速：連續 5 個有玩的日子都 ≥ 92% 而且變快
{
  const d10 = Array.from({ length: 10 }, (_, i) => addDays('2026-11-02', i))
  const mk = (ms: (i: number) => number, lastOk = 5) => d10.flatMap((d, i) => Array.from({ length: 5 }, (_, k) => att(d, 'm-find', `num:${k + 1}`, i < 5 || k < lastOk, ms(i))))
  const opts = { days: 5, rate: 0.92, minItems: 3 }
  assert.deepEqual(fastStrands(mk((i) => (i < 5 ? 3000 : 2000)), '2026-11-20', strandOf, opts), ['count'])
  assert.deepEqual(fastStrands(mk(() => 2000), '2026-11-20', strandOf, opts), [], '沒有變快')
  assert.deepEqual(fastStrands(mk((i) => (i < 5 ? 3000 : 2000), 4), '2026-11-20', strandOf, opts), [], '有一天只有 80%')
  // 畫畫類沒有速度：只看答對率
  const draw = d10.slice(5).flatMap((d) => Array.from({ length: 3 }, () => ({ ...att(d, 'd-trace', 'trace:2', true), station: 'draw' as const })))
  assert.deepEqual(fastStrands(draw, '2026-11-20', strandOf, opts), ['pen'])
  ok('太順就加速')
}

// ── 孩子端的引擎（lib/adaptive.ts）：一回合最多 1 個新概念、前置條件擋住新內容 ──
{
  const A = await import('../src/lib/adaptive')
  const G = await import('../src/games/draw/glyphs')
  A.markPlayed('m-count')
  assert.ok(A.canIntroduce('m-count', 'count:1'))
  A.noteAttempt({ game: 'm-count', skill: 'count:1', phase: 'teach', firstTryCorrect: true, level: 1 })
  assert.deepEqual(A.roundNewConcepts(), ['n:1'])
  assert.ok(!A.canIntroduce('m-count', 'count:2'), '這一回合已經教了一個新概念（FRAME-8）')
  assert.ok(A.canIntroduce('m-count', 'count:1'), '同一個概念不算第二個')
  A.markPlayed('m-count')
  assert.ok(A.canIntroduce('m-count', 'count:2'), '下一回合就可以')
  assert.ok(!A.canIntroduce('m-count', 'count:7'), '6–10 要等 1–5 完成（N2）')
  assert.ok(!A.canIntroduce('c-drive', 'arrow:left'), '左右要等上下穩固（T12）')
  assert.ok(!G.lettersOpen(), '空資料不能描字母')
  assert.equal(G.glyphLevelCap(false, 6), 1, '零件第 2 組也還沒開：停在第 1 級')
  ok('孩子端：一回合最多 1 個新概念、前置條件擋新內容、描字母關著')
}

// 15. 和 ladderCalc 的一致：P2 跟著 P1 算
{
  const c = ladderCalc(facts({ 'route:2': FIRM, 'route:3': FIRM }))
  assert.equal(c.get('P2'), c.get('P1'))
  ok('P2 跟 P1 一起算')
}

console.log('ALL PASS')
