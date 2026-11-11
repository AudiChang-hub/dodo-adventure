// 中文課一堂的每一步（T-136：一天兩篇，一舊一新）。純函式，不碰畫面、資料庫：scripts/test-zh-course.ts 直接測；Lesson.tsx 照著走。
import { questionsOf, type ZhQuestion, type ZhText } from './data'
import { glyphQuestion, needsDemo, type GlyphQuestion, type GlyphState } from './match'

/**
 * 這一堂的哪一段（T-136，家長 2026-11-11：一天兩篇，一舊一新）：舊篇（3 次前上的，跟原本的課一樣完整、大人可以跳過）、
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

/** 聊一聊卡片上往下走的按鈕 */
const goOf = (after: Step | undefined, part: Part) =>
  !after ? '下課' : after.k === 'quiz' ? '去選圖' : after.k === 'glyph' ? '去找字' : part === 'old' ? '去上新的' : '下一步'

/** 一篇完整的一堂（舊篇、新篇一模一樣，家長 2026-11-11：「舊跟原始課文一樣就好」）：念課文 → 聊一聊 → 每個紅字一題 → 找一樣的字 */
function lessonOf(t: ZhText, part: 'old' | 'new', run: number, done: ReadonlySet<number>, g: GlyphState, rnd: () => number): Step[] {
  const qs = questionsOf(t, done)
  const gq = glyphQuestion(t, run, g.level, rnd)
  return [{ k: 'read', t, part, qs, go: '' }, ...qs.map((q): Step => ({ k: 'quiz', t, part, q, first: false })), ...(gq ? [{ k: 'glyph' as const, t, part, q: gq, demo: false }] : [])]
}

/**
 * 排出這一堂的每一步（data.ts 的 questionsOf、match.ts 的 glyphQuestion，題型都是現有的）：
 * - 舊篇、新篇：一模一樣的完整一堂（lessonOf）。舊篇的找一樣的字換一個紅字考（run 2），跟第一次上的時候不一樣；
 * - 小複習：每篇一題「哪個是…？」（最後一個紅字那題）；選圖出不了就找一樣的字（run 3）。
 * 第一題選圖一出來手輪流點每一張（Quiz 的 first，T-135）；手示範找一樣的字只在這一堂第一次找字的時候。
 */
export function stepsOf(p: { t: ZhText; n: number; old: ZhText | null; review: ZhText[] }, done: ReadonlySet<number>, g: GlyphState, rnd: () => number = Math.random): Step[] {
  const raw: (Step | null)[] = [...(p.old ? lessonOf(p.old, 'old', 2, done, g, rnd) : []), ...lessonOf(p.t, 'new', p.n, done, g, rnd)]
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
