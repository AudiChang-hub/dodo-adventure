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

/** 還沒有學過的數字題時，數字快答改玩這個（先教再考） */
export const FLUENCY_FALLBACK = 'm-find'

/**
 * 從自由探索直接點進來、還沒有足夠已熟的題目時：改用學過的（自己答過的）裡面最熟的幾個，仍然是「做得到」的題目。
 * 原本退回 1–3 的小數字，第一天就點進來會考沒教過的（2026-10-28 不教不考）。
 * 學過的少於 2 個時回傳空的：ChoiceGame 改玩找數字（FLUENCY_FALLBACK），不然五題都是同一題。
 */
export function fluencyTargets(): FluencyTarget[] {
  const pool = fluencyPool()
  if (pool.length >= FLUENCY_MIN) return pool
  const known = ALL.filter((t) => !pool.includes(t) && skill(fluencyKey(t)).seen > 0).sort((a, b) => skill(fluencyKey(b)).box - skill(fluencyKey(a)).box)
  const out = [...pool, ...known].slice(0, Math.max(FLUENCY_MIN, pool.length))
  return out.length >= 2 ? out : []
}
