import { motion } from 'motion/react'

const CRACKS = [
  'M70 92 L84 104 L78 116 L92 124',
  'M128 84 L116 98 L124 110 L112 120',
  'M96 150 L106 138 L100 128 L112 120',
  'M60 130 L74 136 L70 148 L82 154',
  'M134 134 L122 140 L128 152 L116 158',
]

/** 恐龍蛋：每完成一關多一道裂痕 */
export function Egg({ cracks, wobble = false, size = 260 }: { cracks: number; wobble?: boolean; size?: number | string }) {
  return (
    <motion.svg
      viewBox="0 0 200 240"
      width={size}
      style={{ display: 'block', overflow: 'visible' }}
      animate={wobble ? { rotate: [0, -8, 8, -5, 5, 0] } : { rotate: 0 }}
      transition={{ duration: 0.7 }}
      aria-hidden="true"
    >
      <ellipse cx={100} cy={226} rx={70} ry={10} fill="rgba(46,42,37,.1)" />
      <path d="M100 14 C150 14 184 92 184 144 C184 194 148 222 100 222 C52 222 16 194 16 144 C16 92 50 14 100 14 Z" fill="#FFF6E5" stroke="#D9C7A6" strokeWidth={4} />
      <ellipse cx={70} cy={80} rx={14} ry={10} fill="#BFE0CB" />
      <ellipse cx={134} cy={110} rx={18} ry={13} fill="#BFE0CB" />
      <ellipse cx={86} cy={176} rx={20} ry={13} fill="#BFE0CB" />
      <ellipse cx={142} cy={176} rx={10} ry={8} fill="#BFE0CB" />
      <ellipse cx={66} cy={60} rx={14} ry={22} fill="#fff" opacity={0.7} transform="rotate(-20 66 60)" />
      {CRACKS.slice(0, cracks).map((d, i) => (
        <motion.path key={i} d={d} fill="none" stroke="#8C7A5B" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
      ))}
    </motion.svg>
  )
}
