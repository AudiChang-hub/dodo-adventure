import { useRef, type PointerEvent, type ReactNode } from 'react'
import { back } from '../lib/nav'
import { sfx } from '../lib/audio'

/**
 * 孩子端的返回鍵：點一下就回上一層（2026-10-29 家長試玩後決定，原本要按住，三歲點一下沒反應就卡住）。
 * 不跳出 App 交給 Android 的螢幕固定；連點、轉場中再點都只回一層（lib/nav.ts 的 back）。
 * onTap 是這個按鈕自己的返回（遊戲的 onExit）；沒給就照路由回上一層。
 *
 * 手指放開（pointerup）就返回，不等 click：另一根手指還按在畫面上（拖東西、手掌靠著）時，瀏覽器不會產生 click（B02）。
 * 兩指被瀏覽器當成手勢接走（pointercancel）也算按到了。鍵盤（Enter／空白鍵）還是走 click。
 */
export function BackButton({ label, onTap, children }: { label: string; onTap?: () => void; children: ReactNode }) {
  // 在這顆鍵上按下去的那根手指：從別處滑進來放開的不算
  const finger = useRef<{ id: number; x: number; y: number } | null>(null)
  const fire = (x: number, y: number) => {
    if (back({ x, y }, onTap)) sfx.tap()
  }
  const up = (e: PointerEvent) => {
    const f = finger.current
    if (!f || f.id !== e.pointerId) return
    finger.current = null
    // pointercancel 沒有可靠的座標：用按下去的位置（nav.ts 用它判斷是不是還在同一處連點）
    fire(f.x, f.y)
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
      onClick={(e) => {
        // detail 0：鍵盤按的（手指、滑鼠已經在 pointerup 返回了）
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
