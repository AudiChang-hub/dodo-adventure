import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { useTaps } from '../../ui/tap'
import { Sparkles } from '../../ui/Sparkles'
import { EASE } from '../../ui/motion'
import { Hand } from '../../games/Demo'
import { linePics, type ZhText } from './data'
import { Pic } from './Pic'

/** 一篇的封面圖：第一行的第一張圖 */
const coverOf = (t: ZhText) => t.emoji[linePics(t)[0]?.[0]?.word ?? t.redWords[0]] ?? null

/** 「再一篇」的書多久之後才淡淡地出現（先慶祝，T-141）；出現之前點了不算（舊篇最後一題連點的手指不會一下就點到） */
const OFFER_IN_S = 1.1
const ARM_MS = 1300
/**
 * 手先到新書上點一下（T-145，盲測 fb621aa：4/4 孩子都照手點大箭頭下課，沒人點新書——孩子是「手在哪就點哪」）：
 * 書出來後手來、點一下（書跟著輕輕跳一下）、收起來；接著才去指下課的大箭頭（Lesson 的 OFFER_TOUR_MS 之後叫 nextStep）
 */
const HAND_IN_MS = 1500
const HAND_TAP_MS = 2100
const HAND_OUT_MS = 3000
/** 手在書上那一段結束，下課箭頭才出來（Lesson.tsx 用） */
export const OFFER_TOUR_MS = 3300

/**
 * 複習（舊篇）上完（T-142，家長 2026-11-12：第二篇改成提議；盲測 9231aa6：孩子舊篇撐得完，接著上新篇就離開，連兩版都這樣）：
 * 慶祝——舊篇的書在中間打勾、撒星星，莫莫歡呼——接著右下角出現下課的大箭頭（ui/NextStep，手指著它，Lesson 叫的），點了就下課、晚安，今天就算上完。
 * 旁邊一本小一點的新書（「再一篇」）：沒有黃框、沒有「新」；孩子主動點了才上新篇（先喘口氣）。
 * T-145（盲測 fb621aa：沒人點新書，它沒有手、沒有聲音、圖很淡）：圖不再淡，書出來後手先到書上點一下、書輕輕跳一下，
 * 然後手才去指下課箭頭——孩子看得出「這本也可以點」，但下課照常是手最後停著的那一個，不點也能下課（T-142 的規則不變）。
 * 沒有字、不出聲（中文課不出聲）。他不點就一直等，不自己下課、不自己上新篇。
 */
export function Between({ old, t, onMore }: { old: ZhText; t: ZhText; onMore: () => void }) {
  const still = useReducedMotion()
  const tap = useTaps()
  const at = useRef(performance.now())
  const chosen = useRef(false)
  const a = coverOf(old)
  const b = coverOf(t)
  /** 手在新書上：0 沒有、1 來了、2 點一下 */
  const [hand, setHand] = useState(0)
  useEffect(() => {
    const ks = [
      window.setTimeout(() => !chosen.current && setHand(1), HAND_IN_MS),
      window.setTimeout(() => !chosen.current && setHand(2), HAND_TAP_MS),
      window.setTimeout(() => setHand(0), HAND_OUT_MS),
    ]
    return () => ks.forEach(clearTimeout)
  }, [])
  const more = () => {
    if (chosen.current || performance.now() - at.current < ARM_MS) return
    chosen.current = true
    setHand(0)
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
        {/* 再一篇（提議）：一本小一點的新書，手先來點一下給他看，孩子主動點才上 */}
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
          {/* 手點下去那一下，書輕輕跳一下（一次就停） */}
          <motion.span
            className="zh-offer-pic"
            animate={hand === 2 && !still ? { y: [0, -10, 0], scale: [1, 1.08, 1] } : { y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE.out }}
          >
            {b && <Pic name={b} />}
          </motion.span>
          <AnimatePresence>
            {hand > 0 && (
              <span className="zh-offer-hand" aria-hidden="true">
                <Hand x={55} y={58} tap={hand === 2 ? 1 : 0} size="70%" cuff="#F2C9A8" />
              </span>
            )}
          </AnimatePresence>
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
