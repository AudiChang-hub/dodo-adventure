// 故事排順序（T-164）的圖：一張卡片是 0～100 的方格，背景（天空＋地面）＋ emoji ＋自己畫的小東西。
// 線條粗、顏色飽和但不刺眼，跟遊戲角其他圖同一套畫法（準則 DISPLAY）。
import { memo, type ReactElement } from 'react'
import { LangEmoji } from '../LangEmoji'
import { STORIES, type Bg, type Bit, type DrawnId, type Story } from './data'

const L = (c: string, w = 2) => ({ stroke: c, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

/** 背景：上面天空（或牆）、下面地面（或地板）；ground = null 是整片 */
const BG: Record<Bg, { sky: string; ground: string | null }> = {
  grass: { sky: '#DDF0FA', ground: '#BFE3A6' },
  home: { sky: '#F7EBDD', ground: '#E3C9A4' },
  kitchen: { sky: '#FBF1E3', ground: '#E9D7BC' },
  bath: { sky: '#E3F2F6', ground: '#C9E2EA' },
  sand: { sky: '#DDF0FA', ground: '#F1DDAE' },
  snow: { sky: '#E6EEF7', ground: '#FFFFFF' },
  night: { sky: '#2E3566', ground: '#3B4374' },
  sky: { sky: '#D7EEFB', ground: null },
  dusk: { sky: '#FBD9B8', ground: '#E7B98F' },
  school: { sky: '#DDF0FA', ground: '#D9D2C2' },
  pond: { sky: '#DDF0FA', ground: '#BFE3A6' },
}

/** 自己畫的小東西：中心在 (0, 0)，大小 s */
function Drawn({ d, s, c }: { d: DrawnId; s: number; c?: string }): ReactElement | null {
  const h = s / 2
  switch (d) {
    case 'mound':
      return <path d={`M${-h} ${h * 0.25} Q${-h * 0.6} ${-h * 0.45} 0 ${-h * 0.45} Q${h * 0.6} ${-h * 0.45} ${h} ${h * 0.25} Z`} fill={c ?? '#9C6B45'} {...L('#6E4A2E')} />
    case 'bubbles':
      return (
        <g>
          {[
            [-0.45, 0.15, 0.3],
            [0, -0.2, 0.38],
            [0.42, 0.12, 0.28],
            [-0.12, 0.38, 0.22],
            [0.25, 0.42, 0.2],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x * h} cy={y * h} r={r * h} fill="#EAF7FD" fillOpacity={0.85} {...L('#8CC7E6', 1.4)} />
              <circle cx={x * h - r * h * 0.35} cy={y * h - r * h * 0.35} r={r * h * 0.22} fill="#fff" />
            </g>
          ))}
        </g>
      )
    case 'oven':
      return (
        <g>
          <rect x={-h} y={-h * 0.85} width={s} height={s * 0.9} rx={5} fill="#E6E2DC" {...L('#8C857C')} />
          <rect x={-h * 0.72} y={-h * 0.38} width={s * 0.72} height={s * 0.48} rx={4} fill="#F2A54A" {...L('#8C857C')} />
          <rect x={-h * 0.72} y={-h * 0.38} width={s * 0.72} height={s * 0.48} rx={4} fill="#FFD27A" opacity={0.6} />
          {/* 烤箱裡一個圓圓的、慢慢膨起來的麵團（平底） */}
          <path d={`M${-h * 0.42} ${h * 0.02} Q${-h * 0.4} ${-h * 0.3} 0 ${-h * 0.3} Q${h * 0.4} ${-h * 0.3} ${h * 0.42} ${h * 0.02} Z`} fill="#D99A55" {...L('#8C5A2E', 1.5)} />
          <path d={`M${-h * 0.55} ${h * 0.05} H${h * 0.55}`} {...L('#8C857C', 2)} />
          {[-0.5, -0.15, 0.2, 0.55].map((x, i) => (
            <circle key={i} cx={x * h} cy={-h * 0.62} r={h * 0.08} fill="#8C857C" />
          ))}
        </g>
      )
    case 'snowball':
      return <circle cx={0} cy={0} r={h} fill="#FFFFFF" {...L('#A9BFD4', 2)} />
    case 'slice':
      return (
        <g>
          <path d={`M${-h * 0.8} ${h * 0.8} V${-h * 0.2} Q${-h} ${-h} 0 ${-h * 0.9} Q${h} ${-h} ${h * 0.8} ${-h * 0.2} V${h * 0.8} Z`} fill="#C98A4B" {...L('#8C5A2E')} />
          <path d={`M${-h * 0.62} ${h * 0.64} V${-h * 0.14} Q${-h * 0.78} ${-h * 0.76} 0 ${-h * 0.7} Q${h * 0.78} ${-h * 0.76} ${h * 0.62} ${-h * 0.14} V${h * 0.64} Z`} fill="#F6DFAE" />
        </g>
      )
    case 'dough':
      return <ellipse cx={0} cy={0} rx={h} ry={h * 0.62} fill="#F3D9A4" {...L('#C9A066')} />
    case 'sauce':
      return <ellipse cx={0} cy={0} rx={h} ry={h * 0.62} fill="#D9473A" {...L('#A8302A', 1.5)} />
    case 'bits':
      return (
        <g>
          {Array.from({ length: 14 }, (_, i) => {
            const a = i * 2.39
            const r = (0.2 + ((i * 37) % 10) / 13) * h * 0.85
            return <rect key={i} x={Math.cos(a) * r - 3} y={Math.sin(a) * r * 0.62 - 2} width={6} height={4} rx={1} fill={c ?? '#F6CB2F'} {...L('#C29A12', 0.8)} />
          })}
        </g>
      )
    case 'mud':
      return (
        <g fill="#5A3A22" stroke="#3E2716" strokeWidth={1}>
          <path d={`M${-h * 0.7} ${h * 0.05} q${h * 0.1} ${-h * 0.22} ${h * 0.3} ${-h * 0.1} q${h * 0.1} ${h * 0.2} ${-h * 0.05} ${h * 0.25} q${-h * 0.25} ${h * 0.05} ${-h * 0.25} ${-h * 0.15} Z`} />
          <path d={`M${h * 0.0} ${-h * 0.3} q${h * 0.15} ${-h * 0.15} ${h * 0.28} 0 q${h * 0.05} ${h * 0.18} ${-h * 0.12} ${h * 0.2} q${-h * 0.2} 0 ${-h * 0.16} ${-h * 0.2} Z`} />
          <path d={`M${h * 0.4} ${h * 0.15} q${h * 0.18} ${-h * 0.12} ${h * 0.3} ${h * 0.05} q${-h * 0.02} ${h * 0.2} ${-h * 0.18} ${h * 0.18} q${-h * 0.18} ${-h * 0.05} ${-h * 0.12} ${-h * 0.23} Z`} />
          <circle cx={-h * 0.15} cy={h * 0.4} r={h * 0.08} />
          <circle cx={h * 0.25} cy={h * 0.42} r={h * 0.06} />
          <circle cx={-h * 0.4} cy={-h * 0.3} r={h * 0.06} />
        </g>
      )
    case 'block':
      return (
        <g>
          <rect x={-h} y={-h} width={s} height={s} rx={2.5} fill={c ?? '#E0604E'} {...L('rgba(46,42,37,.55)', 1.6)} />
          <circle cx={-h * 0.4} cy={-h * 0.4} r={h * 0.18} fill="#fff" opacity={0.35} />
        </g>
      )
    case 'castle':
      return (
        <g>
          <path
            d={`M${-h} ${h * 0.7} V${-h * 0.15} H${-h * 0.62} V${-h * 0.42} H${-h * 0.38} V${-h * 0.15} H${-h * 0.2} V${-h * 0.75} H${h * 0.2} V${-h * 0.15} H${h * 0.38} V${-h * 0.42} H${h * 0.62} V${-h * 0.15} H${h} V${h * 0.7} Z`}
            fill="#E8CC8E"
            {...L('#B8975A')}
          />
          <path d={`M${-h * 0.14} ${h * 0.7} V${h * 0.25} Q0 ${h * 0.08} ${h * 0.14} ${h * 0.25} V${h * 0.7} Z`} fill="#B8975A" />
        </g>
      )
    case 'puddle':
      return <ellipse cx={0} cy={0} rx={h} ry={h * 0.26} fill={c ?? '#A9D8F2'} {...L('#76B2D6', 1.5)} />
    case 'blanket':
      return (
        <g>
          <path d={`M${-h * 0.8} ${-h * 0.25} H${h * 0.8} L${h} ${h * 0.3} H${-h} Z`} fill="#E0604E" {...L('#A8302A', 1.4)} />
          {[-0.5, 0, 0.5].map((x, i) => (
            <path key={i} d={`M${x * h * 0.8 - h * 0.12} ${-h * 0.25} L${x * h - h * 0.14} ${h * 0.3} M${x * h * 0.8 + h * 0.12} ${-h * 0.25} L${x * h + h * 0.14} ${h * 0.3}`} {...L('#fff', 2.2)} opacity={0.75} />
          ))}
        </g>
      )
    case 'pan':
      return (
        <g>
          <rect x={h * 0.55} y={-h * 0.08} width={h * 0.9} height={h * 0.16} rx={3} fill="#4A4550" />
          <ellipse cx={-h * 0.05} cy={0} rx={h * 0.68} ry={h * 0.42} fill="#4A4550" {...L('#2E2A25', 1.5)} />
          <ellipse cx={-h * 0.05} cy={-h * 0.02} rx={h * 0.45} ry={h * 0.26} fill="#E9B865" {...L('#B8833A', 1.2)} />
        </g>
      )
    case 'pot':
      return (
        <g>
          <path d={`M${-h * 0.75} ${-h * 0.35} H${h * 0.75} V${h * 0.45} Q${h * 0.75} ${h * 0.7} ${h * 0.5} ${h * 0.7} H${-h * 0.5} Q${-h * 0.75} ${h * 0.7} ${-h * 0.75} ${h * 0.45} Z`} fill="#9AA6B2" {...L('#5F6B78')} />
          <rect x={-h * 0.85} y={-h * 0.45} width={h * 1.7} height={h * 0.16} rx={3} fill="#7D8995" {...L('#5F6B78', 1.2)} />
          <path d={`M${-h} ${-h * 0.15} H${-h * 0.75} M${h * 0.75} ${-h * 0.15} H${h}`} {...L('#5F6B78', 3)} />
        </g>
      )
    case 'canvas':
      return (
        <g>
          <path d={`M${-h * 0.6} ${h} L${-h * 0.3} ${-h * 0.2} M${h * 0.6} ${h} L${h * 0.3} ${-h * 0.2}`} {...L('#8C5A2E', 3)} />
          <rect x={-h * 0.7} y={-h * 0.85} width={h * 1.4} height={h * 1.15} rx={2} fill="#fff" {...L('#B8975A', 2)} />
          <circle cx={-h * 0.2} cy={-h * 0.4} r={h * 0.18} fill="#F6CB2F" />
          <path d={`M${-h * 0.55} ${h * 0.1} Q${-h * 0.1} ${-h * 0.3} ${h * 0.5} ${h * 0.05}`} fill="none" {...L('#47A85C', 4)} />
        </g>
      )
    case 'pad':
      return <rect x={-h} y={-h * 0.16} width={s} height={h * 0.32} rx={3} fill="#9AA6B2" {...L('#5F6B78', 1.5)} />
    case 'water':
      return <path d={`M${-h} ${-h * 0.18} Q${-h * 0.75} ${-h * 0.28} ${-h * 0.5} ${-h * 0.18} T0 ${-h * 0.18} T${h * 0.5} ${-h * 0.18} T${h} ${-h * 0.18} V${h * 0.4} H${-h} Z`} fill="#7FC1E8" {...L('#4F94C2', 1.5)} />
    case 'half':
      return (
        <g>
          <circle cx={0} cy={0} r={h} fill="#F49A2E" {...L('#C46A22', 1.6)} />
          <circle cx={0} cy={0} r={h * 0.8} fill="#FFC56A" />
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M0 0 L${Math.cos((i * Math.PI) / 3) * h * 0.78} ${Math.sin((i * Math.PI) / 3) * h * 0.78}`} {...L('#F49A2E', 1.4)} />
          ))}
        </g>
      )
    case 'line':
      return <path d={`M${-h} ${-h} Q${-h * 0.2} ${-h * 0.4} 0 ${h}`} fill="none" {...L('#5F6B78', 1)} />
  }
}

function BitView({ b }: { b: Bit }) {
  if ('e' in b) return <LangEmoji name={b.e} x={b.x - b.s / 2} y={b.y - b.s / 2} size={b.s} flip={b.flip} rotate={b.r} opacity={b.o} />
  return (
    <g transform={`translate(${b.x} ${b.y})${b.r ? ` rotate(${b.r})` : ''}`} opacity={b.o}>
      <Drawn d={b.d} s={b.s} c={b.c} />
    </g>
  )
}

/** 一張圖（0～100 的方格） */
export const Pic = memo(function Pic({ story, step }: { story: Story; step: number }) {
  const p = story.steps[step]
  const bg = BG[p.bg ?? story.bg]
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={100} height={100} fill={bg.sky} />
      {bg.ground && <rect x={0} y={78} width={100} height={22} fill={bg.ground} />}
      {(p.bg ?? story.bg) === 'night' && (
        <g fill="#FFF4C2">
          <circle cx={14} cy={14} r={1.2} />
          <circle cx={86} cy={10} r={1} />
          <circle cx={70} cy={28} r={0.9} />
        </g>
      )}
      {p.pic.map((b, i) => (
        <BitView key={i} b={b} />
      ))}
    </svg>
  )
})

/** 選玩法、「再一局」用的小圖示：三張排好的卡片（種子 → 芽 → 花），中間有箭頭 */
export function OrderPickArt() {
  const s = STORIES.find((x) => x.id === 'plant')!
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      {[0, 2, 3].map((k, i) => (
        <g key={k} transform={`translate(${6 + i * 80} ${58 + (i === 1 ? -6 : 0)})`}>
          <rect x={-2} y={-2} width={72} height={72} rx={12} fill="#fff" stroke="#E6DCCB" strokeWidth={4} />
          <svg x={2} y={2} width={64} height={64} viewBox="0 0 100 100">
            <clipPath id={`orp${k}`}>
              <rect width={100} height={100} rx={12} />
            </clipPath>
            <g clipPath={`url(#orp${k})`}>
              <Pic story={s} step={k} />
            </g>
          </svg>
        </g>
      ))}
      <path d="M76 160 H96 M150 160 H170" stroke="#C2A266" strokeWidth={6} strokeLinecap="round" />
      <path d="M90 152 L98 160 L90 168 M164 152 L172 160 L164 168" fill="none" stroke="#C2A266" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
