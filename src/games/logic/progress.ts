// 邏輯遊戲的進度（T-152）：kv `logic.progress = { sort: { level, recent[], taught[] }, pattern: {...}, scenes: { sort: [], pattern: [] } }`。
// 只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。舊版不讀這個 key。
// scenes（T-157）：最近幾局用過的情境（豆豆收拾）、串的東西（串珠珠），舊的在前；下一局不挑一樣的。舊進度沒有這一欄，當成空的。
import { getKV, setKV } from '../../lib/db'
import { LEVEL_START, type LevelState } from './sort-plan'
import type { SortMix } from './sort-switch'

export const LOGIC_KEY = 'logic.progress'
/** 記最近幾局的情境 */
export const SCENES_KEEP = 3

export interface LogicProgress {
  sort: LevelState
  pattern: LevelState
  scenes: { sort: string[]; pattern: string[] }
  /** 豆豆收拾第 6、7 級今天用過的組合（./sort-switch.ts，同一天不重複）；舊進度沒有這一欄 */
  mix?: SortMix
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
  const sc = (r.scenes && typeof r.scenes === 'object' ? r.scenes : {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-SCENES_KEEP) : [])
  const mx = (r.mix && typeof r.mix === 'object' ? r.mix : {}) as Partial<SortMix>
  const mix = typeof mx.date === 'string' && Array.isArray(mx.sigs) ? { mix: { date: mx.date, sigs: mx.sigs.filter((x): x is string => typeof x === 'string') } } : {}
  return { sort: one(r.sort, max.sort), pattern: one(r.pattern, max.pattern), scenes: { sort: list(sc.sort), pattern: list(sc.pattern) }, ...mix }
}

/** 記下這一局用的情境（只留最近 SCENES_KEEP 個） */
export function noteScene(p: LogicProgress, game: 'sort' | 'pattern', scene: string) {
  p.scenes = { ...p.scenes, [game]: [...p.scenes[game], scene].slice(-SCENES_KEEP) }
}

export async function loadLogic(max: { sort: number; pattern: number }): Promise<LogicProgress> {
  return normalize(await getKV<unknown>(LOGIC_KEY, null), max)
}

export function saveLogic(p: LogicProgress) {
  return setKV(LOGIC_KEY, p)
}
