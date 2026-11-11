// 自由畫畫的橡皮擦（T-132，家長 2026-11-11：「畫圖的地方要多橡皮擦的功能」）。
// 跟選顏色一樣點一下就選到；選到以後手指走過的地方擦掉一大條（brushes.ts 的 eraser，三歲的手不準，擦的比手指寬很多）。
// 擦得掉：畫的線、魔法筆、印章（都是畫布上的墨）。擦不掉：今天的背景（畫布底下的另一層線稿）和畫紙本身。
// 點任何一個顏色就回到畫筆。沒有「全部擦掉」的鍵：一次清掉整張畫的只有原本要點兩下的垃圾桶。
import { forwardRef } from 'react'
import { sfx } from '../../lib/audio'
import { firstFinger } from '../NotYet'

/** 橡皮擦的格子：斜放的一塊橡皮擦（粉紅色擦頭＋藍色紙套），底下一道擦過的淡痕 */
export function EraserButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <button
      className={`tool tool-eraser${on ? ' on' : ''}`}
      aria-label="橡皮擦"
      aria-pressed={on}
      onPointerDown={(e) => {
        if (!firstFinger(e.nativeEvent)) return
        sfx.pop()
        onPress()
      }}
    >
      <svg viewBox="0 0 48 48" width="74%" style={{ overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
        <path d="M5 42 Q13 37 21 41 T37 41" fill="none" stroke="#E6DCCB" strokeWidth={4} strokeLinecap="round" />
        <g transform="rotate(-38 24 22)" strokeLinejoin="round">
          <rect x={6} y={13} width={36} height={18} rx={5} fill="#F3B8AE" stroke="#2E2A25" strokeWidth={3} />
          <path d="M20 13 H37 Q42 13 42 18 V26 Q42 31 37 31 H20 Z" fill="#A3C4E4" stroke="#2E2A25" strokeWidth={3} />
          <path d="M11 17 V21" stroke="#FBF8F2" strokeWidth={2.6} strokeLinecap="round" />
        </g>
      </svg>
    </button>
  )
}

/** 擦的時候跟著手指的圈圈（擦的範圍有多大）：只有這一個會動，畫面其他東西都停著（紙感螢幕） */
export const EraserRing = forwardRef<HTMLDivElement>(function EraserRing(_, ref) {
  return <div ref={ref} className="draw-eraser-ring" aria-hidden="true" />
})
