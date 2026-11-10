import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand, easeInOut, tween } from '../../games/Demo'
import { RainbowDef } from '../../games/draw/TraceFx'
import { samplePath, type P2 } from '../../games/draw/track'
import { useFlow } from '../../games/barge'
import { firstFinger } from '../../games/NotYet'
import { wait } from '../../games/lines'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { logTeach } from '../../lib/record'
import { Sparkles } from '../../ui/Sparkles'
import type { LessonLetter } from './data'

/** 描字板的邏輯座標（跟 Trace 一樣：寬 100、高 140） */
const VW = 100
const VH = 140
/** 字的粗細（跟描字的跑道一樣寬，塗色、印章都只會留在這個形狀裡） */
const LANE = 20
/** 塗到字的這麼多就算塗好了 */
const ENOUGH = 0.6
/** 筆刷碰到的範圍（描字板單位）：手指畫過的地方，旁邊這麼近的字都算塗到 */
const BRUSH_R = 8
const STAMP_R = 12
/** 幾秒沒動：手再示範一小段；幾秒還沒塗好：幫他塗好、往下走（不卡住） */
const IDLE_MS = 9000
const HELP_MS = 45000

/** 三支蠟筆（紙感螢幕：淡、低彩度） */
const COLORS = ['#F2A65A', '#6FB7E0', '#E58FA8'] as const
/** 沒有今天的世界時的印章 */
const STAMPS = ['glowing-star', 'butterfly', 'sunflower'] as const

type Tool = { kind: 'color'; c: string } | { kind: 'stamp'; name: string }

/** 寫寫看要描字還是塗色 */
export type WriteMode = 'trace' | 'paint'

/** 測試、家長除錯用：localStorage 的 `dodo:en-write` 設成 trace／paint 就不問、直接用那一種 */
export function forcedWrite(): WriteMode | null {
  try {
    const v = globalThis.localStorage?.getItem('dodo:en-write')
    return v === 'trace' || v === 'paint' ? v : null
  } catch {
    return null
  }
}

/**
 * 寫寫看之前讓孩子選（T-127 B 案「他想畫畫」，docs/T-127-新鮮感提案.md 第四節 (a)）：描字，或幫字母塗顏色、蓋印章。
 * 兩張大卡：左邊是描字（跑道、綠點、鉛筆），右邊是塗色（塗了顏色的字、蠟筆、印章）。
 * 不用聽懂英文（關掉聲音也看得懂）：手先點一下左邊、再點一下右邊（不幫他選），兩張都輕輕跳一下；之後他點哪張就是哪張。
 * 示範、念的時候點也算選（T-108 搶點）。8 秒沒選：手再指一次（最多 3 次，之後靜止，MOTION-2）。
 */
export function WriteChoice({ letter, stamp, onPick }: { letter: LessonLetter; stamp: string; onPick: (m: WriteMode) => void }) {
  const still = useReducedMotion()
  const [picked, setPicked] = useState<WriteMode | null>(null)
  const [hand, setHand] = useState<{ x: number; y: number; tap: number } | null>(null)
  const [hop, setHop] = useState<{ m: WriteMode; n: number } | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const cards = useRef(new Map<WriteMode, HTMLElement>())
  const live = useRef(true)
  const flow = useFlow()
  const done = useRef(false)

  /** 手指到這張卡的中間偏下 */
  const point = (m: WriteMode) => {
    const el = cards.current.get(m)
    const b = root.current?.getBoundingClientRect()
    if (!el || !b) return null
    const r = el.getBoundingClientRect()
    return { x: ((r.left + r.width * 0.55 - b.left) / b.width) * 100, y: ((r.top + r.height * 0.62 - b.top) / b.height) * 100 }
  }
  const show = async (ok: () => boolean) => {
    let n = 0
    for (const m of ['trace', 'paint'] as const) {
      const p = point(m)
      if (!p) return
      setHand({ ...p, tap: 0 })
      await wait(700)
      if (!ok()) return
      setHand({ ...p, tap: ++n })
      setHop({ m, n })
      sfx.tap()
      await wait(900)
      if (!ok()) return
    }
    setHand(null)
  }

  useEffect(() => {
    live.current = true
    let idle = 0
    const run = async () => {
      const ok = flow.begin(live)
      await wait(400)
      if (!ok()) return
      void say('le.en.choose')
      await show(ok)
      // 8 秒沒選：手再指一次，最多 3 次
      let times = 0
      const again = () => {
        idle = window.setTimeout(async () => {
          if (!live.current || done.current || times++ >= 3) return
          await show(flow.begin(live))
          again()
        }, 8000)
      }
      if (ok()) again()
    }
    void run()
    return () => {
      live.current = false
      clearTimeout(idle)
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (m: WriteMode) => {
    if (done.current) return void sfx.notYet()
    done.current = true
    flow.cut()
    setHand(null)
    setPicked(m)
    sfx.pop()
    window.setTimeout(() => live.current && onPick(m), still ? 150 : 550)
  }

  return (
    <div className="en-choose" ref={root}>
      {(['trace', 'paint'] as const).map((m) => (
        <motion.button
          key={m}
          type="button"
          ref={(el: HTMLButtonElement | null) => {
            if (el) cards.current.set(m, el)
          }}
          className={`en-choose-card is-${m}${picked === m ? ' is-picked' : picked ? ' is-other' : ''}`}
          aria-label={m === 'trace' ? '描字' : '塗顏色'}
          animate={still ? {} : picked === m ? { scale: [1, 1.1, 1.04], y: [0, -16, -6] } : hop?.m === m ? { y: [0, -14, 0] } : { y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          // 按下就算（三歲手指一滑 click 會被取消，T-112）
          onPointerDown={(e) => {
            if (firstFinger(e.nativeEvent)) pick(m)
          }}
          onClick={(e) => {
            if (e.detail === 0) pick(m)
          }}
        >
          <svg viewBox={`0 0 ${VW} ${VH}`} className="en-choose-art" aria-hidden="true">
            {m === 'paint' && (
              <defs>
                <mask id="en-choose-mask">
                  <rect width={VW} height={VH} fill="#000" />
                  {letter.upper.map((d, i) => (
                    <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </mask>
              </defs>
            )}
            {letter.upper.map((d, i) => (
              <g key={i}>
                <path d={d} fill="none" stroke={m === 'trace' ? '#CFE3D6' : '#F1D9C4'} strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="#FBF8F2" strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
                {m === 'trace' && <path d={d} fill="none" stroke="#9DB5A6" strokeWidth={1.4} strokeDasharray="3 3" strokeLinecap="round" />}
              </g>
            ))}
            {m === 'paint' && (
              <g mask="url(#en-choose-mask)">
                <rect x={0} y={0} width={VW} height={VH * 0.36} fill={COLORS[0]} />
                <rect x={0} y={VH * 0.36} width={VW} height={VH * 0.3} fill={COLORS[1]} />
                <rect x={0} y={VH * 0.66} width={VW} height={VH * 0.34} fill={COLORS[2]} />
              </g>
            )}
            {m === 'trace' && <circle cx={samplePoint(letter.upper[0]).x} cy={samplePoint(letter.upper[0]).y} r={6} fill="#4E9A72" />}
          </svg>
          {/* 拿什麼做：描字是鉛筆、塗色是蠟筆和一個印章 */}
          <span className="en-choose-tool" aria-hidden="true">
            <Emoji name={m === 'trace' ? 'pencil' : 'crayon'} />
          </span>
          {m === 'paint' && (
            <span className="en-choose-stamp" aria-hidden="true">
              <Emoji name={stamp} />
            </span>
          )}
        </motion.button>
      ))}
      <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
    </div>
  )
}

/** 一筆的起點（描字卡上的綠點） */
function samplePoint(d: string): P2 {
  try {
    return samplePath(d, 50)[0]
  } catch {
    return { x: 0, y: 0 }
  }
}

/**
 * 幫字母塗顏色、蓋印章（T-127 B 案，寫寫看的另一種）：今天的大寫字母放大，形狀跟描字一樣粗。
 * - 右邊三支蠟筆、兩三個今天世界的印章。手指在字上塗，顏色只留在字的形狀裡（mask），塗出去的看不到、不算錯。
 * - 選印章、點在字上：蓋一個印章（點在字外面：字亮一下，告訴他要蓋在字上）。
 * - 塗到字的六成（ENOUGH）：整個字亮成彩虹、星星、So pretty!，然後停住等「下一步」（index.tsx）。
 * - 一開始手先示範（關掉聲音也看得懂）：手在字上塗一段、去拿印章、在字上蓋一個，然後收掉示範的顏色，換他。
 *   示範時下筆就搶掉（T-108），直接換他塗。
 * - 9 秒沒動：手在還沒塗的地方再塗一小段給他看（不出墨）；45 秒還沒塗好：幫他塗好，照樣往下（不卡住）。
 * - 多指：只理第一根手指。塗到一半放手：塗過的留著，可以接著塗。
 * - 不算熟練（這是認字母的樣子，不是寫字）：只記一筆教學紀錄（game lesson-en-paint）。
 */
export function Paint({ letter, stamps, onDone }: { letter: LessonLetter; stamps?: readonly string[]; onDone: () => void }) {
  const still = useReducedMotion()
  const strokes = letter.upper
  const marks = useMemo(() => (stamps?.length ? stamps.slice(0, 3) : [...STAMPS]), [stamps])
  const samples = useMemo(() => strokes.flatMap((d) => samplePath(d, 3)), [strokes])
  const covered = useRef<Uint8Array>(new Uint8Array(0))
  if (covered.current.length !== samples.length) covered.current = new Uint8Array(samples.length)
  const [lines, setLines] = useState<{ c: string; pts: P2[]; demo?: boolean }[]>([])
  const [stamped, setStamped] = useState<{ name: string; x: number; y: number; demo?: boolean }[]>([])
  const [tool, setTool] = useState<Tool>({ kind: 'color', c: COLORS[0] })
  const [done, setDone] = useState(false)
  const [glow, setGlow] = useState(0)
  const [hand, setHand] = useState<{ x: number; y: number; tap: number } | null>(null)
  const [ratio, setRatio] = useState(0)
  const root = useRef<HTMLDivElement | null>(null)
  const board = useRef<HTMLDivElement | null>(null)
  const toolEls = useRef(new Map<string, HTMLElement>())
  const phase = useRef<'demo' | 'turn' | 'done'>('demo')
  const grip = useRef<number | null>(null)
  const live = useRef(true)
  const flow = useFlow()
  const lastAct = useRef(performance.now())
  const turnAt = useRef(0)
  const t0 = useRef(performance.now())
  const toolRef = useRef(tool)
  toolRef.current = tool

  /** 描字板座標 → 整個畫面（root）的百分比（手要指的位置） */
  const toRoot = (p: P2) => {
    const b = board.current?.getBoundingClientRect()
    const o = root.current?.getBoundingClientRect()
    if (!b || !o || !o.width) return null
    return { x: ((b.left + (p.x / VW) * b.width - o.left) / o.width) * 100, y: ((b.top + (p.y / VH) * b.height - o.top) / o.height) * 100 }
  }
  const toolAt = (id: string) => {
    const el = toolEls.current.get(id)
    const o = root.current?.getBoundingClientRect()
    if (!el || !o) return null
    const r = el.getBoundingClientRect()
    return { x: ((r.left + r.width * 0.55 - o.left) / o.width) * 100, y: ((r.top + r.height * 0.6 - o.top) / o.height) * 100 }
  }
  const toView = (x: number, y: number): P2 | null => {
    const b = board.current?.getBoundingClientRect()
    if (!b || !b.width) return null
    return { x: ((x - b.left) / b.width) * VW, y: ((y - b.top) / b.height) * VH }
  }
  const nearLetter = (p: P2, r: number) => samples.some((s) => Math.hypot(s.x - p.x, s.y - p.y) <= r)

  /** 塗到（或蓋到）這一點：旁邊的字算塗到了；夠了就塗好 */
  const cover = (p: P2, r: number) => {
    const c = covered.current
    for (let i = 0; i < samples.length; i++) if (!c[i] && Math.hypot(samples[i].x - p.x, samples[i].y - p.y) <= r) c[i] = 1
    let n = 0
    for (let i = 0; i < c.length; i++) n += c[i]
    const f = n / Math.max(1, c.length)
    setRatio(f)
    if (f >= ENOUGH && phase.current === 'turn') void finish(false)
  }

  const finish = async (helped: boolean) => {
    if (phase.current === 'done') return
    phase.current = 'done'
    grip.current = null
    setHand(null)
    setDone(true)
    sfx.done()
    void logTeach({ station: 'english', game: 'lesson-en-paint', itemId: `paint:${letter.L}`, skill: `letter:${letter.L}`, level: 1, ms: Math.round(performance.now() - t0.current), ...(helped ? { retaught: true } : {}) })
    await say('le.en.pretty')
    await wait(200)
    if (live.current) onDone()
  }

  /** 換他：示範的顏色、印章收掉，開始計時 */
  const yourTurn = () => {
    if (phase.current !== 'demo') return
    phase.current = 'turn'
    setHand(null)
    setLines((ls) => ls.filter((l) => !l.demo))
    setStamped((ss) => ss.filter((s) => !s.demo))
    turnAt.current = performance.now()
    lastAct.current = performance.now()
  }

  /** 手在字上塗一小段（示範、發呆的提示）。ink：畫不畫出顏色 */
  const brushDemo = async (ok: () => boolean, from: number, len: number, ink: boolean) => {
    const pts = samples.slice(from, Math.min(samples.length, from + len))
    if (!pts.length) return
    if (ink) setLines((ls) => [...ls, { c: COLORS[1], pts: [pts[0]], demo: true }])
    const start = toRoot(pts[0])
    if (start) setHand({ ...start, tap: 0 })
    await wait(500)
    if (!ok()) return
    await tween(
      1400,
      (f) => {
        const k = Math.max(1, Math.round(f * (pts.length - 1)))
        const at = toRoot(pts[k])
        if (at) setHand((h) => (h ? { ...at, tap: h.tap } : null))
        if (ink) setLines((ls) => ls.map((l, i) => (i === ls.length - 1 ? { ...l, pts: pts.slice(0, k + 1) } : l)))
      },
      ok,
      easeInOut,
    )
  }

  useEffect(() => {
    live.current = true
    const run = async () => {
      const ok = flow.begin(live)
      await wait(350)
      if (!ok()) return
      // 我做：手在字上塗一段、拿印章蓋一個，然後換他
      void say('teach.watch.dodo')
      await brushDemo(ok, 0, Math.ceil(samples.length * 0.3), true)
      if (!ok()) return
      const tp = toolAt(marks[0])
      if (tp) {
        setHand({ ...tp, tap: 0 })
        await wait(700)
        if (!ok()) return
        setHand({ ...tp, tap: 1 })
        sfx.tap()
        await wait(500)
        if (!ok()) return
      }
      const spot = samples[Math.floor(samples.length * 0.7)]
      const sp = spot && toRoot(spot)
      if (spot && sp) {
        setHand({ ...sp, tap: 1 })
        await wait(700)
        if (!ok()) return
        setHand({ ...sp, tap: 2 })
        setStamped((ss) => [...ss, { name: marks[0], x: spot.x, y: spot.y, demo: true }])
        sfx.pop()
        await wait(700)
        if (!ok()) return
      }
      await say(`ph.${letter.l}.paint`)
      if (!ok()) return
      await say('teach.turn.dodo')
      if (!ok()) return
      yourTurn()
    }
    void run()
    // 發呆：9 秒沒動，手在還沒塗的地方塗一小段（不出墨）；45 秒還沒塗好，幫他塗好、往下走
    const tick = window.setInterval(() => {
      if (!live.current || phase.current !== 'turn' || grip.current != null) return
      const now = performance.now()
      if (now - turnAt.current > HELP_MS) return void finish(true)
      if (now - lastAct.current > IDLE_MS) {
        lastAct.current = now
        const gap = covered.current.findIndex((x) => !x)
        const ok = flow.begin(live)
        void brushDemo(ok, Math.max(0, gap), 18, false).then(() => ok() && setHand(null))
      }
    }, 500)
    return () => {
      live.current = false
      clearInterval(tick)
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 示範、說明的時候動手：示範收掉，直接換他（T-108） */
  const takeOver = () => {
    if (phase.current !== 'demo') return
    flow.cut()
    yourTurn()
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!firstFinger(e.nativeEvent) || grip.current != null) return
    if (phase.current === 'done') return void sfx.tap()
    takeOver()
    flow.cut()
    setHand(null)
    lastAct.current = performance.now()
    const p = toView(e.clientX, e.clientY)
    if (!p) return
    const t = toolRef.current
    if (t.kind === 'stamp') {
      // 印章要蓋在字上：蓋在外面，字亮一下（告訴他蓋在這裡）
      if (!nearLetter(p, LANE * 0.8)) {
        sfx.gentle()
        setGlow((g) => g + 1)
        return
      }
      setStamped((ss) => [...ss, { name: t.name, x: p.x, y: p.y }])
      sfx.pop()
      cover(p, STAMP_R)
      return
    }
    grip.current = e.pointerId
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 合成的事件 */
    }
    setLines((ls) => [...ls, { c: t.c, pts: [p] }])
    sfx.ink()
    cover(p, BRUSH_R)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (grip.current !== e.pointerId || phase.current !== 'turn') return
    const p = toView(e.clientX, e.clientY)
    if (!p) return
    lastAct.current = performance.now()
    setLines((ls) => ls.map((l, i) => (i === ls.length - 1 ? { ...l, pts: [...l.pts, p] } : l)))
    cover(p, BRUSH_R)
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (grip.current === e.pointerId) grip.current = null
  }

  const pickTool = (t: Tool) => {
    if (phase.current === 'done') return void sfx.tap()
    takeOver()
    lastAct.current = performance.now()
    setTool(t)
    sfx.tap()
  }

  const toolKey = (t: Tool) => (t.kind === 'color' ? t.c : t.name)
  return (
    <div className="en-paint" ref={root} data-ratio={Math.round(ratio * 100)} data-done={done ? '' : undefined}>
      <div className="en-trace-paper en-paint-paper">
        <div className="en-trace-board" ref={board} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
          <svg viewBox={`0 0 ${VW} ${VH}`} className="en-trace-svg" aria-hidden="true">
            <RainbowDef id="en-paint-rainbow" w={VW} h={VH} />
            <defs>
              <mask id="en-paint-mask">
                <rect width={VW} height={VH} fill="#000" />
                {strokes.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </mask>
            </defs>
            {/* 字的形狀：外框＋白底（跟描字一樣粗） */}
            <g key={glow} className={glow ? 'en-paint-glow' : undefined}>
              {strokes.map((d, i) => (
                <g key={i}>
                  <path d={d} fill="none" stroke="#F1D9C4" strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
                  <path data-stroke="" d={d} fill="none" stroke={done ? 'url(#en-paint-rainbow)' : '#FBF8F2'} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ))}
            </g>
            {/* 塗的顏色：只留在字的形狀裡 */}
            {!done && (
              <g mask="url(#en-paint-mask)">
                {lines.map((l, i) => (
                  <polyline key={i} points={l.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={l.c} strokeWidth={BRUSH_R * 2} strokeLinecap="round" strokeLinejoin="round" opacity={l.demo ? 0.7 : 1} />
                ))}
              </g>
            )}
          </svg>
          {/* 印章（蓋在字上，HTML 疊在描字板上面） */}
          {stamped.map((s, i) => (
            <motion.span
              key={i}
              className="en-paint-stamp"
              style={{ left: `${(s.x / VW) * 100}%`, top: `${(s.y / VH) * 100}%` }}
              initial={still ? false : { scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: s.demo ? 0.75 : 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden="true"
            >
              <Emoji name={s.name} />
            </motion.span>
          ))}
          {done && <Sparkles count={18} />}
        </div>
      </div>
      {/* 工具：三支蠟筆、兩三個印章（選到的那一個大一點、有一圈） */}
      <div className="en-paint-tools">
        {([...COLORS.map((c) => ({ kind: 'color', c }) as Tool), ...marks.map((name) => ({ kind: 'stamp', name }) as Tool)] as Tool[]).map((t) => {
          const k = toolKey(t)
          const on = toolKey(tool) === k
          return (
            <button
              key={k}
              type="button"
              ref={(el) => {
                if (el) toolEls.current.set(k, el)
              }}
              className={`en-paint-tool is-${t.kind}${on ? ' is-on' : ''}`}
              aria-label={t.kind === 'color' ? `顏色 ${k}` : `印章 ${k}`}
              style={t.kind === 'color' ? { background: t.c } : undefined}
              onPointerDown={(e) => {
                if (firstFinger(e.nativeEvent)) pickTool(t)
              }}
              onClick={(e) => {
                if (e.detail === 0) pickTool(t)
              }}
            >
              {t.kind === 'stamp' && <Emoji name={t.name} />}
            </button>
          )
        })}
      </div>
      <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
    </div>
  )
}
