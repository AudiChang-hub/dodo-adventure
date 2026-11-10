// 數學課的進度與每一段的題目（純資料，不碰畫面）。家長定的規則（2026-10-31）：
// - 一天一個新數字；同一天再進來就複習；錯很多就隔天重上同一個數字。
// - 10 之後做 1～10 的混合複習，數量可以大一點（11～20 這次不做）。
// 2026-11-02 照 docs/全球幼教指引-3到4歲.md（MA-2、NEXT-1，現況對照 A1）：
// - 1～5 一天一個；5 上完以後要「1～5 的有幾個」熟練（countReady）才開 6，還沒熟練就在 1～5 裡混合複習。不看年齡，看熟練。
// - 寫數字的結果不算進「錯很多隔天重上」（A5：描得好不好不代表數學會不會）。
import { db, getKV, phaseOf, setKV, today, type Attempt } from '../../lib/db'
import { isNew, skill } from '../../lib/adaptive'
import { pick, rand, shuffle } from '../../lib/random'
import { getTodayWorld } from '../../lib/today-world'

export const LAST = 10
/** 先學熟的範圍：1～5 熟練了才開 6 */
export const FIRM = 5
const KV_KEY = 'lesson:math'

/**
 * new：今天的新數字；review：今天上完了又進來（同一個數字再練一次，不換新的）；
 * mix：混著複習教過的數字，每天挑一個當今天的數字（1～10 都上完了，或 1～5 上完了、還在等熟練）
 */
export type Mode = 'new' | 'review' | 'mix'

/** 一堂課的五段（家長定的數數、比多少、寫數字、小複習；數數之後多一段「拿給波波」） */
export const PARTS = ['count', 'give', 'compare', 'write', 'review'] as const
export type Part = (typeof PARTS)[number]

interface Progress {
  /** 下一個要教的新數字；LAST + 1 表示 1～10 都教過了 */
  next: number
  /** 1～5 熟練過了（開了 6 以後就一直開著，不會因為後來答錯又關掉） */
  firm?: boolean
  /** 今天這一堂：哪一天、今天的數字、哪一種課、上到第幾段（PARTS.length 是上完了） */
  day?: string
  n?: number
  mode?: Mode
  /** 今天這一堂的「教過的最大數字」（1～5 混合複習時是 5） */
  max?: number
  part?: number
  /** 今天這一堂自己答了幾題、幾題不是一次就對（決定明天要不要重上同一個數字；不含寫數字） */
  asked?: number
  missed?: number
}

export interface Lesson {
  mode: Mode
  /** 今天的數字 */
  n: number
  /** 教過的最大數字（複習、干擾選項只用教過的） */
  max: number
  /** 從第幾段開始（中途離開、同一天再進來：接著上） */
  part: number
}

let prog: Progress = { next: 1 }

// ── 1～5 熟練了沒（NEXT-1） ─────────────────────────────────

/** 熟練判斷用到的作答欄位 */
export type FirmAttempt = Pick<Attempt, 'skill' | 'options' | 'firstTryCorrect' | 'date' | 'ts' | 'phase'> & Partial<Pick<Attempt, 'heard'>>

/** 1～5 的「有幾個」：小複習的 How many?（count:N）和拿給波波（give:N） */
const FIRM_SKILLS = range(1, FIRM).flatMap((n) => [`count:${n}`, `give:${n}`])

/**
 * 1～5 熟練了沒（docs/全球幼教指引-3到4歲.md 第七章「什麼叫熟練」）：
 * - 只算自己答的、3 選 1 以上的題目（2 選 1 用猜的也有一半；數數那一段每一下都算對，選項是空的，不算）；
 *   波波還沒說完要幾個就點的（heard: false，T-109）是用猜的，也不算。
 * - 最近 10 題至少 8 題第一次就對，而且分布在至少 3 個不同的日子。
 * - 1～5 每一個都至少有一次第一次就答對。
 */
export function countReady(atts: readonly FirmAttempt[]): { ready: boolean; recent: number; right: number; days: number; missing: number[] } {
  const pool = atts
    .filter((a) => phaseOf(a) === 'quiz' && a.heard !== false && a.options.length >= 3 && FIRM_SKILLS.includes(a.skill))
    .sort((x, y) => y.ts - x.ts)
  const last = pool.slice(0, 10)
  const right = last.filter((a) => a.firstTryCorrect).length
  const days = new Set(last.map((a) => a.date)).size
  const missing = range(1, FIRM).filter((n) => !pool.some((a) => a.firstTryCorrect && (a.skill === `count:${n}` || a.skill === `give:${n}`)))
  return { ready: last.length >= 10 && right >= 8 && days >= 3 && missing.length === 0, recent: last.length, right, days, missing }
}

async function firmNow(): Promise<boolean> {
  try {
    return countReady(await db.attempts.where('skill').anyOf(FIRM_SKILLS).toArray()).ready
  } catch {
    return false
  }
}

/** 進教室：決定今天上什麼（同一天沒上完就接著上，上完了就複習） */
export async function openLesson(): Promise<Lesson> {
  prog = await getKV<Progress>(KV_KEY, { next: 1 })
  const d = today()
  const next = Math.min(Math.max(1, prog.next || 1), LAST + 1)
  if (prog.day === d && prog.n && prog.mode) {
    const n = prog.n
    const max = prog.max ?? Math.max(n, Math.min(LAST, next - 1))
    if ((prog.part ?? 0) < PARTS.length) return { mode: prog.mode, n, max, part: Math.min(prog.part ?? 0, PARTS.length - 1) }
    prog = { ...prog, next, day: d, n, mode: prog.mode === 'new' ? 'review' : prog.mode, max, part: 0, asked: 0, missed: 0 }
    void setKV(KV_KEY, prog)
    return { mode: prog.mode!, n, max, part: 0 }
  }
  // 1～5 都上過了：熟練了才開 6（開了就一直開著）
  const firm = !!prog.firm || (next > FIRM && (await firmNow()))
  const waiting = next > FIRM && !firm
  const mode: Mode = next > LAST || waiting ? 'mix' : 'new'
  const max = mode === 'new' ? next : waiting ? FIRM : LAST
  // 混合複習：每天挑一個當今天的數字，不跟上一次一樣
  const n = mode === 'mix' ? pick(range(1, max).filter((x) => x !== prog.n)) : next
  prog = { next, firm, day: d, n, mode, max, part: 0, asked: 0, missed: 0 }
  void setKV(KV_KEY, prog)
  return { mode, n, max, part: 0 }
}

/** 一段上完：記下上到哪裡（中途離開再進來就從下一段開始）和這一段的成績 */
export function partDone(part: number, asked: number, missed: number) {
  // 寫數字描得好不好不影響明天上什麼（A5）
  const counted = PARTS[part] === 'write' ? { asked: 0, missed: 0 } : { asked, missed }
  prog = { ...prog, part: part + 1, asked: (prog.asked ?? 0) + counted.asked, missed: (prog.missed ?? 0) + counted.missed }
  // 新數字上完了：錯很多（一半以上、至少 3 題）就明天重上同一個數字，不然明天教下一個（5 之後要不要開 6，明天進教室時看熟練）
  if (prog.part! >= PARTS.length && prog.mode === 'new') {
    const again = (prog.missed ?? 0) >= 3 && prog.missed! * 2 >= (prog.asked ?? 0)
    if (!again) prog.next = Math.min(LAST + 1, (prog.n ?? prog.next) + 1)
  }
  return setKV(KV_KEY, prog)
}

// ── 每一段的題目 ───────────────────────────────────────────

export function range(a: number, b: number) {
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
}

/** 數數用的東西：恐龍、車子、動物、食物，一回合一種（lines-math-lesson.ts 的 COUNT_NOUNS 每一個都有一句「Let's count the …!」） */
const COUNT_SETS: string[][] = [
  ['t-rex', 'sauropod'],
  ['automobile', 'racing-car', 'bus', 'fire-engine'],
  ['dog-face', 'cat-face', 'rabbit-face', 'baby-chick', 'turtle'],
  ['red-apple', 'strawberry', 'banana', 'cookie'],
]

/**
 * 每一回合用不同的東西。
 * - 有今天的世界（T-127，lib/today-world.ts）：從世界的東西裡挑，k 個盡量不重複（今天在農場就數牛、豬、小雞）。
 * - 沒有（世界關掉）：照舊，第一回合恐龍、第二回合車子…，每天的開頭類別輪著換。
 */
export function countIcons(k: number, date?: Date): string[] {
  const world = getTodayWorld(date)
  if (world) {
    const order = shuffle([...world.things])
    return Array.from({ length: k }, (_, i) => order[i % order.length])
  }
  const start = rand(COUNT_SETS.length)
  return Array.from({ length: k }, (_, i) => pick(COUNT_SETS[(start + i) % COUNT_SETS.length]))
}

export interface CountRound {
  n: number
  icon: string
  /** 波波先示範一次（新的數字，或從來沒數過這麼多） */
  demo: boolean
}

/** 混合複習時「有幾個」挑的數量：開了 6 以後大一點（4～），還在 1～5 時就是 2～5 */
const mixPool = (l: Lesson) => (l.max > FIRM ? range(4, l.max) : range(2, l.max))

/** 數數：兩回合。新數字第一回合先示範；複習、混合複習有一回合是別的數字 */
export function countRounds(l: Lesson): CountRound[] {
  const [a, b] = countIcons(2)
  if (l.mode === 'new') return [{ n: l.n, icon: a, demo: true }, { n: l.n, icon: b, demo: false }]
  const pool = l.mode === 'mix' ? mixPool(l) : range(1, l.max)
  const other = pick(pool.filter((x) => x !== l.n)) ?? l.n
  return shuffle([l.n, other]).map((n, i) => ({ n, icon: i ? b : a, demo: isNew(`count:${n}`) }))
}

/**
 * 數數時東西怎麼擺（MA-2：先排好再打散）：
 * - 5 個以內、而且這個數量已經熟了：撒開（原本的做法）。
 * - 還沒熟的、或 6 個以上：排好——5 個以內一排；6 個以上第一排 5 個、第二排是多出來的（「5 和 1」的樣子）。
 */
export const lineUp = (n: number, known: boolean) => n > FIRM || !known

export interface GiveRound {
  /** 波波要幾個 */
  n: number
  icon: string
  /** 左邊放幾個可以拿（比要的多 2 個，最多 7 個） */
  supply: number
  /** 波波先示範一次（還沒拿過這個數量給波波） */
  demo: boolean
}

/**
 * 拿給波波：一回合，「Give me three!」孩子把東西一個一個點進盤子、點勾勾交給波波（Give-N，MA-2）。
 * 數量只用 1～5（「拿 N 個」超過 5 是 4 歲的內容）：今天的數字在 5 以內就拿今天的數字，不然從教過的 3～5 挑。
 */
export function giveRounds(l: Lesson): GiveRound[] {
  const [icon] = countIcons(1)
  const top = Math.min(FIRM, l.max)
  const n = l.mode !== 'mix' && l.n <= FIRM ? l.n : pick(range(Math.min(3, top), top))
  return [{ n, icon, supply: Math.min(7, n + 2), demo: isNew(`give:${n}`) }]
}

export interface CompareQ {
  a: number
  b: number
  ask: 'more' | 'less'
  /** 先上教學卡（第一次問「多」或「少」） */
  teach: boolean
}

/**
 * 比多少的另一邊：1～cap 裡面離 base 的差距最接近 gap 的（一樣接近的隨便挑一個，三題才不會都一樣）。
 * easy（剛教完的那一題）：只挑至少差兩倍的（2 比 6 比 4 比 8 好分）。前面出過一樣的兩堆就盡量換一個。
 */
const pairKey = (a: number, b: number) => `${Math.min(a, b)}v${Math.max(a, b)}`
function otherSide(base: number, gap: number, cap: number, easy: boolean, used: ReadonlySet<string>) {
  const ratio = (x: number) => Math.max(x, base) / Math.min(x, base)
  const all = range(1, cap).filter((x) => x !== base)
  const cands = shuffle(easy && all.some((x) => ratio(x) >= 2) ? all.filter((x) => ratio(x) >= 2) : all)
  // 跟前一題一模一樣的兩堆排到後面
  const off = (x: number) => Math.abs(Math.abs(x - base) - gap) + (used.has(pairKey(base, x)) ? 0.5 : 0)
  return cands.sort((x, y) => off(x) - off(y))[0] ?? (base > 1 ? 1 : 2)
}

/**
 * 比多少：兩題（T-112：以前三題，換成多寫一次數字），數量差距先大後小。先只問「哪邊比較多」；「多」熟了才問「哪邊比較少」，第一次問「少」前先示範「這邊比較少」。
 * 一邊盡量是今天的數字（數過、寫過的那個數量）；數量不超過開放的範圍（還沒開 6 就在 5 以內）。
 */
/**
 * 比多少只有左右兩堆（MA-5：各國 3～4 歲都是比兩堆），用猜的也有一半會對；所以「多」熟了沒不用一般的熟練度（3 次就算），
 * 要連續 6 次第一次就對（猜中的機會不到 2%）才開始問「少」。
 */
export const COMPARE_STREAK = 6
export const moreFirm = () => skill('compare:more').streak >= COMPARE_STREAK

export function compareQs(l: Lesson): CompareQ[] {
  const moreOk = moreFirm()
  const cap = Math.min(LAST, Math.max(FIRM, l.max))
  const gaps = l.mode === 'mix' ? [3, 1] : [4, 2]
  const asks: CompareQ['ask'][] = moreOk ? ['more', 'less'] : ['more', 'more']
  const taught = new Set<string>()
  const used = new Set<string>()
  return gaps.map((g, i) => {
    const ask = asks[i]
    const key = `compare:${ask}`
    const teach = isNew(key) && !taught.has(key)
    if (teach) taught.add(key)
    // 剛教的那一題差很多
    const gap = teach ? Math.max(g, 4) : g
    const base = l.mode === 'mix' && i > 0 ? 1 + rand(cap) : l.n
    const other = otherSide(base, gap, cap, teach || i === 0, used)
    used.add(pairKey(base, other))
    const pair = shuffle([base, other])
    return { a: pair[0], b: pair[1], ask, teach }
  })
}

/**
 * 寫數字：描幾次（A5，AI 小男生測試 #2）：一律兩次，第二次換一個樣子（Write.tsx 的 LOOKS），每一次描完就慶祝。
 * T-112（家長：「手寫的比例可以多一些」）：新的數字以前只描一次，改成兩次，比多少少一題來換，一堂不變長。
 * 寫數字不是 3 歲的目標（MA-9），描得好不好不影響明天上什麼（partDone）。
 */
export const writeReps = (_l: Lesson) => 2

export interface ReviewQ {
  kind: 'find' | 'howmany'
  n: number
  options: number[]
  icon: string
}

/** 長得像、同一題不一起出的數字 */
const LOOKALIKE: Record<number, number[]> = { 6: [9], 9: [6], 1: [7], 7: [1] }

/**
 * 干擾的數字：只用教過的（不教不考，家長 2026-11-02；離答案遠一點的優先，一眼分得出來）。
 * 教過的不夠就少一個選項：第一天只教了 1，「Where is one?」只有 1 一個選項，點它就好。
 */
export function distractors(n: number, k: number, max: number): number[] {
  const bad = [n, ...(LOOKALIKE[n] ?? [])]
  const far = (x: number) => Math.abs(x - n) >= 2
  return shuffle(range(1, max).filter((x) => !bad.includes(x)))
    .sort((x, y) => Number(far(y)) - Number(far(x)))
    .slice(0, k)
}

/** 小複習要教過 3 個數字才出（不然選項湊不到 3 個，又不能用還沒教的數字） */
export const REVIEW_FROM = 3

/**
 * 小複習：兩題。「Where is N?」（找出今天的數字）和「How many?」（數一數、點數字）。一律 3 選 1
 * （AI 小男生測試 #8：2 選 1 用猜的也有一半，會高估程度；熟練只算 3 選 1 以上的題目）。
 * 只教了 1、2 的那兩天：選項湊不到 3 個（不能用還沒教的數字），不出小複習——那兩天的數字「拿給波波」已經考過（index.tsx 跳過這一段）。
 */
export function reviewQs(l: Lesson): ReviewQ[] {
  if (l.max < REVIEW_FROM) return []
  const k = 2
  const [icon] = countIcons(1)
  const pool = l.mode === 'mix' ? mixPool(l) : range(1, l.max)
  const other = l.mode === 'new' ? l.n : pick(pool.filter((x) => x !== l.n)) ?? l.n
  const q = (kind: ReviewQ['kind'], n: number): ReviewQ => ({ kind, n, icon, options: shuffle([n, ...distractors(n, k, l.max)]) })
  return [q('find', l.n), q('howmany', other)]
}
