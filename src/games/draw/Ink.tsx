import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
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
  onDown?: (p: Pt) => void
  onMove?: (p: Pt) => void
  onUp?: () => void
}

// 一旦看過觸控筆，就忽略手指與手掌，避免孩子手靠在螢幕上亂畫
let penSeen = false

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

export const Ink = forwardRef<InkHandle, Props>(function Ink({ w, h, color = '#2E2A25', size = 14, ink = true, onDown, onMove, onUp }, ref) {
  const base = useRef<HTMLCanvasElement>(null)
  const live = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const cur = useRef<Stroke | null>(null)
  const active = useRef<number | null>(null)
  const isPen = useRef(false)
  const geo = useRef({ scale: 1, ox: 0, oy: 0, dpr: 1 })
  const props = useRef({ color, size, ink, onDown, onMove, onUp })
  props.current = { color, size, ink, onDown, onMove, onUp }

  const draw = (ctx: CanvasRenderingContext2D, s: Stroke, last: boolean) => {
    const out = getStroke(
      s.pts.map((p) => [p.x, p.y, p.p]),
      { size: s.size, thinning: isPen.current ? 0.55 : 0.25, smoothing: 0.55, streamline: 0.45, simulatePressure: !isPen.current, last },
    )
    ctx.fillStyle = s.color
    ctx.fill(toPath(out))
  }

  const setup = () => {
    const el = base.current?.parentElement
    if (!el || !base.current || !live.current) return
    const r = el.getBoundingClientRect()
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

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokes.current = []
      clearCanvas(base.current)
      clearCanvas(live.current)
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

  const toPt = (e: PointerEvent | React.PointerEvent): Pt => {
    const r = live.current!.getBoundingClientRect()
    const g = geo.current
    return {
      x: (e.clientX - r.left - g.ox) / g.scale,
      y: (e.clientY - r.top - g.oy) / g.scale,
      p: e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 0.5,
    }
  }

  const redrawLive = (last = false) => {
    const c = live.current
    if (!c || !cur.current) return
    clearCanvas(c)
    if (props.current.ink) draw(c.getContext('2d')!, cur.current, last)
  }

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') penSeen = true
    if (penSeen && e.pointerType === 'touch') return
    if (active.current !== null) return
    active.current = e.pointerId
    isPen.current = e.pointerType === 'pen'
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 指標已經消失時拿不到 capture，照樣可以畫 */
    }
    const p = toPt(e)
    cur.current = { color: props.current.color, size: props.current.size, pts: [p] }
    redrawLive()
    props.current.onDown?.(p)
  }

  const move = (e: React.PointerEvent) => {
    if (e.pointerId !== active.current || !cur.current) return
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const p = toPt(ev)
      cur.current.pts.push(p)
      props.current.onMove?.(p)
    }
    redrawLive()
  }

  const up = (e: React.PointerEvent) => {
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

  const style = { position: 'absolute', inset: 0, width: '100%', height: '100%' } as const
  return (
    <>
      <canvas ref={base} style={{ ...style, pointerEvents: 'none' }} />
      <canvas ref={live} style={{ ...style, touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    </>
  )
})
