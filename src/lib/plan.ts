import { db, getKV, setKV, today, type StationId } from './db'
import { gamesOf } from '../content/games'
import { FRIENDS } from '../content/park'
import { lastPlayed } from './adaptive'
import { fluencyReady, isFluency } from './fluency'
import { getSettings } from './settings'
import { pick } from './random'

export interface Plan {
  date: string
  items: { game: string; station: StationId; done: boolean }[]
  hatched: string | null
}

/**
 * 第三格輪流的站：程式車庫、畫畫小屋、彩虹公園三天一輪。
 * 程式車庫是「思考」主線唯一的站（PRD §5.10），所以排在輪替的第一個：每三天至少來一次，
 * 每天的站數（家長設定）和總時間（約 20 分鐘）都不變
 */
const ROTATE: StationId[] = ['code', 'draw', 'park']

/** 每天的冒險：英文、數學、（程式／畫畫／公園輪流）、國語，每站挑最久沒玩的遊戲 */
export async function todayPlan(): Promise<Plan> {
  const date = today()
  const saved = await getKV<Plan | null>(`plan:${date}`, null)
  if (saved) return saved
  const dayIndex = Math.floor(Date.now() / 86_400_000)
  const rot = (k: number) => ROTATE[(dayIndex + k) % ROTATE.length]
  const order: StationId[] = ['english', 'math', rot(0), 'mandarin', rot(1)]
  const n = Math.max(2, Math.min(5, getSettings().activitiesPerDay))
  const items = order.slice(0, n).map((station) => {
    // 功文式小練習要有足夠已熟的數字題才排進來，不然就不是「做得到、越做越快」的練習
    const games = gamesOf(station).filter((g) => g.kind !== 'free' && (!isFluency(g.id) || fluencyReady()))
    const oldest = [...games].sort((a, b) => lastPlayed(a.id) - lastPlayed(b.id)).slice(0, 2)
    return { game: pick(oldest).id, station, done: false }
  })
  const plan: Plan = { date, items, hatched: null }
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
