import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { HomeIcon } from '../../games/Shell'
import { Hand } from '../../games/Demo'
import { sfx } from '../../lib/audio'
import { useTaps } from '../../ui/tap'
import { Sparkles } from '../../ui/Sparkles'
import { EASE } from '../../ui/motion'
import { linePics, type ZhText } from './data'
import { Pic } from './Pic'

/** 一篇的封面圖：第一行的第一張圖 */
const coverOf = (t: ZhText) => t.emoji[linePics(t)[0]?.[0]?.word ?? t.redWords[0]] ?? null

/** 手來輕輕指「再一篇」：一出來、之後每 8 秒（PHASE-7 小班段）；絕不自己往下（T-118） */
const HAND_MS = 1200
const HAND_AGAIN_MS = 8000
/** 剛出來多久內點了不算（舊篇最後一題連點的手指不會一下就選掉） */
const ARM_MS = 600

/**
 * 舊篇上完（T-140，AI 小男生盲測 73d57c7：兩篇中間沒有停頓，孩子第 2 篇一半就走了。家長：「一天兩篇的用意是在複習，如果可以取得平衡也可以」）：
 * 先慶祝（舊篇的書打勾、撒星星，莫莫歡呼），再讓他自己選——
 * - 大的「再一篇」：新的一篇的書（亮黃框、角上「新」），手輕輕指著它（預設）；
 * - 「回家」：小房子（跟返回鍵一樣：這次只算上完舊篇，新篇不消耗，下次還是這一篇，course.ts）。
 * 沒有字、不出聲（中文課不出聲）。他不選就一直等，手每 8 秒再指一次，不自己往下。
 */
export function Between({ old, t, onMore, onHome }: { old: ZhText; t: ZhText; onMore: () => void; onHome: () => void }) {
  const still = useReducedMotion()
  const tap = useTaps()
  const [hand, setHand] = useState(0)
  const at = useRef(performance.now())
  const chosen = useRef(false)
  const a = coverOf(old)
  const b = coverOf(t)
  useEffect(() => {
    const h = window.setTimeout(() => setHand((n) => n + 1), HAND_MS)
    const again = window.setInterval(() => setHand((n) => n + 1), HAND_AGAIN_MS)
    return () => (clearTimeout(h), clearInterval(again))
  }, [])
  /** 選了：只算一次（連點、兩根手指）；剛出來的那一下不算 */
  const choose = (f: () => void) => () => {
    if (chosen.current || performance.now() - at.current < ARM_MS) return
    chosen.current = true
    sfx.tap()
    f()
  }
  return (
    <div className="zh-between" data-between="">
      <div className="zh-between-row">
        {/* 上完了：舊篇的書打勾、撒星星（看的，不是按鈕） */}
        <div className="zh-book is-done" data-day={old.day}>
          <span className="zh-book-pic">{a && <Pic name={a} />}</span>
          <span className="zh-book-title">{old.title}</span>
          <motion.span
            className="zh-book-check"
            aria-hidden="true"
            initial={still ? false : { scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.15 }}
          >
            <svg viewBox="0 0 48 48" width="62%">
              <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.span>
          <Sparkles count={16} />
        </div>
        {/* 再一篇（預設，手指著）：新的一篇的書 */}
        <motion.button
          type="button"
          className="zh-book is-new zh-choice-more"
          data-day={t.day}
          aria-label="再一篇"
          initial={still ? false : { x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE.out, delay: 0.5 }}
          {...tap('more', choose(onMore))}
        >
          <span className="zh-book-pic">{b && <Pic name={b} />}</span>
          <span className="zh-book-title">{t.title}</span>
          <span className="zh-book-new" aria-hidden="true">
            新
          </span>
          <AnimatePresence>{hand > 0 && <Hand key="hand" x={60} y={60} tap={hand} size="38%" />}</AnimatePresence>
        </motion.button>
        {/* 回家：小房子（跟返回鍵一樣） */}
        <motion.button
          type="button"
          className="zh-choice-home"
          aria-label="回家"
          initial={still ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.8 }}
          {...tap('home', choose(onHome))}
        >
          <HomeIcon />
        </motion.button>
      </div>
    </div>
  )
}
