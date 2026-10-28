import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Hand } from './Demo'
import { SheetTeach } from './sheet/SheetTeach'
import { Sparkles } from '../ui/Sparkles'
import { game as gameDef, station as stationDef } from '../content/games'
import { level, markPlayed, plays, reportLevel } from '../lib/adaptive'
import { logAttempt, logTeach } from '../lib/record'
import type { Phase } from '../lib/db'
import { preload, say, sfx, stopSpeech } from '../lib/audio'
import { shuffle } from '../lib/random'
import { praiseKey, wait } from './lines'
import { useIdle } from './idle'
import { NUMBER_RANGE, range, useNumberPicker } from './sheet/NumberFlow'
import type { Mood } from '../art/Dino'
import './sheet/sheet.css'

const ROUNDS = 5
/** 閃現多久（毫秒）：約 1.5 秒，來不及一個一個數，只能「一眼看出來」 */
const FLASH_MS = 1500
/** 第 1 級 1–3、第 2 級 1–4、之後 1–5；選項 2 → 3 → 3 → 4 個 */
const OPTS: Record<number, number> = { 1: 2, 2: 3, 3: 3, 4: 4 }

type Dot = [number, number]
/** 骰子的排法：最容易一眼認出來 */
const DICE: Record<number, Dot[]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
}
/** 第 4 級：不是骰子的排法（一排、三角形、菱形、W 形），要真的看出數量 */
const ALT: Record<number, Dot[]> = {
  1: [[38, 62]],
  2: [[28, 50], [72, 50]],
  3: [[50, 26], [27, 70], [73, 70]],
  4: [[50, 20], [20, 50], [80, 50], [50, 80]],
  5: [[18, 36], [34, 66], [50, 36], [66, 66], [82, 36]],
}

function patternOf(n: number, lv: number): Dot[] {
  const base = lv >= 4 && Math.random() < 0.6 ? ALT[n] : DICE[n]
  // 轉 0 / 90 度，同一個數量不會永遠長一樣
  return Math.random() < 0.5 ? base : base.map(([x, y]) => [100 - y, x] as Dot)
}

function optionsOf(n: number, lv: number): number[] {
  const k = OPTS[lv]
  const near = shuffle(range(1, 5).filter((x) => x !== n)).sort((a, b) => Math.abs(a - n) - Math.abs(b - n))
  return shuffle([n, ...near.slice(0, k - 1)]).sort((a, b) => a - b)
}

/** 點點卡：暖白卡上的圓點，像骰子 */
function DotCard({ dots, color, finger }: { dots: Dot[]; color: string; finger?: number }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      {dots.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y + 1.6} r={10.5} fill="rgba(46,42,37,0.12)" />
          <circle cx={x} cy={y} r={10.5} fill={color} />
          <circle cx={x - 3.4} cy={y - 3.6} r={3.2} fill="#fff" opacity={0.45} />
          {finger === i && <circle cx={x} cy={y} r={15} fill="none" stroke="#F1D27C" strokeWidth={3.5} />}
        </g>
      ))}
    </svg>
  )
}

/** 蓋住點點的葉子：兩片大葉子從兩邊合起來 */
function Leaves() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <rect width={100} height={100} fill="#CFE2B9" />
      <g stroke="#7FA868" strokeWidth={1.6} strokeLinecap="round" fill="none">
        <path d="M-8 92 C10 30 60 4 96 -4 C92 40 52 92 -8 92 Z" fill="#A9C98B" />
        <path d="M-6 90 C30 54 60 26 94 -2" />
        {[0.25, 0.45, 0.65].map((t) => (
          <path key={t} d={`M${-6 + 100 * t} ${90 - 92 * t} l${-2 + t * 10} ${-18 + t * 4}`} />
        ))}
        <path d="M108 8 C90 70 40 98 4 106 C8 62 48 12 108 8 Z" fill="#9AC07C" />
        <path d="M106 10 C70 46 40 74 6 104" />
        {[0.3, 0.5, 0.7].map((t) => (
          <path key={t} d={`M${106 - 100 * t} ${10 + 94 * t} l${2 + t * 6} ${16 - t * 4}`} />
        ))}
      </g>
    </svg>
  )
}

/**
 * 一眼看出幾個（subitizing，benchmark 手法 4）：點點圖案閃現約 1.5 秒就被葉子蓋住，問「How many dots?」。
 * 數量 1–5，來不及慢慢數；但點葉子可以再看一次，所以沒有時間壓力（不倒數）。
 * 新的數量先看教學卡：點點大大地擺出來、波波數一次，再一起練（答案發光），再自己答。
 * 答錯一次：再閃一次；答錯兩次：掀開葉子，波波陪孩子數一次，答案慢慢發光。
 */
export function SubitizeGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const color = stationDef('math').deep
  const [r, setR] = useState(0)
  const [n, setN] = useState(0)
  const [dots, setDots] = useState<Dot[]>([])
  const [opts, setOpts] = useState<number[]>([])
  const [covered, setCovered] = useState(true)
  const [asking, setAsking] = useState(false)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ n: number; dots: Dot[]; short: boolean; k: number } | null>(null)
  const [wrong, setWrong] = useState<number[]>([])
  const [hint, setHint] = useState(false)
  const [right, setRight] = useState<number | null>(null)
  const [mood, setMood] = useState<Mood>('idle')
  const [finger, setFinger] = useState<{ i: number; tap: number } | null>(null)

  const live = useRef(true)
  const locked = useRef(true)
  const nRef = useRef(0)
  const dotsRef = useRef<Dot[]>([])
  const phaseRef = useRef<Phase>('quiz')
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const peeks = useRef(0)
  const wrongs = useRef(0)
  const hintUsed = useRef(false)
  const lv = useRef(1)
  const first = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)
  const resolver = useRef<((ms: number) => void) | null>(null)
  const step = useRef(0)
  const flashing = useRef(false)
  const idle = useIdle()
  const picker = useNumberPicker('flash', def.id)

  const release = (ms = 0) => {
    const f = resolver.current
    resolver.current = null
    f?.(ms)
  }

  /** 掀開葉子 1.5 秒，再蓋回去 */
  const flash = async () => {
    flashing.current = true
    setCovered(false)
    sfx.whoosh()
    await wait(FLASH_MS)
    flashing.current = false
    if (!live.current) return
    setCovered(true)
    await wait(380)
  }

  const teach = async (k: number, short: boolean) => {
    step.current++
    idle.stop()
    locked.current = true
    setMood('happy')
    setCard({ n: k, dots: DICE[k], short, k: step.current })
    const ms = await new Promise<number>((res) => (resolver.current = res))
    if (!live.current) return
    setCard(null)
    void logTeach({ station: 'math', game: def.id, itemId: String(k), skill: `flash:${k}`, level: lv.current, ms, retaught: short })
    await wait(260)
  }

  const round = async (k: number, ph: Phase, afterGuide: boolean) => {
    const my = ++step.current
    idle.stop()
    phaseRef.current = ph
    setPhase(ph)
    const d = patternOf(k, lv.current)
    dotsRef.current = d
    setDots(d)
    setOpts(optionsOf(k, lv.current))
    setWrong([])
    setHint(false)
    setRight(null)
    setAsking(false)
    setCovered(true)
    taps.current = []
    peeks.current = 0
    wrongs.current = 0
    hintUsed.current = false
    setMood(ph === 'guided' ? 'happy' : 'idle')
    locked.current = true
    const done = ph === 'guided' ? new Promise<number>((res) => (resolver.current = res)) : null
    await say(...(afterGuide ? ['teach.turn.bobo'] : []), 'ws.flash.look')
    if (!live.current || step.current !== my) return
    await flash()
    if (!live.current || step.current !== my) return
    setAsking(true)
    locked.current = false
    t0.current = performance.now()
    const q = ph === 'guided' ? ['ws.flash.ask', 'teach.here.bobo'] : ['ws.flash.ask']
    await say(...q)
    if (live.current && step.current === my)
      idle.start({
        repeat: () => void say(...q),
        hint: () => {
          if (ph === 'quiz') hintUsed.current = true
          setHint(true)
        },
      })
    if (done) await done
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    const [a, b] = NUMBER_RANGE.flash[lv.current]
    const { n: k, fresh } = picker.pick(a, b)
    nRef.current = k
    setN(k)
    setAsking(false)
    setCovered(true)
    idle.stop()
    locked.current = true
    preload([`teach.count.${k}`, `teach.total.${k}`, 'ws.flash.look', 'ws.flash.ask'])
    if (i === 0) await say(def.intro)
    if (!live.current) return
    const walk = !fresh && firstPlay.current && i === 0
    if (fresh) {
      await teach(k, false)
      if (!live.current) return
    }
    if (fresh || walk) {
      await round(k, 'guided', false)
      if (!live.current) return
      await wait(300)
    }
    return round(k, 'quiz', fresh || walk)
  }

  useEffect(() => {
    live.current = true
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

  /** 波波掀開葉子，一個一個數給孩子看 */
  const countAlong = async () => {
    setCovered(false)
    await wait(300)
    for (let i = 0; i < dotsRef.current.length; i++) {
      if (!live.current) return
      setFinger((f) => ({ i, tap: (f?.tap ?? 0) + 1 }))
      sfx.count(i + 1)
      await say(`m.num.${i + 1}`)
    }
    if (!live.current) return
    await say(`teach.total.${nRef.current}`)
    setFinger(null)
  }

  const finish = async (x: number) => {
    const k = nRef.current
    locked.current = true
    step.current++
    idle.stop()
    setRight(x)
    setCovered(false)
    setMood('cheer')
    sfx.correct()
    const ph = phaseRef.current
    const firstTry = wrongs.current === 0 && !hintUsed.current
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: String(k),
      skill: `flash:${k}`,
      phase: ph,
      level: lv.current,
      options: opts.map(String),
      answer: String(k),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: taps.current[0]?.ms ?? 0,
      hintUsed: ph === 'guided' || hintUsed.current,
      metrics: { peeks: peeks.current, wrong: wrongs.current, flashMs: FLASH_MS },
    })
    if (ph === 'guided') {
      await say(`teach.total.${k}`, praiseKey('bobo'))
      await wait(250)
      return release()
    }
    if (firstTry) first.current++
    reportLevel(def.id, firstTry, def.maxLevel)
    await say(`teach.total.${k}`, praiseKey('bobo'))
    await wait(400)
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  const tap = async (x: number) => {
    if (locked.current || !asking) return
    idle.poke()
    if (wrong.includes(x)) return
    taps.current.push({ pick: String(x), ms: Math.round(performance.now() - t0.current) })
    if (x === nRef.current) return finish(x)
    sfx.gentle()
    if (phaseRef.current === 'guided') return void say('teach.here.bobo')
    wrongs.current++
    setWrong((w) => [...w, x])
    locked.current = true
    if (wrongs.current === 1) {
      // 答錯一次：再看一次（不算孩子自己偷看）
      await say('teach.again.bobo')
      if (!live.current) return
      await flash()
    } else {
      hintUsed.current = true
      await say('ws.count')
      await countAlong()
      if (!live.current) return
      setHint(true)
    }
    if (!live.current) return
    locked.current = false
    await say('ws.flash.ask')
    idle.poke()
  }

  /** 點葉子：自己再看一次（記下來，但不扣分） */
  const peek = async () => {
    if (locked.current || !asking || !covered || flashing.current) return
    idle.poke()
    peeks.current++
    taps.current.push({ pick: 'peek', ms: Math.round(performance.now() - t0.current) })
    await flash()
    idle.poke()
  }

  const onHost = () => {
    if (card) return
    idle.poke()
    if (asking) void say('ws.flash.ask')
  }

  const guide = phase === 'guided'
  return (
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} onHost={onHost}>
      <AnimatePresence mode="wait">
        {card ? (
          <SheetTeach
            key={`teach-${card.k}`}
            items={[
              <div key="d" style={{ width: '96cqmin', height: '96cqmin', borderRadius: '12cqmin', background: '#fff', boxShadow: '0 0 0 1.4cqmin rgba(46,42,37,0.06)' }}>
                <DotCard dots={card.dots} color={color} />
              </div>,
            ]}
            lines={[`teach.count.${card.n}`, `teach.total.${card.n}`]}
            short={card.short}
            onDone={release}
          />
        ) : (
          n > 0 && (
            <motion.div key={`r-${r}`} className="sheet-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              <div data-n={import.meta.env.DEV ? n : undefined} style={{ position: 'relative', width: 'min(100cqw, 166.67cqh)', aspectRatio: '5 / 3', containerType: 'size' }}>
                <motion.div
                  className="flash-card"
                  role="button"
                  aria-label="再看一次"
                  style={{ left: '50%', top: '2%', height: '56%' }}
                  onPointerDown={peek}
                  animate={right !== null ? { scale: [1, 1.06, 1] } : {}}
                >
                  <div style={{ position: 'absolute', inset: '7%' }}>
                    <DotCard dots={dots} color={color} finger={finger?.i} />
                  </div>
                  <AnimatePresence>
                    {covered && (
                      <motion.div
                        key="leaves"
                        style={{ position: 'absolute', inset: 0 }}
                        initial={{ clipPath: 'circle(0% at 50% 50%)' }}
                        animate={{ clipPath: 'circle(75% at 50% 50%)' }}
                        exit={{ clipPath: 'circle(0% at 50% 50%)' }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <Leaves />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {right !== null && <Sparkles count={12} />}
                </motion.div>
                <AnimatePresence>
                  {finger && dots[finger.i] && (
                    <Hand key="finger" x={50 + ((dots[finger.i][0] - 50) / 100) * 33.6 * 0.86 + 0.6} y={2 + (7 + dots[finger.i][1] * 0.86) * 0.56 + 2} tap={finger.tap} size="8cqmin" cuff="#F0B088" />
                  )}
                </AnimatePresence>
                {asking && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '66%', display: 'flex', justifyContent: 'center', gap: '4cqmin' }}>
                    {opts.map((x, i) => {
                      const isAns = x === n
                      const bad = wrong.includes(x)
                      const glow = guide && isAns && right === null
                      const dim = guide && !isAns
                      return (
                        <motion.button
                          key={x}
                          className={`tile${right === x ? ' correct' : ''}${hint && isAns && right === null ? ' hint' : ''}${glow ? ' guide' : ''}${dim ? ' dim' : ''}`}
                          style={{ width: '22cqmin' }}
                          aria-label={String(x)}
                          initial={{ y: 40, opacity: 0 }}
                          animate={bad ? { x: [0, -12, 12, 0], opacity: 0.4, y: 0 } : dim ? { y: 0, opacity: 0.3, scale: 0.9 } : { y: 0, opacity: 1, scale: right === x ? 1.08 : 1 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 20, delay: bad || right !== null ? 0 : i * 0.07 }}
                          whileTap={{ scale: 0.94 }}
                          onPointerDown={() => tap(x)}
                        >
                          <div className="tile-in">
                            <span className="glyph num">{x}</span>
                          </div>
                          {glow && <Hand x={72} y={70} size="10cqmin" beckon />}
                        </motion.button>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </Shell>
  )
}
