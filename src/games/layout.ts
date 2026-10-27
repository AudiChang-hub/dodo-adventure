import { shuffle } from '../lib/random'

/**
 * 在舞台上撒 n 個不重疊的位置（百分比座標）。
 * 左下角留給主持的恐龍，所以那一格不放東西；
 * 右側最外緣留給背景裝飾（Scenery），物件只撒在 x 14%～88% 之間。
 */
export function scatter(n: number, cols = 5, rows = 2): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (r === rows - 1 && c === 0) continue
      cells.push({ x: 14 + (c + 0.5) * (74 / cols), y: 10 + (r + 0.5) * (78 / rows) })
    }
  return shuffle(cells)
    .slice(0, n)
    .map((p) => ({ x: p.x + (Math.random() - 0.5) * (37 / cols), y: p.y + (Math.random() - 0.5) * (18 / rows) }))
}
