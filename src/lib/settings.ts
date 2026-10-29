import { useSyncExternalStore } from 'react'
import { getKV, setKV, today } from './db'
import type { VocabTheme } from '../content/vocab'

export interface Settings {
  /** 每日遊玩上限（分鐘），0 代表不限制 */
  dailyMinutes: number
  /** 自由探索：完成今日冒險後才開放，或一直開放 */
  freePlay: 'after' | 'always'
  volume: number
  /** 本週主題：動物村會優先出這個主題的詞（對應幼兒園聯絡簿），7 天後自動取消 */
  theme: VocabTheme | 'all'
  /** 本週主題是哪一天設定的（YYYY-MM-DD） */
  themeSetAt?: string
  activitiesPerDay: number
  /** 每玩幾分鐘提醒看遠方休息，0 代表關閉 */
  eyeBreakEvery: number
  /** 晚上 7 點後畫面偏暖 */
  nightWarm: boolean
  /** 蠟筆著色「幫忙不塗出線」：筆觸限制在下筆的那一塊裡；關掉就完全自由塗 */
  coloringHelp: boolean
  /** 單字中文提示：教學卡教還沒學會的字時唸「Apple → 蘋果 → Apple」（lib/words.ts 的 bridgeLines）；關掉就全英文 */
  zhBridge: boolean
}

const DEFAULTS: Settings = { dailyMinutes: 20, freePlay: 'after', volume: 0.9, theme: 'all', activitiesPerDay: 4, eyeBreakEvery: 10, nightWarm: true, coloringHelp: true, zhBridge: true }

let state: Settings = DEFAULTS
const subs = new Set<() => void>()

export async function loadSettings() {
  state = { ...DEFAULTS, ...(await getKV<Partial<Settings>>('settings', {})) }
  // 本週主題：舊資料沒有設定日期，從今天開始算 7 天；過期就自動取消
  if (state.theme !== 'all' && (!state.themeSetAt || !weekTheme(state))) {
    state = state.themeSetAt ? clearTheme(state) : { ...state, themeSetAt: today() }
    await setKV('settings', state)
  }
  subs.forEach((f) => f())
}

/** 本週主題維持幾天 */
export const THEME_DAYS = 7

/** 本週主題自動取消的日期（這一天起不再生效） */
export function themeEnds(s: Pick<Settings, 'themeSetAt'> = state): string | null {
  if (!s.themeSetAt) return null
  const [y, m, d] = s.themeSetAt.split('-').map(Number)
  return today(new Date(y, m - 1, d + THEME_DAYS))
}

/** 目前生效的本週主題；沒設定或已經過了 7 天是 null（開著 App 跨過那一天也會立刻失效） */
export function weekTheme(s: Pick<Settings, 'theme' | 'themeSetAt'> = state): VocabTheme | null {
  if (s.theme === 'all') return null
  const end = themeEnds(s)
  return end && today() >= end ? null : s.theme
}

export function getSettings() {
  return state
}

/** 取消本週主題。設定會同步到 Firestore，不能留 undefined 的欄位，所以整個拿掉 */
function clearTheme(s: Settings): Settings {
  const { themeSetAt: _t, ...rest } = s
  return { ...rest, theme: 'all' }
}

export async function updateSettings(patch: Partial<Settings>) {
  const prev = state
  // 換本週主題就重新開始算 7 天
  state = { ...state, ...patch }
  if (patch.theme && patch.theme !== 'all' && patch.theme !== prev.theme) state.themeSetAt = today()
  if (state.theme === 'all') state = clearTheme(state)
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
