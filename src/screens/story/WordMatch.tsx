import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Hand } from '../../games/Demo'
import { firstFinger } from '../../games/NotYet'
import { say, sfx } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { Sparkles } from '../../ui/Sparkles'
import type { WordMatch as Q } from './en-pages'

/** 發呆多久手來指一次（小班段 8 秒），之後每隔這麼久再指一次；不自己往下 */
export const MATCH_HAND_MS = 8000
/** 找對了：一對字一起放大、跳一下，看一下才往下 */
const CHEER_MS = 1700

/**
 * 找一樣的英文字（T-129，跟中文課「找一樣的字」同一種玩法）：上面一張字卡（rabbit）、旁邊一個虛線空格，
 * 下面兩張（rabbit、turtle），點長得一樣的那張。字都是這一篇畫在頁上的角色或東西。
 * - 題目念 Find the same word!（字卡上的字找對了才念，Rabbit.）。
 * - demo（故事時間英文版每次都是，T-139）：手先點上面的字卡、再點下面一樣的那張（那張亮一圈），才輪到他；他搶著點照常算。
 * - 發呆 8 秒：手指一樣的那張點一下，之後每 8 秒再指一次。絕不自己往下。
 * - 點錯：那張搖一搖、淡下去（輕輕一聲、不扣分），手馬上指一樣的那張。
 * - 點對：那張飛到空格，兩張一樣的字並排、一起放大跳一下、亮綠框、撒星星，念那個字，看一下才往下。
 * - 連點、好幾根手指：只算第一下；找對之後再點都不算。
 */
export function WordMatch({ q, demo, wordKey, onDone }: { q: Q; demo: boolean; wordKey: string; onDone: () => void }) {
  const still = useReducedMotion()
  const done = useRef(false)
  const [off, setOff] = useState<number[]>([])
  const [shake, setShake] = useState<{ i: number; n: number } | null>(null)
  const [right, setRight] = useState(false)
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null)
  /** 手：指哪裡（target 上面的字卡、answer 一樣的那張）、第幾下 */
  const [hand, setHand] = useState<{ at: 'target' | 'answer'; n: number } | null>(null)
  const [hint, setHint] = useState(false)
  const [demoing, setDemoing] = useState(demo)
  const slot = useRef<HTMLSpanElement>(null)
  const cards = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const ts: number[] = []
    const later = (ms: number, f: () => void) => ts.push(window.setTimeout(f, ms))
    if (hasLine('storyen.same')) void say('storyen.same')
    if (demo) {
      // 示範：手點上面的字卡，再點下面一樣的那張（亮一圈），收掉才輪到他
      later(900, () => setHand({ at: 'target', n: 1 }))
      later(2200, () => {
        setHand({ at: 'answer', n: 2 })
        setHint(true)
      })
      later(3600, () => {
        setHand(null)
        setHint(false)
        setDemoing(false)
      })
    }
    // 發呆：每 8 秒手指一樣的那張點一下（示範的時間不算）
    const idle = window.setInterval(() => {
      if (!done.current) setHand((h) => ({ at: 'answer', n: (h?.n ?? 0) + 1 }))
    }, MATCH_HAND_MS)
    return () => {
      ts.forEach(clearTimeout)
      clearInterval(idle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (i: number) => {
    if (done.current) return
    setDemoing(false)
    setHint(false)
    if (i !== q.answer) {
      sfx.tap()
      setOff((o) => (o.includes(i) ? o : [...o, i]))
      setShake((s) => ({ i, n: (s?.n ?? 0) + 1 }))
      setHand((h) => ({ at: 'answer', n: (h?.n ?? 0) + 1 }))
      return
    }
    done.current = true
    setHand(null)
    const a = cards.current[i]?.getBoundingClientRect()
    const b = slot.current?.getBoundingClientRect()
    if (a && b) setFly({ x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) })
    window.setTimeout(() => {
      setRight(true)
      sfx.correct()
      if (hasLine(wordKey)) void say(wordKey)
    }, still ? 0 : 420)
    window.setTimeout(onDone, CHEER_MS + (still ? 0 : 420))
  }

  const cheer = right && !still ? { scale: [1, 1.18, 1], y: [0, -18, 0] } : { scale: 1, y: 0 }
  return (
    <div className={`en-match${demoing ? ' is-demo' : ''}`} data-match={q.word}>
      <div className="en-match-top">
        <motion.span className={`en-word is-target${right ? ' is-right' : ''}`} animate={cheer} transition={{ duration: 0.6, ease: 'easeOut' }}>
          {q.word}
        </motion.span>
        <span ref={slot} className={`en-word is-slot${right ? ' is-filled' : ''}`} aria-hidden="true" />
        {right && (
          <span className="en-match-stars" aria-hidden="true">
            <Sparkles count={12} />
          </span>
        )}
      </div>
      <div className="en-match-options">
        {q.options.map((w, i) => {
          const isAnswer = i === q.answer
          const moved = isAnswer && fly
          return (
            <motion.button
              key={i}
              ref={(el) => {
                cards.current[i] = el
              }}
              type="button"
              className={`en-word is-option${off.includes(i) ? ' is-off' : ''}${isAnswer && hint ? ' is-hint' : ''}${isAnswer && right ? ' is-right' : ''}`}
              data-answer={isAnswer ? '' : undefined}
              aria-label={w}
              animate={
                moved
                  ? { x: fly.x, y: fly.y, ...(right && !still ? { scale: [1, 1.18, 1] } : {}) }
                  : shake?.i === i && !still
                    ? { x: [0, -12, 12, -8, 6, 0] }
                    : { x: 0, y: 0 }
              }
              transition={moved ? { duration: still ? 0 : 0.42, ease: 'easeOut', scale: { duration: 0.6, delay: 0.42 } } : { duration: 0.45 }}
              onPointerDown={(e) => {
                if (firstFinger(e.nativeEvent)) pick(i)
              }}
            >
              {w}
            </motion.button>
          )
        })}
      </div>
      <AnimatePresence>
        {hand && !right && <Hand key="hand" x={hand.at === 'target' ? 34 : q.answer === 0 ? 30 : 70} y={hand.at === 'target' ? 30 : 74} tap={hand.n} size="9cqmin" />}
      </AnimatePresence>
    </div>
  )
}
