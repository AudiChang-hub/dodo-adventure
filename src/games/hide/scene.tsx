// 躲起來了幾隻、恐龍賽跑棋（家長 2026-11-17）共用的背景：天空、地面、遠景（海、湖、山丘、沙丘、星星、室內的牆和地板）、Fluent Emoji 的裝飾。
// 全部靜止（MOTION-2：等孩子操作的時候只有要看的那一個在動）。畫在一張 SVG 裡（w × h 的場景座標）。
import { memo, useId } from 'react'
import { Emo } from './emoji'

export interface SceneDef {
  /** 天空上、下的顏色（室內：牆） */
  sky: [string, string]
  /** 地面（室內：地板） */
  ground: string
  /** 地平線那一條遠一點的地面（海、湖、遠山）：沒給就跟 ground 一樣 */
  far?: string
  /** 地平線在畫面多高（0～1） */
  horizon: number
  /** 額外畫的：海浪、湖、山丘、沙丘、星星、室內的牆腳和窗戶、雲 */
  extra?: 'sea' | 'lake' | 'hills' | 'dunes' | 'stars' | 'room' | 'clouds'
  /** 遠景的東西：[Fluent Emoji, x（0～1）, y（0～1，方框上緣）, 大小（畫面高的比例）] */
  deco: [string, number, number, number][]
}

export const Backdrop = memo(function Backdrop({ def, w, h }: { def: SceneDef; w: number; h: number }) {
  const id = useId().replace(/:/g, '')
  const hy = h * def.horizon
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={def.sky[0]} />
          <stop offset="1" stopColor={def.sky[1]} />
        </linearGradient>
      </defs>
      <rect x={-w} y={-h} width={w * 3} height={hy + h} fill={`url(#sky${id})`} />
      {def.extra === 'stars' &&
        [0.08, 0.2, 0.33, 0.47, 0.58, 0.71, 0.83, 0.94].map((x, i) => <circle key={i} cx={w * x} cy={hy * (0.15 + ((i * 37) % 60) / 100)} r={i % 3 ? 3 : 4.5} fill="#FFF6D0" opacity={0.85} />)}
      {def.extra === 'clouds' &&
        [
          [0.12, 0.3],
          [0.5, 0.18],
          [0.82, 0.38],
        ].map(([x, y], i) => (
          <g key={i} fill="#fff" opacity={0.9}>
            <ellipse cx={w * x} cy={hy * y} rx={70} ry={26} />
            <ellipse cx={w * x - 34} cy={hy * y + 6} rx={40} ry={20} />
            <ellipse cx={w * x + 38} cy={hy * y + 8} rx={42} ry={18} />
          </g>
        ))}
      {def.extra === 'hills' && (
        <g>
          <path d={`M${-w} ${hy} Q${w * 0.15} ${hy - h * 0.2} ${w * 0.42} ${hy} Q${w * 0.68} ${hy - h * 0.16} ${w * 2} ${hy} Z`} fill={def.far ?? def.ground} />
        </g>
      )}
      {def.extra === 'dunes' && <path d={`M${-w} ${hy} Q${w * 0.25} ${hy - h * 0.12} ${w * 0.55} ${hy} Q${w * 0.8} ${hy - h * 0.09} ${w * 2} ${hy} Z`} fill={def.far ?? def.ground} />}
      <rect x={-w} y={hy} width={w * 3} height={h * 2} fill={def.ground} />
      {(def.extra === 'sea' || def.extra === 'lake') && (
        <g>
          <rect x={-w} y={hy} width={w * 3} height={h * (def.extra === 'sea' ? 0.09 : 0.07)} fill={def.far ?? '#8CC4DE'} />
          <path d={`M${-w} ${hy + h * 0.035} ${Array.from({ length: 30 }, () => `q 25 -9 50 0 t 50 0`).join(' ')}`} transform={`translate(${w * 0.02} 0)`} fill="none" stroke="#fff" strokeWidth={3} opacity={0.6} />
        </g>
      )}
      {def.extra === 'room' && (
        <g>
          <rect x={-w} y={hy - 18} width={w * 3} height={18} fill="#fff" opacity={0.55} />
          <g transform={`translate(${w * 0.62} ${hy * 0.18})`}>
            <rect width={w * 0.2} height={hy * 0.5} rx={10} fill="#CFE6F2" stroke="#fff" strokeWidth={10} />
            <path d={`M${w * 0.1} 0 V${hy * 0.5} M0 ${hy * 0.25} H${w * 0.2}`} stroke="#fff" strokeWidth={8} />
          </g>
        </g>
      )}
      {def.deco.map(([name, x, y, s], i) => (
        <Emo key={i} name={name} x={w * x - (h * s) / 2} y={h * y} size={h * s} />
      ))}
    </g>
  )
})
