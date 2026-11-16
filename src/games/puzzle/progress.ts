// 拼圖的進度（T-156）：kv `puzzle.progress = { level, recent[], taught[], pics[] }`。
// 跟邏輯遊戲的 logic.progress 分開存（那邊的 normalize 只認得 sort、pattern，存回去會把別的 key 洗掉）。
// 只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizePuzzle, type PuzzleState } from './plan'

export const PUZZLE_KEY = 'puzzle.progress'

export async function loadPuzzle(): Promise<PuzzleState> {
  return normalizePuzzle(await getKV<unknown>(PUZZLE_KEY, null))
}

export function savePuzzle(p: PuzzleState) {
  return setKV(PUZZLE_KEY, p)
}
