import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Sticker } from './StickerArt'
import { hasLine } from '../content/lines'
import { markSeen, type OwnedSticker } from '../lib/achievements'
import { say, sfx } from '../lib/audio'
import { fnv1a } from '../lib/hash'
import './sticker-ui.css'

/**
 * 貼紙本的一頁（2026-10-28 家長：「自由的相簿」）：照拿到的順序一張一張往後貼，頁數不限，同一款貼兩次就兩張。
 * 每張的位置、角度依它自己的 key 稍微偏一點（固定的，每次打開都一樣），看起來像手貼的。
 */
export const PER_PAGE = 10
const COLS = 5
const ROWS = 2

/** 貼紙本有幾頁：最後一定留一格給「下一張」 */
export const pageCount = (n: number) => Math.max(1, Math.ceil((n + 1) / PER_PAGE))

export function slotStyle(i: number, key: string): CSSProperties {
  const h = parseInt(fnv1a(key), 36)
  const c = i % COLS
  const r = Math.floor(i / COLS) % ROWS
  const jx = ((h % 9) - 4) * 0.6
  const jy = (((h >> 4) % 9) - 4) * 1.2
  const rot = (((h >> 8) % 19) - 9) * 1.2
  // 頁面四周留白（左右 5%、上下 7%），偏移之後也不會超出紙張
  return { left: `${5 + ((c + 0.5) / COLS) * 90 + jx}%`, top: `${7 + ((r + 0.5) / ROWS) * 86 + jy}%`, rotate: `${rot}deg` }
}

function Item({ s, i, landing }: { s: OwnedSticker; i: number; landing: boolean }) {
  const [n, setN] = useState(0)
  const st = slotStyle(i, s.key)
  return (
    <motion.button
      className={`al-item${s.fresh ? ' is-fresh' : ''}`}
      style={st}
      aria-label={s.def.zh}
      initial={landing ? { scale: 1.8, opacity: 0, y: -40 } : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={landing ? { type: 'spring', stiffness: 260, damping: 17, delay: 0.25 } : { type: 'spring', stiffness: 300, damping: 20, delay: Math.min(i, 10) * 0.035 }}
      whileTap={{ scale: 0.93 }}
      onClick={() => {
        sfx.pop()
        setN((x) => x + 1)
        markSeen(s)
        const keys = s.def.lines.filter(hasLine)
        if (keys.length) void say(...keys)
      }}
    >
      {landing && <motion.span className="al-press" aria-hidden="true" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 1.5], opacity: [0, 0.7, 0] }} transition={{ delay: 0.55, duration: 0.7 }} />}
      <motion.span key={n} className="al-sticker" animate={n ? { rotate: [0, -9, 7, -4, 0], scale: [1, 1.12, 1] } : {}} transition={{ duration: 0.6, ease: 'easeInOut' }}>
        <Sticker def={s.def} stars={s.badge ? { n: s.badge.stars, max: s.badge.max } : undefined} />
      </motion.span>
    </motion.button>
  )
}

/** 一頁：items 是這一頁的貼紙；next 是最後一頁的「下一張」那一格（進度卡） */
export function AlbumPage({ items, next, landing }: { items: OwnedSticker[]; next?: ReactNode; landing?: string }) {
  return (
    <div className="al-page">
      {items.map((s, i) => (
        <Item key={s.key} s={s} i={i} landing={s.key === landing} />
      ))}
      {next && items.length < PER_PAGE && (
        <div className="al-next" style={{ ...slotStyle(items.length, 'next'), rotate: '0deg' }}>
          {next}
        </div>
      )}
    </div>
  )
}
