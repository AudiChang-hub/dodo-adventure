// 三堂課的「不教不考」自動檢查（家長 2026-11-02：「每一題的答案和干擾選項，都必須是這一課，或之前已經教過的內容」）。
// 用三堂課真正的出題程式，照課表一天一天出題（有亂數的每天出 40 次），檢查每一題的答案和每一個選項：
// - 英文字母（lessons/english/quiz-plan.ts 的 makeQuiz）：字母要是今天或之前的字母；圖要是今天或之前的字母的單字。
// - 數學數字（lessons/math/plan.ts）：小複習的答案和選項不超過教過的最大數字；數數不數沒教過的數量；
//   比多少第一次問「多」之前先上教學卡（數量本身不念、不考，只比哪邊多）。
// - 中文課文（lessons/chinese/data.ts 的 questionsOf）：答案是這一篇的紅字；選項是這一篇或之前上過的篇的紅字。
//   照日期一篇一篇上（之前的都上過），和「第一次上就是這一篇」（之前一篇都沒上過）兩種都檢查。
// 最後故意放三個壞例子（每一課一個），確認檢查擋得下來。
// 執行：npx tsx scripts/check-lessons-teach.ts（npm run verify 的「三堂課不教不考」）
import { makeQuiz, type Question } from '../src/lessons/english/quiz-plan'
import { LESSON_LETTERS, ORDER, lessonLetter, wordId } from '../src/lessons/english/data'
import { FIRM, LAST, compareQs, countRounds, giveRounds, range, reviewQs, type Lesson, type ReviewQ } from '../src/lessons/math/plan'
import { ZH_TEXTS, questionsOf, type ZhQuestion, type ZhText } from '../src/lessons/chinese/data'

const RUNS = 40

interface Report {
  questions: number
  options: number
  bad: string[]
}
const report = (): Report => ({ questions: 0, options: 0, bad: [] })

// ── 英文字母 ───────────────────────────────────────────────────

type EnglishMaker = (idx: number) => Question[]

function checkEnglish(make: EnglishMaker): Report {
  const r = report()
  for (let idx = 0; idx < ORDER.length; idx++) {
    const letters = new Set(ORDER.slice(0, idx + 1))
    const words = new Set(LESSON_LETTERS.slice(0, idx + 1).flatMap((x) => x.words.map((w) => wordId(w.w))))
    const ok = (q: Question, id: string) => (q.kind === 'word' ? words.has(id) : letters.has(id.split(':')[0]))
    for (let run = 0; run < RUNS; run++)
      for (const q of make(idx)) {
        r.questions++
        if (!ok(q, q.answer)) r.bad.push(`英文第 ${idx + 1} 天（${ORDER[idx]}）：答案「${q.answer}」還沒教`)
        for (const o of q.options) {
          r.options++
          if (!ok(q, o.id)) r.bad.push(`英文第 ${idx + 1} 天（${ORDER[idx]}）：${q.kind} 題的選項「${o.text ?? o.id}」還沒教`)
        }
      }
  }
  return r
}

// ── 數學數字 ───────────────────────────────────────────────────

type MathMaker = (l: Lesson) => ReviewQ[]

/** 一堂課可能的樣子：新數字（1～10）、同一天再進來複習、1～5 上完還在等熟練的混合複習、1～10 都上完的混合複習 */
function mathLessons(): Lesson[] {
  return [
    ...range(1, LAST).map((n): Lesson => ({ mode: 'new', n, max: n, part: 0 })),
    ...range(1, LAST).map((n): Lesson => ({ mode: 'review', n, max: n, part: 0 })),
    ...range(1, FIRM).map((n): Lesson => ({ mode: 'mix', n, max: FIRM, part: 0 })),
    ...range(1, LAST).map((n): Lesson => ({ mode: 'mix', n, max: LAST, part: 0 })),
  ]
}

function checkMath(review: MathMaker): Report {
  const r = report()
  for (const l of mathLessons()) {
    const day = `數學（${l.mode === 'new' ? '新數字' : l.mode === 'review' ? '同一天複習' : '混合複習'} ${l.n}）`
    const taught = (x: number) => x >= 1 && x <= l.max
    for (let run = 0; run < RUNS; run++) {
      for (const q of review(l)) {
        r.questions++
        if (!taught(q.n)) r.bad.push(`${day}：小複習的答案 ${q.n} 還沒教`)
        for (const o of q.options) {
          r.options++
          if (!taught(o)) r.bad.push(`${day}：小複習的選項 ${o} 還沒教`)
        }
      }
      for (const c of countRounds(l)) {
        r.questions++
        if (!taught(c.n)) r.bad.push(`${day}：數數數到 ${c.n}，還沒教`)
      }
      // 拿給波波：要的數量教過、在 1～5 裡；空的資料庫第一次拿一定先示範
      for (const g of giveRounds(l)) {
        r.questions++
        if (!taught(g.n) || g.n > FIRM) r.bad.push(`${day}：拿給波波要 ${g.n} 個，還沒教或超過 ${FIRM}`)
        if (!g.demo) r.bad.push(`${day}：第一次拿 ${g.n} 個給波波之前沒有示範`)
        if (g.supply <= g.n) r.bad.push(`${day}：拿給波波的東西只有 ${g.supply} 個，不夠拿 ${g.n} 個以外的數量`)
      }
      // 比多少：還沒學過「多」「少」（這裡是空的資料庫）時，第一次問一定先上教學卡
      const seen = new Set<string>()
      const cap = Math.max(FIRM, l.max)
      for (const c of compareQs(l)) {
        r.questions++
        if (c.a > cap || c.b > cap) r.bad.push(`${day}：比多少出了 ${c.a} 比 ${c.b}，超過開放的範圍 ${cap}`)
        if (!seen.has(c.ask) && !c.teach) r.bad.push(`${day}：第一次問「${c.ask === 'more' ? '哪邊比較多' : '哪邊比較少'}」之前沒有教學卡`)
        seen.add(c.ask)
      }
    }
  }
  return r
}

// ── 中文課文 ───────────────────────────────────────────────────

type ChineseMaker = (t: ZhText, done: ReadonlySet<number>) => ZhQuestion[]

function checkChinese(make: ChineseMaker): Report {
  const r = report()
  const texts = [...ZH_TEXTS].sort((a, b) => a.day - b.day)
  for (const t of texts) {
    const before = new Set(texts.filter((x) => x.day < t.day).map((x) => x.day))
    for (const done of [before, new Set<number>()]) {
      const taught = new Set([t, ...texts.filter((x) => done.has(x.day))].flatMap((x) => x.redWords))
      const how = done.size ? '照日期上' : '第一次上'
      for (const q of make(t, done)) {
        r.questions++
        if (!t.redWords.includes(q.word)) r.bad.push(`中文第 ${t.day} 天「${t.title}」（${how}）：答案「${q.word}」不是這一篇的紅字`)
        for (const o of q.options) {
          r.options++
          if (!taught.has(o.word)) r.bad.push(`中文第 ${t.day} 天「${t.title}」（${how}）：「哪個是${q.word}？」的選項「${o.word}」還沒教`)
        }
      }
    }
  }
  return r
}

// ── 跑 ─────────────────────────────────────────────────────────

const runs: [string, Report][] = [
  ['英文字母', checkEnglish((idx) => makeQuiz(lessonLetter(idx), idx))],
  ['數學數字', checkMath(reviewQs)],
  ['中文課文', checkChinese(questionsOf)],
]
let total = 0
for (const [name, r] of runs) {
  const uniq = [...new Set(r.bad)]
  total += r.bad.length
  console.log(`${r.bad.length ? '✗' : '✓'} ${name}：${r.questions} 題、${r.options} 個選項，沒教就考 ${r.bad.length} 個`)
  for (const b of uniq.slice(0, 15)) console.log(`    ${b}`)
  if (uniq.length > 15) console.log(`    …還有 ${uniq.length - 15} 種`)
}

// 壞例子：每一課故意出一題用到還沒教的東西，檢查一定要抓到
const zhDay1 = [...ZH_TEXTS].sort((a, b) => a.day - b.day)[0]
const bads: [string, () => Report][] = [
  [
    '英文：第一天的大寫題放進還沒教的 Z',
    () => checkEnglish((idx) => makeQuiz(lessonLetter(idx), idx).map((q, i) => (idx === 0 && i === 0 ? { ...q, options: [...q.options, { id: 'Z', text: 'Z' }] } : q))),
  ],
  [
    '數學：第三天的小複習放進還沒教的 5（第一、二天沒有小複習）',
    () => checkMath((l) => reviewQs(l).map((q) => (l.mode === 'new' && l.n === 3 ? { ...q, options: [...q.options, 5] } : q))),
  ],
  [
    '中文：用家長原本定的干擾圖（課文裡沒有的詞）',
    () =>
      checkChinese((t, done) =>
        questionsOf(t, done).map((q) => (t.day === zhDay1.day && q.word === t.quiz.answer ? { ...q, options: [q.options[0], ...t.quiz.distractors.map((w) => ({ word: w, icon: 'x' }))] } : q)),
      ),
  ],
]
let caught = 0
for (const [name, run] of bads) {
  const n = run().bad.length
  if (n) caught++
  console.log(`${n ? '✓ 擋下' : '✗ 沒擋下'} 壞例子：${name}（${n} 個）`)
}

console.log(`\n沒教就考 ${total} 個；壞例子擋下 ${caught}/${bads.length}`)
console.log(total === 0 && caught === bads.length ? '全部通過' : '沒有全部通過')
if (total || caught < bads.length) process.exit(1)
