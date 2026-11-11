import { fnv1a } from '../lib/hash'

/**
 * 貼紙本（T-132）的排法：純函式，單元測試在 scripts/test-sticker-book.ts。
 * 只讀 lib/achievements 的 album()，不改資料。
 */

/** 最新的在最前面：照拿到的時間由新到舊；同一個時間的（舊資料補發的）照原本的先後倒過來 */
export function newestFirst<T extends { ts: number }>(list: readonly T[]): T[] {
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.ts - a.s.ts || b.i - a.i)
    .map((x) => x.s)
}

/** 每張貼紙固定歪一點點（依它自己的 key，每次打開都一樣），像手貼的：-5° ～ 5° */
export function tiltOf(key: string): number {
  const h = parseInt(fnv1a(key), 36)
  return ((h % 11) - 5) * 1
}

/** 首頁貼紙板上露出幾張（最新的那幾張） */
export const BOARD_PEEK = 3
