// 上課紀錄：每一堂課什麼時候開始、有沒有上完（kv 的 lesson.log）。
// 家長區的「下一步準備度」用它算中途離開的比例（lib/readiness.ts 的 NEXT-4、NEXT-6）。只記在這台裝置，最多留 300 堂。
import { getKV, setKV, today } from './db'
import type { LessonRun } from './readiness'

export const LESSON_LOG_KEY = 'lesson.log'
const KEEP = 300

export const lessonRuns = () => getKV<LessonRun[]>(LESSON_LOG_KEY, [])

/** 這一堂開始了：回傳開始的時間（上完時拿來對到這一筆） */
export async function startRun(subject: LessonRun['subject']): Promise<number> {
  const start = Date.now()
  const rows = await lessonRuns()
  // 同一堂剛剛才開始（開發模式 StrictMode 會把 effect 跑兩次）：沿用那一筆，不要多記一堂沒上完的
  const last = rows[rows.length - 1]
  if (last && last.subject === subject && !last.done && start - last.start < 2000) return last.start
  await setKV(LESSON_LOG_KEY, [...rows, { subject, date: today(), start }].slice(-KEEP))
  return start
}

/** 這一堂上完了 */
export async function finishRun(start: number) {
  const rows = await lessonRuns()
  const r = rows.find((x) => x.start === start)
  if (!r || r.done) return
  r.done = Date.now()
  await setKV(LESSON_LOG_KEY, rows)
}
