// 成長系統的年段與操作外框（docs/成長系統設計.md §1.1、§1.2、§1.5）
//
// 年紀只管「怎麼操作、看多少、玩多久」，能力決定「學什麼」（D1）。這裡只放年段的外框：
// 觸控大小、一畫面幾個選項、能不能拖、一句幾個字、一回合多長、一天多久、故事多長。
// 數字照設計 v0.3.1 的 §1.2，每一格都對應準則第 3 版（docs/幼兒設計準則.md）第十四章 FRAME-1～11，
// 括號裡是規則編號。兩邊要改數字時以準則的 FRAME 為準。
//
// 遊戲怎麼讀這張表在 games/frame.ts（G-3）。小班段有幾項 App 現在還沒照準則改（一回合 6 題、一回合最多教 2 個新的），
// 那幾項遊戲在小班段照現行的值，這張表寫的是準則的目標值。

/** 年段：名稱跟台灣幼兒園的班別一樣（小班 3–4 歲、中班 4–5 歲、大班 5–6 歲） */
export type Band = 'small' | 'middle' | 'big'

export const BANDS: readonly Band[] = ['small', 'middle', 'big']

export const BAND_ZH: Record<Band, string> = { small: '小班段', middle: '中班段', big: '大班段' }

/** 每個年段從幾個月大開始（外框跟月齡走，D3）；未滿 3 歲也用小班段，滿 6 歲之後停在大班段 */
export const BAND_FROM_MONTHS: Record<Band, number> = { small: 36, middle: 48, big: 60 }

/** 沒設生日時的年段：App 現在的樣子 */
export const DEFAULT_BAND: Band = 'small'

/** 一個年段的操作外框（§1.2 的每一列） */
export interface Frame {
  /** 可點目標的最小邊長（公分）；平板上 1 cm ≈ 45 CSS px。三段都一樣，不縮小（FRAME-1） */
  touchCm: number
  /** 主要選項的最小邊長（公分） */
  primaryCm: number
  /** 可點目標之間的最小間距（公分）（TOUCH-1） */
  gapCm: number
  /** 一畫面最多幾個選項；三段都最多 4 個，更多的分到第二個畫面（LOAD-1、FRAME-2） */
  maxOptions: number
  /** 新內容第一次出現時先給幾個選項（FRAME-2） */
  newOptions: number
  /**
   * 能用哪些操作（TOUCH-2、FRAME-3）：
   * - tap：只用點一下；拖曳只用在畫畫、描線、塗色這種「動作本身就是學習目標」的地方
   * - short：加上短距離拖放（放手會吸附、拖到一半放開不算錯），一樣要能用點的完成
   * - long：拖曳本身是學習目標時（插到中間、在格線內寫字）可以是必要的；長按、雙擊、捏合只能選用
   * 拿起來放進去的共用元件是 games/place/Place.tsx（操作降階版）。
   */
  drag: 'tap' | 'short' | 'long'
  /** 一句旁白最多幾個英文字（PHASE-6、FRAME-4） */
  maxWords: number
  /** 一句旁白能不能用 first、then、because 連起來（中班段起，FRAME-4） */
  joinWords: boolean
  /** 一句指令幾個步驟（FRAME-4） */
  steps: readonly [min: number, max: number]
  /** 一回合幾題（LOAD-3、FRAME-5） */
  roundItems: readonly [min: number, max: number]
  /** 一回合最多幾分鐘 */
  roundMinutes: number
  /** 第一次玩（含教學）一回合最多幾分鐘；§1.2 只訂了小班段的 4 分鐘，中班、大班是 G-1 推的「一回合 +1 分鐘」 */
  firstRoundMinutes: number
  /** 一天總時間的預設（分鐘）；家長設定的上限優先（TIME-1、D9、FRAME-6） */
  dailyMinutes: number
  /** 一天冒險站數 */
  stationsPerDay: readonly [min: number, max: number]
  /** 每幾分鐘護眼休息（TIME-1、FRAME-7）；預設用後面那個數字，大班段 15 分鐘，家長可改回 10 */
  eyeBreakEvery: readonly [min: number, max: number]
  /** 護眼休息幾秒 */
  eyeBreakSec: number
  /** 每條線每週最多幾個新概念（FRAME-8） */
  weeklyConcepts: readonly [min: number, max: number]
  /** 一回合最多教幾個新概念；三段都是 1（ADAPT-3、FRAME-8） */
  newPerRound: number
  /** 閒置提示的三段（秒）：安靜的手 → 重說題目、手做一次 → 一起練（PHASE-7、FRAME-9） */
  idleSec: readonly [hand: number, repeat: number, together: number]
  /** 延遲提示從幾毫秒開始（FRAME-9） */
  hintDelayMs: number
  /**
   * 答錯之後（FB-2、FRAME-10）：
   * - retry：再試 → 提示 → 標出答案
   * - contrast：第一層只說「再想想」；第二層加上「哪裡不一樣？」的對比提示
   * - findStep：加上「換一個方法試試」、答對後問 How did you know?；程式題請孩子找出哪一步錯了
   */
  afterWrong: 'retry' | 'contrast' | 'findStep'
  /** 故事：一段（開場、每站之間、結尾）幾句；一章的句數、字數、分鐘數（§3.3、FRAME-11） */
  story: {
    segment: readonly [min: number, max: number]
    sentences: readonly [min: number, max: number]
    words: number
    minutes: readonly [min: number, max: number]
  }
  /** 每章故事最多幾次選擇（D6：4 歲開始有選擇；FRAME-11） */
  storyChoices: number
}

export const FRAMES: Record<Band, Frame> = {
  small: {
    touchCm: 2,
    primaryCm: 2.5,
    gapCm: 0.6,
    maxOptions: 4,
    newOptions: 2,
    drag: 'tap',
    maxWords: 6,
    joinWords: false,
    steps: [1, 2],
    roundItems: [3, 5],
    roundMinutes: 3,
    firstRoundMinutes: 4,
    dailyMinutes: 20,
    stationsPerDay: [3, 4],
    eyeBreakEvery: [10, 10],
    eyeBreakSec: 20,
    weeklyConcepts: [2, 2],
    newPerRound: 1,
    idleSec: [8, 15, 30],
    hintDelayMs: 4000,
    afterWrong: 'retry',
    story: { segment: [1, 3], sentences: [8, 10], words: 45, minutes: [1, 2] },
    storyChoices: 0,
  },
  middle: {
    touchCm: 2,
    primaryCm: 2.5,
    gapCm: 0.6,
    maxOptions: 4,
    newOptions: 2,
    drag: 'short',
    maxWords: 8,
    joinWords: true,
    steps: [2, 2],
    roundItems: [4, 6],
    roundMinutes: 5,
    firstRoundMinutes: 6,
    dailyMinutes: 25,
    stationsPerDay: [4, 4],
    eyeBreakEvery: [10, 10],
    eyeBreakSec: 20,
    weeklyConcepts: [2, 3],
    newPerRound: 1,
    idleSec: [10, 20, 40],
    hintDelayMs: 5000,
    afterWrong: 'contrast',
    story: { segment: [3, 5], sentences: [12, 15], words: 100, minutes: [2, 3] },
    storyChoices: 1,
  },
  big: {
    touchCm: 2,
    primaryCm: 2.5,
    gapCm: 0.6,
    maxOptions: 4,
    newOptions: 2,
    drag: 'long',
    maxWords: 10,
    joinWords: true,
    steps: [2, 3],
    roundItems: [5, 8],
    roundMinutes: 6,
    firstRoundMinutes: 7,
    dailyMinutes: 30,
    stationsPerDay: [4, 5],
    eyeBreakEvery: [10, 15],
    eyeBreakSec: 20,
    weeklyConcepts: [3, 3],
    newPerRound: 1,
    idleSec: [12, 25, 45],
    hintDelayMs: 6000,
    afterWrong: 'findStep',
    story: { segment: [5, 8], sentences: [20, 30], words: 200, minutes: [3, 5] },
    storyChoices: 2,
  },
}

/** 生日跨段時花幾週慢慢放寬（§1.5） */
export const RAMP_WEEKS = 4

/**
 * 跨段時每一項在第幾週換成新年段的值（§1.5）：
 * - 第 1 週：時間（每天總時間、一回合題數和長度、站數、護眼、閒置提示、延遲提示）
 * - 第 2 週：句長（旁白、故事長度）
 * - 第 3 週：新的操作方式，和跟著它一起來的學習負擔（答錯後的提示、每週和每回合的新內容、故事裡的選擇）
 * - 第 4 週：選項上限、觸控大小
 * 往下換段（家長改了生日、覆寫到期）不慢慢收，當天就全部換掉。
 */
export const RAMP_WEEK: Record<keyof Frame, 1 | 2 | 3 | 4> = {
  dailyMinutes: 1,
  roundItems: 1,
  roundMinutes: 1,
  firstRoundMinutes: 1,
  stationsPerDay: 1,
  eyeBreakEvery: 1,
  eyeBreakSec: 1,
  idleSec: 1,
  hintDelayMs: 1,
  maxWords: 2,
  joinWords: 2,
  steps: 2,
  story: 2,
  drag: 3,
  afterWrong: 3,
  weeklyConcepts: 3,
  newPerRound: 3,
  storyChoices: 3,
  maxOptions: 4,
  newOptions: 4,
  touchCm: 4,
  primaryCm: 4,
  gapCm: 4,
}

/** 家長區用的白話說明：這個年段的外框 */
export function frameLines(f: Frame): string[] {
  const range = ([a, b]: readonly [number, number], unit: string) => (a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`)
  const drag = { tap: '只用點一下', short: '加上短距離拖放（一樣能用點的完成）', long: '拖放是學習目標時可以要求拖（插到中間、在格線內寫字）' }[f.drag]
  const wrong = { retry: '再試一次 → 提示 → 標出答案', contrast: '先說「再想想」，再問「哪裡不一樣？」', findStep: '先說「換個方法試試」，答對後問「你怎麼知道的？」' }[f.afterWrong]
  return [
    `按鈕至少 ${f.touchCm} 公分，一畫面最多 ${f.maxOptions} 個選項`,
    `操作：${drag}`,
    `一句旁白最多 ${f.maxWords} 個英文字`,
    `一回合 ${range(f.roundItems, '題')}、${f.roundMinutes} 分鐘內；一天 ${range(f.stationsPerDay, '站')}`,
    `沒動作 ${f.idleSec[1]} 秒才重說題目；答錯時${wrong}`,
    `故事一章約 ${f.story.words} 字${f.storyChoices ? `，有 ${f.storyChoices} 次選擇` : ''}`,
  ]
}
