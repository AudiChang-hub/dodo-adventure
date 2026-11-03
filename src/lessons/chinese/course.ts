// 中文課文的排課規則（現況對照 A3，家長 2026-11-03 同意）：每篇連上 3 次才換下一篇，照「上過幾次」走、不照日期。
// 只有純函式（不碰資料庫），scripts/test-zh-course.ts 直接測；存取在 ./progress.ts。
import { ZH_TEXTS } from './data'

/** 每篇上幾次才換下一篇 */
export const RUNS_PER_TEXT = 3
/** 舊版（照日期一天一篇）上過的那一次：不知道是哪一天，只知道不是今天 */
export const LEGACY = 'legacy'

/**
 * 現在上的那一篇。
 * - runs：這一篇（這一輪）上完的日期，一天最多一筆；滿 RUNS_PER_TEXT 筆，隔天才換下一篇（同一天再進來還是同一次）。
 * - picked：家長在家長區挑的日期（挑的那一篇從第 1 次開始）；prev 是挑之前在上的那一篇，挑的這篇上滿 3 次就回去接著上。
 */
export interface Course {
  day: number
  runs: string[]
  picked?: string
  prev?: Course
}

/** 今天上哪一篇、第幾次 */
export interface Run {
  day: number
  n: number
}

const fresh = (day: number): Course => ({ day, runs: [] })

/** 照課文順序的下一篇（180 篇上完從頭） */
export function nextDay(day: number): number {
  const i = ZH_TEXTS.findIndex((t) => t.day === day)
  return ZH_TEXTS[(i + 1) % ZH_TEXTS.length].day
}

/** 這一篇上滿了，換下一篇：家長挑的那篇上完，回到挑之前那篇（它還沒上滿、也不是同一篇的話），不然照順序往下 */
function advance(c: Course): Course {
  if (c.prev && c.prev.day !== c.day) return c.prev.runs.length < RUNS_PER_TEXT ? { day: c.prev.day, runs: c.prev.runs } : fresh(nextDay(c.prev.day))
  return fresh(nextDay(c.day))
}

/**
 * 今天的課：今天上完過就還是那一次；這一篇上滿了就換下一篇的第 1 次；不然是這一篇的下一次。
 * 回傳的 course 是換篇之後的樣子（還沒存，上完一堂 finishRun 才存）。
 */
export function current(c: Course, date: string): Run & { course: Course } {
  const i = c.runs.indexOf(date)
  if (i >= 0) return { day: c.day, n: i + 1, course: c }
  if (c.runs.length >= RUNS_PER_TEXT) return current(advance(c), date)
  return { day: c.day, n: c.runs.length + 1, course: c }
}

/** 上完一堂：記下今天（同一天上兩次只算一次） */
export function finishRun(c: Course, day: number, date: string): Course {
  const cur = current(c, date).course
  // 不是今天排的那一篇（家長剛好在上課中換了篇）：不動排課
  if (cur.day !== day) return c
  return cur.runs.includes(date) ? cur : { ...cur, runs: [...cur.runs, date] }
}

/** 家長挑「今天上這篇」：那一篇從第 1 次開始；挑之前在上的那篇記在 prev，上滿 3 次回去接著上 */
export function applyPick(c: Course, day: number, date: string): Course {
  // 今天已經挑過一次又改挑：回去的地方還是第一次挑之前那篇
  const base = c.picked === date && c.prev ? c.prev : current(c, date).course
  return { day, runs: [], picked: date, prev: { day: base.day, runs: base.runs } }
}

/** 家長按「改回來」：只有今天挑的才能改回 */
export function undoPick(c: Course, date: string): Course {
  return c.picked === date && c.prev ? { day: c.prev.day, runs: c.prev.runs } : c
}

/**
 * 舊版（照日期一天一篇，2026-11-02 起）的進度接過來：
 * - 從上過的最後一篇（篇數最大的）接著上，它算已經上過 1 次 → 下一次是第 2 次。不會倒退回沒上的舊篇，也不會照日期一下跳好幾篇。
 * - 那一篇是今天上的（今天照日期就是它，或家長今天挑的）→ 今天再進來還是同一次，不會今天就變第 2 次。
 * - 一篇都沒上過 → 第 1 篇的第 1 次。
 * oldPick 是舊版的「今天上這篇」（只在當天有效），沒上完的話今天照樣上它。
 */
export function migrate(done: readonly number[], oldPick: { date: string; day: number } | null, date: string): Course {
  const pick = oldPick?.date === date ? oldPick.day : null
  let base: Course
  if (!done.length) base = fresh(ZH_TEXTS[0].day)
  else {
    const last = Math.max(...done)
    const byDate = ZH_TEXTS.find((t) => t.date === date)?.day
    base = { day: last, runs: [last === byDate || last === pick ? date : LEGACY] }
  }
  if (pick == null || pick === base.day) return base
  return { day: pick, runs: done.includes(pick) ? [date] : [], picked: date, prev: base }
}
