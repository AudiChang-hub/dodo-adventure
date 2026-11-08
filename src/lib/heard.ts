// 聽完了沒（T-109，家長：孩子常常沒聽波波說完就點，看起來都是用猜的，分不出他是不是真的聽懂）。
// 純函式和小小的時鐘，不碰 AudioContext、不碰畫面：lib/audio.ts 播放時告訴它關鍵字什麼時候念完，
// 題目元件在孩子點下去的那一刻問「這一題開始以後，關鍵字有沒有念完過」，答案存進作答紀錄的 heard。
// 單元測試在 scripts/test-heard.ts。
import type { WordTiming } from './audio'

/**
 * 每一句題目的關鍵字是開頭的幾個字（content/keywords.ts 登記；沒登記的整句都算關鍵字）。
 * 一句台詞會分成幾段音檔（感嘆詞、鋪陳段、加重的目標字），每段有自己的逐字時間（timings.json）。
 * 回傳關鍵字在第幾段、那一段開頭之後幾毫秒念完；算不出來（沒登記、時間軸缺了）就回傳 null，等整句念完才算聽完。
 */
export function keywordEnd(segWords: readonly (readonly WordTiming[] | null)[], words: number): { seg: number; ms: number } | null {
  if (!Number.isFinite(words) || words <= 0) return null
  let left = words
  for (let i = 0; i < segWords.length; i++) {
    const w = segWords[i]
    // 前面有一段沒有時間軸：數不出第幾個字在哪裡，保守一點等整句念完
    if (!w) return null
    if (w.length >= left) return { seg: i, ms: w[left - 1][1] }
    left -= w.length
  }
  return null
}

/**
 * 關鍵字的時鐘：記下每一句題目最近一次「關鍵字完整念完」的時間（performance.now 的毫秒）。
 * - 開始播關鍵字所在的那一段：schedule（預計念完的時間）；
 * - 被打斷（孩子搶點、換題、離開）：cut，還沒到預計時間的就作廢——話停在關鍵字中間不算聽完；
 * - 整句自然念完：end（沒有時間軸的句子、平板內建語音都在這時候才算聽完）。
 */
export class KeywordClock {
  private done = new Map<string, number>()
  private pending: { key: string; at: number } | null = null
  constructor(private now: () => number = () => performance.now()) {}

  private settle(drop: boolean) {
    const p = this.pending
    if (!p) return
    if (this.now() >= p.at) {
      this.done.set(p.key, p.at)
      this.pending = null
    } else if (drop) this.pending = null
  }

  /** 關鍵字預計在 at 念完 */
  schedule(key: string, at: number) {
    this.settle(true)
    this.pending = { key, at }
  }

  /** 說話被打斷：還沒念完的關鍵字不算 */
  cut() {
    this.settle(true)
  }

  /** 整句念完了 */
  end(key: string) {
    const p = this.pending
    if (p?.key === key) {
      this.done.set(key, Math.min(p.at, this.now()))
      this.pending = null
    } else if (!p) this.done.set(key, this.now())
  }

  /** since 之後（這一題開始以後），這一句的關鍵字有沒有完整念完過 */
  heardSince(key: string, since: number): boolean {
    this.settle(false)
    return (this.done.get(key) ?? -Infinity) >= since
  }
}

// ── 熟練只看聽完才答的 ─────────────────────────────────────────

/** 熟練看最近幾次「聽完才答」 */
export const HEARD_WINDOW = 5
/** 至少要對幾次（5 次對 4 次） */
export const HEARD_MIN_RIGHT = 4
/** 用猜的也能做到的機會要在這以下，才算「明顯高於亂猜」 */
export const GUESS_CEILING = 0.2

const choose = (n: number, k: number) => {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

/** 每題用猜的答對機會是 p，n 題裡猜對 k 題以上的機會 */
export function guessTail(n: number, k: number, p: number): number {
  let s = 0
  for (let j = k; j <= n; j++) s += choose(n, j) * p ** j * (1 - p) ** (n - j)
  return s
}

/**
 * 最近 HEARD_WINDOW 次聽完才答，要對幾次才算熟：至少 HEARD_MIN_RIGHT 次，而且用猜的做到的機會 ≤ GUESS_CEILING。
 * options 是這幾題裡最少的選項數（最好猜的那一種）。只有一個選項（教過的字母還不夠）猜都猜得中，永遠不算，回傳 null。
 * 2 選 1：5 次對 4 次（猜的話 19%）；3 選 1 以上也是 4 次（猜的話 5% 以下）。
 */
export function heardNeed(options: number): number | null {
  if (options < 2) return null
  const p = 1 / options
  for (let k = HEARD_MIN_RIGHT; k <= HEARD_WINDOW; k++) if (guessTail(HEARD_WINDOW, k, p) <= GUESS_CEILING) return k
  return null
}

/**
 * 技能的「聽完才答」紀錄（db.ts 的 Skill.heard）：最近幾次，答對記 +選項數、答錯記 −選項數。
 * 熟了沒：要有 HEARD_WINDOW 次，裡面對的次數達到 heardNeed。
 */
export function heardFirm(hw: readonly number[] | undefined): boolean {
  if (!hw) return true
  const last = hw.slice(-HEARD_WINDOW)
  if (last.length < HEARD_WINDOW) return false
  const need = heardNeed(Math.min(...last.map(Math.abs)))
  return need != null && last.filter((x) => x > 0).length >= need
}

/** 記一次聽完才答（只留最近 HEARD_WINDOW 次）；只有一個選項的不記（猜都猜得中） */
export function pushHeard(hw: readonly number[] | undefined, right: boolean, options: number): number[] | undefined {
  if (options < 2) return hw ? [...hw] : hw
  return [...(hw ?? []), right ? options : -options].slice(-HEARD_WINDOW)
}
