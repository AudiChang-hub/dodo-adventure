import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Dino } from '../../art/Dino'
import { HomeIcon } from '../../games/Shell'
import { go as goTo } from '../../lib/nav'
import { Hand } from '../../games/Demo'
import { firstFinger } from '../../games/NotYet'
import { say, sfx } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { EN_NEXT_KEY } from '../../content/story/english'
import { Sparkles } from '../../ui/Sparkles'
import { Pic } from '../../lessons/chinese/Pic'
import type { EnBookRow } from './en-book'
import './en-flow.css'

/**
 * 慶祝先自己一拍（T-141，AI 小男生盲測 c9bb003）：舊的書打勾、撒星星、莫莫歡呼，這麼久之後兩個選項才進來；
 * 選項進來之前點了不算（講舊篇時連點的手指、慶祝時亂點，不會一下就選掉）
 */
const CHOICE_IN_S = 1.1
const ARM_MS = 1300
/** 手：先指新的書，再指回家（T-141：兩個都可以選，手兩邊都指）；之後每 8 秒再輪一次 */
const HAND_MS = 2000
const HAND_SWAP_MS = 2400
const HAND_AGAIN_MS = 8000
/** 選了再一篇：喘口氣多久才開始講新的一篇（T-141） */
export const EN_BREATH_MS = 2800

/**
 * T-141（盲測 c9bb003）：慶祝停一拍才出選項；手兩邊輪流指（以前只指再一篇）；選了再一篇先喘口氣（新的書走到中間、
 * 後面一圈暖光吸一口氣、吐一口氣），約 3 秒後才開始講新篇（.en-breath）。喘口氣時亂點不會跳過，時間到一定往下。
 *
 * 舊篇講完（T-140，AI 小男生盲測 73d57c7：舊篇講完直接進新篇，中間沒有停頓，孩子第 2 篇一半就走了；
 * 家長：「一天兩篇的用意是在複習，如果可以取得平衡也可以」）：莫莫歡呼、念 "Yay! One more story?"，
 * 左邊舊篇的書打勾、撒星星；讓他自己選——大的「再一篇」（新的書，亮黃框、New!，手輕輕指著，預設）、「回家」（小房子，回首頁）。
 * 回家、返回鍵（回書架）：新篇這次不聽，今天再進故事、或下次，就從新篇開始。不選就一直等，手每 8 秒再指一次，不自己往下（T-118）。
 */
export function EnNext({ old, next, back, onGo }: { old: EnBookRow; next: EnBookRow; back: ReactNode; onGo: () => void }) {
  const home = (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || gone.current || performance.now() - at.current < ARM_MS) return
    gone.current = true
    sfx.tap()
    goTo({ name: 'home' }, { back: true })
  }
  const still = useReducedMotion()
  const at = useRef(performance.now())
  const gone = useRef(false)
  const [hand, setHand] = useState<{ at: 'more' | 'home'; n: number } | null>(null)
  const [breath, setBreath] = useState(false)
  const done = useRef(onGo)
  done.current = onGo
  useEffect(() => {
    // 完成的音效 StoryBook 的 enFinished 已經放了；這裡念 Yay! One more story?
    if (hasLine(EN_NEXT_KEY)) void say(EN_NEXT_KEY)
    const ts: number[] = []
    const round = (first: number) => {
      ts.push(window.setTimeout(() => setHand((h) => ({ at: 'more', n: (h?.n ?? 0) + 1 })), first))
      ts.push(window.setTimeout(() => setHand((h) => ({ at: 'home', n: (h?.n ?? 0) + 1 })), first + HAND_SWAP_MS))
    }
    round(HAND_MS)
    const b = window.setInterval(() => round(0), HAND_AGAIN_MS)
    return () => (ts.forEach(clearTimeout), clearInterval(b))
  }, [])
  // 喘口氣：時間到就開始講新篇
  useEffect(() => {
    if (!breath) return
    const k = window.setTimeout(() => done.current(), still ? 900 : EN_BREATH_MS)
    return () => clearTimeout(k)
  }, [breath, still])
  const go = (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || gone.current || performance.now() - at.current < ARM_MS) return
    gone.current = true
    sfx.pop()
    setBreath(true)
  }
  const inAt = still ? 0 : CHOICE_IN_S
  if (breath)
    return (
      <div className="book-replay en-between" data-en-next={next.day}>
        {back}
        <div className="en-breath" data-breath="">
          <motion.span
            className="en-breath-glow"
            aria-hidden="true"
            initial={still ? false : { scale: 0.7, opacity: 0 }}
            animate={still ? { opacity: 0.7 } : { scale: [0.7, 1.18, 0.96], opacity: [0, 0.95, 0.7] }}
            transition={{ duration: 2.4, ease: 'easeInOut', times: [0, 0.5, 1] }}
          />
          <motion.div
            className="en-cover is-new en-breath-book"
            data-en-book={next.day}
            initial={still ? false : { scale: 0.82, y: 18, opacity: 0.4 }}
            animate={still ? { opacity: 1 } : { scale: [0.82, 1.06, 1], y: [18, -4, 0], opacity: [0.4, 1, 1] }}
            transition={{ duration: 2.4, ease: 'easeInOut', times: [0, 0.5, 1] }}
          >
            <span className="en-cover-pic">
              <Pic name={next.pic} />
            </span>
            <span className="en-cover-new" aria-hidden="true">
              New!
            </span>
          </motion.div>
        </div>
        <div className="story-home-dino">
          <Dino who="momo" mood="happy" size="100%" />
        </div>
      </div>
    )
  return (
    <div className="book-replay en-between" data-en-next={next.day}>
      {back}
      <div className="en-between-row">
        <div className="en-cover is-done" data-en-book={old.day}>
          <span className="en-cover-pic">
            <Pic name={old.pic} />
          </span>
          <motion.span
            className="en-cover-check"
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
        <motion.button
          type="button"
          className="en-cover is-new en-choice-more"
          data-en-book={next.day}
          aria-label="再一篇"
          initial={still ? false : { x: 70, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: inAt }}
          onPointerDown={go}
        >
          <span className="en-cover-pic">
            <Pic name={next.pic} />
          </span>
          <span className="en-cover-new" aria-hidden="true">
            New!
          </span>
          <AnimatePresence>{hand?.at === 'more' && <Hand key="hand" x={62} y={62} tap={hand.n} size="34%" />}</AnimatePresence>
        </motion.button>
        <motion.button
          type="button"
          className="en-choice-home"
          aria-label="回家"
          initial={still ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: inAt + 0.3 }}
          onPointerDown={home}
        >
          <HomeIcon />
          <AnimatePresence>{hand?.at === 'home' && <Hand key="hand" x={62} y={62} tap={hand.n} size="70%" />}</AnimatePresence>
        </motion.button>
      </div>
      <div className="story-home-dino">
        <Dino who="momo" mood="cheer" size="100%" />
      </div>
    </div>
  )
}
