import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { sfx } from '../lib/audio'
import './notyet.css'

/**
 * 「現在還不能動手」（示範、說明、念題目、教學卡收起中）的溫和回應（準則 TOUCH-6、PHASE-2）：
 * 手指碰到的地方浮出一圈淡淡的「看這裡」，配一聲很輕的叮。不出墨、不算作答，也不說話（不打斷正在念的句子）。
 * 孩子知道「有碰到，只是還沒輪到我」，不會以為壞掉、也不會以為自己做錯。
 */
export function useNotYet() {
  const [rings, setRings] = useState<{ x: number; y: number; k: number }[]>([])
  const lastSound = useRef(0)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  /** x、y 是容器裡的像素座標 */
  const ping = useCallback((x: number, y: number) => {
    const now = performance.now()
    // 連點、整隻手壓下去：聲音最多每 0.3 秒一次，圈圈最多同時 3 個
    if (now - lastSound.current > 300) {
      lastSound.current = now
      sfx.notYet()
    }
    setRings((r) => [...r.slice(-2), { x, y, k: now }])
    timers.current.push(window.setTimeout(() => setRings((r) => r.filter((q) => q.k !== now)), 750))
  }, [])
  const view: ReactNode = rings.map((r) => <span key={r.k} className="not-yet" style={{ left: r.x, top: r.y }} aria-hidden="true" />)
  return { ping, view }
}

/** 螢幕座標 → el 裡的版面座標（外層正在縮放、淡入時也對得上） */
export function localPoint(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect()
  const k = el.offsetWidth ? r.width / el.offsetWidth : 1
  return { x: (clientX - r.left) / k, y: (clientY - r.top) / k }
}

/**
 * 蓋在作答區上的透明擋板：on 的時候接住所有觸碰（不會穿過去點到選項），在碰到的地方出現「看這裡」的圈圈。
 * 放在作答區的容器裡（position: relative／absolute），返回鍵、主持的恐龍不在擋板底下，照樣可以點。
 */
export function WaitShield({ on }: { on: boolean }) {
  const { ping, view } = useNotYet()
  const el = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={el}
      className="wait-shield"
      data-accepting={on ? 'false' : 'true'}
      style={{ pointerEvents: on ? 'auto' : 'none' }}
      onPointerDown={(e) => {
        if (!on || !el.current) return
        const p = localPoint(el.current, e.clientX, e.clientY)
        ping(p.x, p.y)
      }}
    >
      {view}
    </div>
  )
}

/**
 * 多點觸控（準則 TOUCH-3）：同時有兩根以上手指、或手掌壓著時，只有第一根手指算數。
 * 用在作答的 onPointerDown：不是第一根手指的就不理。
 */
export const firstFinger = (e: { isPrimary?: boolean; pointerType?: string }) => e.isPrimary !== false || e.pointerType === 'mouse'
