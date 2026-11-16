import { useEffect, useRef } from 'react'
import { useRoute } from '../../lib/nav'

// 兩種玩法共用的小工具（T-152）

/** 這一層畫面還在：離開（路由換了、卸載）就停下所有流程，不會回到首頁還在說話 */
export function useLive() {
  const live = useRef(true)
  const route = useRoute()
  const at = useRef(route)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  useEffect(() => {
    if (route !== at.current) live.current = false
  }, [route])
  return live
}

/** el 的某一點在 layer 裡的百分比座標（手指的位置）；dx、dy 是 el 裡的比例 */
export function pointIn(el: Element | null | undefined, layer: Element | null, dx = 0.55, dy = 0.45) {
  if (!el || !layer) return null
  const r = el.getBoundingClientRect()
  const b = layer.getBoundingClientRect()
  if (!b.width || !b.height) return null
  return { x: ((r.left + r.width * dx - b.left) / b.width) * 100, y: ((r.top + r.height * dy - b.top) / b.height) * 100 }
}

/** el 的中心在 from 的中心的哪裡（px）：東西飛進籃子、珠子飛上繩子用 */
export function offsetTo(from: Element | null | undefined, el: Element | null | undefined, dy = 0.5) {
  if (!from || !el) return { x: 0, y: 0 }
  const a = from.getBoundingClientRect()
  const b = el.getBoundingClientRect()
  return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height * dy - (a.top + a.height / 2) }
}
