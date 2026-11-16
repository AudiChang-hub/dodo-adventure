// 迷宮的小圖示（T-156）：選玩法、「再一個」用。一條彎彎的小路，起點一顆蛋形的恐龍頭、終點一顆蘋果（Fluent Emoji）。
import { Emoji } from '../../art/Emoji'

const INK = '#2E2A25'

export function MazePickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <rect x={18} y={18} width={204} height={164} rx={22} fill="#A9CF8E" stroke={INK} strokeWidth={5} />
      <path d="M52 52 H120 V100 H70 V148 H188 V52" fill="none" stroke="#C9B07A" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 52 H120 V100 H70 V148 H188 V52" fill="none" stroke="#F3E6C2" strokeWidth={28} strokeLinecap="round" strokeLinejoin="round" />
      {/* 起點：豆豆的綠色小頭 */}
      <circle cx={52} cy={52} r={17} fill="#7FC38F" stroke={INK} strokeWidth={4.5} />
      <circle cx={57} cy={48} r={3.4} fill={INK} />
      <svg x={168} y={32} width={40} height={40}>
        <Emoji name="red-apple" />
      </svg>
    </svg>
  )
}

/**
 * 「難一點」（T-158）：「再一個」那裡多的一個選擇。同一種小路，但彎比較多、格子比較密，右上角一個往上的大箭頭（往上一級）。
 * 不用字：豆豆說「A bigger maze?」的時候它亮起來、跳一下。
 */
export function MazeHarderArt() {
  const d = 'M44 160 V122 H86 V160 H128 V84 H50 V46 H128 M128 84 H170 V46 M170 84 V160 H198'
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <rect x={18} y={22} width={204} height={164} rx={22} fill="#A9CF8E" stroke={INK} strokeWidth={5} />
      <path d={d} fill="none" stroke="#C9B07A" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#F3E6C2" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={44} cy={160} r={14} fill="#7FC38F" stroke={INK} strokeWidth={4} />
      <circle cx={48} cy={157} r={3} fill={INK} />
      <svg x={180} y={142} width={36} height={36}>
        <Emoji name="red-apple" />
      </svg>
      {/* 往上一級：黃色圓、往上的箭頭 */}
      <circle cx={206} cy={30} r={27} fill="#F1D27C" stroke={INK} strokeWidth={5} />
      <path d="M206 14 L222 32 H212 V46 H200 V32 H190 Z" fill={INK} strokeLinejoin="round" stroke={INK} strokeWidth={3} />
    </svg>
  )
}

/** 第 9 級終點上的鎖（拿到鑰匙就打開）：金色的鎖身、灰色的鎖環、鑰匙孔 */
export function Padlock() {
  return (
    <svg viewBox="0 0 100 110" width="100%" height="100%" aria-hidden="true">
      <path d="M28 52 V34 a22 22 0 0 1 44 0 V52" fill="none" stroke="#8C96A0" strokeWidth={11} strokeLinecap="round" />
      <path d="M28 52 V34 a22 22 0 0 1 44 0 V52" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={0.35} />
      <rect x={14} y={48} width={72} height={56} rx={12} fill="#F1C24B" stroke={INK} strokeWidth={5} />
      <circle cx={50} cy={70} r={8} fill={INK} />
      <rect x={46} y={72} width={8} height={18} rx={3} fill={INK} />
    </svg>
  )
}
