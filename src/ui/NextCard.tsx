import { useEffect, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { ArtSticker, StarShape } from './StickerArt'
import { sfx } from '../lib/audio'
import type { StarWhy } from '../lib/achievements'
import type { Stk } from '../lib/sticker-pick'
import './sticker-ui.css'

/** 加速的星星下面那個小圖：學會新東西、自己改正、升級（玩完一關的那一顆沒有） */
const WHY_ICON: Partial<Record<StarWhy, string>> = { learn: 'sparkles', fix: 'flexed-biceps', level: 'trophy' }
/** 一顆一顆飛進來的間隔（秒） */
const STAR_GAP = 0.38

interface Props {
  /** 已經在卡片上的星星（不播動畫） */
  stars: number
  goal: number
  /** 蓋著的那一張 */
  feature: Stk
  /** 這一次要飛進來的星星（play 變成 true 才開始飛） */
  gain?: StarWhy[]
  play?: boolean
  /** 集滿了、還沒挑：整張卡亮起來，蓋著的貼紙輕輕晃 */
  ready?: boolean
  /** 卡片的樣子：橫的（每局回顧、今日回顧）或直的（貼紙本裡的下一格） */
  layout?: 'row' | 'slot'
  style?: CSSProperties
}

/**
 * 下一張貼紙的進度卡：一張蓋著的貼紙（剪影）＋ 5 個星星格。
 * 孩子不識字：看得到「星星把格子填滿，蓋著的貼紙就是我的」。
 */
export function NextCard({ stars, goal, feature, gain = [], play = false, ready = false, layout = 'row', style }: Props) {
  const total = Math.min(goal, stars + gain.length)
  const [landed, setLanded] = useState(0)
  const full = ready || (play && landed >= gain.length && total >= goal)

  useEffect(() => {
    if (!play || !gain.length) return
    const timers = gain.map((_, i) =>
      window.setTimeout(
        () => {
          sfx.star()
          setLanded(i + 1)
        },
        (0.62 + i * STAR_GAP) * 1000,
      ),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play])

  return (
    <div className={`ncard is-${layout}${full ? ' is-full' : ''}`} style={style}>
      {full && <span className="ncard-halo" aria-hidden="true" />}
      <motion.span className="ncard-ghost" animate={full ? { rotate: [0, -6, 5, -3, 0], scale: [1, 1.06, 1] } : {}} transition={full ? { duration: 1.1, repeat: 1, repeatDelay: 1.4 } : {}}>
        {/* 一直是蓋著的：集滿了也先不翻開，到挑選畫面才翻開（驚喜留到那一刻） */}
        <ArtSticker art={feature.art} seed={feature.seed} ghost />
        {full && <span className="ncard-spark" aria-hidden="true"><Emoji name="sparkles" /></span>}
      </motion.span>
      <span className="ncard-stars">
        {Array.from({ length: goal }, (_, i) => {
          const fresh = i >= stars && i < total
          const k = i - stars
          const why = fresh ? gain[k] : undefined
          return (
            <span key={i} className="ncard-star">
              <StarShape on={false} />
              {(i < stars || (fresh && play)) && (
                <motion.span
                  className="ncard-star-on"
                  initial={fresh ? { scale: 1.6, y: layout === 'row' ? -150 : -60, rotate: -120, opacity: 0 } : false}
                  animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
                  transition={fresh ? { type: 'spring', stiffness: 210, damping: 15, delay: 0.3 + k * STAR_GAP } : { duration: 0 }}
                >
                  <StarShape />
                </motion.span>
              )}
              {why && WHY_ICON[why] && play && (
                <motion.span className="ncard-why" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.55 + k * STAR_GAP }}>
                  <Emoji name={WHY_ICON[why]!} />
                </motion.span>
              )}
            </span>
          )
        })}
      </span>
    </div>
  )
}
