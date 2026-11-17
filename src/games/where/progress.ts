// 躲在哪裡（T-160）的進度：kv `where.progress = { level, streak, taught[], sigs[], places[], objs[], hiders[] }`。
// 跟別的遊戲分開存；只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeWhere, type WhereState } from './plan'

export const WHERE_KEY = 'where.progress'

export async function loadWhere(): Promise<WhereState> {
  return normalizeWhere(await getKV<unknown>(WHERE_KEY, null))
}

export function saveWhere(p: WhereState) {
  return setKV(WHERE_KEY, p)
}
