// 中文課一堂的每一步（T-136：一天兩篇，一舊一新）。純函式，不碰畫面、資料庫：scripts/test-zh-course.ts 直接測；Lesson.tsx 照著走。
import { questionsOf, type ZhQuestion, type ZhText } from './data'
import { glyphQuestion, needsDemo, type GlyphQuestion, type GlyphState } from './match'

/**
 * 這一堂的哪一段（T-136，家長 2026-11-11：一天兩篇，一舊一新）：舊篇（3 次前上的，短版、大人可以跳過）、
 * 新篇（完整的一堂）、結尾小複習（前 1 次、前 7 次上的各一題）。
 */
export type Part = 'old' | 'new' | 'review'
/** 這一堂的一步：念課文、一題選圖、找一樣的字 */
export type Step =
  | { k: 'read'; t: ZhText; part: Part; qs: ZhQuestion[]; go: string }
  | { k: 'quiz'; t: ZhText; part: Part; q: ZhQuestion; first: boolean }
  | { k: 'glyph'; t: ZhText; part: Part; q: GlyphQuestion; demo: boolean }

/** 一步在上面的進度佔幾格：課文一行一格、一題一格 */
export const weight = (s: Step) => (s.k === 'read' ? s.t.lines.length : 1)

/** 念完課文往下走的按鈕（聊一聊卡片上、舊篇最後一行） */
const goOf = (after: Step | undefined, part: Part) =>
  !after ? '下課' : after.k === 'quiz' ? '去選圖' : after.k === 'glyph' ? '去找字' : part === 'old' ? '去上新的' : '下一步'

/**
 * 排出這一堂的每一步（data.ts 的 questionsOf、match.ts 的 glyphQuestion，題型都是現有的）：
 * - 舊篇短版：念課文 → 一題「哪個是…？」（家長定的那一題先）→ 找一樣的字（家長要求一定要有；換一個紅字考，run 2）；
 * - 新篇：念課文 → 聊一聊 → 每個紅字一題 → 找一樣的字（跟以前一樣）；
 * - 小複習：每篇一題「哪個是…？」（舊篇用了第一題，這裡用最後一題）；選圖出不了就找一樣的字（run 3）。
 * 第一題選圖一出來手輪流點每一張（Quiz 的 first，T-135）；手示範找一樣的字只在這一堂第一次找字的時候。
 */
export function stepsOf(p: { t: ZhText; n: number; old: ZhText | null; review: ZhText[] }, done: ReadonlySet<number>, g: GlyphState, rnd: () => number = Math.random): Step[] {
  const raw: (Step | null)[] = []
  const o = p.old
  if (o) {
    const qs = questionsOf(o, done)
    const q = qs.find((x) => x.word === o.quiz.answer) ?? qs[0]
    const gq = glyphQuestion(o, 2, g.level, rnd)
    raw.push({ k: 'read', t: o, part: 'old', qs: [], go: '' })
    if (q) raw.push({ k: 'quiz', t: o, part: 'old', q, first: false })
    if (gq) raw.push({ k: 'glyph', t: o, part: 'old', q: gq, demo: false })
  }
  const qs = questionsOf(p.t, done)
  raw.push({ k: 'read', t: p.t, part: 'new', qs, go: '' })
  for (const q of qs) raw.push({ k: 'quiz', t: p.t, part: 'new', q, first: false })
  const gq = glyphQuestion(p.t, p.n, g.level, rnd)
  if (gq) raw.push({ k: 'glyph', t: p.t, part: 'new', q: gq, demo: false })
  for (const r of p.review) {
    const rq = questionsOf(r, done)
    const q = rq[rq.length - 1]
    const rg = q ? null : glyphQuestion(r, 3, g.level, rnd)
    raw.push(q ? { k: 'quiz', t: r, part: 'review', q, first: false } : rg ? { k: 'glyph', t: r, part: 'review', q: rg, demo: false } : null)
  }
  const steps = raw.filter((s): s is Step => s != null)
  const fq = steps.findIndex((s) => s.k === 'quiz')
  const fg = steps.findIndex((s) => s.k === 'glyph')
  return steps.map((s, i): Step =>
    s.k === 'read' ? { ...s, go: goOf(steps[i + 1], s.part) } : s.k === 'quiz' ? { ...s, first: i === fq } : { ...s, demo: i === fg && needsDemo(g) },
  )
}
