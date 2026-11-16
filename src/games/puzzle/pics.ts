// 拼圖的圖庫（T-156 開始 16 張；T-159 家長 2026-11-16：圖太少、要切到 3×3、至少 200 張）。只有資料，./plan.ts 挑圖。
// 來源：./pics-hand.ts 一張一張手排的（67 張）＋./pics-mix.ts 用 scripts/gen-puzzle-pics.ts 產生的組合圖（一個場景、左中右三樣）。
// 每一張最上面一排沒有東西的那幾欄，在天上補一樣（coverage.ts 的 withSky）：切成 3×3 每一片都有看得出來的東西。
import { seedOf, withSky } from './coverage'
import { HAND_PICS, type PuzzlePic } from './pics-hand'
import { MIX_PICS } from './pics-mix'

export type { PuzzlePic } from './pics-hand'

export const PUZZLE_PICS: PuzzlePic[] = [...HAND_PICS, ...MIX_PICS].map((p) => ({ ...p, art: withSky(p.art, seedOf(p.id)) }))

/** 一張圖的主題：場景（農場、動物園、派對…）。新的一張不跟上一張同一個主題 */
export const themeOf = (p: PuzzlePic) => p.art.scene
