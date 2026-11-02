// 英文課的進度（家長定的規則，跟學校一樣）：
// - 一天一個新字母。孩子認得 A、B 但還不熟，所以從 A 開始；有設孩子的英文名字（.env.local）的新帳號，名字裡的字母先上（A12）。
// - 同一天再進來：複習今天的字母（不往下走）。
// - 上完、而且字母題沒有錯很多：隔天換下一個字母；錯很多、或沒上完就離開：隔天重上同一個字母。
//   「哪個字是 A 開頭」（聽開頭的音）是練習，不算進錯很多（A6：音素要到 4～5 歲才穩）；描字也不算（A5）。
// - 一輪上完之後從頭再來一輪（複習）。
// 存在 IndexedDB 的 kv（key: lesson.english），跟其他進度一樣會備份；作答紀錄另外照常寫（lib/record.ts）。
import { getKV, setKV, today } from '../../lib/db'
import { env } from '../../lib/env'
import { ORDER, orderFor } from './data'

export const KV_KEY = 'lesson.english'

export interface EnglishProgress {
  /** 現在這個字母在 seq 的位置 */
  idx: number
  /** 這一輪的字母順序。舊的進度沒有這一欄：照 A→Z（平板上已經上到一半的不會換順序） */
  seq?: string
  /** 上一次上這一課是哪一天 */
  date: string
  /** 那一天有沒有上完（叫過 onDone） */
  done: boolean
  /** 那一天上完時，字母題第一次就答對的比例夠不夠（不夠：隔天重上） */
  good: boolean
}

/** 新帳號的字母順序：孩子的英文名字（只在 .env.local，不進 repo）裡的字母先，沒設就 A→Z */
export const nameOrder = () => orderFor(env('VITE_CHILD_NAME_EN'))

/** 錯很多：第一次就答對的不到一半 */
export const goodEnough = (right: number, total: number) => total === 0 || right / total >= 0.5

/** 一題的結果（Quiz 回傳） */
export interface QuizResult {
  kind: 'big' | 'little' | 'word'
  first: boolean
}

/** 決定隔天重不重上：只算字母題（大寫、小寫、複習的字母），開頭音的題目不算（A6） */
export function lessonGood(rs: QuizResult[]) {
  const letters = rs.filter((r) => r.kind !== 'word')
  return goodEnough(letters.filter((r) => r.first).length, letters.length)
}

export interface TodayPlan {
  idx: number
  /** 這一輪的字母順序 */
  seq: string
  /** 今天已經上完一次，這次是複習 */
  review: boolean
  /** 昨天（或之前）錯很多、沒上完，今天重上同一個字母 */
  repeat: boolean
}

/** 進課的時候決定今天上哪一個字母（不寫入；上完或離開時才寫）。fresh：新帳號的順序（測試用，預設照名字） */
export function planFor(p: EnglishProgress | null, d = today(), fresh = nameOrder()): TodayPlan {
  if (!p) return { idx: 0, seq: fresh, review: false, repeat: false }
  const seq = p.seq ?? ORDER
  if (p.date === d) return { idx: p.idx, seq, review: p.done, repeat: false }
  if (p.done && p.good) return { idx: (p.idx + 1) % seq.length, seq, review: false, repeat: false }
  return { idx: p.idx, seq, review: false, repeat: true }
}

export const loadProgress = () => getKV<EnglishProgress | null>(KV_KEY, null)

/**
 * 進課就記下「今天上這個字母」（還沒上完）：中途離開，隔天重上同一個字母。
 * 今天已經上完的（複習）不改，免得複習沒上完把「上完了」蓋掉。
 */
export async function markStarted(plan: TodayPlan, d = today()) {
  if (plan.review) return
  await setKV(KV_KEY, { idx: plan.idx, seq: plan.seq, date: d, done: false, good: false } satisfies EnglishProgress)
}

/** 上完：記下錯得多不多（複習那一次只會把「好」改得更好，不會因為複習錯了就讓今天的字母不算） */
export async function markDone(plan: TodayPlan, good: boolean, d = today()) {
  const old = await loadProgress()
  const keep = plan.review && old?.date === d && old.done && old.good
  await setKV(KV_KEY, { idx: plan.idx, seq: plan.seq, date: d, done: true, good: keep || good } satisfies EnglishProgress)
}
