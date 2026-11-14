import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { useTaps } from '../../ui/tap'
import { Sparkles } from '../../ui/Sparkles'
import { EASE } from '../../ui/motion'
import { linePics, type ZhText } from './data'
import { Pic } from './Pic'

/** 一篇的封面圖：第一行的第一張圖 */
const coverOf = (t: ZhText) => t.emoji[linePics(t)[0]?.[0]?.word ?? t.redWords[0]] ?? null

/** 「再一篇」的書多久之後才出現（先慶祝，T-141）；出現之前點了不算（舊篇最後一題連點的手指不會一下就點到） */
const OFFER_IN_S = 1.1
const ARM_MS = 1300
/** 慶祝這麼久，下課的大箭頭才出來（手指著它；Lesson.tsx 用） */
export const CHEER_BEAT_MS = 1200

/**
 * 複習（舊篇）上完（T-142，家長 2026-11-12：第二篇改成提議；盲測 9231aa6：孩子舊篇撐得完，接著上新篇就離開，連兩版都這樣）：
 * 慶祝——舊篇的書在中間打勾、撒星星，莫莫歡呼——接著右下角出現下課的大箭頭（ui/NextStep，手指著它，Lesson 叫的），點了就下課、晚安，今天就算上完。
 * 旁邊一本小一點的新書（「再一篇」）：沒有黃框、沒有「新」；大人或孩子主動點了才上新篇（先喘口氣）。
 * 圖不淡、書夠大（≥ 96px），出來時輕輕跳一下讓大人看到（T-145）；但手不指它、不在它上面停（T-146，家長 2026-11-14：
 * 盲測 dbc602c 手先指新書，4/4 孩子都照著點進新篇，0/4 上完，都說「好久喔／看不懂」；手指箭頭那一版 4/4 順利下課）。
 * 手只指下課箭頭，要不要上新篇由大人決定。沒有字、不出聲（中文課不出聲）。他不點就一直等，不自己下課、不自己上新篇。
 */
export function Between({ old, t, onMore }: { old: ZhText; t: ZhText; onMore: () => void }) {
  const still = useReducedMotion()
  const tap = useTaps()
  const at = useRef(performance.now())
  const chosen = useRef(false)
  const a = coverOf(old)
  const b = coverOf(t)
  const more = () => {
    if (chosen.current || performance.now() - at.current < ARM_MS) return
    chosen.current = true
    sfx.tap()
    onMore()
  }
  return (
    <div className="zh-between" data-between="" data-old-done="">
      <div className="zh-between-row">
        {/* 上完了：舊篇的書打勾、撒星星（看的，不是按鈕） */}
        <motion.div
          className="zh-book is-done"
          data-day={old.day}
          initial={still ? false : { scale: 0.9 }}
          animate={still ? {} : { scale: [0.9, 1.06, 1] }}
          transition={{ duration: 0.7, ease: EASE.out }}
        >
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
        </motion.div>
        {/* 再一篇（提議）：一本小一點的新書，出來時輕輕跳一下（給大人看）；手不指它，孩子或大人主動點才上 */}
        <motion.button
          type="button"
          className="zh-offer"
          data-day={t.day}
          aria-label="再一篇"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: EASE.out, delay: still ? 0 : OFFER_IN_S }}
          {...tap('more', more)}
        >
          <motion.span
            className="zh-offer-pic"
            initial={false}
            animate={still ? {} : { y: [0, -8, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 0.6, ease: EASE.out, delay: OFFER_IN_S + 0.5 }}
          >
            {b && <Pic name={b} />}
          </motion.span>
        </motion.button>
      </div>
    </div>
  )
}

/** 喘口氣多久才開始念新的一篇 */
export const BREATH_MS = 2800

/**
 * 喘口氣（T-141，AI 小男生盲測 c9bb003：舊篇上完、點了再一篇，新篇馬上開始念，兩輪都在新篇一半說「好久喔」就走了）：
 * 新的一篇的書走到中間、後面一圈暖光慢慢吸一口氣（變大）、吐一口氣（變小）一次，莫莫跟著動一下；約 3 秒後書打開，開始念。
 * 不出聲（中文課不出聲）、不用點；這時候亂點不會跳過，也不會卡住（時間到一定往下）。返回鍵照常回首頁。
 */
export function Breath({ t, onDone }: { t: ZhText; onDone: () => void }) {
  const still = useReducedMotion()
  const done = useRef(onDone)
  done.current = onDone
  const pic = coverOf(t)
  useEffect(() => {
    const k = window.setTimeout(() => done.current(), still ? 900 : BREATH_MS)
    return () => clearTimeout(k)
  }, [still])
  return (
    <div className="zh-breath" data-breath="" aria-label={t.title}>
      <motion.span
        className="zh-breath-glow"
        aria-hidden="true"
        initial={still ? false : { scale: 0.7, opacity: 0 }}
        animate={still ? { opacity: 0.7 } : { scale: [0.7, 1.18, 0.96], opacity: [0, 0.95, 0.7] }}
        transition={{ duration: 2.4, ease: EASE.inOut, times: [0, 0.5, 1] }}
      />
      <motion.div
        className="zh-book is-new zh-breath-book"
        initial={still ? false : { scale: 0.82, y: 18, opacity: 0.4 }}
        animate={still ? { opacity: 1 } : { scale: [0.82, 1.06, 1], y: [18, -4, 0], opacity: [0.4, 1, 1] }}
        transition={{ duration: 2.4, ease: EASE.inOut, times: [0, 0.5, 1] }}
      >
        <span className="zh-book-pic">{pic && <Pic name={pic} />}</span>
        <span className="zh-book-title">{t.title}</span>
        <span className="zh-book-new" aria-hidden="true">
          新
        </span>
      </motion.div>
    </div>
  )
}
