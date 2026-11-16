// 迷宮的小圖示（T-156）：選玩法、「再一個」用。一條彎彎的小路，起點一顆蛋形的恐龍頭、終點一顆蘋果（Fluent Emoji）。
import { Emoji } from '../../art/Emoji'

const INK = '#2E2A25'

export function MazePickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <rect x={18} y={18} width={204} height={164} rx={22} fill="#A9CF8E" stroke={INK} strokeWidth={5} />
      <path d="M52 52 H120 V100 H70 V148 H188 V52" fill="none" stroke="#C9B07A" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 52 H120 V100 H70 V148 H188 V52" fill="none" stroke="#F3E6C2" strokeWidth={28} strokeLinecap="round" strokeLinejoin="round" />
      {/* 起點：豆豆的綠色小頭 */}
      <circle cx={52} cy={52} r={17} fill="#7FC38F" stroke={INK} strokeWidth={4.5} />
      <circle cx={57} cy={48} r={3.4} fill={INK} />
      <svg x={168} y={32} width={40} height={40}>
        <Emoji name="red-apple" />
      </svg>
    </svg>
  )
}
