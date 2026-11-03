// 上完一堂課有沒有挑貼紙（全球幼教指引 HOW-7，現況對照 A7 選項 2，2026-11-03 家長決定）。
// 事先知道「做完就有」的獎品，會讓孩子之後比較不想主動去做；不固定、事先不說的小驚喜沒有這個問題。
// 所以不再每堂都給：平均每 3～4 堂一次，沒有固定間隔；不會連著兩堂都有，也不會連著好幾堂都沒有。
// 這個檔只有規則（不碰資料庫），lib/achievements.ts 存狀態，scripts/test-lesson-sticker.ts 模擬驗收。

/** 上次挑貼紙之後上了幾堂（since），這一輪輪到第幾堂出現（next） */
export interface LessonGap {
  since: number
  next: number
}

/**
 * 下一張隔幾堂：2～5 堂，3、4 堂最常見（平均 3.5 堂）。
 * 最少 2：不會連著兩堂都有；最多 5：最多連著 4 堂沒有。
 */
const GAPS = [2, 3, 3, 3, 4, 4, 4, 5] as const

export const drawGap = (r: () => number = Math.random): number => GAPS[Math.min(GAPS.length - 1, Math.floor(r() * GAPS.length))]

/** 上完一堂：這一堂有沒有貼紙，和更新後的狀態。第一次（沒有狀態）先抽這一輪的間隔 */
export function afterLesson(g: LessonGap | undefined, r: () => number = Math.random): { sticker: boolean; gap: LessonGap } {
  const cur = g ?? { since: 0, next: drawGap(r) }
  const since = cur.since + 1
  if (since >= cur.next) return { sticker: true, gap: { since: 0, next: drawGap(r) } }
  return { sticker: false, gap: { since, next: cur.next } }
}
