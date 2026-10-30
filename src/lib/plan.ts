import { db, getKV, setKV, today, type StationId } from './db'
import { GAMES } from '../content/games'
import { FRIENDS } from '../content/park'
import { trackOf, type TrackId } from '../content/tracks'
import { pickTheme, theme, THEME_GAP_DAYS, type ThemeId } from '../content/themes'
import { conceptIntrosNow, isDue, lastPlayed, pauseNew, plays, rungOpen, skill } from './adaptive'
import { entryRung } from '../content/ladder'
import { fluencyReady, isFluency } from './fluency'
import { getSettings, weekTheme } from './settings'
import { pick } from './random'
import { planDay, shiftDate, trackNeeds, MASTERY_DAYS } from './tracks'
import { chapterForNewPlan } from './story'

export interface PlanItem {
  game: string
  station: StationId
  /** 這一站練的主線（家長區用；舊的存檔沒有，讀的時候補上） */
  track?: TrackId
  done: boolean
}

export interface Plan {
  date: string
  /** 今天的主題故事（content/themes.ts）。2026-10-28 之前存的冒險沒有，讀的時候補上 */
  theme?: ThemeId
  /**
   * 今天講的故事章節（content/story 的章 id，G-8）。家長沒開「故事（試播）」時沒有這個欄位，
   * 冒險就是今天這扇門的通用章節，和以前一模一樣
   */
  chapter?: string
  items: PlanItem[]
  hatched: string | null
}

/** 最近幾天存下來的冒險主題（新的在前；沒玩、沒排的日子沒有） */
async function recentThemes(date: string): Promise<(string | undefined)[]> {
  const days = Array.from({ length: THEME_GAP_DAYS }, (_, i) => shiftDate(date, -(i + 1)))
  return (await Promise.all(days.map((d) => getKV<Plan | null>(`plan:${d}`, null)))).map((p) => p?.theme)
}

async function themeFor(date: string): Promise<ThemeId> {
  return pickTheme({ date, recent: await recentThemes(date), week: weekTheme() })
}

/**
 * 今天已經排好、但還是舊格式（沒有主題）的冒險：站和完成狀態都不動，只補上主題與每站的主線，
 * 孩子玩到一半更新 App 也能接著玩，剩下的站變成主題故事。
 */
async function migrate(p: Plan): Promise<Plan> {
  if (p.theme && theme(p.theme) && p.items.every((i) => i.track)) return p
  const next: Plan = {
    ...p,
    theme: p.theme && theme(p.theme) ? p.theme : await themeFor(p.date),
    items: p.items.map((i) => ({ ...i, track: i.track ?? trackOf(i.game) ?? undefined })),
  }
  // Firestore／IndexedDB 都不要留 undefined 的欄位
  for (const i of next.items) if (!i.track) delete i.track
  await setKV(`plan:${p.date}`, next)
  return next
}

/**
 * 每天的冒險是一個主題故事（2026-10-28 家長決定：不要讓孩子看到明確的科目）：
 * - 排哪些遊戲：照四條能力主線（PRD §5.10）的作答資料排，和以前一模一樣（lib/tracks.ts 的 trackNeeds、planDay）；
 * - 今天的主題：pickTheme（一週內不重複、優先對得到家長設的本週主題、同一天固定）；
 *   主題只決定故事和題目裡出現的東西（lib/theme-play.ts），不改排課，四條線的平衡不受影響。
 * 每天的站數（家長設定）和總時間（約 20 分鐘）不變；同一天的結果固定，排好就存起來。
 */
/** 最近一次讀到、存下的今天的冒險：換到冒險畫面的第一幀就畫得出路線（不必先等資料庫，不會先閃一張空白） */
let last: Plan | null = null
export const cachedPlan = (): Plan | null => (last && last.date === today() ? last : null)

export async function todayPlan(): Promise<Plan> {
  return (last = await readPlan())
}

/**
 * 故事（G-8）：家長開、關「故事（試播）」時，今天還沒開始走的冒險跟著換（有門的章節換成那扇門；關掉就拿掉章節、照原本的方式挑門）。
 * 已經走了一站就不動，從明天開始。
 */
async function withStory(p: Plan): Promise<Plan> {
  if (p.items.some((i) => i.done)) return p
  // 只管「開了沒有章節」「關了還有章節」兩種：已經排好的章節不換（同一天不會一下長篇、一下故事時間）
  const on = getSettings().story
  if (on === !!p.chapter) return p
  const ch = on ? await chapterForNewPlan(p.date) : null
  if (on && !ch) return p
  const next: Plan = { ...p }
  if (ch) {
    next.chapter = ch.id
    if (ch.door) next.theme = ch.door
  } else {
    delete next.chapter
    next.theme = await themeFor(p.date)
  }
  await setKV(`plan:${p.date}`, next)
  return next
}

async function readPlan(): Promise<Plan> {
  const date = today()
  const saved = await getKV<Plan | null>(`plan:${date}`, null)
  if (saved) return withStory(await migrate(saved))
  const attempts = await db.attempts.where('date').aboveOrEqual(shiftDate(date, -(MASTERY_DAYS - 1))).toArray()
  const needs = trackNeeds({ attempts, date, boxOf: (k) => skill(k).box, intros: conceptIntrosNow(), isDue })
  // 每個遊戲裡有幾個今天到期複習的技能：有到期的遊戲比較容易排到（已熟的內容改成複習）
  const byGame = new Map<string, Set<string>>()
  for (const a of attempts) byGame.set(a.game, (byGame.get(a.game) ?? new Set()).add(a.skill))
  const dueIn = (g: string) => [...(byGame.get(g) ?? [])].filter(isDue).length
  // 功文式小練習要有足夠已熟的數字題才排進來，不然就不是「做得到、越做越快」的練習
  // 還沒玩過、而且起點那一階還沒開的遊戲先不排（成長系統 §1.4：前置條件擋，不看年齡），例如連點成圖要等 1–5 穩固
  const ready = (id: string) => plays(id) > 0 || !entryRung(id) || rungOpen(entryRung(id)!)
  const games = GAMES.filter((g) => g.kind !== 'free' && trackOf(g.id) && (!isFluency(g.id) || fluencyReady()) && ready(g.id))
  const n = Math.max(2, Math.min(5, getSettings().activitiesPerDay))
  const slots = planDay({ date, n, needs, games, lastPlayed, plays, dueIn, overloaded: pauseNew() })
  const plan: Plan = { date, theme: await themeFor(date), items: slots.map((x) => ({ game: x.game, station: x.station, track: x.track, done: false })), hatched: null }
  // 故事（G-8）：長篇的章指定今天走哪一扇門；故事時間沒有門（遊戲內容照今天挑到的主題）。不改排了哪些遊戲
  const ch = await chapterForNewPlan(date)
  if (ch) {
    plan.chapter = ch.id
    if (ch.door) plan.theme = ch.door
  }
  await setKV(`plan:${date}`, plan)
  return plan
}

export async function savePlan(p: Plan) {
  last = p
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
