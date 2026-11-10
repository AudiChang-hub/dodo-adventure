// 自由畫畫工具欄多的兩格（T-127）：印章、今天的魔法筆。跟顏色同樣大小（≥ 2 cm，準則 DRAW-5），點一下就選到。
// 印章：選到以後點畫紙就蓋一個今天的世界的角色，蓋一個換下一個（2～3 種輪流）；格子上畫的就是下一個要蓋的。
// 魔法筆：每天一種（brushes.ts），格子上畫這支筆畫出來的樣子。
import { Emoji } from '../../art/Emoji'
import { sfx } from '../../lib/audio'
import { firstFinger } from '../NotYet'
import { RAINBOW, type BrushId } from './brushes'

/** 印章：格子上是下一個要蓋的角色。已經選到印章時再點一下：換下一個角色 */
/** count：換過幾次印章（蓋一個或再點這一格都加一；三歲測試用來數蓋了幾個） */
export function StampButton({ next, count, on, onPress }: { next: string; count: number; on: boolean; onPress: () => void }) {
  return (
    <button
      className={`tool tool-stamp${on ? ' on' : ''}`}
      aria-label="印章"
      aria-pressed={on}
      data-stamp={next}
      data-count={count}
      onPointerDown={(e) => {
        if (!firstFinger(e.nativeEvent)) return
        sfx.pop()
        onPress()
      }}
    >
      <span className="tool-stamp-pad" aria-hidden="true" />
      <Emoji name={next} size="62%" style={{ position: 'relative', pointerEvents: 'none' }} />
    </button>
  )
}

/** 魔法筆：格子上畫這支筆的樣子（加一顆小星星表示「今天特別的筆」，靜止不閃） */
export function MagicButton({ brush, color, stamps, on, onPress }: { brush: BrushId; color: string; stamps: readonly string[]; on: boolean; onPress: () => void }) {
  return (
    <button
      className={`tool tool-magic${on ? ' on' : ''}`}
      aria-label="魔法筆"
      aria-pressed={on}
      data-brush={brush}
      onPointerDown={(e) => {
        if (!firstFinger(e.nativeEvent)) return
        sfx.pop()
        onPress()
      }}
    >
      <svg viewBox="0 0 48 48" width="78%" style={{ overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
        <MagicArt brush={brush} color={color} stamps={stamps} />
        <path d="M41 3 L42.6 7.4 L47 9 L42.6 10.6 L41 15 L39.4 10.6 L35 9 L39.4 7.4 Z" fill="#F1D27C" stroke="#2E2A25" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </button>
  )
}

const WAVE = 'M7 30 Q15 16 24 26 T41 22'

function MagicArt({ brush, color, stamps }: { brush: BrushId; color: string; stamps: readonly string[] }) {
  switch (brush) {
    case 'rainbow':
      return (
        <>
          <defs>
            <linearGradient id="tool-rainbow" x1="0" x2="1" y1="0" y2="0">
              {RAINBOW.map((c, i) => (
                <stop key={c} offset={i / (RAINBOW.length - 1)} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <path d={WAVE} fill="none" stroke="url(#tool-rainbow)" strokeWidth={9} strokeLinecap="round" />
        </>
      )
    case 'mirror':
      // 一隻蝴蝶：左邊一片翅膀、右邊照鏡子一樣的另一片，中間一條虛線
      return (
        <g strokeLinejoin="round">
          <path d="M24 8 V40" stroke="#B9AD98" strokeWidth={2.4} strokeDasharray="2 4" strokeLinecap="round" />
          <path d="M21 24 C12 10 4 14 7 23 C3 30 12 37 21 27 Z" fill={color} stroke="#2E2A25" strokeWidth={2.2} />
          <path d="M27 24 C36 10 44 14 41 23 C45 30 36 37 27 27 Z" fill={color} stroke="#2E2A25" strokeWidth={2.2} />
        </g>
      )
    case 'dots':
      return (
        <g fill={color} stroke="#2E2A25" strokeWidth={1.6}>
          {[
            [9, 29],
            [17, 20],
            [26, 25],
            [35, 20],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r={4.6} />
          ))}
        </g>
      )
    case 'trail':
      // 沿著一條線蓋三個今天的小圖
      return (
        <g>
          <path d={WAVE} fill="none" stroke="#D9CDB8" strokeWidth={3} strokeDasharray="2 5" strokeLinecap="round" />
          {[
            [3, 22],
            [16, 15],
            [29, 13],
          ].map(([x, y], i) =>
            stamps.length ? (
              <g key={x} transform={`translate(${x} ${y})`}>
                <Emoji name={stamps[i % stamps.length]} size={16} />
              </g>
            ) : null,
          )}
        </g>
      )
  }
}
