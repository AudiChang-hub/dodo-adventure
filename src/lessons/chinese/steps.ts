// 中文課一堂的每一步（T-136：一天兩篇，一舊一新）。純函式，不碰畫面、資料庫：scripts/test-zh-course.ts 直接測；Lesson.tsx 照著走。
import { longOf, questionsOf, type ZhQuestion, type ZhText } from './data'
import { glyphQuestion, needsDemo, type GlyphLevel, type GlyphQuestion, type GlyphState } from './match'
import { NO_STAGE4, type Stage4Plan } from './stage4'

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
function lessonOf(t: ZhText, part: 'old' | 'new', run: number, done: ReadonlySet<number>, lv: () => GlyphLevel, rnd: () => number): Step[] {
  const qs = questionsOf(t, done)
  const gq = glyph(t, run, lv, rnd)
  return [{ k: 'read', t, part, qs, go: '' }, ...qs.map((q): Step => ({ k: 'quiz', t, part, q, first: false })), ...(gq ? [{ k: 'glyph' as const, t, part, q: gq, demo: false }] : [])]
}

/** 找字一題：輪到 4 選 1 但這一篇出不了（找不到有一點像的字），退回第 3 級出 */
function glyph(t: ZhText, run: number, lv: () => GlyphLevel, rnd: () => number): GlyphQuestion | null {
  const level = lv()
  return (level === 4 ? glyphQuestion(t, run, 4, rnd) : null) ?? glyphQuestion(t, run, level === 4 ? 3 : level, rnd)
}

/**
 * 排出這一堂的每一步（data.ts 的 questionsOf、match.ts 的 glyphQuestion，題型都是現有的）：
 * - 舊篇、新篇：一模一樣的完整一堂（lessonOf）。舊篇的找一樣的字換一個紅字考（run 2），跟第一次上的時候不一樣；
 * - 小複習：每篇一題「哪個是…？」（最後一個紅字那題）；選圖出不了就找一樣的字（run 3）。
 * 第一題選圖一出來手輪流點每一張（Quiz 的 first，T-135）；手示範找一樣的字只在這一堂第一次找字的時候。
 *
 * 4 歲的內容（T-150，s4：./stage4.ts 的 planToday；沒給就全照 3 歲）：
 * - s4.long：舊篇換成加長版（這一篇有寫的話，data.ts 的 longOf）：念的、選圖、找字都用加長版（找字的干擾字從加長版的字挑）。新篇照舊短版。
 * - s4.glyph4：最多幾題找字出 4 選 1（從這一堂第一題找字開始；'half' 是一半、至少 1 題）；其他題照第 3 級出。
 *   找字現在第 4 級，但這一堂沒輪到 4 選 1 的題目也照第 3 級出（沒有門的時候不會到第 4 級）。
 * - s4.demo4：第一題 4 選 1 手先示範。
 */
export function stepsOf(
  p: { t: ZhText; n: number; old: ZhText | null; review: ZhText[] },
  done: ReadonlySet<number>,
  g: GlyphState,
  rnd: () => number = Math.random,
  s4: Stage4Plan = NO_STAGE4,
): Step[] {
  const old = p.old && s4.long ? (longOf(p.old) ?? p.old) : p.old
  const base = (Math.min(g.level, 3) || 1) as GlyphLevel
  const build = (budget: number) => {
    let left = g.level >= 4 ? budget : 0
    const lv = (): GlyphLevel => (left-- > 0 ? 4 : base)
    const raw: (Step | null)[] = [...(old ? lessonOf(old, 'old', 2, done, lv, rnd) : []), ...lessonOf(p.t, 'new', p.n, done, lv, rnd)]
    for (const r of p.review) {
      const rq = questionsOf(r, done)
      const q = rq[rq.length - 1]
      const rg = q ? null : glyph(r, 3, lv, rnd)
      raw.push(q ? { k: 'quiz', t: r, part: 'review', q, first: false } : rg ? { k: 'glyph', t: r, part: 'review', q: rg, demo: false } : null)
    }
    return raw.filter((s): s is Step => s != null)
  }
  let steps = build(s4.glyph4 === 'half' ? 0 : s4.glyph4)
  // 一半：先排一次數有幾題找字，再照一半排（至少 1 題）
  if (s4.glyph4 === 'half') steps = build(Math.max(1, Math.floor(steps.filter((s) => s.k === 'glyph').length / 2)))
  const fq = steps.findIndex((s) => s.k === 'quiz')
  const fg = steps.findIndex((s) => s.k === 'glyph')
  const f4 = s4.demo4 ? steps.findIndex((s) => s.k === 'glyph' && s.q.level === 4) : -1
  return steps.map((s, i): Step =>
    s.k === 'read'
      ? { ...s, go: goOf(steps[i + 1], s.part) }
      : s.k === 'quiz'
        ? { ...s, first: i === fq }
        : { ...s, demo: (i === fg && needsDemo(g)) || i === f4 },
  )
}
