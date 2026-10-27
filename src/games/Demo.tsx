import { motion } from 'motion/react'
import './teach.css'

/**
 * 示範用的道具：一隻會點的手（選擇、數數、照順序）與一支會畫的筆（運筆、描字、連點）。
 * 手和筆都是紙感的粗線條插畫，跟恐龍同一套線條語言。
 */

const INK = '#2E2A25'

/** 指尖在 (22, 6)；viewBox 0 0 64 84 */
export function HandArt({ cuff = '#F0B088' }: { cuff?: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <rect x={18} y={68} width={28} height={13} rx={5} fill={cuff} stroke={INK} strokeWidth={3.5} />
      <path
        d="M22 6 C25.3 6 28 8.7 28 12 V33.5 C29.6 32.4 31.6 32.2 33.6 33 C35.2 31.7 37.6 31.6 39.6 32.8 C41.6 31.8 44.6 32.4 46 34.6 C47.2 36.2 47.6 38 47.6 40 V52 C47.6 62 40.6 70 31 70 H28 C21 70 16 66.4 13 60.6 L7 49.4 C5.4 46.4 6.6 43 9.4 41.8 C12 40.8 14.6 41.8 16 44.2 V12 C16 8.7 18.7 6 22 6 Z"
        fill="#FFE9D6"
        stroke={INK}
        strokeWidth={3.5}
      />
      <path d="M28 34 V43 M33.6 33.4 V43 M39.6 33.2 V43" fill="none" stroke={INK} strokeWidth={3} />
      <ellipse cx={22} cy={13} rx={3.2} ry={2.4} fill="#fff" opacity={0.7} />
    </g>
  )
}

/** 筆尖在 (0, 0)，筆身往右上斜 */
export function PenArt({ scale = 1, color = '#8F7CC0' }: { scale?: number; color?: string }) {
  return (
    <g transform={`scale(${scale}) rotate(32)`} strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx={0} cy={4} rx={9} ry={3} fill="rgba(46,42,37,0.16)" stroke="none" transform="rotate(-32)" />
      <path d="M0 0 L-7.5 -20 H7.5 Z" fill="#F6E2C4" stroke={INK} strokeWidth={3.4} />
      <path d="M0 0 L-2.8 -7.5 H2.8 Z" fill={INK} />
      <rect x={-7.5} y={-66} width={15} height={46} rx={2} fill={color} stroke={INK} strokeWidth={3.4} />
      <path d="M-2.5 -63 V-24" stroke="#fff" strokeWidth={2.6} opacity={0.45} />
      <rect x={-7.5} y={-74} width={15} height={9} rx={1.5} fill="#E9E1D2" stroke={INK} strokeWidth={3.4} />
      <path d="M-7.5 -74 V-79 Q-7.5 -84 -2.5 -84 H2.5 Q7.5 -84 7.5 -79 V-74 Z" fill="#F09DB9" stroke={INK} strokeWidth={3.4} />
    </g>
  )
}

interface HandProps {
  /** 指尖要指的位置（父層的百分比座標） */
  x: number
  y: number
  /** 每變一次就做一次「點下去」的動作 */
  tap?: number
  size?: string
  cuff?: string
  /** 一直輕輕地點，吸引孩子跟著點 */
  beckon?: boolean
}

/** 一隻會移動、會點的手；放在 position: relative/absolute 的容器裡 */
export function Hand({ x, y, tap = 0, size = '10cqmin', cuff, beckon }: HandProps) {
  return (
    <motion.div
      className="demo-hand"
      style={{ width: size }}
      initial={{ left: `${x}%`, top: `${y + 8}%`, opacity: 0, scale: 0.7 }}
      animate={{ left: `${x}%`, top: `${y}%`, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 190, damping: 24 }}
    >
      {tap > 0 && <motion.span key={`r${tap}`} className="demo-ripple" initial={{ scale: 0.2, opacity: 0.8 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />}
      <motion.svg
        key={tap}
        viewBox="0 0 64 84"
        width="100%"
        style={{ display: 'block', overflow: 'visible', transformOrigin: '34% 8%' }}
        aria-hidden="true"
        animate={beckon ? { y: ['0%', '9%', '0%', '0%'], scale: [1, 0.9, 1, 1] } : tap ? { y: ['0%', '8%', '0%'], scale: [1, 0.88, 1] } : {}}
        transition={beckon ? { duration: 1.3, repeat: Infinity, times: [0, 0.18, 0.4, 1], ease: 'easeInOut' } : { duration: 0.34 }}
      >
        <HandArt cuff={cuff} />
      </motion.svg>
    </motion.div>
  )
}

/** rAF 補間：ms 毫秒內把 0→1 交給 fn；alive() 變 false 時立刻結束 */
export function tween(ms: number, fn: (f: number) => void, alive: () => boolean, ease = (t: number) => t): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now()
    const step = (now: number) => {
      if (!alive()) return resolve()
      const t = Math.min(1, (now - t0) / ms)
      fn(ease(t))
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
