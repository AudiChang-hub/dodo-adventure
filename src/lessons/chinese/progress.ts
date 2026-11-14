// 今天上哪一篇、第幾次、上過哪幾篇（存在這台平板的 kv；家長重置學習進度時跟著清掉）。
// 排課規則（一天兩篇：一舊一新、照上過幾次走，T-136）在 ./course.ts。
import { db, getKV, setKV, today, type Attempt } from '../../lib/db'
import { ZH_TEXTS, type ZhText } from './data'
import { applyPick, current, finishRun, logSession, migrate, planOf, reviewDone, seedLog, undoPick, type Course, type OldMark, type Plan, type Session } from './course'
import { GLYPH_START, afterGlyph, type GlyphState } from './match'
import { PAUSE_KEY, STAGE4_KEY, advance, gates, glyphMax, planToday, type Gate, type Stage4Kv, type Stage4Plan } from './stage4'

/** 上過至少一次的篇（day 的陣列）：紅字算教過了（data.ts 的 questionsOf），家長區的「上過幾篇」 */
const DONE_KEY = 'zhLesson:done'
/** 每篇上過幾次（{ [day]: 次數 }，一天最多算一次）：家長區看 */
const TIMES_KEY = 'zhLesson:times'
/** 現在上的那一篇（course.ts 的 Course）；沒有的話從舊版（照日期）的進度接過來 */
const COURSE_KEY = 'zhLesson:course'
/**
 * 家長在家長區挑的「今天上這篇」：{ date: 挑的那一天, day }。只有當天挑的會套用（applyPick：那篇當今天的新篇，
 * 上完回到原本排到的那篇）；套用過的記在 Course.picked，不會重複套用。三歲測試也直接寫這個 key 指定一篇。
 */
const PICK_KEY = 'zhLesson:pick'
/**
 * 上課紀錄（T-136，course.ts 的 Session[]）：每上完一次課記一筆（新篇那一篇）。舊篇、結尾小複習照這個算。
 * 新加的 key，舊版不讀；沒有的話從 zhLesson:done 推算（seedLog）。
 */
const LOG_KEY = 'zhLesson:log'
/** 這一次課的舊篇（複習）上完或跳過了：{ date, day, skipped, for: 那時的新篇 }（course.ts 的 OldMark；下次進來直接上新篇，T-142） */
const OLD_KEY = 'zhLesson:old'

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

/** 上課紀錄（第一次讀時從上過的篇推算、存起來） */
async function sessions(c: Course, date: string): Promise<Session[]> {
  const saved = await getKV<Session[] | null>(LOG_KEY, null)
  if (saved) return saved
  const log = seedLog(await getKV<number[]>(DONE_KEY, []), c, date)
  await setKV(LOG_KEY, log)
  return log
}

/** 今天的排課：新篇、舊篇、結尾小複習（course.ts 的 planOf） */
async function plan(date = today()): Promise<Plan & { course: Course }> {
  const c = await course(date)
  return planOf(c, await sessions(c, date), date)
}

/** 孩子端今天上的新篇、第幾次。同一天再進來還是同一篇、同一次（英文故事 screens/story/en-book.ts 也跟這一篇） */
export async function lessonToday(): Promise<{ t: ZhText; n: number }> {
  const r = await plan()
  return { t: textOf(r.day), n: r.n }
}

/** 中文課這一堂：新篇、舊篇（今天上完或跳過了的話 oldDone）、結尾小複習的篇 */
export async function lessonPlan(): Promise<{ t: ZhText; n: number; idx: number; old: ZhText | null; oldDone: boolean; review: ZhText[] }> {
  const date = today()
  const [r, o] = await Promise.all([plan(date), getKV<OldMark | null>(OLD_KEY, null)])
  const old = r.old == null ? null : textOf(r.old)
  return { t: textOf(r.day), n: r.n, idx: r.idx, old, oldDone: reviewDone(o, r, date), review: r.review.map(textOf) }
}

/** 舊篇上完（或大人跳過）：這一次課的複習做過了，再進來（同一天或隔天）直接上新篇（T-142）；上完的算這一篇多上一次（家長區） */
export async function markOld(day: number, skipped: boolean) {
  const date = today()
  const [o, r] = await Promise.all([getKV<OldMark | null>(OLD_KEY, null), plan(date)])
  if (o?.day === day && reviewDone(o, r, date)) return
  await setKV(OLD_KEY, { date, day, skipped, for: r.day } satisfies OldMark)
  if (skipped) return
  const times = Object.fromEntries(await timesByDay())
  times[day] = (times[day] ?? 0) + 1
  await setKV(TIMES_KEY, times)
}

/** 今天上的那一篇（下課後的「現在去做」用） */
export const todays = async () => (await lessonToday()).t

/**
 * 家長區：今天的新篇、舊篇、結尾小複習，新篇是不是家長今天挑的；
 * 今天上的是複習還是新篇（T-142）：oldDone 這一次課的複習做過了（oldToday：今天做的）、newToday 新篇今天上完了
 */
export async function todayRun(): Promise<Plan & { picked: boolean; oldDone: boolean; oldToday: boolean; newToday: boolean }> {
  const date = today()
  const [r, o] = await Promise.all([plan(date), getKV<OldMark | null>(OLD_KEY, null)])
  const oldDone = reviewDone(o, r, date)
  const log = await sessions(r.course, date)
  return { ...r, picked: r.course.picked === date, oldDone, oldToday: oldDone && o?.date === date, newToday: log.some((s) => s.date === date && s.day === r.day) }
}

/** 家長挑「今天上這篇」；null 是改回原本那篇（只有今天挑的才改得回去） */
export async function pickToday(day: number | null) {
  const date = today()
  const c = await course(date)
  await setKV(PICK_KEY, day == null ? null : { date, day })
  await setKV(COURSE_KEY, day == null ? undoPick(c, date) : applyPick(c, day, date))
}

export const doneDays = async () => new Set(await getKV<number[]>(DONE_KEY, []))

/** 找一樣的字（T-117）：第幾級、這一級最近答得怎樣、示範過幾堂（./match.ts 的 GlyphState） */
const GLYPH_KEY = 'zhLesson:glyph'
export const glyphState = () => getKV<GlyphState>(GLYPH_KEY, GLYPH_START)

/** 答完一題找一樣的字：升降級（4 選 1 的門開了、沒暫停才升得到第 4 級）、記下示範過了。level 是這一題第幾級出的 */
export async function saveGlyph(r: { first: boolean; demo: boolean; led: boolean; level?: number }) {
  const [kv, paused, g] = await Promise.all([stage4Kv(), stage4Paused(), glyphState()])
  await setKV(GLYPH_KEY, afterGlyph(g, { ...r, date: today() }, glyphMax(kv, paused)))
  // 第一題 4 選 1 手示範過了：之後不再示範（./stage4.ts 的 demo4）
  const G = kv['zh-glyph4']
  if (r.demo && r.level === 4 && G && !G.demoed) await setKV(STAGE4_KEY, { ...kv, 'zh-glyph4': { ...G, demoed: true } } satisfies Stage4Kv)
}

// ── 4 歲的內容（T-150，./stage4.ts）────────────────────────────

const stage4Kv = () => getKV<Stage4Kv>(STAGE4_KEY, {})
/** 家長區的「暫停中文 4 歲內容」（T-150 P 做開關；kv 是 true 就暫停） */
export const stage4Paused = async () => (await getKV<boolean | null>(PAUSE_KEY, null)) === true

/** 中文課的作答紀錄（選圖 zhtext:、找字 zhglyph:）：門的判斷只看這些 */
async function zhAttempts(): Promise<Attempt[]> {
  try {
    return await db.attempts.where('skill').startsWithAnyOf(['zhtext:', 'zhglyph:']).toArray()
  } catch {
    return []
  }
}

/**
 * 進中文課時算一次：該開的門開（同一天最多一道）、加長版該退就退；4 選 1 的門今天剛開、找字在第 3 級，直接升到第 4 級（門的條件就是第 3 級熟練）。
 * 回傳這一堂的 4 歲內容（idx：第幾次課）。
 */
export async function stage4Today(idx: number): Promise<Stage4Plan> {
  const date = today()
  const [kv, paused, attempts, g] = await Promise.all([stage4Kv(), stage4Paused(), zhAttempts(), glyphState()])
  const next = advance(kv, attempts, date, paused)
  if (next !== kv) await setKV(STAGE4_KEY, next)
  let level = g.level
  if (!kv['zh-glyph4'] && next['zh-glyph4'] && g.level === 3) {
    level = 4
    await setKV(GLYPH_KEY, { ...g, level: 4, recent: [] } satisfies GlyphState)
  }
  return planToday(next, date, idx, level, paused)
}

/** 家長區（T-150 P）：中文每道門現在怎樣、暫停了沒 */
export async function stage4Gates(): Promise<{ gates: Gate[]; paused: boolean }> {
  const [kv, paused, attempts] = await Promise.all([stage4Kv(), stage4Paused(), zhAttempts()])
  return { gates: gates(attempts, kv, today()), paused }
}

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
  if (before.day === day) await setKV(LOG_KEY, logSession(await sessions(c, date), day, date))
  const done = await doneDays()
  const times = Object.fromEntries(await timesByDay())
  if (counted || !done.has(day)) times[day] = (times[day] ?? 0) + 1
  await setKV(TIMES_KEY, times)
  if (!done.has(day)) {
    done.add(day)
    await setKV(DONE_KEY, [...done].sort((a, b) => a - b))
  }
}
