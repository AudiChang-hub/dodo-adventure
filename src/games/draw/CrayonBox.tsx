import { forwardRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { COLORS } from '../../content/park'
import { sfx } from '../../lib/audio'
import { rise } from '../../ui/motion'
import { firstFinger } from '../NotYet'
import './tools.css'

const INK = '#2E2A25'

/** 6 支大蠟筆：照彩虹的順序（顏色跟彩虹公園學的一樣）。2026-10-29 從 8 支減到 6 支，每一支才放得下 2 cm 的格子（V-20） */
const ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
export const CRAYONS = ORDER.map((id) => COLORS.find((c) => c.id === id)!).map((c) => ({ id: c.id, hex: c.hex, zh: c.zh }))
export const ERASER = 'eraser'

/** 一支橫躺、筆尖朝左的蠟筆（viewBox 0 0 150 44）：蠟色的筆尖、包裝紙、兩條細線 */
export function CrayonArt({ hex }: { hex: string }) {
  return (
    <svg viewBox="0 0 150 44" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d="M5 19.5 Q2.5 22 5 24.5 L32 36 V8 Z" fill={hex} stroke={INK} strokeWidth={3} />
        <path d="M5 19.5 Q2.5 22 5 24.5 L13 28 V16 Z" fill={INK} opacity={0.22} />
        <rect x={30} y={6} width={118} height={32} rx={7} fill={hex} stroke={INK} strokeWidth={3} />
        <rect x={52} y={6} width={78} height={32} fill="#FBF8F2" opacity={0.42} />
        <path d="M52 6 V38 M130 6 V38" stroke={INK} strokeWidth={2.4} opacity={0.55} />
        <path d="M60 22 Q75 15 90 22 T120 22" fill="none" stroke={INK} strokeWidth={2.4} opacity={0.32} />
        <path d="M36 13 H144" stroke="#fff" strokeWidth={3} opacity={0.32} />
      </g>
    </svg>
  )
}

/** 橡皮擦（同一個 viewBox）：粉紅色的橡皮，後半套著藍色的紙套 */
export function EraserArt() {
  return (
    <svg viewBox="0 0 150 44" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d="M14 6 H80 V38 H14 Q4 38 4 28 V16 Q4 6 14 6 Z" fill="#F3B8B0" stroke={INK} strokeWidth={3} />
        <path d="M12 12 Q9 13 9 18" fill="none" stroke="#fff" strokeWidth={3} opacity={0.6} />
        <rect x={62} y={4} width={86} height={36} rx={5} fill="#7FA9DC" stroke={INK} strokeWidth={3} />
        <path d="M74 4 V40" stroke="#FBF8F2" strokeWidth={5} />
        <path d="M86 22 H136" stroke="#FBF8F2" strokeWidth={3} opacity={0.6} />
      </g>
    </svg>
  )
}

interface Props {
  /** 目前的顏色（hex）或 ERASER */
  value: string
  onChange: (v: string) => void
  /** 塗了夠多才出現的「完成」鍵 */
  done?: ReactNode
  /** 示範、說明中：蠟筆欄變淡、換不了顏色，點了只出現「看這裡」的圈圈（onBlocked） */
  disabled?: boolean
  onBlocked?: (e: PointerEvent) => void
}

/**
 * 右邊的蠟筆盒：兩欄大格子（每格 ≥ 2 cm、間距 ≥ 0.6 cm，準則 TOUCH-1、V-20），每一格斜放一支胖蠟筆，選到的那一格粗外框、稍微變大。
 * 最上面一排是橡皮擦和完成鍵（完成鍵離畫面下緣最遠，TOUCH-5），下面 6 支蠟筆照彩虹的順序。整欄都在畫紙外面，塗畫的手不會碰到。
 */
export const CrayonBox = forwardRef<HTMLDivElement, Props>(function CrayonBox({ value, onChange, done, disabled, onBlocked }, ref) {
  const item = (id: string, label: string, art: ReactNode) => {
    const on = value === id
    return (
      <button
        key={id}
        data-crayon={id}
        className={`tool${on ? ' on' : ''}`}
        aria-label={label}
        aria-pressed={on}
        onPointerDown={(e) => {
          e.preventDefault()
          if (!firstFinger(e.nativeEvent)) return
          if (disabled) return onBlocked?.(e.nativeEvent)
          if (!on) sfx.pop()
          onChange(id)
        }}
      >
        <span className="tool-art">{art}</span>
      </button>
    )
  }
  return (
    <div ref={ref} className={`tool-col${disabled ? ' waiting' : ' waiting-off'}`} data-accepting={disabled ? 'false' : 'true'}>
      {item(ERASER, '橡皮擦', <EraserArt />)}
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
        <AnimatePresence>
          {done && (
            <motion.div key="done" variants={rise} initial="initial" animate="enter" exit="exit">
              {done}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {CRAYONS.map((c) => item(c.hex, `${c.zh}色蠟筆`, <CrayonArt hex={c.hex} />))}
    </div>
  )
})
