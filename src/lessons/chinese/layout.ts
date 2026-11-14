// 中文課課本的排版（T-94：〈三隻小豬〉第一行的逗號被放大的圖蓋住——字級只照字數算，沒算到旁邊那一欄圖）。
// 字級照「這一篇最寬的那一行」算：那一行的字、放大的圖、左右留白加起來，要放得進課本那一頁（chinese.css 的 --zh-fs）。
// 這裡的數字要跟 chinese.css 對得上（單位都是 em：一個字的大小），scripts/check-zh-layout.mjs 會把 180 篇真的排出來量。
import { plain, readPics, type ZhText } from './data'

/** 行高（chinese.css 的 --zh-lh = 字級 × 這個） */
export const LINE_H = 1.9
/** 一個字佔多寬：字 1em ＋ 字距 0.06em */
const CHAR_W = 1.06
/** 圖的寬度（--zh-lh × 0.68），放大後（Reader 的 BIG = 1.25）往四周多出 0.125 倍 */
const PIC_W = LINE_H * 0.68
const PIC_OUT = PIC_W * 0.125
/** 亮的那一行：字和第一張圖之間、圖和圖之間（chinese.css 的 .zh-line.on .zh-pics） */
const PICS_PAD = 0.25 + PIC_OUT
const PICS_GAP = 0.15 + PIC_OUT * 2
/** 一行左右的留白（.zh-line 的 padding 0.2em）和保險 */
const SIDES = 0.4 + 0.3

/** 一行最寬的時候有多寬（em）：亮起來（圖放大）。n 是這一行旁邊有幾張圖（含借來的，data.ts 的 readPics） */
export function lineUnits(line: string, n: number): number {
  const pics = n ? PICS_PAD + n * PIC_W + (n - 1) * PICS_GAP + PIC_OUT : 0
  return plain(line).length * CHAR_W + pics + SIDES
}

/** 一篇的排版數字：最寬那一行多寬（--units）、幾行（--rows） */
export function pageUnits(t: ZhText) {
  const pics = readPics(t)
  return { units: Math.max(...t.lines.map((l, i) => lineUnits(l, pics[i].length))), rows: t.lines.length }
}
