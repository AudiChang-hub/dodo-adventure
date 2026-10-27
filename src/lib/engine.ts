import { phaseOf, type Attempt, type Skill } from './db'

/**
 * 學習引擎的純函式（第二批・工作線 A）：孩子端的 adaptive.ts 與家長區共用，
 * 都只從作答紀錄與技能資料推算，所以雲端資料在手機上看也算得出一樣的結果。
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
/** 程度校準的探測題：故意出比較難的，不計入負擔控制 */
export const isProbe = (a: M) => !!a.metrics?.probe
/** Sam 教豆豆：豆豆故意說錯、孩子糾正 */
export const isProtege = (a: M) => !!a.metrics?.protege
/** 功文式小練習 */
export const FLUENCY_GAME = 'm-quick'

/** 計入「第一次答對率」與負擔控制的作答：自己答，排除探測題與 Sam 教豆豆 */
export const isScored = (a: Pick<Attempt, 'phase' | 'metrics'>) => phaseOf(a) === 'quiz' && !isProbe(a) && !isProtege(a)

// ── 負擔控制（PRD §5.10）────────────────────────────────────
export const LOAD_LOW = 0.6
export const LOAD_DAYS = 3
/** 一天至少答幾題才算數（太少的日子變動太大，不拿來判斷） */
export const LOAD_MIN_ITEMS = 4

export interface DayRate {
  date: string
  n: number
  ok: number
}

/** 每天「自己答」第一次答對的比例，由舊到新 */
export function dailyRates(attempts: readonly Attempt[]): DayRate[] {
  const m = new Map<string, DayRate>()
  for (const a of attempts) {
    if (!isScored(a)) continue
    const r = m.get(a.date) ?? { date: a.date, n: 0, ok: 0 }
    r.n++
    if (a.firstTryCorrect) r.ok++
    m.set(a.date, r)
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export interface LoadState {
  /** 最近連續 3 個有玩的日子，第一次答對率都低於 6 成 */
  overloaded: boolean
  /** 拿來判斷的那幾天（由舊到新） */
  days: DayRate[]
}

/**
 * 只看「今天以前」的完整日子：一整天的結果才穩定，當天中途不會一下開、一下關。
 * 降難度、暫停教新內容從下一個有玩的日子開始生效。
 */
export function loadCheck(attempts: readonly Attempt[], todayDate: string): LoadState {
  const days = dailyRates(attempts.filter((a) => a.date < todayDate))
    .filter((d) => d.n >= LOAD_MIN_ITEMS)
    .slice(-LOAD_DAYS)
  const overloaded = days.length === LOAD_DAYS && days.every((d) => d.ok / d.n < LOAD_LOW)
  return { overloaded, days }
}

// ── 又對又快才算熟練（功文式）────────────────────────────────
/** 每一類題目保留最近幾次「第一次就答對」的反應時間 */
export const SPEED_WINDOW = 12
/** 至少累積幾筆才開始用速度判斷（之前答對就升格） */
export const SPEED_MIN = 5
/** 比自己的中位數慢多少才算「明顯偏慢」：反應時間含題目語音，留一點餘裕 */
export const SLOW_FACTOR = 1.25

/**
 * 畫畫類的時間是畫多久，不是反應快慢，不採計。
 * 程式車庫的箭頭卡（arrow、route）和排順序（seq）也一樣：時間裡有車子開的動畫、每放一張圖的旁白，
 * 而且多步驟的題目本來就該慢慢想，不拿速度判斷熟練
 */
const NO_SPEED = new Set(['trace', 'dots', 'glyph', 'coloring', 'free', 'arrow', 'route', 'seq'])

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

// ── 延遲提示（benchmark 手法 3）──────────────────────────────
export const HINT_DELAY_START = 4000
export const HINT_DELAY_STEP = 1000
/** 最長延到 10 秒：閒置提醒在 15 秒重唸題目，兩個不會同時發生 */
export const HINT_DELAY_MAX = 10_000
/** 發光後多久內點下去，算是「在等光」 */
export const WAIT_WINDOW_MS = 2500

/**
 * 依作答紀錄重播延遲提示的調整：最近 5 次延遲提示題，有 3 次是等光亮了才點，
 * 就把延遲拉長 1 秒。紀錄裡的 metrics.hintDelay／waited 由 ChoiceGame 寫入。
 */
export function replayHintDelay(attempts: readonly Attempt[]): { ms: number; recent: number[]; raised: { ts: number; ms: number }[] } {
  let ms = HINT_DELAY_START
  let recent: number[] = []
  const raised: { ts: number; ms: number }[] = []
  for (const a of [...attempts].filter((x) => x.metrics?.hintDelay != null).sort((x, y) => x.ts - y.ts)) {
    recent = [...recent, a.metrics!.waited ? 1 : 0].slice(-5)
    if (recent.reduce((s, x) => s + x, 0) >= 3 && ms < HINT_DELAY_MAX) {
      ms = Math.min(HINT_DELAY_MAX, ms + HINT_DELAY_STEP)
      raised.push({ ts: a.ts, ms })
      recent = []
    }
  }
  return { ms, recent, raised }
}

// ── 家長區用的統計 ──────────────────────────────────────────
/** 功文式小練習每一次玩的反應時間中位數（只看第一次就答對），由舊到新 */
export function fluencyTrend(attempts: readonly Attempt[]): { date: string; ms: number; n: number }[] {
  const by = new Map<string, { date: string; ts: number; ms: number[]; n: number }>()
  for (const a of attempts) {
    if (a.game !== FLUENCY_GAME || phaseOf(a) !== 'quiz') continue
    const k = a.sessionId + a.date
    const r = by.get(k) ?? { date: a.date, ts: a.ts, ms: [], n: 0 }
    r.n++
    r.ts = Math.min(r.ts, a.ts)
    if (a.firstTryCorrect) r.ms.push(a.responseMs)
    by.set(k, r)
  }
  return [...by.values()]
    .filter((r) => r.ms.length)
    .sort((a, b) => a.ts - b.ts)
    .map((r) => ({ date: r.date, ms: Math.round(median(r.ms)), n: r.n }))
}

/**
 * Sam 教豆豆的結果（4 週檢查點用）：
 * - 有幾次、幾次第一下就糾正成功。
 * - 風險指標：之後同一個技能的下一次自己答，第一次答對率有沒有比平常低（孩子會不會模仿錯的）。
 */
export function protegeStats(attempts: readonly Attempt[]) {
  const asc = [...attempts].sort((a, b) => a.ts - b.ts)
  const tries = asc.filter(isProtege)
  let afterN = 0
  let afterOk = 0
  for (const t of tries) {
    const next = asc.find((a) => a.ts > t.ts && a.skill === t.skill && isScored(a))
    if (!next) continue
    afterN++
    if (next.firstTryCorrect) afterOk++
  }
  const protegeSkills = new Set(tries.map((t) => t.skill))
  const base = asc.filter((a) => isScored(a) && protegeSkills.has(a.skill))
  return {
    n: tries.length,
    corrected: tries.filter((t) => t.firstTryCorrect).length,
    afterN,
    afterOk,
    baseN: base.length,
    baseOk: base.filter((a) => a.firstTryCorrect).length,
    last: tries.slice(-6).reverse(),
  }
}
