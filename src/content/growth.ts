// 成長系統的年段與操作外框（docs/成長系統設計.md §1.1、§1.2、§1.5）
//
// 年紀只管「怎麼操作、看多少、玩多久」，能力決定「學什麼」（D1）。這裡只放年段的外框：
// 觸控大小、一畫面幾個選項、能不能拖、一句幾個字、一回合多長、一天多久、故事多長。
// 小班段的數字取自 T-49（docs/幼兒設計準則.md，括號裡是規則編號），就是 App 現在的樣子；
// 中班段、大班段是成長系統設計訂的設計值，等 T-49 補上 4–6 歲後再對照（G-0a）。
//
// G-1 只是地基：這張表還沒有套用到遊戲（G-3 才套），所以小班段的畫面和現在完全一樣。

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
  /** 可點目標的最小邊長（公分）；平板上 1 cm ≈ 45 CSS px */
  touchCm: number
  /** 主要選項的最小邊長（公分） */
  primaryCm: number
  /** 可點目標之間的最小間距（公分）（TOUCH-1） */
  gapCm: number
  /** 一畫面最多幾個選項（LOAD-1） */
  maxOptions: number
  /** 新內容第一次出現時先給幾個選項 */
  newOptions: number
  /**
   * 能用哪些操作（TOUCH-2）：
   * - tap：只用點一下；拖曳只用在畫畫、描線、塗色這種「動作本身就是學習目標」的地方
   * - short：加上短距離拖放（放手會吸附）
   * - long：加上長距離拖放、插到中間、在格線內寫字
   * 不管哪一段，拿起來放進去都一定也能用點的完成。
   */
  drag: 'tap' | 'short' | 'long'
  /** 一句旁白最多幾個英文字（PHASE-6） */
  maxWords: number
  /** 一句旁白能不能用 and、then、because 連起來 */
  joinWords: boolean
  /** 一回合幾題（LOAD-3） */
  roundItems: readonly [min: number, max: number]
  /** 一回合最多幾分鐘 */
  roundMinutes: number
  /** 第一次玩（含教學）一回合最多幾分鐘；§1.2 只訂了小班段的 4 分鐘，中班、大班先用「一回合 +1 分鐘」 */
  firstRoundMinutes: number
  /** 一天總時間的預設（分鐘）；家長設定的上限優先（TIME-1、D9） */
  dailyMinutes: number
  /** 一天冒險站數 */
  stationsPerDay: readonly [min: number, max: number]
  /** 每幾分鐘護眼休息（TIME-1）；大班段可以由家長在 10–15 之間調 */
  eyeBreakEvery: readonly [min: number, max: number]
  /** 護眼休息幾秒 */
  eyeBreakSec: number
  /** 每條線每週最多幾個新概念 */
  weeklyConcepts: readonly [min: number, max: number]
  /** 一回合最多教幾個新內容 */
  newPerRound: number
  /** 延遲提示從幾毫秒開始 */
  hintDelayMs: number
  /**
   * 答錯之後（FB-2）：
   * - retry：再試 → 提示 → 標出答案
   * - contrast：加上「哪裡不一樣？」的對比提示
   * - findStep：加上「自己找出哪一步錯了」
   */
  afterWrong: 'retry' | 'contrast' | 'findStep'
  /** 一章故事的句數、字數、分鐘數（§3.3） */
  story: { sentences: readonly [min: number, max: number]; words: number; minutes: readonly [min: number, max: number] }
  /** 每章故事有幾次選擇（D6：4 歲開始有選擇） */
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
    roundItems: [3, 5],
    roundMinutes: 3,
    firstRoundMinutes: 4,
    dailyMinutes: 20,
    stationsPerDay: [3, 4],
    eyeBreakEvery: [10, 10],
    eyeBreakSec: 20,
    weeklyConcepts: [2, 2],
    newPerRound: 2,
    hintDelayMs: 4000,
    afterWrong: 'retry',
    story: { sentences: [7, 7], words: 40, minutes: [1, 2] },
    storyChoices: 0,
  },
  middle: {
    touchCm: 2,
    primaryCm: 2.2,
    gapCm: 0.6,
    maxOptions: 5,
    newOptions: 2,
    drag: 'short',
    maxWords: 9,
    joinWords: false,
    roundItems: [5, 7],
    roundMinutes: 5,
    firstRoundMinutes: 6,
    dailyMinutes: 25,
    stationsPerDay: [4, 4],
    eyeBreakEvery: [10, 10],
    eyeBreakSec: 20,
    weeklyConcepts: [2, 3],
    newPerRound: 2,
    hintDelayMs: 5000,
    afterWrong: 'contrast',
    story: { sentences: [12, 15], words: 100, minutes: [2, 3] },
    storyChoices: 1,
  },
  big: {
    touchCm: 1.8,
    primaryCm: 1.8,
    gapCm: 0.6,
    maxOptions: 6,
    newOptions: 2,
    drag: 'long',
    maxWords: 12,
    joinWords: true,
    roundItems: [6, 8],
    roundMinutes: 6,
    firstRoundMinutes: 7,
    dailyMinutes: 30,
    stationsPerDay: [4, 5],
    eyeBreakEvery: [10, 15],
    eyeBreakSec: 20,
    weeklyConcepts: [3, 3],
    newPerRound: 3,
    hintDelayMs: 6000,
    afterWrong: 'findStep',
    story: { sentences: [20, 30], words: 200, minutes: [3, 5] },
    storyChoices: 2,
  },
}

/** 生日跨段時花幾週慢慢放寬（§1.5） */
export const RAMP_WEEKS = 4

/**
 * 跨段時每一項在第幾週換成新年段的值（§1.5）：
 * - 第 1 週：時間（每天總時間、一回合題數和長度、站數、護眼、延遲提示）
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
  hintDelayMs: 1,
  maxWords: 2,
  joinWords: 2,
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
  const drag = { tap: '只用點一下', short: '加上短距離拖放（一樣能用點的完成）', long: '加上長距離拖放、在格線內寫字' }[f.drag]
  return [
    `按鈕至少 ${f.touchCm} 公分，一畫面最多 ${f.maxOptions} 個選項`,
    `操作：${drag}`,
    `一句旁白最多 ${f.maxWords} 個英文字`,
    `一回合 ${range(f.roundItems, '題')}、${f.roundMinutes} 分鐘內；一天 ${range(f.stationsPerDay, '站')}`,
    `故事一章約 ${f.story.words} 字${f.storyChoices ? `，有 ${f.storyChoices} 次選擇` : ''}`,
  ]
}
