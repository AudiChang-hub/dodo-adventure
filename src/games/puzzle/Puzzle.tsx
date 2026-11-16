import { memo, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../NotYet'
import { useFlow } from '../barge'
import { useIdle } from '../idle'
import { wait } from '../lines'
import { PACE } from '../pace'
import { DoneChoices } from '../draw/DoneChoices'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useLive } from '../logic/kit'
import { PuzzlePickArt } from './art'
import { PUZZLE_COPLAY } from './coplay'
import { picLineKey } from './lines'
import { OK_WRONGS, PUZZLE_GAME, afterPuzzle, puzzleRound, puzzleSkill, type PuzzleLevel, type PuzzleRound, type PuzzleState } from './plan'
import { loadPuzzle, savePuzzle } from './progress'
import { geometry } from './geometry'
import { PicArt } from './PicArt'
import type { PuzzlePic } from './pics'
import '../draw/tools.css'
import './puzzle.css'

/** 新的一張剛出來這麼久內點不算（上一個連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 拖過這麼遠才算在拖（不然是點一下） */
const DRAG_PX = 14
/** 放在對的位置附近多近就吸過去（片的短邊的比例；三歲手指放不準） */
const SNAP = 0.6

/**
 * 拼圖（T-156）：左邊是拼盤（只有空的虛線格子），右上角一張小的完整圖當參考，下面托盤放打散的片（每片都不在自己的位置、不旋轉）。
 * 拖過去放對了會吸附；點一片（拿起來）再點位置也能放（TOUCH-2）。拖到空白處放手：片回托盤，不算錯（TOUCH-7）。
 * 放錯：片回托盤。第 1 次「Look at the picture.」；同一片第 2 次對的位置亮起來「It goes here.」；第 3 次手帶著放進去（記一起做）。
 * 第一次到這一級：手先示範放一片（示範中點了只有「看這裡」的圈圈）。發呆：15 秒再說一次、30 秒手點一片、對的位置亮起來。
 * 拼完：格線不見、整張圖輕輕動一下（≤ 5%，MOTION-1）、念這張圖的句子，停在「再一張／回首頁」（HOW-9）。
 */
export function Puzzle() {
  const [round, setRound] = useState<PuzzleRound | null>(null)
  const prog = useRef<PuzzleState | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  useEffect(() => {
    let on = true
    void loadPuzzle().then((p) => {
      if (!on || prog.current) return
      prog.current = p
      setRound(puzzleRound(p.level as PuzzleLevel, p.pics))
    })
    return () => {
      on = false
    }
  }, [])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setRound(puzzleRound(p.level as PuzzleLevel, p.pics))
    setN((k) => k + 1)
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? PUZZLE_COPLAY.now : PUZZLE_COPLAY.play}>
      {round && prog.current && <PuzzleView key={n} round={round} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

/** 圖的一片：整張圖放大 cols×rows 倍、移到這一片的位置，外面裁掉 */
const Slice = memo(function Slice({ pic, col, row, cols, rows }: { pic: PuzzlePic; col: number; row: number; cols: number; rows: number }) {
  return (
    <div className="pz-slice">
      <div className="pz-slice-in" style={{ width: `${cols * 100}%`, height: `${rows * 100}%`, left: `${-col * 100}%`, top: `${-row * 100}%` }}>
        <PicArt pic={pic} />
      </div>
    </div>
  )
})

type HandState = { x: number; y: number; tap: number; beckon?: boolean } | null

function PuzzleView({ round, prog, onDone, onAgain, resting }: { round: PuzzleRound; prog: { current: PuzzleState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level, pic, cols, rows, tray, spread } = round
  const n = cols * rows
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
  const geo = geometry(size.w, size.h, cols, rows, spread)
  const geoRef = useRef(geo)
  geoRef.current = geo

  const [placed, setPlaced] = useState<boolean[]>(() => Array(n).fill(false))
  const [lifted, setLifted] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null)
  const [glow, setGlow] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  /** 輪到他了：只輸出成 data-turn 給三歲測試看 */
  const [turn, setTurn] = useState(false)

  const st = useRef({
    busy: true,
    demo: false,
    armed: false,
    ended: false,
    placed: Array<boolean>(n).fill(false),
    lifted: null as number | null,
    wrongs: 0,
    per: Array<number>(n).fill(0),
    drops: 0,
    led: false,
    shown: false,
    demoed: false,
    taps: [] as { pick: string; ms: number }[],
    t0: 0,
  })
  const dragRef = useRef<{ pid: number; id: number; sx: number; sy: number; moved: boolean } | null>(null)

  const taught = () => prog.current?.taught.includes(level) ?? true
  const [firstTime] = useState(() => !taught())

  const slotCenter = (i: number, g = geoRef.current) => (g ? { x: g.board.x + ((i % cols) + 0.5) * g.pw, y: g.board.y + (Math.floor(i / cols) + 0.5) * g.ph } : { x: 0, y: 0 })
  const trayCenter = (i: number, g = geoRef.current) => (g ? g.tray[tray.indexOf(i)] : { x: 0, y: 0 })
  const pct = (p: { x: number; y: number }, dy = 0) => {
    const g = geoRef.current
    return g ? { x: (p.x / g.w) * 100, y: ((p.y + dy) / g.h) * 100 } : { x: 50, y: 50 }
  }
  const showHand = (p: { x: number; y: number }, tapIt: boolean, beckon = false) => setHand((h) => ({ ...pct(p), tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const setLift = (i: number | null) => {
    st.current.lifted = i
    setLifted(i)
  }
  const markPlaced = (i: number) => {
    st.current.placed = st.current.placed.map((v, k) => v || k === i)
    setPlaced(st.current.placed)
  }
  /** 下一片要提示的：拿起來的那一片，不然托盤裡第一片還沒放的 */
  const nextPiece = () => {
    const s = st.current
    if (s.lifted != null && !s.placed[s.lifted]) return s.lifted
    return tray.find((i) => !s.placed[i]) ?? null
  }

  const startIdle = () => {
    setTurn(true)
    idle.start({
      repeat: () => void say('pz.ask'),
      hint: () => {
        // 發呆：手點一片，對的位置亮起來（不說話）；之後放的記成一起做
        const i = nextPiece()
        if (i == null) return
        st.current.led = true
        showHand(trayCenter(i), true)
        setGlow(i)
      },
    })
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
    sfx.done()
    record()
    const ok = flow.begin(live)
    await wait(500)
    if (!ok()) return
    await say(picLineKey(pic.id))
    if (!ok()) return
    // 時間到了：拼完這一張才去睡覺（TIME-2）
    if (bedtimeIfDue()) return
    onDone()
  }

  const record = () => {
    const s = st.current
    const phase = s.demoed || s.led || s.shown ? 'guided' : 'quiz'
    const first = s.wrongs <= OK_WRONGS && !s.shown
    void logAttempt({
      station: 'logic',
      game: PUZZLE_GAME,
      itemId: `puzzle:${pic.id}`,
      skill: puzzleSkill(level),
      phase,
      level,
      options: Array.from({ length: n }, (_, i) => String(i)),
      answer: pic.id,
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.drops,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led || s.shown,
      heard: true,
      metrics: { pieces: n, wrongs: s.wrongs, ...(s.led ? { led: 1 } : {}), ...(s.shown ? { shown: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = afterPuzzle(p, { pic: pic.id, date: today(), wrongs: s.wrongs, shown: s.shown, counted: phase === 'quiz' })
      void savePuzzle(prog.current)
    }
  }

  /** 放對了：吸進去 */
  const settle = async (i: number) => {
    const s = st.current
    markPlaced(i)
    setDrag(null)
    setLift(null)
    setGlow(null)
    setHand(null)
    sfx.pop()
    const count = s.placed.filter(Boolean).length
    if (count >= n) return finish()
    flow.cut()
    // 過程讚美（FB-3）：放好第 2 片時說一次他做了什麼
    if (count === 2 && !s.demoed) {
      const ok = flow.begin(live)
      void say('pz.praise').then(() => ok() && idle.poke())
    }
    startIdle()
  }

  /** 第 3 次放錯（或示範）：手把片拿到對的位置 */
  const handCarry = async (i: number, ok: () => boolean) => {
    showHand(trayCenter(i), false)
    await wait(650)
    if (!ok()) return false
    showHand(trayCenter(i), true)
    await wait(350)
    if (!ok()) return false
    markPlaced(i)
    setLift(null)
    showHand(slotCenter(i), false)
    sfx.pop()
    await wait(600)
    return ok()
  }

  /** 選了一個位置（拖過去放手、點一片再點位置） */
  const tryPlace = async (i: number, slot: number) => {
    const s = st.current
    if (s.busy || s.demo || s.ended || s.placed[i]) return
    s.drops++
    s.taps.push({ pick: `${i}>${slot}`, ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    if (slot === i) return settle(i)
    // 放錯：片回托盤（不搖、不打叉、不出紅色）
    s.wrongs++
    s.per[i]++
    setDrag(null)
    setLift(null)
    sfx.boing()
    flow.cut()
    const ok = flow.begin(live)
    if (s.per[i] >= 3) {
      s.busy = true
      s.shown = true
      idle.stop()
      setTurn(false)
      setGlow(i)
      await wait(450)
      if (!ok()) return
      if (!(await handCarry(i, ok))) return
      await say('pz.here')
      if (!ok()) return
      setHand(null)
      setGlow(null)
      s.busy = false
      if (s.placed.filter(Boolean).length >= n) return finish()
      startIdle()
      return
    }
    if (s.per[i] === 2) {
      setGlow(i)
      await say('pz.here')
    } else await say('pz.look')
    if (!ok()) return
    startIdle()
  }

  /** 第一次到這一級：手示範放一片 */
  const runDemo = async () => {
    const s = st.current
    const ok = flow.begin(live)
    s.demo = true
    s.demoed = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say('teach.watch.dodo')
    if (!ok()) return
    const i = tray[0]
    if (!(await handCarry(i, ok))) return
    await say('pz.here')
    if (!ok()) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    setHand(null)
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: PUZZLE_GAME, itemId: `puzzle:${pic.id}`, skill: puzzleSkill(level), level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void savePuzzle(prog.current)
    }
    s.demo = false
    s.busy = false
    s.armed = true
    setDemo(false)
    setHold(false)
    startIdle()
  }

  useEffect(() => {
    // 延到下一輪才開始：StrictMode 開發模式會掛載兩次
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
        await say('pz.intro')
        // 被搶掉（他已經在放了）：放的那一下會自己開始計時發呆
        if (!ok() || s.ended) return
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

  const at = (e: { clientX: number; clientY: number }) => (area.current ? localPoint(area.current, e.clientX, e.clientY) : { x: 0, y: 0 })
  const ping = (e: { clientX: number; clientY: number }) => {
    const p = at(e)
    notYet.ping(p.x, p.y)
  }

  /** 板子上的哪一格（沒有：null） */
  const slotAt = (p: { x: number; y: number }) => {
    const g = geoRef.current
    if (!g) return null
    const c = Math.floor((p.x - g.board.x) / g.pw)
    const r = Math.floor((p.y - g.board.y) / g.ph)
    if (c < 0 || r < 0 || c >= cols || r >= rows) return null
    return r * cols + c
  }

  /** 拖著放手：靠近對的位置就吸進去；在別的空格上算放錯；其他地方回托盤、不算 */
  const dropAt = (i: number, p: { x: number; y: number }) => {
    const g = geoRef.current
    if (!g) return setDrag(null)
    const c = slotCenter(i)
    const near = Math.abs(p.x - c.x) <= g.pw * SNAP && Math.abs(p.y - c.y) <= g.ph * SNAP
    if (near) return void tryPlace(i, i)
    const j = slotAt(p)
    if (j != null && !st.current.placed[j]) return void tryPlace(i, j)
    setDrag(null)
  }

  // ── 片：點一下拿起來、拖到板子上 ──
  const downPiece = (e: ReactPointerEvent<HTMLDivElement>, i: number) => {
    const s = st.current
    if (!firstFinger(e.nativeEvent)) return
    // 示範中、剛出來、手正在帶著放：只有「看這裡」的圈圈（TOUCH-6）
    if (s.demo || !s.armed || (s.busy && !s.ended)) return ping(e)
    if (s.ended || s.placed[i]) return
    dragRef.current = { pid: e.pointerId, id: i, sx: e.clientX, sy: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 有些瀏覽器拿不到 */
    }
  }
  const movePiece = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pid !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_PX) return
    if (st.current.busy || st.current.ended) {
      dragRef.current = null
      setDrag(null)
      return
    }
    d.moved = true
    idle.poke()
    const p = at(e)
    setDrag({ id: d.id, x: p.x, y: p.y })
  }
  const upPiece = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pid !== e.pointerId) return
    dragRef.current = null
    if (!d.moved) {
      // 點一下：拿起來（再點板子上的位置就放進去）；再點一次放下
      sfx.tap()
      idle.poke()
      setLift(st.current.lifted === d.id ? null : d.id)
      return
    }
    dropAt(d.id, at(e))
  }
  const cancelPiece = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pid !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
  }

  // ── 板子：點位置（手上拿著一片時放進去） ──
  const boardDown = useRef<{ pid: number; x: number; y: number } | null>(null)
  const downBoard = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!firstFinger(e.nativeEvent)) return
    const s = st.current
    if (s.demo || !s.armed) return ping(e)
    boardDown.current = { pid: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const upBoard = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = boardDown.current
    boardDown.current = null
    if (!d || d.pid !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 40) return
    const s = st.current
    if (s.busy || s.ended) return
    const j = slotAt(at(e))
    if (j == null || s.placed[j]) return
    if (s.lifted == null) {
      // 手上沒有片：托盤裡的片輕輕亮一下告訴他「先拿一片」（看這裡的圈圈，不算錯）
      return ping(e)
    }
    void tryPlace(s.lifted, j)
  }

  const g = geo
  const handSize = g ? `${Math.round(Math.min(110, Math.max(70, g.h * 0.13)))}px` : '90px'
  return (
    <div
      className={`pz${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}`}
      data-logic-game="puzzle"
      data-level={level}
      data-pic={pic.id}
      data-pieces={n}
      data-placed={placed.filter(Boolean).length}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-done={done ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="pz-play" ref={area}>
        {g && (
          <motion.div
            className="pz-art"
            style={{ transformOrigin: `${g.board.x + g.board.w / 2}px ${g.board.y + g.board.h / 2}px` }}
            animate={done ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={{ duration: 0.9, ease: 'easeInOut', delay: 0.15 }}
          >
            <div className="pz-board" style={{ left: g.board.x, top: g.board.y, width: g.board.w, height: g.board.h }} onPointerDown={downBoard} onPointerUp={upBoard} role="presentation">
              {Array.from({ length: n }, (_, j) => (
                <div
                  key={j}
                  className={`pz-slot${glow === j && !placed[j] ? ' is-glow' : ''}`}
                  data-slot={j}
                  style={{ left: `${((j % cols) / cols) * 100}%`, top: `${(Math.floor(j / cols) / rows) * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%` }}
                />
              ))}
            </div>
            {/* 參考的小圖（像拼圖盒上的圖）：只看、不能點 */}
            <div className="pz-ref" data-ref="" style={{ left: g.ref.x, top: g.ref.y, width: g.ref.w, height: g.ref.h }} aria-hidden="true">
              <PicArt pic={pic} />
            </div>
            {Array.from({ length: n }, (_, i) => {
              const isDrag = drag?.id === i
              const c = placed[i] ? slotCenter(i, g) : isDrag ? { x: drag.x, y: drag.y } : trayCenter(i, g)
              const scale = placed[i] || isDrag ? 1 : g.s * (lifted === i ? 1.1 : 1)
              return (
                <motion.div
                  key={i}
                  className={`pz-piece${placed[i] ? ' is-placed' : ''}${lifted === i ? ' is-lifted' : ''}${isDrag ? ' is-drag' : ''}`}
                  data-piece={i}
                  data-home={placed[i] ? 'board' : 'tray'}
                  data-tray={tray.indexOf(i)}
                  role="button"
                  aria-label={`拼圖第 ${i + 1} 片`}
                  style={{ width: g.pw, height: g.ph }}
                  initial={false}
                  animate={{ x: c.x - g.pw / 2, y: c.y - g.ph / 2, scale }}
                  transition={isDrag ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
                  onPointerDown={(e) => downPiece(e, i)}
                  onPointerMove={movePiece}
                  onPointerUp={upPiece}
                  onPointerCancel={cancelPiece}
                >
                  <Slice pic={pic} col={i % cols} row={Math.floor(i / cols)} cols={cols} rows={rows} />
                </motion.div>
              )
            })}
          </motion.div>
        )}
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} beckon={hand.beckon} size={handSize} cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<PuzzlePickArt />} againLabel="再一張" line="pz.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
