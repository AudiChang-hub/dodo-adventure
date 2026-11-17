// 故事排順序（T-164）的出題和升降級。只有純函式，scripts/test-order-listen.ts 直接測；畫面在 ./Order.tsx。
// 一局 3 個故事。同一天不重複（42 個故事，一天可以玩 14 局都不一樣）；全部玩過了才從最久沒玩的開始。
//
// 難度（從 3 歲做得到的開始，熟練了自動升級）：
//   1 級：3 張，第一張已經放好（豆豆先說 First, …），孩子只排後面兩張
//   2 級：3 張，自己從第一張排
//   3 級：4 張（只用有 4 張的故事）
// 不評分、不說錯：點錯的那張輕輕晃一下回去，豆豆問 What comes next?；同一格點錯兩次，手指出對的那張。
// 升降級：連續 2 局全對（每個故事都一次就排對）升一級；一局有 ≥ 2 個故事有點錯退一級。
import { STORIES, stepsFor, type Story } from './data'

export type OrderLevel = 1 | 2 | 3
export const ORDER_MAX: OrderLevel = 3
export const ORDER_GAME = 'logic-order'
export const ORDER_QS = 3
export const UP_AFTER = 2
export const DOWN_AT = 2
/** 全部玩過以後，最近幾個不再出現 */
export const RECENT_STORIES = 12

type Rnd = () => number
function shuffle<T>(a: readonly T[], rnd: Rnd): T[] {
  const o = [...a]
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[o[i], o[j]] = [o[j], o[i]]
  }
  return o
}

export const cardsOf = (level: OrderLevel): 3 | 4 => (level === 3 ? 4 : 3)
export const orderSkill = (level: OrderLevel) => (level === 1 ? 'order:3-first' : level === 2 ? 'order:3' : 'order:4')

export interface OrderQ {
  level: OrderLevel
  story: Story
  /** 正確順序：故事的第幾張（stepsFor） */
  steps: number[]
  /** 下面一排卡片的順序（steps 裡的第幾個）；1 級第一張已經放好，不在這裡 */
  deck: number[]
  /** 一開始已經放好的格數（1 級是 1） */
  given: number
  skill: string
  itemId: string
}

/** 這一級用得到的故事 */
export const storiesFor = (level: OrderLevel) => STORIES.filter((s) => stepsFor(s, cardsOf(level)).length === cardsOf(level))

export interface OrderMemory {
  /** 今天的日期（YYYY-MM-DD）、今天玩過的故事 */
  day: string
  today: string[]
  /** 最近玩過的（跨天，全部玩過以後用） */
  recent: string[]
}

/** 下面那一排打亂，但不會剛好是排好的順序（不然不用排） */
function deckFor(n: number, given: number, rnd: Rnd): number[] {
  const rest = Array.from({ length: n - given }, (_, i) => i + given)
  if (rest.length < 2) return rest
  for (let k = 0; k < 20; k++) {
    const d = shuffle(rest, rnd)
    if (d.some((v, i) => v !== rest[i])) return d
  }
  return [...rest].reverse()
}

export function orderQ(level: OrderLevel, story: Story, rnd: Rnd = Math.random): OrderQ {
  const steps = stepsFor(story, cardsOf(level))
  const given = level === 1 ? 1 : 0
  return { level, story, steps, deck: deckFor(steps.length, given, rnd), given, skill: orderSkill(level), itemId: `order:${story.id}:${steps.length}` }
}

/** 一局：挑今天還沒玩過的故事（都玩過了就挑最久沒玩的），mem 會更新 */
export function orderRound(level: OrderLevel, mem: OrderMemory, day: string, rnd: Rnd = Math.random): OrderQ[] {
  if (mem.day !== day) {
    mem.day = day
    mem.today = []
  }
  const all = storiesFor(level)
  const out: Story[] = []
  for (let i = 0; i < ORDER_QS; i++) {
    const taken = (s: Story) => out.some((o) => o.id === s.id)
    let pool = all.filter((s) => !taken(s) && !mem.today.includes(s.id))
    if (!pool.length) pool = all.filter((s) => !taken(s) && !mem.recent.slice(-RECENT_STORIES).includes(s.id))
    if (!pool.length) pool = all.filter((s) => !taken(s))
    const s = pool[Math.floor(rnd() * pool.length) % pool.length]
    out.push(s)
    mem.today = [...mem.today, s.id]
    mem.recent = [...mem.recent.filter((x) => x !== s.id), s.id].slice(-STORIES.length)
  }
  return out.map((s) => orderQ(level, s, rnd))
}

// ── 進度 ─────────────────────────────────────────────────────

export interface OrderState extends OrderMemory {
  level: OrderLevel
  streak: number
  taught: number[]
}

export const ORDER_START: OrderState = { level: 1, streak: 0, taught: [], day: '', today: [], recent: [] }

export function normalizeOrder(raw: unknown): OrderState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<OrderState>
  const level = (Number.isInteger(o.level) ? Math.min(ORDER_MAX, Math.max(1, o.level as number)) : 1) as OrderLevel
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n) : [])
  return {
    level,
    streak: Number.isInteger(o.streak) && (o.streak as number) >= 0 ? (o.streak as number) : 0,
    taught: Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : [],
    day: typeof o.day === 'string' ? o.day : '',
    today: strs(o.today, STORIES.length),
    recent: strs(o.recent, STORIES.length),
  }
}

/** 一局玩完：全對（自己排的至少 2 個故事）→ streak + 1，到 UP_AFTER 升一級；≥ DOWN_AT 個故事有點錯 → 退一級 */
export function afterOrder(s: OrderState, r: { counted: number; misses: number }): OrderState {
  if (r.misses >= DOWN_AT) return { ...s, level: Math.max(1, s.level - 1) as OrderLevel, streak: 0 }
  if (r.counted >= ORDER_QS - 1 && r.misses === 0) {
    const streak = s.streak + 1
    if (streak >= UP_AFTER && s.level < ORDER_MAX) return { ...s, level: (s.level + 1) as OrderLevel, streak: 0 }
    return { ...s, streak }
  }
  return { ...s, streak: 0 }
}
