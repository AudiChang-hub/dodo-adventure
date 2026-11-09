// 英文課的單元測試（docs/全球幼教指引-現況對照.md 的 A6、A12、A16）：
// - A6：「哪個字是 A 開頭」（開頭音）不算進「錯很多隔天重上」，只算字母題；
// - A12：設了孩子的英文名字，新帳號名字裡的字母先上；沒設、舊的進度照 A→Z；換了順序也一樣不教不考；
// - A16：每一題點錯任何一個選項，都有「That's …」「Find …」的台詞。
// 執行：npx tsx scripts/test-english.ts（失敗就 exit 1）
import assert from 'node:assert/strict'
import '../src/content/lines'
import { hasLine } from '../src/content/registry'
import { ORDER, lessonLetter, orderFor, wordId, LESSON_LETTERS } from '../src/lessons/english/data'
import { doneRecord, lessonGood, planFor, startedRecord, type EnglishProgress } from '../src/lessons/english/plan'
import { makeQuiz, wrongKeys } from '../src/lessons/english/quiz-plan'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

// ── A6 ────────────────────────────────────────────────────
assert.equal(lessonGood([{ kind: 'big', first: true }, { kind: 'little', first: true }, { kind: 'word', first: false }, { kind: 'big', first: true }]), true)
ok('A6 字母題全對、開頭音答錯 → 不重上')
assert.equal(lessonGood([{ kind: 'big', first: false }, { kind: 'little', first: false }, { kind: 'word', first: true }, { kind: 'big', first: false }]), false)
ok('A6 字母題全錯、開頭音答對 → 重上（開頭音答對不會救回來）')
assert.equal(lessonGood([{ kind: 'big', first: true }, { kind: 'little', first: false }, { kind: 'word', first: false }, { kind: 'word', first: false }]), true)
ok('A6 字母題一半對（開頭音兩題都錯）→ 不重上')

// ── A12 ───────────────────────────────────────────────────
assert.equal(orderFor(undefined), ORDER)
assert.equal(orderFor(''), ORDER)
ok('A12 沒設名字 → A→Z')
const ben = orderFor('Ben')
assert.equal(ben.slice(0, 3), 'BEN')
assert.equal(ben.length, 26)
assert.equal(new Set(ben).size, 26)
assert.equal(orderFor('Anna-Lee').slice(0, 4), 'ANLE')
ok('A12 名字的字母先（不重複、忽略符號），其他照 A→Z，一共 26 個')

const days = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
let p: EnglishProgress | null = null
const seen: string[] = []
for (const d of days) {
  const pl = planFor(p, d, ben)
  seen.push(lessonLetter(pl.idx, pl.seq).L)
  p = { idx: pl.idx, seq: pl.seq, date: d, done: true, good: true }
}
assert.deepEqual(seen, ['B', 'E', 'N', 'A'])
ok('A12 新帳號設了 BEN：前三天是 B、E、N，第四天 A')

const old = planFor({ idx: 1, date: '2026-11-01', done: true, good: true }, '2026-11-02', ben)
assert.equal(old.seq, ORDER)
assert.equal(lessonLetter(old.idx, old.seq).L, 'C')
ok('A12 舊的進度（沒有 seq）照 A→Z 往下走，不會因為設了名字就換順序')

// 換了順序也不教不考：答案、選項都是今天或之前上過的
for (const seq of [ORDER, ben]) {
  for (let idx = 0; idx < seq.length; idx++) {
    const taught = new Set(seq.slice(0, idx + 1))
    const words = new Set(LESSON_LETTERS.filter((x) => taught.has(x.L)).flatMap((x) => x.words.map((w) => wordId(w.w))))
    for (const q of makeQuiz(lessonLetter(idx, seq), idx, seq)) {
      const okId = (id: string) => (q.kind === 'word' ? words.has(id) : taught.has(id.split(':')[0]))
      assert.ok(okId(q.answer), `${seq.slice(0, 3)} 第 ${idx + 1} 天 答案 ${q.answer} 還沒教`)
      for (const o of q.options) assert.ok(okId(o.id), `${seq.slice(0, 3)} 第 ${idx + 1} 天 選項 ${o.id} 還沒教`)
    }
  }
}
ok('A12 A→Z 和 BEN 開頭兩種順序，26 天的題目都不教不考')

for (const first of 'CKOPSUVWXZ') {
  const seq = orderFor(first)
  for (let k = 0; k < 5; k++) for (const q of makeQuiz(lessonLetter(0, seq), 0, seq)) assert.ok(q.options.length >= 2, `第一天是 ${first}：${q.kind} 題只有 ${q.options.length} 個選項`)
}
ok('A12 名字從大小寫同形的字母（S、C、O…）開始：第一天每一題也至少 2 個選項')

// ── A16 ───────────────────────────────────────────────────
let checked = 0
for (const seq of [ORDER, ben]) {
  for (let idx = 0; idx < seq.length; idx++) {
    for (let k = 0; k < 6; k++) {
      // 選項是隨機的：每一天多出幾次，盡量碰到每一種干擾選項
      for (const q of makeQuiz(lessonLetter(idx, seq), idx, seq)) {
        for (const o of q.options) {
          if (o.id === q.answer) continue
          for (const key of wrongKeys(q, o)) assert.ok(hasLine(key), `沒有台詞 ${key}（${q.kind} 題，答案 ${q.answer}，點了 ${o.id}）`)
          checked++
        }
      }
    }
  }
}
ok(`A16 點錯的每一種情況都有說明台詞（檢查了 ${checked} 次）`)

const big = makeQuiz(lessonLetter(5), 5)[0]
const flip = { id: `${big.answer}:little`, text: big.answer.toLowerCase() }
assert.deepEqual(wrongKeys(big, flip), [`en.that.little.${big.answer.toLowerCase()}`, `en.find.big.${big.answer}`])
ok('A16 問大寫、點了同一個字母的小寫：That\'s little f. → Find big F!')

{
  const d = '2026-11-03'
  const left = planFor({ idx: 4, seq: ORDER, date: d, done: false, good: false, stage: 'trace', round: 1 }, d)
  assert.deepEqual(left.resume, { stage: 'trace', round: 1 })
  assert.equal(left.review, false)
  assert.equal(left.idx, 4)
  assert.equal(planFor({ idx: 4, seq: ORDER, date: d, done: false, good: false, stage: 'meet' }, d).resume, undefined)
  // 今天上完了、沒有複習到一半：從頭複習
  assert.equal(planFor({ idx: 4, seq: ORDER, date: d, done: true, good: true }, d).resume, undefined)
  const tomorrow = planFor({ idx: 4, seq: ORDER, date: d, done: false, good: false, stage: 'quiz' }, '2026-11-04')
  assert.equal(tomorrow.resume, undefined)
  assert.equal(tomorrow.repeat, true)
}
ok('T-95 同一天中途離開又回來：從離開的那一段（描字第幾輪）接著上；上完了是複習、隔天照原本的排課（重上，從頭）')

{
  // T-116（盲測 69bfad5 英文 seed 3：最後一題做完他馬上按返回，算上完了；之後每次回來都是複習，複習到一半離開不記，
  // 第 2～4 次回來都從 Let's practice 重來）：複習到一半離開，同一天回來從離開的那一段接著複習，「上完了」和好不好不動
  const d = '2026-11-09'
  const rv = planFor({ idx: 0, seq: ORDER, date: d, done: true, good: true, stage: 'trace', round: 1 }, d)
  assert.equal(rv.review, true)
  assert.deepEqual(rv.resume, { stage: 'trace', round: 1 })
  const rq = planFor({ idx: 0, seq: ORDER, date: d, done: true, good: false, stage: 'quiz', round: 1, answers: [{ kind: 'big', first: true }] }, d)
  assert.equal(rq.review, true)
  assert.deepEqual(rq.resume, { stage: 'quiz', round: 1, answers: [{ kind: 'big', first: true }] })
  // 複習走到「認識字母」不算（從頭）；隔天照原本的排課
  assert.equal(planFor({ idx: 0, seq: ORDER, date: d, done: true, good: true, stage: 'meet' }, d).resume, undefined)
  const next = planFor({ idx: 0, seq: ORDER, date: d, done: true, good: true, stage: 'trace', round: 1 }, '2026-11-10')
  assert.equal(next.idx, 1)
  assert.equal(next.resume, undefined)
}
ok('T-116 複習到一半離開：同一天回來從離開的那一段接著複習；隔天照常換下一個字母')

{
  const d = '2026-11-06'
  const answers = [
    { kind: 'big' as const, first: true },
    { kind: 'little' as const, first: false },
  ]
  const mid = planFor({ idx: 0, seq: ORDER, date: d, done: false, good: false, stage: 'quiz', round: 2, answers }, d)
  assert.deepEqual(mid.resume, { stage: 'quiz', round: 2, answers })
  // 描字那一段不帶選擇題的結果
  assert.deepEqual(planFor({ idx: 0, seq: ORDER, date: d, done: false, good: false, stage: 'trace', round: 1, answers }, d).resume, { stage: 'trace', round: 1 })
  // 選擇題的題數固定，不會因為答錯變多（T-112：最多 3 題；第一天沒有以前學過的字母，只問大寫、小寫 2 題）
  for (let idx = 0; idx < 26; idx++) assert.equal(makeQuiz(lessonLetter(idx), idx).length, idx === 0 ? 2 : 3)
  for (const first of 'SBA') {
    const seq = orderFor(first)
    const day1 = makeQuiz(lessonLetter(0, seq), 0, seq)
    assert.deepEqual(day1.map((q) => q.kind), ['big', 'little'], `第一天是 ${first}：只問大寫、小寫`)
  }
  // 第三題單日問圖、雙日複習以前的字母，兩種都會出現
  const thirds = Array.from({ length: 25 }, (_, k) => makeQuiz(lessonLetter(k + 1), k + 1)[2])
  assert.ok(thirds.filter((q) => q.kind === 'word').length >= 10, '單日要有找開頭音的圖')
  assert.ok(thirds.filter((q, k) => q.kind === 'big' && q.L !== lessonLetter(k + 1).L).length >= 10, '雙日要有複習以前的字母')
}
ok('T-104、T-112 選擇題答完幾題、結果記下來，同一天回來從下一題接著問；題數固定（第一天 2 題、之後 3 題），不再重複問同一題')

{
  // T-122（盲測 ca0d1e1 英文 seed 2 第 24 步：最後一題答完、慶祝的時候他按返回離開，這堂算上完了；
  // 同一天回來變成複習，又從 Let's practice 重來）：上完但還沒跟恐龍說完晚安就離開，同一天回來直接回到晚安道別
  const d = '2026-11-09'
  const pl = planFor({ idx: 0, seq: ORDER, date: d, done: false, good: false, stage: 'quiz', round: 1 }, d)
  const back = planFor(doneRecord(pl, true, null, d), d)
  assert.equal(back.review, true)
  assert.deepEqual(back.resume, { stage: 'end', round: 0 })
  // 複習上完也一樣回到晚安道別；「上完了」和好不好照舊
  const rv = planFor({ idx: 0, seq: ORDER, date: d, done: true, good: true }, d)
  const rec = doneRecord(rv, false, { idx: 0, seq: ORDER, date: d, done: true, good: true }, d)
  assert.equal(rec.good, true)
  assert.deepEqual(planFor(rec, d).resume, { stage: 'end', round: 0 })
  // 回到晚安道別那一次就清掉：再出去、再進來是從頭複習（不會每次進來都只有晚安）
  assert.equal(startedRecord(planFor(rec, d), rec, d)?.stage, undefined)
  assert.equal(planFor(startedRecord(planFor(rec, d), rec, d)!, d).resume, undefined)
  // 隔天照常換下一個字母
  assert.equal(planFor(rec, '2026-11-10').idx, 1)
  assert.equal(planFor(rec, '2026-11-10').resume, undefined)
}
ok('T-122 上完了、還沒說完晚安就離開：同一天回來回到晚安道別，不從 Let’s practice 重來')

console.log('ALL PASS')
