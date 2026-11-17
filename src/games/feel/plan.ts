// 心情臉（T-160）的出題和升降級。只有純函式，scripts/test-where-feel.ts 直接測；畫面在 ./Feel.tsx。
// 一局 4 個情境，四種心情各一個（順序打亂），不跟最近幾次的情境一樣；主角每題換一隻，不跟最近幾隻一樣。
//
// 難度（準則 LOAD-1：先 2 個、熟練了才 3～4 個）：
//   1 級：2 選 1，兩張臉差很多（開心 vs 難過／生氣／害怕）
//   2 級：3 選 1（開心、加上兩種不開心的）
//   3 級：4 選 1（四種都有）
// 不評分、不說錯：選了別的，溫柔地說出答案（./Feel.tsx）。升降級照躲在哪裡同一套（連續 2 局全對升、一局 ≥ 2 題沒對退）。
import { EMOS, SITUATIONS, SPECIES_IDS, type Emo, type Sit, type SpeciesId } from './data'
import { WHY_START, normalizeWhy, type WhyState } from './why-plan'

export type FeelLevel = 1 | 2 | 3
export const FEEL_MAX: FeelLevel = 3
export const FEEL_GAME = 'logic-feel'
export const FEEL_QS = 4
export const UP_AFTER = 2
export const DOWN_AT = 2
/** 最近幾個情境不再出現（每種心情 15 個，一局各用 1 個：最近 4 局都不重複） */
export const RECENT_SITS = 16
export const RECENT_HEROES = 6

type Rnd = () => number
const pick = <T,>(a: readonly T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length) % a.length]
function shuffle<T>(a: readonly T[], rnd: Rnd): T[] {
  const o = [...a]
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[o[i], o[j]] = [o[j], o[i]]
  }
  return o
}

export interface FeelQ {
  level: FeelLevel
  sit: Sit
  hero: SpeciesId
  friend: SpeciesId
  /** 選項（臉），順序就是畫面上的順序 */
  options: Emo[]
  answer: Emo
  skill: string
  itemId: string
}

export const feelSkill = (emo: Emo) => `feel:${emo}`

/** 這一級的選項：1 級兩張差很多的臉，2 級三張，3 級四張；順序打亂 */
export function feelOptions(level: FeelLevel, answer: Emo, rnd: Rnd = Math.random): Emo[] {
  const neg = EMOS.filter((e) => e !== 'happy')
  let opts: Emo[]
  if (level === 1) opts = answer === 'happy' ? ['happy', pick(neg, rnd)] : [answer, 'happy']
  else if (level === 2) opts = answer === 'happy' ? ['happy', ...shuffle(neg, rnd).slice(0, 2)] : [answer, 'happy', pick(neg.filter((e) => e !== answer), rnd)]
  else opts = [...EMOS]
  return shuffle(opts, rnd)
}

export interface FeelMemory {
  sits: string[]
  heroes: string[]
}

export function feelQ(level: FeelLevel, emo: Emo, mem: FeelMemory, rnd: Rnd = Math.random): FeelQ {
  const all = SITUATIONS.filter((s) => s.emo === emo)
  let pool = all.filter((s) => !mem.sits.includes(s.id))
  if (!pool.length) pool = all.filter((s) => s.id !== mem.sits[mem.sits.length - 1])
  const sit = pick(pool, rnd)
  let heroes = SPECIES_IDS.filter((h) => !mem.heroes.includes(h))
  if (!heroes.length) heroes = [...SPECIES_IDS]
  const hero = pick(heroes, rnd)
  const friend = pick(
    SPECIES_IDS.filter((f) => f !== hero),
    rnd,
  )
  mem.sits = [...mem.sits.filter((x) => x !== sit.id), sit.id].slice(-RECENT_SITS)
  mem.heroes = [...mem.heroes, hero].slice(-RECENT_HEROES)
  return { level, sit, hero, friend, options: feelOptions(level, emo, rnd), answer: emo, skill: feelSkill(emo), itemId: `feel:${sit.id}:${hero}` }
}

/** 一局：四種心情各一題，順序打亂（第一題不會是上一局的最後一題那種心情以外，沒有其他限制） */
export function feelRound(level: FeelLevel, mem: FeelMemory, rnd: Rnd = Math.random): FeelQ[] {
  return shuffle(EMOS, rnd)
    .slice(0, FEEL_QS)
    .map((e) => feelQ(level, e, mem, rnd))
}

// ── 進度 ─────────────────────────────────────────────────────

export interface FeelState extends FeelMemory {
  level: FeelLevel
  streak: number
  taught: number[]
  /** T-164：「為什麼」那一層開了沒（原本的玩熟練了才開，開了就一直開著）、那一層的進度（./why-plan.ts） */
  whyOpen: boolean
  why: WhyState
}

export const FEEL_START: FeelState = { level: 1, streak: 0, taught: [], sits: [], heroes: [], whyOpen: false, why: WHY_START }

export function normalizeFeel(raw: unknown): FeelState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<FeelState>
  const level = (Number.isInteger(o.level) ? Math.min(FEEL_MAX, Math.max(1, o.level as number)) : 1) as FeelLevel
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n) : [])
  return {
    level,
    streak: Number.isInteger(o.streak) && (o.streak as number) >= 0 ? (o.streak as number) : 0,
    taught: Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : [],
    sits: strs(o.sits, RECENT_SITS),
    heroes: strs(o.heroes, RECENT_HEROES),
    whyOpen: o.whyOpen === true,
    why: normalizeWhy(o.why),
  }
}

/** T-164：原本的心情臉玩熟練了＝最高一級（4 張臉）連續 UP_AFTER 局全對。熟練了就開「為什麼」那一層 */
export const feelMastered = (s: FeelState) => s.level === FEEL_MAX && s.streak >= UP_AFTER

/** 一局原本的玩法玩完以後：熟練了就把「為什麼」打開（已經開了就不動） */
export const openWhyIfMastered = (s: FeelState): FeelState => (s.whyOpen || !feelMastered(s) ? s : { ...s, whyOpen: true })

/** 一局玩完：全對（自己答的至少 3 題）→ streak + 1，到 UP_AFTER 升一級；≥ DOWN_AT 題沒對 → 退一級 */
export function afterFeel(s: FeelState, r: { counted: number; misses: number }): FeelState {
  if (r.misses >= DOWN_AT) return { ...s, level: Math.max(1, s.level - 1) as FeelLevel, streak: 0 }
  if (r.counted >= FEEL_QS - 1 && r.misses === 0) {
    const streak = s.streak + 1
    if (streak >= UP_AFTER && s.level < FEEL_MAX) return { ...s, level: (s.level + 1) as FeelLevel, streak: 0 }
    return { ...s, streak }
  }
  return { ...s, streak: 0 }
}
