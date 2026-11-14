import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { firstFinger } from '../../games/NotYet'
import { Hand } from '../../games/Demo'
import { wait } from '../../games/lines'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { logTeach } from '../../lib/record'
import { turnStyle, type OptView } from './QuizParts'
import type { LessonLetter } from './data'

/**
 * 選擇題的玩法二：泡泡（T-127 B 案，docs/T-127-新鮮感提案.md 第四節 (a)）。
 * 字母（或圖）裝在透明的泡泡裡，從今天的世界下面飄上來、停在空中高高低低的地方；點今天的字母那一顆。
 * - 跟找卡片一樣的題目、對錯、示範的手、答錯的說明、作答紀錄（Quiz.tsx 管），只換外觀：
 *   大寫在大泡泡、小寫在小泡泡（T-100：聽不懂 big／little 也看得出哪個大）。
 * - 紙感螢幕（MOTION-2）：泡泡只在出來的時候飄上來一次，等他點的時候都不動；答對的那一顆泡泡破掉（外圈散開），字留著、打勾。
 * - 點錯：那一顆淡掉，不搖、不打叉（T-109）。
 * - 減少動態效果：直接出現，不飄。
 */
export function Bubbles({ v }: { v: OptView }) {
  const { q, i, still } = v
  const n = q.options.length
  /** 泡泡停的位置（選項區的百分比）：左右分開、高高低低，看得出是飄著的 */
  const spots = n >= 3 ? SPOTS3 : SPOTS2
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={i}
        className={`en-options en-bubbles ${v.boxClass}`}
        data-accepting={v.accept ? undefined : 'false'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3 } }}
        exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.1 } }}
      >
        {q.options.map((o, k) => {
          const s = spots[k % spots.length]
          const cheer = v.cheer(o)
          return (
            <motion.button
              key={o.id}
              ref={v.tile(o.id)}
              type="button"
              className={`${v.optClass(o, k)} en-bubble${cheer ? ' is-pop' : ''}`}
              style={{ ...turnStyle(k), left: `${s.x}%`, top: `${s.y}%` }}
              aria-label={o.text ?? o.id}
              // 關鍵字一念、選項出來的時候從下面飄上來（一次，錯開一點）；還沒出來時停在下面（看不到、點不到，.is-wait）；答對的放大一點。
              // 不動 opacity：淡入淡出、點錯淡掉都交給 CSS（.is-wait、.is-no）
              initial={false}
              animate={{ y: v.ready || still ? (cheer && !still ? -10 : 0) : 260, scale: cheer ? 1.08 : 1 }}
              transition={{ duration: still ? 0 : 1.1, delay: still || !v.ready ? 0 : 0.15 * k, ease: [0.22, 1, 0.36, 1] }}
              onPointerDown={(e) => {
                if (firstFinger(e.nativeEvent)) v.choose(o, e)
              }}
              onClick={(e) => {
                if (e.detail === 0) v.choose(o)
              }}
            >
              {v.face(o, k)}
              {/* 泡泡亮亮的反光 */}
              <i className="en-bubble-shine" aria-hidden="true" />
            </motion.button>
          )
        })}
      </motion.div>
    </AnimatePresence>
  )
}

const SPOTS2 = [
  { x: 34, y: 56 },
  { x: 68, y: 40 },
]
const SPOTS3 = [
  { x: 24, y: 54 },
  { x: 52, y: 34 },
  { x: 80, y: 58 },
]

/** 泡泡派對多久（T-147 設計稿 1-1：10 秒，不計分） */
export const PARTY_MS = 10_000
/** 一直沒點：手出來點給他看 */
const PARTY_HINT_MS = 3500

/** 派對的泡泡：滿畫面、大寫小寫輪流，大小高低錯開（百分比，泡泡中心） */
const PARTY = [
  { x: 14, y: 24, big: true },
  { x: 34, y: 52, big: false },
  { x: 47, y: 18, big: false },
  { x: 58, y: 56, big: true },
  { x: 74, y: 22, big: true },
  { x: 90, y: 58, big: false },
  { x: 42, y: 86, big: true },
  { x: 76, y: 86, big: true },
]

/**
 * 泡泡派對（T-147 英文門案 A）：一堂課的遊戲回合做完以後的慶祝，約 10 秒。
 * 滿畫面都是今天字母的泡泡（大寫在大泡泡、小寫在小泡泡），點破一顆就念一次字母名（A…）。不計分、不記作答（只記一筆 teach）。
 * - 紙感螢幕（MOTION-2、DISPLAY-1）：泡泡不飄、不動，只有點破的那一顆散開。
 * - 連點、多指都可以（每一顆只破一次，每根手指各點各的）；念字母時又點，念新的那一顆（不排隊）。
 * - 3.5 秒都沒點：手出來點一顆給他看（手只指，不幫他點破）。
 * - 全部點破、或 10 秒到：自己結束（這是慶祝，不等大箭頭；下一個畫面是下課的晚安道別）。
 * - 減少動態效果：點破的泡泡直接消失。
 */
export function BubbleParty({ letter, onDone }: { letter: LessonLetter; onDone: () => void }) {
  const still = useReducedMotion()
  const [gone, setGone] = useState<number[]>([])
  const [hand, setHand] = useState(false)
  const [tap, setTap] = useState(0)
  const live = useRef(true)
  const over = useRef(false)
  const t0 = useRef(performance.now())
  const end = () => {
    if (over.current || !live.current) return
    over.current = true
    void logTeach({ station: 'english', game: 'lesson-en-party', itemId: `party:${letter.L}`, skill: `abc:${letter.L}`, level: 1, ms: Math.round(performance.now() - t0.current) })
    onDone()
  }

  useEffect(() => {
    live.current = true
    t0.current = performance.now()
    void say('en.party')
    const stop = window.setTimeout(end, PARTY_MS)
    return () => {
      live.current = false
      clearTimeout(stop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 一直沒點：手出來指一顆、點一下（之後每 2.5 秒再點一下，點了第一顆就收起來）
  useEffect(() => {
    if (gone.length) return setHand(false)
    const a = window.setTimeout(() => {
      setHand(true)
      setTap((t) => t + 1)
    }, PARTY_HINT_MS)
    const b = window.setInterval(() => setTap((t) => t + 1), 2500)
    return () => {
      clearTimeout(a)
      clearInterval(b)
    }
  }, [gone.length])

  const pop = (i: number) => {
    if (over.current || gone.includes(i)) return
    const next = [...gone, i]
    setGone(next)
    sfx.pop()
    // 念新的那一顆（say 會停掉上一句，不排隊）
    void say(`en.pop.${letter.l}`)
    if (next.length >= PARTY.length)
      void (async () => {
        await wait(900)
        end()
      })()
  }

  // 離開時停掉字母名；派對自己結束（課接著說 You did it!）的不停，免得把那一句切掉（T-143）
  useEffect(
    () => () => {
      if (!over.current) stopSpeech()
    },
    [],
  )

  const first = PARTY.findIndex((_, i) => !gone.includes(i))
  return (
    <div className="en-party" data-popped={gone.length} data-total={PARTY.length}>
      {PARTY.map((b, i) => (
        <AnimatePresence key={i}>
          {!gone.includes(i) && (
            <motion.button
              type="button"
              className={`en-party-bubble${b.big ? ' is-upper' : ' is-lower'}`}
              style={{ left: `${b.x}%`, top: `${b.y}%` }}
              aria-label={b.big ? letter.L : letter.l}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: still ? 0 : 0.35, delay: still ? 0 : i * 0.05 } }}
              exit={still ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 1.6, transition: { duration: 0.35 } }}
              onPointerDown={() => pop(i)}
              onClick={(e) => {
                if (e.detail === 0) pop(i)
              }}
            >
              <span className="en-opt-letter">{b.big ? letter.L : letter.l}</span>
              <i className="en-bubble-shine" aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
      ))}
      <AnimatePresence>{hand && first >= 0 && <Hand key="party" x={PARTY[first].x} y={PARTY[first].y} tap={tap} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
    </div>
  )
}
