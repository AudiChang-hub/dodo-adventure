// 數學課的進度與每一段的題目（純資料，不碰畫面）。家長定的規則（2026-10-31）：
// - 一天一個新數字，從 1 到 10；同一天再進來就複習；錯很多就隔天重上同一個數字。
// - 10 之後做 1～10 的混合複習，數量可以大一點（11～20 這次不做）。
import { getKV, setKV, today } from '../../lib/db'
import { isNew, mastered } from '../../lib/adaptive'
import { pick, rand, sample, shuffle } from '../../lib/random'

export const LAST = 10
const KV_KEY = 'lesson:math'

/**
 * new：今天的新數字；review：今天上完了又進來（同一個數字再練一次，不換新的）；
 * mix：1～10 都上完了，每天挑一個當今天的數字，其他題目 1～10 混著出
 */
export type Mode = 'new' | 'review' | 'mix'

/** 一堂課的四段（照家長定的順序） */
export const PARTS = ['count', 'compare', 'write', 'review'] as const
export type Part = (typeof PARTS)[number]

interface Progress {
  /** 下一個要教的新數字；LAST + 1 表示 1～10 都教過了 */
  next: number
  /** 今天這一堂：哪一天、今天的數字、哪一種課、上到第幾段（PARTS.length 是上完了） */
  day?: string
  n?: number
  mode?: Mode
  part?: number
  /** 今天這一堂自己答了幾題、幾題不是一次就對（決定明天要不要重上同一個數字） */
  asked?: number
  missed?: number
}

export interface Lesson {
  mode: Mode
  /** 今天的數字 */
  n: number
  /** 教過的最大數字（複習、干擾選項優先用教過的） */
  max: number
  /** 從第幾段開始（中途離開、同一天再進來：接著上） */
  part: number
}

let prog: Progress = { next: 1 }

/** 進教室：決定今天上什麼（同一天沒上完就接著上，上完了就複習） */
export async function openLesson(): Promise<Lesson> {
  prog = await getKV<Progress>(KV_KEY, { next: 1 })
  const d = today()
  const next = Math.min(Math.max(1, prog.next || 1), LAST + 1)
  if (prog.day === d && prog.n && prog.mode) {
    const n = prog.n
    const max = Math.max(n, Math.min(LAST, next - 1))
    if ((prog.part ?? 0) < PARTS.length) return { mode: prog.mode, n, max, part: prog.part ?? 0 }
    prog = { next, day: d, n, mode: prog.mode === 'new' ? 'review' : prog.mode, part: 0, asked: 0, missed: 0 }
    void setKV(KV_KEY, prog)
    return { mode: prog.mode!, n, max, part: 0 }
  }
  const mode: Mode = next > LAST ? 'mix' : 'new'
  // 混合複習：每天挑一個當今天的數字，不跟上一次一樣
  const n = mode === 'mix' ? pick(range(1, LAST).filter((x) => x !== prog.n)) : next
  prog = { next, day: d, n, mode, part: 0, asked: 0, missed: 0 }
  void setKV(KV_KEY, prog)
  return { mode, n, max: mode === 'new' ? n : LAST, part: 0 }
}

/** 一段上完：記下上到哪裡（中途離開再進來就從下一段開始）和這一段的成績 */
export function partDone(part: number, asked: number, missed: number) {
  prog = { ...prog, part: part + 1, asked: (prog.asked ?? 0) + asked, missed: (prog.missed ?? 0) + missed }
  // 新數字上完了：錯很多（一半以上、至少 3 題）就明天重上同一個數字，不然明天教下一個
  if (prog.part! >= PARTS.length && prog.mode === 'new') {
    const again = (prog.missed ?? 0) >= 3 && prog.missed! * 2 >= (prog.asked ?? 0)
    if (!again) prog.next = Math.min(LAST + 1, (prog.n ?? prog.next) + 1)
  }
  return setKV(KV_KEY, prog)
}

// ── 每一段的題目 ───────────────────────────────────────────

export const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)

/** 數數用的東西：恐龍、車子、動物、食物，一回合一種（lines-math-lesson.ts 的 COUNT_NOUNS 每一個都有一句「Let's count the …!」） */
const COUNT_SETS: string[][] = [
  ['t-rex', 'sauropod'],
  ['automobile', 'racing-car', 'bus', 'fire-engine'],
  ['dog-face', 'cat-face', 'rabbit-face', 'baby-chick', 'turtle'],
  ['red-apple', 'strawberry', 'banana', 'cookie'],
]

/** 每一回合用不同類的東西（第一回合恐龍、第二回合車子…，每天的開頭類別輪著換） */
export function countIcons(k: number): string[] {
  const start = rand(COUNT_SETS.length)
  return Array.from({ length: k }, (_, i) => pick(COUNT_SETS[(start + i) % COUNT_SETS.length]))
}

export interface CountRound {
  n: number
  icon: string
  /** 波波先示範一次（新的數字，或從來沒數過這麼多） */
  demo: boolean
}

/** 數數：兩回合。新數字第一回合先示範；複習、混合複習有一回合是別的數字（混合複習的數量大一點） */
export function countRounds(l: Lesson): CountRound[] {
  const [a, b] = countIcons(2)
  if (l.mode === 'new') return [{ n: l.n, icon: a, demo: true }, { n: l.n, icon: b, demo: false }]
  const pool = l.mode === 'mix' ? range(5, LAST) : range(1, l.max)
  const other = pick(pool.filter((x) => x !== l.n)) ?? l.n
  return shuffle([l.n, other]).map((n, i) => ({ n, icon: i ? b : a, demo: isNew(`count:${n}`) }))
}

export interface CompareQ {
  a: number
  b: number
  ask: 'more' | 'less'
  /** 先上教學卡（第一次問「多」或「少」） */
  teach: boolean
}

/**
 * 比多少：三題，數量差距先大後小。先只問「哪邊比較多」；「多」熟了才問「哪邊比較少」，第一次問「少」前先示範「這邊比較少」。
 * 一邊盡量是今天的數字（數過、寫過的那個數量）。
 */
export function compareQs(l: Lesson): CompareQ[] {
  const moreOk = mastered('compare:more')
  const gaps = l.mode === 'mix' ? [3, 2, 1] : moreOk ? [4, 3, 2] : [5, 3, 2]
  const asks: CompareQ['ask'][] = moreOk ? ['more', 'less', pick(['more', 'less'] as const)] : ['more', 'more', 'more']
  const taught = new Set<string>()
  return gaps.map((g, i) => {
    const ask = asks[i]
    const key = `compare:${ask}`
    const teach = isNew(key) && !taught.has(key)
    if (teach) taught.add(key)
    // 剛教的那一題差很多（教學卡是 6 對 2）
    const gap = teach ? Math.max(g, 4) : g
    const base = l.mode === 'mix' && i > 0 ? 1 + rand(LAST) : l.n
    const up = base + gap <= LAST
    const down = base - gap >= 1
    const other = up && down ? (Math.random() < 0.5 ? base + gap : base - gap) : up ? base + gap : down ? base - gap : base > 5 ? 1 : LAST
    const pair = shuffle([base, other])
    return { a: pair[0], b: pair[1], ask, teach }
  })
}

/** 寫數字：描幾次（新的數字 3 次，複習 2 次） */
export const writeReps = (l: Lesson) => (l.mode === 'new' ? 3 : 2)

export interface ReviewQ {
  kind: 'find' | 'howmany'
  n: number
  options: number[]
  icon: string
}

/** 長得像、同一題不一起出的數字 */
const LOOKALIKE: Record<number, number[]> = { 6: [9], 9: [6], 1: [7], 7: [1] }

/** 干擾的數字：先用教過的（離答案遠一點的優先，一眼分得出來），不夠才用還沒教的 */
function distractors(n: number, k: number, max: number): number[] {
  const bad = [n, ...(LOOKALIKE[n] ?? [])]
  const far = (x: number) => Math.abs(x - n) >= 2
  const taught = shuffle(range(1, max).filter((x) => !bad.includes(x))).sort((x, y) => Number(far(y)) - Number(far(x)))
  const rest = sample(range(1, LAST).filter(far), k, [...bad, ...taught])
  return [...taught, ...rest].slice(0, k)
}

/**
 * 小複習：兩題。「Where is N?」（找出今天的數字）和「How many?」（數一數、點數字）。
 * 新的數字剛教完：兩個選項（LOAD-1 新內容先 2 個）；複習 3 個。
 */
export function reviewQs(l: Lesson): ReviewQ[] {
  const k = l.mode === 'new' ? 1 : 2
  const [icon] = countIcons(1)
  const other = l.mode === 'new' ? l.n : pick(range(1, l.max).filter((x) => x !== l.n)) ?? l.n
  const q = (kind: ReviewQ['kind'], n: number): ReviewQ => ({ kind, n, icon, options: shuffle([n, ...distractors(n, k, l.max)]) })
  return [q('find', l.n), q('howmany', other)]
}
