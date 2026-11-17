// 鼓聲停的進度（T-160）：kv `drum.progress = { level, recent[], plays, 最近的角色、舞台、鼓 }`。
// 跟邏輯遊戲的 logic.progress 分開存。只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeDrum, type DrumState } from './plan'

export const DRUM_KEY = 'drum.progress'

export async function loadDrum(): Promise<DrumState> {
  return normalizeDrum(await getKV<unknown>(DRUM_KEY, null))
}

export function saveDrum(p: DrumState) {
  return setKV(DRUM_KEY, p)
}
