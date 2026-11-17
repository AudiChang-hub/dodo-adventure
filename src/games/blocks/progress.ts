// 積木蓋蓋看的進度（T-162）：kv `blocks.progress = { level, recent[], taught[], models[] }`。
// 跟拼圖、邏輯遊戲分開存。只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
// 自由蓋的作品存在 drawings 表（跟畫畫的作品同一個地方，家長區的作品集看得到）。
import { getKV, setKV } from '../../lib/db'
import { normalizeBlocks, type BlocksState } from './plan'

export const BLOCKS_KEY = 'blocks.progress'

export async function loadBlocks(): Promise<BlocksState> {
  return normalizeBlocks(await getKV<unknown>(BLOCKS_KEY, null))
}

export function saveBlocks(p: BlocksState) {
  return setKV(BLOCKS_KEY, p)
}
