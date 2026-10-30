import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { StationId } from './db'
import { shownFor, type Shown } from './shown'

export type Route =
  | { name: 'home' }
  | { name: 'adventure' }
  | { name: 'map' }
  | { name: 'station'; station: StationId }
  | { name: 'play'; game: string; station: StationId }
  | { name: 'collection' }
  | { name: 'house' }
  | { name: 'storybook' }
  | { name: 'bedtime' }
  | { name: 'parent' }

/** 更新重新載入前記下的畫面，載入後回到同一頁（只會是沒有參數的安全畫面） */
export const RESUME_KEY = 'dodo.resume'

function initialRoute(): Route {
  // 先看更新前記下的畫面：網址還帶著 #parent 時，孩子在首頁被更新也不會掉進家長區
  try {
    const r = sessionStorage.getItem(RESUME_KEY)
    sessionStorage.removeItem(RESUME_KEY)
    if (r === 'home' || r === 'map' || r === 'collection' || r === 'house' || r === 'storybook' || r === 'parent') return { name: r }
  } catch {
    /* 讀不到就照網址 */
  }
  return location.hash === '#parent' ? { name: 'parent' } : { name: 'home' }
}

let route: Route = initialRoute()
const subs = new Set<() => void>()

/** 換畫面的方式（ui/Scenes.tsx 的整頁轉場用） */
export interface NavHow {
  /** 明確指定往回（上面的畫面淡出）；沒給就照畫面的層級判斷 */
  back?: boolean
}

let how: NavHow = {}

/** 這一次換畫面時記下的方式：App 在重新畫的時候讀 */
export const lastHow = () => how

// ── 往回要等往前的轉場走完 ───────────────────────────────────
// 新畫面還在淡入（透明度往上）就往回，它會馬上轉頭淡出：同一個畫面先變亮再變暗，紙感螢幕上是一閃（B16）。
// 所以往回的那一步等新畫面蓋好了才開始：一段只往上、一段只往下。最多晚半秒，按下去的音效是馬上就有的。

/** 往前換畫面時新畫面淡入到什麼時候（performance.now）：ui/Scenes.tsx 每次往前換畫面時更新 */
let enteringUntil = 0

/** 有一層新畫面開始淡入，ms 之後才算蓋好 */
export function noteEntering(ms: number) {
  enteringUntil = Math.max(enteringUntil, performance.now() + ms)
}

/** 等正在淡入的新畫面蓋好再做（往回的轉場）；沒有在淡入就馬上做 */
export function afterEntering(fn: () => void) {
  const wait = enteringUntil - performance.now()
  if (wait <= 0) fn()
  else window.setTimeout(fn, wait)
}

/** 每一次 go 的編號：等著往回的那一步，中間又換了別的畫面就不做了 */
let goSeq = 0

export function go(r: Route, opts: NavHow = {}) {
  const n = ++goSeq
  const apply = () => {
    if (n !== goSeq) return
    how = { back: opts.back }
    route = r
    subs.forEach((f) => f())
  }
  if (opts.back) afterEntering(apply)
  else apply()
}

export const currentRoute = () => route

export function useRoute(): Route {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => route,
  )
}

// ── 返回：點一下回上一層 ─────────────────────────────────────
// 不跳出 App 交給 Android 的螢幕固定；App 裡的返回只回上一層，最上層（首頁）就停住。

/** 上一層：遊戲 → 站點 → 地圖 → 首頁；故事書 → 魔法屋 → 首頁；朋友、冒險、家長區 → 首頁。首頁和睡覺畫面沒有上一層 */
export function parentOf(r: Route): Route | null {
  switch (r.name) {
    case 'play':
      return { name: 'station', station: r.station }
    case 'station':
      return { name: 'map' }
    case 'storybook':
      return { name: 'house' }
    case 'map':
    case 'house':
    case 'collection':
    case 'adventure':
    case 'parent':
      return { name: 'home' }
    case 'home':
    case 'bedtime':
      return null
  }
}

/** 返回之後（下一層畫面看得到）這麼久不再收返回：一次轉場還沒走完，下一層的返回鍵就在同一個位置 */
const BACK_LOCK_MS = 1000
/** 孩子還在同一個地方連點：每點一下再延長這麼久，連點停下來才收下一次返回 */
const BACK_BURST_MS = 700
/** 離上一次返回點的地方多近算「同一個地方」 */
const BACK_NEAR_PX = 140

/**
 * 上一次返回之後的鎖。時間都用按下去那一下自己的 e.timeStamp 判斷，鎖多久用「孩子真的看得到畫面」的時間算（lib/shown.ts）：
 * 平板忙的時候主執行緒卡住，計時器走完了下一層畫面卻還沒出現，排隊的連點又在之後才處理，會多跳一層（T-67）。
 */
let backLock: { shown: Shown; burst: number; at: { x: number; y: number } | null } | null = null
const locked = (t: number) => !!backLock && (t < backLock.shown.at || t < backLock.burst)

// 連點的手被舊畫面（轉場中不收點擊）吃掉，按鈕收不到；在最外層看位置，還在同一處連點就一直延長
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      const l = backLock
      if (!l?.at || !locked(e.timeStamp)) return
      if (Math.hypot(e.clientX - l.at.x, e.clientY - l.at.y) <= BACK_NEAR_PX) l.burst = Math.max(l.burst, e.timeStamp + BACK_BURST_MS)
    },
    { capture: true },
  )
}

/** 畫面自己處理返回（冒險要先記下這一站沒玩完、慶祝中要先收尾）。回傳 false 表示不處理，交給外層 */
type BackHandler = () => boolean | void

const handlers: { owner: Route; fn: { current: BackHandler } }[] = []

/** 這個畫面在的時候，返回先交給它；只在它自己的路由上有效（轉場中還留著的舊畫面不會接到） */
export function useBack(fn: BackHandler) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const h = { owner: route, fn: ref }
    handlers.push(h)
    return () => {
      const i = handlers.indexOf(h)
      if (i >= 0) handlers.splice(i, 1)
    }
  }, [])
}

/**
 * 回上一層（返回鍵、Android 的返回手勢都走這裡）。回傳有沒有真的返回。
 * 連點、轉場中再點都不會多跳一層：剛返回過的這段時間裡的返回一律不理。
 * run 是按鈕自己的返回（遊戲的 onExit）；沒給就問畫面自己的處理，再沒有就照 parentOf。
 */
export function back(at?: { x: number; y: number; t?: number }, run?: () => void): boolean {
  // 按下去的時間（返回鍵給的 e.timeStamp）；Android 的返回手勢沒有，用現在
  const t = at?.t ?? performance.now()
  if (backLock && locked(t)) {
    backLock.burst = Math.max(backLock.burst, t + BACK_BURST_MS)
    return false
  }
  const lock = () => {
    backLock?.shown.cancel()
    backLock = { shown: shownFor(BACK_LOCK_MS), burst: 0, at: at ? { x: at.x, y: at.y } : null }
    return true
  }
  if (run) {
    lock()
    run()
    return true
  }
  for (let i = handlers.length - 1; i >= 0; i--) {
    const h = handlers[i]
    if (h.owner !== route) continue
    if (h.fn.current() !== false) return lock()
  }
  const up = parentOf(route)
  if (!up) return false
  lock()
  go(up, { back: true })
  return true
}

/** 孩子在玩的畫面才計入每日時間 */
export const isChildPlay = (r: Route) => r.name !== 'parent' && r.name !== 'bedtime'
