import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Sticker } from '../ui/StickerArt'
import { hasLine } from '../content/lines'
import { markSeen, onAchieve, stickerBook, type OwnedSticker } from '../lib/achievements'
import { say, sfx } from '../lib/audio'
import { fnv1a } from '../lib/hash'
import './stickers.css'

/** 本子最後留幾個虛線的空格：告訴孩子「還可以貼更多」，但不要一整頁「還沒有」 */
const EMPTY_SLOTS = 3

// 貼紙本的內容只在拿到新貼紙、點過貼紙時才變，快照存起來給 useSyncExternalStore
let snap: OwnedSticker[] | null = null
onAchieve(() => {
  snap = null
})
const read = () => (snap ??= stickerBook())
const subscribe = (f: () => void) => onAchieve(f)

/** 每張貼紙貼得有一點歪（依 id 固定，不會每次打開都不一樣），像真的貼上去的 */
const tilt = (id: string) => ((parseInt(fnv1a(id), 36) % 9) - 4) * 1.4

function Slot({ s, i }: { s: OwnedSticker; i: number }) {
  const [n, setN] = useState(0)
  return (
    <motion.button
      className={`book-slot${s.fresh ? ' is-fresh' : ''}`}
      aria-label={s.def.zh}
      initial={{ scale: 0, rotate: tilt(s.def.id) - 20 }}
      animate={{ scale: 1, rotate: tilt(s.def.id) }}
      transition={{ type: 'spring', stiffness: 300, damping: 17, delay: Math.min(i, 24) * 0.025 }}
      whileTap={{ scale: 0.93 }}
      onClick={() => {
        sfx.pop()
        setN((x) => x + 1)
        markSeen(s)
        const keys = s.def.lines.filter(hasLine)
        if (keys.length) void say(...keys)
      }}
    >
      <motion.span key={n} className="book-sticker" animate={n ? { rotate: [0, -9, 7, -4, 0], scale: [1, 1.12, 1] } : {}} transition={{ duration: 0.6, ease: 'easeInOut' }}>
        <Sticker def={s.def} stars={s.badge ? { n: s.badge.stars, max: s.badge.max } : undefined} />
      </motion.span>
    </motion.button>
  )
}

/** 我的貼紙：每學會一個東西就多一張，照拿到的先後一張張貼滿；點一張會說它是什麼 */
export function StickerBook() {
  const list = useSyncExternalStore(subscribe, read)
  useEffect(() => {
    void say(list.length ? 'ach.book.hi' : 'ach.book.empty')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="sticker-book">
      {list.map((s, i) => (
        <Slot key={s.def.id} s={s} i={i} />
      ))}
      {Array.from({ length: EMPTY_SLOTS }, (_, i) => (
        <motion.button
          key={`e${i}`}
          className="book-slot is-empty"
          aria-label="還沒有貼紙的空格"
          style={{ '--d': `${i * 0.4}s` } as CSSProperties}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 + Math.min(list.length + i, 24) * 0.025 }}
          onClick={() => {
            sfx.tap()
            void say('ach.book.slot')
          }}
        >
          <span className="book-empty" />
        </motion.button>
      ))}
    </div>
  )
}
