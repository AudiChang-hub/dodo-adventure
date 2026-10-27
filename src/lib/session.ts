import { db, getKV, setKV, today, uid, type Session, type StationId } from './db'
import { currentRoute, go, isChildPlay } from './nav'
import { getSettings } from './settings'

let session: Session | null = null
let usedToday = 0
let usageDate = today()
let extraMinutes = 0
let timer = 0
let sinceBreak = 0
let breakDue = false
const breakSubs = new Set<() => void>()

export const isBreakDue = () => breakDue
export function onBreakChange(fn: () => void) {
  breakSubs.add(fn)
  return () => {
    breakSubs.delete(fn)
  }
}
export function finishBreak() {
  breakDue = false
  sinceBreak = 0
  breakSubs.forEach((f) => f())
}

export const sessionId = () => session?.id ?? 'none'

export async function startSession() {
  usageDate = today()
  usedToday = await getKV<number>(`usage:${usageDate}`, 0)
  session = { id: uid(), date: usageDate, start: Date.now(), end: Date.now(), activeSec: 0, activities: [], synced: 0 }
  clearInterval(timer)
  timer = window.setInterval(tick, 1000)
}

function tick() {
  if (!session || document.hidden || !isChildPlay(currentRoute())) return
  if (today() !== usageDate) {
    usageDate = today()
    usedToday = 0
    extraMinutes = 0
  }
  usedToday++
  session.activeSec++
  sinceBreak++
  const every = getSettings().eyeBreakEvery
  if (every > 0 && !breakDue && sinceBreak >= every * 60) {
    breakDue = true
    breakSubs.forEach((f) => f())
  }
  session.end = Date.now()
  if (usedToday % 10 === 0) void persist()
  const limit = getSettings().dailyMinutes
  if (limit > 0 && usedToday >= (limit + extraMinutes) * 60) {
    void persist()
    go({ name: 'bedtime' })
  }
}

async function persist() {
  if (!session) return
  await setKV(`usage:${usageDate}`, usedToday)
  if (session.activeSec > 0) await db.sessions.put({ ...session, synced: 0 })
}

export function noteActivity(game: string, station: StationId, done: boolean) {
  session?.activities.push({ game, station, done })
  void persist()
}

/** 家長在睡覺畫面按「再玩一下」 */
export function grantExtra(minutes: number) {
  extraMinutes += minutes
}

export const minutesUsedToday = () => Math.floor(usedToday / 60)

document.addEventListener('visibilitychange', () => {
  if (document.hidden) void persist()
})
