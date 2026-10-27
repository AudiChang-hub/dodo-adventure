import { motion } from 'motion/react'

const COLORS = ['#F1D27C', '#E99A84', '#8FCBAA', '#A3C4E4', '#BFB2DF']

/** 答對時從選項中心炸開的小星星 */
export function Sparkles({ count = 10 }: { count?: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4
        const d = 90 + Math.random() * 70
        const size = 14 + Math.random() * 14
        return (
          <motion.svg
            key={i}
            viewBox="0 0 20 20"
            width={size}
            style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -size / 2, marginTop: -size / 2 }}
            initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, scale: [0, 1.2, 0.6], rotate: 160, opacity: [1, 1, 0] }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          >
            <path d="M10 0 L12.6 7.4 L20 10 L12.6 12.6 L10 20 L7.4 12.6 L0 10 L7.4 7.4 Z" fill={COLORS[i % COLORS.length]} />
          </motion.svg>
        )
      })}
    </div>
  )
}
