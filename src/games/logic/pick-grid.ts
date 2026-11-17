// 遊戲角選玩法的排法（T-160）：純函式，scripts/test-picnic-drum.ts 直接測；畫面在 ./index.tsx，樣子在 ./corner.css。

/**
 * 4 張以內 2×2；更多的時候平板橫的排 2 排（每排 ⌈n/2⌉ 張，10 張是 5×2），手機直的排 2 欄（10 張是 2×5）。
 * cols/rows 是橫的、pcols/prows 是直的（corner.css 用 CSS 變數排）。
 */
export function pickGrid(n: number): { cols: number; rows: number; pcols: number; prows: number } {
  const cols = n <= 4 ? 2 : Math.ceil(n / 2)
  return { cols, rows: Math.ceil(n / cols), pcols: 2, prows: Math.ceil(n / 2) }
}
