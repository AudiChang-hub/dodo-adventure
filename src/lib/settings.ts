import { useSyncExternalStore } from 'react'
import { getKV, setKV } from './db'
import type { VocabTheme } from '../content/vocab'

export interface Settings {
  /** 每日遊玩上限（分鐘），0 代表不限制 */
  dailyMinutes: number
  /** 自由探索：完成今日冒險後才開放，或一直開放 */
  freePlay: 'after' | 'always'
  volume: number
  /** 本週主題：動物村會優先出這個主題的詞 */
  theme: VocabTheme | 'all'
  activitiesPerDay: number
  /** 每玩幾分鐘提醒看遠方休息，0 代表關閉 */
  eyeBreakEvery: number
  /** 晚上 7 點後畫面偏暖 */
  nightWarm: boolean
}

const DEFAULTS: Settings = { dailyMinutes: 20, freePlay: 'after', volume: 0.9, theme: 'all', activitiesPerDay: 4, eyeBreakEvery: 10, nightWarm: true }

let state: Settings = DEFAULTS
const subs = new Set<() => void>()

export async function loadSettings() {
  state = { ...DEFAULTS, ...(await getKV<Partial<Settings>>('settings', {})) }
  subs.forEach((f) => f())
}

export function getSettings() {
  return state
}

export async function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
  await setKV('settings', state)
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
