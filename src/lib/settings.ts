import { useSyncExternalStore } from 'react'
import { getKV, setKV, today } from './db'
import type { VocabTheme } from '../content/vocab'
import { getFrame } from './growth'

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
  /**
   * 蠟筆著色「幫忙不塗出線」：開啟時一筆只塗在下筆的那一塊裡。預設關閉＝完全自由塗（準則 DRAW-1；
   * 家長回報「畫的地方有被限制位置」）。線稿的黑線不管開不開都疊在最上層，塗出線也好看。
   */
  coloringHelp: boolean
  /**
   * 設定改過預設值的版本。2：coloringHelp 預設從開改成關（2026-10-29），
   * 舊裝置存著的 true 是當時的預設、不是家長選的，讀進來時改成關一次；之後家長再打開就照家長的。
   * 3：story 預設從關改成開（2026-10-30，家長確認故事世界的語氣）。版本 3 以前沒有正式版能在家長區選故事，
   * 舊裝置存著的 false 只會是當時的預設，讀進來時改成開一次；之後家長在家長區關掉就照家長的。
   */
  defaultsV?: number
  /** 單字中文提示：教學卡教還沒學會的字時唸「Apple → 蘋果 → Apple」（lib/words.ts 的 bridgeLines）；關掉就全英文 */
  zhBridge: boolean
  /** 家長在家長區自己選過的「跟著年段」設定（見 bandSetting）；沒選過的跟著年段的預設 */
  chosen?: BandSetting[]
  /**
   * 故事（G-8，試播）：開啟時每天的冒險是《彩虹蛋之旅》的一章（開場、結尾在魔法屋），每週一章故事時間。
   * 家長 2026-10-30 確認故事世界的語氣，預設開啟。家長關掉時冒險和以前一模一樣（12 扇魔法門的通用章節）。
   * 開關的時候今天的冒險還沒走就跟著換，已經走了一站就從明天開始（lib/plan.ts 的 withStory）。
   */
  story: boolean
}

/** 預設值跟著年段走的設定（準則 FRAME-6、FRAME-7）：每日時間上限、護眼休息、今日冒險的站數 */
export type BandSetting = 'dailyMinutes' | 'eyeBreakEvery' | 'activitiesPerDay'
const BAND_SETTINGS: readonly BandSetting[] = ['dailyMinutes', 'eyeBreakEvery', 'activitiesPerDay']

const DEFAULTS_V = 3
const DEFAULTS: Settings = { dailyMinutes: 20, freePlay: 'after', volume: 0.9, theme: 'all', activitiesPerDay: 4, eyeBreakEvery: 10, nightWarm: true, coloringHelp: false, zhBridge: true, story: true, defaultsV: DEFAULTS_V }

let state: Settings = DEFAULTS
const subs = new Set<() => void>()

/** 舊版存下來的設定：改過預設值的欄位換成新的預設（見 Settings.defaultsV） */
export function migrateSettings(saved: Partial<Settings>): { s: Partial<Settings>; changed: boolean } {
  const v = saved.defaultsV ?? 1
  if (v >= DEFAULTS_V) return { s: saved, changed: false }
  const s: Partial<Settings> = { ...saved, defaultsV: DEFAULTS_V }
  if (v < 2) s.coloringHelp = false
  if (v < 3) s.story = true
  return { s, changed: Object.keys(saved).length > 0 }
}

export async function loadSettings() {
  const { s: saved, changed } = migrateSettings(await getKV<Partial<Settings>>('settings', {}))
  state = { ...DEFAULTS, ...saved }
  if (changed) await setKV('settings', state)
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

/** 這個設定還跟著年段（家長沒選過） */
export const followsBand = (k: BandSetting, s: Settings = state) => !s.chosen?.includes(k) && s[k] === DEFAULTS[k]

/**
 * 跟著年段的設定現在實際是多少（FRAME-6、7；TIME-1 家長設定優先）：
 * 家長選過（chosen），或舊版存下來的值不是原本的預設（那是家長改的），就照家長的；
 * 沒選過就照年段：每日 20／25／30 分鐘、護眼每 10／10／15 分鐘、站數 4／4／5 站（外框的上限）。小班段跟 App 原本的預設一樣。
 */
export function bandSetting(k: BandSetting, s: Settings = state): number {
  if (!followsBand(k, s)) return s[k]
  const f = getFrame()
  return k === 'dailyMinutes' ? f.dailyMinutes : k === 'eyeBreakEvery' ? f.eyeBreakEvery[1] : f.stationsPerDay[1]
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
  const picked = BAND_SETTINGS.filter((k) => k in patch && !prev.chosen?.includes(k))
  if (picked.length) state.chosen = [...(prev.chosen ?? []), ...picked]
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
