import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { motion } from 'motion/react'
import { HandArt } from '../Demo'
import { wait } from '../lines'
import { EASE, FADE } from '../../ui/motion'
import '../teach.css'
import './carry.css'

/*
 * 程式車庫「把東西放進空位」共用的道具（找規律接車廂、排順序放圖卡）：
 * - 位置換算：不受外層 transform 影響（新畫面進場時是從 0.6 倍放大上來的，draw/Ink.tsx 的 toPt 同一個算法）
 * - 搬運中的「幽靈」：孩子點了選項，選項沿著路徑飛進空位；拖曳時跟著手指；示範時跟著手一起走（盤點 8-1 的拖放手勢）
 * - 示範的手：移過去、按下、物件跟著手走、放下，手離開
 * - 一起練的引導：手從選項滑到空位、再回來，中間一條虛線箭頭（不閃、不淡入淡出，紙感螢幕看得清楚）
 * - 閒置提示階梯（盤點 8-2）：時間從「可以作答」開始算，任何操作就從目前這一階重新計時
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}
export const mid = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** 外層現在的縮放：畫面上的框 ÷ 版面大小 */
const scaleOf = (layer: HTMLElement) => {
  const r = layer.getBoundingClientRect()
  return { r, k: layer.offsetWidth ? r.width / layer.offsetWidth : 1 }
}

/** el 在 layer 裡的位置（layer 自己的版面座標，CSS px） */
export function boxIn(layer: HTMLElement, el: Element): Box {
  const { r: L, k } = scaleOf(layer)
  const r = el.getBoundingClientRect()
  // 大小用版面大小（空位一直在脈動縮放，量到的框會忽大忽小）；位置用中心點（以中心縮放時中心不動）
  const e = el as HTMLElement
  const w = e.offsetWidth || r.width / k
  const h = e.offsetHeight || r.height / k
  const cx = (r.left + r.width / 2 - L.left) / k
  const cy = (r.top + r.height / 2 - L.top) / k
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** 視窗座標（PointerEvent 的 clientX/Y）→ layer 的版面座標 */
export function pointIn(layer: HTMLElement, cx: number, cy: number): Pt {
  const { r: L, k } = scaleOf(layer)
  return { x: (cx - L.left) / k, y: (cy - L.top) / k }
}

// ── 搬運 ──────────────────────────────────────────────────

export interface GhostState<T> {
  item: T
  /** 每拿起一次換一個，幽靈從拿起的地方直接出現（不從上一次的位置飛過來） */
  n: number
  box: Box
  ms: number
  /** 被拿起來：放大一點、有陰影 */
  lift: boolean
  /** 每變一次就搖一下（接不上） */
  wobble: number
}

export interface HandState {
  at: Pt
  on: boolean
  ms: number
  /** 每變一次就按一下 */
  press: number
  /** 閒置提示的手是半透明的（盤點 8-2：做完就收回，不替孩子作答） */
  faint: boolean
}

export function useCarry<T>(layer: RefObject<HTMLElement | null>) {
  const [ghost, setGhostState] = useState<GhostState<T> | null>(null)
  const [hand, setHandState] = useState<HandState | null>(null)
  const g = useRef<GhostState<T> | null>(null)
  const h = useRef<HandState | null>(null)
  const n = useRef(0)
  /** clear() 之後還沒跑的 requestAnimationFrame 不要再把手叫出來 */
  const ver = useRef(0)
  /** handOff() 之後也一樣 */
  const offs = useRef(0)
  const setGhost = (v: GhostState<T> | null) => {
    g.current = v
    setGhostState(v)
  }
  const setHand = (v: HandState | null) => {
    h.current = v
    setHandState(v)
  }

  const api = {
    ghost,
    hand,
    /** 現在搬的是哪一個 */
    holding: () => g.current?.item ?? null,
    box: (el: Element | null | undefined): Box | null => (layer.current && el ? boxIn(layer.current, el) : null),
    point: (cx: number, cy: number): Pt | null => (layer.current ? pointIn(layer.current, cx, cy) : null),
    /** 從 b 拿起 item（幽靈直接出現在 b，蓋住原本那一個） */
    lift(item: T, b: Box) {
      setGhost({ item, n: ++n.current, box: b, ms: 0, lift: true, wobble: 0 })
    },
    /** 幽靈移到 b（ms 毫秒）；等它到 */
    glide(b: Box, ms: number, lift = true) {
      const c = g.current
      if (!c) return Promise.resolve()
      setGhost({ ...c, box: b, ms, lift })
      return wait(ms)
    },
    /** 跟著手指：幽靈的中心在 p */
    follow(p: Pt) {
      const c = g.current
      if (!c) return
      setGhost({ ...c, box: { ...c.box, x: p.x - c.box.w / 2, y: p.y - c.box.h / 2 }, ms: 0, lift: true })
    },
    wobble() {
      const c = g.current
      if (c) setGhost({ ...c, wobble: c.wobble + 1 })
    },
    drop() {
      setGhost(null)
    },
    handTo(at: Pt, ms: number, faint = false) {
      const c = h.current
      // 第一次出現：先放在目標下方一點、看不見，再移上來並淡入（只淡入這一次）
      const v = ver.current
      if (!c || !c.on) {
        setHand({ at: { x: at.x + 30, y: at.y + 70 }, on: false, ms: 0, press: c?.press ?? 0, faint })
        // 兩個畫格之後才淡入；這中間手已經收起來了（背景分頁的畫格會延後很久）就不要再把它叫出來
        const o = offs.current
        requestAnimationFrame(() => requestAnimationFrame(() => ver.current === v && offs.current === o && setHand({ at, on: true, ms, press: h.current?.press ?? 0, faint })))
      } else setHand({ ...c, at, on: true, ms, faint })
      return wait(ms)
    },
    press() {
      const c = h.current
      if (c) setHand({ ...c, press: c.press + 1 })
    },
    /** 手離開：往下一點、淡掉（只淡出這一次） */
    handOff() {
      offs.current++
      const c = h.current
      if (c && c.on) setHand({ ...c, at: { x: c.at.x + 20, y: c.at.y + 50 }, on: false, ms: 260 })
    },
    clear() {
      ver.current++
      setGhost(null)
      setHand(null)
    },
  }
  return api
}
export type Carry<T> = ReturnType<typeof useCarry<T>>

/** 手指的位置：幽靈中心偏下一點（手是「拿著」它，不是指著它） */
const grip = (b: Box): Pt => ({ x: b.x + b.w * 0.5, y: b.y + b.h * 0.62 })

/**
 * 手完整示範一次「拿起、拖過去、放下」（盤點 8-1 的拖放手勢）。
 * keep：放下之後東西就留在那裡（onLand）；不 keep：在空位停一下再拿回原位（閒置提示、答錯後的示範，不替孩子作答）。
 * alive() 變 false（孩子自己動手了、換題了）就立刻停，回傳 false；收拾（手、幽靈、藏起來的選項）由喊停的那一方當場做，
 * 這裡不再動畫面，免得把孩子剛拿起來的那一個清掉。
 */
export async function demoCarry<T>(
  c: Carry<T>,
  item: T,
  from: Box,
  to: Box,
  o: { alive: () => boolean; keep: boolean; faint?: boolean; onLift?: () => void; onLand?: () => void; onBack?: () => void },
): Promise<boolean> {
  const faint = !!o.faint
  const bail = () => false
  await c.handTo(grip(from), 480, faint)
  if (!o.alive()) return bail()
  await wait(160)
  c.press()
  c.lift(item, from)
  o.onLift?.()
  await wait(320)
  if (!o.alive()) return bail()
  void c.handTo(grip(to), 760, faint)
  await c.glide(to, 760)
  if (!o.alive()) return bail()
  if (o.keep) {
    o.onLand?.()
    c.drop()
    await wait(260)
    c.handOff()
    await wait(260)
    return o.alive()
  }
  // 放進去給孩子看一下，再拿回原位
  await c.glide(to, 120, false)
  await wait(520)
  if (!o.alive()) return bail()
  void c.handTo(grip(from), 620, faint)
  await c.glide(from, 620)
  if (!o.alive()) return bail()
  c.drop()
  o.onBack?.()
  c.handOff()
  await wait(260)
  return o.alive()
}

// ── 畫出來 ─────────────────────────────────────────────────

/**
 * 搬運中的那一個（render 決定長相，大小跟原本的一樣）。
 * onGrab：閒置提示的手正拿著它時，孩子可以直接從手上搶過來（示範途中孩子先動手，就讓他做）。
 */
export function GhostView<T>({ ghost, render, className = '', onGrab }: { ghost: GhostState<T> | null; render: (item: T) => ReactNode; className?: string; onGrab?: () => void }) {
  if (!ghost) return null
  const b = ghost.box
  return (
    <motion.div
      key={ghost.n}
      className={`carry-ghost${ghost.lift ? ' is-lift' : ''}${onGrab ? ' is-grab' : ''} ${className}`}
      style={{ width: b.w, height: b.h }}
      onPointerDown={onGrab}
      initial={{ x: b.x, y: b.y, scale: 1 }}
      animate={{ x: b.x, y: b.y, scale: ghost.lift ? 1.06 : 1 }}
      transition={{ x: { duration: ghost.ms / 1000, ease: EASE.inOut }, y: { duration: ghost.ms / 1000, ease: EASE.inOut }, scale: { type: 'spring', stiffness: 420, damping: 24 } }}
      aria-hidden="true"
    >
      <motion.div
        key={ghost.wobble}
        style={{ width: '100%', height: '100%' }}
        animate={ghost.wobble ? { rotate: [0, -10, 8, -6, 3, 0], x: [0, -8, 8, -5, 3, 0] } : {}}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        {render(ghost.item)}
      </motion.div>
    </motion.div>
  )
}

const HAND_W = 'min(13cqh, 118px)'

/** 示範的手（指尖對準 at） */
export function HandView({ hand }: { hand: HandState | null }) {
  if (!hand) return null
  return (
    <motion.div
      className="demo-hand carry-hand"
      style={{ width: HAND_W, left: 0, top: 0 }}
      initial={false}
      animate={{ x: hand.at.x, y: hand.at.y, opacity: hand.on ? (hand.faint ? 0.62 : 1) : 0 }}
      transition={{ x: { duration: hand.ms / 1000, ease: EASE.inOut }, y: { duration: hand.ms / 1000, ease: EASE.inOut }, opacity: FADE }}
      aria-hidden="true"
    >
      <motion.svg
        key={hand.press}
        viewBox="0 0 64 84"
        width="100%"
        style={{ display: 'block', overflow: 'visible', transformOrigin: '34% 8%' }}
        animate={hand.press ? { y: ['0%', '8%', '0%'], scale: [1, 0.88, 1] } : {}}
        transition={{ duration: 0.34 }}
      >
        <HandArt />
      </motion.svg>
    </motion.div>
  )
}

/**
 * 一起練的引導：正確的那一個上面，手按一下、滑到空位、再滑回來，一直重複；中間一條虛線箭頭指著空位。
 * 整段只有位移和按下，沒有淡入淡出（紙感螢幕上不閃）。
 */
export function GuideLoop({ from, to }: { from: Box; to: Box }) {
  const a = grip(from)
  const b = grip(to)
  // 箭頭：從選項上緣彎上去，到空位下緣
  const s = { x: from.x + from.w / 2, y: from.y + from.h * 0.04 }
  const e = { x: to.x + to.w / 2, y: to.y + to.h * 1.02 }
  const k = { x: s.x + (e.x - s.x) * 0.12, y: e.y + (s.y - e.y) * 0.2 }
  const ang = Math.atan2(e.y - k.y, e.x - k.x)
  const head = (d: number) => `${e.x - 22 * Math.cos(ang + d)} ${e.y - 22 * Math.sin(ang + d)}`
  return (
    <>
      <svg className="guide-arrow" aria-hidden="true">
        <path d={`M${s.x} ${s.y} Q${k.x} ${k.y} ${e.x} ${e.y}`} />
        <path d={`M${head(0.5)} L${e.x} ${e.y} L${head(-0.5)}`} className="head" />
      </svg>
      <motion.div
        className="demo-hand carry-hand"
        style={{ width: HAND_W, left: 0, top: 0 }}
        initial={{ x: a.x, y: a.y, opacity: 0 }}
        animate={{ x: [a.x, a.x, b.x, b.x, a.x], y: [a.y, a.y, b.y, b.y, a.y], opacity: 1 }}
        transition={{
          x: { duration: 2.8, times: [0, 0.18, 0.55, 0.72, 1], repeat: Infinity, ease: 'easeInOut', delay: 0.3 },
          y: { duration: 2.8, times: [0, 0.18, 0.55, 0.72, 1], repeat: Infinity, ease: 'easeInOut', delay: 0.3 },
          opacity: FADE,
        }}
        aria-hidden="true"
      >
        <motion.svg
          viewBox="0 0 64 84"
          width="100%"
          style={{ display: 'block', overflow: 'visible', transformOrigin: '34% 8%' }}
          animate={{ y: ['0%', '8%', '0%', '0%', '0%'], scale: [1, 0.88, 1, 1, 1] }}
          transition={{ duration: 2.8, times: [0, 0.08, 0.16, 0.6, 1], repeat: Infinity, delay: 0.3 }}
        >
          <HandArt />
        </motion.svg>
      </motion.div>
    </>
  )
}

// ── 閒置提示階梯 ─────────────────────────────────────────────

export interface LadderStep {
  /** 從「可以作答」開始算第幾毫秒 */
  at: number
  run: () => void
}

/**
 * 盤點 8-2 的閒置提示階梯：每一階到時間就做，孩子有任何操作就從目前這一階重新計時（做過的不重來）。
 * 和 games/idle.ts 不同：不只有語音，每一階都有畫面上的提示（脈動變明顯、節奏再演一次、手再示範一次）。
 */
export function useLadder() {
  const timer = useRef(0)
  const stage = useRef(0)
  const steps = useRef<LadderStep[] | null>(null)

  const schedule = () => {
    clearTimeout(timer.current)
    const s = steps.current
    if (!s || stage.current >= s.length) return
    const prev = stage.current ? s[stage.current - 1].at : 0
    timer.current = window.setTimeout(() => {
      const now = steps.current
      if (!now) return
      const k = stage.current++
      now[k].run()
      schedule()
    }, s[stage.current].at - prev)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return useRef({
    start(s: LadderStep[]) {
      steps.current = s
      stage.current = 0
      schedule()
    },
    poke() {
      if (steps.current) schedule()
    },
    stop() {
      clearTimeout(timer.current)
      steps.current = null
    },
    /** 現在做到第幾階（0 = 還沒有任何提示） */
    stage: () => stage.current,
  }).current
}
