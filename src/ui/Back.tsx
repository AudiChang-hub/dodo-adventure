import type { ReactNode } from 'react'
import { back } from '../lib/nav'
import { sfx } from '../lib/audio'

/**
 * 孩子端的返回鍵：點一下就回上一層（2026-10-29 家長試玩後決定，原本要按住，三歲點一下沒反應就卡住）。
 * 不跳出 App 交給 Android 的螢幕固定；連點、轉場中再點都只回一層（lib/nav.ts 的 back）。
 * onTap 是這個按鈕自己的返回（遊戲的 onExit）；沒給就照路由回上一層。
 */
export function BackButton({ label, onTap, children }: { label: string; onTap?: () => void; children: ReactNode }) {
  return (
    <button
      className="round-btn back-btn"
      data-back=""
      aria-label={label}
      onClick={(e) => {
        if (back({ x: e.clientX, y: e.clientY }, onTap)) sfx.tap()
      }}
    >
      {children}
    </button>
  )
}
