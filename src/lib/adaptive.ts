import { db, type GameLevel, type Skill } from './db'
import { LETTER_GROUPS } from '../content/letters'
import { weightedPick } from './random'

// 技能熟練度與遊戲難度都很小，開機時整份載入記憶體，題目產生器就能同步取用
const skills = new Map<string, Skill>()
const levels = new Map<string, GameLevel>()

export async function loadAdaptive() {
  ;(await db.skills.toArray()).forEach((s) => skills.set(s.key, s))
  ;(await db.levels.toArray()).forEach((l) => levels.set(l.key, l))
}

export function skill(key: string): Skill {
  return skills.get(key) ?? { key, box: 0, seen: 0, firstTry: 0, streak: 0, lastTs: 0 }
}

/** 熟練度分 0–5 格：第一次就答對往上一格，答錯退一格 */
export function recordSkill(key: string, firstTry: boolean) {
  const s = { ...skill(key) }
  s.seen++
  s.lastTs = Date.now()
  if (firstTry) {
    s.firstTry++
    s.streak++
    s.box = Math.min(5, s.box + 1)
  } else {
    s.streak = 0
    s.box = Math.max(0, s.box - 1)
  }
  skills.set(key, s)
  void db.skills.put(s)
}

export const mastered = (key: string) => skill(key).box >= 3

export function level(game: string): number {
  return levels.get(game)?.level ?? 1
}

/**
 * 維持約七到八成的答對率：連續 3 題第一次就答對升一級，連續 2 題沒答對降一級。
 * 回傳是否升降級，讓畫面可以給一句鼓勵。
 */
export function reportLevel(game: string, firstTry: boolean, maxLevel: number): 'up' | 'down' | null {
  const l = { ...(levels.get(game) ?? { key: game, level: 1, up: 0, down: 0, plays: 0, lastTs: 0 }) }
  let change: 'up' | 'down' | null = null
  if (firstTry) {
    l.up++
    l.down = 0
    if (l.up >= 3 && l.level < maxLevel) {
      l.level++
      l.up = 0
      change = 'up'
    }
  } else {
    l.down++
    l.up = 0
    if (l.down >= 2 && l.level > 1) {
      l.level--
      l.down = 0
      change = 'down'
    }
  }
  levels.set(game, l)
  void db.levels.put(l)
  return change
}

export function markPlayed(game: string) {
  const l = { ...(levels.get(game) ?? { key: game, level: 1, up: 0, down: 0, plays: 0, lastTs: 0 }) }
  l.plays++
  l.lastTs = Date.now()
  levels.set(game, l)
  void db.levels.put(l)
}

export const lastPlayed = (game: string) => levels.get(game)?.lastTs ?? 0

/** 越不熟、越久沒練的越容易被選中；並避開剛剛才出過的 */
export function pickTarget<T>(items: readonly T[], keyOf: (t: T) => string, avoid: T[] = []): T {
  const pool = items.length > avoid.length ? items.filter((t) => !avoid.includes(t)) : items
  const now = Date.now()
  return weightedPick(pool, (t) => {
    const s = skill(keyOf(t))
    const staleness = s.lastTs ? Math.min(3, (now - s.lastTs) / 86_400_000) : 2
    return Math.pow(6 - s.box, 1.6) + staleness
  })
}

const ratio = (keys: string[]) => keys.filter(mastered).length / keys.length

/** 字母一組一組解鎖：前面每一組都有八成熟了才開下一組 */
export function unlockedLetters(): string[] {
  const out: string[] = []
  for (const g of LETTER_GROUPS) {
    out.push(...g)
    if (ratio([...g].map((l) => `letter:${l}`)) < 0.8) break
  }
  return out
}

/** 數字從 1–5 開始，熟了才延伸到 10、再到 20 */
export function unlockedNumbers(): number {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `num:${a + i}`)
  if (ratio(range(1, 5)) < 0.8) return 5
  if (ratio(range(6, 10)) < 0.8) return 10
  return 20
}
