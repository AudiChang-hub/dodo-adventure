import { useEffect, useRef, useState } from 'react'

/** 按住一段時間才觸發：清空畫布、家長入口這類不能一碰就發生的事（返回鍵改成點一下，見 ui/Back.tsx） */
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
