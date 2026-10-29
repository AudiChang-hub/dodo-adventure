import type { Transition, Variants } from 'motion/react'

/**
 * 全站轉場標準：溫和的交叉淡化（2026-10-29 起）。
 * 原本（2026-10-28）是「前景從點的那張卡長出來（0.6 → 1）、收回那張卡」：家長在 TCL 紙感螢幕上錄下來看，
 * 整個畫面突然縮成一個小框再放大，像子母畫面，很怪。家長喜歡溫和感，但不要縮放，所以改成：
 * - 前景（新畫面、教學卡）：淡入，只帶一點點推近（0.98 → 1）；收起時淡出，退一點點（1 → 0.98）。
 * - 背景（舊畫面、題目）：本來就不透明的整頁就待著不動，被新的蓋住；透明的（教學卡後面的題目、冒險的每一段）才跟著淡掉。
 * 不再有錨點：不管點的是哪張卡，整頁都在原地換，看不到「一個小框變大」。
 *
 * 紙感螢幕更新慢、會殘影，所以三條規則：
 * 1. 同一個畫面不卸載重掛：換內容是在畫面裡換（或在前景蓋住的時候換），不整塊淡出再淡入。
 * 2. 每個元素在一段轉場裡透明度只往一個方向變一次，不閃回舊內容、不先畫一幀再開始動。
 * 3. 縮放最多 2%（RANGE.nudge），不從錨點長出來；背景等前景開始蓋上（DUR.behindDelay）才淡：中間不會露出空白底色。
 *
 * 時間都是秒（motion 的單位）；流程裡要等的毫秒數用 ms() 換算。教學節奏的停頓不在這裡（games/pace.ts）。
 *
 * 2026-10-28 起全站都用這一套（元件在 ui/Scenes.tsx）：
 * - page：App 的整頁切換、今日冒險的每一段（交叉淡化）
 * - foreground／background：遊戲裡教學卡 ↔ 題目（交叉淡化）
 * - swap：原地換題、換一回合；turn：貼紙本翻頁
 * - overlay（＋overlayPanel）：慶祝的遮罩、挑貼紙、護眼休息、家長閘門；rise：畫面裡的小卡片（出門任務卡、爸爸回合）
 * 系統設定「減少動態效果」時，App 用 MotionConfig reducedMotion="user"：縮放、位移都不做，只留淡入淡出。
 * （整頁和教學卡另外用 custom 把那 2% 的縮放拿掉，見 nudge。）
 */

/** 緩動曲線 */
export const EASE = {
  /** 進場、拉遠回來：一開始就動、最後慢慢停（easeOutQuint 類） */
  out: [0.22, 1, 0.36, 1],
  /** 前景收起：慢起慢停 */
  inOut: [0.65, 0, 0.35, 1],
  /** 背景退到後面：慢起、退乾淨 */
  in: [0.4, 0, 1, 1],
} as const

/** 時長（秒） */
export const DUR = {
  /** 小東西長大（疊加層的面板、小卡片、換內容時的微縮放） */
  enter: 0.5,
  /** 翻頁時新的一頁多快變成不透明 */
  opaque: 0.18,
  /** 翻頁時舊的一頁淡掉 */
  exitFade: 0.25,
  /** 前景（新畫面、教學卡）淡入；背景回來也是這麼長 */
  fadeIn: 0.34,
  /** 前景（往回時上面的畫面、教學卡）淡出；背景淡掉也是這麼長 */
  fadeOut: 0.3,
  /** 透明的背景等前景開始蓋上才淡：兩層一起半透明的時間很短，不會露出底色 */
  behindDelay: 0.1,
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
  /** 新畫面出現多久之後才收點擊：前一個畫面上連點的手，不會點到剛換上來的畫面 */
  arm: 0.3,
} as const

/** 變化範圍 */
export const RANGE = {
  /** 整頁、教學卡：淡入時從多大推近到 1、淡出時退到多大（看不出是縮放，只是「輕輕靠過來」） */
  nudge: 0.98,
  /** 疊加層的面板、畫面裡的小卡片：從多大長出來、收回到多大（微縮放） */
  settle: 0.97,
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

/**
 * 單向淡掉、之後就卸載（例：連點成圖沒連到下一個點的墨跡）：只從現在的透明度往 0 走一次，不先閃一下。
 * 比換內容的淡出慢一點，紙感螢幕上看得出是「慢慢不見」，不是被擦掉。
 */
export const FADE_OUT_S = 0.5
export const FADE_OUT: Transition = { duration: FADE_OUT_S, ease: EASE.in }

/** 秒 → 毫秒（流程裡 await wait() 用） */
export const ms = (s: number) => Math.round(s * 1000)

/** 前景蓋好、背景也淡好的時間：要在這之後才換背景的內容（換的那一刻看不到） */
export const SETTLED_MS = ms(Math.max(DUR.fadeIn, DUR.behindDelay + DUR.fadeOut)) + 70

/** 前景淡出、背景回來整段要多久 */
export const REVEAL_MS = ms(Math.max(DUR.fadeOut, DUR.fadeIn))

/**
 * 淡入淡出那一層的縮放：custom 給 true（系統設定「減少動態效果」，用 motion 的 useReducedMotion() 傳進來）就完全不縮放。
 * motion 自己的 reducedMotion 只會把縮放改成「瞬間跳過去」，淡出的那一層會先跳小 2% 再淡掉，所以這裡乾脆不給縮放。
 */
const nudge = (reduced?: boolean) => (reduced ? 1 : RANGE.nudge)

const fadeInTx: Transition = { duration: DUR.fadeIn, ease: EASE.out }
const fadeOutTx: Transition = { duration: DUR.fadeOut, ease: EASE.inOut }
const behindTx: Transition = { duration: DUR.fadeOut, delay: DUR.behindDelay, ease: EASE.in }

/** 前景（教學卡）：淡入、輕輕推近（initial → enter），淡出、輕輕退開（exit）。custom：減少動態效果（AnimatePresence 也要給同一個 custom） */
export const foreground: Variants = {
  initial: (reduced?: boolean) => ({ opacity: 0, scale: nudge(reduced) }),
  enter: { opacity: 1, scale: 1, transition: fadeInTx },
  exit: (reduced?: boolean) => ({ opacity: 0, scale: nudge(reduced), transition: fadeOutTx }),
}

/** 背景（題目）：前景出現時在原地淡掉（hidden），前景收起時淡回來（shown）；第一次出現用 initial（和 hidden 同一個樣子，沒有動畫）。不縮放 */
export const background: Variants = {
  initial: { opacity: 0 },
  hidden: { opacity: 0, transition: behindTx },
  shown: { opacity: 1, transition: fadeInTx },
}

/**
 * 同一個位置換成另一塊內容（例：升級後路面格子數變了）：新的疊在上面淡入，舊的等新的蓋好才淡掉。
 * 每個像素都是「舊 → 新」一次，不會先露出底色。新的要在 DOM 上蓋在舊的上面（z-index）。
 */
export const handoff = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, zIndex: 1, transition: { duration: DUR.enter, ease: EASE.out } as Transition },
  exit: { opacity: 0, zIndex: 0, transition: { opacity: { duration: 0.3, delay: DUR.enter }, zIndex: { duration: 0 } } as Transition },
}

/* ────────────────────────────────────────────────────────────────────────────
 * 以下是同一套規格延伸到全站（2026-10-28）：整頁切換、疊加層、換題、翻頁。
 * 曲線、時長都從上面的 EASE／DUR／RANGE 來，各檔案不另外寫數字。
 * ──────────────────────────────────────────────────────────────────────────── */

/** 整頁（App 層的畫面、冒險的每一段）用的 custom */
export interface PageCustom {
  /** 這一層是不是透明的（冒險的每一段共用外面的故事背景） */
  clear: boolean
  /** 系統設定「減少動態效果」：不縮放，只淡入淡出 */
  reduced: boolean
}

/**
 * 整頁切換（ui/Scenes.tsx 用）：交叉淡化，整頁不縮放（只有淡入、淡出的那一層帶 2% 的推近／退開）。
 * - 往前（進站、進遊戲）：新畫面蓋在上面淡入（enter）；舊畫面是不透明的紙，就待在下面不動，被蓋好了才卸載（behind）。
 * - 往回（回地圖、回首頁）：上面的畫面淡出（leave）；下面的畫面一開始就是不透明的、在原位（under → shown），
 *   淡出的過程就是一點一點看到它，所以整段都不會露出底色，也不會兩個完整畫面疊著停很久。
 * - 透明的一層（冒險）：下面那層沒辦法擋住，所以舊的跟著淡掉、往回時下面的跟著淡入，中間是同一張故事背景。
 */
export const page: Variants = {
  initial: (c: PageCustom) => ({ opacity: 0, scale: nudge(c.reduced) }),
  enter: { opacity: 1, scale: 1, transition: fadeInTx },
  behind: (c: PageCustom) => (c.clear ? { opacity: 0, transition: behindTx } : { opacity: 1 }),
  leave: (c: PageCustom) => ({ opacity: 0, scale: nudge(c.reduced), transition: fadeOutTx }),
  under: (c: PageCustom) => ({ opacity: c.clear ? 0 : 1, scale: 1 }),
  shown: { opacity: 1, scale: 1, transition: fadeInTx },
}

/** 往前：新畫面蓋好、舊畫面也退好，可以卸載舊畫面的時間 */
export const PAGE_SETTLED_MS = SETTLED_MS
/** 往回：上面的畫面收好、下面的拉遠回來 */
export const PAGE_REVEAL_MS = REVEAL_MS + 70
/** 原地換內容（換題）之後多久才收點擊 */
export const ARM_MS = ms(DUR.arm)
/** 整頁換畫面之後至少多久才收點擊：轉場（PAGE_SETTLED_MS）差不多走完 */
export const PAGE_ARM_MS = 500
/** 孩子還在連點：停下來這麼久才收（連點的間隔約 0.1～0.3 秒） */
export const PAGE_ARM_QUIET_MS = 400
/** 一直點個不停也最多等這麼久 */
export const PAGE_ARM_MAX_MS = 1600

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

/** 畫面裡一張小卡片出現、收起（例：首頁的出門任務卡）：從 0.97 淡入，收起時淡出縮回 0.97 */
export const rise: Variants = {
  initial: { opacity: 0, scale: RANGE.settle },
  enter: { opacity: 1, scale: 1, transition: { opacity: { duration: DUR.swapIn, ease: EASE.out }, scale: { duration: DUR.enter, ease: EASE.out } } },
  exit: { opacity: 0, scale: RANGE.settle, transition: { duration: DUR.overlayOut, ease: EASE.in } },
}
