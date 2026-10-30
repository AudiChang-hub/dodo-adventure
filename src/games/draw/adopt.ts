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
 */
export function useAdopt(ref: RefObject<HTMLElement | null>, h: Handlers) {
  const hs = useRef(h)
  hs.current = h
  useEffect(() => {
    let adopted: number | null = null
    /** 按下去的那一刻就可以畫的手指（之後滑進畫紙才接手） */
    const fresh = new Set<number>()
    const onDown = (e: PointerEvent) => {
      if (hs.current.can(e)) fresh.add(e.pointerId)
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
      if (!pressed || inside(e)) return
      const r = el.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
      const top = document.elementFromPoint(e.clientX, e.clientY)
      if (!top || !el.contains(top) || !fresh.has(e.pointerId) || !hs.current.can(e)) return
      adopted = e.pointerId
      hs.current.down(e)
    }
    const onUp = (e: PointerEvent) => {
      fresh.delete(e.pointerId)
      if (e.pointerId !== adopted) return
      adopted = null
      if (!inside(e)) hs.current.up(e)
    }
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [ref])
}
