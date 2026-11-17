// 蹺蹺板比輕重的圖：蹺蹺板、公園的背景都是自己畫的簡單 SVG（跟恐龍同一套粗線條），東西用現成的 Fluent Emoji。
import { memo } from 'react'
import { EMOJI } from '../../art/emoji.generated'
import { SEESAW_EMOJI } from './emoji.generated'

export const INK = '#2E2A25'
const WOOD = '#E3B98A'
const WOOD_DEEP = '#A87A4E'
const PLANK = '#F2C94C'
const PLANK_DEEP = '#C99A2E'

/** 場景大小（./Seesaw.tsx 的 viewBox） */
export const SCENE_W = 1000
export const SCENE_H = 600
/** 蹺蹺板的支點（板子轉的中心）、地面 */
export const PIVOT = { x: 500, y: 400 }
export const GROUND = 520
/** 板子的半長、東西放在離支點多遠 */
export const HALF = 400
export const SEAT = 290

const iconOf = (name: string) => EMOJI[name] ?? SEESAW_EMOJI[name] ?? null

/** 一個東西（巢狀的 <svg>）：x 是中心、bottom 是底下貼著的高度 */
export const Thing = memo(function Thing({ id, x, bottom, size }: { id: string; x: number; bottom: number; size: number }) {
  const e = iconOf(id)
  if (!e) return null
  return <svg x={x - size / 2} y={bottom - size} width={size} height={size} viewBox={`0 0 ${e.w} ${e.h}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: e.b }} />
})

/** HTML 裡的一個東西（排輕重用）：填滿外面的格子 */
export const ThingBox = memo(function ThingBox({ id }: { id: string }) {
  const e = iconOf(id)
  if (!e) return null
  return <svg viewBox={`0 0 ${e.w} ${e.h}`} width="100%" height="100%" style={{ display: 'block' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: e.b }} />
})

/** 公園的背景：天空、草地、兩叢樹（顏色淡，不搶東西） */
export function Park() {
  return (
    <g pointerEvents="none">
      <rect x={-600} y={-200} width={2200} height={GROUND + 200} fill="#E4F0F2" />
      <circle cx={860} cy={90} r={46} fill="#FBE7A6" />
      <g fill="#C9E2C4" stroke={INK} strokeWidth={4} strokeLinejoin="round">
        <path d="M-120 520 Q-120 380 -20 380 Q60 330 120 400 Q170 420 160 520 Z" />
        <path d="M840 520 Q830 400 920 392 Q990 340 1060 410 Q1120 430 1110 520 Z" />
      </g>
      <rect x={-600} y={GROUND} width={2200} height={300} fill="#BFD9A8" />
      <path d={`M-600 ${GROUND} H1600`} stroke={INK} strokeWidth={4} />
    </g>
  )
}

/** 支點：一個木頭的三角架 */
export function Pivot() {
  return (
    <g stroke={INK} strokeWidth={5} strokeLinejoin="round" pointerEvents="none">
      <path d={`M${PIVOT.x - 78} ${GROUND} L${PIVOT.x} ${PIVOT.y + 6} L${PIVOT.x + 78} ${GROUND} Z`} fill={WOOD} />
      <circle cx={PIVOT.x} cy={PIVOT.y + 14} r={9} fill={WOOD_DEEP} />
    </g>
  )
}

/** 兩根撐著板子的木頭（還沒放手之前，板子是平的）：放手時往下掉 */
export function Prop({ side }: { side: 'left' | 'right' }) {
  const x = PIVOT.x + (side === 'left' ? -1 : 1) * (HALF - 46)
  return (
    <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round">
      <rect x={x - 15} y={PIVOT.y} width={30} height={GROUND - PIVOT.y} rx={6} fill={WOOD} />
      <path d={`M${x - 15} ${PIVOT.y + 40} H${x + 15} M${x - 15} ${PIVOT.y + 80} H${x + 15}`} stroke={WOOD_DEEP} strokeWidth={3} />
    </g>
  )
}

/** 板子：黃色的長板、靠近中間有兩個把手（以支點為原點，-HALF～HALF；把手在東西和支點之間，不會擋到東西） */
export function Plank() {
  return (
    <g stroke={INK} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none">
      <rect x={-HALF} y={-22} width={HALF * 2} height={22} rx={10} fill={PLANK} />
      <path d={`M${-HALF + 14} -6 H${HALF - 14}`} stroke={PLANK_DEEP} strokeWidth={3} />
      {[-1, 1].map((k) => (
        <path key={k} d={`M${k * 120} -22 V-62 H${k * 146}`} fill="none" strokeWidth={7} stroke={WOOD_DEEP} />
      ))}
    </g>
  )
}

/** 選玩法、「再一局」的小圖：蹺蹺板往右邊下去，右邊一顆石頭、左邊一顆氣球 */
export function SeesawPickArt() {
  const e1 = iconOf('balloon')
  const e2 = iconOf('rock')
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <ellipse cx={120} cy={178} rx={100} ry={10} fill="#E6DCCB" />
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round">
        <path d="M96 176 L120 128 L144 176 Z" fill={WOOD} />
      </g>
      <g transform="rotate(14 120 126)" stroke={INK} strokeWidth={5} strokeLinejoin="round">
        <rect x={20} y={114} width={200} height={14} rx={6} fill={PLANK} />
        {e1 && <svg x={22} y={42} width={72} height={72} viewBox={`0 0 ${e1.w} ${e1.h}`} dangerouslySetInnerHTML={{ __html: e1.b }} />}
        {e2 && <svg x={164} y={78} width={40} height={40} viewBox={`0 0 ${e2.w} ${e2.h}`} dangerouslySetInnerHTML={{ __html: e2.b }} />}
      </g>
    </svg>
  )
}
