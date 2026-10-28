import { db, getKV, setKV, today, type StationId } from './db'
import { GAMES } from '../content/games'
import { FRIENDS } from '../content/park'
import { trackOf } from '../content/tracks'
import { conceptIntrosNow, isDue, lastPlayed, pauseNew, plays, skill } from './adaptive'
import { fluencyReady, isFluency } from './fluency'
import { getSettings } from './settings'
import { pick } from './random'
import { planDay, shiftDate, trackNeeds, MASTERY_DAYS } from './tracks'

export interface Plan {
  date: string
  items: { game: string; station: StationId; done: boolean }[]
  hatched: string | null
}

/**
 * 每天的冒險：依四條能力主線（PRD §5.10）的作答資料排，不再固定「英文、數學、輪流、國語」。
 * 怎麼平衡寫在 lib/tracks.ts（trackNeeds 算哪條線落後、planDay 挑遊戲），這裡只負責讀資料和存檔。
 * 每天的站數（家長設定）和總時間（約 20 分鐘）不變；同一天的結果固定，排好就存起來。
 */
export async function todayPlan(): Promise<Plan> {
  const date = today()
  const saved = await getKV<Plan | null>(`plan:${date}`, null)
  if (saved) return saved
  const attempts = await db.attempts.where('date').aboveOrEqual(shiftDate(date, -(MASTERY_DAYS - 1))).toArray()
  const needs = trackNeeds({ attempts, date, boxOf: (k) => skill(k).box, intros: conceptIntrosNow(), isDue })
  // 每個遊戲裡有幾個今天到期複習的技能：有到期的遊戲比較容易排到（已熟的內容改成複習）
  const byGame = new Map<string, Set<string>>()
  for (const a of attempts) byGame.set(a.game, (byGame.get(a.game) ?? new Set()).add(a.skill))
  const dueIn = (g: string) => [...(byGame.get(g) ?? [])].filter(isDue).length
  // 功文式小練習要有足夠已熟的數字題才排進來，不然就不是「做得到、越做越快」的練習
  const games = GAMES.filter((g) => g.kind !== 'free' && trackOf(g.id) && (!isFluency(g.id) || fluencyReady()))
  const n = Math.max(2, Math.min(5, getSettings().activitiesPerDay))
  const slots = planDay({ date, n, needs, games, lastPlayed, plays, dueIn, overloaded: pauseNew() })
  const plan: Plan = { date, items: slots.map((x) => ({ game: x.game, station: x.station, done: false })), hatched: null }
  await setKV(`plan:${date}`, plan)
  return plan
}

export async function savePlan(p: Plan) {
  await setKV(`plan:${p.date}`, p)
}

export const planDone = (p: Plan) => p.items.every((i) => i.done)

/** 孵出一個還沒有的朋友；全部集滿之後就隨機重複 */
export async function hatchFriend(): Promise<string> {
  const have = new Set((await db.friends.toArray()).map((f) => f.id))
  const fresh = FRIENDS.filter((f) => !have.has(f))
  const id = fresh.length ? pick(fresh) : pick(FRIENDS)
  await db.friends.put({ id, ts: Date.now() })
  return id
}
