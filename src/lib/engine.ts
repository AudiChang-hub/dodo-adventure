import { phaseOf, type Attempt, type Skill } from './db'

/**
 * 學習引擎的純函式（第二批・工作線 A）：孩子端的 adaptive.ts 與家長區共用，
 * 都只從作答紀錄與技能資料推算，所以雲端資料在手機上看也算得出一樣的結果。
 * 負擔控制、延遲提示只有舊的站點遊戲在用，T-76 第 3 層拿掉了。
 */

// ── 到期複習（benchmark 手法 1）──────────────────────────────
/** 已熟（3 格以上）之後，依序隔 1、2、4、7、14 個「有玩的日子」再考一次 */
export const REVIEW_DAYS = [1, 2, 4, 7, 14] as const
export const MASTERED_BOX = 3

/**
 * 「第幾個有玩的日子」：今天之前有玩的天數 + 1。
 * 用有玩的日子而不是日曆天，因為假日常出門，不玩是常態，不該因此堆出一大串到期。
 */
export function dayIndexOf(playDates: Iterable<string>, date: string): number {
  let n = 0
  for (const d of playDates) if (d < date) n++
  return n + 1
}

type Sched = Pick<Skill, 'box' | 'due'>
/** 已熟而且到期；舊資料沒有 due，視為今天到期（需要確認一次） */
export const isDueAt = (s: Sched, day: number) => s.box >= MASTERED_BOX && (s.due ?? 0) <= day
/** 超過到期日幾個有玩的日子 */
export const overdueBy = (s: Sched, day: number) => Math.max(0, day - (s.due ?? day))

// ── 特殊題目的標記（metrics）─────────────────────────────────
type M = Pick<Attempt, 'metrics'>
/** 程度校準的探測題（舊的站點遊戲）：故意出比較難的，不計入答對率 */
export const isProbe = (a: M) => !!a.metrics?.probe
/** Sam 教豆豆：豆豆故意說錯、孩子糾正 */
export const isProtege = (a: M) => !!a.metrics?.protege
/** 計入「第一次答對率」的作答：自己答，排除探測題與 Sam 教豆豆 */
export const isScored = (a: Pick<Attempt, 'phase' | 'metrics'>) => phaseOf(a) === 'quiz' && !isProbe(a) && !isProtege(a)

// ── 又對又快才算熟練（功文式）────────────────────────────────
/** 每一類題目保留最近幾次「第一次就答對」的反應時間 */
export const SPEED_WINDOW = 12
/** 至少累積幾筆才開始用速度判斷（之前答對就升格） */
export const SPEED_MIN = 5
/** 比自己的中位數慢多少才算「明顯偏慢」：反應時間含題目語音，留一點餘裕 */
export const SLOW_FACTOR = 1.25

/**
 * 畫畫類的時間是畫多久，不是反應快慢，不採計（描數字字母的零件 part 也是：G-33 把前兩級改成描零件，技能點換了名字）。
 * 程式車庫的箭頭卡（arrow、route）和排順序（seq）也一樣：時間裡有車子開的動畫、每放一張圖的旁白，
 * 而且多步驟的題目本來就該慢慢想，不拿速度判斷熟練
 */
const NO_SPEED = new Set(['trace', 'dots', 'glyph', 'part', 'coloring', 'free', 'arrow', 'route', 'seq'])

/** 「他自己該類題目」：同一個遊戲裡同一種技能（例如 m-find 的 num） */
export function speedCat(game: string, skill: string): string | null {
  const kind = skill.split(':')[0]
  return NO_SPEED.has(kind) ? null : `${game}|${kind}`
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const isSlow = (window: readonly number[], ms: number) => window.length >= SPEED_MIN && ms > median(window) * SLOW_FACTOR
