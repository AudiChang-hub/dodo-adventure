import { useRef, useState, type PointerEvent as RPointerEvent } from 'react'

/** 手指移動超過這麼多（CSS px）才算拖曳；小孩點的時候手常常會滑一點點，不能因此變成「拖了沒放好」 */
const DRAG_PX = 14

export interface Ghost<T> {
  item: T
  x: number
  y: number
}

interface Opts<T> {
  /** 現在能不能操作（示範中、車子在開的時候不行） */
  enabled: () => boolean
  /** 點一下（沒有拖） */
  onTap: (item: T) => void
  /** 拖到某處放開：clientX/Y */
  onDrop: (item: T, x: number, y: number) => void
  /** 任何一次按下：閒置提醒重新計時 */
  onPoke?: () => void
}

/**
 * 點或拖都可以（家長回饋：只能拖的話，孩子和大人都常卡住）。
 * 手指和觸控筆都走 Pointer Events；按下時抓住指標，拖出元素外也收得到放開。
 * 拖曳中畫面上跟著手指的是 ghost（由遊戲自己畫），原本的卡片留在原位。
 */
export function useTapDrag<T>(opts: Opts<T>) {
  const o = useRef(opts)
  o.current = opts
  const active = useRef<{ item: T; pid: number; sx: number; sy: number; moved: boolean } | null>(null)
  const [ghost, setGhost] = useState<Ghost<T> | null>(null)

  const bind = (item: T) => ({
    onPointerDown: (e: RPointerEvent) => {
      if (!o.current.enabled() || active.current) return
      o.current.onPoke?.()
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        /* 拿不到 capture 也照樣可以點 */
      }
      active.current = { item, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false }
    },
    onPointerMove: (e: RPointerEvent) => {
      const a = active.current
      if (!a || a.pid !== e.pointerId) return
      if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < DRAG_PX) return
      a.moved = true
      setGhost({ item: a.item, x: e.clientX, y: e.clientY })
    },
    onPointerUp: (e: RPointerEvent) => {
      const a = active.current
      if (!a || a.pid !== e.pointerId) return
      active.current = null
      setGhost(null)
      if (!o.current.enabled()) return
      if (a.moved) o.current.onDrop(a.item, e.clientX, e.clientY)
      else o.current.onTap(a.item)
    },
    onPointerCancel: (e: RPointerEvent) => {
      if (active.current?.pid !== e.pointerId) return
      active.current = null
      setGhost(null)
    },
  })

  return { bind, ghost }
}

/** 點 (x, y) 是否落在元素上（四周放寬 pad px，拖得不準也接得住） */
export function hit(el: Element | null, x: number, y: number, pad = 18): boolean {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
}
