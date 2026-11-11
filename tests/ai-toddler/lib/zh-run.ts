// AI 小男生盲測的 --zh-run N（T-139）：中文課和英文故事今天是第 N 次課。前面 N-1 次課已經上過（第 1～N-1 篇各一次，很久以前），
// 寫進 App 的 kv，App 照自己的排課（src/lessons/chinese/course.ts 的 planOf）排出今天的新篇、舊篇、結尾小題：
// 第 N 篇是新篇；第 4 次起有舊篇（3 次前的第 N-3 篇，一天兩篇、一舊一新）；結尾小題是前 1 次、前 7 次的。
// 以前最多只能放 2 次舊紀錄（--zh-run 1～3，「同一篇上 3 次」那時候的寫法），走不到「先上舊篇」。
// 只產生資料、不碰瀏覽器（scripts/test-zh-course.ts 直接拿它跑 App 的排課，確認第幾次會排出什麼）；zhRunToday 寫在報告上。

import { migrate, planOf, seedLog, type Course, type Session } from '../../../src/lessons/chinese/course'
import { ZH_TEXTS } from '../../../src/lessons/chinese/data'

/** 最多第幾次（180 篇） */
export const ZH_RUN_MAX = 180

/** 第 i 次課（從 0 算）的日期：2026-01-01 起一天一次，都在今天以前 */
const dateOf = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)

/** 今天是第 n 次課要寫進 kv 的東西（key → value）；第 1 次什麼都不用寫 */
export function zhRunKV(n: number): Record<string, unknown> {
  if (!Number.isInteger(n) || n < 1 || n > ZH_RUN_MAX) throw new Error(`--zh-run 要是 1～${ZH_RUN_MAX} 的整數（拿到 ${n}）`)
  if (n === 1) return {}
  const days = Array.from({ length: n - 1 }, (_, i) => i + 1)
  return {
    // 上過的篇（紅字算教過了，選圖的陪襯照這個挑）
    'zhLesson:done': days,
    // 排課：最後上的是第 n-1 篇（上完了，今天換下一篇）
    'zhLesson:course': { day: n - 1, runs: [dateOf(n - 2)] },
    // 上課紀錄：舊篇、結尾小題照這個算
    'zhLesson:log': days.map((day, i) => ({ date: dateOf(i), day })),
  }
}

/**
 * 報告上寫今天排到什麼（T-140，盲測 73d57c7：中文 2 用 --zh-run 5，孩子在〈三隻小豬〉就走了，測試員以為「第一篇」不是舊篇、工具沒走到一天兩篇；
 * 其實〈三隻小豬〉就是舊篇）。照 App 自己的排課（course.ts 的 planOf）算，跟 App 畫面上的一樣。
 */
export function zhRunToday(n: number, today: string): string {
  const kv = zhRunKV(n)
  const c = (kv['zhLesson:course'] as Course | undefined) ?? migrate([], null, today)
  const log = (kv['zhLesson:log'] as Session[] | undefined) ?? seedLog([], c, today)
  const p = planOf(c, log, today)
  const name = (d: number) => `第 ${d} 篇〈${ZH_TEXTS.find((t) => t.day === d)?.title ?? '?'}〉`
  const parts = [p.old != null ? `先上舊篇 ${name(p.old)}，再上新篇 ${name(p.day)}` : `只有新篇 ${name(p.day)}（前 3 次沒有舊篇）`]
  if (p.review.length) parts.push(`結尾小題 ${p.review.map(name).join('、')}`)
  return `第 ${n} 次課：${parts.join('；')}`
}
