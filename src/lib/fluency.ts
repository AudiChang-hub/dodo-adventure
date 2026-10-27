import { mastered, skill } from './adaptive'
import { FLUENCY_GAME } from './engine'

/**
 * 功文式小練習（第二批・工作線 A）：全是已熟的數字題，一題接一題快速作答。
 * 題型：認數字（num:n，Where is five?）與數數量（count:n，How many?）。
 */
export const isFluency = (game: string) => game === FLUENCY_GAME

export interface FluencyTarget {
  kind: 'num' | 'count'
  n: number
}

const ALL: FluencyTarget[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ kind: 'num' as const, n: i + 1 })),
  ...Array.from({ length: 10 }, (_, i) => ({ kind: 'count' as const, n: i + 1 })),
]
export const fluencyKey = (t: FluencyTarget) => `${t.kind}:${t.n}`

/** 至少要有幾個已熟的數字題，才排進今日冒險 */
export const FLUENCY_MIN = 3

/** 已熟的數字題 */
export const fluencyPool = () => ALL.filter((t) => mastered(fluencyKey(t)))

export const fluencyReady = () => fluencyPool().length >= FLUENCY_MIN

/** 從自由探索直接點進來、還沒有足夠已熟的題目時：改用最熟的幾個小數字，仍然是「做得到」的題目 */
export function fluencyTargets(): FluencyTarget[] {
  const pool = fluencyPool()
  if (pool.length >= FLUENCY_MIN) return pool
  const small = ALL.filter((t) => t.n <= 3)
  return [...pool, ...small.filter((t) => !pool.includes(t)).sort((a, b) => skill(fluencyKey(b)).box - skill(fluencyKey(a)).box)].slice(0, Math.max(FLUENCY_MIN, pool.length))
}
