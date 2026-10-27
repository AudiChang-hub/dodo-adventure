import type { CSSProperties } from 'react'
import { DinoArt, type Mood } from './Dino'
import type { Speaker } from '../content/lines'

const INK = '#2E2A25'

function Wheel({ x, y, r, spin }: { x: number; y: number; r: number; spin: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={INK} />
      <g className={spin ? 'wheel-spin' : undefined}>
        <circle cx={x} cy={y} r={r * 0.45} fill="#EDE6DA" />
        <rect x={x - 2.5} y={y - r * 0.45} width={5} height={r * 0.9} rx={2.5} fill="#B9AE9C" />
      </g>
    </g>
  )
}

interface Props {
  who: Speaker
  mood?: Mood
  moving?: boolean
  width?: number | string
  style?: CSSProperties
  onTap?: () => void
}

/** 恐龍坐在自己的車上：豆豆開紅色小車、波波開藍色吉普車、莫莫坐黃色公車 */
export function Ride({ who, mood = 'idle', moving = false, width = 360, style, onTap }: Props) {
  return (
    <svg viewBox="0 0 360 260" width={width} height={typeof width === 'number' ? (width * 260) / 360 : undefined} style={{ display: 'block', overflow: 'visible', ...style }} onPointerDown={onTap} role="img" aria-label={who}>
      <g className={moving ? 'ride-bounce' : undefined}>
        {who === 'dodo' && (
          <>
            <g transform="translate(64 -6) scale(1)">
              <DinoArt who="dodo" mood={mood} />
            </g>
            <path d="M44 176 Q44 146 84 146 L236 146 Q262 146 280 164 L316 170 Q334 174 334 194 L334 206 Q334 222 318 222 L58 222 Q44 222 44 208 Z" fill="#E99A84" stroke="#C7735D" strokeWidth={4} strokeLinejoin="round" />
            <ellipse cx={246} cy={140} rx={7} ry={15} fill="none" stroke="#2E2A25" strokeWidth={5} transform="rotate(-24 246 140)" />
            <circle cx={318} cy={188} r={9} fill="#F6DE95" stroke="#C7735D" strokeWidth={3} />
            <rect x={62} y={182} width={60} height={10} rx={5} fill="#F3C1B2" />
          </>
        )}
        {who === 'bobo' && (
          <>
            <g transform="translate(46 34) scale(0.86)">
              <DinoArt who="bobo" mood={mood} />
            </g>
            <path d="M70 150 L70 112 Q70 102 80 102 L120 102" fill="none" stroke="#5E86B4" strokeWidth={7} strokeLinecap="round" />
            <rect x={34} y={150} width={300} height={70} rx={18} fill="#93BADF" stroke="#5E86B4" strokeWidth={4} />
            <circle cx={30} cy={176} r={20} fill={INK} />
            <circle cx={30} cy={176} r={9} fill="#EDE6DA" />
            <rect x={300} y={166} width={22} height={12} rx={4} fill="#F6DE95" stroke="#5E86B4" strokeWidth={3} />
            <rect x={60} y={186} width={250} height={8} rx={4} fill="#B8D2EB" />
          </>
        )}
        {who === 'momo' && (
          <>
            <g transform="translate(96 -44) scale(0.9)">
              <DinoArt who="momo" mood={mood} />
            </g>
            <rect x={18} y={104} width={326} height={118} rx={30} fill="#F1D27C" stroke="#CFA94E" strokeWidth={4} />
            <rect x={150} y={96} width={92} height={14} rx={7} fill="#E3BD5E" stroke="#CFA94E" strokeWidth={3} />
            {[40, 104].map((x) => (
              <rect key={x} x={x} y={122} width={50} height={40} rx={10} fill="#DDEBF5" stroke="#CFA94E" strokeWidth={3} />
            ))}
            <rect x={262} y={122} width={60} height={40} rx={10} fill="#DDEBF5" stroke="#CFA94E" strokeWidth={3} />
            <rect x={30} y={180} width={300} height={10} rx={5} fill="#F7E2A6" />
            <circle cx={334} cy={196} r={8} fill="#FFF4D6" stroke="#CFA94E" strokeWidth={3} />
          </>
        )}
        <Wheel x={who === 'momo' ? 92 : 104} y={224} r={28} spin={moving} />
        <Wheel x={who === 'momo' ? 270 : 264} y={224} r={28} spin={moving} />
      </g>
    </svg>
  )
}
