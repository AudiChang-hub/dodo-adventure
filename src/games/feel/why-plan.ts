// 心情臉「為什麼」那一層（T-164，指引 SE-1 的 4 歲：說出情緒的原因）的出題和升降級。只有純函式，scripts/test-order-listen.ts 直接測；畫面在 ./Why.tsx。
// 原本的心情臉（3 歲）玩熟練了才開：最高一級（4 張臉）連續 2 局全對（./plan.ts 的 feelMastered）。原本的玩法完全不變。
//
// 兩種問法：
//   看情境選心情（face）：情境照常演，主角的臉一直不變（還沒答之前看不到心情），問 How does Bunny feel? → 從「發生什麼事」想心情。
//   看臉選情境（cause）：主角的臉已經是那個心情，問 Why is Bunny sad? → 幾張情境的小圖（主角的臉都還沒變）選一張。
// 難度（準則 LOAD-1：先 2 個、熟練了才 3 個）：
//   1 級：看情境選心情，2 選 1（兩種差很多的心情）
//   2 級：看臉選情境，2 選 1
//   3 級：兩種問法輪流，3 選 1
// 心情多一種驚訝（surprised）。驚訝跟開心、害怕很像（都可能張大嘴巴），所以驚訝不會跟開心、害怕放在同一題的選項裡。
// 升降級跟原本一樣：連續 2 局全對升、一局 ≥ 2 題沒對退。不評分、不說錯。
import { MOODS, SPECIES_IDS, WHY_SITS, type Mood, type Sit, type SpeciesId } from './data'

export type WhyLevel = 1 | 2 | 3
export const WHY_MAX: WhyLevel = 3
export const WHY_QS = 4
export type WhyMode = 'face' | 'cause'

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

/** 這兩種心情能不能放在同一題（驚訝不跟開心、害怕一起） */
export const canPair = (a: Mood, b: Mood) => a !== b && !((a === 'surprised' || b === 'surprised') && [a, b].some((m) => m === 'happy' || m === 'scared'))

/** 2 選 1 時跟答案差很多的心情：開心配不開心的，不開心的配開心；驚訝配難過或生氣 */
export function farFrom(m: Mood, rnd: Rnd): Mood {
  if (m === 'happy') return pick(['sad', 'angry', 'scared'] as Mood[], rnd)
  if (m === 'surprised') return pick(['sad', 'angry'] as Mood[], rnd)
  return 'happy'
}

/** 這一題的心情選項（答案在裡面、彼此都能放一起），順序打亂 */
export function whyMoods(level: WhyLevel, answer: Mood, rnd: Rnd = Math.random): Mood[] {
  if (level < 3) return shuffle([answer, farFrom(answer, rnd)], rnd)
  const out: Mood[] = [answer]
  for (const m of shuffle(MOODS, rnd)) {
    if (out.length >= 3) break
    if (out.every((o) => canPair(o, m))) out.push(m)
  }
  return shuffle(out, rnd)
}

export interface WhyQ {
  level: WhyLevel
  mode: WhyMode
  hero: SpeciesId
  friend: SpeciesId
  answer: Mood
  /** 答案的情境 */
  sit: Sit
  /** 看情境選心情：心情選項；看臉選情境：每張小圖的心情（跟 sits 同順序） */
  moods: Mood[]
  /** 看臉選情境的小圖（答案也在裡面）；看情境選心情只有答案那一個 */
  sits: Sit[]
  skill: string
  itemId: string
}

export const whySkill = (mode: WhyMode) => `feel:why-${mode}`

export interface WhyMemory {
  sits: string[]
  heroes: string[]
}
export const WHY_RECENT_SITS = 24
export const WHY_RECENT_HEROES = 6

function sitFor(m: Mood, mem: WhyMemory, avoid: string[], rnd: Rnd): Sit {
  const all = WHY_SITS.filter((s) => s.emo === m && !avoid.includes(s.id))
  let pool = all.filter((s) => !mem.sits.includes(s.id))
  if (!pool.length) pool = all
  const sit = pick(pool, rnd)
  mem.sits = [...mem.sits.filter((x) => x !== sit.id), sit.id].slice(-WHY_RECENT_SITS)
  return sit
}

export function whyQ(level: WhyLevel, mode: WhyMode, answer: Mood, mem: WhyMemory, rnd: Rnd = Math.random): WhyQ {
  let heroes = SPECIES_IDS.filter((h) => !mem.heroes.includes(h))
  if (!heroes.length) heroes = [...SPECIES_IDS]
  const hero = pick(heroes, rnd)
  mem.heroes = [...mem.heroes, hero].slice(-WHY_RECENT_HEROES)
  const friend = pick(
    SPECIES_IDS.filter((f) => f !== hero),
    rnd,
  )
  const moods = whyMoods(level, answer, rnd)
  const sit = sitFor(answer, mem, [], rnd)
  const sits = mode === 'cause' ? moods.map((m) => (m === answer ? sit : sitFor(m, mem, [sit.id], rnd))) : [sit]
  return { level, mode, hero, friend, answer, sit, moods, sits, skill: whySkill(mode), itemId: `why:${mode}:${sit.id}:${hero}` }
}

/** 一局 4 題：五種心情挑四種（順序打亂）；1 級都是看情境選心情、2 級都是看臉選情境、3 級兩種輪流（從哪一種開始隨機） */
export function whyRound(level: WhyLevel, mem: WhyMemory, rnd: Rnd = Math.random): WhyQ[] {
  const first: WhyMode = rnd() < 0.5 ? 'face' : 'cause'
  const modeAt = (i: number): WhyMode => (level === 1 ? 'face' : level === 2 ? 'cause' : i % 2 === 0 ? first : first === 'face' ? 'cause' : 'face')
  return shuffle(MOODS, rnd)
    .slice(0, WHY_QS)
    .map((m, i) => whyQ(level, modeAt(i), m, mem, rnd))
}

// ── 進度（存在 feel.progress 的 why 裡，./plan.ts） ──

export interface WhyState extends WhyMemory {
  level: WhyLevel
  streak: number
  taught: number[]
}
export const WHY_START: WhyState = { level: 1, streak: 0, taught: [], sits: [], heroes: [] }

export function normalizeWhy(raw: unknown): WhyState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<WhyState>
  const level = (Number.isInteger(o.level) ? Math.min(WHY_MAX, Math.max(1, o.level as number)) : 1) as WhyLevel
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n) : [])
  return {
    level,
    streak: Number.isInteger(o.streak) && (o.streak as number) >= 0 ? (o.streak as number) : 0,
    taught: Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : [],
    sits: strs(o.sits, WHY_RECENT_SITS),
    heroes: strs(o.heroes, WHY_RECENT_HEROES),
  }
}

export const WHY_UP_AFTER = 2
export const WHY_DOWN_AT = 2
/** 一局玩完：全對（自己答的至少 3 題）→ streak + 1，到 2 升一級；≥ 2 題沒對 → 退一級（最低 1 級，不會退回原本的玩法） */
export function afterWhy(s: WhyState, r: { counted: number; misses: number }): WhyState {
  if (r.misses >= WHY_DOWN_AT) return { ...s, level: Math.max(1, s.level - 1) as WhyLevel, streak: 0 }
  if (r.counted >= WHY_QS - 1 && r.misses === 0) {
    const streak = s.streak + 1
    if (streak >= WHY_UP_AFTER && s.level < WHY_MAX) return { ...s, level: (s.level + 1) as WhyLevel, streak: 0 }
    return { ...s, streak }
  }
  return { ...s, streak: 0 }
}
