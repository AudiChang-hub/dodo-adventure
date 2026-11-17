// 影子配對的小圖示（T-160）：選玩法、「再一局」用。左邊一隻彩色的貓，右邊地上一個貓的黑影，中間一個小箭頭。
// 貓用主程式那一套 Fluent Emoji（選玩法的畫面還沒載入影子配對的圖庫）。
import { Emoji } from '../../art/Emoji'

const INK = '#2E2A25'

export function ShadowPickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <rect x={14} y={24} width={212} height={152} rx={22} fill="#E3EEF2" stroke={INK} strokeWidth={5} />
      <path d="M17 138 Q120 122 223 136 V160 Q223 173 210 173 H30 Q17 173 17 160Z" fill="#CFE3B5" />
      <svg x={28} y={58} width={80} height={80}>
        <Emoji name="cat" />
      </svg>
      <path d="M112 100 h22 m-9 -9 l9 9 l-9 9" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <svg x={138} y={58} width={80} height={80} style={{ filter: 'brightness(0)', opacity: 0.72 }}>
        <Emoji name="cat" />
      </svg>
    </svg>
  )
}
