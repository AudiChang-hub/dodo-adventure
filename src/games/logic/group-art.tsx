// 選玩法 4 類的標頭圖示（2026-11-17）：沒有字，孩子看圖示和底色就分得出來。
import type { ReactElement } from 'react'
import type { PickGroupId } from './pick-grid'

const INK = '#2e2a25'

/** 數一數：一顆、兩顆、三顆圓點排成階梯 */
function Count() {
  return (
    <g fill={INK}>
      <circle cx="9" cy="28" r="4" />
      <circle cx="20" cy="28" r="4" />
      <circle cx="20" cy="18" r="4" />
      <circle cx="31" cy="28" r="4" />
      <circle cx="31" cy="18" r="4" />
      <circle cx="31" cy="8" r="4" />
    </g>
  )
}

/** 動動腦：亮起來的燈泡 */
function Think() {
  return (
    <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M20 8a9 9 0 0 1 5.5 16.1c-1.3 1-2 2.3-2 3.9h-7c0-1.6-.7-2.9-2-3.9A9 9 0 0 1 20 8z" fill="#fff8de" strokeLinejoin="round" />
      <path d="M16.5 32h7M17.5 36h5" />
      <path d="M20 2.5v1.5M8.5 7l1.2 1.2M31.5 7l-1.2 1.2M4 17h1.6M34.4 17H36" />
    </g>
  )
}

/** 看仔細：一隻眼睛 */
function Look() {
  return (
    <g>
      <path d="M3 20c4.5-7.5 10-11 17-11s12.5 3.5 17 11c-4.5 7.5-10 11-17 11S7.5 27.5 3 20z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="6.5" fill={INK} />
      <circle cx="22.5" cy="17.5" r="2" fill="#fff" />
    </g>
  )
}

/** 聽和說：對話框加上聲音的弧線 */
function Talk() {
  return (
    <g stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9h19a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H14l-6 5v-5H5a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z" fill="#fff" />
      <path d="M31 12.5c1.6 1.8 1.6 7.2 0 9M35.5 9c3.2 3.8 3.2 12.2 0 16" fill="none" />
    </g>
  )
}

const ART: Record<PickGroupId, () => ReactElement> = { count: Count, think: Think, look: Look, talk: Talk }

export function GroupIcon({ id }: { id: PickGroupId }) {
  const Art = ART[id]
  return (
    <svg className="lg-group-icon" viewBox="0 0 40 40" aria-hidden="true">
      <Art />
    </svg>
  )
}
