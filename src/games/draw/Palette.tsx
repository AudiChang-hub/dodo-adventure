import { motion } from 'motion/react'
import { COLORS } from '../../content/park'
import { sfx } from '../../lib/audio'

export const PALETTE = [...COLORS.map((c) => c.hex), '#2E2A25']

export function Palette({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div style={{ position: 'absolute', right: '1.6%', top: '2%', bottom: '4%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.4cqh', zIndex: 3 }}>
      {PALETTE.map((hex) => (
        <motion.button
          key={hex}
          aria-label="顏色"
          onPointerDown={() => {
            sfx.pop()
            onChange(hex)
          }}
          animate={{ scale: value === hex ? 1.18 : 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          style={{ width: '8.4cqh', aspectRatio: '1', borderRadius: '50%', background: hex, boxShadow: value === hex ? '0 0 0 5px #FBF8F2, 0 0 0 9px #2E2A25' : 'inset 0 -5px 0 rgba(0,0,0,.12)' }}
        />
      ))}
    </div>
  )
}

export function CheckButton({ onPress, style }: { onPress: () => void; style?: React.CSSProperties }) {
  return (
    <motion.button
      aria-label="完成"
      whileTap={{ scale: 0.92 }}
      onPointerDown={onPress}
      style={{ position: 'absolute', right: '11%', bottom: '5%', width: '13cqh', aspectRatio: '1', borderRadius: '50%', background: '#6FAE86', display: 'grid', placeItems: 'center', boxShadow: '0 7px 0 #4E8A64', zIndex: 3, ...style }}
    >
      <svg viewBox="0 0 48 48" width="56%" aria-hidden="true">
        <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.button>
  )
}
