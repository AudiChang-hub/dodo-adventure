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

/**
 * 慶祝先自己一拍（T-141，AI 小男生盲測 c9bb003：舊篇上完、選擇一起跳出來，孩子跟著手就點了再一篇，沒有停一下）：
 * 舊篇的書打勾、撒星星、莫莫歡呼，這麼久之後兩個選項才進來
 */
const CHOICE_IN_S = 1.1
/**
 * 手：先指「再一篇」，再指「回家」（T-141：以前只指再一篇，兩輪孩子都跟著手點了再一篇、新篇一半就走了。
 * 兩個都是可以選的，手兩邊都指，讓他自己選），之後每 8 秒（PHASE-7 小班段）再輪一次；絕不自己往下（T-118）
 */
const HAND_MS = 2000
const HAND_SWAP_MS = 2400
const HAND_AGAIN_MS = 8000
/** 選項進來之前點了不算（舊篇最後一題連點的手指、慶祝時亂點，不會一下就選掉） */
const ARM_MS = 1300
type HandAt = { at: 'more' | 'home'; n: number }

/**
 * 舊篇上完（T-140，AI 小男生盲測 73d57c7：兩篇中間沒有停頓，孩子第 2 篇一半就走了。家長：「一天兩篇的用意是在複習，如果可以取得平衡也可以」）：
 * 先慶祝（舊篇的書打勾、撒星星，莫莫歡呼），停一拍，再讓他自己選——
 * - 大的「再一篇」：新的一篇的書（亮黃框、角上「新」）；
 * - 「回家」：小房子（跟返回鍵一樣：這次只算上完舊篇，新篇不消耗，下次還是這一篇，course.ts）。
 * 手兩邊輪流指（T-141）。沒有字、不出聲（中文課不出聲）。他不選就一直等，手每 8 秒再輪一次，不自己往下。
 */
export function Between({ old, t, onMore, onHome }: { old: ZhText; t: ZhText; onMore: () => void; onHome: () => void }) {
  const still = useReducedMotion()
  const tap = useTaps()
  const [hand, setHand] = useState<HandAt | null>(null)
  const at = useRef(performance.now())
  const chosen = useRef(false)
  const a = coverOf(old)
  const b = coverOf(t)
  useEffect(() => {
    const ts: number[] = []
    const round = (first: number) => {
      ts.push(window.setTimeout(() => setHand((h) => ({ at: 'more', n: (h?.n ?? 0) + 1 })), first))
      ts.push(window.setTimeout(() => setHand((h) => ({ at: 'home', n: (h?.n ?? 0) + 1 })), first + HAND_SWAP_MS))
    }
    round(HAND_MS)
    const again = window.setInterval(() => round(0), HAND_AGAIN_MS)
    return () => (ts.forEach(clearTimeout), clearInterval(again))
  }, [])
  /** 選了：只算一次（連點、兩根手指）；選項還沒進來的那一下不算 */
  const choose = (f: () => void) => () => {
    if (chosen.current || performance.now() - at.current < ARM_MS) return
    chosen.current = true
    setHand(null)
    sfx.tap()
    f()
  }
  const inAt = still ? 0 : CHOICE_IN_S
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
        {/* 再一篇：新的一篇的書 */}
        <motion.button
          type="button"
          className="zh-book is-new zh-choice-more"
          data-day={t.day}
          aria-label="再一篇"
          initial={still ? false : { x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE.out, delay: inAt }}
          {...tap('more', choose(onMore))}
        >
          <span className="zh-book-pic">{b && <Pic name={b} />}</span>
          <span className="zh-book-title">{t.title}</span>
          <span className="zh-book-new" aria-hidden="true">
            新
          </span>
          <AnimatePresence>{hand?.at === 'more' && <Hand key="hand" x={60} y={60} tap={hand.n} size="38%" />}</AnimatePresence>
        </motion.button>
        {/* 回家：小房子（跟返回鍵一樣） */}
        <motion.button
          type="button"
          className="zh-choice-home"
          aria-label="回家"
          initial={still ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: inAt + 0.3 }}
          {...tap('home', choose(onHome))}
        >
          <HomeIcon />
          <AnimatePresence>{hand?.at === 'home' && <Hand key="hand" x={62} y={62} tap={hand.n} size="70%" />}</AnimatePresence>
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
