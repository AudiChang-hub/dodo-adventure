// 拼圖的圖庫（T-156 開始 16 張；T-159 家長 2026-11-16：圖太少、要切到 3×3、至少 200 張）。只有資料，./plan.ts 挑圖。
// 來源：./pics-hand.ts 一張一張手排的（故事插畫）＋./pics-free.ts 用 scripts/gen-puzzle-pics.mjs 從 12 種版型產生、
// 再用像素比對挑過的組合圖（每一片都看得出東西、同一張裡沒有兩片長一樣）。
// 手排的最上面一排沒有東西的那幾欄，在天上補一樣（coverage.ts 的 withSky）。
import { seedOf, withSky } from './coverage'
import { HAND_PICS, type PuzzlePic } from './pics-hand'
import { FREE_PICS } from './pics-free'

export type { PuzzlePic } from './pics-hand'

export const PUZZLE_PICS: PuzzlePic[] = [...HAND_PICS.map((p) => ({ ...p, art: withSky(p.art!, seedOf(p.id)) })), ...FREE_PICS]

/** 一張圖的主題：手排的是場景（農場、動物園…），組合圖是版型（大主角、湖邊倒影…）。新的一張不跟上一張同一個主題 */
export const themeOf = (p: PuzzlePic) => (p.free ? `free:${p.free.kind}` : p.art!.scene)
