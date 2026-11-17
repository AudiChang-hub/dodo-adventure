// 翻翻牌找一樣的（T-160，家長 2026-11-17 要求；指引 CG-3 記憶、CG-1 找一樣的）：出題、升降級。純函式，scripts/test-match.ts 直接測；畫面在 ./Memory.tsx。
// 牌蓋著，翻兩張：一樣的配成一對留下來，不一樣的停一下再慢慢蓋回去。翻開時念圖的英文名字。
// 張數：4 → 6 → 8 → 10 → 12（2～6 對），熟練了才加。每一局一個主題（../match/catalog.ts，22 個主題、400 多種圖），牌背 10 種（./backs.tsx）。
import { stepLevel, type LevelState } from '../logic/sort-plan'
import { MATCH_PICS, MATCH_THEMES, type MatchPic, type MatchThemeId } from '../match/catalog'

export type MemoryLevel = 1 | 2 | 3 | 4 | 5
export const MEMORY_MAX: MemoryLevel = 5
/** 每一級幾對（牌是兩倍） */
export const PAIRS: Record<MemoryLevel, number> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 }
/** 每一級牌怎麼排（平板橫向）：4 → 2×2、6 → 3×2、8 → 4×2、10 → 5×2、12 → 6×2（排成兩排牌比較大；直的螢幕畫面自己改排） */
export const MEMORY_GRID: Record<MemoryLevel, { cols: number; rows: number }> = { 1: { cols: 2, rows: 2 }, 2: { cols: 3, rows: 2 }, 3: { cols: 4, rows: 2 }, 4: { cols: 5, rows: 2 }, 5: { cols: 6, rows: 2 } }
/** 作答紀錄的技能：memory:4、memory:6…memory:12 */
export const memorySkill = (level: MemoryLevel) => `memory:${PAIRS[level] * 2}`
export const MEMORY_GAME = 'logic-memory'

/** 牌背的樣式數（./backs.tsx 畫） */
export const BACK_COUNT = 10
/** 記住最近幾局的主題、牌背：新的一局不挑一樣的 */
export const RECENT_THEMES = 4
export const RECENT_BACKS = 3
/** 記住最近翻過的圖：新的一局盡量不出現 */
export const RECENT_PICS = 30

/**
 * 「記得」的失誤（slip）：翻開第一張時，它的另一半之前已經翻開看過了，第二張卻翻錯。剛開始兩張都沒看過的翻錯是在找、不算。
 * 一局順利：slip ≤ 這個數、沒有手帶著翻（第 3 次 slip 同一對）。
 */
export const okSlips = (level: MemoryLevel) => Math.max(1, Math.floor(PAIRS[level] / 2))
/** 升級：連續幾局順利 */
export const UP_AFTER = 2

type Rnd = () => number

const shuffle = <T,>(a: readonly T[], rnd: Rnd): T[] => {
  const o = [...a]
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[o[i], o[j]] = [o[j], o[i]]
  }
  return o
}

/** 這個主題的圖（同一組長得像的、英文名字一樣的，一局只留一樣） */
export const themePics = (theme: MatchThemeId) => MATCH_PICS.filter((p) => p.theme === theme)

/** 挑主題：不在最近幾局裡 */
export function pickTheme(recent: readonly string[], rnd: Rnd = Math.random): MatchThemeId {
  const last = recent.slice(-RECENT_THEMES)
  let pool = MATCH_THEMES.filter((t) => !last.includes(t.id))
  if (!pool.length) pool = MATCH_THEMES.filter((t) => t.id !== recent[recent.length - 1])
  return pool[Math.floor(rnd() * pool.length) % pool.length].id
}

/** 挑 n 樣：同一個主題、不在最近翻過的裡（不夠才用）、長得像的一組只挑一樣、名字不重複 */
export function pickPics(theme: MatchThemeId, n: number, recent: readonly string[], rnd: Rnd = Math.random): MatchPic[] {
  const all = themePics(theme)
  const fresh = shuffle(all.filter((p) => !recent.includes(p.id)), rnd)
  const used = shuffle(all.filter((p) => recent.includes(p.id)), rnd)
  const out: MatchPic[] = []
  for (const p of [...fresh, ...used]) {
    if (out.length >= n) break
    if (out.some((q) => q.en === p.en || (p.look && q.look === p.look))) continue
    out.push(p)
  }
  return out
}

/** 挑牌背：不跟最近幾局一樣 */
export function pickBack(recent: readonly number[], rnd: Rnd = Math.random): number {
  const last = recent.slice(-RECENT_BACKS)
  const pool = Array.from({ length: BACK_COUNT }, (_, i) => i).filter((i) => !last.includes(i))
  return pool[Math.floor(rnd() * pool.length) % pool.length]
}

export interface MemoryCard {
  /** 這張牌的位置（左上 0，往右、往下數） */
  slot: number
  pic: string
}

export interface MemoryRound {
  level: MemoryLevel
  theme: MatchThemeId
  back: number
  cols: number
  rows: number
  /** 第 i 個位置放的圖（每樣兩張） */
  cards: string[]
}

/** 牌的順序：洗牌；每一對都剛好左右相鄰（一看就知道規律）的話重洗 */
export function deal(pics: readonly string[], rnd: Rnd = Math.random): string[] {
  const deck = pics.flatMap((p) => [p, p])
  for (let k = 0; k < 50; k++) {
    const o = shuffle(deck, rnd)
    // 每一對都剛好左右相鄰（同一列）：重洗
    const allNext = pics.every((p) => {
      const i = o.indexOf(p)
      return o[i + 1] === p
    })
    if (!allNext) return o
  }
  return shuffle(deck, rnd)
}

export function memoryRound(level: MemoryLevel, s: Pick<MemoryState, 'themes' | 'backs' | 'pics'>, rnd: Rnd = Math.random): MemoryRound {
  const theme = pickTheme(s.themes, rnd)
  const pics = pickPics(theme, PAIRS[level], s.pics, rnd)
  const { cols, rows } = MEMORY_GRID[level]
  return { level, theme, back: pickBack(s.backs, rnd), cols, rows, cards: deal(pics.map((p) => p.id), rnd) }
}

// ── 進度 ─────────────────────────────────────────────────────

export interface MemoryState extends LevelState {
  /** 這一級連續順利幾局 */
  streak: number
  /** 最近的主題、牌背、圖（新的在後面） */
  themes: string[]
  backs: number[]
  pics: string[]
}

export function normalizeMemory(raw: unknown): MemoryState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<MemoryState>
  const level = Number.isInteger(o.level) ? Math.min(MEMORY_MAX, Math.max(1, o.level as number)) : 1
  const recent = Array.isArray(o.recent) ? o.recent.filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date, ok: !!x.ok })) : []
  const taught = Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : []
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n) : [])
  const backs = Array.isArray(o.backs) ? o.backs.filter((x) => Number.isInteger(x) && x >= 0 && x < BACK_COUNT).slice(-RECENT_BACKS) : []
  const streak = Number.isInteger(o.streak) && (o.streak as number) > 0 ? (o.streak as number) : 0
  return { level, recent, taught, streak, themes: strs(o.themes, RECENT_THEMES), backs, pics: strs(o.pics, RECENT_PICS) }
}

/**
 * 玩完一局：記住主題、牌背、圖；照結果升降級。
 * - counted false（第一次的示範局、發呆時手帶著翻的）：不算升降級。
 * - 連續 UP_AFTER 局順利：升一級（最多 MEMORY_MAX）。
 * - 退級照邏輯遊戲同一套（sort-plan 的 stepLevel：最近 6 局順利 ≤ 3 局退一級）。
 */
export function afterMemory(s: MemoryState, r: { round: MemoryRound; date: string; slips: number; shown: boolean; counted: boolean }): MemoryState {
  const ids = [...new Set(r.round.cards)]
  const base = {
    ...s,
    themes: [...s.themes, r.round.theme].slice(-RECENT_THEMES),
    backs: [...s.backs, r.round.back].slice(-RECENT_BACKS),
    pics: [...s.pics.filter((p) => !ids.includes(p)), ...ids].slice(-RECENT_PICS),
  }
  if (!r.counted) return base
  const ok = r.slips <= okSlips(r.round.level) && !r.shown
  const streak = ok ? s.streak + 1 : 0
  if (ok && streak >= UP_AFTER && s.level < MEMORY_MAX) return { ...base, level: s.level + 1, recent: [], streak: 0 }
  const lv = stepLevel(s, { date: r.date, first: ok, counted: true }, MEMORY_MAX)
  return { ...base, level: lv.level, recent: lv.recent, streak: lv.level !== s.level ? 0 : streak }
}
