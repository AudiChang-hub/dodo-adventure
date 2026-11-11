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

/** 剛出來多久內點了不算（講舊篇時連點的手指不會一下就跳過） */
const ARM_MS = 500
/** 手來指新的書 */
const HAND_MS = 1200

/**
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
  const [hand, setHand] = useState(0)
  useEffect(() => {
    // 完成的音效 StoryBook 的 enFinished 已經放了；這裡念 Yay! Now a new story!
    if (hasLine(EN_NEXT_KEY)) void say(EN_NEXT_KEY)
    const a = window.setTimeout(() => setHand((n) => n + 1), HAND_MS)
    const b = window.setInterval(() => setHand((n) => n + 1), 8000)
    return () => (clearTimeout(a), clearInterval(b))
  }, [])
  const go = (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || gone.current || performance.now() - at.current < ARM_MS) return
    gone.current = true
    sfx.pop()
    onGo()
  }
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
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
          onPointerDown={go}
        >
          <span className="en-cover-pic">
            <Pic name={next.pic} />
          </span>
          <span className="en-cover-new" aria-hidden="true">
            New!
          </span>
          <AnimatePresence>{hand > 0 && <Hand key="hand" x={62} y={62} tap={hand} size="34%" />}</AnimatePresence>
        </motion.button>
        <motion.button
          type="button"
          className="en-choice-home"
          aria-label="回家"
          initial={still ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.9 }}
          onPointerDown={home}
        >
          <HomeIcon />
        </motion.button>
      </div>
      <div className="story-home-dino">
        <Dino who="momo" mood="cheer" size="100%" />
      </div>
    </div>
  )
}
