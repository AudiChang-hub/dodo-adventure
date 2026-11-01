// 今天上哪一篇、上過哪幾篇（存在這台平板的 kv；家長重置學習進度時跟著清掉）。
import { getKV, setKV, today } from '../../lib/db'
import { ZH_TEXTS, type ZhText } from './data'

/** 上完的篇（day 的陣列） */
const DONE_KEY = 'zhLesson:done'
/** 家長在家長區挑的「今天上這篇」：{ date: 挑的那一天, day } ，只有當天有效 */
const PICK_KEY = 'zhLesson:pick'

/**
 * 照日期的那一篇：date 等於今天。還沒開始（2026-11-02 以前）上第 1 篇；180 篇都過了就從頭輪。
 */
export function scheduled(date = today()): ZhText {
  const exact = ZH_TEXTS.find((t) => t.date === date)
  if (exact) return exact
  const first = ZH_TEXTS[0]
  if (date < first.date) return first
  const days = Math.round((Date.parse(date) - Date.parse(first.date)) / 86_400_000)
  return ZH_TEXTS[((days % ZH_TEXTS.length) + ZH_TEXTS.length) % ZH_TEXTS.length]
}

/** 孩子端今天上的那一篇：家長今天挑了就上挑的，不然照日期。同一天再進來還是同一篇 */
export async function todays(): Promise<ZhText> {
  const pick = await getKV<{ date: string; day: number } | null>(PICK_KEY, null)
  const t = pick?.date === today() ? ZH_TEXTS.find((x) => x.day === pick.day) : undefined
  return t ?? scheduled()
}

export const pickToday = (day: number | null) => setKV(PICK_KEY, day == null ? null : { date: today(), day })
export const pickedToday = async () => {
  const p = await getKV<{ date: string; day: number } | null>(PICK_KEY, null)
  return p?.date === today() ? p.day : null
}

export const doneDays = async () => new Set(await getKV<number[]>(DONE_KEY, []))

export async function markDone(day: number) {
  const s = await doneDays()
  if (s.has(day)) return
  s.add(day)
  await setKV(DONE_KEY, [...s].sort((a, b) => a - b))
}
