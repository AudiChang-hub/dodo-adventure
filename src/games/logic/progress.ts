// 邏輯遊戲的進度（T-152）：kv `logic.progress = { sort: { level, recent[], taught[] }, pattern: {...} }`。
// 只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。舊版不讀這個 key。
import { getKV, setKV } from '../../lib/db'
import { LEVEL_START, type LevelState } from './sort-plan'

export const LOGIC_KEY = 'logic.progress'

export interface LogicProgress {
  sort: LevelState
  pattern: LevelState
}

/** 讀進來的東西不一定完整（壞掉、舊格式）：缺的補預設，級數夾在 1～max */
export function normalize(raw: unknown, max: { sort: number; pattern: number }): LogicProgress {
  const one = (v: unknown, top: number): LevelState => {
    const o = (v && typeof v === 'object' ? v : {}) as Partial<LevelState>
    const level = Number.isInteger(o.level) ? Math.min(top, Math.max(1, o.level as number)) : 1
    const recent = Array.isArray(o.recent) ? o.recent.filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date, ok: !!x.ok })) : []
    const taught = Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : []
    return { ...LEVEL_START, level, recent, taught }
  }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { sort: one(r.sort, max.sort), pattern: one(r.pattern, max.pattern) }
}

export async function loadLogic(max: { sort: number; pattern: number }): Promise<LogicProgress> {
  return normalize(await getKV<unknown>(LOGIC_KEY, null), max)
}

export function saveLogic(p: LogicProgress) {
  return setKV(LOGIC_KEY, p)
}
