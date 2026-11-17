// 小熊野餐的版面（T-160）：籃子、盤子、鈴鐺、客人在畫面上的位置，籃子裡每一格、盤子上每一個的中心。純函式（px），scripts/test-picnic-drum.ts 直接測。
// 平板橫的：左邊籃子、右邊客人坐在盤子後面、鈴鐺在盤子右邊。手機直的：客人在上、盤子和鈴鐺在中間、籃子在下面。
// 會改變狀態的東西（食物、鈴鐺）都不放在最下面 2 cm（TOUCH-5）。

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}

export interface PicnicGeo {
  w: number
  h: number
  portrait: boolean
  basket: Box
  plate: Box
  bell: Box
  guest: Box
  /** 一個食物畫多大（正方形的邊） */
  item: number
  /** 籃子裡第 i 格的中心 */
  tray: Pt[]
}

/** 最下面這麼高不放會改變狀態的東西（2 cm ≈ 76 CSS px，TOUCH-5） */
export const BOTTOM_SAFE = 76
/** 一排最多幾個（籃子、盤子都是：5 個一排好數） */
export const ROW_MAX = 5

/** n 個分成幾排、每排幾個（盡量平均，上面那排多；一排最多 perRow 個） */
export function rowsOf(n: number, perRow: number): number[] {
  if (n <= 0) return []
  const rows = Math.ceil(n / perRow)
  const base = Math.floor(n / rows)
  return Array.from({ length: rows }, (_, r) => base + (r < n % rows ? 1 : 0))
}

/** 在 box 裡把 n 個排成幾排、置中；回傳每一個的中心 */
function grid(box: Box, n: number, size: number, perRow: number, gap: number): Pt[] {
  const rows = rowsOf(n, perRow)
  const out: Pt[] = []
  const totalH = rows.length * size + (rows.length - 1) * gap
  rows.forEach((k, r) => {
    const rowW = k * size + (k - 1) * gap
    for (let i = 0; i < k; i++) out.push({ x: box.x + (box.w - rowW) / 2 + i * (size + gap) + size / 2, y: box.y + (box.h - totalH) / 2 + r * (size + gap) + size / 2 })
  })
  return out
}

/** 籃子裡一排放幾個：4 個以內一排；5～8 個兩排 */
export const trayPerRow = (n: number) => (n <= 4 ? 4 : Math.ceil(n / 2))

export function picnicGeo(w: number, h: number, nTray: number): PicnicGeo | null {
  if (w < 10 || h < 10) return null
  const portrait = w < h
  const safeBottom = h - BOTTOM_SAFE
  let basket: Box, plate: Box, bell: Box, guest: Box
  if (!portrait) {
    basket = { x: w * 0.03, y: h * 0.42, w: w * 0.4, h: Math.min(h * 0.46, safeBottom - h * 0.42) }
    plate = { x: w * 0.45, y: h * 0.5, w: w * 0.4, h: h * 0.28 }
    const bs = Math.min(w * 0.12, h * 0.22)
    bell = { x: w * 0.865, y: plate.y + plate.h / 2 - bs / 2, w: bs, h: bs }
    guest = { x: plate.x + plate.w * 0.14, y: h * 0.04, w: plate.w * 0.72, h: plate.y - h * 0.04 + plate.h * 0.3 }
  } else {
    guest = { x: w * 0.22, y: h * 0.03, w: w * 0.56, h: h * 0.27 }
    plate = { x: w * 0.03, y: h * 0.27, w: w * 0.7, h: h * 0.19 }
    const bs = Math.min(w * 0.22, h * 0.15)
    bell = { x: w * 0.97 - bs, y: plate.y + plate.h / 2 - bs / 2, w: bs, h: bs }
    basket = { x: w * 0.04, y: h * 0.5, w: w * 0.92, h: Math.min(h * 0.4, safeBottom - h * 0.5) }
  }
  const per = trayPerRow(nTray)
  const rows = Math.ceil(nTray / per)
  const gap = Math.min(basket.w, basket.h) * 0.06
  // 食物的大小：籃子放得下、盤子放得下兩排 5 個（最多 8 個時是 5＋3）
  const fitTray = Math.min((basket.w * 0.9 - (per - 1) * gap) / per, (basket.h * 0.86 - (rows - 1) * gap) / rows)
  const fitPlate = Math.min((plate.w * 0.84) / ROW_MAX, (plate.h * 0.86) / 2)
  const item = Math.max(40, Math.min(130, fitTray, fitPlate * 1.25))
  return { w, h, portrait, basket, plate, bell, guest, item, tray: grid(basket, nTray, item, per, gap) }
}

/** 盤子上 n 個時，第 i 個的中心（放的順序，一排最多 5 個，置中）；東西比較多時排得密一點 */
export function plateSpots(g: PicnicGeo, n: number): { pts: Pt[]; size: number } {
  const rows = Math.ceil(n / ROW_MAX)
  const size = Math.min(g.item, (g.plate.w * 0.84) / Math.min(ROW_MAX, Math.max(n, 1)), (g.plate.h * 0.86) / Math.max(rows, 1))
  const inner = { x: g.plate.x, y: g.plate.y, w: g.plate.w, h: g.plate.h * 0.94 }
  return { pts: grid(inner, n, size, ROW_MAX, size * 0.04), size }
}

/** 這一點在不在盤子上（拖過去放手時；三歲放不準，外面多算一圈） */
export function onPlate(g: PicnicGeo, p: Pt, pad = 0.18): boolean {
  const px = g.plate.w * pad
  const py = g.plate.h * pad
  return p.x >= g.plate.x - px && p.x <= g.plate.x + g.plate.w + px && p.y >= g.plate.y - py && p.y <= g.plate.y + g.plate.h + py
}
