import type { ReactNode } from 'react'
import { Emoji } from '../../art/Emoji'
import { COLOR_HEX, SMALL, type Thing } from './sort-plan'

// 邏輯遊戲的圖（T-152）：籃子、玩具、珠子、繩子都是自己畫的簡單 SVG，跟恐龍同一套粗線條；其他東西用現成的 Fluent Emoji。

const INK = '#2E2A25'
const PAPER = '#FBF8F2'
const WICKER = '#E2B97F'
const WICKER_DEEP = '#C9975A'

/** 一個東西（viewBox 0 0 100 100），放在 100%×100% 的格子裡 */
export function ThingArt({ thing }: { thing: Thing }) {
  if (thing.t === 'emoji') {
    const s = thing.scale ?? 1
    // 小的畫在格子的正中下方（像放在地上），大小差一眼看得出來
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <svg x={50 - 44 * s} y={94 - 88 * s} width={88 * s} height={88 * s}>
          <Emoji name={thing.icon} />
        </svg>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round">
        {thing.t === 'toy' && thing.toy === 'ball' && (
          <>
            <circle cx={50} cy={52} r={38} fill={COLOR_HEX[thing.color]} />
            <path d="M14 46 Q50 66 86 46" fill="none" stroke={PAPER} strokeWidth={7} opacity={0.75} />
            <path d="M14 46 Q50 66 86 46" fill="none" />
            <ellipse cx={36} cy={32} rx={9} ry={6} fill="#fff" stroke="none" opacity={0.6} transform="rotate(-28 36 32)" />
          </>
        )}
        {thing.t === 'toy' && thing.toy === 'block' && (
          <>
            <path d="M18 34 L34 18 H84 V68 L68 84 H18 Z" fill={COLOR_HEX[thing.color]} />
            <path d="M18 34 L34 18 H84 L68 34 Z" fill="#fff" fillOpacity={0.35} />
            <path d="M68 34 L84 18 V68 L68 84 Z" fill={INK} fillOpacity={0.14} />
            <path d="M18 34 H68 V84 M68 34 L84 18" fill="none" />
            <rect x={30} y={46} width={26} height={26} rx={5} fill="none" strokeWidth={3.5} opacity={0.55} />
          </>
        )}
        {thing.t === 'toy' && thing.toy === 'balloon' && (
          <>
            <path d="M50 74 Q52 84 46 94" fill="none" strokeWidth={3} />
            <ellipse cx={50} cy={40} rx={28} ry={33} fill={COLOR_HEX[thing.color]} />
            <path d="M44 78 L50 72 L56 78 Z" fill={COLOR_HEX[thing.color]} />
            <ellipse cx={39} cy={26} rx={6} ry={9} fill="#fff" stroke="none" opacity={0.6} transform="rotate(20 39 26)" />
          </>
        )}
        {thing.t === 'swatch' && (
          // 一團顏料：不是哪一種東西，只告訴他「這個顏色」
          <path
            d="M50 12 C66 10 74 22 84 26 C94 32 92 48 88 58 C84 70 90 82 76 88 C62 94 52 86 40 88 C26 90 12 82 12 66 C12 54 6 44 14 32 C22 18 36 14 50 12 Z"
            fill={COLOR_HEX[thing.color]}
          />
        )}
        {thing.t === 'shape' && thing.shape === 'circle' && <circle cx={50} cy={52} r={36} fill={thing.color ? COLOR_HEX[thing.color] : PAPER} strokeWidth={thing.color ? 4.5 : 6} />}
        {thing.t === 'shape' && thing.shape === 'square' && <rect x={17} y={19} width={66} height={66} rx={6} fill={thing.color ? COLOR_HEX[thing.color] : PAPER} strokeWidth={thing.color ? 4.5 : 6} />}
        {thing.t === 'shape' && thing.shape === 'triangle' && <path d="M50 12 L88 84 H12 Z" fill={thing.color ? COLOR_HEX[thing.color] : PAPER} strokeWidth={thing.color ? 4.5 : 6} />}
      </g>
    </svg>
  )
}

/**
 * 籃子（viewBox 0 0 240 210）：前面掛一個圓牌子，裡面是樣品（這個籃子收什麼）；收好的東西從籃口露出來，越收越多。
 * closed：一局收完，蓋子蓋起來。
 */
export function BasketArt({ sample, inside, closed }: { sample: Thing; inside: Thing[]; closed?: boolean }) {
  return (
    <svg viewBox="0 0 240 210" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {/* 收好的東西：排在籃口後面，下半截被籃子擋住 */}
      {!closed &&
        inside.map((t, i) => {
        const x = 34 + ((i * 58) % 174)
        const y = 6 - Math.floor(i / 3) * 10
        return (
          <svg key={i} x={x} y={y} width={78} height={78} style={{ overflow: 'visible' }}>
            <ThingArt thing={t} />
          </svg>
        )
        })}
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        <path d="M22 66 H218 L196 196 Q194 204 186 204 H54 Q46 204 44 196 Z" fill={WICKER} />
        {/* 編織的紋路 */}
        <path d="M30 104 H210 M36 142 H204 M42 178 H198" fill="none" stroke={WICKER_DEEP} strokeWidth={4} />
        {[70, 100, 140, 170].map((x) => (
          <path key={x} d={`M${x} 70 L${x + (x < 120 ? 6 : -6)} 200`} fill="none" stroke={WICKER_DEEP} strokeWidth={4} />
        ))}
        <rect x={12} y={52} width={216} height={24} rx={12} fill={WICKER_DEEP} />
        {/* 牌子 */}
        <circle cx={120} cy={138} r={48} fill={PAPER} />
        {closed && (
          <g>
            <path d="M14 54 Q120 6 226 54 Z" fill={WICKER} />
            <path d="M104 26 Q120 12 136 26" fill="none" strokeWidth={6} />
          </g>
        )}
      </g>
      <svg x={84} y={102} width={72} height={72} style={{ overflow: 'visible' }}>
        <ThingArt thing={sample} />
      </svg>
    </svg>
  )
}

/** 一顆珠子（viewBox 0 0 100 100）：顏色珠子是圓珠中間穿線的洞；東西是木頭圓珠上畫著那個東西 */
export function BeadArt({ thing }: { thing: Thing }) {
  if (thing.t === 'toy') {
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
        <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round">
          <circle cx={50} cy={50} r={40} fill={COLOR_HEX[thing.color]} />
          <ellipse cx={50} cy={50} rx={9} ry={9} fill={INK} fillOpacity={0.55} stroke="none" />
          <ellipse cx={34} cy={30} rx={10} ry={6} fill="#fff" stroke="none" opacity={0.55} transform="rotate(-30 34 30)" />
        </g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={50} cy={50} r={42} fill="#F3E3C6" stroke={INK} strokeWidth={4.5} />
      <svg x={18} y={18} width={64} height={64}>
        <ThingArt thing={thing} />
      </svg>
    </svg>
  )
}

/** 選玩法的圖示：籃子裡有幾樣收好的東西（豆豆收拾） */
export function SortPickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <svg x={30} y={0} width={180} height={190}>
        <BasketArt
          sample={{ t: 'swatch', color: 'red' }}
          inside={[
            { t: 'toy', toy: 'ball', color: 'red' },
            { t: 'emoji', icon: 'red-apple' },
            { t: 'toy', toy: 'block', color: 'red' },
          ]}
        />
      </svg>
    </svg>
  )
}

/** 選玩法的圖示：一條繩子串著紅藍紅藍的珠子（串珠珠） */
export function PatternPickArt() {
  const cs = ['red', 'blue', 'red', 'blue'] as const
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <path d="M14 70 Q120 190 226 70" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      {cs.map((c, i) => {
        const t = (i + 1) / 5
        const x = 14 + 212 * t
        const y = 70 + 240 * t * (1 - t) - 26
        return (
          <svg key={i} x={x - 26} y={y} width={52} height={52}>
            <BeadArt thing={{ t: 'toy', toy: 'ball', color: c }} />
          </svg>
        )
      })}
    </svg>
  )
}

/** 一局再玩一次的小圖示（DoneChoices 的「再一局」） */
export function AgainArt({ children }: { children: ReactNode }) {
  return <span className="lg-again-art">{children}</span>
}

export { SMALL }
