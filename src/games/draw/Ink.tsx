import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { PenArt } from '../Demo'
import { localPoint, useNotYet } from '../NotYet'
import { useAdopt } from './adopt'
import './ink.css'
import { getStroke } from 'perfect-freehand'

export interface Pt {
  x: number
  y: number
  p: number
}

export interface Stroke {
  color: string
  size: number
  pts: Pt[]
}

export interface InkHandle {
  clear: () => void
  /** 最後一筆在 delay 毫秒後慢慢淡掉、拿掉（例如運筆小路裡沒有推動車子、畫在路外面的線） */
  fadeLast: (delay?: number) => void
  strokes: () => Stroke[]
  snapshot: (bg?: string, maxW?: number) => string
}

interface Props {
  /** 邏輯座標系，與底下的 SVG viewBox 一致（等比例置中） */
  w: number
  h: number
  color?: string
  size?: number
  /** false 時只回報座標、不留下筆跡 */
  ink?: boolean
  /**
   * 示範、說明中（準則 PHASE-2）：孩子的手指和筆完全不出墨、不回報座標（遊戲收不到 onDown／onMove），
   * 只在碰到的地方出現「看這裡」的圈圈。畫到一半變成 disabled，那一筆直接丟掉。
   */
  disabled?: boolean
  /** disabled 時被擋下的觸碰（遊戲可以讓示範的手、起點亮一下） */
  onBlocked?: (p: Pt) => void
  /** 第二個參數是 pointerType（'pen' | 'touch' | 'mouse'），遊戲可以用來判斷孩子用的是手指還是筆 */
  onDown?: (p: Pt, type: string) => void
  onMove?: (p: Pt) => void
  onUp?: () => void
}

// 防手掌誤觸：只有在筆正在接觸螢幕或懸停、以及筆離開後約 1 秒內，才忽略手指與手掌。
// 其他時候手指都能畫（以前看過一次筆就永遠忽略手指，大人也會以為壞掉）
const PALM_MS = 1000
let penDown = false
let penAt = -Infinity
const notePen = (e: PointerEvent) => {
  if (e.pointerType !== 'pen') return
  penAt = performance.now()
  if (e.type === 'pointerdown') penDown = true
  else if (e.type === 'pointerup' || e.type === 'pointercancel') penDown = false
}
if (typeof window !== 'undefined')
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerleave', 'pointerrawupdate'])
    window.addEventListener(t, notePen as EventListener, { capture: true, passive: true })

/** 筆現在在附近嗎（接觸、懸停，或剛離開不到 1 秒） */
export const penNearby = () => penDown || performance.now() - penAt < PALM_MS

function toPath(outline: number[][]): Path2D {
  const p = new Path2D()
  if (!outline.length) return p
  p.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[i + 1]
    p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  p.closePath()
  return p
}

export const Ink = forwardRef<InkHandle, Props>(function Ink({ w, h, color = '#2E2A25', size = 14, ink = true, disabled = false, onBlocked, onDown, onMove, onUp }, ref) {
  const base = useRef<HTMLCanvasElement>(null)
  const live = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const cur = useRef<Stroke | null>(null)
  const active = useRef<number | null>(null)
  const isPen = useRef(false)
  const geo = useRef({ scale: 1, ox: 0, oy: 0, dpr: 1 })
  /** 被忽略的觸碰：在那裡淡淡地出現一支筆，讓人知道「筆在用，手先拿開」，不會毫無反應 */
  const [ghost, setGhost] = useState<{ x: number; y: number; n: number } | null>(null)
  const ghostTimer = useRef(0)
  useEffect(() => () => clearTimeout(ghostTimer.current), [])
  const props = useRef({ color, size, ink, disabled, onBlocked, onDown, onMove, onUp })
  props.current = { color, size, ink, disabled, onBlocked, onDown, onMove, onUp }
  const notYet = useNotYet()

  const draw = (ctx: CanvasRenderingContext2D, s: Stroke, last: boolean) => {
    const out = getStroke(
      s.pts.map((p) => [p.x, p.y, p.p]),
      // 手指的線要緊跟著手（T-51：streamline 0.45 時快速轉彎會被抄近路，線不在手指走過的地方）；筆維持比較平順
      { size: s.size, thinning: isPen.current ? 0.55 : 0.25, smoothing: 0.55, streamline: isPen.current ? 0.45 : 0.15, simulatePressure: !isPen.current, last },
    )
    ctx.fillStyle = s.color
    ctx.fill(toPath(out))
  }

  // 2026-10-28 修：量版面大小要用 clientWidth／clientHeight（不受外層 transform 影響），不能用 getBoundingClientRect。
  // 整頁轉場（ui/Scenes.tsx）讓新畫面從 0.6 長到 1，遊戲剛掛上時外層正被縮放；以前在那一刻量到縮小的框，
  // 之後 ResizeObserver 不會因為 transform 再觸發，手指的座標就一直被放大、偏到別的地方（連點成圖的線跑到空白處、碰不到點）。
  const setup = () => {
    const el = base.current?.parentElement
    if (!el || !base.current || !live.current) return
    const r = { width: el.clientWidth, height: el.clientHeight }
    const dpr = Math.min(2, devicePixelRatio || 1)
    const scale = Math.min(r.width / w, r.height / h)
    const g = { scale, ox: (r.width - w * scale) / 2, oy: (r.height - h * scale) / 2, dpr }
    geo.current = g
    for (const c of [base.current, live.current]) {
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * g.ox, dpr * g.oy)
    }
    const ctx = base.current.getContext('2d')!
    strokes.current.forEach((s) => draw(ctx, s, true))
  }

  useEffect(() => {
    setup()
    const ro = new ResizeObserver(setup)
    if (base.current?.parentElement) ro.observe(base.current.parentElement)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h])

  const clearCanvas = (c: HTMLCanvasElement | null) => {
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.restore()
  }

  const fadeTimers = useRef<number[]>([])
  useEffect(() => () => fadeTimers.current.forEach(clearTimeout), [])
  const redrawBase = (fading?: Stroke, alpha = 1) => {
    const c = base.current
    if (!c) return
    clearCanvas(c)
    const ctx = c.getContext('2d')!
    for (const s of strokes.current) {
      ctx.globalAlpha = s === fading ? alpha : 1
      draw(ctx, s, true)
    }
    ctx.globalAlpha = 1
  }

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokes.current = []
      clearCanvas(base.current)
      clearCanvas(live.current)
    },
    fadeLast: (delay = 700) => {
      const s = strokes.current[strokes.current.length - 1]
      if (!s) return
      fadeTimers.current.push(
        window.setTimeout(() => {
          const t0 = performance.now()
          const step = (now: number) => {
            if (!strokes.current.includes(s)) return
            const f = Math.min(1, (now - t0) / 450)
            if (f >= 1) {
              strokes.current = strokes.current.filter((x) => x !== s)
              return redrawBase()
            }
            redrawBase(s, 1 - f)
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }, delay),
      )
    },
    strokes: () => strokes.current,
    snapshot: (bg = '#FBF8F2', maxW = 480) => {
      const c = document.createElement('canvas')
      const s = maxW / w
      c.width = maxW
      c.height = Math.round(h * s)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.scale(s, s)
      strokes.current.forEach((st) => draw(ctx, st, true))
      return c.toDataURL('image/webp', 0.8)
    },
  }))

  const toPt = (e: PointerEvent): Pt => {
    const c = live.current!
    const r = c.getBoundingClientRect()
    const g = geo.current
    // 畫面上的框（含外層正在做的縮放）÷ 版面大小 = 外層現在的縮放；先換回版面座標，轉場中途也對得上
    const k = c.offsetWidth ? r.width / c.offsetWidth : 1
    return {
      x: ((e.clientX - r.left) / k - g.ox) / g.scale,
      y: ((e.clientY - r.top) / k - g.oy) / g.scale,
      p: e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 0.5,
    }
  }

  const redrawLive = (last = false) => {
    const c = live.current
    if (!c || !cur.current) return
    clearCanvas(c)
    if (props.current.ink) draw(c.getContext('2d')!, cur.current, last)
  }

  /** 示範中變成 disabled：畫到一半的那一筆直接丟掉（不留墨、遊戲也不會收到 onUp） */
  useEffect(() => {
    if (!disabled || active.current === null) return
    active.current = null
    cur.current = null
    clearCanvas(live.current)
  }, [disabled])

  /** captured：這一筆是從畫布上下筆的（拿得到 pointer capture）；從畫布外滑進來的那一筆沒有 */
  const down = (e: PointerEvent, captured: boolean) => {
    if (props.current.disabled) {
      if (!e.isPrimary && e.pointerType === 'touch') return
      const c = live.current!
      const lp = localPoint(c, e.clientX, e.clientY)
      notYet.ping(lp.x, lp.y)
      props.current.onBlocked?.(toPt(e))
      return
    }
    if (e.pointerType === 'touch' && penNearby() && active.current === null) {
      const c = live.current!
      const lp = localPoint(c, e.clientX, e.clientY)
      setGhost((g) => ({ ...lp, n: (g?.n ?? 0) + 1 }))
      clearTimeout(ghostTimer.current)
      ghostTimer.current = window.setTimeout(() => setGhost(null), 900)
      return
    }
    // 手掌先碰到、筆才下來：筆優先，丟掉手掌那一筆（還沒留下筆跡）
    if (active.current !== null && e.pointerType === 'pen' && !isPen.current) {
      active.current = null
      cur.current = null
      clearCanvas(live.current)
    }
    if (active.current !== null) return
    active.current = e.pointerId
    isPen.current = e.pointerType === 'pen'
    if (captured)
      try {
        live.current!.setPointerCapture(e.pointerId)
      } catch {
        /* 指標已經消失時拿不到 capture，照樣可以畫 */
      }
    const p = toPt(e)
    cur.current = { color: props.current.color, size: props.current.size, pts: [p] }
    redrawLive()
    props.current.onDown?.(p, e.pointerType)
  }

  const move = (e: PointerEvent) => {
    if (e.pointerId !== active.current || !cur.current) return
    const evs = e.getCoalescedEvents?.() ?? [e]
    for (const ev of evs.length ? evs : [e]) {
      const p = toPt(ev)
      cur.current.pts.push(p)
      props.current.onMove?.(p)
    }
    redrawLive()
  }

  const up = (e: PointerEvent) => {
    if (e.pointerId !== active.current) return
    active.current = null
    if (cur.current && props.current.ink && cur.current.pts.length) {
      strokes.current.push(cur.current)
      draw(base.current!.getContext('2d')!, cur.current, true)
    }
    cur.current = null
    clearCanvas(live.current)
    props.current.onUp?.()
  }

  // 從畫布外面下筆、滑進畫布的那一筆也要出墨（三歲模擬測試 B09：孩子常從畫紙邊緣外開始畫）
  useAdopt(live, {
    can: (e) => active.current === null && !props.current.disabled && !(e.pointerType === 'touch' && penNearby()),
    down: (e) => down(e, false),
    move,
    up,
  })

  const style = { position: 'absolute', inset: 0, width: '100%', height: '100%' } as const
  return (
    <>
      <canvas ref={base} style={{ ...style, pointerEvents: 'none' }} />
      <canvas
        ref={live}
        data-accepting={disabled ? 'false' : 'true'}
        style={{ ...style, touchAction: 'none' }}
        onPointerDown={(e) => down(e.nativeEvent, true)}
        onPointerMove={(e) => move(e.nativeEvent)}
        onPointerUp={(e) => up(e.nativeEvent)}
        onPointerCancel={(e) => up(e.nativeEvent)}
      />
      {notYet.view}
      {ghost && (
        <svg key={ghost.n} className="ink-ghost" style={{ left: ghost.x, top: ghost.y }} viewBox="-20 -90 80 100" aria-hidden="true">
          <PenArt scale={0.9} />
        </svg>
      )}
    </>
  )
})
