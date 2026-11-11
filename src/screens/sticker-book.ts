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

// ── 點貼紙的反應（T-139：AI 小男生盲測，點 8～9 張就說「一直點都一樣」「好多都在講話，我聽不懂」）──
// 不同種類的貼紙各有自己的小動作；同一張再點，換一個反應（三下一輪）：
//   第 1 下：自己那一類的動作＋念名字（有中文音檔的詞念單字三明治）
//   第 2 下：轉一圈＋那一類的狀聲詞（Vroom, vroom!，content/lines-stickers.ts 的 ACT_LINE）
//   第 3 下：不說話，只有亮晶晶和叮叮聲（少一點講話）

/** 貼紙的種類（content/sticker-art.ts 的 ArtCat；這裡不 import，保持純函式） */
export type Cat = 'dino' | 'car' | 'animal' | 'sea' | 'bug' | 'fruit' | 'treat' | 'sky' | 'toy'
export type Move = 'stomp' | 'drive' | 'hop' | 'swim' | 'flutter' | 'squish' | 'float' | 'wobble' | 'bounce' | 'twirl' | 'sparkle'

/** 每一類自己的動作：恐龍踩踩、車子往前開、動物跳跳、海裡游游、蟲蟲拍翅膀、吃的東西軟 Q、天上的飄起來、玩具搖搖 */
export const CAT_MOVE: Record<Cat, Move> = {
  dino: 'stomp',
  car: 'drive',
  animal: 'hop',
  sea: 'swim',
  bug: 'flutter',
  fruit: 'squish',
  treat: 'squish',
  sky: 'float',
  toy: 'wobble',
}

export interface Reaction {
  move: Move
  /** name：念名字；act：那一類的狀聲詞；none：不說話 */
  voice: 'name' | 'act' | 'none'
}

/** 同一張貼紙點第 n 下（從 0 起）的反應。cat 是 undefined：v1 的舊貼紙（沒有種類），動作用通用的、第 2 下不說話 */
export function reactionOf(cat: Cat | undefined, n: number): Reaction {
  const r = ((n % 3) + 3) % 3
  if (r === 0) return { move: cat ? CAT_MOVE[cat] : 'bounce', voice: 'name' }
  if (r === 1) return { move: 'twirl', voice: cat ? 'act' : 'none' }
  return { move: 'sparkle', voice: 'none' }
}
