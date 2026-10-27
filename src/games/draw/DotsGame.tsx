import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink } from './Ink'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef } from '../../content/games'
import { level, markPlayed, reportLevel, pickTarget } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { praiseKey, wait } from '../lines'

interface Pic {
  id: string
  fill: string
  pts: [number, number][]
}

function star(): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? 105 : 250
    return [500 + Math.cos(a) * r, 320 + Math.sin(a) * r] as [number, number]
  })
}

const PICS: Pic[][] = [
  [
    { id: 'triangle', fill: '#F1D27C', pts: [[500, 90], [790, 500], [210, 500]] },
    { id: 'square', fill: '#A3C4E4', pts: [[300, 120], [700, 120], [700, 520], [300, 520]] },
  ],
  [
    { id: 'diamond', fill: '#BFB2DF', pts: [[500, 70], [780, 300], [500, 530], [220, 300]] },
    { id: 'house', fill: '#E99A84', pts: [[300, 520], [300, 280], [500, 100], [700, 280], [700, 520]] },
  ],
  [
    { id: 'boat', fill: '#93BADF', pts: [[220, 400], [480, 400], [480, 80], [760, 400], [800, 400], [690, 530], [330, 530]] },
    { id: 'heart', fill: '#F09DB9', pts: [[500, 200], [600, 100], [740, 120], [790, 250], [500, 530], [210, 250], [260, 120], [400, 100]] },
  ],
  [
    { id: 'fish', fill: '#F0B088', pts: [[160, 300], [360, 160], [600, 190], [740, 280], [880, 170], [880, 430], [740, 340], [600, 420], [360, 450]] },
    { id: 'star', fill: '#F1D27C', pts: star() },
  ],
]

const ROUNDS = 2
const HIT = 62

/** 連點成圖：照數字順序連起來，最後會變出一個形狀 */
export function DotsGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [pic, setPic] = useState<Pic>(PICS[0][0])
  const [next, setNext] = useState(1)
  const [reveal, setReveal] = useState(false)
  const nextRef = useRef(1)
  const picRef = useRef(pic)
  const wrongTouches = useRef(0)
  const lastWrong = useRef(-1)
  const t0 = useRef(0)
  const lv = useRef(1)
  const live = useRef(true)
  const first = useRef(0)
  const used = useRef<string[]>([])

  const start = async (i: number) => {
    lv.current = level(def.id)
    const pool = PICS.slice(0, lv.current).flat()
    const p = pickTarget(pool, (x) => `dots:${x.id}`, pool.filter((x) => used.current.includes(x.id)))
    used.current.push(p.id)
    picRef.current = p
    setPic(p)
    nextRef.current = 1
    setNext(1)
    setReveal(false)
    wrongTouches.current = 0
    t0.current = performance.now()
    if (i === 0) await say(def.intro)
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

  const finish = async () => {
    const p = picRef.current
    setReveal(true)
    sfx.hatch()
    const good = wrongTouches.current <= 1
    if (good) first.current++
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: p.id,
      skill: `dots:${p.id}`,
      level: lv.current,
      options: [],
      answer: '',
      taps: [],
      firstTryCorrect: good,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { dots: p.pts.length, wrongTouches: wrongTouches.current },
    })
    reportLevel(def.id, good, def.maxLevel)
    await say('d.dots.done', `d.dots.is.${p.id}`, praiseKey('dodo'))
    await wait(600)
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  const touch = (pt: { x: number; y: number }) => {
    const p = picRef.current
    const n = nextRef.current
    if (n > p.pts.length) return
    p.pts.forEach(([x, y], i) => {
      if (Math.hypot(pt.x - x, pt.y - y) > HIT) return
      if (i + 1 === n) {
        nextRef.current = n + 1
        setNext(n + 1)
        sfx.count(n)
        if (n === p.pts.length) void finish()
        else void say(`dodo.num.${n}`)
      } else if (i + 1 > n && lastWrong.current !== i) {
        lastWrong.current = i
        wrongTouches.current++
      }
    })
  }

  const done = next - 1
  const pts = pic.pts
  const lines = pts.slice(0, Math.max(0, done)).map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <Shell station="draw" mood="idle" progress={{ total: ROUNDS, done: r }} onExit={onExit} hideHost>
      <div key={r} style={{ position: 'absolute', inset: '0 4% 4%' }}>
        <svg viewBox="0 0 1000 600" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          <motion.polygon points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill={pic.fill} initial={false} animate={{ opacity: reveal ? 1 : 0, scale: reveal ? [0.9, 1.05, 1] : 0.9 }} style={{ transformOrigin: '500px 300px' }} />
          <polyline points={reveal ? lines + ` ${pts[0][0]},${pts[0][1]}` : lines} fill="none" stroke="#2E2A25" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          {pts.map(([x, y], i) => {
            const n = i + 1
            const isNext = n === next
            const isDone = n < next
            return (
              <g key={i}>
                {isNext && <motion.circle cx={x} cy={y} r={34} fill="none" stroke="#6FAE86" strokeWidth={8} animate={{ r: [30, 44, 30], opacity: [1, 0.35, 1] }} transition={{ duration: 1.3, repeat: Infinity }} />}
                <circle cx={x} cy={y} r={isNext ? 26 : 20} fill={isDone ? '#2E2A25' : isNext ? '#6FAE86' : '#FBF8F2'} stroke="#2E2A25" strokeWidth={5} />
                {!reveal && (
                  <text x={x + (x < 500 ? -48 : 48)} y={y - 30} textAnchor="middle" fontFamily="Fredoka" fontWeight={600} fontSize={46} fill={isDone ? '#A39B8E' : '#2E2A25'}>
                    {n}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {reveal && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10 }}>
            <Sparkles count={16} />
          </div>
        )}
        <Ink w={1000} h={600} color="rgba(46,42,37,0.35)" size={14} onDown={touch} onMove={touch} />
      </div>
    </Shell>
  )
}
