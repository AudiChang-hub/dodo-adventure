import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink } from './Ink'
import { PenArt, easeInOut, tween } from '../Demo'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef } from '../../content/games'
import { level, markPlayed, needsDemo, plays, reportLevel, pickPreferred } from '../../lib/adaptive'
import { themeNow } from '../../lib/theme-play'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { praiseKey, wait } from '../lines'
import { useIdle } from '../idle'

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

/**
 * 連點成圖：照數字順序連起來，最後會變出一個形狀。
 * 第一次玩（或沒連過的圖）先「Watch me!」：筆從 1 連到 2，再把線擦掉換孩子從 1 開始。
 */
export function DotsGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [pic, setPic] = useState<Pic>(PICS[0][0])
  const [next, setNext] = useState(1)
  const [reveal, setReveal] = useState(false)
  /** 示範時筆尖的位置；null 表示沒有在示範 */
  const [pen, setPen] = useState<{ x: number; y: number } | null>(null)
  /** 示範中正在拉的那一段線：從上一點拉到筆尖 */
  const [drag, setDrag] = useState(false)
  const nextRef = useRef(1)
  const picRef = useRef(pic)
  const wrongTouches = useRef(0)
  const lastWrong = useRef(-1)
  const t0 = useRef(0)
  const lv = useRef(1)
  const live = useRef(true)
  const first = useRef(0)
  const used = useRef<string[]>([])
  const busy = useRef(false)
  const demos = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)
  const idle = useIdle()
  /** 閒置第二段提示：下一個點慢慢亮起來 */
  const [nudge, setNudge] = useState(false)

  const showMe = async (p: Pic) => {
    const s = performance.now()
    demos.current++
    const [a, b] = p.pts
    const alive = () => live.current
    // 筆從畫面中間飄到 1
    const from = { x: 500, y: 330 }
    setPen(from)
    await say('teach.watch.dodo')
    if (!live.current) return
    await tween(650, (f) => setPen({ x: from.x + (a[0] - from.x) * f, y: from.y + (a[1] - from.y) * f }), alive, easeInOut)
    if (!live.current) return
    nextRef.current = 2
    setNext(2)
    sfx.count(1)
    await say('dodo.num.1')
    if (!live.current) return
    // 從 1 拉一條線到 2
    setDrag(true)
    await tween(1100, (f) => setPen({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f }), alive, easeInOut)
    if (!live.current) return
    setDrag(false)
    nextRef.current = 3
    setNext(3)
    sfx.count(2)
    await say('dodo.num.2')
    if (!live.current) return
    await wait(450)
    setPen(null)
    nextRef.current = 1
    setNext(1)
    void logTeach({ station: 'draw', game: def.id, itemId: p.id, skill: `dots:${p.id}`, level: lv.current, ms: Math.round(performance.now() - s) })
    await say('teach.turn.dodo')
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    const pool = PICS.slice(0, lv.current).flat()
    const p = pickPreferred(pool.filter((x) => themeNow()?.dots?.includes(x.id)), pool, (x) => `dots:${x.id}`, pool.filter((x) => used.current.includes(x.id)))
    used.current.push(p.id)
    picRef.current = p
    setPic(p)
    nextRef.current = 1
    setNext(1)
    setReveal(false)
    wrongTouches.current = 0
    // 要示範的話，示範完才換孩子連；不示範就跟以前一樣，邊聽邊可以開始
    const show = demos.current < 1 && needsDemo(firstPlay.current && i === 0, `dots:${p.id}`)
    busy.current = show
    idle.stop()
    setNudge(false)
    t0.current = performance.now()
    if (i === 0) await say(def.intro)
    if (!live.current) return
    if (show) {
      await showMe(p)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
    }
    // 閒置：15 秒再唸一次題目 → 再 15 秒下一個點慢慢亮起來 → 之後安靜
    if (picRef.current === p && nextRef.current <= p.pts.length) idle.start({ repeat: () => void say(def.intro), hint: () => setNudge(true) })
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      start(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = async () => {
    const p = picRef.current
    idle.stop()
    setReveal(true)
    sfx.hatch()
    const good = wrongTouches.current <= 1
    if (good) first.current++
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: p.id,
      skill: `dots:${p.id}`,
      phase: 'quiz',
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
    if (busy.current) return
    const p = picRef.current
    const n = nextRef.current
    if (n > p.pts.length) return
    // 有畫線就重新計時
    idle.poke()
    p.pts.forEach(([x, y], i) => {
      if (Math.hypot(pt.x - x, pt.y - y) > HIT) return
      if (i + 1 === n) {
        nextRef.current = n + 1
        setNext(n + 1)
        setNudge(false)
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
  const tail = drag && pen && done >= 1 ? `${pts[done - 1][0]},${pts[done - 1][1]} ${pen.x},${pen.y}` : ''
  return (
    <Shell station="draw" mood="idle" progress={{ total: ROUNDS, done: r }} onExit={onExit} hideHost>
      <div key={r} style={{ position: 'absolute', inset: '0 4% 4%' }}>
        <svg viewBox="0 0 1000 600" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          <motion.polygon points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill={pic.fill} initial={false} animate={{ opacity: reveal ? 1 : 0, scale: reveal ? [0.9, 1.05, 1] : 0.9 }} style={{ transformOrigin: '500px 300px' }} />
          <polyline points={reveal ? lines + ` ${pts[0][0]},${pts[0][1]}` : lines} fill="none" stroke="#2E2A25" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          {tail && <polyline points={tail} fill="none" stroke="#2E2A25" strokeWidth={10} strokeLinecap="round" />}
          {pts.map(([x, y], i) => {
            const n = i + 1
            const isNext = n === next
            const isDone = n < next
            return (
              <g key={i}>
                {isNext && nudge && !pen && <circle className="nudge-path" cx={x} cy={y} r={78} fill="#F1D27C" />}
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
          {pen && (
            <g transform={`translate(${pen.x} ${pen.y})`}>
              <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}>
                <PenArt scale={1.6} />
              </motion.g>
            </g>
          )}
        </svg>
        {reveal && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10 }}>
            <Sparkles count={16} />
          </div>
        )}
        <Ink w={1000} h={600} color="rgba(46,42,37,0.35)" size={14} ink={!pen} onDown={touch} onMove={touch} />
      </div>
    </Shell>
  )
}
