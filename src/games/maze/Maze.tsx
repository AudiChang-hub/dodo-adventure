import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../NotYet'
import { useFlow } from '../barge'
import { useIdle } from '../idle'
import { wait } from '../lines'
import { PACE } from '../pace'
import { DoneChoices } from '../draw/DoneChoices'
import { Dino } from '../../art/Dino'
import { Emoji } from '../../art/Emoji'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useLive } from '../logic/kit'
import { useTaps } from '../../ui/tap'
import { MazeAnimal, MazeHarderArt, MazePickArt, Padlock } from './art'
import { MAZE_COPLAY } from './coplay'
import { findKey, gotKey } from './lines'
import {
  DX,
  DY,
  GOALS,
  MAZE_GAME,
  MAZE_LEVELS,
  MAZE_MAX,
  afterMaze,
  choicesOf,
  decoFor,
  dirOf,
  doneStack,
  harderMaze,
  isDino,
  linked,
  makeMaze,
  mazeOk,
  mazeSkill,
  mazeSmooth,
  needsDemo,
  nextStep,
  readyFor,
  step,
  turnsOf,
  walkTo,
  type Maze as MazeData,
  type MazeLevel,
  type MazeState,
  type ThemeId,
} from './plan'
import { loadMaze, saveMaze } from './progress'
import '../draw/tools.css'
import './maze.css'

/** 新的迷宮剛出來這麼久內點不算（上一個連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 一路走過去時每一格多久 */
const STEP_MS = 150
/** 一格最大多少 px（3×3 在平板上約 180） */
const CELL_MAX = 200
/** 橫的時候右邊留給「再一個／難一點／回首頁」那一欄（draw/tools.css 的 .draw-home-col：右 14 ＋ 寬 218） */
const SIDE_COL = 240
/** 第 9、10 級要先拿的東西：鑰匙、星星（Fluent Emoji） */
const ITEM_ICON = { key: 'key', stars: 'star' } as const
const FIRST_LINE = { key: 'mz.key.first', stars: 'mz.stars.first' } as const

/** 主題的顏色：背景（牆）、走道（淺色，跟背景明暗拉開，紙感螢幕上也看得清楚） */
const THEME_LOOK: Record<ThemeId, { bg: string; edge: string; path: string; pathEdge: string }> = {
  forest: { bg: '#A9CF8E', edge: '#7FA866', path: '#F3E6C2', pathEdge: '#C9B07A' },
  sea: { bg: '#86BCD8', edge: '#5F97B8', path: '#F6EBCB', pathEdge: '#C8B27E' },
  snow: { bg: '#B9CFDF', edge: '#8DA9BF', path: '#FFFFFF', pathEdge: '#9DB4C6' },
  garden: { bg: '#E7C3CF', edge: '#C495A6', path: '#FBF3E2', pathEdge: '#D2B98A' },
  // T-158 加的主題：底色彼此拉開，走道一律是淺色（深色的太空、夜晚也一樣），一眼看得出哪裡是路
  desert: { bg: '#EACB8C', edge: '#C9A262', path: '#FFF6E1', pathEdge: '#C29A5B' },
  space: { bg: '#4B4180', edge: '#342C61', path: '#ECE8FA', pathEdge: '#A39BD0' },
  city: { bg: '#B9BFC8', edge: '#8F969F', path: '#F8F4EA', pathEdge: '#A99F8C' },
  farm: { bg: '#CADF8E', edge: '#9DB563', path: '#F0DAB0', pathEdge: '#B89A64' },
  dino: { bg: '#D8A88A', edge: '#B27E61', path: '#FBEEDB', pathEdge: '#C69872' },
  candy: { bg: '#CDB8EE', edge: '#A28BD2', path: '#FFF7EA', pathEdge: '#D6BA8C' },
  rain: { bg: '#82A9A3', edge: '#5E8580', path: '#F0F5F1', pathEdge: '#9DB5AE' },
  night: { bg: '#283B61', edge: '#18264A', path: '#F6E9C6', pathEdge: '#C4A770' },
}

/**
 * 迷宮（T-156）：每次用程式隨機產生（./plan.ts 的 makeMaze），起點有一隻小恐龍、終點有吃的。
 * 手指拖著恐龍沿走道走（撞牆就停住，不算錯）；點旁邊相通的格子也走一步（TOUCH-2）；同一條直路上點遠一點的格子，一路走過去。
 * 不計時、不扣分、沒有失敗畫面（FB-5）。發呆：15 秒再問一次 Which way?、30 秒手指著下一格、那一格亮起來。
 * 第一次到這一級：手先帶著恐龍走一步（示範中點了只有「看這裡」的圈圈）。走到終點：恐龍跳一下、念一句，停在「再一個／回首頁」。
 */
export function Maze() {
  const [maze, setMaze] = useState<MazeData | null>(null)
  const prog = useRef<MazeState | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  const make = (p: MazeState) => makeMaze(p.level as MazeLevel, { sigs: p.sigs, theme: p.theme, goal: p.goal })
  useEffect(() => {
    let on = true
    void loadMaze().then((p) => {
      if (!on || prog.current) return
      prog.current = p
      setMaze(make(p))
    })
    return () => {
      on = false
    }
  }, [])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setMaze(make(p))
    setN((k) => k + 1)
  }
  /** 「難一點」（T-158）：自己往上跳一級，接著出下一個 */
  const harder = () => {
    const p = prog.current
    if (!p) return
    prog.current = harderMaze(p)
    void saveMaze(prog.current)
    again()
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? MAZE_COPLAY.now : MAZE_COPLAY.play}>
      {maze && prog.current && <MazeView key={n} maze={maze} prog={prog} onDone={() => setResting(true)} onAgain={again} onHarder={harder} resting={resting} />}
    </Shell>
  )
}

/** 簡單的亂數（同一個迷宮每次畫出來的裝飾一樣） */
function seeded(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/** 迷宮的圖：背景（牆）、走道、牆縫裡的裝飾、起點的圈。單位是格子（1 格 = 1），外面留 padOf 格 */
const PATH_W = 0.6
/** 外框留多寬（格）：6 列以上（T-158 的大迷宮）留窄一點，格子才不會小於約 70px */
const padOf = (rows: number) => (rows >= 6 ? 0.12 : 0.22)
const Board = memo(function Board({ maze }: { maze: MazeData }) {
  const { cols, rows, links, theme, start } = maze
  const PAD = padOf(rows)
  const look = THEME_LOOK[theme]
  const segs: string[] = []
  for (let c = 0; c < cols * rows; c++) {
    const x = (c % cols) + 0.5
    const y = Math.floor(c / cols) + 0.5
    segs.push(`M${x} ${y}h0`)
    if (links[c] & 2) segs.push(`M${x} ${y}h1`)
    if (links[c] & 4) segs.push(`M${x} ${y}v1`)
  }
  const d = segs.join('')
  // 牆縫（相鄰但不通的兩格中間）放裝飾：大約四分之三，看起來像樹叢、珊瑚，不擋路
  const deco = useMemo(() => {
    const rnd = seeded(maze.sig)
    // 這個主題的裝飾（4～6 樣），不放終點的東西、不放正在走的那隻動物
    const icons = decoFor(theme, maze.dino, maze.goalId)
    const out: { x: number; y: number; icon: string }[] = []
    for (let c = 0; c < cols * rows; c++)
      for (const dd of [1, 2]) {
        const nb = step(cols, rows, c, dd)
        if (nb < 0 || linked(maze, c, nb)) continue
        if (rnd() < 0.25) continue
        const x = (c % cols) + 0.5 + DX[dd] * 0.5
        const y = Math.floor(c / cols) + 0.5 + DY[dd] * 0.5
        out.push({ x, y, icon: icons[Math.floor(rnd() * icons.length) % icons.length] })
      }
    return out
  }, [maze, cols, rows, theme])
  const sx = (start % cols) + 0.5
  const sy = Math.floor(start / cols) + 0.5
  return (
    <svg className="mz-svg" viewBox={`${-PAD} ${-PAD} ${cols + PAD * 2} ${rows + PAD * 2}`} width="100%" height="100%" aria-hidden="true">
      <rect x={-PAD + 0.03} y={-PAD + 0.03} width={cols + PAD * 2 - 0.06} height={rows + PAD * 2 - 0.06} rx={0.3} fill={look.bg} stroke={look.edge} strokeWidth={0.05} />
      <path d={d} fill="none" stroke={look.pathEdge} strokeWidth={PATH_W + 0.07} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={look.path} strokeWidth={PATH_W} strokeLinecap="round" strokeLinejoin="round" />
      {/* 起點：地上一個淡淡的圈 */}
      <circle cx={sx} cy={sy} r={0.22} fill="none" stroke={look.pathEdge} strokeWidth={0.05} strokeDasharray="0.09 0.07" />
      {deco.map((o, i) => (
        <svg key={i} x={o.x - 0.17} y={o.y - 0.17} width={0.34} height={0.34}>
          <Emoji name={o.icon} />
        </svg>
      ))}
    </svg>
  )
})

type HandState = { x: number; y: number; tap: number } | null

function MazeView({ maze, prog, onDone, onAgain, onHarder, resting }: { maze: MazeData; prog: { current: MazeState | null }; onDone: () => void; onAgain: () => void; onHarder: () => void; resting: boolean }) {
  const { level, cols, rows, start, goal, goalId, dino, extra, items } = maze
  const PAD = padOf(rows)
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const area = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 版面：格子盡量大（最大 CELL_MAX），整個迷宮置中；右邊留給「再一個／回首頁」那一欄。
  // 大迷宮（T-158，最大 10×7）置中會壓到那一欄：改成在那一欄左邊的空間置中（平板上一格約 75px）
  const wide = size.w >= 900
  const avail = wide ? size.w - SIDE_COL - 16 : size.w * 0.92
  const cs = Math.max(30, Math.min(CELL_MAX, avail / (cols + PAD * 2), (size.h - 20) / (rows + PAD * 2)))
  const bw = cs * (cols + PAD * 2)
  const bh = cs * (rows + PAD * 2)
  const bx = wide && (size.w + bw) / 2 > size.w - SIDE_COL ? Math.max(8, (size.w - SIDE_COL - bw) / 2) : (size.w - bw) / 2
  const by = (size.h - bh) / 2
  const geo = useRef({ cs, bx, by, w: size.w, h: size.h })
  geo.current = { cs, bx, by, w: size.w, h: size.h }
  const centerOf = (c: number) => {
    const g = geo.current
    return { x: g.bx + g.cs * (PAD + (c % cols) + 0.5), y: g.by + g.cs * (PAD + Math.floor(c / cols) + 0.5) }
  }

  const [at, setAt] = useState(start)
  const [visited, setVisited] = useState<number[]>([start])
  const [flip, setFlip] = useState(false)
  const [bump, setBump] = useState<{ d: number; k: number } | null>(null)
  const [hop, setHop] = useState(0)
  const [glow, setGlow] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  /** 已經拿到的鑰匙、星星（格子） */
  const [got, setGot] = useState<number[]>([])
  /** 東西沒拿完就走到終點：終點搖一下 */
  const [nudge, setNudge] = useState(0)

  const st = useRef({
    at: start,
    busy: true,
    demo: false,
    armed: false,
    ended: false,
    moving: false,
    steps: 0,
    bumps: 0,
    led: false,
    shown: false,
    demoed: false,
    taps: [] as { pick: string; ms: number }[],
    t0: 0,
    /** 手指現在指著哪一格（走完一段之後再看一次，手指停住也會走到） */
    target: -1,
    /** 這一下按著的手指 */
    pid: -1,
    lastBump: -1,
    got: [] as number[],
  })
  const [firstTime] = useState(() => (prog.current ? needsDemo(prog.current.taught, level) : false))

  const pct = (p: { x: number; y: number }) => {
    const g = geo.current
    return g.w ? { x: (p.x / g.w) * 100, y: (p.y / g.h) * 100 } : { x: 50, y: 50 }
  }
  const showHand = (c: number, tapIt: boolean) => setHand((h) => ({ ...pct({ x: centerOf(c).x, y: centerOf(c).y - geo.current.cs * 0.05 }), tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0) }))

  const startIdle = () => {
    setTurn(true)
    idle.start({
      repeat: () => void say('mz.ask'),
      hint: () => {
        // 發呆：手指著下一格、那一格亮起來（不說話）；之後走完記成一起做。第 9、10 級：往還沒拿的鑰匙、星星走
        const nx = nextStep(maze, st.current.at, st.current.got)
        if (nx < 0) return
        st.current.led = true
        setGlow(nx)
        showHand(nx, true)
      },
    })
  }

  const record = () => {
    const s = st.current
    // 最短：拿完鑰匙、星星再到終點（沒有的話就是起點到終點）
    const short = maze.tour
    const phase = s.demoed || s.led || s.shown ? 'guided' : 'quiz'
    const ok = mazeOk({ steps: s.steps, shortest: short, led: s.led || s.shown, detour: MAZE_LEVELS[level].detour })
    const ms = Math.round(performance.now() - s.t0)
    const smooth = mazeSmooth({ ok, ms, shortest: short })
    void logAttempt({
      station: 'logic',
      game: MAZE_GAME,
      itemId: `maze:${cols}x${rows}:${goalId}`,
      skill: mazeSkill(level),
      phase,
      level,
      options: [],
      answer: String(goal),
      taps: s.taps,
      firstTryCorrect: ok,
      attempts: s.steps,
      responseMs: ms,
      hintUsed: s.led || s.shown,
      heard: true,
      metrics: {
        steps: s.steps,
        shortest: short,
        bumps: s.bumps,
        choices: choicesOf(maze.links, maze.path),
        turns: turnsOf(cols, rows, maze.path),
        ...(items.length ? { items: items.length } : {}),
        ...(smooth ? { smooth: 1 } : {}),
        ...(s.led ? { led: 1 } : {}),
        ...(s.shown ? { shown: 1 } : {}),
      },
    })
    const p = prog.current
    if (p) {
      prog.current = afterMaze(p, maze, { date: today(), ok, counted: phase === 'quiz', smooth })
      void saveMaze(prog.current)
    }
  }

  const finish = async () => {
    const s = st.current
    s.ended = true
    s.busy = true
    idle.stop()
    setTurn(false)
    setHand(null)
    setGlow(null)
    setDone(true)
    // 小動物沒有歡呼的表情：跳一下
    if (!isDino(dino)) setHop((k) => k + 1)
    sfx.done()
    record()
    flow.cut()
    const ok = flow.begin(live)
    await wait(350)
    if (!ok()) return
    await say(gotKey(goalId))
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 走到 c（相鄰、相通） */
  const stepTo = (c: number, byChild = true) => {
    const s = st.current
    const d = dirOf(cols, rows, s.at, c)
    if (d === 1) setFlip(false)
    if (d === 3) setFlip(true)
    s.at = c
    setAt(c)
    if (byChild) {
      s.steps++
      s.taps.push({ pick: String(c), ms: Math.round(performance.now() - s.t0) })
    }
    setVisited((v) => (v.includes(c) ? v : [...v, c]))
    setGlow(null)
    setHand(null)
    if (items.includes(c) && !s.got.includes(c)) {
      // 拿到鑰匙、星星（T-158）：叮一聲；鑰匙、最後一顆星星再說一句
      s.got = [...s.got, c]
      setGot(s.got)
      sfx.pop()
      if (extra === 'key') void say('mz.key.got')
      else if (readyFor(maze, s.got)) void say('mz.stars.got')
      return
    }
    sfx.tap()
  }

  /** 沿著 cells 一格一格走；走到終點就結束；走完再看手指現在在哪 */
  const walk = async (cells: number[]) => {
    const s = st.current
    if (!cells.length) return
    s.moving = true
    flow.cut()
    idle.poke()
    for (let i = 0; i < cells.length; i++) {
      if (!live.current || s.ended) break
      stepTo(cells[i])
      if (cells[i] === goal) {
        if (readyFor(maze, s.got)) {
          s.moving = false
          return void finish()
        }
        // 鑰匙、星星還沒拿完就到終點：停在這裡，終點搖一下、說「先去拿」（不算錯）
        s.moving = false
        setNudge((k) => k + 1)
        setHop((k) => k + 1)
        if (extra) void say(FIRST_LINE[extra])
        startIdle()
        return
      }
      if (i < cells.length - 1) await wait(STEP_MS)
    }
    s.moving = false
    if (!live.current || s.ended) return
    startIdle()
    // 手指還按著、停在更前面的格子：接著走
    if (s.pid >= 0 && s.target >= 0 && s.target !== s.at) aim(s.target, false)
  }

  /** 撞牆：恐龍往那個方向頂一下就回來（不算錯、不出聲） */
  const bumpTo = (d: number) => {
    st.current.bumps++
    setBump({ d, k: performance.now() })
  }

  /** 手指指著 target 這一格：走得過去就走，隔著牆就頂一下 */
  const aim = (target: number, fresh: boolean) => {
    const s = st.current
    s.target = target
    if (s.moving || s.ended || s.busy || s.demo) return
    if (target < 0 || target === s.at) return
    const cells = walkTo(maze, s.at, target)
    if (cells.length) {
      s.lastBump = -1
      void walk(cells)
      return
    }
    const d = dirOf(cols, rows, s.at, target)
    if (d >= 0) {
      // 隔著牆：同一面牆手指一直在那裡只頂一下
      if (s.lastBump !== target) {
        s.lastBump = target
        bumpTo(d)
      }
      return
    }
    // 點在遠的地方（走不過去）：恐龍原地跳一下，讓他知道有點到（TOUCH-6）
    if (fresh) setHop((k) => k + 1)
  }

  /** 第一次到這一級：手帶著恐龍走一步 */
  const runDemo = async () => {
    const s = st.current
    const ok = flow.begin(live)
    s.demo = true
    s.demoed = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say(findKey(goalId))
    if (!ok()) return
    if (extra) {
      // 第一次有鑰匙、星星：手先指著它（亮起來），說「先去拿」
      setGlow(items[0])
      showHand(items[0], true)
      await say(FIRST_LINE[extra])
      if (!ok()) return
      await wait(600)
      if (!ok()) return
      setGlow(null)
    }
    await say('teach.watch.dodo')
    if (!ok()) return
    showHand(s.at, false)
    await wait(700)
    if (!ok()) return
    const nx = nextStep(maze, s.at, s.got)
    showHand(s.at, true)
    await wait(300)
    if (!ok()) return
    showHand(nx, false)
    stepTo(nx, false)
    await say('mz.way')
    if (!ok()) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    setHand(null)
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: MAZE_GAME, itemId: `maze:${cols}x${rows}:${goalId}`, skill: mazeSkill(level), level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveMaze(prog.current)
    }
    s.demo = false
    s.busy = false
    s.armed = true
    setDemo(false)
    setHold(false)
    startIdle()
  }

  useEffect(() => {
    let arm = 0
    const t = window.setTimeout(() => {
      const s = st.current
      s.t0 = performance.now()
      if (firstTime) return void runDemo()
      arm = window.setTimeout(() => {
        s.armed = true
        s.busy = false
        setHold(false)
      }, ARM_MS)
      void (async () => {
        const ok = flow.begin(live)
        await say(findKey(goalId))
        if (!ok() || s.ended) return
        if (extra && !readyFor(maze, s.got)) {
          await say(FIRST_LINE[extra])
          if (!ok() || s.ended) return
        }
        startIdle()
      })()
    }, 0)
    return () => {
      clearTimeout(t)
      clearTimeout(arm)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const local = (e: { clientX: number; clientY: number }) => (area.current ? localPoint(area.current, e.clientX, e.clientY) : { x: 0, y: 0 })
  /** 手指在哪一格（迷宮外面：-1） */
  const cellAt = (p: { x: number; y: number }) => {
    const g = geo.current
    const cx = Math.floor((p.x - g.bx) / g.cs - PAD)
    const cy = Math.floor((p.y - g.by) / g.cs - PAD)
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1
    return cy * cols + cx
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    idle.poke()
    if (resting) setPoke((k) => k + 1)
    // 擋板自己會出「看這裡」的圈圈
    if (e.target instanceof Element && e.target.closest('.wait-shield')) return
    if (!firstFinger(e.nativeEvent)) return
    const s = st.current
    if (s.ended) return
    if (s.demo || !s.armed || s.busy) {
      const p = local(e)
      notYet.ping(p.x, p.y)
      return
    }
    s.pid = e.pointerId
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 有些瀏覽器拿不到 */
    }
    aim(cellAt(local(e)), true)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current
    if (s.pid !== e.pointerId) return
    const c = cellAt(local(e))
    if (c === s.target) return
    idle.poke()
    aim(c, false)
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current
    if (s.pid !== e.pointerId) return
    s.pid = -1
    s.target = -1
    s.lastBump = -1
  }

  // 走完停著（T-158）：還不是最高級的話，先出「難一點」、豆豆說 A bigger maze?，再出「再一個／回首頁」（DoneChoices 一個一個說）
  const tap = useTaps()
  const [harderOn, setHarderOn] = useState(false)
  const [harderSaid, setHarderSaid] = useState(false)
  const [choicesOn, setChoicesOn] = useState(false)
  useEffect(() => {
    if (!resting) return
    let on = true
    const lv = prog.current?.level ?? MAZE_MAX
    if (lv >= MAZE_MAX) {
      setChoicesOn(true)
      return
    }
    setHarderOn(true)
    setHarderSaid(true)
    void say('mz.harder').then(() => {
      if (!on) return
      setHarderSaid(false)
      setChoicesOn(true)
    })
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resting])

  const dc = centerOf(at)
  const gc = centerOf(goal)
  const nx = done ? -1 : nextStep(maze, at, got)
  const ready = readyFor(maze, got)
  const dsize = cs * 0.86
  // 「難一點」＋「再一個／回首頁」三顆在右邊那一欄由上往下排好、不重疊、不出界（家長平板錄影：「難一點」被那一欄蓋住點不到）
  const ds = doneStack(size.h)
  const stackVars = harderOn
    ? ({ '--mz-harder-top': `${ds.harderTop}px`, '--mz-harder': `${ds.harder}px`, '--mz-col-top': `${ds.colTop}px`, '--mz-again': `${ds.again}px`, '--mz-home': `${ds.home}px`, '--mz-col-gap': `${ds.gap}px` } as CSSProperties)
    : undefined
  return (
    <div
      className={`mz${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}${harderOn ? ' has-harder' : ''}`}
      style={stackVars}
      data-logic-game="maze"
      data-level={level}
      data-cols={cols}
      data-rows={rows}
      data-at={at}
      data-goal={goal}
      data-next={nx}
      data-links={maze.links.join(',')}
      data-sig={maze.sig}
      data-theme={maze.theme}
      data-extra={extra}
      data-items={items.join(',') || undefined}
      data-got={got.join(',') || undefined}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-done={done ? '1' : undefined}
    >
      <div className="mz-play" ref={area} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {size.w > 0 && (
          <>
            <div className="mz-board" style={{ left: bx, top: by, width: bw, height: bh }}>
              <Board maze={maze} />
            </div>
            {/* 走過的路：小腳印點（看得出自己走到哪了） */}
            {visited.map((c) =>
              c === at ? null : (
                <span key={c} className="mz-trail" style={{ left: centerOf(c).x, top: centerOf(c).y, width: cs * 0.14, height: cs * 0.14 }} aria-hidden="true" />
              ),
            )}
            {/* 亮起來的那一格（發呆提示） */}
            {glow != null && <span className="mz-glow" style={{ left: centerOf(glow).x, top: centerOf(glow).y, width: cs * 0.72, height: cs * 0.72 }} aria-hidden="true" />}
            {/* 每一格的位置（三歲測試找格子用，看不見、不接收點擊） */}
            {Array.from({ length: cols * rows }, (_, c) => (
              <span key={c} className="mz-cell" data-cell={c} style={{ left: centerOf(c).x - cs / 2, top: centerOf(c).y - cs / 2, width: cs, height: cs }} />
            ))}
            {/* 第 9、10 級：鑰匙、星星（拿到就變大、淡掉） */}
            <AnimatePresence>
              {extra &&
                items
                  .filter((c) => !got.includes(c))
                  .map((c) => (
                    <motion.div
                      key={c}
                      className="mz-item"
                      data-item={extra}
                      data-cell={c}
                      style={{ left: centerOf(c).x - cs * 0.28, top: centerOf(c).y - cs * 0.28, width: cs * 0.56, height: cs * 0.56 }}
                      initial={{ scale: 1, opacity: 1 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 1.5, opacity: 0, transition: { duration: 0.45 } }}
                    >
                      <Emoji name={ITEM_ICON[extra]} />
                    </motion.div>
                  ))}
            </AnimatePresence>
            <motion.div
              key={nudge ? `n${nudge}` : 'goal'}
              className="mz-goal"
              data-goal-thing={goalId}
              style={{ left: gc.x - cs * 0.32, top: gc.y - cs * 0.32, width: cs * 0.64, height: cs * 0.64 }}
              animate={done ? { scale: [1, 1.05, 1], opacity: [1, 1, 0] } : nudge ? { rotate: [0, -8, 8, -5, 0] } : { scale: 1, opacity: 1 }}
              transition={{ duration: done ? 0.8 : 0.5, ease: 'easeInOut' }}
            >
              <span className={`mz-goal-thing${ready ? '' : ' is-locked'}`}>
                <Emoji name={GOALS[goalId].icon} />
              </span>
            </motion.div>
            {/* 第 9 級：終點上一把鎖，拿到鑰匙就打開（淡掉） */}
            <AnimatePresence>
              {extra === 'key' && !ready && (
                <motion.div
                  key="lock"
                  className="mz-lock"
                  style={{ left: gc.x + cs * 0.0, top: gc.y - cs * 0.06, width: cs * 0.42, height: cs * 0.46 }}
                  exit={{ y: -cs * 0.2, opacity: 0, transition: { duration: 0.5 } }}
                >
                  <Padlock />
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              className="mz-dino"
              data-dino={dino}
              style={{ width: dsize, height: dsize }}
              initial={false}
              animate={{ x: dc.x - dsize / 2, y: dc.y - dsize * 0.56 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              <motion.div
                key={bump ? `b${bump.k}` : hop ? `h${hop}` : 'still'}
                style={{ width: '100%', height: '100%' }}
                animate={bump ? { x: [0, DX[bump.d] * cs * 0.12, 0], y: [0, DY[bump.d] * cs * 0.12, 0] } : hop ? { y: [0, -cs * 0.08, 0] } : {}}
                transition={{ duration: 0.32, ease: 'easeOut' }}
              >
                {isDino(dino) ? <Dino who={dino} mood={done ? 'cheer' : 'idle'} size="100%" flip={flip} /> : <MazeAnimal who={dino} flip={flip} />}
              </motion.div>
            </motion.div>
          </>
        )}
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size={`${Math.round(Math.min(110, Math.max(70, cs * 0.6)))}px`} cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !done} />
        {notYet.view}
        {/* 第 9、10 級：右邊空的那一欄放「要拿的東西」的格子（鑰匙 1 格、星星 3 格），拿到一個亮一個；走完收起來（那一欄換成再一個／回首頁） */}
        {extra && !done && (
          <div className="mz-tray" data-tray={extra} aria-hidden="true">
            {items.map((c, i) => (
              <motion.span key={c} className={i < got.length ? 'is-got' : undefined} animate={i < got.length ? { scale: [1, 1.25, 1] } : { scale: 1 }} transition={{ duration: 0.45 }}>
                <Emoji name={ITEM_ICON[extra]} />
              </motion.span>
            ))}
          </div>
        )}
      </div>
      {resting && harderOn && (
        <motion.button
          className={`mz-harder${harderSaid ? ' is-said' : ''}`}
          data-next="harder"
          aria-label="難一點"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          whileTap={{ scale: 0.92 }}
          {...tap('harder', () => {
            sfx.tap()
            onHarder()
          })}
        >
          <span className="mz-harder-art">
            <MazeHarderArt />
          </span>
        </motion.button>
      )}
      {resting && choicesOn && <DoneChoices again={onAgain} againArt={<MazePickArt />} againLabel="再一個" line="mz.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
