// 遊戲怎麼讀年段的操作外框（成長系統 G-3；外框表在 content/growth.ts，年段在 lib/growth.ts）。
//
// 外框是上限（準則 FRAME 共同規則）：實際出幾個選項、一回合幾題，還是由每個遊戲自己的等級決定，這裡只把它們夾在外框裡。
// 跨段的 4 週放寬中，每一項各自照「那一項現在是哪一段」來算（RAMP_WEEK）。
//
// 小班段（和沒設生日）也照準則（家長 2026-10-30 決定「照準則改短」）：
// - 一回合題數：選擇題、自然發音從 6 題改成 5 題（LOAD-3 是 3–5 題）
// - 一回合最多教幾個新的：從 2 個改成 1 個（ADAPT-3、FRAME-8）
// LEGACY_SMALL 改回 true 就是 G-3 之前的樣子（小班段 6 題、最多教 2 個）。
import { BANDS, FRAMES, RAMP_WEEK, type Band, type Frame } from '../content/growth'
import { getGrowth, type GrowthStatus } from '../lib/growth'
import { HINT_DELAY_MAX } from '../lib/engine'

/** true：小班段照 G-3 之前的值（6 題、最多教 2 個）；false：照準則（見檔頭） */
const LEGACY_SMALL = false

/** 兩段提醒都做過之後，每隔多久手再安靜地示範一次（現行 40 秒；年段的第三段比它長就用第三段） */
const IDLE_AGAIN_MS = 40_000

/** 這一項現在用哪一段的值：放寬中到了那一週的項目是新年段，其他是舊年段 */
export function bandOf(g: GrowthStatus, key: keyof Frame): Band {
  if (g.ramp) return RAMP_WEEK[key] <= g.ramp.week ? g.ramp.to : g.ramp.from
  return BANDS.find((b) => FRAMES[b] === g.frame) ?? g.band
}

const clamp = (n: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, n))

/**
 * 一回合幾題：遊戲自己的題數夾在年段的範圍裡（FRAME-5）。小班段選擇題 6 → 5 題。
 */
export function roundItemsOf(g: GrowthStatus, own: number): number {
  if (LEGACY_SMALL && bandOf(g, 'roundItems') === 'small') return own
  return clamp(own, g.frame.roundItems)
}

/** 一回合最多教幾個新的（FRAME-8）：三段都是 1 個 */
export function maxTeachOf(g: GrowthStatus, own: number): number {
  if (LEGACY_SMALL && bandOf(g, 'newPerRound') === 'small') return own
  return Math.min(own, g.frame.newPerRound)
}

/**
 * 一畫面最多幾個選項（LOAD-1、FRAME-2）：新內容第一次出現時 2 個，其他最多 4 個。
 * 小班段是 null：選項數由各遊戲的等級決定，跟現在一樣（各遊戲的出題已經 ≤ 4，sim-teach 會檢查）。
 */
export function optionCapOf(g: GrowthStatus, fresh: boolean): number | null {
  if (bandOf(g, 'maxOptions') === 'small') return null
  return fresh ? g.frame.newOptions : g.frame.maxOptions
}

/**
 * 只留 cap 個選項：答案一定留著，其他照原本的順序留前面的（順序本來就是洗過的）。
 * 選項數本來就不超過的，原封不動回傳同一個物件。
 */
export function capOptions<T extends { id: string }>(options: T[], answer: string, cap: number | null): T[] {
  if (cap === null || options.length <= cap) return options
  const keep = new Set([answer, ...options.filter((o) => o.id !== answer).slice(0, cap - 1).map((o) => o.id)])
  return options.filter((o) => keep.has(o.id))
}

/**
 * 閒置提醒的時間（PHASE-7、FRAME-9），毫秒：
 * - repeat：題目唸完後多久重說題目（第二段）
 * - hint：再多久手再示範一次（第三段，不說話）
 * - again：之後每隔多久手再安靜地示範一次
 * 小班段是 15、15、40 秒，跟現在一樣。第一段「8 秒安靜的手」現在還沒有（V-21 之後另案），所以第一段的秒數先不用。
 */
export function idleTimesOf(g: GrowthStatus) {
  const [, repeat, together] = g.frame.idleSec
  return { repeat: repeat * 1000, hint: (together - repeat) * 1000, again: Math.max(IDLE_AGAIN_MS, together * 1000) }
}

/**
 * 延遲提示（答案淡淡亮起）要等多久：lib/adaptive.ts 會依孩子「一直等光」的情形往上加，
 * 這裡把年段的起點差距加上去（小班段 4 秒是 adaptive 的起點，加 0；中班段 +1 秒、大班段 +2 秒）。
 */
export function hintDelayOf(g: GrowthStatus, adaptiveMs: number): number {
  return Math.min(HINT_DELAY_MAX, adaptiveMs + g.frame.hintDelayMs - FRAMES.small.hintDelayMs)
}

/**
 * 答錯之後的第幾層（FB-2、FRAME-10）：
 * - retry：再試一次（中班段起換成「再想想」「換個方法試試」，給孩子自己修正的時間，不給提示）
 * - contrast：「哪裡不一樣？」答案淡淡亮起，孩子自己比
 * - reveal：標出答案（有教學卡的重教一次）
 * 小班段：錯 1 次 retry、錯 2 次 reveal（跟現在一樣）。中班段起多一層：錯 1 次 retry、2 次 contrast、3 次 reveal。
 */
export type WrongStep = 'retry' | 'contrast' | 'reveal'

export function wrongStepOf(g: GrowthStatus, wrongs: number): WrongStep {
  if (g.frame.afterWrong === 'retry') return wrongs >= 2 ? 'reveal' : 'retry'
  return wrongs >= 3 ? 'reveal' : wrongs === 2 ? 'contrast' : 'retry'
}

const RETRY_LINE = { retry: 'retry', contrast: 'think', findStep: 'another' } as const

/** 第一層「再試一次」說哪一句：小班段 Try again!（lines.ts 的 retryKey），中班段 Think again!，大班段 Try another way! */
export const retryLineOf = (g: GrowthStatus) => RETRY_LINE[g.frame.afterWrong]

/** 大班段：答對之後問 How did you know?（FRAME-10），一回合最多一次，只在還在學的題目 */
export const asksHowOf = (g: GrowthStatus) => g.frame.afterWrong === 'findStep'

/** 這個年段答錯、答對時會多說的台詞（content/lines-frame.ts），先載入；小班段沒有 */
export function wrongLinesOf(g: GrowthStatus, host: string): string[] {
  if (g.frame.afterWrong === 'retry') return []
  return [`${retryLineOf(g)}.${host}`, `contrast.${host}`, ...(asksHowOf(g) ? [`how.${host}`] : [])]
}

/** 拿起來放進去（games/place/Place.tsx）在這個年段能不能拖：小班段只用點的（TOUCH-2、FRAME-3） */
export const dragOf = (g: GrowthStatus): Frame['drag'] => g.frame.drag

// ── 遊戲用：讀現在的年段 ────────────────────────────────────

export const frameNow = () => getGrowth()
export const roundItems = (own: number) => roundItemsOf(getGrowth(), own)
export const maxTeach = (own: number) => maxTeachOf(getGrowth(), own)
export const idleTimes = () => idleTimesOf(getGrowth())
export const hintDelay = (adaptiveMs: number) => hintDelayOf(getGrowth(), adaptiveMs)
