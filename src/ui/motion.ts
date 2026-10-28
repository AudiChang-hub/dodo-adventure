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
 *
 * 2026-10-28 起全站都用這一套（元件在 ui/Scenes.tsx）：
 * - page：App 的整頁切換、今日冒險的每一段（從點的那張卡長出來、收回那張卡；沒有錨點就微縮放）
 * - foreground／background：遊戲裡教學卡 ↔ 題目（卡片從主持的恐龍長出來）
 * - swap：原地換題、換一回合；turn：貼紙本翻頁
 * - overlay（＋overlayPanel）：慶祝的遮罩、挑貼紙、護眼休息、家長閘門；rise：畫面裡的小卡片（出門任務卡、爸爸回合）
 * 系統設定「減少動態效果」時，App 用 MotionConfig reducedMotion="user"：縮放、位移都不做，只留淡入淡出。
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
  /** 換內容：新的淡入（縮放跟 enter 一樣長） */
  swapIn: 0.32,
  /** 換內容：舊的等新的差不多蓋上才淡掉 */
  swapDelay: 0.14,
  /** 換內容：舊的淡掉 */
  swapOut: 0.24,
  /** 疊加層出現（遮罩＋面板一起，一次淡入） */
  overlayIn: 0.32,
  /** 疊加層收起 */
  overlayOut: 0.3,
  /** 新畫面出現多久之後才收點擊：前一個畫面上連點的手，不會點到剛長出來的畫面 */
  arm: 0.3,
} as const

/** 變化範圍 */
export const RANGE = {
  /** 前景從多大長出來、收回到多大 */
  fromScale: 0.6,
  /** 背景退到後面時推近到多大 */
  push: 1.06,
  /** 沒有錨點的整頁、疊加層：從多大長出來、收回到多大（微縮放） */
  settle: 0.96,
  /** 沒有錨點時，下面的畫面推近到多大（比有錨點時輕） */
  settlePush: 1.03,
  /** 換內容：新的從多大長到 1 */
  swapFrom: 0.98,
  /** 清單翻頁：新的一頁從旁邊多遠（寬度的比例）滑進來 */
  turn: 0.06,
} as const

/**
 * 透明度一律用這個（不用彈簧）：彈簧會讓透明度衝過頭再彈回來（0.3 → 0.17 → 0.31），紙感螢幕上就是一閃。
 * 位移、縮放還是可以用彈簧，只要在 transition 裡把 opacity 換成 FADE：{ type: 'spring', …, opacity: FADE }
 */
export const FADE: Transition = { duration: DUR.swapIn, ease: EASE.out }

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

/* ────────────────────────────────────────────────────────────────────────────
 * 以下是同一套規格延伸到全站（2026-10-28）：整頁切換、疊加層、換題、翻頁。
 * 曲線、時長都從上面的 EASE／DUR／RANGE 來，各檔案不另外寫數字。
 * ──────────────────────────────────────────────────────────────────────────── */

const enterTx = foreground.enter as { transition: Transition }
const exitTx = foreground.exit as { transition: Transition }

/** 整頁（App 層的畫面、冒險的每一段）用的 custom：有沒有錨點（點的那張卡、那個按鈕） */
export interface PageCustom {
  anchored: boolean
}

/**
 * 整頁切換（ui/Scenes.tsx 用）：和 foreground／background 是同一段轉場，只是兩層都是整個畫面。
 * - 往前（進站、進遊戲）：新畫面在上面長出來（enter），有錨點從錨點的 0.6 長出，沒有錨點從 0.96 微縮放；
 *   舊畫面等新的蓋上才往錨點推近、淡掉（behind），之後卸載。
 * - 往回（回地圖、回首頁）：上面的畫面收回錨點（leave）；下面的畫面一開始就是不透明的（本來就在那裡），
 *   只從推近的位置拉遠回來（under → shown），所以整段都不會露出底色。
 */
export const page: Variants = {
  initial: (c: PageCustom) => ({ opacity: 0, scale: c.anchored ? RANGE.fromScale : RANGE.settle }),
  enter: { opacity: 1, scale: 1, transition: enterTx.transition },
  behind: (c: PageCustom) => ({ opacity: 0, scale: c.anchored ? RANGE.push : RANGE.settlePush, transition: { duration: DUR.recede, delay: DUR.recedeDelay, ease: EASE.in } }),
  leave: (c: PageCustom) => ({ opacity: 0, scale: c.anchored ? RANGE.fromScale : RANGE.settle, transition: exitTx.transition }),
  under: (c: PageCustom) => ({ opacity: 1, scale: c.anchored ? RANGE.push : RANGE.settlePush }),
  shown: { opacity: 1, scale: 1, transition: { duration: DUR.return, ease: EASE.out } },
}

/** 往前：新畫面蓋好、舊畫面也退好，可以卸載舊畫面的時間 */
export const PAGE_SETTLED_MS = SETTLED_MS
/** 往回：上面的畫面收好、下面的拉遠回來 */
export const PAGE_REVEAL_MS = REVEAL_MS + 70
/** 新畫面多久之後才收點擊 */
export const ARM_MS = ms(DUR.arm)

/**
 * 疊加層（慶祝、貼紙挑選、出門任務卡、家長閘門、護眼休息）：遮罩和面板一起一次淡入，收起時一次淡出。
 * 面板用 overlayPanel 跟著同一個標籤微縮放，自己不另外改透明度（一個元素只變一次）。
 */
export const overlay: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: DUR.overlayIn, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DUR.overlayOut, ease: EASE.in } },
}
export const overlayPanel: Variants = {
  initial: { scale: RANGE.settle, y: 14 },
  enter: { scale: 1, y: 0, transition: { duration: DUR.enter, ease: EASE.out } },
  exit: { scale: RANGE.settle, y: 8, transition: { duration: DUR.overlayOut, ease: EASE.in } },
}

/**
 * 原地換內容（換題、換一回合、冒險的旁白卡）：新的蓋在上面淡入並從 0.98 長到 1，舊的等一下才淡掉。
 * custom = true（still）表示這次換的時候看不到（例如被教學卡蓋著），直接換、不做動畫。
 * 用的地方要把 custom 同時給 AnimatePresence 和子元素，兩層都疊在同一個位置（position: absolute）。
 */
export const swap: Variants = {
  initial: (still?: boolean) => (still ? { opacity: 1, scale: 1 } : { opacity: 0, scale: RANGE.swapFrom }),
  enter: {
    opacity: 1,
    scale: 1,
    zIndex: 1,
    transition: { opacity: { duration: DUR.swapIn, ease: EASE.out }, scale: { duration: DUR.enter, ease: EASE.out }, zIndex: { duration: 0 } },
  },
  exit: (still?: boolean) =>
    still
      ? { opacity: 0, zIndex: 0, transition: { duration: 0 } }
      : { opacity: 0, zIndex: 0, transition: { opacity: { duration: DUR.swapOut, delay: DUR.swapDelay, ease: EASE.in }, zIndex: { duration: 0 } } },
}

/** 清單翻頁（貼紙本）：custom 是方向（1 往後、-1 往前）。新的一頁蓋在上面滑進來，舊的等新的不透明了才淡掉 */
export const turn: Variants = {
  initial: (dir: number) => ({ opacity: 0, x: `${dir * RANGE.turn * 100}%` }),
  enter: {
    opacity: 1,
    x: '0%',
    zIndex: 1,
    transition: { opacity: { duration: DUR.opaque, ease: 'easeOut' }, x: { duration: DUR.enter, ease: EASE.out }, zIndex: { duration: 0 } },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: `${-dir * RANGE.turn * 50}%`,
    zIndex: 0,
    transition: { opacity: { duration: DUR.exitFade, delay: DUR.opaque, ease: EASE.in }, x: { duration: DUR.enter, ease: EASE.out }, zIndex: { duration: 0 } },
  }),
}

/** 畫面裡一張小卡片出現、收起（例：首頁的出門任務卡）：從 0.96 淡入，收起時淡出縮回 0.96 */
export const rise: Variants = {
  initial: { opacity: 0, scale: RANGE.settle },
  enter: { opacity: 1, scale: 1, transition: { opacity: { duration: DUR.swapIn, ease: EASE.out }, scale: { duration: DUR.enter, ease: EASE.out } } },
  exit: { opacity: 0, scale: RANGE.settle, transition: { duration: DUR.overlayOut, ease: EASE.in } },
}
