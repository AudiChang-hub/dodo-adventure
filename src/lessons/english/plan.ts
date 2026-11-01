// 英文課的進度（家長定的規則，跟學校一樣）：
// - 一天一個新字母，A→Z。孩子認得 A、B 但還不熟，所以從 A 開始。
// - 同一天再進來：複習今天的字母（不往下走）。
// - 上完、而且選擇題沒有錯很多：隔天換下一個字母；錯很多、或沒上完就離開：隔天重上同一個字母。
// - Z 上完之後從 A 再來一輪（複習）。
// 存在 IndexedDB 的 kv（key: lesson.english），跟其他進度一樣會備份；作答紀錄另外照常寫（lib/record.ts）。
import { getKV, setKV, today } from '../../lib/db'
import { ORDER } from './data'

export const KV_KEY = 'lesson.english'

export interface EnglishProgress {
  /** 現在這個字母在 ORDER 的位置 */
  idx: number
  /** 上一次上這一課是哪一天 */
  date: string
  /** 那一天有沒有上完（叫過 onDone） */
  done: boolean
  /** 那一天上完時，選擇題第一次就答對的比例夠不夠（不夠：隔天重上） */
  good: boolean
}

/** 錯很多：選擇題第一次就答對的不到一半 */
export const goodEnough = (right: number, total: number) => total === 0 || right / total >= 0.5

export interface TodayPlan {
  idx: number
  /** 今天已經上完一次，這次是複習 */
  review: boolean
  /** 昨天（或之前）錯很多、沒上完，今天重上同一個字母 */
  repeat: boolean
}

/** 進課的時候決定今天上哪一個字母（不寫入；上完或離開時才寫） */
export function planFor(p: EnglishProgress | null, d = today()): TodayPlan {
  if (!p) return { idx: 0, review: false, repeat: false }
  if (p.date === d) return { idx: p.idx, review: p.done, repeat: false }
  if (p.done && p.good) return { idx: (p.idx + 1) % ORDER.length, review: false, repeat: false }
  return { idx: p.idx, review: false, repeat: true }
}

export const loadProgress = () => getKV<EnglishProgress | null>(KV_KEY, null)

/**
 * 進課就記下「今天上這個字母」（還沒上完）：中途離開，隔天重上同一個字母。
 * 今天已經上完的（複習）不改，免得複習沒上完把「上完了」蓋掉。
 */
export async function markStarted(plan: TodayPlan, d = today()) {
  if (plan.review) return
  await setKV(KV_KEY, { idx: plan.idx, date: d, done: false, good: false } satisfies EnglishProgress)
}

/** 上完：記下錯得多不多（複習那一次只會把「好」改得更好，不會因為複習錯了就讓今天的字母不算） */
export async function markDone(plan: TodayPlan, good: boolean, d = today()) {
  const old = await loadProgress()
  const keep = plan.review && old?.date === d && old.done && old.good
  await setKV(KV_KEY, { idx: plan.idx, date: d, done: true, good: keep || good } satisfies EnglishProgress)
}
