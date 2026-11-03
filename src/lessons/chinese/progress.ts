// 今天上哪一篇、第幾次、上過哪幾篇（存在這台平板的 kv；家長重置學習進度時跟著清掉）。
// 排課規則（每篇連上 3 次、照上過幾次走）在 ./course.ts。
import { getKV, setKV, today } from '../../lib/db'
import { ZH_TEXTS, type ZhText } from './data'
import { applyPick, current, finishRun, migrate, undoPick, type Course, type Run } from './course'

/** 上過至少一次的篇（day 的陣列）：紅字算教過了（data.ts 的 questionsOf），家長區的「上過幾篇」 */
const DONE_KEY = 'zhLesson:done'
/** 每篇上過幾次（{ [day]: 次數 }，一天最多算一次）：家長區看 */
const TIMES_KEY = 'zhLesson:times'
/** 現在上的那一篇（course.ts 的 Course）；沒有的話從舊版（照日期）的進度接過來 */
const COURSE_KEY = 'zhLesson:course'
/**
 * 家長在家長區挑的「今天上這篇」：{ date: 挑的那一天, day }。只有當天挑的會套用（applyPick：那篇從第 1 次開始，
 * 上滿 3 次回到原本那篇）；套用過的記在 Course.picked，不會重複套用。三歲測試也直接寫這個 key 指定一篇。
 */
const PICK_KEY = 'zhLesson:pick'

type Pick = { date: string; day: number } | null

/** 讀出排課（第一次讀時從舊版接過來），套用家長今天挑的那篇 */
async function course(date = today()): Promise<Course> {
  const [saved, pick] = await Promise.all([getKV<Course | null>(COURSE_KEY, null), getKV<Pick>(PICK_KEY, null)])
  let c = saved ?? migrate(await getKV<number[]>(DONE_KEY, []), pick, date)
  const applied = c.picked === pick?.date && c.day === pick?.day
  if (saved && pick?.date === date && !applied && ZH_TEXTS.some((t) => t.day === pick.day)) c = applyPick(c, pick.day, date)
  if (c !== saved) await setKV(COURSE_KEY, c)
  return c
}

const textOf = (day: number) => ZH_TEXTS.find((t) => t.day === day) ?? ZH_TEXTS[0]

/** 孩子端今天上的那一篇、第幾次。同一天再進來還是同一篇、同一次 */
export async function lessonToday(): Promise<{ t: ZhText; n: number }> {
  const r = current(await course(), today())
  return { t: textOf(r.day), n: r.n }
}

/** 今天上的那一篇（下課後的「現在去做」用） */
export const todays = async () => (await lessonToday()).t

/** 家長區：今天上哪一篇、第幾次、是不是家長今天挑的 */
export async function todayRun(): Promise<Run & { picked: boolean }> {
  const date = today()
  const c = await course(date)
  return { ...current(c, date), picked: c.picked === date }
}

/** 家長挑「今天上這篇」；null 是改回原本那篇（只有今天挑的才改得回去） */
export async function pickToday(day: number | null) {
  const date = today()
  const c = await course(date)
  await setKV(PICK_KEY, day == null ? null : { date, day })
  await setKV(COURSE_KEY, day == null ? undoPick(c, date) : applyPick(c, day, date))
}

export const doneDays = async () => new Set(await getKV<number[]>(DONE_KEY, []))

/** 每篇上過幾次（舊版照日期上過的算 1 次） */
export async function timesByDay(): Promise<Map<number, number>> {
  const [times, done] = await Promise.all([getKV<Record<string, number> | null>(TIMES_KEY, null), getKV<number[]>(DONE_KEY, [])])
  const m = new Map<number, number>(done.map((d) => [d, 1]))
  for (const [d, n] of Object.entries(times ?? {})) m.set(Number(d), n)
  return m
}

/** 上完一堂：這一篇算上了一次（同一天再上一次不多算） */
export async function markDone(day: number) {
  const date = today()
  const c = await course(date)
  const before = current(c, date)
  // 今天排的就是這一篇、今天還沒上完過 → 多一次
  const counted = before.day === day && !before.course.runs.includes(date)
  await setKV(COURSE_KEY, finishRun(c, day, date))
  const done = await doneDays()
  const times = Object.fromEntries(await timesByDay())
  if (counted || !done.has(day)) times[day] = (times[day] ?? 0) + 1
  await setKV(TIMES_KEY, times)
  if (!done.has(day)) {
    done.add(day)
    await setKV(DONE_KEY, [...done].sort((a, b) => a - b))
  }
}
