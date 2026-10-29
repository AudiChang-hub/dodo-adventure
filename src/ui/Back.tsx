import { useRef, type PointerEvent, type ReactNode, type TouchEvent } from 'react'
import { back } from '../lib/nav'
import { sfx } from '../lib/audio'

/** 同一下按壓，pointerup 和 touchend 都會來：這段時間裡第二個不算 */
const SAME_PRESS_MS = 500

/**
 * 孩子端的返回鍵：點一下就回上一層（2026-10-29 家長試玩後決定，原本要按住，三歲點一下沒反應就卡住）。
 * 不跳出 App 交給 Android 的螢幕固定；連點、轉場中再點都只回一層（lib/nav.ts 的 back）。
 * onTap 是這個按鈕自己的返回（遊戲的 onExit）；沒給就照路由回上一層。
 *
 * 另一根手指還按在畫面上（拖東西、手掌靠著）時也要能返回（B02）：
 * - 瀏覽器不會產生 click，所以手指放開（pointerup）就返回。
 * - 第一根手指一移動，瀏覽器就把它當成捲動接走：之後新按下的手指完全沒有 pointer 事件，只有 touchstart／touchend。
 *   所以也收 touchend（按下去的那根手指是在這顆鍵上按的才算）。
 * - 兩指被瀏覽器當成手勢接走（pointercancel）也算按到了。鍵盤（Enter／空白鍵）還是走 click。
 */
export function BackButton({ label, onTap, children }: { label: string; onTap?: () => void; children: ReactNode }) {
  // 在這顆鍵上按下去的那根手指（pointer、touch 各記各的）：從別處滑進來放開的不算
  const finger = useRef<{ id: number; x: number; y: number } | null>(null)
  const touch = useRef<{ id: number; x: number; y: number } | null>(null)
  const firedAt = useRef(-Infinity)
  const fire = (x: number, y: number) => {
    const now = performance.now()
    if (now - firedAt.current < SAME_PRESS_MS) return
    firedAt.current = now
    if (back({ x, y }, onTap)) sfx.tap()
  }
  const up = (e: PointerEvent) => {
    const f = finger.current
    if (!f || f.id !== e.pointerId) return
    finger.current = null
    // pointercancel 沒有可靠的座標：用按下去的位置（nav.ts 用它判斷是不是還在同一處連點）
    fire(f.x, f.y)
  }
  const touchUp = (e: TouchEvent) => {
    const t = touch.current
    if (!t || !Array.from(e.changedTouches).some((c) => c.identifier === t.id)) return
    touch.current = null
    fire(t.x, t.y)
  }
  return (
    <button
      className="round-btn back-btn"
      data-back=""
      aria-label={label}
      onPointerDown={(e) => {
        finger.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onTouchStart={(e) => {
        const me = e.currentTarget
        const c = Array.from(e.changedTouches).find((t) => t.target instanceof Node && me.contains(t.target))
        if (c) touch.current = { id: c.identifier, x: c.clientX, y: c.clientY }
      }}
      onTouchEnd={touchUp}
      onTouchCancel={touchUp}
      onClick={(e) => {
        // detail 0：鍵盤按的（手指、滑鼠已經在 pointerup／touchend 返回了）
        if (e.detail === 0) {
          const r = e.currentTarget.getBoundingClientRect()
          fire(r.left + r.width / 2, r.top + r.height / 2)
        }
      }}
    >
      {children}
    </button>
  )
}
