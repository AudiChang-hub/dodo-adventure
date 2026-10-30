import { db, getKV, setKV, today, uid, type Session, type StationId } from './db'
import { currentRoute, go, isChildPlay } from './nav'
import { bandSetting } from './settings'

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
  // 護眼休息、每日上限：家長沒改過就跟著年段（FRAME-6、7；lib/settings.ts 的 bandSetting）
  const every = bandSetting('eyeBreakEvery')
  if (every > 0 && !breakDue && sinceBreak >= every * 60) {
    breakDue = true
    breakSubs.forEach((f) => f())
  }
  session.end = Date.now()
  if (usedToday % 10 === 0) void persist()
  // 時間到不在題目中途結束：有遊戲（或冒險的收尾）在畫面上就等它結束，
  // 在兩個遊戲之間才轉到睡覺畫面。不做任何倒數或預告（benchmark 手法 8）
  const over = overtime()
  if (over >= 0 && (holds === 0 || over >= GRACE_MAX_SEC)) goToBed()
}

/** 超過每日上限幾秒；還沒到（或不限制）是 -1 */
function overtime(): number {
  const limit = bandSetting('dailyMinutes')
  if (limit <= 0) return -1
  const over = usedToday - (limit + extraMinutes) * 60
  return over >= 0 ? over : -1
}

function goToBed() {
  void persist()
  go({ name: 'bedtime' })
}

// ── 時間到只在兩個遊戲之間結束 ───────────────────────────────
/**
 * 遊戲放著不管時的保險：超過上限這麼久還沒玩完，就算在題目中途也結束。
 * 一般一局 3–5 分鐘，正常玩不會碰到；只是避免平板被丟著一直計時。
 */
const GRACE_MAX_SEC = 6 * 60
let holds = 0

/**
 * 遊戲進行中先別結束：每個遊戲的 Shell 掛載時呼叫，回傳的函式在遊戲結束時呼叫。
 * 今日冒險在「蛋裂開、孵蛋」這些收尾段落也會先擋著，由冒險自己在兩站之間檢查。
 */
export function holdBedtime(): () => void {
  holds++
  let done = false
  return () => {
    if (done) return
    done = true
    holds = Math.max(0, holds - 1)
  }
}

/** 今天的時間用完了嗎（給冒險在兩站之間判斷） */
export const isTimeUp = () => overtime() >= 0

/** 兩個遊戲之間呼叫：時間到了就去睡覺，回傳是否已經結束 */
export function bedtimeIfDue(): boolean {
  if (!isTimeUp()) return false
  goToBed()
  return true
}

async function persist() {
  if (!session) return
  await setKV(`usage:${usageDate}`, usedToday)
  if (session.activeSec > 0) await db.sessions.put({ ...session, synced: 0 })
}

/**
 * 重置學習進度前呼叫：先把這次的時間存好，再停止計時、不再寫入作答時間與這次的遊玩紀錄，
 * 免得清掉資料庫之後、重新載入之前（例如切到背景時）又被寫回去。重置失敗時再呼叫 startSession 接著計時。
 */
export async function stopSession() {
  clearInterval(timer)
  await persist()
  session = null
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
