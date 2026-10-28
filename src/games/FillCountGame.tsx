import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Hand } from './Demo'
import { Emoji } from '../art/Emoji'
import { Sparkles } from '../ui/Sparkles'
import { game as gameDef, station as stationDef } from '../content/games'
import { FILL_ICONS } from '../content/worksheet-data'
import { themed } from '../lib/theme-play'
import { level, markPlayed, plays, reportLevel } from '../lib/adaptive'
import { logAttempt, logTeach } from '../lib/record'
import type { Phase } from '../lib/db'
import { preload, say, sfx, stopSpeech } from '../lib/audio'
import { pick } from '../lib/random'
import { praiseKey, wait } from './lines'
import { useIdle } from './idle'
import { NUMBER_RANGE, useNumberPicker } from './sheet/NumberFlow'
import { DoneButton } from './sheet/DoneButton'
import type { Mood } from '../art/Dino'
import './sheet/sheet.css'

const ROUNDS = 4
/** 從 1–5 開始（一排 5 格），熟了延伸到 10（兩排，像十格框） */

// 學習單座標 1000×600：上面是要數的東西，下面是一排（或兩排）圓圈，勾勾在右邊
const CELL_R = 46
const DONE = { x: 905, y: 430 }

function cellsOf(m: number) {
  const rows = m > 5 ? 2 : 1
  return Array.from({ length: m }, (_, i) => {
    const r = Math.floor(i / 5)
    const c = i % 5
    return { x: 500 + (c - 2) * 124 - 40, y: rows === 1 ? 430 : 372 + r * 118 }
  })
}

function objsOf(n: number) {
  const rows = n > 5 ? 2 : 1
  const size = rows === 1 ? 118 : 96
  return Array.from({ length: n }, (_, i) => {
    const r = rows === 1 ? 0 : i < Math.ceil(n / 2) ? 0 : 1
    const inRow = rows === 1 ? n : r === 0 ? Math.ceil(n / 2) : n - Math.ceil(n / 2)
    const c = r === 0 ? i : i - Math.ceil(n / 2)
    const step = size + 22
    return { x: 460 + (c - (inRow - 1) / 2) * step, y: rows === 1 ? 135 : 82 + r * 116, size }
  })
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/**
 * 塗格子表示數量（學習單原題：甲蟲 4 隻就塗 4 格）：上面 N 個東西，下面一排圓圈。
 * 孩子點或塗滿和數量一樣多的圓圈（一對一對應），塗好按勾勾。
 * 每塗一格，上面對應的那一個就標上數字，看得出「一個東西、一個圈」。
 * 新的數量先由波波示範：指一個東西、塗一格、數一個，再換孩子。
 */
export function FillCountGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const deep = stationDef('math').deep
  const [r, setR] = useState(0)
  const [n, setN] = useState(0)
  const [icon, setIcon] = useState(FILL_ICONS[0])
  const [cells, setCells] = useState(5)
  const [order, setOrder] = useState<number[]>([])
  const [phase, setPhase] = useState<Phase>('quiz')
  const [scaffold, setScaffold] = useState(false)
  const [glow, setGlow] = useState<'next' | 'extra' | 'done' | null>(null)
  const [mood, setMood] = useState<Mood>('idle')
  const [finger, setFinger] = useState<{ x: number; y: number; tap: number } | null>(null)
  const [party, setParty] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  const orderRef = useRef<number[]>([])
  const nRef = useRef(0)
  const cellsRef = useRef(5)
  const phaseRef = useRef<Phase>('quiz')
  const board = useRef<HTMLDivElement>(null)
  const paint = useRef<{ pid: number; fill: boolean } | null>(null)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const wrongs = useRef({ few: 0, many: 0 })
  const hintUsed = useRef(false)
  const lv = useRef(1)
  const first = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)
  const resolver = useRef<(() => void) | null>(null)
  const step = useRef(0)
  const idle = useIdle()
  const picker = useNumberPicker('fill', def.id)

  const setOrderBoth = (o: number[]) => {
    orderRef.current = o
    setOrder(o)
  }
  const release = () => {
    const f = resolver.current
    resolver.current = null
    f?.()
  }

  // ── 我示範：指一個東西、塗一格、數一個 ───────────────────────────
  const demo = async (k: number) => {
    const s = performance.now()
    locked.current = true
    setMood('happy')
    await say('teach.watch.bobo')
    const objs = objsOf(k)
    const cs = cellsOf(cellsRef.current)
    for (let i = 0; i < k; i++) {
      if (!live.current) return
      setFinger((f) => ({ x: objs[i].x, y: objs[i].y, tap: f?.tap ?? 0 }))
      await wait(i === 0 ? 560 : 360)
      if (!live.current) return
      setFinger((f) => ({ x: cs[i].x, y: cs[i].y, tap: f?.tap ?? 0 }))
      await wait(380)
      if (!live.current) return
      setFinger((f) => ({ x: cs[i].x, y: cs[i].y, tap: (f?.tap ?? 0) + 1 }))
      setOrderBoth([...orderRef.current, i])
      sfx.count(i + 1)
      await say(`m.num.${i + 1}`)
    }
    if (!live.current) return
    await say(`teach.total.${k}`)
    setFinger((f) => ({ x: DONE.x, y: DONE.y, tap: f?.tap ?? 0 }))
    await wait(520)
    setFinger((f) => ({ x: DONE.x, y: DONE.y, tap: (f?.tap ?? 0) + 1 }))
    sfx.correct()
    await wait(500)
    if (!live.current) return
    setFinger(null)
    setOrderBoth([])
    void logTeach({ station: 'math', game: def.id, itemId: String(k), skill: `fill:${k}`, level: lv.current, ms: Math.round(performance.now() - s) })
    setMood('idle')
    await say('teach.turn.bobo')
  }

  const ask = async (k: number, ph: Phase, afterGuide: boolean) => {
    phaseRef.current = ph
    setPhase(ph)
    setOrderBoth([])
    setGlow(null)
    setScaffold(ph === 'guided')
    taps.current = []
    wrongs.current = { few: 0, many: 0 }
    hintUsed.current = false
    setMood(ph === 'guided' ? 'happy' : 'idle')
    locked.current = false
    t0.current = performance.now()
    const done = ph === 'guided' ? new Promise<void>((res) => (resolver.current = res)) : null
    const my = ++step.current
    await say(...(afterGuide ? ['teach.turn.bobo'] : []), 'ws.fill.ask')
    if (live.current && step.current === my)
      idle.start({
        repeat: () => void say('ws.fill.ask'),
        hint: () => {
          if (ph === 'quiz') hintUsed.current = true
          const c = orderRef.current.length
          setGlow(c < k ? 'next' : c > k ? 'extra' : 'done')
        },
      })
    if (done) await done
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    const [a, b] = NUMBER_RANGE.fill[lv.current]
    const { n: k, fresh } = picker.pick(a, b)
    const m = k > 5 || lv.current >= 3 ? 10 : 5
    nRef.current = k
    cellsRef.current = m
    setN(k)
    setCells(m)
    // 主題式冒險塗主題的東西（一格一台公車）
    setIcon(pick(themed(FILL_ICONS, (t) => t.count)))
    setOrderBoth([])
    setScaffold(false)
    setGlow(null)
    setMood('idle')
    idle.stop()
    locked.current = true
    preload(['ws.fill.ask', 'ws.fill.more', 'ws.fill.toomany', `teach.total.${k}`])
    if (i === 0) await say(def.intro)
    if (!live.current) return
    const walk = !fresh && firstPlay.current && i === 0
    if (fresh) {
      await demo(k)
      if (!live.current) return
    }
    if (fresh || walk) {
      await ask(k, 'guided', false)
      if (!live.current) return
      await wait(300)
    }
    return ask(k, 'quiz', fresh || walk)
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

  const finish = async () => {
    const k = nRef.current
    locked.current = true
    step.current++
    idle.stop()
    setGlow(null)
    setMood('cheer')
    setParty((p) => p + 1)
    sfx.correct()
    const ph = phaseRef.current
    const firstTry = wrongs.current.few + wrongs.current.many === 0 && !hintUsed.current
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: String(k),
      skill: `fill:${k}`,
      phase: ph,
      level: lv.current,
      options: [],
      answer: String(k),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: 1 + wrongs.current.few + wrongs.current.many,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: ph === 'guided' || hintUsed.current,
      metrics: { tooFew: wrongs.current.few, tooMany: wrongs.current.many, cells: cellsRef.current, strokes: taps.current.length },
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

  /** 波波指著上面的東西一個一個數，數到的最後一個就是要塗幾格 */
  const countObjs = async () => {
    const objs = objsOf(nRef.current)
    for (let i = 0; i < objs.length; i++) {
      if (!live.current) return
      setFinger((f) => ({ x: objs[i].x, y: objs[i].y, tap: (f?.tap ?? 0) + 1 }))
      sfx.count(i + 1)
      await say(`m.num.${i + 1}`)
    }
    setFinger(null)
  }

  const check = async () => {
    if (locked.current) return
    idle.poke()
    const k = nRef.current
    const c = orderRef.current.length
    if (c === 0) return void say('ws.fill.ask')
    taps.current.push({ pick: `done:${c}`, ms: Math.round(performance.now() - t0.current) })
    if (c === k) return finish()
    sfx.gentle()
    locked.current = true
    const guided = phaseRef.current === 'guided'
    if (c < k) {
      if (!guided) wrongs.current.few++
      setGlow('next')
      await say('ws.fill.more')
    } else {
      if (!guided) wrongs.current.many++
      setGlow('extra')
      await say('ws.fill.toomany')
    }
    if (!live.current) return
    // 自己答錯兩次：一起數一次上面的東西，再把該塗的格子用虛線圈出來
    if (!guided && wrongs.current.few + wrongs.current.many >= 2 && !scaffold) {
      hintUsed.current = true
      await say('ws.count')
      await countObjs()
      if (!live.current) return
      setScaffold(true)
      await say(`teach.total.${k}`)
    }
    locked.current = false
    idle.poke()
  }

  // ── 點或塗：按下去決定是「塗」還是「擦」，拖過去的格子都照做 ─────────
  const cellAt = (e: RPointerEvent) => {
    const rc = board.current!.getBoundingClientRect()
    const x = ((e.clientX - rc.left) / rc.width) * 1000
    const y = ((e.clientY - rc.top) / rc.height) * 600
    const cs = cellsOf(cellsRef.current)
    let best = -1
    let bd = CELL_R * 1.25
    cs.forEach((c, i) => {
      const d = Math.hypot(c.x - x, c.y - y)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return best
  }
  const apply = (i: number, fill: boolean) => {
    const o = orderRef.current
    if (fill === o.includes(i)) return
    const no = fill ? [...o, i] : o.filter((x) => x !== i)
    setOrderBoth(no)
    setGlow(null)
    taps.current.push({ pick: `${fill ? '+' : '-'}${i}`, ms: Math.round(performance.now() - t0.current) })
    if (fill) {
      sfx.count(no.length)
      void say(`m.num.${no.length}`)
    } else sfx.pop()
  }
  const down = (e: RPointerEvent) => {
    if (locked.current || paint.current) return
    const i = cellAt(e)
    if (i < 0) return
    idle.poke()
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 拿不到 capture 也照樣可以塗 */
    }
    const fill = !orderRef.current.includes(i)
    paint.current = { pid: e.pointerId, fill }
    apply(i, fill)
  }
  const move = (e: RPointerEvent) => {
    const p = paint.current
    if (!p || p.pid !== e.pointerId || locked.current) return
    const i = cellAt(e)
    if (i >= 0) apply(i, p.fill)
  }
  const up = (e: RPointerEvent) => {
    if (paint.current?.pid === e.pointerId) paint.current = null
  }

  const objs = objsOf(n)
  const cs = cellsOf(cells)
  const filled = order.length
  // 一起練：下一個要對應的東西一直發光；自己答只有提示時才發光
  const nextObj = (glow === 'next' || (phase === 'guided' && !finger)) && filled < n ? filled : -1
  const nextCell = nextObj >= 0 ? cs.findIndex((_, i) => !order.includes(i)) : -1
  return (
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} onHost={() => {
        idle.poke()
        void say('ws.fill.ask')
      }}>
      <div className="sheet-area">
        <div ref={board} className="sheet-board" data-n={import.meta.env.DEV ? n : undefined} style={{ touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <svg className="sheet-svg" viewBox="0 0 1000 600" aria-hidden="true">
            {/* 上下兩區之間一條淡淡的虛線，像學習單的分隔 */}
            <path d="M120 286 H820" stroke="rgba(46,42,37,0.1)" strokeWidth={4} strokeDasharray="14 14" strokeLinecap="round" />
          </svg>
          {objs.map((o, i) => (
            <motion.div
              key={`${r}-${i}`}
              style={{ position: 'absolute', left: pct(o.x, 1000), top: pct(o.y, 600), width: pct(o.size, 1000), aspectRatio: '1', translate: '-50% -50%', pointerEvents: 'none' }}
              initial={{ scale: 0 }}
              animate={{ scale: i < filled ? 0.9 : 1, opacity: i < filled ? 0.7 : 1, y: party && i < n ? [0, -18, 0] : 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18, delay: i < filled ? 0 : i * 0.05, y: { duration: 0.4, delay: i * 0.05 } }}
            >
              {nextObj === i && <span className="nudge-glow" aria-hidden="true" />}
              <Emoji name={icon} />
              {i < filled && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{ position: 'absolute', right: '-12%', top: '-12%', width: '42%', aspectRatio: '1', borderRadius: '50%', background: 'var(--ink)', color: 'var(--card)', display: 'grid', placeItems: 'center', fontFamily: 'Fredoka', fontWeight: 600, fontSize: '4cqmin' }}
                >
                  {i + 1}
                </motion.span>
              )}
            </motion.div>
          ))}
          <svg className="sheet-svg" viewBox="0 0 1000 600" aria-hidden="true">
            <defs>
              <pattern id="crayon-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
                <path d="M0 5 H10" stroke="#fff" strokeOpacity={0.28} strokeWidth={3} />
              </pattern>
            </defs>
            {cs.map((c, i) => {
              const at = order.indexOf(i)
              const on = at >= 0
              const extra = glow === 'extra' && at >= n
              const target = scaffold && i < n
              return (
                <g key={`${r}-${i}`} transform={`translate(${c.x} ${c.y})`}>
                  {target && <circle r={CELL_R + 13} fill="none" stroke="#C9A23E" strokeWidth={5} strokeDasharray="10 10" className="nudge-path" />}
                  {nextCell === i && <circle r={CELL_R + 12} fill="rgba(241,210,124,.55)" className="nudge-path" />}
                  <circle r={CELL_R} fill="#fff" stroke="rgba(46,42,37,0.55)" strokeWidth={6} />
                  <AnimatePresence>
                    {on && (
                      <motion.g key="f" initial={{ scale: 0.2, opacity: 0 }} animate={extra ? { scale: 1, opacity: 1, rotate: [0, -10, 10, -6, 6, 0] } : { scale: 1, opacity: 1 }} exit={{ scale: 0.2, opacity: 0 }} transition={extra ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.5 } : { type: 'spring', stiffness: 420, damping: 18 }}>
                        <circle r={CELL_R - 7} fill={deep} />
                        <circle r={CELL_R - 7} fill="url(#crayon-hatch)" />
                      </motion.g>
                    )}
                  </AnimatePresence>
                </g>
              )
            })}
          </svg>
          <DoneButton x={pct(DONE.x, 1000)} y={pct(DONE.y, 600)} glow={glow === 'done'} onPress={check} />
          {party > 0 && (
            <div key={party} style={{ position: 'absolute', left: '46%', top: '70%', width: 0, height: 0 }}>
              <Sparkles count={14} />
            </div>
          )}
          <AnimatePresence>{finger && <Hand key="finger" x={(finger.x / 1000) * 100 + 0.8} y={(finger.y / 600) * 100 + 2} tap={finger.tap} size="9cqmin" cuff="#F0B088" />}</AnimatePresence>
        </div>
      </div>
    </Shell>
  )
}
