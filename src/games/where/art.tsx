// 躲在哪裡（T-160）的小圖示：選玩法、「再一局」用。一張桌子，桌上一隻貓、桌子底下一隻小狗探頭。
import { SvgEmoji } from '../PlayEmoji'

export function WherePickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <ellipse cx={120} cy={176} rx={100} ry={12} fill="#E6DCCB" />
      <g stroke="#A87A4E" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" fill="#E3B98A">
        <rect x={42} y={98} width={14} height={78} rx={5} />
        <rect x={184} y={98} width={14} height={78} rx={5} />
        <rect x={26} y={86} width={188} height={18} rx={8} />
      </g>
      <SvgEmoji name="cat" x={120} y={30} size={60} />
      <SvgEmoji name="dog" x={88} y={118} size={58} />
    </svg>
  )
}
