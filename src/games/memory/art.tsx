// 翻翻牌的小圖示（T-160）：選玩法、「再一局」用。四張牌：兩張蓋著（夜空牌背）、兩張翻開是一樣的蘋果。
// 蘋果用主程式那一套 Fluent Emoji（選玩法的畫面還沒載入翻翻牌的圖庫）。
import { useId } from 'react'
import { Emoji } from '../../art/Emoji'
import { CardBack } from './backs'

const INK = '#2E2A25'
const CARDS = [
  { x: 30, y: 22, open: false },
  { x: 128, y: 22, open: true },
  { x: 30, y: 108, open: true },
  { x: 128, y: 108, open: false },
]

export function MemoryPickArt() {
  const uid = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      {CARDS.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y})`}>
          <rect width={82} height={72} rx={12} fill="#FFFDF8" stroke={INK} strokeWidth={5} />
          {c.open ? (
            <svg x={17} y={12} width={48} height={48}>
              <Emoji name="red-apple" />
            </svg>
          ) : (
            <svg x={4} y={4} width={74} height={64}>
              <clipPath id={`mm-pick-${uid}-${i}`}>
                <rect width={74} height={64} rx={8} />
              </clipPath>
              <g clipPath={`url(#mm-pick-${uid}-${i})`}>
                <CardBack i={0} />
              </g>
            </svg>
          )}
        </g>
      ))}
    </svg>
  )
}
