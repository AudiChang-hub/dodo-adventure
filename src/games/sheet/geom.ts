// 學習單題型的幾何工具：版面、蠟筆圈、圈選判斷（座標系是學習單的 1000×600）

export interface P {
  x: number
  y: number
}

export const BOARD_W = 1000
export const BOARD_H = 600

/** 一個東西在學習單上的位置與大小（單位：學習單座標） */
export interface Spot {
  x: number
  y: number
  size: number
  rot: number
}

/**
 * 把 n 個東西排在學習單上：像紙本一樣整齊但不死板，有一點點歪、一點點錯開。
 * 3 個以下排一列，4 個排 2×2，5–6 個排 3×2（5 個時下排兩個置中）。
 * 每格之間留足夠空間，孩子才圈得住一個而不碰到旁邊的。
 */
export function layout(n: number, scales: number[] = []): Spot[] {
  const rows = n <= 3 ? 1 : 2
  const perRow = n <= 3 ? [n] : n === 4 ? [2, 2] : [3, n - 3]
  const cols = Math.max(...perRow)
  const cw = BOARD_W / cols
  const ch = BOARD_H / rows
  const base = Math.min(220, Math.min(cw, ch) * (n <= 3 ? 0.58 : 0.66))
  const out: Spot[] = []
  perRow.forEach((m, r) => {
    const offset = (cols - m) / 2
    for (let c = 0; c < m; c++) {
      const i = out.length
      out.push({
        x: (offset + c + 0.5) * cw + (Math.random() - 0.5) * cw * 0.14,
        y: (r + 0.5) * ch + (Math.random() - 0.5) * ch * 0.12,
        size: base * (scales[i] ?? 1),
        rot: (Math.random() - 0.5) * 10,
      })
    }
  })
  return out
}

/** 可重現的亂數（同一個東西每次畫出來的蠟筆圈都一樣） */
function seeded(seed: number) {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 48271) % 2147483647) / 2147483647)
}

/** 手繪感的蠟筆圈：半徑微微起伏、頭尾多畫一小段交疊，像孩子用蠟筆圈起來 */
export function crayonLoop(cx: number, cy: number, r: number, seed = 7): P[] {
  const rnd = seeded(seed)
  const a0 = -Math.PI * 0.6 + rnd() * 0.5
  const turns = Math.PI * 2 + 0.55
  const wob = [rnd() * 6, rnd() * 6, rnd() * 6]
  const pts: P[] = []
  const N = 64
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const a = a0 + t * turns
    const k = 1 + 0.06 * Math.sin(a * 2 + wob[0]) + 0.035 * Math.sin(a * 3 + wob[1]) + (t > 0.9 ? (t - 0.9) * 0.6 : 0)
    pts.push({ x: cx + Math.cos(a) * r * 1.08 * k, y: cy + Math.sin(a) * r * 0.94 * k })
  }
  return pts
}

/** 點列 → 平滑的 SVG 路徑（二次貝茲取中點） */
export function smoothPath(pts: P[], close = false): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    d += ` Q${a.x.toFixed(1)} ${a.y.toFixed(1)} ${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  d += ` L${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return close ? d + ' Z' : d
}

export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

export function pathLength(pts: P[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i])
  return s
}

/** 鞋帶公式：多邊形面積（取絕對值） */
export function area(pts: P[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/** 環繞數：圈了兩圈、畫成螺旋也算在裡面（非零即在內），對孩子比較寬鬆 */
export function winding(p: P, poly: P[]): number {
  let w = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)
    if (a.y <= p.y) {
      if (b.y > p.y && cross > 0) w++
    } else if (b.y <= p.y && cross < 0) w--
  }
  return w
}

export interface LassoShape {
  /** 首尾距離夠近，自動接起來 */
  closed: boolean
  /** 首尾距離 ÷ 周長：0 代表完全接起來 */
  gapRatio: number
  /** 圓度 4πA/P²：1 是完美的圓，越扁、越歪越小 */
  circularity: number
  perimeter: number
  centroid: P
  /** 外接框的對角線 */
  span: number
  poly: P[]
}

/**
 * 分析一筆圈選：路徑不必完全封閉，首尾距離小於 max(110, 周長 × 25%) 就自動接起來。
 * 3 歲的孩子常常畫到快一圈就停筆，這個寬容度在紙本上也一樣會被當成「有圈到」。
 */
export function analyzeLasso(raw: P[]): LassoShape {
  // 太密的點去掉一些，計算比較穩
  const pts = raw.filter((p, i) => i === 0 || i === raw.length - 1 || dist(p, raw[i - 1]) > 2)
  const per = pathLength(pts)
  const gap = pts.length > 1 ? dist(pts[0], pts[pts.length - 1]) : 0
  const closedPer = per + gap
  const closed = per > 120 && gap <= Math.max(110, per * 0.25)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const A = area(pts)
  return {
    closed,
    gapRatio: closedPer ? Math.round((gap / closedPer) * 100) / 100 : 1,
    circularity: closedPer ? Math.round(((4 * Math.PI * A) / (closedPer * closedPer)) * 100) / 100 : 0,
    perimeter: Math.round(per),
    centroid: { x: xs.reduce((a, b) => a + b, 0) / (xs.length || 1), y: ys.reduce((a, b) => a + b, 0) / (ys.length || 1) },
    span: Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
    poly: pts,
  }
}
