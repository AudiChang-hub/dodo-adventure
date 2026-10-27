import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Hand } from './Demo'
import { game as gameDef } from '../content/games'
import { level, markPlayed, needsDemo, plays, reportLevel, unlockedNumbers } from '../lib/adaptive'
import { logAttempt, logTeach } from '../lib/record'
import { say, sfx, stopSpeech } from '../lib/audio'
import { scatter } from './layout'
import { praiseKey, retryKey, wait } from './lines'
import { useIdle } from './idle'
import type { Mood } from '../art/Dino'

const ROUNDS = 3
const TINTS = ['#F6DE95', '#F3C1B2', '#C9E4D4', '#D3E3F3', '#E2DAF1', '#F8DCC8']

/**
 * 照順序：1、2、3…依序點數字，點對的數字會排到上面的小火車裡。
 * 第一次玩（或沒學過的長度）先由波波示範點 1、2、3，再換孩子。
 */
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
  const busy = useRef(true)
  const nextRef = useRef(1)
  const idle = useIdle()
  const demos = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)
  /** 示範中：手指指著哪個數字（null 表示沒有在示範） */
  const [finger, setFinger] = useState<number | null>(null)
  const [press, setPress] = useState(0)

  /** 波波示範點 1、2、3，再把數字放回去換孩子 */
  const demo = async (n: number) => {
    const s = performance.now()
    demos.current++
    setMood('happy')
    await say('teach.watch.bobo')
    const upto = Math.min(3, n)
    for (let m = 1; m <= upto; m++) {
      if (!live.current) return
      setFinger(m)
      await wait(m === 1 ? 560 : 420)
      if (!live.current) return
      setPress((p) => p + 1)
      sfx.count(m)
      setNext(m + 1)
      await say(`m.num.${m}`)
    }
    if (!live.current) return
    setFinger(null)
    await wait(450)
    setNext(1)
    void logTeach({ station: 'math', game: def.id, itemId: `1-${n}`, skill: `order:${n}`, level: lv.current, ms: Math.round(performance.now() - s) })
    setMood('idle')
    await say('teach.turn.bobo')
  }

  const start = async (i: number) => {
    busy.current = true
    lv.current = level(def.id)
    const n = Math.min([3, 4, 5, 6][lv.current - 1] + (lv.current === 4 ? Math.floor(Math.random() * 3) : 0), Math.max(5, unlockedNumbers()), 10)
    const layout = scatter(n, n > 5 ? 5 : 4, 2).map((p) => ({ ...p, y: 28 + p.y * 0.7 }))
    setK(n)
    setPos(layout)
    setNext(1)
    setHint(false)
    setMood('idle')
    taps.current = []
    wrongs.current = 0
    // 要示範的話，示範完才換孩子點；不示範就跟以前一樣，邊聽邊可以開始點
    const show = demos.current < 1 && needsDemo(firstPlay.current && i === 0, `order:${n}`)
    busy.current = show
    nextRef.current = 1
    idle.stop()
    t0.current = performance.now()
    await say(i === 0 ? def.intro : 'm.order.start')
    if (!live.current) return
    if (show) {
      await demo(n)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
    }
    // 閒置：15 秒再唸一次「Where is 下一個數字?」→ 再 15 秒下一個數字慢慢發光 → 之後安靜
    if (nextRef.current <= n) idle.start({ repeat: () => void say(`m.findnum.${nextRef.current}`), hint: () => setHint(true) })
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

  const tap = async (n: number) => {
    if (n < next || busy.current) return
    idle.poke()
    taps.current.push({ pick: String(n), ms: Math.round(performance.now() - t0.current) })
    if (n !== next) {
      wrongs.current++
      sfx.gentle()
      setShake(n)
      setTimeout(() => setShake(0), 450)
      if (wrongs.current >= 2) setHint(true)
      // 點錯的回饋，不算閒置提醒；說完才重新計時
      await say(retryKey('bobo'), `m.findnum.${next}`)
      return idle.poke()
    }
    sfx.count(n)
    setHint(false)
    setNext(n + 1)
    nextRef.current = n + 1
    if (n < k) return void say(`m.num.${n}`)
    busy.current = true
    idle.stop()
    const firstTry = wrongs.current === 0
    if (firstTry) first.current++
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: `1-${k}`,
      skill: `order:${k}`,
      phase: 'quiz',
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
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} onHost={() => {
        idle.poke()
        void say(`m.findnum.${Math.min(next, k)}`)
      }}>
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
        <AnimatePresence>{finger !== null && pos[finger - 1] && <Hand key="finger" x={pos[finger - 1].x + 2} y={pos[finger - 1].y + 5} tap={press} size="11cqmin" />}</AnimatePresence>
      </div>
    </Shell>
  )
}
