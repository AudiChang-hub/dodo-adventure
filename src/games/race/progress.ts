// 恐龍賽跑棋（家長 2026-11-17）的進度：kv `race.progress = { level, recent[], taught[], today: { date, tracks[], rewards[], runners[] } }`。
// 跟別的遊戲分開存；只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeRace, type RaceState } from './plan'

export const RACE_KEY = 'race.progress'

export async function loadRace(): Promise<RaceState> {
  return normalizeRace(await getKV<unknown>(RACE_KEY, null))
}

export function saveRace(p: RaceState) {
  return setKV(RACE_KEY, p)
}
