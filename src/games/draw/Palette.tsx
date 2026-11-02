import { useEffect, useRef, useState, type ReactNode } from 'react'
import { COLORS } from '../../content/park'
import { sfx } from '../../lib/audio'
import { firstFinger } from '../NotYet'
import { Hand } from '../Demo'
import './tools.css'

/** 自由畫畫的顏色：彩虹的 5 色＋粉紅＋墨色，一共 7 個（準則 DRAW-5：≤ 8 個，每個 ≥ 2 cm） */
const FREE = ['red', 'orange', 'yellow', 'green', 'blue', 'pink'] as const
export const PALETTE = [...FREE.map((id) => COLORS.find((c) => c.id === id)!.hex), '#2E2A25']

/**
 * 右側工具欄：上面一排放 children（完成、清空這些鍵，離畫面下緣最遠），下面是顏色。
 * 兩欄大格子，整欄都在畫紙外（tools.css）。
 */
export function Palette({ value, onChange, children }: { value: string; onChange: (hex: string) => void; children?: ReactNode }) {
  return (
    <div className="tool-col">
      {children}
      {PALETTE.map((hex) => (
        <button
          key={hex}
          className={`tool${value === hex ? ' on' : ''}`}
          aria-label="顏色"
          aria-pressed={value === hex}
          onPointerDown={(e) => {
            if (!firstFinger(e.nativeEvent)) return
            sfx.pop()
            onChange(hex)
          }}
        >
          <span className="tool-swatch" style={{ background: hex }} />
        </button>
      ))}
    </div>
  )
}

/**
 * 完成鍵：點一下就完成（不用按住，準則 NAV-3、DRAW-6）。
 * guard() 為真時（手還在畫、剛放開畫紙不久）這一下當成畫畫的手順便碰到：鍵縮一下，不算。
 */
export function CheckButton({ onPress, guard }: { onPress: () => void; guard?: () => boolean }) {
  const [nope, setNope] = useState(0)
  return (
    <button
      key={nope}
      className={`tool tool-done${nope ? ' nope' : ''}`}
      aria-label="完成"
      onPointerDown={(e) => {
        if (!firstFinger(e.nativeEvent)) return
        if (guard?.()) return setNope((n) => n + 1)
        sfx.pop()
        onPress()
      }}
    >
      <svg viewBox="0 0 48 48" width="62%" aria-hidden="true">
        <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/**
 * 清空畫布：點一下垃圾桶晃一下、變粉紅（「真的要清掉嗎？」）；3 秒內再點一下才清掉（準則 DRAW-6：確認一次）。
 * 變粉紅的時候，一隻手在垃圾桶上「再點一下」給他看（AI 小男生測試 #6：三歲看不懂要再點，連點了三下）。
 * 第一下之後 0.6 秒內的第二下不算確認：三歲常常一點就是兩下，連點的第二下會把整張畫清掉（AI 小男生測試 2026-11-03）。
 */
const CONFIRM_AFTER_MS = 600
export function ClearButton({ onClear }: { onClear: () => void }) {
  const [armed, setArmed] = useState(0)
  const [tap, setTap] = useState(0)
  const timer = useRef(0)
  const handTimer = useRef(0)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      clearTimeout(handTimer.current)
    },
    [],
  )
  return (
    <button
      key={armed}
      className={`tool tool-clear${armed ? ' armed' : ''}`}
      aria-label={armed ? '再點一下就清空' : '清空畫布'}
      onPointerDown={(e) => {
        if (!firstFinger(e.nativeEvent)) return
        clearTimeout(timer.current)
        // 連點的第二下：當成同一下
        if (armed && performance.now() - armed < CONFIRM_AFTER_MS) return
        clearTimeout(handTimer.current)
        if (!armed) {
          sfx.gentle()
          setArmed(performance.now())
          setTap(0)
          // 晃完以後手點一下（不會真的清掉，只是示範）
          handTimer.current = window.setTimeout(() => setTap(1), 650)
          timer.current = window.setTimeout(() => setArmed(0), 3000)
          return
        }
        setArmed(0)
        sfx.whoosh()
        onClear()
      }}
    >
      <svg viewBox="0 0 48 48" width="58%" aria-hidden="true">
        <path d="M14 15 H34 L32 40 Q31.6 42 29.6 42 H18.4 Q16.4 42 16 40 Z" fill="#F3C1B2" stroke="#2E2A25" strokeWidth={3.5} strokeLinejoin="round" />
        <path d="M10 15 H38 M20 15 V10 Q20 8 22 8 H26 Q28 8 28 10 V15" fill="none" stroke="#2E2A25" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 21 V36 M27 21 V36" stroke="#2E2A25" strokeWidth={3} strokeLinecap="round" />
      </svg>
      {armed > 0 && (
        <span className="tool-hand" aria-hidden="true">
          <Hand x={58} y={58} tap={tap} size="62%" />
        </span>
      )}
    </button>
  )
}
