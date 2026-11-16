// 拼圖的版面（T-156；T-159 抽出來給 scripts/test-puzzle-maze.ts 測 3×3 九片放得下）：拼盤、參考圖、托盤每一格的位置和大小。只有純函式，畫面在 ./Puzzle.tsx。
export type Box = { x: number; y: number; w: number; h: number }
export type Geo = { board: Box; ref: Box; pw: number; ph: number; tray: { x: number; y: number }[]; s: number; w: number; h: number }

/**
 * 版面：拼盤在左（橫的 960:600，只有空格子）；右上角一張小的完整圖當參考（拼盤寬的 0.4，像拼圖盒上的圖）；
 * 參考圖下面是托盤，跟拼盤一樣排成 cols×rows（片縮小放），每一格稍微散開。
 * 3×3（T-159）：拼盤窄一點（0.46）、參考圖靠上，托盤的片放大到 0.9，平板上每一片還是約 2 公分高、好拖（TOUCH-1）。
 */
export function geometry(w: number, h: number, cols: number, rows: number, spread: readonly { dx: number; dy: number }[]): Geo | null {
  if (w < 50 || h < 50) return null
  const gap = Math.max(20, w * 0.025)
  const big = rows >= 3
  const bw = Math.min(w * (big ? 0.46 : 0.54), (h - 24) * 1.6)
  const bh = bw / 1.6
  const board = { x: gap, y: (h - bh) / 2, w: bw, h: bh }
  const pw = bw / cols
  const ph = bh / rows
  const tx = board.x + bw + gap * 1.5
  const tw = w - tx - gap * 0.5
  const rw = Math.min(bw * (big ? 0.45 : 0.4), tw * (big ? 0.6 : 0.7))
  const ref = { x: tx + tw - rw, y: big ? Math.min(board.y, 8) : board.y, w: rw, h: rw / 1.6 }
  const tg = Math.max(18, h * 0.035)
  const top = ref.y + ref.h + tg
  const th = h - top - 8
  const s = Math.max(0.3, Math.min(big ? 0.9 : 0.8, (tw - tg * (cols + 1)) / cols / pw, (th - tg * rows) / rows / ph))
  const cw = pw * s
  const chh = ph * s
  const x0 = tx + (tw - (cols * cw + (cols - 1) * tg)) / 2
  const y0 = top + (th - (rows * chh + (rows - 1) * tg)) / 2
  // 散開：每一格最多挪開 0.45 個間隔（相鄰兩片不會疊在一起）
  const jig = tg * 0.45
  const tray = Array.from({ length: cols * rows }, (_, k) => ({
    x: x0 + (k % cols) * (cw + tg) + cw / 2 + (spread[k]?.dx ?? 0) * jig,
    y: y0 + Math.floor(k / cols) * (chh + tg) + chh / 2 + (spread[k]?.dy ?? 0) * jig,
  }))
  return { board, ref, pw, ph, tray, s, w, h }
}
