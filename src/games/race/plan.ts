// 恐龍賽跑棋（家長 2026-11-17，指引 MA-3 一一對應、數到 10，SE-2／CG-3 輪流、等一下）：級數、骰子、出一局、升降級。
// 只有純函式，scripts/test-race-hide.ts 直接測；畫面在 ./Race.tsx，內容在 ./data.ts。
//
// 棋盤是一條 1～10 的數字線（兩條跑道：上面豆豆的、下面孩子的）。孩子點骰子，骰子停在幾點就自己一格一格點著走，每走一格念那一格的數字。
// 豆豆跟他輪流：豆豆擲、豆豆走（孩子等一下）。誰先到終點都一起慶祝，另一隻接著走到；兩隻都到了，終點的禮物打開（每次不一樣的驚喜，FB-6）。
//
// 難度（LOAD-2 數量先小、PHASE-1 先一起做）：
//   1 級：1～3 點的骰子，下一格亮著（一起做）
//   2 級：1～3 點的骰子，下一格不亮（自己找下一格）
//   3 級：1～6 點的骰子（4 歲：MA-1 骰子點的樣子、數到 6）
// 「一步」= 孩子走完骰子的點數。第一次就對 = 中間沒有跳格、沒有手帶著走。
// 升級：最近 6 步有 5 步第一次就對；退級：最近 4 步只有 ≤ 1 步第一次就對（ADAPT-4）。示範、發呆時手帶著走的不算。
import { REWARDS, RUNNERS, TRACKS, type Runner } from './data'

type Rnd = () => number
const pickOf = <T,>(a: readonly T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length) % a.length]

export type RaceLevel = 1 | 2 | 3
export const RACE_MAX: RaceLevel = 3
export const RACE_GAME = 'logic-race'
/** 棋盤幾格（終點那一格是 10） */
export const GOAL = 10

export const RACE_LEVELS: Record<RaceLevel, { die: number; glow: boolean }> = {
  1: { die: 3, glow: true },
  2: { die: 3, glow: false },
  3: { die: 6, glow: false },
}
/** 作答紀錄的技能：race:1-3-glow、race:1-3、race:1-6 */
export const raceSkill = (level: RaceLevel) => `race:1-${RACE_LEVELS[level].die}${RACE_LEVELS[level].glow ? '-glow' : ''}`

/** 擲骰子：1～這一級的點數；不連續三次一樣（三歲會覺得「怎麼又是這個」） */
export function rollDie(level: RaceLevel, last: number[], rnd: Rnd = Math.random): number {
  const max = RACE_LEVELS[level].die
  const pool = Array.from({ length: max }, (_, i) => i + 1)
  const banned = last.length >= 2 && last[last.length - 1] === last[last.length - 2] ? last[last.length - 1] : null
  return pickOf(
    pool.filter((v) => v !== banned),
    rnd,
  )
}

/** 示範那一步擲出幾點：看得出「一格、兩格，停」，又不會一下走太遠 */
export const demoRoll = (level: RaceLevel) => (RACE_LEVELS[level].die >= 6 ? 4 : 2)

/** 從 pos 走 v 格：走到哪幾格（超過終點的不走：停在 10） */
export const stepsFrom = (pos: number, v: number) => Array.from({ length: Math.max(0, Math.min(v, GOAL - pos)) }, (_, i) => pos + i + 1)

// ── 一局：場景、驚喜、孩子的恐龍（同一天不重複） ─────────────────

export interface Race {
  level: RaceLevel
  track: string
  reward: string
  runner: Runner
  /** 第一次到這一級：孩子的第一步是手示範的（不算他的） */
  demo: boolean
}

/** 記住今天用過的（日期換了就清掉）；都用過了就避開最近幾個 */
export interface RaceMemory {
  date: string
  tracks: string[]
  rewards: string[]
  runners: string[]
}

/** 今天還沒用過的；都用過了就挑最久以前的那一半（至少不跟上一次一樣） */
export function freshToday<T extends string>(pool: readonly T[], used: readonly string[], rnd: Rnd): T {
  const left = pool.filter((x) => !used.includes(x))
  if (left.length) return pickOf(left, rnd)
  const old = used.slice(0, Math.max(1, Math.floor(used.length / 2))).filter((x) => pool.includes(x as T)) as T[]
  return pickOf(old.length ? old : pool.filter((x) => x !== used[used.length - 1]), rnd)
}

const sameDay = (m: RaceMemory, date: string): RaceMemory => (m.date === date ? m : { date, tracks: [], rewards: [], runners: [] })

export function makeRace(s: RaceState, date: string, rnd: Rnd = Math.random): { race: Race; state: RaceState } {
  const level = s.level as RaceLevel
  const m = sameDay(s.today, date)
  const track = freshToday(
    TRACKS.map((t) => t.id),
    m.tracks,
    rnd,
  )
  const reward = freshToday(
    REWARDS.map((r) => r.id),
    m.rewards,
    rnd,
  )
  // 恐龍只有 4 隻：不跟上一局一樣就好
  const runner = pickOf(
    RUNNERS.filter((r) => r !== m.runners[m.runners.length - 1]),
    rnd,
  )
  const today: RaceMemory = { date, tracks: [...m.tracks.filter((x) => x !== track), track], rewards: [...m.rewards.filter((x) => x !== reward), reward], runners: [...m.runners, runner].slice(-4) }
  return { race: { level, track, reward, runner, demo: !s.taught.includes(level) }, state: { ...s, today } }
}

// ── 進度、升降級 ──────────────────────────────────────────────

export const UP_OF = 6
export const UP_OK = 5
export const DOWN_OF = 4
export const DOWN_OK = 1

export interface RaceState {
  level: number
  /** 這一級（升降之後重新算）的每一步：第一次就對了沒 */
  recent: boolean[]
  /** 示範過的級 */
  taught: number[]
  today: RaceMemory
}

export const RACE_START: RaceState = { level: 1, recent: [], taught: [], today: { date: '', tracks: [], rewards: [], runners: [] } }

/** 孩子走完一步：counted（不是示範、不是手帶著走的）才算 */
export function stepRace(s: RaceState, r: { first: boolean; counted: boolean }): RaceState {
  if (!r.counted) return s
  const recent = [...s.recent, r.first].slice(-UP_OF)
  const lastDown = recent.slice(-DOWN_OF)
  if (s.level > 1 && lastDown.length >= DOWN_OF && lastDown.filter(Boolean).length <= DOWN_OK) return { ...s, level: s.level - 1, recent: [] }
  if (s.level < RACE_MAX && recent.length >= UP_OF && recent.filter(Boolean).length >= UP_OK) return { ...s, level: s.level + 1, recent: [] }
  return { ...s, recent }
}

const strs = (x: unknown, ok: readonly string[], keep: number) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && ok.includes(v)).slice(-keep) : [])

/** 讀進來的東西不一定完整（壞掉、舊格式）：缺的補預設，級數夾在 1～max */
export function normalizeRace(raw: unknown): RaceState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const t = (o.today && typeof o.today === 'object' ? o.today : {}) as Record<string, unknown>
  return {
    level: Number.isInteger(o.level) ? Math.min(RACE_MAX, Math.max(1, o.level as number)) : 1,
    recent: Array.isArray(o.recent) ? o.recent.map((x) => !!x).slice(-UP_OF) : [],
    taught: Array.isArray(o.taught) ? (o.taught as unknown[]).filter((x): x is number => Number.isInteger(x)) : [],
    today: {
      date: typeof t.date === 'string' ? t.date : '',
      tracks: strs(
        t.tracks,
        TRACKS.map((x) => x.id),
        TRACKS.length,
      ),
      rewards: strs(
        t.rewards,
        REWARDS.map((x) => x.id),
        REWARDS.length,
      ),
      runners: strs(t.runners, RUNNERS, 4),
    },
  }
}

/** 總共可以組出幾種棋盤（場景 × 驚喜 × 孩子的恐龍）：回報、測試用 */
export const RACE_COMBOS = TRACKS.length * REWARDS.length * RUNNERS.length
