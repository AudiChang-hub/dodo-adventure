// 中文課文的排課規則（現況對照 A3）。家長 2026-11-11 定案（T-136）：一天兩篇，一舊一新，取代「每篇連上 3 次」（2026-11-03）。
// - 換篇：每上一次就換新的一篇（RUNS_PER_TEXT = 1），照「上過幾次」走、不照日期；同一天再進來還是同一次。
// - 每次先上舊篇、再上新篇。舊篇是 3 次前上的那篇（第 4 次複習第 1 次的、第 5 次複習第 2 次的…），前 3 次沒有舊篇。
//   舊篇跟原本的課一樣完整（家長 2026-11-11：「舊跟原始課文一樣就好」）。舊篇大人可以跳過，新篇照常上。
// - 英文故事（screens/story/en-book.ts）用同一份推算（planOf）：先講舊篇的英文版、再講新篇的，結尾小題也一樣。
// - 結尾小複習：前 1 次、前 7 次上的那兩篇各一題（現有的「哪個是…？」，出不了就找一樣的字）；那一次還沒有就略過。
// - 家長挑「今天上這篇」：挑的那篇就是今天的新篇；舊篇、小複習照實際上過的紀錄（Session[]）走。
// - 已存的進度不轉換：這一篇上到第幾次都沒關係，下一次就換新篇。上課紀錄（Session[]）是新加的、存在另一個 key，
//   舊版不讀它；沒有紀錄時從「上過哪幾篇」推算（seedLog）。
// 只有純函式（不碰資料庫），scripts/test-zh-course.ts 直接測；存取在 ./progress.ts。
import { ZH_TEXTS } from './data'

/** 每篇上幾次才換下一篇（2026-11-11 起 1：每次都是新的一篇） */
export const RUNS_PER_TEXT = 1
/** 舊篇：幾次前上的那篇 */
export const OLD_BACK = 3
/** 結尾小複習：前幾次上的那兩篇 */
export const REVIEW_BACK = [1, 7] as const
/** 舊版（照日期一天一篇）上過的那一次：不知道是哪一天，只知道不是今天 */
export const LEGACY = 'legacy'

/**
 * 現在上的那一篇。
 * - runs：這一篇（這一輪）上完的日期，一天最多一筆；滿 RUNS_PER_TEXT 筆，隔天才換下一篇（同一天再進來還是同一次）。
 * - picked：家長在家長區挑的日期（挑的那一篇當今天的新篇）；prev 是挑之前排到的那一篇，挑的這篇上完就回去上它。
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

/** 家長挑「今天上這篇」：那一篇當今天的新篇；挑之前排到的那篇記在 prev，挑的這篇上完回去上它 */
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
 * - 從上過的最後一篇（篇數最大的）接著上，它算已經上過 1 次 → 下一次換下一篇。不會倒退回沒上的舊篇，也不會照日期一下跳好幾篇。
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

/** 上完的一次課（新篇那一篇；一天最多一筆）。date 是 LEGACY：從舊版紀錄推算的，不知道是哪一天 */
export interface Session {
  date: string
  day: number
}

/** 今天的課：新篇（day、n）、這是第幾次課（idx，從 0 算）、舊篇（沒有是 null）、結尾小複習的篇（0～2 篇） */
export interface Plan extends Run {
  idx: number
  old: number | null
  review: number[]
}

/**
 * 今天上什麼。今天上完過（紀錄裡有今天）就還是那一次課：舊篇、小複習跟上完那時一樣。
 * 舊篇＝OLD_BACK 次前那次課的新篇；小複習＝REVIEW_BACK 次前那幾次課的新篇。跟今天的新篇同一篇的不出，舊篇和小複習也不重複。
 */
export function planOf(c: Course, log: readonly Session[], date: string): Plan & { course: Course } {
  const r = current(c, date)
  const at = log.findIndex((s) => s.date === date)
  const idx = at >= 0 ? at : log.length
  const back = (k: number) => (idx - k >= 0 ? log[idx - k].day : null)
  const o = back(OLD_BACK)
  const old = o != null && o !== r.day ? o : null
  const review: number[] = []
  for (const k of REVIEW_BACK) {
    const d = back(k)
    if (d != null && d !== r.day && d !== old && !review.includes(d)) review.push(d)
  }
  return { ...r, idx, old, review }
}

/** 上完一次課（新篇）：記一筆；同一天已經有一筆（家長上完又挑了別篇再上）就換成這一篇 */
export function logSession(log: readonly Session[], day: number, date: string): Session[] {
  const at = log.findIndex((s) => s.date === date)
  if (at < 0) return [...log, { date, day }]
  return log[at].day === day ? [...log] : log.map((s, i) => (i === at ? { date, day } : s))
}

/**
 * 還沒有上課紀錄（2026-11-11 以前的進度）：上過的篇照篇數排、一篇算一次課（不知道是哪一天）；
 * 排課裡這一篇今天上完過的話，它記成今天、排在最後（今天再進來還是同一次）。
 */
export function seedLog(done: readonly number[], c: Course | null, date: string): Session[] {
  const todays = c && c.runs.includes(date) ? c.day : null
  const days = [...new Set(done)].filter((d) => d !== todays).sort((a, b) => a - b)
  return [...days.map((day) => ({ date: LEGACY, day })), ...(todays != null ? [{ date, day: todays }] : [])]
}
