// 躲在哪裡（T-160）的出題和升降級。只有純函式，scripts/test-where-feel.ts 直接測；畫面在 ./Where.tsx，內容在 ./data.ts。
// 題目由程式組（場景 × 大東西 × 小動物 × 位置），不照任何現成 App 的關卡。
//
// 難度（準則 LOAD-1、LOAD-5：先 2 個、熟練了 3 個、最多 4 個；答錯多就退一級）：
//   1 級：同一種小動物 2 隻，躲在兩個不同的位置（例：一隻在桌上、一隻在桌下）→ 2 選 1
//   2 級：同一種小動物 3 隻，in、on、under 各一隻 → 3 選 1
//   3 級：混合題：兩種小動物、位置也不同（貓在桌上、貓在桌下、狗在桌下…），要同時聽動物和位置 → 3～4 選 1
// 升級：連續 2 局每題都第一次就點對（自己點的，不是示範、發呆時手帶著的）；退級：一局有 2 題以上沒有第一次就對。
import { HIDERS, OBJECTS, OBJECT_IDS, PLACES, PLACE_IDS, RELS, relsOf, slotsOf, type ObjectId, type PlaceId, type Rel } from './data'

export type WhereLevel = 1 | 2 | 3
export const WHERE_MAX: WhereLevel = 3
export const WHERE_GAME = 'logic-where'
/** 一局幾題（準則 LOAD-3：3～5 題） */
export const WHERE_QS = 4
/** 連續幾局全對才升級 */
export const UP_AFTER = 2
/** 一局有幾題沒有第一次就對就退級 */
export const DOWN_AT = 2
/** 記住最近幾題的組合（場景:大東西:小動物）：新的一題不跟這幾題一樣 */
export const RECENT_SIGS = 24
/** 最近幾個場景、大東西、小動物不再出現 */
export const RECENT_PLACES = 3
export const RECENT_OBJS = 4
export const RECENT_HIDERS = 5

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

/** 一隻躲起來的小動物：躲在大東西的第幾個位置（OBJECTS[obj].slots 的 index） */
export interface Hidden {
  hider: string
  rel: Rel
  slot: number
}

export interface WhereQ {
  level: WhereLevel
  place: PlaceId
  obj: ObjectId
  hidden: Hidden[]
  /** 要找的是 hidden 的第幾隻 */
  answer: number
  /** 作答紀錄的技能：where:in、where:on、where:under */
  skill: string
  itemId: string
  /** 這一題的組合（避開最近幾題用） */
  sig: string
}

export const whereSkill = (rel: Rel) => `where:${rel}`

/** 這一級用得到的大東西：1 級要 ≥ 2 種位置；2 級要 in、on、under 都有；3 級要目標位置有 2 個空位 */
export function objectsFor(level: WhereLevel, rel: Rel): ObjectId[] {
  return OBJECT_IDS.filter((o) => {
    const rels = relsOf(o)
    if (!rels.includes(rel)) return false
    if (level === 1) return rels.length >= 2
    if (level === 2) return rels.length === 3
    return slotsOf(o, rel).length >= 2 && rels.length >= 2
  })
}

/** 放得下這個大東西的場景 */
export const placesFor = (o: ObjectId) => PLACE_IDS.filter((p) => PLACES[p].things.includes(o))

export interface WhereMemory {
  sigs: string[]
  places: string[]
  objs: string[]
  hiders: string[]
}

const slotIndex = (o: ObjectId, rel: Rel, nth: number) => {
  let k = -1
  return OBJECTS[o].slots.findIndex((s) => s.rel === rel && ++k === nth)
}

/**
 * 出一題：先決定要問哪個位置（rel），再挑放得下的大東西、場景、小動物，避開最近用過的。
 * mem 會被更新（記下這一題）。
 */
export function whereQ(level: WhereLevel, rel: Rel, mem: WhereMemory, rnd: Rnd = Math.random): WhereQ {
  const objs = objectsFor(level, rel)
  // 大東西：不在最近幾個裡（都用過了就放寬）
  let objPool = objs.filter((o) => !mem.objs.slice(-RECENT_OBJS).includes(o))
  if (!objPool.length) objPool = objs.filter((o) => o !== mem.objs[mem.objs.length - 1])
  if (!objPool.length) objPool = objs
  let obj = pick(objPool, rnd)
  let place: PlaceId = pick(placesFor(obj), rnd)
  let hider = HIDERS[0].id
  // 場景、小動物、整個組合都不跟最近的一樣（試幾次，試不到就用最後一次的）；
  // 只放得下一個場景的大東西（浴缸只在浴室）剛好那個場景才用過，就換一樣大東西
  const hs = HIDERS.filter((h) => !mem.hiders.slice(-RECENT_HIDERS).includes(h.id))
  for (let t = 0; t < 80; t++) {
    obj = pick(objPool, rnd)
    const ps = placesFor(obj)
    const freshP = ps.filter((p) => !mem.places.slice(-RECENT_PLACES).includes(p))
    place = pick(freshP.length ? freshP : ps, rnd)
    hider = pick(hs.length ? hs : HIDERS, rnd).id
    if (freshP.length && !mem.sigs.includes(`${place}:${obj}:${hider}`)) break
  }
  const rels = relsOf(obj)
  const others = shuffle(
    rels.filter((r) => r !== rel),
    rnd,
  )
  const hidden: Hidden[] = []
  const nthOf = (r: Rel) => Math.floor(rnd() * slotsOf(obj, r).length)
  if (level === 1) {
    hidden.push({ hider, rel, slot: slotIndex(obj, rel, nthOf(rel)) }, { hider, rel: others[0], slot: slotIndex(obj, others[0], nthOf(others[0])) })
  } else if (level === 2) {
    for (const r of [rel, ...others]) hidden.push({ hider, rel: r, slot: slotIndex(obj, r, nthOf(r)) })
  } else {
    // 混合題：目標 (A, rel)、同一隻動物在別的位置 (A, q)、別的動物在同一個位置 (B, rel)、空位夠就再加 (B, q)
    const q = others[0]
    const hs = HIDERS.filter((h) => h.id !== hider && !mem.hiders.slice(-2).includes(h.id))
    const other = pick(hs, rnd).id
    const [a, b] = shuffle([0, 1], rnd)
    hidden.push({ hider, rel, slot: slotIndex(obj, rel, a) }, { hider, rel: q, slot: slotIndex(obj, q, 0) }, { hider: other, rel, slot: slotIndex(obj, rel, b) })
    if (slotsOf(obj, q).length >= 2) hidden.push({ hider: other, rel: q, slot: slotIndex(obj, q, 1) })
  }
  // 畫面上的順序打亂（answer 不固定在第一個；位置本來就由 slot 決定，這裡只是 DOM 的順序）
  const order = shuffle(
    hidden.map((_, i) => i),
    rnd,
  )
  const shuffled = order.map((i) => hidden[i])
  const answer = order.indexOf(0)
  const sig = `${place}:${obj}:${hider}`
  mem.sigs = [...mem.sigs.filter((s) => s !== sig), sig].slice(-RECENT_SIGS)
  mem.places = [...mem.places, place].slice(-RECENT_PLACES)
  mem.objs = [...mem.objs, obj].slice(-RECENT_OBJS)
  mem.hiders = [...mem.hiders, hider].slice(-RECENT_HIDERS)
  return { level, place, obj, hidden: shuffled, answer, skill: whereSkill(rel), itemId: `where:${place}:${obj}:${hider}:${rel}`, sig }
}

/**
 * 一局：WHERE_QS 題，in、on、under 輪流（洗牌，第 4 題隨機），這一級放不下的位置換掉。
 * 連著兩題不會是同一個大東西、同一個場景。
 */
export function whereRound(level: WhereLevel, mem: WhereMemory, rnd: Rnd = Math.random): WhereQ[] {
  const order = [...shuffle(RELS, rnd), pick(RELS, rnd)].slice(0, WHERE_QS)
  return order.map((rel) => whereQ(level, objectsFor(level, rel).length ? rel : 'on', mem, rnd))
}

// ── 進度 ─────────────────────────────────────────────────────

export interface WhereState extends WhereMemory {
  level: WhereLevel
  /** 連續全對的局數 */
  streak: number
  /** 示範過的級數 */
  taught: number[]
}

export const WHERE_START: WhereState = { level: 1, streak: 0, taught: [], sigs: [], places: [], objs: [], hiders: [] }

/** 讀進來的東西不一定完整（壞掉、舊格式）：缺的補預設，級數夾在 1～max */
export function normalizeWhere(raw: unknown): WhereState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<WhereState>
  const level = (Number.isInteger(o.level) ? Math.min(WHERE_MAX, Math.max(1, o.level as number)) : 1) as WhereLevel
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n) : [])
  return {
    level,
    streak: Number.isInteger(o.streak) && (o.streak as number) >= 0 ? (o.streak as number) : 0,
    taught: Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : [],
    sigs: strs(o.sigs, RECENT_SIGS),
    places: strs(o.places, RECENT_PLACES),
    objs: strs(o.objs, RECENT_OBJS),
    hiders: strs(o.hiders, RECENT_HIDERS),
  }
}

/**
 * 一局玩完：counted 是自己答的題數（示範、一起做的不算），misses 是其中沒有第一次就對的題數。
 * 全對（而且自己答的至少 3 題）→ streak + 1，到 UP_AFTER 就升一級；misses ≥ DOWN_AT → 退一級。
 */
export function afterWhere(s: WhereState, r: { counted: number; misses: number }): WhereState {
  if (r.misses >= DOWN_AT) return { ...s, level: Math.max(1, s.level - 1) as WhereLevel, streak: 0 }
  if (r.counted >= WHERE_QS - 1 && r.misses === 0) {
    const streak = s.streak + 1
    if (streak >= UP_AFTER && s.level < WHERE_MAX) return { ...s, level: (s.level + 1) as WhereLevel, streak: 0 }
    return { ...s, streak }
  }
  return { ...s, streak: 0 }
}

/** 總共有幾種組合（場景 × 放得下的大東西 × 小動物 × 那個大東西的位置）：回報、測試用 */
export function comboCount() {
  let n = 0
  for (const p of PLACE_IDS) for (const o of PLACES[p].things) n += HIDERS.length * relsOf(o).length
  return n
}
