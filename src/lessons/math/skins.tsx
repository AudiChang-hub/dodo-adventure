import type { ReactNode } from 'react'

/**
 * 小遊戲的外觀（T-147，換皮不換題）：比多少的兩堆放在船上、找數字的數字寫在氣球上。
 * 只換畫面，選項、答案、作答紀錄跟原本的比多少、找數字一模一樣（kit.tsx 的 Quiz）。
 */

/** 一艘船：東西（那一堆）坐在船上，船下面是水 */
export function Boat({ children }: { children: ReactNode }) {
  return (
    <div className="ma-boat">
      <div className="ma-boat-load">{children}</div>
      <svg className="ma-boat-hull" viewBox="0 0 200 64" aria-hidden="true">
        <path d="M6 10 H194 L170 52 Q166 58 158 58 H42 Q34 58 30 52 Z" fill="#c98a5a" />
        <path d="M6 10 H194 L190 18 H10 Z" fill="#b0744a" />
        <path d="M0 60 Q25 52 50 60 T100 60 T150 60 T200 60 V64 H0 Z" fill="#8fbcd0" />
      </svg>
    </div>
  )
}

const BALLOON_TONES = ['#e9a28c', '#9cc3d6', '#e7c86f', '#a9cf9a']

/** 一顆氣球，數字寫在上面；答對的那一顆會破掉（math.css 的 .tile.correct），數字留著 */
export function Balloon({ n, tone }: { n: number; tone: number }) {
  return (
    <div className="ma-balloon">
      <svg className="ma-balloon-body" viewBox="0 0 100 140" aria-hidden="true">
        <path d="M50 118 Q46 128 52 134 Q58 140 50 140" fill="none" stroke="#9a8f84" strokeWidth="2" />
        <ellipse cx="50" cy="56" rx="44" ry="52" fill={BALLOON_TONES[tone % BALLOON_TONES.length]} />
        <path d="M44 106 L56 106 L50 116 Z" fill={BALLOON_TONES[tone % BALLOON_TONES.length]} />
        <ellipse cx="34" cy="34" rx="9" ry="14" fill="#fff" opacity="0.45" />
      </svg>
      <span className="glyph num ma-balloon-num">{n}</span>
    </div>
  )
}
