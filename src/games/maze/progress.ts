// 迷宮的進度（T-156）：kv `maze.progress = { level, recent[], taught[], sigs[], theme, goal }`。
// 跟邏輯遊戲的 logic.progress 分開存（那邊的 normalize 只認得 sort、pattern）。
// 只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeMaze, type MazeState } from './plan'

export const MAZE_KEY = 'maze.progress'

export async function loadMaze(): Promise<MazeState> {
  return normalizeMaze(await getKV<unknown>(MAZE_KEY, null))
}

export function saveMaze(p: MazeState) {
  return setKV(MAZE_KEY, p)
}
