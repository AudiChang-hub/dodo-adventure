import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Hand } from '../../games/Demo'
import { firstFinger } from '../../games/NotYet'
import { say, sfx } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { Sparkles } from '../../ui/Sparkles'
import type { WordMatch as Q } from './en-pages'
import './en-flow.css'

/** 發呆多久手來指一次（小班段 8 秒），之後每隔這麼久再指一次；不自己往下 */
export const MATCH_HAND_MS = 8000
/** 找對了：一對字一起放大、跳一下，看一下才往下 */
const CHEER_MS = 1700

/**
 * 示範一輪的時間表（T-141，AI 小男生盲測 c9bb003 故事 2：到「Find the same word!」「我一直點都不知道要幹嘛」就離開了。
 * 以前手只點上面、點下面，3.6 秒就收起來，8 秒後才再來；看不出「把一樣的放到空格」）：
 * 手點上面的字（那張跳一下）→ 手點下面一樣的那張（亮一圈）→ 手把它帶到空格（一張一模一樣的字從下面飛上去，兩張並排亮綠框）→
 * 飛上去的那張淡掉、空格空出來 → 輪到他：手留在一樣的那張一直輕輕點、那張一直亮著，等他做第一下（念 Your turn.）。
 */
const DEMO = { target: 900, answer: 2100, carry: 2900, pair: 3700, turn: 4700 }
/** 輪到他、還沒動手：手多久點一次一樣的那張（帶他做第一下） */
const LEAD_MS = 2400
/** 示範時飛上去的時間 */
const CARRY_S = 0.7
/** 輪到你（莫莫，現有的台詞） */
const TURN_KEY = 'teach.turn.momo'

/**
 * 找一樣的英文字（T-129，跟中文課「找一樣的字」同一種玩法）：上面一張字卡（rabbit）、旁邊一個虛線空格，
 * 下面兩張（rabbit、turtle），點長得一樣的那張。字都是這一篇畫在頁上的角色或東西。
 * - 題目念 Find the same word!（字卡上的字找對了才念，Rabbit.）。
 * - demo（故事時間英文版每次都是，T-139）：手先完整做一輪（DEMO，T-141），再帶他做第一下；他搶著點照常算（示範馬上收起來）。
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
  /** 手：指哪裡（target 上面的字卡、answer 一樣的那張、slot 空格）、第幾下 */
  const [hand, setHand] = useState<{ at: 'target' | 'answer' | 'slot'; n: number } | null>(null)
  const [hint, setHint] = useState(false)
  const [demoing, setDemoing] = useState(demo)
  /** 示範時上面的字被手點了（跳一下） */
  const [poked, setPoked] = useState(0)
  /** 示範時從下面飛到空格的那張（位置是 .en-match 裡的 px；dx、dy 是要飛多遠）；pair：到了，兩張並排亮綠框 */
  const [ghost, setGhost] = useState<{ left: number; top: number; w: number; h: number; dx: number; dy: number; pair: boolean } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLSpanElement>(null)
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const timers = useRef<number[]>([])
  /** 輪到他、還沒動手：手一直帶他做第一下 */
  const leading = useRef(false)
  const lead = useRef(0)

  const stopDemo = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    leading.current = false
    clearInterval(lead.current)
    setGhost(null)
    setDemoing(false)
  }

  useEffect(() => {
    const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
    if (hasLine('storyen.same')) void say('storyen.same')
    if (demo) {
      later(DEMO.target, () => {
        setHand({ at: 'target', n: 1 })
        setPoked((n) => n + 1)
      })
      later(DEMO.answer, () => {
        setHand({ at: 'answer', n: 2 })
        setHint(true)
      })
      // 手把它帶到空格：一張一模一樣的字從下面飛上去（真的那張留在原地，等一下給他點）
      later(DEMO.carry, () => {
        const a = cards.current[q.answer]?.getBoundingClientRect()
        const b = slot.current?.getBoundingClientRect()
        const c = box.current?.getBoundingClientRect()
        if (a && b && c)
          setGhost({
            left: a.left - c.left,
            top: a.top - c.top,
            w: a.width,
            h: a.height,
            dx: b.left + b.width / 2 - (a.left + a.width / 2),
            dy: b.top + b.height / 2 - (a.top + a.height / 2),
            pair: false,
          })
        setHand({ at: 'slot', n: 3 })
      })
      later(DEMO.pair, () => {
        setGhost((g) => (g ? { ...g, pair: true } : g))
        sfx.pop()
      })
      // 輪到他：飛上去的那張淡掉、空格空出來；手回到一樣的那張一直輕輕點、那張一直亮著，等他做第一下
      later(DEMO.turn, () => {
        setGhost(null)
        setDemoing(false)
        setHint(true)
        setHand({ at: 'answer', n: 4 })
        if (hasLine(TURN_KEY)) void say(TURN_KEY)
        leading.current = true
        lead.current = window.setInterval(() => {
          if (leading.current && !done.current) setHand((h) => ({ at: 'answer', n: (h?.n ?? 0) + 1 }))
        }, LEAD_MS)
      })
    }
    // 發呆：每 8 秒手指一樣的那張點一下（示範、帶第一下的時候不算）
    const idle = window.setInterval(() => {
      if (!done.current && !leading.current) setHand((h) => ({ at: 'answer', n: (h?.n ?? 0) + 1 }))
    }, MATCH_HAND_MS)
    return () => {
      timers.current.forEach(clearTimeout)
      clearInterval(lead.current)
      clearInterval(idle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (i: number) => {
    if (done.current) return
    stopDemo()
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

  const cheer = right && !still ? { scale: [1, 1.18, 1], y: [0, -18, 0] } : poked && !still && demoing ? { scale: [1, 1.12, 1], y: [0, -10, 0] } : { scale: 1, y: 0 }
  const handAt =
    hand?.at === 'target' ? { x: 34, y: 30 } : hand?.at === 'slot' ? { x: 70, y: 30 } : { x: q.answer === 0 ? 30 : 70, y: 74 }
  return (
    <div ref={box} className={`en-match${demoing ? ' is-demo' : ''}`} data-match={q.word}>
      <div className="en-match-top">
        <motion.span
          key={`t${poked}`}
          className={`en-word is-target${right || ghost?.pair ? ' is-right' : ''}`}
          animate={cheer}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {q.word}
        </motion.span>
        <span ref={slot} className={`en-word is-slot${right || ghost?.pair ? ' is-filled' : ''}`} aria-hidden="true" />
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
      {/* 示範：一模一樣的一張從下面飛到空格（看的，點不到） */}
      <AnimatePresence>
        {ghost && (
          <motion.span
            key="ghost"
            className={`en-word is-ghost${ghost.pair ? ' is-right' : ''}`}
            aria-hidden="true"
            style={{ left: ghost.left, top: ghost.top, width: ghost.w, height: ghost.h }}
            initial={{ x: 0, y: 0, opacity: 0.9 }}
            animate={{ x: ghost.dx, y: ghost.dy, opacity: 1, ...(ghost.pair && !still ? { scale: [1, 1.12, 1] } : {}) }}
            exit={{ opacity: 0, transition: { duration: still ? 0 : 0.35 } }}
            transition={{ duration: still ? 0 : CARRY_S, ease: 'easeInOut', scale: { duration: 0.5 } }}
          >
            {q.word}
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>{hand && !right && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand.n} size="9cqmin" />}</AnimatePresence>
    </div>
  )
}
