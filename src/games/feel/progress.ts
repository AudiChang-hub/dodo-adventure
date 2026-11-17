// 心情臉（T-160）的進度：kv `feel.progress = { level, streak, taught[], sits[], heroes[] }`。
// 跟別的遊戲分開存；只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeFeel, type FeelState } from './plan'

export const FEEL_KEY = 'feel.progress'

export async function loadFeel(): Promise<FeelState> {
  return normalizeFeel(await getKV<unknown>(FEEL_KEY, null))
}

export function saveFeel(p: FeelState) {
  return setKV(FEEL_KEY, p)
}
