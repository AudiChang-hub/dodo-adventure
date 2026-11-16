// 組合圖（./free.ts）切開後的檢查（T-159 第二版）：只用框算，單元測試和 scripts/gen-puzzle-pics.mjs 都用。
// 像素層級的檢查（每一格真的有畫東西、兩格看起來不一樣）在 gen-puzzle-pics.mjs 產生圖庫時做。
import { freeCells, type FreeArt } from './free'

/** 背景零件：一格只有這些的話，跟另一格只有同樣這些的，幾乎長一樣（三片都只有雲、都只有柵欄） */
const PLAIN = new Set(['cloud', 'hill', 'star', 'fence', 'rug', 'path', 'bubble', 'seaweed', 'flower', 'building', 'mountain'])

/** 切成 cols×rows 有什麼問題：空的格子、只有同樣背景的兩格 */
export function freeProblems(a: FreeArt, cols = 3, rows = 3): string[] {
  const cells = freeCells(a, cols, rows)
  const out: string[] = []
  cells.forEach((c, i) => {
    if (!c.seen.length) out.push(`第 ${i} 格沒有東西`)
  })
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a1 = cells[i].seen
      const b1 = cells[j].seen
      if (a1.length && a1.every((n) => PLAIN.has(n)) && a1.join() === b1.join()) out.push(`第 ${i}、${j} 格都只有 ${a1.join('、')}`)
    }
  return out
}
