import { useEffect, useRef, useState, type ReactNode } from 'react'

/** 按住一段時間才觸發：防止孩子一碰就離開 */
export function useHold(ms: number, onDone: () => void) {
  const [p, setP] = useState(0)
  const start = useRef(0)
  const raf = useRef(0)
  const cb = useRef(onDone)
  cb.current = onDone

  const stop = () => {
    cancelAnimationFrame(raf.current)
    start.current = 0
    setP(0)
  }
  const loop = () => {
    const v = Math.min(1, (performance.now() - start.current) / ms)
    setP(v)
    if (v >= 1) {
      stop()
      cb.current()
    } else raf.current = requestAnimationFrame(loop)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return {
    progress: p,
    handlers: {
      onPointerDown: () => {
        start.current = performance.now()
        raf.current = requestAnimationFrame(loop)
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
    },
  }
}

export function Ring({ progress, color = 'var(--ink)', width = 6 }: { progress: number; color?: string; width?: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
      {progress > 0 && <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />}
    </svg>
  )
}

export function HoldButton({ ms = 1200, onHold, children, label }: { ms?: number; onHold: () => void; children: ReactNode; label: string }) {
  const { progress, handlers } = useHold(ms, onHold)
  return (
    <button className="round-btn" aria-label={label} {...handlers}>
      {children}
      <Ring progress={progress} />
    </button>
  )
}
