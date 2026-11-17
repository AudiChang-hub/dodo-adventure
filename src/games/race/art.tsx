// 恐龍賽跑棋（家長 2026-11-17）的圖：格子（10 種樣子）、骰子、終點、恐龍、選玩法的小圖示。都是自己畫的 SVG；恐龍是故事繪本的角色（art/storybook）。
// 背景全部靜止（MOTION-2）；格子上的數字一定看得清楚（深色字、淺色格子）。
import { memo, type ReactElement } from 'react'
import { drawItem } from '../../art/storybook/library'
import { ITEMS } from '../../art/storybook/meta'
import { Emo } from '../hide/emoji'
import type { CellShape } from './data'

const INK = '#2E2A25'

// ── 恐龍（棋子） ──────────────────────────────────────────────

const poseOf = (who: string, want?: string) => {
  const poses = ITEMS[who]?.poses ?? { stand: { w: 220, h: 220 } }
  const p = want && poses[want] ? want : Object.keys(poses)[0]
  return { pose: p, box: poses[p] }
}

/** 一隻恐龍：腳在 (x, y)，高 h；flip 轉向左邊；cheer 有歡呼的姿勢就用 */
export const Runner = memo(function Runner({ who, x, y, h, flip, cheer }: { who: string; x: number; y: number; h: number; flip?: boolean; cheer?: boolean }) {
  const { pose, box } = poseOf(who, cheer ? 'cheer' : undefined)
  const w = (box.w / box.h) * h
  const art: ReactElement | null = drawItem(who, pose)
  return (
    <svg x={x - w / 2} y={y - h} width={w} height={h} viewBox={`0 0 ${box.w} ${box.h}`} overflow="visible" aria-hidden="true">
      <g transform={flip ? `translate(${box.w} 0) scale(-1 1)` : undefined}>{art}</g>
    </svg>
  )
})

// ── 格子 ──────────────────────────────────────────────────────

/** 一格：中心 (x, y)、大小 w × h、上面的數字 n。glow：下一格（靜止的黃框，不閃） */
export const Cell = memo(function Cell({ shape, fill, edge, ink = INK, x, y, w, h, n, glow, dim }: { shape: CellShape; fill: string; edge: string; ink?: string; x: number; y: number; w: number; h: number; n: number; glow?: boolean; dim?: boolean }) {
  const r = Math.min(w, h) / 2
  const sw = 4
  let body: ReactElement
  switch (shape) {
    case 'pad':
      body = <path d={`M0 0 L${r * 0.98} ${-r * 0.2} A${r} ${r} 0 1 1 ${r * 0.98} ${r * 0.2} Z`} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" transform="rotate(-70)" />
      break
    case 'cloud':
      body = (
        <g>
          {[0, 1].map((k) => (
            <g key={k} fill={fill} stroke={k ? 'none' : edge} strokeWidth={k ? 0 : sw * 2}>
              <ellipse cx={0} cy={h * 0.12} rx={w * 0.5} ry={h * 0.3} />
              <circle cx={-w * 0.22} cy={-h * 0.04} r={h * 0.27} />
              <circle cx={w * 0.12} cy={-h * 0.14} r={h * 0.33} />
              <circle cx={w * 0.33} cy={h * 0.04} r={h * 0.22} />
            </g>
          ))}
        </g>
      )
      break
    case 'log':
      body = (
        <g>
          <ellipse rx={w / 2} ry={h / 2} fill={fill} stroke={edge} strokeWidth={sw} />
          <ellipse rx={w * 0.36} ry={h * 0.36} fill="none" stroke={edge} strokeWidth={2} opacity={0.45} />
          <ellipse rx={w * 0.22} ry={h * 0.22} fill="none" stroke={edge} strokeWidth={2} opacity={0.35} />
        </g>
      )
      break
    case 'leaf':
      body = (
        <g transform="rotate(-18)">
          <path d={`M${-w * 0.52} 0 Q${-w * 0.1} ${-h * 0.72} ${w * 0.52} 0 Q${-w * 0.1} ${h * 0.72} ${-w * 0.52} 0 Z`} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
          <path d={`M${-w * 0.5} 0 Q0 ${-h * 0.05} ${w * 0.48} 0`} fill="none" stroke={edge} strokeWidth={2} opacity={0.4} />
        </g>
      )
      break
    case 'planet':
      body = (
        <g>
          <circle r={r * 0.92} fill={fill} stroke={edge} strokeWidth={sw} />
          <path d={`M${-r * 1.15} ${r * 0.2} Q0 ${r * 0.75} ${r * 1.15} ${-r * 0.2}`} fill="none" stroke="#F6E7B8" strokeWidth={6} strokeLinecap="round" opacity={0.9} />
        </g>
      )
      break
    case 'flower':
      body = (
        <g>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2
            return <circle key={i} cx={Math.cos(a) * r * 0.55} cy={Math.sin(a) * r * 0.55} r={r * 0.42} fill={fill} stroke={edge} strokeWidth={3} />
          })}
          <circle r={r * 0.56} fill="#FFE9A8" stroke={edge} strokeWidth={3} />
        </g>
      )
      break
    case 'ice':
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={12} fill={fill} stroke={edge} strokeWidth={sw} />
          <path d={`M${-w * 0.36} ${-h * 0.18} L${-w * 0.18} ${-h * 0.36}`} stroke="#fff" strokeWidth={6} strokeLinecap="round" />
        </g>
      )
      break
    case 'sand':
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w * 0.28} fill={fill} stroke={edge} strokeWidth={sw} strokeDasharray="10 6" />
        </g>
      )
      break
    case 'stone':
      body = (
        <g>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w * 0.34} fill={fill} stroke={edge} strokeWidth={sw} />
          <ellipse cx={-w * 0.2} cy={-h * 0.28} rx={w * 0.14} ry={h * 0.05} fill="#fff" opacity={0.5} />
        </g>
      )
      break
    default:
      body = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={14} fill={fill} stroke={edge} strokeWidth={sw} />
  }
  return (
    <g transform={`translate(${x} ${y})`} opacity={dim ? 0.55 : 1}>
      {glow && <rect x={-w / 2 - 9} y={-h / 2 - 9} width={w + 18} height={h + 18} rx={22} fill="rgba(241,210,124,0.25)" stroke="#F1D27C" strokeWidth={8} />}
      {body}
      <text y={2} textAnchor="middle" dominantBaseline="central" fontSize={Math.round(h * 0.46)} fontWeight={700} fill={ink} style={{ fontFamily: 'var(--font)' }}>
        {n}
      </text>
    </g>
  )
})

// ── 骰子 ──────────────────────────────────────────────────────

/** 骰子點的位置（-1～1）；順序就是「走一格亮一顆」的順序（左上往右下） */
export const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.5, -0.5],
    [0.5, 0.5],
  ],
  3: [
    [-0.5, -0.5],
    [0, 0],
    [0.5, 0.5],
  ],
  4: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
  5: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0, 0],
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
  6: [
    [-0.5, -0.55],
    [0.5, -0.55],
    [-0.5, 0],
    [0.5, 0],
    [-0.5, 0.55],
    [0.5, 0.55],
  ],
}

/** 一顆骰子：中心 (0, 0)、邊長 s。lit：已經走了幾格（那幾顆點變成黃色、大一點；不只靠顏色） */
export function DieFace({ value, s, lit = 0, edge = INK }: { value: number; s: number; lit?: number; edge?: string }) {
  const pips = PIPS[value] ?? []
  const pr = s * 0.095
  return (
    <g>
      <rect x={-s / 2} y={-s / 2 + 6} width={s} height={s} rx={s * 0.2} fill="rgba(46,42,37,0.18)" />
      <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.2} fill="#FFFDF8" stroke={edge} strokeWidth={5} />
      {pips.map(([px, py], i) =>
        i < lit ? (
          <g key={i}>
            <circle cx={px * s * 0.62} cy={py * s * 0.62} r={pr * 1.35} fill="#F2B33D" stroke={INK} strokeWidth={3} />
          </g>
        ) : (
          <circle key={i} cx={px * s * 0.62} cy={py * s * 0.62} r={pr} fill={INK} />
        ),
      )}
    </g>
  )
}

// ── 終點 ──────────────────────────────────────────────────────

/** 終點線：黑白格子的一條（兩條跑道都過） */
export function FinishLine({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  const n = Math.ceil((y2 - y1) / 16)
  return (
    <g aria-hidden="true">
      {Array.from({ length: n }, (_, i) =>
        [0, 1].map((c) => <rect key={`${i}-${c}`} x={x + c * 10} y={y1 + i * 16} width={10} height={16} fill={(i + c) % 2 ? INK : '#fff'} opacity={0.85} />),
      )}
    </g>
  )
}

// ── 選玩法、再一局的小圖示 ─────────────────────────────────────

/** 一排有數字的石頭、一顆骰子、一隻恐龍站在 3 上面 */
export function RacePickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <ellipse cx={120} cy={178} rx={104} ry={12} fill="#E6DCCB" />
      {[1, 2, 3, 4].map((n, i) => (
        <Cell key={n} shape="stone" fill="#E7E2D8" edge="#A69C8A" x={42 + i * 52} y={150} w={46} h={42} n={n} />
      ))}
      <Runner who="sauropod" x={146} y={132} h={82} />
      <g transform="translate(58 70) rotate(-10)">
        <DieFace value={3} s={62} />
      </g>
      <Emo name="wrapped-gift" x={196} y={38} size={38} />
    </svg>
  )
}
