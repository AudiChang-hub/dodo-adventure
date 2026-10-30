// 語音快取：語音不在 precache 裡（vite.config.ts，T-54），App 在背景照 audio/files.json 把全部語音補進 Cache Storage，
// 沒網路時一樣有聲音。Service Worker 的 CacheFirst 用同一個快取（dodo-audio），播過的語音也會自動存進來。
import { useSyncExternalStore } from 'react'

const BASE = import.meta.env.BASE_URL
const CACHE = 'dodo-audio'
/** 同時下載幾個：不跟孩子正在播的語音搶頻寬 */
const PARALLEL = 2
/** 每次失敗後隔多久再補一輪 */
const RETRY_MS = 10 * 60 * 1000

export interface AudioCacheState {
  total: number
  cached: number
  running: boolean
}

let state: AudioCacheState = { total: 0, cached: 0, running: false }
const subs = new Set<() => void>()
let retryTimer = 0

function set(s: Partial<AudioCacheState>) {
  state = { ...state, ...s }
  subs.forEach((f) => f())
}

export function useAudioCache(): AudioCacheState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}

const saveData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData

/** 把還沒存的語音補進快取。重複呼叫沒關係：正在跑就不會再開一輪 */
export async function fillAudioCache() {
  if (state.running || !('caches' in window)) return
  clearTimeout(retryTimer)
  set({ running: true })
  let failed = 0
  try {
    const list: string[] = await fetch(`${BASE}audio/files.json`).then((r) => (r.ok ? r.json() : []))
    const urls = list.map((f) => new URL(`${BASE}audio/${f}`, location.href).href)
    const cache = await caches.open(CACHE)
    const have = new Set((await cache.keys()).map((r) => r.url))
    const missing = urls.filter((u) => !have.has(u))
    set({ total: urls.length, cached: urls.length - missing.length })
    if (missing.length) window.__dodoBoot?.log(`語音快取：還缺 ${missing.length}／${urls.length} 個，開始在背景補`)
    let i = 0
    const worker = async () => {
      while (i < missing.length) {
        if (!navigator.onLine || saveData()) return
        const u = missing[i++]
        try {
          const r = await fetch(u)
          if (!r.ok) throw new Error(String(r.status))
          // Service Worker 在控制時 CacheFirst 已經存了一份；第一次打開還沒有 Service Worker 時要自己存
          if (!(await cache.match(u))) await cache.put(u, r)
          set({ cached: state.cached + 1 })
        } catch {
          failed++
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
    if (state.cached >= state.total) window.__dodoBoot?.log(`語音快取：${state.total} 個都存好了`)
  } catch (e) {
    failed++
    window.__dodoBoot?.log(`語音快取失敗：${String(e)}`)
  } finally {
    set({ running: false })
  }
  // 沒補完（失敗、斷線）：過一陣子再補，下次打開 App 也會再補
  if (failed || state.cached < state.total) retryTimer = window.setTimeout(() => void fillAudioCache(), RETRY_MS)
}

/** 啟動後等一下再開始（先讓開場的語音、畫面載完），連上網路時也補一次 */
export function initAudioCache() {
  window.setTimeout(() => void fillAudioCache(), 15_000)
  window.addEventListener('online', () => void fillAudioCache())
}
