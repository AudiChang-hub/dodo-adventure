// 每堂課輪流的那一段（T-127 B 案）：記住每一課最近用過哪幾種玩法，挑今天的玩法時不跟最近的一樣。
// - 存在 kv `variety`：{ [課]: { day, kind, recent } }。被刪掉（重置、換裝置）只會讓輪替從頭開始，不影響任何進度。
// - 同一天再進來（接著上、複習）用同一種玩法：一堂課中途換玩法會讓孩子摸不著頭緒。
// - 挑法：最近用過的 (種數 − 1) 種都不挑，剩下的隨便挑一個——3 種玩法就是每 3 堂各玩一次、連續兩天一定不一樣。
import { getKV, setKV, today } from './db'

export const VARIETY_KV = 'variety'

export interface VarietyEntry {
  /** 這一次挑的那一天（YYYY-MM-DD） */
  day: string
  kind: string
  /** 最近用過的玩法，最新的在前面（最多記 8 個） */
  recent: string[]
}
export type VarietyState = Record<string, VarietyEntry>

const KEEP = 8

/**
 * 純函式：從 kinds 裡挑下一種。最近的 (kinds.length − 1) 種不挑；不在 kinds 裡的舊紀錄（玩法拿掉了）不算。
 * rnd 是 0～1 的亂數（測試可以固定）。
 */
export function nextKind<K extends string>(kinds: readonly K[], recent: readonly string[], rnd: () => number = Math.random): K {
  if (!kinds.length) throw new Error('nextKind: 沒有玩法可以挑')
  const seen = recent.filter((k): k is K => (kinds as readonly string[]).includes(k))
  const block = new Set(seen.slice(0, kinds.length - 1))
  const pool = kinds.filter((k) => !block.has(k))
  const from = pool.length ? pool : kinds
  return from[Math.min(from.length - 1, Math.floor(rnd() * from.length))]
}

/** 純函式：今天這一課用哪種玩法，以及要存回去的紀錄（同一天已經挑過就沿用） */
export function chooseVariety<K extends string>(
  state: VarietyState,
  lesson: string,
  kinds: readonly K[],
  day: string,
  rnd: () => number = Math.random,
): { kind: K; state: VarietyState; changed: boolean } {
  const e = state[lesson]
  if (e && e.day === day && (kinds as readonly string[]).includes(e.kind)) return { kind: e.kind as K, state, changed: false }
  // 同一天、但那一種被拿掉了：當作還沒挑，但不把它記成「最近用過」兩次
  const recent = e ? (e.day === day ? e.recent.slice(1) : e.recent) : []
  const kind = nextKind(kinds, recent, rnd)
  return { kind, state: { ...state, [lesson]: { day, kind, recent: [kind, ...recent].slice(0, KEEP) } }, changed: true }
}

/** 讀不到、格式不對（舊版、被改壞）都當作沒有紀錄 */
function clean(v: unknown): VarietyState {
  if (!v || typeof v !== 'object') return {}
  const out: VarietyState = {}
  for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
    const x = e as Partial<VarietyEntry> | null
    if (x && typeof x.day === 'string' && typeof x.kind === 'string') out[k] = { day: x.day, kind: x.kind, recent: Array.isArray(x.recent) ? x.recent.filter((r): r is string => typeof r === 'string') : [x.kind] }
  }
  return out
}

/**
 * 今天這一課用哪種玩法（會存起來）。lesson 是課的名字（例如 'math.give'），kinds 是可以輪流的玩法。
 * 資料庫壞掉、讀不到的時候照樣回傳一種（隨便挑），不擋住上課。
 */
export async function pickVariety<K extends string>(lesson: string, kinds: readonly K[], date: Date = new Date()): Promise<K> {
  let state: VarietyState = {}
  try {
    state = clean(await getKV<unknown>(VARIETY_KV, {}))
  } catch {
    /* 讀不到：當作沒有紀錄 */
  }
  const r = chooseVariety(state, lesson, kinds, today(date))
  if (r.changed) {
    try {
      await setKV(VARIETY_KV, r.state)
    } catch {
      /* 存不了：今天照用，明天可能重複一次 */
    }
  }
  return r.kind
}
