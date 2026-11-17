// 躲起來了幾隻（家長 2026-11-17）的圖：自己畫的躲藏處（山洞、樹叢、紙箱、草堆、樹洞）、點數圈圈、選玩法的小圖示。
// 線條、配色跟故事插畫同一套（粗深色線、柔和的顏色）。全部靜止（MOTION-2）。
import { memo, type ReactElement } from 'react'
import { Emo } from './emoji'
import { PLACES, type DrawnPlace } from './data'

const INK = '#2E2A25'

/** 自己畫的躲藏處：viewBox 0 0 100 100，底部正中間是地面 */
function drawn(id: DrawnPlace): ReactElement {
  const line = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  switch (id) {
    case 'cave':
      return (
        <g {...line}>
          <path d="M4 98 C4 60 16 30 40 22 C58 14 82 22 92 48 C98 64 98 84 97 98 Z" fill="#A79C8E" />
          <path d="M22 40 C30 32 44 30 52 34 M66 30 C74 32 82 40 84 48" fill="none" opacity={0.5} />
          <path d="M30 98 C30 76 40 62 54 62 C68 62 76 76 76 98 Z" fill="#4A4038" />
          <ellipse cx={18} cy={88} rx={7} ry={4} fill="#8C8173" />
          <ellipse cx={88} cy={90} rx={6} ry={3.5} fill="#8C8173" />
        </g>
      )
    case 'bush':
      return (
        <g {...line} fill="#6FAE62">
          <circle cx={26} cy={66} r={22} />
          <circle cx={74} cy={64} r={23} />
          <circle cx={50} cy={46} r={28} />
          <path d="M8 98 C4 82 10 72 20 70 H80 C92 72 96 84 92 98 Z" />
          <g stroke="none" fill="#E2574C">
            <circle cx={36} cy={40} r={3} />
            <circle cx={62} cy={56} r={3} />
            <circle cx={24} cy={74} r={3} />
            <circle cx={78} cy={78} r={3} />
          </g>
          <g stroke="none" fill="#8FC77E">
            <ellipse cx={44} cy={34} rx={9} ry={5} />
            <ellipse cx={70} cy={54} rx={7} ry={4} />
          </g>
        </g>
      )
    case 'box':
      return (
        <g {...line}>
          <path d="M14 38 L4 22 L40 22 L46 38 Z" fill="#D9A766" />
          <path d="M86 38 L96 22 L60 22 L54 38 Z" fill="#D9A766" />
          <rect x={12} y={38} width={76} height={60} rx={3} fill="#E8BC7E" />
          <path d="M12 38 H88" />
          <path d="M42 50 H58" stroke="#B5844A" strokeWidth={4} />
          <rect x={30} y={64} width={40} height={14} rx={3} fill="#F6DDB4" stroke="#B5844A" strokeWidth={2} />
        </g>
      )
    case 'haystack':
      return (
        <g {...line}>
          <path d="M6 98 C6 56 26 26 50 26 C74 26 94 56 94 98 Z" fill="#EBC769" />
          <g fill="none" stroke="#B58F2E" strokeWidth={2}>
            <path d="M22 60 L30 52 M40 44 L48 38 M62 50 L70 44 M30 80 L38 72 M58 76 L66 68 M76 84 L84 76" />
          </g>
          <path d="M16 74 C36 68 64 68 84 74" fill="none" stroke="#B58F2E" strokeWidth={2} />
        </g>
      )
    case 'log':
      return (
        <g {...line}>
          <path d="M20 46 H88 C96 46 98 98 88 98 H20 Z" fill="#B88456" />
          <ellipse cx={20} cy={72} rx={14} ry={26} fill="#D9AE7E" />
          <ellipse cx={20} cy={74} rx={8} ry={17} fill="#4A3828" />
          <path d="M40 56 H76 M48 70 H84 M38 86 H70" fill="none" stroke="#8C5E36" strokeWidth={2} />
          <path d="M70 46 C70 36 78 30 84 34" fill="none" />
          <ellipse cx={86} cy={34} rx={6} ry={3.5} fill="#7DBA6A" />
        </g>
      )
  }
}

/** 一個躲藏處：左上角 (x, y)、邊長 s（底部正中間是地面） */
export const PlaceArt = memo(function PlaceArt({ id, x, y, s }: { id: string; x: number; y: number; s: number }) {
  const p = PLACES.find((q) => q.id === id)
  if (!p) return null
  if (p.drawn)
    return (
      <svg x={x} y={y} width={s} height={s} viewBox="0 0 100 100" overflow="visible" aria-hidden="true">
        {drawn(p.art as DrawnPlace)}
      </svg>
    )
  return <Emo name={p.art} x={x} y={y} size={s} />
})

// ── 點數圈圈 ──────────────────────────────────────────────────

/** n 個點的排法（-1～1）：1～3 排一排斜的，4 是正方形，5 是骰子的五 */
export const DOTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.45, 0],
    [0.45, 0],
  ],
  3: [
    [-0.66, 0],
    [0, 0],
    [0.66, 0],
  ],
  4: [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ],
  5: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0, 0],
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
}

/** n 個圈圈：中心 (0, 0)，可以放的範圍 s × s */
export function Dots({ n, s, color = '#5C8FC4' }: { n: number; s: number; color?: string }) {
  const r = s * (n >= 3 ? 0.12 : 0.15)
  return (
    <g>
      {(DOTS[n] ?? []).map(([dx, dy], i) => (
        <circle key={i} cx={dx * s * 0.5} cy={dy * s * 0.5} r={r} fill={color} stroke={INK} strokeWidth={3} />
      ))}
    </g>
  )
}

// ── 選玩法、再一局的小圖示 ─────────────────────────────────────

/** 一個樹叢、外面兩隻兔子、樹叢上面露出一對耳朵 */
export function HidePickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <ellipse cx={120} cy={178} rx={104} ry={12} fill="#E6DCCB" />
      <g transform="translate(140 66)">
        <path d="M30 18 C26 2 32 -6 36 4 Z M46 18 C46 0 54 -4 54 8 Z" fill="#F4E9E1" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      </g>
      <svg x={112} y={70} width={116} height={116} viewBox="0 0 100 100" overflow="visible">
        {drawn('bush')}
      </svg>
      <Emo name="rabbit" x={10} y={112} size={62} />
      <Emo name="rabbit" x={62} y={112} size={62} />
    </svg>
  )
}
