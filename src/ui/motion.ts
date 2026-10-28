import type { Transition, Variants } from 'motion/react'

/**
 * 全站轉場標準：「前景 ↔ 背景」的溫和轉場。
 * 從程式車庫「教學卡（大大的箭頭）↔ 小恐龍開車的地圖」這段整理出來（2026-10-28，家長喜歡它的溫和感）。
 *
 * 一段轉場只有兩層：
 * - 前景（例：教學卡）：從錨點（例：車子）的方向長出來、收回錨點，大小只在 0.6 ↔ 1 之間變。
 * - 背景（例：地圖）：前景蓋上之後才往錨點微微推近（1 → 1.06）並淡掉；前景收回時同時拉遠回來（1.06 → 1）並淡入。
 *
 * 紙感螢幕更新慢，所以三條規則：
 * 1. 同一個畫面不卸載重掛：換內容是在畫面裡換（或在前景蓋住的時候換），不整塊淡出再淡入。
 * 2. 每個元素在一段轉場裡透明度只往一個方向變一次，不閃回舊內容、不先畫一幀再開始動。
 * 3. 前景先變不透明（DUR.opaque），之後只剩縮放；背景等前景蓋上（DUR.recedeDelay）才退：中間不會露出空白底色。
 *
 * 時間都是秒（motion 的單位）；流程裡要等的毫秒數用 ms() 換算。教學節奏的停頓不在這裡（games/pace.ts）。
 */

/** 緩動曲線 */
export const EASE = {
  /** 進場、拉遠回來：一開始就動、最後慢慢停（easeOutQuint 類） */
  out: [0.22, 1, 0.36, 1],
  /** 前景收回錨點：慢起慢停 */
  inOut: [0.65, 0, 0.35, 1],
  /** 背景退到後面：慢起、退乾淨 */
  in: [0.4, 0, 1, 1],
} as const

/** 時長（秒） */
export const DUR = {
  /** 前景進場（縮放 0.6 → 1） */
  enter: 0.5,
  /** 前景進場時多快變成不透明：不透明之後只剩縮放，不會半透明地疊在背景上閃 */
  opaque: 0.18,
  /** 前景收回（縮放 1 → 0.6） */
  exit: 0.45,
  /** 前景收回的最後這一段才淡掉 */
  exitFade: 0.25,
  /** 背景等前景先蓋上，才開始退 */
  recedeDelay: 0.15,
  /** 背景退到後面（淡掉、推近） */
  recede: 0.4,
  /** 背景回來（淡入、拉遠） */
  return: 0.5,
} as const

/** 變化範圍 */
export const RANGE = {
  /** 前景從多大長出來、收回到多大 */
  fromScale: 0.6,
  /** 背景退到後面時推近到多大 */
  push: 1.06,
} as const

/** 秒 → 毫秒（流程裡 await wait() 用） */
export const ms = (s: number) => Math.round(s * 1000)

/** 前景長好、背景也退好的時間：要在這之後才換背景的內容（換的那一刻看不到） */
export const SETTLED_MS = ms(Math.max(DUR.enter, DUR.recedeDelay + DUR.recede)) + 70

/** 前景收回、背景回來整段要多久 */
export const REVEAL_MS = ms(Math.max(DUR.exit, DUR.return))

/** 前景：從錨點長出來（initial → enter），收回錨點（exit）。transform-origin 由使用的地方給成錨點的位置 */
export const foreground: Variants = {
  initial: { opacity: 0, scale: RANGE.fromScale },
  enter: {
    opacity: 1,
    scale: 1,
    transition: { scale: { duration: DUR.enter, ease: EASE.out }, opacity: { duration: DUR.opaque, ease: 'easeOut' } },
  },
  exit: {
    opacity: 0,
    scale: RANGE.fromScale,
    transition: { scale: { duration: DUR.exit, ease: EASE.inOut }, opacity: { duration: DUR.exitFade, delay: DUR.exit - DUR.exitFade, ease: 'easeIn' } },
  },
}

/** 背景：前景出現時退到後面（hidden），前景收回時回來（shown）；第一次出現用 initial（和 hidden 同一個樣子，沒有動畫） */
export const background: Variants = {
  initial: { opacity: 0, scale: RANGE.push },
  hidden: { opacity: 0, scale: RANGE.push, transition: { duration: DUR.recede, delay: DUR.recedeDelay, ease: EASE.in } },
  shown: { opacity: 1, scale: 1, transition: { duration: DUR.return, ease: EASE.out } },
}

/**
 * 同一個位置換成另一塊內容（例：升級後路面格子數變了）：新的疊在上面淡入，舊的等新的蓋好才淡掉。
 * 每個像素都是「舊 → 新」一次，不會先露出底色。新的要在 DOM 上蓋在舊的上面（z-index）。
 */
export const handoff = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, zIndex: 1, transition: { duration: DUR.return, ease: EASE.out } as Transition },
  exit: { opacity: 0, zIndex: 0, transition: { opacity: { duration: 0.3, delay: DUR.return }, zIndex: { duration: 0 } } as Transition },
}
