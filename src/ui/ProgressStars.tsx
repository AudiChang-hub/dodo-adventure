import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { onCheer } from '../lib/achievements'
import { sfx } from '../lib/audio'
import { StarShape } from './StickerArt'

// 孩子最後點的位置：答對的星星從他點的地方飛出去，看得出「是我點對的那一下換來的」
let last = { x: 0, y: 0, t: 0 }
if (typeof window !== 'undefined')
  window.addEventListener(
    'pointerdown',
    (e) => {
      last = { x: e.clientX, y: e.clientY, t: performance.now() }
    },
    { capture: true, passive: true },
  )

/** 點了之後多久以內答對，星星才從點的地方飛出（太久就從畫面中間） */
const FROM_TAP_MS = 4000
/** 飛行時間：比稱讚的語音短，落下時剛好在說「Great job!」 */
const FLY_S = 0.7

interface Flight {
  id: number
  i: number
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/**
 * 每個遊戲上方的進度列：一題一格。
 * 答對（遊戲說稱讚）時，一顆星星從孩子點的地方飛進這一格；整排慢慢變成星星，一局做了多少看得見。
 * 只有星星會增加，不會因為答錯而變少或變灰。
 */
export function ProgressStars({ total, done }: { total: number; done: number }) {
  /** 已經有星星的格子（包含飛行中、預定好的） */
  const claimed = useRef(new Set<number>())
  const [landed, setLanded] = useState<number[]>([])
  const [pulse, setPulse] = useState<{ i: number; n: number } | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const dots = useRef<(HTMLElement | null)[]>([])
  const doneRef = useRef(done)
  doneRef.current = done
  const seq = useRef(0)

  const land = (i: number) => {
    setLanded((l) => (l.includes(i) ? l : [...l, i]))
    setPulse({ i, n: ++seq.current })
  }

  useEffect(
    () =>
      onCheer(() => {
        const i = doneRef.current
        if (i >= total) return
        // 同一題第二次稱讚（一起練之後的自己答）：已經有星星了，輕輕跳一下就好
        if (claimed.current.has(i)) return setPulse({ i, n: ++seq.current })
        const el = dots.current[i]
        if (!el) return
        claimed.current.add(i)
        const r = el.getBoundingClientRect()
        const recent = performance.now() - last.t < FROM_TAP_MS
        const from = recent ? { x: last.x, y: last.y } : { x: window.innerWidth / 2, y: window.innerHeight * 0.55 }
        setFlights((f) => [...f, { id: ++seq.current, i, from, to: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }])
      }),
    [total],
  )

  // 沒有經過稱讚就換題的（例如教豆豆的「謝謝你」）：換題時直接補上星星，每一題都有
  useEffect(() => {
    for (let i = 0; i < Math.min(done, total); i++)
      if (!claimed.current.has(i)) {
        claimed.current.add(i)
        land(i)
      }
  }, [done, total])

  return (
    <div className="progress" aria-label={`第 ${Math.min(done + 1, total)} 題，共 ${total} 題`}>
      {Array.from({ length: total }, (_, i) => {
        const star = landed.includes(i)
        return (
          <i key={i} ref={(el) => void (dots.current[i] = el)} className={star ? 'star' : i < done ? 'on' : i === done ? 'now' : undefined}>
            {star && (
              <motion.span
                key={pulse?.i === i ? pulse.n : 0}
                className="progress-star"
                initial={{ scale: 0.6 }}
                animate={{ scale: [0.6, 1.35, 1] }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <StarShape />
              </motion.span>
            )}
          </i>
        )
      })}
      {flights.length > 0 &&
        createPortal(
          flights.map((f) => {
            const midY = Math.min(f.from.y, f.to.y) - 70
            const midX = f.from.x + (f.to.x - f.from.x) * 0.35
            return (
              <motion.div
                key={f.id}
                className="star-flight"
                aria-hidden="true"
                initial={{ x: f.from.x, y: f.from.y, scale: 0.4, rotate: -30, opacity: 0 }}
                animate={{ x: [f.from.x, midX, f.to.x], y: [f.from.y, midY, f.to.y], scale: [0.4, 1.25, 0.7], rotate: [-30, 40, 144], opacity: [0, 1, 1] }}
                transition={{ duration: FLY_S, ease: [0.45, 0, 0.25, 1], times: [0, 0.45, 1] }}
                onAnimationComplete={() => {
                  setFlights((fs) => fs.filter((x) => x.id !== f.id))
                  land(f.i)
                  sfx.star()
                }}
              >
                <StarShape />
              </motion.div>
            )
          }),
          document.body,
        )}
    </div>
  )
}
