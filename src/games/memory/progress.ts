// 翻翻牌的進度（T-160）：kv `memory.progress = { level, recent[], taught[], streak, themes[], backs[], pics[] }`。
// 跟其他遊戲分開存。只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeMemory, type MemoryState } from './plan'

export const MEMORY_KEY = 'memory.progress'

export async function loadMemory(): Promise<MemoryState> {
  return normalizeMemory(await getKV<unknown>(MEMORY_KEY, null))
}

export function saveMemory(p: MemoryState) {
  return setKV(MEMORY_KEY, p)
}
