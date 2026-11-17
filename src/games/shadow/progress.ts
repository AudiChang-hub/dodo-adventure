// 影子配對的進度（T-160）：kv `shadow.progress = { level, recent[], taught[], streak, scenes[], items[] }`。
// 跟其他遊戲分開存。只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeShadow, type ShadowState } from './plan'

export const SHADOW_KEY = 'shadow.progress'

export async function loadShadow(): Promise<ShadowState> {
  return normalizeShadow(await getKV<unknown>(SHADOW_KEY, null))
}

export function saveShadow(p: ShadowState) {
  return setKV(SHADOW_KEY, p)
}
