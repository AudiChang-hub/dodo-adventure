import { useEffect, useRef, type RefObject } from 'react'

interface Handlers {
  /** 現在可以接手嗎（沒有正在畫的一筆、不是示範中） */
  can: (e: PointerEvent) => boolean
  down: (e: PointerEvent) => void
  move: (e: PointerEvent) => void
  up: (e: PointerEvent) => void
}

/**
 * 從畫紙外面下筆、滑進畫紙的那一筆，也要出墨（三歲模擬測試 B09、準則 DRAW-1）。
 * 觸控的指標會被「按下去的那個元素」隱含捕捉，滑進畫紙之後畫紙本身收不到 move，
 * 所以在 window 上看：手指（或按著的筆、滑鼠）第一次移進畫紙、而且畫紙就在最上層，就當成在那裡下筆，之後的移動、放開都轉給畫紙。
 * 事件本來就落在畫紙上的（沒被捕捉的滑鼠），由畫紙自己的處理函式處理，這裡不重複轉。
 *
 * 只接手「按下去的那一刻就可以畫」的手指（2026-10-30，三歲模擬測試「示範還沒結束就能畫」）：
 * 示範、說明中從畫紙外按下去的手指，示範一結束就從半路開始出墨；上一題畫到一半就完成、換到下一題時，
 * 還沒放開的那一指也會在新的一題上接著畫。這兩種都要放開、重新按下去才算。
 *
 * 換畫面的轉場中按下去的手指（2026-10-31，T-72 找到的「點遊戲卡後 0.3 秒就畫，之後每一筆都沒有墨」）：
 * 新畫面還沒蓋好時按下去的那一下，整頁轉場（ui/Scenes.tsx 的 Gate）會把按下、放開都攔掉（preventDefault、stopPropagation），
 * 畫紙自己收不到按下。以前從畫紙外畫進來的會被這裡接手，可是放開也被攔在 window 的 capture 階段，這裡（bubble 階段）收不到，
 * 畫紙一直以為那一指還按著，之後每一根新的手指都不收。所以：
 * - 放開、取消改在 capture 階段收：被攔掉的放開也收得到，接手的那一筆一定會收尾；
 * - 直接按在畫紙上、被轉場攔掉的手指，移動超過 START_PX（不是點一下）就從那裡開始出墨：三歲孩子點了門馬上就畫，
 *   那一筆不會整筆沒墨。只是點一下的（連點門落到畫紙上）不出墨，跟轉場不收點擊的規則一樣。
 */
/** 轉場中直接按在畫紙上的手指，移動多遠才算在畫（點一下的抖動不算） */
const START_PX = 14

export function useAdopt(ref: RefObject<HTMLElement | null>, h: Handlers) {
  const hs = useRef(h)
  hs.current = h
  useEffect(() => {
    let adopted: number | null = null
    /** 按下去的那一刻就可以畫的手指（之後滑進畫紙才接手） */
    const fresh = new Set<number>()
    /** 其中按下去被整頁轉場攔掉的（畫紙自己沒收到按下）：按在哪裡 */
    const swallowed = new Map<number, { x: number; y: number }>()
    const onDown = (e: PointerEvent) => {
      if (!hs.current.can(e)) return
      fresh.add(e.pointerId)
      // Scenes 的攔截（module 載入時就掛上）比這裡早跑，被攔掉的這時已經是 defaultPrevented
      if (e.defaultPrevented) swallowed.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const inside = (e: PointerEvent) => {
      const el = ref.current
      return !!el && e.target instanceof Node && el.contains(e.target)
    }
    const onMove = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      if (adopted !== null) {
        if (e.pointerId === adopted && !inside(e)) hs.current.move(e)
        return
      }
      const pressed = e.pointerType === 'touch' || (e.buttons & 1) === 1
      if (!pressed) return
      if (inside(e)) {
        // 畫紙自己收得到的移動：只接手按下去被轉場攔掉、而且真的在畫（移動夠遠）的那一指
        const s = swallowed.get(e.pointerId)
        if (!s || Math.hypot(e.clientX - s.x, e.clientY - s.y) < START_PX || !hs.current.can(e)) return
        swallowed.delete(e.pointerId)
        adopted = e.pointerId
        hs.current.down(e)
        return
      }
      const r = el.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
      const top = document.elementFromPoint(e.clientX, e.clientY)
      if (!top || !el.contains(top) || !fresh.has(e.pointerId) || !hs.current.can(e)) return
      adopted = e.pointerId
      hs.current.down(e)
    }
    const onUp = (e: PointerEvent) => {
      fresh.delete(e.pointerId)
      swallowed.delete(e.pointerId)
      if (e.pointerId !== adopted) return
      adopted = null
      // 畫紙自己的放開可能被轉場攔掉：這裡一定收尾（畫紙再收到一次也只會收一次）
      hs.current.up(e)
    }
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { capture: true, passive: true })
    window.addEventListener('pointercancel', onUp, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, { capture: true })
      window.removeEventListener('pointercancel', onUp, { capture: true })
    }
  }, [ref])
}
