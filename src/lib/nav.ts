import { useSyncExternalStore } from 'react'
import type { StationId } from './db'

export type Route =
  | { name: 'home' }
  | { name: 'adventure' }
  | { name: 'map' }
  | { name: 'station'; station: StationId }
  | { name: 'play'; game: string; station: StationId }
  | { name: 'collection' }
  | { name: 'bedtime' }
  | { name: 'parent' }

/** 更新重新載入前記下的畫面，載入後回到同一頁（只會是沒有參數的安全畫面） */
export const RESUME_KEY = 'dodo.resume'

function initialRoute(): Route {
  // 先看更新前記下的畫面：網址還帶著 #parent 時，孩子在首頁被更新也不會掉進家長區
  try {
    const r = sessionStorage.getItem(RESUME_KEY)
    sessionStorage.removeItem(RESUME_KEY)
    if (r === 'home' || r === 'map' || r === 'collection' || r === 'parent') return { name: r }
  } catch {
    /* 讀不到就照網址 */
  }
  return location.hash === '#parent' ? { name: 'parent' } : { name: 'home' }
}

let route: Route = initialRoute()
const subs = new Set<() => void>()

export function go(r: Route) {
  route = r
  subs.forEach((f) => f())
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

/** 孩子在玩的畫面才計入每日時間 */
export const isChildPlay = (r: Route) => r.name !== 'parent' && r.name !== 'bedtime'
