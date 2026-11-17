// 蹺蹺板比輕重的進度：kv `seesaw.progress = { level, streak, taught[], date, used[], recent[] }`。
// 跟邏輯遊戲的 logic.progress 分開存（那邊的 normalize 只認得 sort、pattern）。
// 只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV, today } from '../../lib/db'
import { normalizeSeesaw, type SeesawState } from './plan'

export const SEESAW_KEY = 'seesaw.progress'

export async function loadSeesaw(): Promise<SeesawState> {
  return normalizeSeesaw(await getKV<unknown>(SEESAW_KEY, null), today())
}

export function saveSeesaw(p: SeesawState) {
  return setKV(SEESAW_KEY, p)
}
