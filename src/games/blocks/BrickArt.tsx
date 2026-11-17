// 積木的畫法（T-162）：平面版只畫正面；立體版斜著看（往後一排往右上挪，看得到上面和右邊）。
// 一律是自己畫的 SVG：圓形凸點、粗黑線條，跟遊戲角其他遊戲同一套；沒有字、沒有商標。
import type { ReactNode } from 'react'
import { COLORS, DEPTH, paintOrder, studsOf, type Brick } from './bricks'

export const INK = '#2E2A25'
/** 一格多大（SVG 的單位）；整張圖再用 viewBox 縮放 */
export const U = 40
const SW = 2.6
export const PLATE = '#A9CF8F'

type Pt = [number, number]
export type View = 'flat' | 'deep'

const k = (v: View) => (v === 'deep' ? DEPTH : { x: 0, z: 0 })
/** 世界座標（x 右、z 上、y 往後）→ SVG（y 往下） */
export const proj = (v: View, x: number, z: number, y: number): Pt => {
  const d = k(v)
  return [(x + y * d.x) * U, -(z + y * d.z) * U]
}

function mix(hex: string, to: string, t: number) {
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(to.slice(1), 16)
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`
}
export const lighter = (hex: string, t = 0.25) => mix(hex, '#FFFFFF', t)
export const darker = (hex: string, t = 0.2) => mix(hex, '#000000', t)

/** 側面的輪廓（x、z，逆時針） */
function profile(b: Brick): [number, number][] {
  const { x, z, w } = b
  if (b.shape === 'slopeR') return w === 1 ? [[x, z], [x + 1, z], [x + 1, z + 1]] : [[x, z], [x + w, z], [x + w, z + 1], [x + w - 1, z + 1]]
  if (b.shape === 'slopeL') return w === 1 ? [[x, z], [x + 1, z], [x, z + 1]] : [[x, z], [x + w, z], [x + 1, z + 1], [x, z + 1]]
  return [[x, z], [x + w, z], [x + w, z + 1], [x, z + 1]]
}

const pts = (p: Pt[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')

export interface Paint {
  /** 換掉填色（發亮的提示框、步驟圖之前的步驟） */
  fill?: string
  stroke?: string
  strokeWidth?: number
  dash?: string
}

function Stud({ v, cx, z, cy, fill, p }: { v: View; cx: number; z: number; cy: number; fill: string; p?: Paint }) {
  const st = { stroke: p?.stroke ?? INK, strokeWidth: p?.strokeWidth ?? SW * 0.85, strokeDasharray: p?.dash }
  const f = p?.fill ?? fill
  if (v === 'flat') {
    const [sx, sy] = proj(v, cx, z, 0)
    return <rect x={sx - 0.28 * U} y={sy - 0.2 * U} width={0.56 * U} height={0.2 * U + 2} rx={3} fill={f} {...st} />
  }
  const [sx, sy] = proj(v, cx, z, cy)
  const r = 0.27 * U
  const ry = 0.11 * U
  const h = 0.17 * U
  return (
    <g>
      <path d={`M${sx - r} ${sy - h} L${sx - r} ${sy} A${r} ${ry} 0 0 0 ${sx + r} ${sy} L${sx + r} ${sy - h} Z`} fill={p?.fill ?? darker(fill, 0.08)} {...st} />
      <ellipse cx={sx} cy={sy - h} rx={r} ry={ry} fill={p?.fill ?? lighter(fill, 0.3)} {...st} />
    </g>
  )
}

/** 一塊積木（SVG 的 g） */
export function BrickShape({ b, v, p }: { b: Brick; v: View; p?: Paint }): ReactNode {
  const base = COLORS[b.color].hex
  const st = { stroke: p?.stroke ?? INK, strokeWidth: p?.strokeWidth ?? SW, strokeLinejoin: 'round' as const, strokeDasharray: p?.dash }
  const y0 = b.y
  const y1 = b.y + b.d
  if (b.shape === 'wheel') {
    const r = 0.46 * U
    const c0 = proj(v, b.x + 0.5, b.z + 0.5, y0 + 0.08)
    const out: ReactNode[] = []
    if (v === 'deep') {
      const c1 = proj(v, b.x + 0.5, b.z + 0.5, y1 - 0.12)
      const dx = c1[0] - c0[0]
      const dy = c1[1] - c0[1]
      const L = Math.hypot(dx, dy) || 1
      const nx = (-dy / L) * r
      const ny = (dx / L) * r
      out.push(<circle key="b" cx={c1[0]} cy={c1[1]} r={r} fill={p?.fill ?? darker(base, 0.25)} {...st} />)
      out.push(<polygon key="h" points={pts([[c0[0] + nx, c0[1] + ny], [c1[0] + nx, c1[1] + ny], [c1[0] - nx, c1[1] - ny], [c0[0] - nx, c0[1] - ny]])} fill={p?.fill ?? darker(base, 0.15)} stroke="none" />)
    }
    out.push(<circle key="f" cx={c0[0]} cy={c0[1]} r={r} fill={p?.fill ?? base} {...st} />)
    if (!p?.fill) out.push(<circle key="c" cx={c0[0]} cy={c0[1]} r={0.17 * U} fill="#CDCFD2" {...st} strokeWidth={SW * 0.8} />)
    return <g>{out}</g>
  }
  if (b.shape === 'round') {
    const out: ReactNode[] = []
    for (let j = 0; j < b.d; j++) {
      const cy = y0 + j + 0.5
      const [bx, by] = proj(v, b.x + 0.5, b.z, v === 'deep' ? cy : 0)
      const [, ty] = proj(v, b.x + 0.5, b.z + 1, v === 'deep' ? cy : 0)
      const r = 0.45 * U
      if (v === 'flat') {
        out.push(<rect key={`r${j}`} x={bx - r} y={ty} width={2 * r} height={by - ty} rx={0.2 * U} fill={p?.fill ?? base} {...st} />)
      } else {
        const ry = 0.18 * U
        out.push(<path key={`r${j}`} d={`M${bx - r} ${ty} L${bx - r} ${by} A${r} ${ry} 0 0 0 ${bx + r} ${by} L${bx + r} ${ty} Z`} fill={p?.fill ?? base} {...st} />)
        out.push(<ellipse key={`t${j}`} cx={bx} cy={ty} rx={r} ry={ry} fill={p?.fill ?? lighter(base)} {...st} />)
      }
      out.push(<Stud key={`s${j}`} v={v} cx={b.x + 0.5} z={b.z + 1} cy={cy} fill={base} p={p} />)
    }
    return <g>{out}</g>
  }
  const prof = profile(b)
  const faces: ReactNode[] = []
  if (v === 'deep') {
    const d = DEPTH
    for (let i = 0; i < prof.length; i++) {
      const A = prof[i]
      const B = prof[(i + 1) % prof.length]
      const nx = B[1] - A[1]
      const nz = -(B[0] - A[0])
      if (nx * d.x + nz * d.z <= 1e-6) continue
      const shade = nx === 0 ? lighter(base, 0.28) : nz === 0 ? darker(base, 0.18) : lighter(base, 0.12)
      const q: Pt[] = [proj(v, A[0], A[1], y0), proj(v, B[0], B[1], y0), proj(v, B[0], B[1], y1), proj(v, A[0], A[1], y1)]
      faces.push(<polygon key={`f${i}`} points={pts(q)} fill={p?.fill ?? shade} {...st} />)
    }
  }
  faces.push(<polygon key="front" points={pts(prof.map(([x, z]) => proj(v, x, z, y0)))} fill={p?.fill ?? base} {...st} />)
  // 正面的一條亮邊（看起來是塑膠積木，不是紙片）
  if (!p && b.shape === 'brick' && v === 'flat') {
    const [lx, ly] = proj(v, b.x, b.z + 1, y0)
    faces.push(<rect key="hl" x={lx + 5} y={ly + 5} width={b.w * U - 10} height={5} rx={2.5} fill={lighter(base, 0.35)} stroke="none" />)
  }
  if (b.shape === 'eyeL' || b.shape === 'eyeR') {
    const ex = b.shape === 'eyeL' ? b.x : b.x + b.w - 1
    const [cx, cy] = proj(v, ex + 0.5, b.z + 0.55, y0)
    const look = b.shape === 'eyeL' ? -1 : 1
    faces.push(
      <g key="eye">
        <circle cx={cx} cy={cy} r={0.25 * U} fill={p?.fill ?? '#FFFFFF'} {...st} />
        {!p?.fill && <circle cx={cx + look * 0.06 * U} cy={cy} r={0.11 * U} fill={INK} />}
      </g>,
    )
  }
  for (const sx of studsOf(b)) for (let j = 0; j < b.d; j++) faces.push(<Stud key={`s${sx}-${j}`} v={v} cx={sx + 0.5} z={b.z + 1} cy={y0 + j + 0.5} fill={base} p={p} />)
  return <g>{faces}</g>
}

/** 一組積木的範圍（SVG 單位），含凸點的高度 */
export function boxOf(bs: readonly Brick[], v: View, pad = 0.15) {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const b of bs) {
    for (const [x, z] of [
      [b.x, b.z],
      [b.x + b.w, b.z + 1.22],
    ])
      for (const y of v === 'deep' ? [b.y, b.y + b.d] : [0]) {
        const [sx, sy] = proj(v, x, z, y)
        x0 = Math.min(x0, sx)
        x1 = Math.max(x1, sx)
        y0 = Math.min(y0, sy)
        y1 = Math.max(y1, sy)
      }
  }
  if (!bs.length) return { x: 0, y: -U, w: U, h: U }
  const m = pad * U
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m }
}

/** 底板：cols 格寬、立體版 rows 排深；上面一排凸點（被積木蓋住的地方之後會被積木蓋過去） */
export function Plate({ cols, rows = 1, v, x0 = 0 }: { cols: number; rows?: number; v: View; x0?: number }) {
  const T = 0.32
  const top = PLATE
  const out: ReactNode[] = []
  if (v === 'flat') {
    const [lx, ly] = proj(v, x0, 0, 0)
    out.push(<rect key="p" x={lx} y={ly} width={cols * U} height={T * U} rx={6} fill={top} stroke={INK} strokeWidth={SW} />)
    for (let i = 0; i < cols; i++) out.push(<Stud key={i} v={v} cx={x0 + i + 0.5} z={0} cy={0} fill={top} />)
    return <g>{out}</g>
  }
  const fl = (x: number, z: number, y: number) => proj(v, x, z, y)
  const x1 = x0 + cols
  // 上面、正面、右邊
  out.push(<polygon key="t" points={pts([fl(x0, 0, 0), fl(x1, 0, 0), fl(x1, 0, rows), fl(x0, 0, rows)])} fill={top} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />)
  out.push(<polygon key="f" points={pts([fl(x0, -T, 0), fl(x1, -T, 0), fl(x1, 0, 0), fl(x0, 0, 0)])} fill={darker(top, 0.08)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />)
  out.push(<polygon key="r" points={pts([fl(x1, -T, 0), fl(x1, -T, rows), fl(x1, 0, rows), fl(x1, 0, 0)])} fill={darker(top, 0.18)} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />)
  for (let j = rows - 1; j >= 0; j--) for (let i = 0; i < cols; i++) out.push(<Stud key={`${i}-${j}`} v={v} cx={x0 + i + 0.5} z={0} cy={j + 0.5} fill={top} />)
  return <g>{out}</g>
}

/** 一組積木照先後畫好（下面、後面、左邊的先畫） */
export function BrickSet({ bricks, v, paint }: { bricks: readonly Brick[]; v: View; paint?: (b: Brick, i: number) => Paint | undefined }) {
  const order = paintOrder(bricks.map((b, i) => ({ ...b, i })))
  return (
    <g>
      {order.map((b) => (
        <BrickShape key={b.i} b={b} v={v} p={paint?.(bricks[b.i], b.i)} />
      ))}
    </g>
  )
}

/** 一張完整的圖：模型放在底板上（參考圖、總覽、選單用） */
export function ModelPic({ bricks, v, plate = true, margin = 1, className }: { bricks: readonly Brick[]; v: View; plate?: boolean; margin?: number; className?: string }) {
  const W = Math.max(...bricks.map((b) => b.x + b.w))
  const D = Math.max(1, ...bricks.map((b) => b.y + b.d))
  const shifted = bricks.map((b) => ({ ...b, x: b.x + margin }))
  const plateBox = plate ? boxOf([{ x: 0, z: -0.32, y: 0, w: W + 2 * margin, d: D, color: 'G', shape: 'brick' }], v, 0.05) : null
  const mb = boxOf(shifted, v)
  const x0 = Math.min(mb.x, plateBox?.x ?? Infinity)
  const y0 = Math.min(mb.y, plateBox?.y ?? Infinity)
  const x1 = Math.max(mb.x + mb.w, plateBox ? plateBox.x + plateBox.w : -Infinity)
  const y1 = Math.max(mb.y + mb.h, plateBox ? 0.32 * U + 4 : -Infinity)
  return (
    <svg className={className} viewBox={`${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`} width="100%" height="100%" aria-hidden="true">
      {plate && <Plate cols={W + 2 * margin} rows={D} v={v} />}
      <BrickSet bricks={shifted} v={v} />
    </svg>
  )
}
