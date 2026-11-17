// 小熊野餐的進度（T-160）：kv `picnic.progress = { level, recent[], taught[], 最近的客人、食物、場景 }`。
// 跟邏輯遊戲的 logic.progress 分開存（那邊的 normalize 只認得 sort、pattern）。
// 只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizePicnic, type PicnicState } from './plan'

export const PICNIC_KEY = 'picnic.progress'

export async function loadPicnic(): Promise<PicnicState> {
  return normalizePicnic(await getKV<unknown>(PICNIC_KEY, null))
}

export function savePicnic(p: PicnicState) {
  return setKV(PICNIC_KEY, p)
}
