import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Dino } from '../../art/Dino'
import { firstFinger } from '../../games/NotYet'
import { sfx } from '../../lib/audio'
import { Pic } from '../../lessons/chinese/Pic'
import type { EnBookRow } from './en-book'
import './en-flow.css'

/** 「再一篇」的書多久之後才淡淡地出現（先慶祝讀完了）；出現之前點了不算（舊篇最後一題連點的手指不會一下就點到） */
const OFFER_IN_S = 1.1
const ARM_MS = 1300
/** 點了書：喘口氣多久才開始講新的一篇（T-141） */
export const EN_BREATH_MS = 2800

/**
 * 複習（舊篇）講完的「再一篇」（T-142，家長 2026-11-12：第二篇改成提議；盲測 9231aa6：孩子舊篇撐得完，接著上新篇就離開）：
 * 舊篇講完照常是「讀完了」（StoryBook 的 DoneView：再聽一次、回書架），這就算今天聽完；旁邊放一本小小的新書——
 * 淡淡的、沒有黃框、沒有 New!、沒有手、不念 One more story、不會跳，看得到但不搶眼。孩子主動點了才講新篇：
 * 先喘口氣（新的書走到中間、後面一圈暖光吸一口氣、吐一口氣，T-141），約 3 秒後才開始講。喘口氣時亂點不會跳過，時間到一定往下。
 * 沒點（回書架、回首頁）：新篇這次不聽，這一次課的複習記下來了（en-book 的 review），下次進故事直接講新篇。
 * 放在 DoneView 裡面（.book-done 是整個畫面），喘口氣的那一層蓋住整個讀完了。
 */
export function EnOffer({ next, onGo }: { next: EnBookRow; onGo: () => void }) {
  const still = useReducedMotion()
  const at = useRef(performance.now())
  const [breath, setBreath] = useState(false)
  const done = useRef(onGo)
  done.current = onGo
  useEffect(() => {
    if (!breath) return
    const k = window.setTimeout(() => done.current(), still ? 900 : EN_BREATH_MS)
    return () => clearTimeout(k)
  }, [breath, still])
  const go = (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || breath || performance.now() - at.current < ARM_MS) return
    sfx.pop()
    setBreath(true)
  }
  return (
    <>
      <motion.button
        type="button"
        className="en-offer"
        data-en-book={next.day}
        aria-label="再一篇"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: still ? 0 : OFFER_IN_S }}
        onPointerDown={go}
      >
        <span className="en-offer-pic">
          <Pic name={next.pic} />
        </span>
      </motion.button>
      {breath && (
        <motion.div className="en-breath-cover" initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
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
            </motion.div>
          </div>
          <div className="story-home-dino">
            <Dino who="momo" mood="happy" size="100%" />
          </div>
        </motion.div>
      )}
    </>
  )
}
