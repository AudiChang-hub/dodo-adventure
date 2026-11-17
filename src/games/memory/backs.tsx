// 翻翻牌的牌背（T-160）：10 種，各自一個圖案（不是同一個模板換顏色），每一局挑一種、不跟最近 3 局一樣（./plan.ts 的 pickBack）。
// 自己畫的 SVG，平塗、靜止（MOTION-2）。不用 <pattern>（同一頁好幾張牌，id 會撞），圖案直接排出來。
import { memo, type ReactElement } from 'react'

const W = 120
const H = 160
const INK = '#2E2A25'

/** 一顆五角星 */
const star = (cx: number, cy: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    return `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`
  }).join(' ') + 'Z'

const grid = (dx: number, dy: number, offset = true) => {
  const out: { x: number; y: number; k: number }[] = []
  let k = 0
  for (let r = 0, y = 0; y < H + dy; r++, y += dy) for (let x = offset && r % 2 ? dx / 2 : 0; x < W + dx; x += dx) out.push({ x, y, k: k++ })
  return out
}

const NIGHT_STARS = [
  [22, 28, 7],
  [84, 20, 5],
  [100, 62, 8],
  [30, 84, 5],
  [70, 104, 7],
  [18, 132, 6],
  [96, 140, 5],
  [56, 48, 4],
]

const BACKS: (() => ReactElement)[] = [
  // 0 夜空：星星和月亮
  () => (
    <>
      <rect width={W} height={H} fill="#34416E" />
      {NIGHT_STARS.map(([x, y, r]) => (
        <path key={`${x}-${y}`} d={star(x, y, r)} fill="#F6D776" />
      ))}
      <path d="M78 78 a20 20 0 1 0 22 26 a16 16 0 1 1 -22 -26Z" fill="#F3E7C4" />
      {[
        [46, 68],
        [12, 60],
        [108, 108],
        [48, 150],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={1.8} fill="#F3E7C4" />
      ))}
    </>
  ),
  // 1 圓點
  () => (
    <>
      <rect width={W} height={H} fill="#E9826E" />
      {grid(30, 26).map((p) => (
        <circle key={p.k} cx={p.x} cy={p.y} r={7} fill="#FBE3D6" />
      ))}
    </>
  ),
  // 2 斜條紋，中間一個恐龍腳印
  () => (
    <>
      <rect width={W} height={H} fill="#3E9C93" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d={`M${-160 + i * 28} ${H} L${i * 28} 0 L${i * 28 + 12} 0 L${-148 + i * 28} ${H}Z`} fill="#6BBDB1" />
      ))}
      <circle cx={60} cy={80} r={30} fill="#F4EBD6" stroke={INK} strokeWidth={3} />
      <g fill="#3E9C93">
        <ellipse cx={60} cy={90} rx={12} ry={10} />
        <ellipse cx={46} cy={72} rx={5} ry={8} transform="rotate(-20 46 72)" />
        <ellipse cx={60} cy={66} rx={5} ry={8} />
        <ellipse cx={74} cy={72} rx={5} ry={8} transform="rotate(20 74 72)" />
      </g>
    </>
  ),
  // 3 海浪
  () => (
    <>
      <rect width={W} height={H} fill="#4C86C6" />
      {Array.from({ length: 9 }, (_, r) => (
        <path
          key={r}
          d={`M-10 ${r * 20 + 10} ${Array.from({ length: 6 }, (_, i) => `q10 -12 20 0 q10 12 ${i % 2 ? 20 : 20} 0`).join(' ')}`}
          fill="none"
          stroke={r % 2 ? '#A9D3F0' : '#DCEFFA'}
          strokeWidth={5}
          strokeLinecap="round"
          transform={r % 2 ? 'translate(-20 0)' : undefined}
        />
      ))}
    </>
  ),
  // 4 恐龍鱗片
  () => (
    <>
      <rect width={W} height={H} fill="#7DB86A" />
      {grid(24, 16).map((p) => (
        <path key={p.k} d={`M${p.x - 12} ${p.y} a12 12 0 0 0 24 0`} fill="#A5D38F" stroke="#5E9A4D" strokeWidth={2.5} />
      ))}
    </>
  ),
  // 5 菱格
  () => (
    <>
      <rect width={W} height={H} fill="#F2C94C" />
      {grid(30, 20).map((p) => (
        <path key={p.k} d={`M${p.x} ${p.y - 10} l15 10 l-15 10 l-15 -10Z`} fill={p.k % 3 ? '#F7E3A0' : '#E59B3A'} />
      ))}
    </>
  ),
  // 6 小花
  () => (
    <>
      <rect width={W} height={H} fill="#F2B6C6" />
      {grid(40, 36).map((p) => (
        <g key={p.k} transform={`translate(${p.x} ${p.y})`}>
          {Array.from({ length: 5 }, (_, i) => (
            <ellipse key={i} cx={0} cy={-8} rx={5} ry={8} fill="#FFF4F7" transform={`rotate(${i * 72})`} />
          ))}
          <circle r={4.5} fill="#F2C94C" />
        </g>
      ))}
    </>
  ),
  // 7 雲和太陽
  () => (
    <>
      <rect width={W} height={H} fill="#9FD0EA" />
      <circle cx={92} cy={30} r={16} fill="#F7D35C" />
      {[
        [30, 50, 1],
        [80, 92, 1.2],
        [26, 128, 0.9],
        [96, 150, 0.7],
      ].map(([x, y, k]) => (
        <g key={`${x}${y}`} transform={`translate(${x} ${y}) scale(${k})`} fill="#FFFFFF">
          <circle cx={-12} cy={2} r={10} />
          <circle cx={2} cy={-6} r={13} />
          <circle cx={16} cy={2} r={9} />
          <rect x={-22} y={2} width={46} height={10} rx={5} />
        </g>
      ))}
    </>
  ),
  // 8 葉子
  () => (
    <>
      <rect width={W} height={H} fill="#3F7A55" />
      {grid(34, 30).map((p) => (
        <g key={p.k} transform={`translate(${p.x} ${p.y}) rotate(${p.k % 2 ? 35 : -35})`}>
          <path d="M0 -13 C9 -6 9 6 0 13 C-9 6 -9 -6 0 -13Z" fill={p.k % 3 ? '#8CC37A' : '#C4E19A'} />
          <path d="M0 -10 V10" stroke="#3F7A55" strokeWidth={1.8} />
        </g>
      ))}
    </>
  ),
  // 9 鋸齒
  () => (
    <>
      <rect width={W} height={H} fill="#EE9450" />
      {Array.from({ length: 9 }, (_, r) => (
        <path key={r} d={`M-10 ${r * 20 + 8} ${Array.from({ length: 8 }, () => 'l10 -10 l10 10').join(' ')}`} fill="none" stroke={r % 2 ? '#FFE0B8' : '#B9562E'} strokeWidth={5} strokeLinejoin="round" />
      ))}
    </>
  ),
]

/** 牌背第 i 種（外面的白框和圓角由 CSS 畫） */
export const CardBack = memo(function CardBack({ i }: { i: number }) {
  const Art = BACKS[((i % BACKS.length) + BACKS.length) % BACKS.length]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: 'block' }}>
      <Art />
    </svg>
  )
})

export const BACK_STYLES = BACKS.length
