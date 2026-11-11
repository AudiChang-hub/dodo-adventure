import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Dino } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { HomeIcon } from '../games/Shell'
import { ArtSticker, Sticker } from '../ui/StickerArt'
import { useTaps } from '../ui/tap'
import { album, onAchieve, type OwnedSticker } from '../lib/achievements'
import { hasLine } from '../content/lines'
import { say, sfx } from '../lib/audio'
import { BOARD_PEEK, newestFirst, tiltOf } from './sticker-book'
import './stickers.css'

/**
 * 貼紙本（T-132，2026-11-11 家長：「要有貼紙本，這樣才可以回頭去看現在自己有哪些貼紙了」）。
 * 首頁牆上的貼紙板點進去。只看不改：只讀 lib/achievements 的 album()，不挑貼紙、不寫任何資料（連「看過了」都不記）。
 * - 他拿到的每一張都在，最新的在最前面（左上角），一張張大大的，像貼在一本有活頁圈的本子上。
 * - 點一張：貼紙跳一下、轉一下，豆豆念它的名字（挑貼紙時聽過的那一句）。連點、多指都只是再跳一下。
 * - 還沒有貼紙：本子上是三張虛線的剪影（等著被貼上去的位置），沒有字；豆豆說「Your stickers will go here!」。
 * - 返回鍵點一下回首頁（NAV-1）。
 */

// 貼紙本的內容只在拿到新貼紙時才變：快照存起來給 useSyncExternalStore（每次 render 都 new 陣列會一直重畫）
let snap: OwnedSticker[] | null = null
onAchieve(() => {
  snap = null
})
const read = () => (snap ??= newestFirst(album()))

/** 他有的貼紙，最新的在最前面 */
export const useStickers = () => useSyncExternalStore(onAchieve, read)

/** 還沒有貼紙時的剪影：三種孩子最熟的主角（只是外框，不代表他會拿到哪一張） */
const GHOSTS = [
  { art: 't-rex', seed: 11, tilt: -7 },
  { art: 'sauropod', seed: 23, tilt: 4 },
  { art: 'dragon', seed: 37, tilt: -2 },
]

export function StickerBook() {
  const list = useStickers()

  useEffect(() => {
    void say(list.length ? 'stk.book.hi' : 'stk.book.empty')
    // 進來說一次就好
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`screen sticker-book${list.length ? '' : ' is-empty'}`}>
      <div className="sb-back">
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>

      <div className="sb-host" aria-hidden="true">
        <Dino who="dodo" mood="happy" size="100%" />
      </div>

      <motion.section className="sb-album" aria-label="貼紙本" initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 20 }}>
        <span className="sb-rings" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        {list.length ? (
          <>
            {/* 給大人看的小字：孩子看貼紙就好 */}
            <p className="sb-count" aria-hidden="true">
              貼紙本<b>{list.length}</b>張
            </p>
            <div className="sb-scroll">
              <ul className="sb-grid">
                {list.map((s, i) => (
                  <Item key={s.key} s={s} i={i} />
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="sb-empty" data-empty="">
            {GHOSTS.map((g, i) => (
              <motion.span
                key={g.art}
                className="sb-ghost"
                style={{ rotate: `${g.tilt}deg` }}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.2 + i * 0.12 }}
              >
                <ArtSticker art={g.art} seed={g.seed} ghost />
              </motion.span>
            ))}
          </div>
        )}
      </motion.section>
    </div>
  )
}

/** 一張貼紙：點了跳一下、念名字。手指按下、放開就算（ui/tap.ts），滑動捲本子不算點 */
function Item({ s, i }: { s: OwnedSticker; i: number }) {
  const [n, setN] = useState(0)
  const tap = useTaps()
  const pop = () => {
    sfx.pop()
    setN((x) => x + 1)
    const keys = s.def.lines.filter(hasLine)
    if (keys.length) void say(...keys)
  }
  return (
    <li className="sb-slot" style={{ '--tilt': `${tiltOf(s.key)}deg` } as CSSProperties}>
      <motion.button
        className="sb-item"
        data-sticker={s.key}
        data-ts={s.ts}
        aria-label={s.def.zh}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.15 + Math.min(i, 15) * 0.03 }}
        {...tap(s.key, pop)}
      >
        {n > 0 && <motion.span key={`r${n}`} className="sb-ring" aria-hidden="true" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: [0.7, 1.32], opacity: [0, 0.8, 0] }} transition={{ duration: 0.65, ease: 'easeOut' }} />}
        <motion.span
          key={n}
          className="sb-sticker"
          animate={n ? { scale: [1, 1.2, 0.95, 1.04, 1], rotate: [0, -9, 7, -3, 0], y: [0, -14, 0, -3, 0] } : {}}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        >
          <Sticker def={s.def} />
        </motion.span>
      </motion.button>
    </li>
  )
}

/** 首頁牆上的貼紙板裡面：最新的幾張貼紙疊成一小把（最新的在中間、最上面；還沒有就是一張虛線的剪影） */
export function BoardStickers() {
  const list = useStickers()
  const peek = list.slice(0, BOARD_PEEK)
  if (!peek.length)
    return (
      <span className="sbd-stk is-ghost">
        <ArtSticker art={GHOSTS[0].art} seed={GHOSTS[0].seed} ghost />
      </span>
    )
  return (
    <>
      {peek.map((s, i) => (
        <span key={s.key} className="sbd-stk" style={{ '--tilt': `${tiltOf(s.key) * 1.6}deg`, zIndex: BOARD_PEEK - i, order: i === 0 ? 1 : i === 1 ? 0 : 2 } as CSSProperties}>
          <Sticker def={s.def} />
        </span>
      ))}
    </>
  )
}
