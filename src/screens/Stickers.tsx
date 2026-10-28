import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { AlbumPage, PER_PAGE, pageCount } from '../ui/Album'
import { NextCard } from '../ui/NextCard'
import { StickerPicker } from '../ui/StickerPicker'
import { album, cardState, nextPick, onAchieve, starBadges, type CardState, type OwnedSticker } from '../lib/achievements'
import { say, sfx } from '../lib/audio'
import './stickers.css'

// 貼紙本的內容只在拿到新貼紙、點過貼紙、星星變多時才變，快照存起來給 useSyncExternalStore
interface Snap {
  list: OwnedSticker[]
  badges: OwnedSticker[]
  card: CardState
}
let snap: Snap | null = null
onAchieve(() => {
  snap = null
})
const read = () => (snap ??= { list: album(), badges: starBadges(), card: cardState() })
const subscribe = (f: () => void) => onAchieve(f)

/** 翻頁要滑多遠才算 */
const SWIPE_PX = 70

function Arrow({ dir }: { dir: 1 | -1 }) {
  return (
    <svg viewBox="0 0 48 48" width="44%" aria-hidden="true" style={{ rotate: dir < 0 ? '180deg' : undefined }}>
      <path d="M18 10 L33 24 L18 38" fill="none" stroke="#6b645a" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 我的貼紙（2026-10-28 改版）：一本自由的相簿，照拿到的順序一張張往後貼，頁數不限。
 * - 打開就翻到最後一頁（最新的貼紙、下一張的進度卡都在那裡）。左右的大箭頭或用手滑來翻頁。
 * - 最後一格是「下一張」：蓋著的貼紙 + 星星格。集滿了、還沒挑的，那一格會亮，點了就去挑。
 * - 點貼紙念英文名字（Fire truck!）；升級的星星徽章放在第一頁。
 */
export function StickerBook() {
  const { list, badges, card } = useSyncExternalStore(subscribe, read)
  const [picking, setPicking] = useState(false)
  /** 第一頁是星星徽章（有升過級的遊戲才有） */
  const lead = badges.length ? 1 : 0
  const pages = lead + pageCount(list.length)
  const [page, setPage] = useState(() => pages - 1)
  const [dir, setDir] = useState(1)
  const at = Math.min(page, pages - 1)
  const waiting = nextPick()

  useEffect(() => {
    if (waiting) void say('stk.wait')
    else void say(list.length ? 'ach.book.hi' : `stk.card.left.dodo.${card.goal - card.stars}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const turn = (d: 1 | -1) => {
    const p = at + d
    if (p < 0 || p >= pages) return
    sfx.whoosh()
    setDir(d)
    setPage(p)
  }

  const onNext = () => {
    if (waiting) {
      sfx.pop()
      setPicking(true)
      return
    }
    sfx.tap()
    void say(`stk.card.left.dodo.${card.goal - card.stars}`)
  }

  const items = useMemo(() => {
    if (at < lead) return badges
    const i = at - lead
    return list.slice(i * PER_PAGE, i * PER_PAGE + PER_PAGE)
  }, [at, lead, list, badges])
  const last = at === pages - 1

  const next = last ? (
    <button className="book-next" aria-label={waiting ? '挑一張貼紙' : '下一張貼紙'} onClick={onNext}>
      <NextCard layout="slot" stars={waiting ? card.goal : card.stars} goal={card.goal} feature={waiting ? waiting.feature : card.feature} ready={!!waiting} />
    </button>
  ) : undefined

  return (
    <div className="sticker-book">
      <div className="book-spread">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={at}
            className={`book-page${at < lead ? ' is-badges' : ''}`}
            custom={dir}
            initial={{ x: `${dir * 40}%`, opacity: 0, rotate: dir * 1.5 }}
            animate={{ x: 0, opacity: 1, rotate: 0 }}
            exit={{ x: `${-dir * 40}%`, opacity: 0, rotate: -dir * 1.5 }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info: PanInfo) => {
              if (info.offset.x < -SWIPE_PX) turn(1)
              else if (info.offset.x > SWIPE_PX) turn(-1)
            }}
          >
            <AlbumPage items={items} next={next} />
          </motion.div>
        </AnimatePresence>
      </div>
      {at > 0 && (
        <button className="round-btn book-turn is-prev" aria-label="上一頁" onClick={() => turn(-1)}>
          <Arrow dir={-1} />
        </button>
      )}
      {!last && (
        <button className="round-btn book-turn is-next" aria-label="下一頁" onClick={() => turn(1)}>
          <Arrow dir={1} />
        </button>
      )}
      {pages > 1 && pages <= 14 && (
        <div className="book-dots" aria-hidden="true">
          {Array.from({ length: pages }, (_, i) => (
            <i key={i} className={i === at ? 'on' : undefined} />
          ))}
        </div>
      )}
      <AnimatePresence>
        {picking && (
          <StickerPicker
            onDone={() => {
              setPicking(false)
              // 回到最後一頁：剛貼上的那張就在這裡
              setDir(1)
              setPage(Number.MAX_SAFE_INTEGER)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
