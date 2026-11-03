// 第 2 次上同一篇（現況對照 A3）：大人念到紅字前停一下，讓孩子接（對話式共讀的「填空提示」）。
// 2026-11-03 起中文課是親子共讀（App 不出聲）：畫面只把那個詞框起來、標一個「停」，提醒大人。只有純函式，scripts/test-zh-course.ts 直接測。
import { pieces } from './data'

/**
 * 一行要停的地方：最後一個紅字（一行只停一個，不然停太多次）。挑最後一個：前面念得越多，孩子越有線索接得出來，
 * 也最像大人共讀時的「三隻小豬蓋……？」。沒有紅字回傳 null。
 */
export function gapOf(line: string): { word: string; before: string; after: string } | null {
  const ps = pieces(line)
  const k = ps.map((p) => p.red).lastIndexOf(true)
  if (k < 0) return null
  const join = (xs: typeof ps) => xs.map((p) => p.text).join('')
  return { word: ps[k].text, before: join(ps.slice(0, k)), after: join(ps.slice(k + 1)) }
}
