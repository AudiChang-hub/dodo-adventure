import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Emoji } from '../art/Emoji'
import { game as gameDef } from '../content/games'
import { COUNT_ICONS } from '../content/park'
import { level, markPlayed, reportLevel } from '../lib/adaptive'
import { logAttempt } from '../lib/record'
import { say, sfx, stopSpeech } from '../lib/audio'
import { pick, rand, shuffle } from '../lib/random'
import { scatter } from './layout'
import { praiseKey, retryKey, wait } from './lines'
import type { Mood } from '../art/Dino'

const ROUNDS = 4
const RANGE: Record<number, [number, number]> = { 1: [1, 3], 2: [2, 5], 3: [4, 8], 4: [6, 10] }

interface Round {
  n: number
  icon: string
  pos: { x: number; y: number }[]
  choices: number[]
}

function makeRound(lv: number): Round {
  const [a, b] = RANGE[lv]
  const n = a + rand(b - a + 1)
  const others = shuffle([n - 1, n + 1, n + 2, n - 2].filter((x) => x >= 1 && x <= 10)).slice(0, 2)
  return { n, icon: pick(COUNT_ICONS), pos: scatter(n, n > 6 ? 5 : 4, n > 4 ? 2 : 1), choices: shuffle([n, ...others]) }
}

/** 點點數數：一個一個點，波波會跟著數；數完再選「總共幾個」 */
export function CountGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [round, setRound] = useState<Round | null>(null)
  const [counted, setCounted] = useState<number[]>([])
  const [ask, setAsk] = useState(false)
  const [wrong, setWrong] = useState<number[]>([])
  const [mood, setMood] = useState<Mood>('idle')
  const live = useRef(true)
  const busy = useRef(false)
  const t0 = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const extra = useRef(0)
  const lv = useRef(1)
  const first = useRef(0)

  const start = async (i: number) => {
    lv.current = level(def.id)
    const rd = makeRound(lv.current)
    setRound(rd)
    setCounted([])
    setAsk(false)
    setWrong([])
    setMood('idle')
    taps.current = []
    extra.current = 0
    t0.current = performance.now()
    busy.current = false
    if (i === 0) await say(def.intro)
    else await say('m.count.go')
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

  const finish = async (firstTry: boolean) => {
    if (!round) return
    if (firstTry) first.current++
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: String(round.n),
      skill: `count:${round.n}`,
      level: lv.current,
      options: lv.current >= 2 ? round.choices.map(String) : [],
      answer: String(round.n),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: Math.max(1, taps.current.length),
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { recountTaps: extra.current },
    })
    reportLevel(def.id, firstTry, def.maxLevel)
    setMood('cheer')
    sfx.correct()
    await say(praiseKey('bobo'))
    await wait(300)
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  const tapObj = async (i: number) => {
    if (!round || ask || busy.current) return
    if (counted.includes(i)) {
      extra.current++
      sfx.gentle()
      return
    }
    const next = [...counted, i]
    setCounted(next)
    sfx.count(next.length)
    if (next.length < round.n) return void say(`m.num.${next.length}`)
    busy.current = true
    await say(`m.num.${next.length}`, `m.total.${round.n}`)
    if (!live.current) return
    if (lv.current >= 2) {
      setAsk(true)
      busy.current = false
      t0.current = performance.now()
      await say('m.howmany')
    } else finish(true)
  }

  const tapChoice = async (n: number) => {
    if (!round || busy.current || wrong.includes(n)) return
    taps.current.push({ pick: String(n), ms: Math.round(performance.now() - t0.current) })
    if (n === round.n) {
      busy.current = true
      return finish(taps.current.length === 1)
    }
    sfx.gentle()
    setWrong((w) => [...w, n])
    await say(retryKey('bobo'))
  }

  return (
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} onHost={() => say(ask ? 'm.howmany' : 'm.count.go')}>
      {round && (
        <div key={r} style={{ position: 'absolute', inset: 0 }}>
          {round.pos.map((p, i) => {
            const order = counted.indexOf(i)
            return (
              <motion.button
                key={i}
                aria-label={`第 ${i + 1} 個`}
                style={{ position: 'absolute', left: `${p.x}%`, top: `${ask ? p.y * 0.55 : p.y}%`, width: round.n > 6 ? '12cqmin' : '17cqmin', aspectRatio: '1', translate: '-50% -50%' }}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: order >= 0 ? 0.92 : 1, rotate: 0, y: order >= 0 ? [0, -26, 0] : 0, opacity: order >= 0 ? 0.62 : 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16, delay: order >= 0 ? 0 : i * 0.06 }}
                onPointerDown={() => tapObj(i)}
              >
                <Emoji name={round.icon} />
                {order >= 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ position: 'absolute', right: '-10%', top: '-12%', width: '44%', aspectRatio: '1', borderRadius: '50%', background: 'var(--ink)', color: 'var(--card)', display: 'grid', placeItems: 'center', fontFamily: 'Fredoka', fontWeight: 600, fontSize: 'min(5cqmin, 40px)' }}
                  >
                    {order + 1}
                  </motion.span>
                )}
              </motion.button>
            )
          })}
          {ask && (
            <div className="options" style={{ top: '46%', alignItems: 'flex-start' }}>
              {round.choices.map((n, i) => (
                <motion.button
                  key={n}
                  className="tile"
                  style={{ width: 'min(24cqh, 18cqw)' }}
                  aria-label={String(n)}
                  initial={{ y: 40, opacity: 0 }}
                  animate={wrong.includes(n) ? { x: [0, -12, 12, 0], opacity: 0.45 } : { y: 0, opacity: 1 }}
                  transition={{ delay: wrong.includes(n) ? 0 : i * 0.08 }}
                  onPointerDown={() => tapChoice(n)}
                >
                  <div className="tile-in">
                    <span className="glyph num">{n}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}
