import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Hand, HandArt, easeInOut, tween } from '../../games/Demo'
import { Emoji } from '../../art/Emoji'
import { Sparkles } from '../../ui/Sparkles'
import { useIdle } from '../../games/idle'
import { useFlow } from '../../games/barge'
import { wait } from '../../games/lines'
import { samplePath, type P2 } from '../../games/draw/track'
import { COLORS } from '../../content/park'
import { getTodayWorld } from '../../lib/today-world'
import { logAttempt } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { Trace, WRITE_ROUNDS, type RetryBudget } from './Trace'
import type { LessonLetter } from './data'
import './lines-write'
import './write-choice.css'

/** 描字板的邏輯座標（跟 Trace 一樣 100 × 140） */
const VIEW_W = 100
const VIEW_H = 140
/** 塗字母：字母的形狀有多粗（描字的跑道是 20；塗色要胖一點，像泡泡字） */
const SHAPE_W = 27
/** 蠟筆多粗（描字板單位，約 1 公分） */
const CRAYON_W = 11
/** 印章多大 */
const STAMP_SIZE = 22
/** 塗到這個比例就算完成（家長：大約 60%） */
const FILL_DONE = 0.6
/** 完成鈕要按住多久 */
const HOLD_MS = 1200
/** 選擇畫面：沒選的話，幾秒後手指向「描字」 */
const POINT_MS = 8000
/** 塗了多少的格子大小（描字板單位） */
const CELL = 2.5
/** 蠟筆塗到的範圍（比筆粗一點點，三歲塗邊邊也算） */
const PAINT_R = CRAYON_W / 2 + 1.5
const STAMP_R = 9
/** 今天的世界沒有的時候用的印章 */
const STAMPS_FALLBACK = ['glowing-star', 'butterfly', 'sparkles'] as const
/** 蠟筆：紅、黃、藍、綠（三歲最先學的四個顏色） */
const CRAYONS = COLORS.filter((c) => ['red', 'yellow', 'blue', 'green'].includes(c.id))

type Mode = 'pick' | 'trace' | 'color'
type Tool = { kind: 'crayon'; color: string } | { kind: 'stamp'; name: string }
interface Mark {
  color: string
  pts: P2[]
}
interface StampMark {
  x: number
  y: number
  name: string
  rot: number
}

const dOf = (pts: P2[]) => (pts.length === 1 ? `M${pts[0].x} ${pts[0].y}l0.01 0` : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(''))

/** 指尖 (22, 6) 對準 (x, y) 的手（HandArt 是 64 × 84） */
function SvgHand({ at, scale = 0.32, tap = 0 }: { at: P2; scale?: number; tap?: number }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`} pointerEvents="none" data-demo-hand="">
      {tap > 0 && <motion.circle key={tap} r={4} fill="none" stroke="#F0B088" strokeWidth={1.4} initial={{ r: 3, opacity: 0.9 }} animate={{ r: 13, opacity: 0 }} transition={{ duration: 0.6 }} />}
      <motion.g key={`h${tap}`} animate={tap ? { scale: [1, 0.86, 1] } : {}} transition={{ duration: 0.34 }}>
        <g transform={`scale(${scale}) translate(-22 -6)`}>
          <HandArt />
        </g>
      </motion.g>
    </g>
  )
}

/** 字母的形狀：每一筆的取樣點（算塗了多少、點的地方在不在字母裡） */
function useShape(strokes: string[]) {
  return useMemo(() => {
    const samples = strokes.flatMap((d) => samplePath(d, 1.5))
    const cols = Math.ceil(VIEW_W / CELL) + 1
    const rows = Math.ceil(VIEW_H / CELL) + 1
    const inside = new Uint8Array(cols * rows)
    let total = 0
    const near = (x: number, y: number, r: number) => samples.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 <= r * r)
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        if (near(i * CELL, j * CELL, SHAPE_W / 2 - 1)) {
          inside[j * cols + i] = 1
          total++
        }
    /** 塗色的手示範：沿著第一筆左右晃（像小朋友塗色） */
    const first = samplePath(strokes[0], 3)
    const wiggle = first.map((p, i) => {
      const a = first[Math.max(0, i - 1)]
      const b = first[Math.min(first.length - 1, i + 1)]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const side = (i % 2 ? 1 : -1) * SHAPE_W * 0.28
      return { x: p.x + (-(b.y - a.y) / len) * side, y: p.y + ((b.x - a.x) / len) * side }
    })
    const last = samplePath(strokes[strokes.length - 1], 3)
    const stampAt = last[Math.floor(last.length / 2)]
    return { cols, rows, inside, total, near: (p: P2) => near(p.x, p.y, SHAPE_W / 2), wiggle, stampAt }
  }, [strokes])
}

/** 字母形狀的底：深色的邊、白色的裡面（泡泡字） */
function ShapeBase({ strokes, rim = '#6B6258', fill = '#FFFDF8' }: { strokes: string[]; rim?: string; fill?: string }) {
  return (
    <g>
      {strokes.map((d, i) => (
        <path key={`r${i}`} d={d} fill="none" stroke={rim} strokeWidth={SHAPE_W + 3.4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {strokes.map((d, i) => (
        <path key={`f${i}`} d={d} fill="none" stroke={fill} strokeWidth={SHAPE_W} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </g>
  )
}

/** 只留字母形狀裡面的遮罩（筆跡、印章都畫在這個遮罩裡，塗不出去） */
function ShapeMask({ id, strokes }: { id: string; strokes: string[] }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={VIEW_W} height={VIEW_H}>
      {strokes.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={SHAPE_W} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </mask>
  )
}

/**
 * 寫寫看（英文課第 4 段，T-127 B 案「他想畫畫」）：先出兩張大卡片，二選一。
 * - 描字：跟以前一樣（Trace + WRITE_ROUNDS，大寫一輪、不示範），作答紀錄照舊。
 * - 塗字母：在今天字母（大寫）的泡泡字裡用蠟筆塗色，或用今天世界的印章蓋（lib/today-world.ts 的 stamps）。
 *   筆跡、印章都只畫在字母形狀裡（SVG 遮罩）。塗到大約六成（FILL_DONE），或按住完成鈕（HOLD_MS），就算完成、出「下一步」。
 * 兩張卡片上手各示範一次（描、塗＋蓋印章），關掉聲音也看得懂；沒選的話 8 秒後手指向「描字」。
 * 塗字母開始時手再示範一次（可以搶：一碰畫板示範就收掉）；10 秒沒動手再安靜示範一次。
 * 作答紀錄：塗字母記 game 'en-color'、skill 沿用 write:<大寫>，phase 'guided'（不更新熟練度，家長區的「寫過的字母」也不算），
 * 所以不影響描字的熟練判斷。
 */
export function WriteChoice({ letter, retry, onDone }: { letter: LessonLetter; retry?: RetryBudget; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('pick')
  if (mode === 'trace') return <Trace letter={letter} rounds={WRITE_ROUNDS} retry={retry} onDone={() => onDone()} />
  if (mode === 'color') return <ColorLetter letter={letter} onDone={onDone} />
  return <Pick letter={letter} onPick={setMode} />
}

/** 二選一的畫面：兩張大卡片，手各示範一次 */
function Pick({ letter, onPick }: { letter: LessonLetter; onPick: (m: 'trace' | 'color') => void }) {
  const strokes = letter.upper
  const shape = useShape(strokes)
  const traceSamples = useMemo(() => strokes.map((d) => samplePath(d, 2)), [strokes])
  const maskId = `wc-pick-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  /** 描字卡的示範進度（0～筆數）、塗色卡的示範進度（0～1） */
  const [a, setA] = useState(0)
  const [b, setB] = useState(0)
  const [stamp, setStamp] = useState(0)
  const [showing, setShowing] = useState<'trace' | 'color' | null>('trace')
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const chosen = useRef(false)
  const live = useRef(true)
  const flow = useFlow()
  const box = useRef<HTMLDivElement>(null)
  const traceCard = useRef<HTMLButtonElement>(null)
  const stampName = (getTodayWorld()?.stamps ?? STAMPS_FALLBACK)[0]

  useEffect(() => {
    live.current = true
    const ok = flow.begin(live)
    void say('en.write.pick')
    void (async () => {
      await wait(500)
      if (!ok()) return
      setShowing('trace')
      await tween(2000, (f) => setA(f * strokes.length), ok, easeInOut)
      if (!ok()) return
      await wait(350)
      if (!ok()) return
      setShowing('color')
      await tween(1800, setB, ok, easeInOut)
      if (!ok()) return
      sfx.pop()
      setStamp(1)
      await wait(700)
      if (ok()) setShowing(null)
    })()
    const t = window.setTimeout(() => {
      if (chosen.current || !box.current || !traceCard.current) return
      // 手指向「描字」：卡片的中間偏下（量畫面上的位置）
      const o = box.current.getBoundingClientRect()
      const r = traceCard.current.getBoundingClientRect()
      setPoint({ x: ((r.left + r.width * 0.55 - o.left) / o.width) * 100, y: ((r.top + r.height * 0.62 - o.top) / o.height) * 100 })
    }, POINT_MS)
    return () => {
      live.current = false
      clearTimeout(t)
    }
  }, [])

  const choose = (m: 'trace' | 'color') => {
    if (chosen.current) return
    chosen.current = true
    flow.cut()
    stopSpeech()
    sfx.pop()
    onPick(m)
  }

  // 描字卡：手指尖在第幾筆的哪裡
  const k = Math.min(strokes.length - 1, Math.floor(a))
  const ss = traceSamples[k]
  const tipA = ss[Math.min(ss.length - 1, Math.round((a - k) * (ss.length - 1)))]
  const wig = shape.wiggle
  const nB = Math.max(1, Math.round(b * (wig.length - 1)))
  const tipB = wig[Math.min(wig.length - 1, nB)]

  return (
    <div className="en-write-pick" ref={box} data-demo={showing ? '1' : undefined}>
      <button type="button" className="wc-card is-trace" data-write-pick="trace" ref={traceCard} onClick={() => choose('trace')} aria-label="描字">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
          {strokes.map((d, i) => (
            <g key={i}>
              <path d={d} fill="none" stroke="#E6DEF3" strokeWidth={23} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke="#FBF8F2" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke="#C7B6E8" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${Math.max(0, Math.min(1, a - i))} 2`} />
              <path d={d} fill="none" stroke="#A99BC4" strokeWidth={1.2} strokeDasharray="3 3" strokeLinecap="round" />
            </g>
          ))}
          <circle cx={traceSamples[0][0].x} cy={traceSamples[0][0].y} r={6} fill="#4E9A72" />
          {showing === 'trace' && tipA && <SvgHand at={tipA} />}
        </svg>
        <span className="wc-label">描字</span>
      </button>
      <button type="button" className="wc-card is-color" data-write-pick="color" onClick={() => choose('color')} aria-label="塗字母">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
          <defs>
            <ShapeMask id={maskId} strokes={strokes} />
          </defs>
          <ShapeBase strokes={strokes} />
          <g mask={`url(#${maskId})`}>
            {b > 0 && <path d={dOf(wig.slice(0, nB + 1))} fill="none" stroke={CRAYONS[0].hex} strokeWidth={CRAYON_W} strokeLinecap="round" strokeLinejoin="round" />}
            {stamp > 0 && (
              <motion.g initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }} style={{ transformOrigin: `${shape.stampAt.x}px ${shape.stampAt.y}px`, transformBox: 'view-box' }}>
                <g transform={`translate(${shape.stampAt.x - STAMP_SIZE / 2} ${shape.stampAt.y - STAMP_SIZE / 2})`}>
                  <Emoji name={stampName} size={STAMP_SIZE} />
                </g>
              </motion.g>
            )}
          </g>
          {showing === 'color' && tipB && <SvgHand at={stamp ? shape.stampAt : tipB} tap={stamp} />}
        </svg>
        <span className="wc-tools" aria-hidden="true">
          <i style={{ background: CRAYONS[0].hex }} />
          <i style={{ background: CRAYONS[2].hex }} />
          <Emoji name={stampName} size={30} />
        </span>
        <span className="wc-label">塗顏色</span>
      </button>
      <AnimatePresence>{point && <Hand key="point" x={point.x} y={point.y} beckon size="min(12vmin, 110px)" />}</AnimatePresence>
    </div>
  )
}

/** 塗字母：蠟筆塗色、印章蓋章，都只畫在字母形狀裡 */
function ColorLetter({ letter, onDone }: { letter: LessonLetter; onDone: () => void }) {
  const strokes = letter.upper
  const shape = useShape(strokes)
  const maskId = `wc-shape-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const stamps = getTodayWorld()?.stamps ?? STAMPS_FALLBACK
  const [tool, setTool] = useState<Tool>({ kind: 'crayon', color: CRAYONS[0].hex })
  const [marks, setMarks] = useState<Mark[]>([])
  const [liveMark, setLiveMark] = useState<Mark | null>(null)
  const [stampMarks, setStampMarks] = useState<StampMark[]>([])
  /** 手示範：塗到哪裡（wiggle 的第幾點）、印章蓋了沒、正在收掉 */
  const [demo, setDemo] = useState<{ n: number; stamp: boolean; fade: boolean } | null>(null)
  const [demoTap, setDemoTap] = useState(0)
  const [done, setDone] = useState(false)
  const [doneTap, setDoneTap] = useState(0)
  const [holding, setHolding] = useState(false)
  const [started, setStarted] = useState(false)
  const painted = useRef(new Uint8Array(shape.cols * shape.rows))
  const count = useRef(0)
  const drawing = useRef<{ id: number; last: P2; mark: Mark } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const live = useRef(true)
  const flow = useFlow()
  const idle = useIdle()
  const busy = useRef(false)
  const t0 = useRef(performance.now())
  const holdTimer = useRef(0)
  const spoke = useRef(false)
  const demoStamp = stamps[0]
  /** 蓋了幾個印章（finish 在蓋章的同一下就可能被叫，不能讀 state） */
  const stampN = useRef(0)

  const toLocal = (e: { clientX: number; clientY: number }): P2 | null => {
    const m = svg.current?.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  /** 把 p 附近 r 以內、在字母裡的格子記成塗過；塗到 FILL_DONE 就完成 */
  const paint = (p: P2, r: number) => {
    const { cols, rows, inside } = shape
    const i0 = Math.max(0, Math.floor((p.x - r) / CELL))
    const i1 = Math.min(cols - 1, Math.ceil((p.x + r) / CELL))
    const j0 = Math.max(0, Math.floor((p.y - r) / CELL))
    const j1 = Math.min(rows - 1, Math.ceil((p.y + r) / CELL))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const c = j * cols + i
        if (!inside[c] || painted.current[c]) continue
        if ((i * CELL - p.x) ** 2 + (j * CELL - p.y) ** 2 > r * r) continue
        painted.current[c] = 1
        count.current++
      }
  }
  const paintLine = (a: P2, b: P2) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2))
    for (let s = 1; s <= n; s++) paint({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n }, PAINT_R)
  }
  const checkFull = () => {
    if (shape.total && count.current / shape.total >= FILL_DONE) void finish('fill')
  }

  /** 手示範：沿著第一筆左右晃著塗、在最後一筆中間蓋一個印章，然後收掉。quiet：不說話（閒置時再示範） */
  const showMe = async (quiet: boolean) => {
    if (busy.current) return
    const ok = flow.begin(live)
    if (!quiet) void say('en.color.go')
    const wig = shape.wiggle
    setDemo({ n: 1, stamp: false, fade: false })
    await wait(250)
    if (!ok()) return
    await tween(1900, (f) => setDemo((d) => (d ? { ...d, n: Math.max(1, Math.round(f * (wig.length - 1))) } : d)), ok, easeInOut)
    if (!ok()) return
    await wait(200)
    if (!ok()) return
    sfx.pop()
    setDemoTap((t) => t + 1)
    setDemo((d) => (d ? { ...d, stamp: true } : d))
    await wait(900)
    if (!ok()) return
    setDemo((d) => (d ? { ...d, fade: true } : d))
    await wait(450)
    if (!ok()) return
    setDemo(null)
    if (!quiet) await say('teach.turn.dodo')
    if (ok()) openTurn()
  }

  const openTurn = () => {
    if (busy.current) return
    idle.start(
      {
        repeat: () => void showMe(true),
        hint: () => {
          if (!spoke.current) void say('en.color.go')
          spoke.current = true
          void showMe(true)
        },
      },
      { repeat: 10_000, hint: 15_000 },
    )
  }

  useEffect(() => {
    live.current = true
    void showMe(false)
    return () => {
      live.current = false
      clearTimeout(holdTimer.current)
      idle.stop()
    }
  }, [])

  /** 孩子搶著動手：示範收掉、不再說話，直接輪到他 */
  const takeOver = () => {
    flow.cut()
    setDemo(null)
    openTurn()
  }

  const finish = async (how: 'fill' | 'hold') => {
    if (busy.current) return
    busy.current = true
    drawing.current = null
    setHolding(false)
    clearTimeout(holdTimer.current)
    idle.stop()
    flow.cut()
    setDemo(null)
    setDone(true)
    sfx.done()
    const cover = shape.total ? count.current / shape.total : 0
    void logAttempt({
      station: 'english',
      game: 'en-color',
      itemId: `write:${letter.L}`,
      skill: `write:${letter.L}`,
      // 一起玩的紀錄：不更新熟練度、家長區的「寫過的字母」只算描字（db.ts 的 phaseOf === 'quiz'）
      phase: 'guided',
      level: 1,
      options: [],
      answer: letter.L,
      taps: [],
      firstTryCorrect: true,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { cover: Math.round(cover * 100) / 100, stamps: stampN.current, ...(how === 'hold' ? { held: 1 } : {}) },
    })
    await say('en.color.done', `ph.${letter.l}.big`)
    if (live.current) onDone()
  }

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (busy.current) {
      // 塗完、稱讚的時候碰畫板：字再跳一下（不會多記一筆）
      sfx.tap()
      setDoneTap((n) => n + 1)
      return
    }
    if (drawing.current) return // 多指：只認第一隻
    const p = toLocal(e)
    if (!p) return
    if (demo) takeOver()
    else idle.poke()
    setStarted(true)
    if (tool.kind === 'stamp') {
      if (!shape.near(p)) return void sfx.tap()
      sfx.pop()
      setStampMarks((s) => [...s, { x: p.x, y: p.y, name: tool.name, rot: Math.round(Math.random() * 30 - 15) }])
      stampN.current++
      paint(p, STAMP_R)
      return checkFull()
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const mark = { color: tool.color, pts: [p] }
    drawing.current = { id: e.pointerId, last: p, mark }
    setLiveMark({ ...mark })
    paint(p, PAINT_R)
  }
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drawing.current
    if (!d || d.id !== e.pointerId) return
    const p = toLocal(e)
    if (!p || Math.hypot(p.x - d.last.x, p.y - d.last.y) < 0.8) return
    paintLine(d.last, p)
    d.last = p
    d.mark.pts.push(p)
    setLiveMark({ color: d.mark.color, pts: d.mark.pts.slice() })
    idle.poke()
    checkFull()
  }
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drawing.current
    if (!d || d.id !== e.pointerId) return
    drawing.current = null
    setMarks((m) => [...m, d.mark])
    setLiveMark(null)
    checkFull()
  }

  /** 完成鈕：按住 HOLD_MS（只點一下不算，免得三歲亂點就跳過） */
  const holdStart = (e: ReactPointerEvent) => {
    e.preventDefault()
    if (busy.current) return
    idle.poke()
    setHolding(true)
    clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => void finish('hold'), HOLD_MS)
  }
  const holdEnd = () => {
    clearTimeout(holdTimer.current)
    setHolding(false)
  }

  const wig = shape.wiggle
  const demoTip = demo ? (demo.stamp ? shape.stampAt : wig[Math.min(wig.length - 1, demo.n)]) : null

  return (
    <div className="en-color" data-demo={demo ? '1' : undefined} data-accepting={done ? 'false' : undefined} data-color-done={done ? '' : undefined}>
      <div className="en-trace-paper wc-paper">
        <div className="en-trace-board">
          <svg
            ref={svg}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="en-trace-svg wc-board"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <defs>
              <ShapeMask id={maskId} strokes={strokes} />
            </defs>
            <motion.g key={doneTap} className={done ? 'trace-pop' : undefined} data-trace-finished={done ? '' : undefined}>
              <ShapeBase strokes={strokes} />
              <g mask={`url(#${maskId})`}>
                {marks.map((m, i) => (
                  <path key={i} d={dOf(m.pts)} fill="none" stroke={m.color} strokeWidth={CRAYON_W} strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {liveMark && <path d={dOf(liveMark.pts)} fill="none" stroke={liveMark.color} strokeWidth={CRAYON_W} strokeLinecap="round" strokeLinejoin="round" />}
                {stampMarks.map((s, i) => (
                  <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.rot}) translate(${-STAMP_SIZE / 2} ${-STAMP_SIZE / 2})`}>
                    <Emoji name={s.name} size={STAMP_SIZE} />
                  </g>
                ))}
                {/* 手示範的塗色和印章（收掉時淡出） */}
                {demo && (
                  <motion.g animate={{ opacity: demo.fade ? 0 : 0.9 }} transition={{ duration: 0.4 }}>
                    <path d={dOf(wig.slice(0, demo.n + 1))} fill="none" stroke={CRAYONS[0].hex} strokeWidth={CRAYON_W} strokeLinecap="round" strokeLinejoin="round" />
                    {demo.stamp && (
                      <g transform={`translate(${shape.stampAt.x - STAMP_SIZE / 2} ${shape.stampAt.y - STAMP_SIZE / 2})`}>
                        <Emoji name={demoStamp} size={STAMP_SIZE} />
                      </g>
                    )}
                  </motion.g>
                )}
              </g>
            </motion.g>
            {demoTip && !demo?.fade && <SvgHand at={demoTip} tap={demo?.stamp ? demoTap : 0} />}
          </svg>
          {done && (
            <div className="wc-spark">
              <Sparkles count={18} />
            </div>
          )}
        </div>
      </div>
      {/* 工具：四支蠟筆、今天世界的印章；按住完成鈕（塗過一下才出來） */}
      <div className="wc-toolbar" aria-hidden="true">
        {CRAYONS.map((c) => {
          const on = tool.kind === 'crayon' && tool.color === c.hex
          return (
            <button key={c.id} type="button" className={`wc-tool wc-crayon${on ? ' is-on' : ''}`} data-crayon={c.id} style={{ '--c': c.hex } as CSSProperties} onPointerDown={() => (sfx.tap(), idle.poke(), setTool({ kind: 'crayon', color: c.hex }))}>
              <i />
            </button>
          )
        })}
        {stamps.map((s) => {
          const on = tool.kind === 'stamp' && tool.name === s
          return (
            <button key={s} type="button" className={`wc-tool wc-stamp${on ? ' is-on' : ''}`} data-stamp={s} onPointerDown={() => (sfx.tap(), idle.poke(), setTool({ kind: 'stamp', name: s }))}>
              <Emoji name={s} size="76%" />
            </button>
          )
        })}
      </div>
      <AnimatePresence>
        {started && !done && (
          <motion.button
            key="hold"
            type="button"
            className={`wc-hold${holding ? ' is-holding' : ''}`}
            data-color-hold=""
            aria-label="按住完成"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            style={{ '--hold-ms': `${HOLD_MS}ms` } as CSSProperties}
            onPointerDown={holdStart}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx={32} cy={32} r={28} className="wc-hold-track" />
              <circle cx={32} cy={32} r={28} className="wc-hold-ring" pathLength={1} />
              <path d="M19 33 L28 42 L46 23" className="wc-hold-check" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
