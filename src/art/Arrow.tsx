import type { Dir } from '../content/code'

const INK = '#2E2A25'
const ROT: Record<Dir, number> = { up: 0, right: 90, down: 180, left: 270 }

/**
 * 箭頭卡上的箭頭：粗、短、圓角，像用厚紙剪下來貼上去的。
 * 方向只靠形狀表示，四張卡同一個顏色——孩子要看箭頭指哪裡，不能靠記顏色（墨水模式也能玩）。
 */
export function ArrowArt({ dir, color = '#86AAD2', size = '100%' }: { dir: Dir; color?: string; size?: number | string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <g transform={`rotate(${ROT[dir]} 50 50)`} strokeLinejoin="round" strokeLinecap="round">
        <path d="M50 10 L88 50 H65 V84 Q65 90 59 90 H41 Q35 90 35 84 V50 H12 Z" fill={color} stroke={INK} strokeWidth={6} />
        {/* 紙卡的反光：左側一道淡淡的亮線 */}
        <path d="M42 56 V82 M47 22 L26 44" fill="none" stroke="#fff" strokeWidth={4.5} opacity={0.42} />
      </g>
    </svg>
  )
}
