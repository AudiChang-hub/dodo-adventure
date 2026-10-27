import { motion } from 'motion/react'

/** 「好了」：大大的綠色勾勾，不需要文字。glow 是閒置第二段提示（慢慢發光、不說話） */
export function DoneButton({ x, y, glow, onPress }: { x: string; y: string; glow?: boolean; onPress: () => void }) {
  return (
    <motion.button className={`sheet-done${glow ? ' glow' : ''}`} aria-label="好了" style={{ left: x, top: y }} whileTap={{ scale: 0.9 }} onPointerDown={onPress}>
      <svg viewBox="0 0 48 48" width="58%" aria-hidden="true">
        <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.button>
  )
}
