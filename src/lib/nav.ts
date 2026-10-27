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

let route: Route = location.hash === '#parent' ? { name: 'parent' } : { name: 'home' }
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
