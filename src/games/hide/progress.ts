// 躲起來了幾隻（家長 2026-11-17）的進度：kv `hide.progress = { level, recent[], taught[], today: { date, scenes[], animals[], places[] } }`。
// 跟別的遊戲分開存；只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeHide, type HideState } from './plan'

export const HIDE_KEY = 'hide.progress'

export async function loadHide(): Promise<HideState> {
  return normalizeHide(await getKV<unknown>(HIDE_KEY, null))
}

export function saveHide(p: HideState) {
  return setKV(HIDE_KEY, p)
}
