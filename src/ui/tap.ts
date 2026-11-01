import { useRef, type MouseEvent, type PointerEvent } from 'react'

/** 同一下按壓，pointerup 和 click 都會來：這段時間裡第二個不算 */
const SAME_PRESS_MS = 700
/** 按下去之後手指移動超過這麼遠就是在滑，不算點 */
const SLOP_PX = 40

/**
 * 點一下就做（首頁的門）：手指在同一個東西上按下、放開就算，不等瀏覽器自己產生 click。
 *
 * 2026-11-01 三大門偶發「點門沒反應」：三歲模擬測試記到手指在門上按下、放開（pointerdown、pointerup 都到了門），
 * 瀏覽器卻沒有產生 click，孩子看到的就是按了沒反應。返回鍵早就因為同一類原因改成收 pointerup（ui/Back.tsx）。
 * 鍵盤（Enter／空白鍵）、滑鼠照樣走 click；pointerup 已經做過的，接著來的 click 不重複做。
 * 新畫面剛換上來、防連點擋掉的那一下（ui/Scenes.tsx 的 Gate）在最外層就被攔了，這裡收不到，不會誤開。
 *
 * 用法：const tap = useTaps(); <button {...tap('english', () => open(...))}>
 */
export function useTaps() {
  const down = useRef(new Map<string, { id: number; x: number; y: number }>())
  const fired = useRef(new Map<string, number>())
  return (key: string, fn: () => void) => {
    const fire = () => {
      const now = performance.now()
      if (now - (fired.current.get(key) ?? -Infinity) < SAME_PRESS_MS) return
      fired.current.set(key, now)
      fn()
    }
    return {
      onPointerDown: (e: PointerEvent) => {
        down.current.set(key, { id: e.pointerId, x: e.clientX, y: e.clientY })
      },
      onPointerUp: (e: PointerEvent) => {
        const d = down.current.get(key)
        down.current.delete(key)
        if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP_PX) return
        fire()
      },
      onPointerCancel: () => {
        down.current.delete(key)
      },
      onClick: (_: MouseEvent) => fire(),
    }
  }
}
