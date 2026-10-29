import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { COLORS } from '../../content/park'
import { sfx } from '../../lib/audio'
import { useHold, Ring } from '../../ui/Hold'

export const PALETTE = [...COLORS.map((c) => c.hex), '#2E2A25']

/** 右側工具欄：最上面放「完成」鍵（children），下面是顏色，整欄都在畫布外。
 *  完成鍵不放最下面：畫面最下緣 2 cm 是孩子手腕靠的地方（準則 TOUCH-5、V-34） */
export function Palette({ value, onChange, children }: { value: string; onChange: (hex: string) => void; children?: ReactNode }) {
  return (
    <div style={{ position: 'absolute', right: '1.6%', top: '2%', bottom: '4%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.4cqh', zIndex: 3 }}>
      {children}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.2cqh' }}>
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
            style={{ width: '7.4cqh', aspectRatio: '1', borderRadius: '50%', background: hex, boxShadow: value === hex ? '0 0 0 5px #FBF8F2, 0 0 0 9px #2E2A25' : 'inset 0 -5px 0 rgba(0,0,0,.12)' }}
          />
        ))}
      </div>
    </div>
  )
}

/** 完成鍵：按住 0.6 秒才觸發，避免孩子畫到旁邊時誤存 */
export function CheckButton({ onPress }: { onPress: () => void }) {
  const { progress, handlers } = useHold(600, onPress)
  return (
    <motion.button
      aria-label="完成（按住）"
      whileTap={{ scale: 0.92 }}
      {...handlers}
      style={{ position: 'relative', flex: 'none', width: '12cqh', aspectRatio: '1', borderRadius: '50%', background: '#6FAE86', display: 'grid', placeItems: 'center', boxShadow: '0 7px 0 #4E8A64' }}
    >
      <svg viewBox="0 0 48 48" width="56%" aria-hidden="true">
        <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hold-ring">
        <Ring progress={progress} width={7} />
      </span>
    </motion.button>
  )
}
