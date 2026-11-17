// 聽兩步驟指令（T-164）的進度：kv `listen.progress = { level, streak, taught[], day, today[] }`。
// 跟別的遊戲分開存；只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeListen, type ListenState } from './plan'

export const LISTEN_KEY = 'listen.progress'

export async function loadListen(): Promise<ListenState> {
  return normalizeListen(await getKV<unknown>(LISTEN_KEY, null))
}

export function saveListen(p: ListenState) {
  return setKV(LISTEN_KEY, p)
}
