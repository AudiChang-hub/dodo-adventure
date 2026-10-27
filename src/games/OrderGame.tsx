import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { game as gameDef } from '../content/games'
import { level, markPlayed, reportLevel, unlockedNumbers } from '../lib/adaptive'
import { logAttempt } from '../lib/record'
import { say, sfx, stopSpeech } from '../lib/audio'
import { scatter } from './layout'
import { praiseKey, retryKey, wait } from './lines'
import type { Mood } from '../art/Dino'

const ROUNDS = 3
const TINTS = ['#F6DE95', '#F3C1B2', '#C9E4D4', '#D3E3F3', '#E2DAF1', '#F8DCC8']

/** 照順序：1、2、3…依序點數字，點對的數字會排到上面的小火車裡 */
export function OrderGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [k, setK] = useState(3)
  const [pos, setPos] = useState<{ x: number; y: number }[]>([])
  const [next, setNext] = useState(1)
  const [hint, setHint] = useState(false)
  const [shake, setShake] = useState(0)
  const [mood, setMood] = useState<Mood>('idle')
  const live = useRef(true)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const wrongs = useRef(0)
  const lv = useRef(1)
  const first = useRef(0)

  const start = async (i: number) => {
    lv.current = level(def.id)
    const n = Math.min([3, 4, 5, 6][lv.current - 1] + (lv.current === 4 ? Math.floor(Math.random() * 3) : 0), Math.max(5, unlockedNumbers()), 10)
    setK(n)
    setPos(scatter(n, n > 5 ? 5 : 4, 2).map((p) => ({ ...p, y: 28 + p.y * 0.7 })))
    setNext(1)
    setHint(false)
    setMood('idle')
    taps.current = []
    wrongs.current = 0
    t0.current = performance.now()
    await say(i === 0 ? def.intro : 'm.order.start')
  }

  useEffect(() => {
    live.current = true
    markPlayed(def.id)
    start(0)
    return () => {
      live.current = false
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async (n: number) => {
    if (n < next) return
    taps.current.push({ pick: String(n), ms: Math.round(performance.now() - t0.current) })
    if (n !== next) {
      wrongs.current++
      sfx.gentle()
      setShake(n)
      setTimeout(() => setShake(0), 450)
      if (wrongs.current >= 2) setHint(true)
      return void say(retryKey('bobo'), `m.findnum.${next}`)
    }
    sfx.count(n)
    setHint(false)
    setNext(n + 1)
    if (n < k) return void say(`m.num.${n}`)
    const firstTry = wrongs.current === 0
    if (firstTry) first.current++
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: `1-${k}`,
      skill: `order:${k}`,
      level: lv.current,
      options: Array.from({ length: k }, (_, i) => String(i + 1)),
      answer: Array.from({ length: k }, (_, i) => String(i + 1)).join(','),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: wrongs.current >= 2,
      metrics: { wrongTaps: wrongs.current },
    })
    reportLevel(def.id, firstTry, def.maxLevel)
    setMood('cheer')
    sfx.correct()
    await say(`m.num.${n}`, praiseKey('bobo'))
    await wait(400)
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  return (
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} onHost={() => say(`m.findnum.${Math.min(next, k)}`)}>
      <div key={r} style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', top: '2%', left: '50%', translate: '-50% 0', display: 'flex', gap: '1.4cqmin', padding: '1.6cqmin 2.4cqmin', borderRadius: 999, background: 'rgba(251,248,242,.7)' }}>
          {Array.from({ length: k }, (_, i) => (
            <div key={i} style={{ width: '8.5cqmin', aspectRatio: '1', borderRadius: '2cqmin', background: i + 1 < next ? TINTS[i % TINTS.length] : 'rgba(46,42,37,.06)', display: 'grid', placeItems: 'center' }}>
              {i + 1 < next && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="glyph num" style={{ fontSize: '5.5cqmin' }}>
                  {i + 1}
                </motion.span>
              )}
            </div>
          ))}
        </div>
        {pos.map((p, i) => {
          const n = i + 1
          if (n < next) return null
          return (
            <motion.button
              key={n}
              className={`tile${hint && n === next ? ' hint' : ''}`}
              aria-label={String(n)}
              style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: '19cqmin', translate: '-50% -50%', background: TINTS[i % TINTS.length] }}
              initial={{ scale: 0 }}
              animate={shake === n ? { x: [0, -12, 12, -6, 0], scale: 1 } : { scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 18, delay: shake === n ? 0 : i * 0.05 }}
              onPointerDown={() => tap(n)}
            >
              <div className="tile-in">
                <span className="glyph num">{n}</span>
              </div>
            </motion.button>
          )
        })}
      </div>
    </Shell>
  )
}
