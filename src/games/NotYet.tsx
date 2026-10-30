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
export function WaitShield({ on, z }: { on: boolean; /** 作答區裡有自己 z-index 很高的東西（拖曳的蛋）時，擋板要蓋得過它 */ z?: number }) {
  const { ping, view } = useNotYet()
  const el = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={el}
      className="wait-shield"
      data-accepting={on ? 'false' : 'true'}
      style={{ pointerEvents: on ? 'auto' : 'none', zIndex: z }}
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

// 自己記哪些手指還按著（pointerId → 最後一次有動靜的時間）。
// 瀏覽器的 isPrimary 不能單獨相信：某一根手指的放開被吃掉時（切到背景、系統手勢搶走），之後每一下都被當成「第二根手指」，
// 所有按鈕都不理孩子，整個遊戲像卡死一樣（三歲模擬測試 B01）。
const fingers = new Map<number, number>()
/** 按著不動超過這麼久的手指不算還按著（放開被吃掉的那一根） */
const STALE_MS = 2500
if (typeof window !== 'undefined') {
  const seen = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && (e.type === 'pointerdown' || fingers.has(e.pointerId))) fingers.set(e.pointerId, performance.now())
  }
  window.addEventListener('pointerdown', seen, true)
  window.addEventListener('pointermove', seen, true)
  window.addEventListener('pointerup', (e) => fingers.delete(e.pointerId), true)
  // pointercancel 不是放開：兩指時瀏覽器常先取消第一根（當成縮放手勢），手指其實還壓著；留著等它自己過期
  window.addEventListener('pointercancel', seen, true)
  document.addEventListener('visibilitychange', () => fingers.clear())
}

/**
 * 多點觸控（準則 TOUCH-3）：同時有兩根以上手指、或手掌壓著時，只有第一根手指算數。
 * 用在作答的 onPointerDown：不是第一根手指的就不理。
 * 瀏覽器說「不是第一根」時，再確認真的有別的手指正按著（剛剛還有動靜）；沒有就照樣算數。
 */
export const firstFinger = (e: { isPrimary?: boolean; pointerType?: string; pointerId?: number }) => {
  if (e.isPrimary !== false || e.pointerType === 'mouse') return true
  const now = performance.now()
  for (const [id, at] of fingers) if (id !== e.pointerId && now - at < STALE_MS) return false
  return true
}
