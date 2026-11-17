import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
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
import { kindOf, sizeOfModel, type Brick } from './bricks'
import { BrickSet, BrickShape, ModelPic, Plate, U, boxOf, proj, type View } from './BrickArt'
import { BlocksPickArt } from './art'
import { BLOCKS_COPLAY } from './coplay'
import { modelLineKey } from './lines'
import { boardGeo, brickExtent, toPx, trayLayout, type BoardGeo } from './geometry'
import { BLOCKS_GAME, OK_WRONGS, afterBlocks, blocksRound, blocksSkill, nextTarget, placeable, spotsFor, type BlocksLevel, type BlocksRound, type BlocksState } from './plan'
import { loadBlocks, saveBlocks } from './progress'
import type { Act } from './models'
import '../draw/tools.css'
import './blocks.css'

/** 新的一個剛出來這麼久內點不算（上一個連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 拖過這麼遠才算在拖（不然是點一下） */
const DRAG_PX = 14
/** 放在對的位置附近多近就吸過去（格；三歲手指放不準） */
const SNAP = 0.75
/** 模型左右至少各留 1 格空的底板；底板至少 5 格寬（只有 1、2 格寬的模型，位置才有得選） */
export const marginOf = (w: number) => Math.max(1, Math.ceil((5 - w) / 2))

/**
 * 照圖蓋（T-162）：左邊參考圖（第 4 級是步驟圖），中間底板，右邊托盤。
 * 從托盤拖一塊到底板上：靠近對的位置（同一種、下面撐得住）就吸過去；點一塊（拿起來）再點底板也能放（TOUCH-2）。
 * 拖到別的地方放手：回托盤，不算錯（TOUCH-7）。放在底板上不對的地方：積木輕輕彈回托盤，不說錯：
 * 第 1 次「Look at the picture.」、第 2 次對的位置亮起來「It goes here.」、第 3 次手帶著放（記一起做）。
 * 位置對了但下面還沒撐住：彈回、「Start at the bottom.」（不算錯）。
 * 第一次到這一級：手先示範放一塊。發呆：15 秒再問一次、30 秒手點一塊、對的位置亮起來。
 * 蓋好：參考圖收起來，成品動一下（車子往前開、恐龍變大一點…，減少動態效果時不動），念這個東西的句子，停在「再蓋一個／回首頁」。
 */
export function Build({ onExit }: { onExit: () => void }) {
  const [round, setRound] = useState<BlocksRound | null>(null)
  const prog = useRef<BlocksState | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  useEffect(() => {
    let on = true
    void loadBlocks().then((p) => {
      if (!on || prog.current) return
      prog.current = p
      setRound(blocksRound(p.level as BlocksLevel, p.models))
    })
    return () => {
      on = false
    }
  }, [])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setRound(blocksRound(p.level as BlocksLevel, p.models))
    setN((k) => k + 1)
  }
  const hint = resting ? BLOCKS_COPLAY.copyNow : round?.steps ? BLOCKS_COPLAY.steps : BLOCKS_COPLAY.copy
  return (
    <Shell station="logic" mood="idle" onExit={onExit} hideHost hintText={hint}>
      {round && prog.current && <BuildView key={n} round={round} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

/** 一塊積木畫在一個點上：這個點是積木正面的中心（拖著、放進去都對著它） */
export function BrickPiece({ b, v, unit }: { b: Brick; v: View; unit: number }) {
  const box = boxOf([b], v, 0.08)
  const [fx, fy] = proj(v, b.w / 2, 0.5, 0)
  const k = unit / U
  return (
    <svg
      className="bk-piece-art"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      width={box.w * k}
      height={box.h * k}
      style={{ left: (box.x - fx) * k, top: (box.y - fy) * k }}
      aria-hidden="true"
    >
      <BrickShape b={b} v={v} />
    </svg>
  )
}

/** 托盤裡一塊的正面中心（畫在格子正中間：外框的中心對齊格子中心） */
export function trayPoint(cell: { x: number; y: number }, b: Pick<Brick, 'w' | 'd'>, deep: boolean, ut: number) {
  const e = brickExtent(b, deep)
  const dx = deep ? b.d * 0.3 : 0
  return { x: cell.x - (dx / 2) * ut, y: cell.y + (e.h / 2 - 0.5) * ut }
}

/** 蓋好的成品動一下（一次，≤ 1.5 秒） */
const ACT_ANIM: Record<Act, { x?: number[]; y?: number[]; scale?: number[]; scaleY?: number[] }> = {
  drive: { x: [0, 0.6, 0.6, 0] },
  fly: { y: [0, -0.6, -0.6, 0] },
  swim: { x: [0, -0.3, 0.3, 0] },
  hop: { y: [0, -0.35, 0, -0.35, 0] },
  roar: { scale: [1, 1.07, 1.07, 1] },
  grow: { scaleY: [1, 1.07, 1] },
  shine: { scale: [1, 1.05, 1] },
}

type HandState = { x: number; y: number; tap: number; beckon?: boolean } | null

function BuildView({ round, prog, onDone, onAgain, resting }: { round: BlocksRound; prog: { current: BlocksState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level, model, deep, target, tray, steps } = round
  const v: View = deep ? 'deep' : 'flat'
  const total = target.length
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const still = useReducedMotion()
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
  const msize = sizeOfModel(target)
  const MARGIN = marginOf(msize.w)
  const cols = msize.w + 2 * MARGIN
  const rows = msize.h + 1
  const geo = boardGeo(size.w, size.h, cols, rows, deep ? 2 : 1, deep)
  const geoRef = useRef<BoardGeo | null>(geo)
  geoRef.current = geo

  const [placed, setPlaced] = useState<boolean[]>(() => Array(total).fill(false))
  const [used, setUsed] = useState<number[]>([])
  const [step, setStep] = useState(0)
  const [lifted, setLifted] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; carry?: boolean } | null>(null)
  const [glow, setGlow] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)

  const st = useRef({
    busy: true,
    demo: false,
    armed: false,
    ended: false,
    placed: Array<boolean>(total).fill(false),
    used: [] as number[],
    step: 0,
    lifted: null as number | null,
    wrongs: 0,
    per: {} as Record<string, number>,
    drops: 0,
    led: false,
    shown: false,
    demoed: false,
    taps: [] as { pick: string; ms: number }[],
    t0: 0,
  })
  const dragRef = useRef<{ pid: number; id: number; sx: number; sy: number; moved: boolean } | null>(null)

  const [firstTime] = useState(() => !(prog.current?.taught.includes(level) ?? true))

  /** 這一步可以放的（第 4 級：這一步的；其他級：全部） */
  const allowed = (s = st.current.step) => (steps ? steps[s] : undefined)
  /** 托盤裡現在看得到的（第 4 級：這一步的＋多放的；排的位置整步不變，拿走的空著） */
  const shownAt = (k: number) => tray.filter((t) => !steps || t.step === k || t.step === -1)
  const shown = shownAt(step)
  const lay = geo ? trayLayout(geo.tray, shown.map((t) => t.b), geo.u, deep) : null
  const layRef = useRef(lay)
  layRef.current = lay

  const itemOf = (id: number) => tray.find((t) => t.id === id)!
  const slotPoint = (i: number, g = geoRef.current) => {
    const t = target[i]
    return g ? toPx(g, deep, t.x + MARGIN + t.w / 2, t.z + 0.5, t.y) : { x: 0, y: 0 }
  }
  const trayPt = (id: number) => {
    // 照現在這一步的托盤找（流程裡的函式可能是上一步那次畫面留下來的）
    const L = layRef.current
    const k = shownAt(st.current.step).findIndex((t) => t.id === id)
    if (!L || k < 0) return { x: 0, y: 0 }
    return trayPoint(L.cells[k], itemOf(id).b, deep, L.ut)
  }
  const pct = (p: { x: number; y: number }) => {
    const g = geoRef.current
    return g ? { x: (p.x / g.w) * 100, y: (p.y / g.h) * 100 } : { x: 50, y: 50 }
  }
  const showHand = (p: { x: number; y: number }, tapIt: boolean, beckon = false) => setHand((h) => ({ ...pct(p), tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const setLift = (id: number | null) => {
    st.current.lifted = id
    setLifted(id)
  }
  /** 托盤裡還在、而且是這一個位置要的那一塊 */
  const itemFor = (i: number) => {
    const s = st.current
    const kind = tray.find((t) => t.id === i)!.kind
    return (s.lifted != null && tray.find((t) => t.id === s.lifted)?.kind === kind ? s.lifted : null) ?? tray.find((t) => t.kind === kind && t.step !== -1 && !s.used.includes(t.id) && (!steps || t.step === s.step))?.id ?? i
  }
  /** 下一塊可以放的位置（提示、示範） */
  const nextSpot = () => nextTarget(target, st.current.placed, allowed())

  const startIdle = () => {
    setTurn(true)
    idle.start({
      repeat: () => void say('bk.ask'),
      hint: () => {
        const i = nextSpot()
        if (i == null) return
        st.current.led = true
        showHand(trayPt(itemFor(i)), true)
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
    await wait(600)
    if (!ok()) return
    await say(modelLineKey(model.id))
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  const record = () => {
    const s = st.current
    const phase = s.demoed || s.led || s.shown ? 'guided' : 'quiz'
    const first = s.wrongs <= OK_WRONGS && !s.shown
    void logAttempt({
      station: 'logic',
      game: BLOCKS_GAME,
      itemId: `blocks:${model.id}`,
      skill: blocksSkill(level),
      phase,
      level,
      options: tray.map((t) => t.kind),
      answer: model.id,
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.drops,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led || s.shown,
      heard: true,
      metrics: { bricks: total, wrongs: s.wrongs, ...(steps ? { steps: steps.length } : {}), ...(s.led ? { led: 1 } : {}), ...(s.shown ? { shown: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = afterBlocks(p, { model: model.id, date: today(), wrongs: s.wrongs, shown: s.shown, counted: phase === 'quiz' })
      void saveBlocks(prog.current)
    }
  }

  /** 放進去（對的位置）：積木貼上底板，托盤那一塊拿走 */
  const mark = (id: number, i: number) => {
    const s = st.current
    s.placed = s.placed.map((x, k) => x || k === i)
    s.used = [...s.used, id]
    setPlaced(s.placed)
    setUsed(s.used)
    setDrag(null)
    setLift(null)
    setGlow(null)
    sfx.pop()
  }

  /** 這一步（第 4 級）放完了：下一張步驟圖 */
  const stepDone = () => {
    const s = st.current
    if (!steps) return false
    if (!steps[s.step].every((i) => s.placed[i])) return false
    s.step++
    setStep(s.step)
    return true
  }

  const settle = async (id: number, i: number) => {
    const s = st.current
    mark(id, i)
    setHand(null)
    const count = s.placed.filter(Boolean).length
    if (count >= total) return finish()
    flow.cut()
    const ok = flow.begin(live)
    if (stepDone()) {
      void say('bk.step').then(() => ok() && idle.poke())
    } else if (count === 2 && !s.demoed) {
      // 過程讚美（FB-3）：放好第 2 塊時說一次他做了什麼
      void say('bk.praise').then(() => ok() && idle.poke())
    }
    startIdle()
  }

  /** 手把積木拿到對的位置 */
  const handCarry = async (id: number, i: number, ok: () => boolean) => {
    const from = trayPt(id)
    showHand(from, false)
    await wait(650)
    if (!ok()) return false
    showHand(from, true)
    await wait(350)
    if (!ok()) return false
    const to = slotPoint(i)
    setDrag({ id, x: to.x, y: to.y, carry: true })
    showHand(to, false)
    await wait(650)
    if (!ok()) return false
    mark(id, i)
    await wait(350)
    return ok()
  }

  /** 錯了要提示的：這一種能放的位置；沒有（拿了用不到的、太早拿上面的）就是下一塊能放的 */
  const answerFor = (kind: string) => {
    const s = st.current
    const spot = spotsFor(target, s.placed, kind, allowed()).find((i) => placeable(target, s.placed, i))
    if (spot != null) return { i: spot, id: itemFor(spot) }
    const i = nextSpot()
    return i == null ? null : { i, id: itemFor(i) }
  }

  /** 放在底板上不對的地方：彈回托盤（不搖、不打叉、不出紅色） */
  const wrong = async (id: number, early: boolean) => {
    const s = st.current
    const kind = itemOf(id).kind
    setDrag(null)
    setLift(null)
    sfx.boing()
    flow.cut()
    const ok = flow.begin(live)
    if (early) {
      // 位置對了，下面還沒有撐住：不算錯
      const a = nextSpot()
      if (a != null) setGlow(a)
      await say('bk.bottom')
      if (!ok()) return
      startIdle()
      return
    }
    s.wrongs++
    s.per[kind] = (s.per[kind] ?? 0) + 1
    const a = answerFor(kind)
    if (s.per[kind] >= 3 && a) {
      s.busy = true
      s.shown = true
      idle.stop()
      setTurn(false)
      setGlow(a.i)
      await wait(450)
      if (!ok()) return
      if (!(await handCarry(a.id, a.i, ok))) return
      await say('bk.here')
      if (!ok()) return
      setHand(null)
      setGlow(null)
      s.busy = false
      if (s.placed.filter(Boolean).length >= total) return finish()
      stepDone()
      startIdle()
      return
    }
    if (s.per[kind] === 2 && a) {
      setGlow(a.i)
      await say('bk.here')
    } else await say('bk.look')
    if (!ok()) return
    startIdle()
  }

  /** 放手（拖過去、點一塊再點底板）：p 是積木正面的中心 */
  const dropAt = (id: number, p: { x: number; y: number }) => {
    const s = st.current
    const g = geoRef.current
    if (!g || s.busy || s.demo || s.ended) return setDrag(null)
    const it = itemOf(id)
    s.drops++
    s.taps.push({ pick: `${it.kind}@${Math.round(p.x)},${Math.round(p.y)}`, ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    // 同一種、還沒放的位置裡最近的那一個
    let best: number | null = null
    let bestD = SNAP * g.u
    for (const i of spotsFor(target, s.placed, it.kind, allowed())) {
      const q = slotPoint(i, g)
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d <= bestD) {
        bestD = d
        best = i
      }
    }
    if (best != null) {
      if (placeable(target, s.placed, best)) return void settle(id, best)
      return void wrong(id, true)
    }
    // 底板上（積木蓋得到的範圍）：算放錯；其他地方回托盤、不算
    const top = toPx(g, deep, 0, g.rows, deep ? 2 : 1)
    const onBoard = p.x >= g.ox - g.u * 0.3 && p.x <= toPx(g, deep, g.cols, 0, deep ? 2 : 0).x + g.u * 0.3 && p.y >= top.y - g.u * 0.5 && p.y <= g.gy + g.u * 0.5
    if (onBoard) return void wrong(id, false)
    s.drops--
    s.taps.pop()
    setDrag(null)
  }

  /** 第一次到這一級：手示範放一塊 */
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
    const i = nextSpot()
    if (i != null && !(await handCarry(itemFor(i), i, ok))) return
    stepDone()
    await say('bk.here')
    if (!ok()) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    setHand(null)
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: BLOCKS_GAME, itemId: `blocks:${model.id}`, skill: blocksSkill(level), level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveBlocks(prog.current)
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
        await say('bk.intro')
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

  // ── 托盤的積木：點一下拿起來、拖到底板上 ──
  const downPiece = (e: ReactPointerEvent<HTMLDivElement>, id: number) => {
    const s = st.current
    e.stopPropagation()
    if (!firstFinger(e.nativeEvent)) return
    if (s.demo || !s.armed || (s.busy && !s.ended)) return ping(e)
    if (s.ended || s.used.includes(id)) return
    dragRef.current = { pid: e.pointerId, id, sx: e.clientX, sy: e.clientY, moved: false }
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
      // 點一下：拿起來（再點底板就放上去）；再點一次放下
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

  // ── 底板：手上拿著一塊時點一下，放在那裡 ──
  const boardDown = useRef<{ pid: number; x: number; y: number } | null>(null)
  const downArea = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 示範中的擋板自己會出「看這裡」的圈圈，這裡不再出一次
    if (e.target instanceof Element && e.target.closest('.wait-shield')) return
    idle.poke()
    if (resting) setPoke((k) => k + 1)
    if (!firstFinger(e.nativeEvent)) return
    const s = st.current
    if (s.ended) return
    if (s.demo || !s.armed) return ping(e)
    boardDown.current = { pid: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const upArea = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = boardDown.current
    boardDown.current = null
    if (!d || d.pid !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 40) return
    const s = st.current
    if (s.busy || s.ended) return
    const g = geoRef.current
    const p = at(e)
    if (!g || p.x < g.board.x || p.x > g.board.x + g.board.w || p.y < g.board.y || p.y > g.board.y + g.board.h) return
    // 手上沒有積木：「看這裡」的圈圈（不算錯）
    if (s.lifted == null) return ping(e)
    dropAt(s.lifted, p)
  }

  const g = geo
  const handSize = g ? `${Math.round(Math.min(110, Math.max(70, g.h * 0.13)))}px` : '90px'
  const anim = ACT_ANIM[model.act]
  const doneAnim = done && !still && g ? { x: anim.x?.map((k) => k * U), y: anim.y?.map((k) => k * U), scale: anim.scale, scaleY: anim.scaleY } : {}
  const placedBricks = target.map((b, i) => ({ ...b, x: b.x + MARGIN, i })).filter((b) => placed[b.i])
  const refBricks = steps ? target.filter((_, i) => steps.slice(0, step + 1).some((s) => s.includes(i))) : target
  return (
    <div
      className={`bk${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}${g?.portrait ? ' is-portrait' : ''}`}
      data-logic-game="blocks"
      data-level={level}
      data-model={model.id}
      data-bricks={total}
      data-placed={placed.filter(Boolean).length}
      data-step={steps ? step + 1 : undefined}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-done={done ? '1' : undefined}
      // 還沒放的位置（作答區裡的 px、哪一種積木）：給截圖腳本、三歲測試找位置用，不影響行為
      data-slots={g ? JSON.stringify(target.map((t, i) => (placed[i] ? null : { k: kindOf(t), ...slotPoint(i, g) }))) : undefined}
    >
      <div className="bk-play" ref={area} onPointerDown={downArea} onPointerUp={upArea}>
        {g && (
          <>
            {/* 參考圖（像盒子上的圖）；第 4 級是步驟圖：之前的步驟淡淡的，這一步要加的照原本的顏色 */}
            <div className="bk-ref" data-ref="" style={{ left: g.ref.x, top: g.ref.y, width: g.ref.w, height: g.ref.h }} aria-hidden="true">
              <AnimatePresence mode="wait">
                <motion.div key={steps ? `s${step}` : 'all'} className="bk-ref-pic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  {steps ? <StepPic all={target} shownBricks={refBricks} cur={steps[Math.min(step, steps.length - 1)].map((i) => target[i])} v={v} margin={MARGIN} /> : <ModelPic bricks={target} v={v} margin={MARGIN} />}
                </motion.div>
              </AnimatePresence>
              {steps && (
                <div className="bk-steps" data-steps={steps.length}>
                  <span className="bk-step-no">{Math.min(step + 1, steps.length)}</span>
                  <span className="bk-step-dots">
                    {steps.map((_, k) => (
                      <i key={k} className={k < step ? 'is-done' : k === step ? 'is-now' : ''} />
                    ))}
                  </span>
                </div>
              )}
            </div>
            {/* 底板和放好的積木 */}
            <svg className="bk-board" width={g.w} height={g.h} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true">
              <g transform={`translate(${g.ox} ${g.gy}) scale(${g.u / U})`}>
                <Plate cols={g.cols} rows={deep ? 2 : 1} v={v} />
                <motion.g style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }} animate={doneAnim} transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.2 }}>
                  <BrickSet bricks={placedBricks} v={v} />
                </motion.g>
                {glow != null && !placed[glow] && (
                  <g className="bk-glow" data-glow={glow}>
                    <BrickShape b={{ ...target[glow], x: target[glow].x + MARGIN }} v={v} p={{ fill: 'rgba(241,210,124,0.45)', stroke: '#E9B949', strokeWidth: 7, dash: '14 9' }} />
                  </g>
                )}
              </g>
            </svg>
            {/* 托盤：可以點的格子（≥ 2 公分）；積木畫在下面那一層 */}
            {!done &&
              lay &&
              shown.map((t, k) =>
                used.includes(t.id) ? null : (
                  <div
                    key={t.id}
                    className={`bk-cell${lifted === t.id ? ' is-lifted' : ''}`}
                    data-piece={t.id}
                    data-kind={t.kind}
                    data-extra={t.step === -1 ? '1' : undefined}
                    role="button"
                    aria-label={`積木 ${t.kind}`}
                    style={{ left: lay.cells[k].x - lay.cells[k].w / 2, top: lay.cells[k].y - lay.cells[k].h / 2, width: lay.cells[k].w, height: lay.cells[k].h }}
                    onPointerDown={(e) => downPiece(e, t.id)}
                    onPointerMove={movePiece}
                    onPointerUp={upPiece}
                    onPointerCancel={cancelPiece}
                  />
                ),
              )}
            {lay &&
              shown.map((t, k) => {
                if (used.includes(t.id) && drag?.id !== t.id) return null
                if (done) return null
                const isDrag = drag?.id === t.id
                const c = isDrag ? { x: drag.x, y: drag.y } : trayPoint(lay.cells[k], t.b, deep, lay.ut)
                const scale = isDrag ? 1 : (lay.ut / g.u) * (lifted === t.id ? 1.12 : 1)
                return (
                  <motion.div
                    key={t.id}
                    className={`bk-piece${isDrag ? ' is-drag' : ''}${lifted === t.id ? ' is-lifted' : ''}`}
                    initial={false}
                    animate={{ x: c.x, y: c.y, scale }}
                    transition={isDrag && !drag.carry ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
                  >
                    <BrickPiece b={t.b} v={v} unit={g.u} />
                  </motion.div>
                )
              })}
          </>
        )}
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} beckon={hand.beckon} size={handSize} cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<BlocksPickArt />} againLabel="再蓋一個" line="bk.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}

/** 步驟圖：之前步驟的積木淡淡的（灰白），這一步要加的照原本的顏色；還沒到的步驟不畫；底板照整個模型的大小 */
function StepPic({ all, shownBricks, cur, v, margin: MARGIN }: { all: readonly Brick[]; shownBricks: readonly Brick[]; cur: readonly Brick[]; v: View; margin: number }) {
  const W = Math.max(...all.map((b) => b.x + b.w))
  const D = Math.max(1, ...all.map((b) => b.y + b.d))
  const shift = (b: Brick) => ({ ...b, x: b.x + MARGIN })
  const box = boxOf([...all.map(shift), { x: 0, z: -0.32, y: 0, w: W + 2 * MARGIN, d: D, color: 'G', shape: 'brick' }], v, 0.12)
  const isCur = (b: Brick) => cur.includes(b)
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${Math.max(box.h, 0)}`} width="100%" height="100%" aria-hidden="true">
      <Plate cols={W + 2 * MARGIN} rows={D} v={v} />
      <BrickSet bricks={shownBricks.map(shift)} v={v} paint={(_b, i) => (isCur(shownBricks[i]) ? undefined : { fill: '#EDE7DC', stroke: '#B8AE9F' })} />
    </svg>
  )
}

