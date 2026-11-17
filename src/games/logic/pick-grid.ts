// 遊戲角選玩法的分類和排法（T-160 起；2026-11-17 分成 4 類）：純函式，scripts/test-logic-pick.ts 直接測；畫面在 ./index.tsx，樣子在 ./corner.css。
import type { LogicGame } from '../../lib/nav'

export type PickGroupId = 'count' | 'think' | 'look' | 'talk'

/**
 * 選單的 4 類（家長 2026-11-17：16 張要好找）。孩子不識字，分類只靠底色和標頭的圖示；名字只給家長看（小字）。
 * 一張遊戲只在一類；順序就是畫面上的順序。新遊戲要放進其中一類，scripts/test-logic-pick.ts 會檢查。
 */
export const PICK_GROUPS: readonly { id: PickGroupId; label: string; games: readonly LogicGame[] }[] = [
  { id: 'count', label: '數一數', games: ['picnic', 'drum', 'race', 'hide'] },
  { id: 'think', label: '動動腦', games: ['sort', 'pattern', 'puzzle', 'maze', 'blocks', 'seesaw'] },
  { id: 'look', label: '看仔細', games: ['memory', 'shadow', 'where'] },
  { id: 'talk', label: '聽和說', games: ['feel', 'order', 'listen'] },
]

/** 排版的固定尺寸（px），corner.css 用同樣的數字：卡片間距 ≥ 0.6 cm（TOUCH-1）、色塊內距、標頭高、色塊之間 */
export const PICK_GAP = 28
export const PANEL_PAD = 12
export const PANEL_HEAD = 36
export const PANEL_GAP = 18
/** 卡片寬：高 = 6：5 */
export const CARD_RATIO = 1.2
/** 平板橫向 1200×786 的選單區：寬 1200 − 左右各 36；高是返回鍵那排以下到最下緣 2 cm 以上（628 − 88） */
export const TABLET_BOX = { w: 1128, h: 540 }

export type PickLayout = {
  /** 每一排放哪幾類（PICK_GROUPS 的序號） */
  rows: number[][]
  /** 每一類平板橫的欄數 */
  cols: number[]
  /** 每一類手機直的欄數 */
  pcols: number[]
  /** 照 box 算出來的卡片寬、高，整個選單的寬、高（px） */
  card: { w: number; h: number }
  size: { w: number; h: number }
  /** 給 corner.css 的變數：卡片寬 = min(每一排 (100cqw − wk)/wc, (100cqh − hk)/hs × 6/5) */
  vars: Record<string, string | number>
}

/** 一排（幾類並排）在寬度上的固定佔用（間距、內距）和卡片欄數 */
function rowWidth(cols: number[]): { k: number; c: number } {
  const c = cols.reduce((a, b) => a + b, 0)
  return { k: PICK_GAP * (c - cols.length) + 2 * PANEL_PAD * cols.length + PANEL_GAP * (cols.length - 1), c }
}

/**
 * 平板橫的：各類照順序分成幾排、每類幾欄，挑卡片最大的排法（一頁放下、不捲動）。
 * 手機直的：一類一塊由上往下排（可以捲），4 張排 2×2，其他最多 3 欄。
 */
export function groupLayout(sizes: readonly number[], box: { w: number; h: number } = TABLET_BOX): PickLayout {
  const n = sizes.length
  let best: { rows: number[][]; cols: number[]; w: number } | null = null
  // 各類怎麼分排：相鄰的才放同一排（順序不變）
  for (let mask = 0; mask < 1 << Math.max(0, n - 1); mask++) {
    const rows: number[][] = [[]]
    for (let i = 0; i < n; i++) {
      rows[rows.length - 1].push(i)
      if (i < n - 1 && mask & (1 << i)) rows.push([])
    }
    // 每一類的欄數：1～張數
    const cols = sizes.map(() => 1)
    const step = (): boolean => {
      for (let i = 0; i < n; i++) {
        if (cols[i] < sizes[i]) {
          cols[i]++
          return true
        }
        cols[i] = 1
      }
      return false
    }
    do {
      const tall = rows.map((r) => Math.max(...r.map((g) => Math.ceil(sizes[g] / cols[g]))))
      const hk = tall.reduce((a, t) => a + PICK_GAP * (t - 1) + 2 * PANEL_PAD + PANEL_HEAD, 0) + PANEL_GAP * (rows.length - 1)
      const hs = tall.reduce((a, t) => a + t, 0)
      let w = ((box.h - hk) / hs) * CARD_RATIO
      for (const r of rows) {
        const { k, c } = rowWidth(r.map((g) => cols[g]))
        w = Math.min(w, (box.w - k) / c)
      }
      // 一樣大的話：空格少的、排數少的
      const holes = (cs: number[]) => cs.reduce((a, c, i) => a + c * Math.ceil(sizes[i] / c) - sizes[i], 0)
      if (!best || w > best.w + 0.01 || (Math.abs(w - best.w) <= 0.01 && (holes(cols) < holes(best.cols) || (holes(cols) === holes(best.cols) && rows.length < best.rows.length))))
        best = { rows: rows.map((r) => [...r]), cols: [...cols], w }
    } while (step())
  }
  const { rows, cols } = best ?? { rows: [], cols: [] }
  const w = Math.floor(best?.w ?? 0)
  const h = w / CARD_RATIO
  const tall = rows.map((r) => Math.max(...r.map((g) => Math.ceil(sizes[g] / cols[g]))))
  const hk = tall.reduce((a, t) => a + PICK_GAP * (t - 1) + 2 * PANEL_PAD + PANEL_HEAD, 0) + PANEL_GAP * (rows.length - 1)
  const hs = tall.reduce((a, t) => a + t, 0)
  const vars: Record<string, string | number> = { '--hk': `${hk}px`, '--hs': hs }
  rows.forEach((r, i) => {
    const { k, c } = rowWidth(r.map((g) => cols[g]))
    vars[`--wk${i + 1}`] = `${k}px`
    vars[`--wc${i + 1}`] = c
  })
  const size = {
    w: Math.max(0, ...rows.map((r) => { const { k, c } = rowWidth(r.map((g) => cols[g])); return k + c * w })),
    h: hk + hs * h,
  }
  const pcols = sizes.map((s) => (s === 4 ? 2 : Math.min(3, s)))
  return { rows, cols, pcols, card: { w, h }, size, vars }
}
