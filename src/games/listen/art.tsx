// 聽兩步驟指令（T-164）的圖：有顏色的東西自己畫（顏色是參數，同一樣東西六種顏色長得一樣），不分顏色的用 Fluent Emoji。
// 0～100 的方格，東西大約佔 70%；描邊用同色系深一點的顏色（看得出形狀，不是只靠顏色，DISPLAY-2）。
import { memo, type ReactElement } from 'react'
import { LangEmoji } from '../LangEmoji'
import { PLAIN, colorOf, type ShapeId, type Thing } from './data'

const L = (c: string, w = 3.5) => ({ stroke: c, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })
const SHINE = '#FFFFFF'

function Shape({ shape, fill, dark }: { shape: ShapeId; fill: string; dark: string }): ReactElement {
  const s = L(dark)
  switch (shape) {
    case 'ball':
      return (
        <g>
          <circle cx={50} cy={52} r={32} fill={fill} {...s} />
          <path d="M20 46 Q50 60 80 46" fill="none" {...L(SHINE, 5)} opacity={0.85} />
          <path d="M24 64 Q50 76 76 64" fill="none" {...L(SHINE, 5)} opacity={0.85} />
          <circle cx={38} cy={34} r={6} fill={SHINE} opacity={0.6} />
        </g>
      )
    case 'balloon':
      return (
        <g>
          <path d="M50 70 Q46 80 52 86 Q58 92 50 98" fill="none" {...L('#8C857C', 2.5)} />
          <ellipse cx={50} cy={40} rx={25} ry={30} fill={fill} {...s} />
          <path d="M46 70 L54 70 L50 76 Z" fill={fill} {...s} />
          <ellipse cx={40} cy={28} rx={5} ry={8} fill={SHINE} opacity={0.6} />
        </g>
      )
    case 'car':
      return (
        <g>
          <path d="M12 66 V52 Q12 46 20 45 L30 44 L38 30 Q40 27 45 27 H64 Q69 27 72 31 L80 44 L86 46 Q90 48 90 54 V66 Z" fill={fill} {...s} />
          <path d="M42 33 H52 V44 H36 Z M56 33 H64 Q67 33 68 36 L72 44 H56 Z" fill="#DFF1FA" {...L(dark, 2.5)} />
          <circle cx={30} cy={68} r={10} fill="#3E3B42" {...L('#2E2A25', 2.5)} />
          <circle cx={72} cy={68} r={10} fill="#3E3B42" {...L('#2E2A25', 2.5)} />
          <circle cx={30} cy={68} r={4} fill="#C9C4BC" />
          <circle cx={72} cy={68} r={4} fill="#C9C4BC" />
        </g>
      )
    case 'hat':
      return (
        <g>
          <ellipse cx={50} cy={70} rx={40} ry={9} fill={fill} {...s} />
          <path d="M28 70 V40 Q28 28 50 28 Q72 28 72 40 V70 Z" fill={fill} {...s} />
          <rect x={28} y={56} width={44} height={9} fill={dark} opacity={0.55} />
        </g>
      )
    case 'cup':
      return (
        <g>
          <path d="M66 40 Q84 40 84 54 Q84 68 66 66" fill="none" {...L(dark, 7)} />
          <path d="M66 40 Q84 40 84 54 Q84 68 66 66" fill="none" {...L(fill, 3)} />
          <path d="M22 30 H70 L65 78 Q64 82 60 82 H32 Q28 82 27 78 Z" fill={fill} {...s} />
          <path d="M28 40 H64" {...L(SHINE, 4)} opacity={0.6} />
        </g>
      )
    case 'sock':
      return (
        <g>
          <path d="M36 14 H62 V58 L76 70 Q84 78 76 86 Q70 92 60 86 L40 72 Q34 68 36 60 Z" fill={fill} {...s} />
          <rect x={36} y={14} width={26} height={10} fill={SHINE} opacity={0.55} />
          <path d="M60 86 Q70 92 76 86 Q80 82 79 77" fill={dark} opacity={0.45} />
        </g>
      )
    case 'boat':
      return (
        <g>
          <path d="M50 14 V62" {...L('#8C5A2E', 4)} />
          <path d="M54 18 L80 56 H54 Z" fill="#FFFFFF" {...L('#B9B2A8', 3)} />
          <path d="M12 62 H88 L76 82 H24 Z" fill={fill} {...s} />
          <path d="M8 88 Q20 82 32 88 T56 88 T80 88 T96 88" fill="none" {...L('#7FC1E8', 4)} />
        </g>
      )
    case 'flower':
      return (
        <g>
          <path d="M50 58 V94" {...L('#47A85C', 5)} />
          <path d="M50 80 Q36 70 30 78 Q38 88 50 84" fill="#5DBB6E" {...L('#2F7A40', 2.5)} />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={50} cy={22} rx={12} ry={17} fill={fill} {...L(dark, 3)} transform={`rotate(${a} 50 42)`} />
          ))}
          <circle cx={50} cy={42} r={10} fill="#FFE07A" {...L('#C29A12', 3)} />
        </g>
      )
    case 'star':
      return <path d="M50 10 L61 37 L90 38 L67 56 L76 86 L50 69 L24 86 L33 56 L10 38 L39 37 Z" fill={fill} {...s} />
    case 'heart':
      return <path d="M50 86 Q14 62 12 38 Q12 18 31 16 Q44 16 50 30 Q56 16 69 16 Q88 18 88 38 Q86 62 50 86 Z" fill={fill} {...s} />
    case 'triangle':
      return <path d="M50 14 L88 82 H12 Z" fill={fill} {...s} />
  }
}

/** 畫面上的一樣東西（0～100 的方格） */
export const ThingArt = memo(function ThingArt({ t }: { t: Thing }) {
  if (t.kind === 'plain') {
    const p = PLAIN.find((x) => x.id === t.plain)!
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
        <LangEmoji name={p.emoji} x={14} y={14} size={72} />
      </svg>
    )
  }
  const c = colorOf(t.color)
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
      <Shape shape={t.shape} fill={c.fill} dark={c.dark} />
    </svg>
  )
})

/** 選玩法、「再一局」用的小圖示：一隻耳朵＋紅球、藍星星（中間一個 1、2 的小點） */
export function ListenPickArt() {
  const red = colorOf('red')
  const blue = colorOf('blue')
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <LangEmoji name="ear" x={84} y={6} size={72} />
      <g transform="translate(18 84) scale(0.95)">
        <Shape shape="ball" fill={red.fill} dark={red.dark} />
      </g>
      <g transform="translate(126 84) scale(0.95)">
        <Shape shape="star" fill={blue.fill} dark={blue.dark} />
      </g>
      <circle cx={66} cy={188} r={7} fill="#E3A92A" />
      <circle cx={166} cy={188} r={7} fill="#E3A92A" />
      <circle cx={182} cy={188} r={7} fill="#E3A92A" />
    </svg>
  )
}
