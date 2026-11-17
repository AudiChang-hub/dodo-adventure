// 蹺蹺板比輕重（家長 2026-11-17，給 4 歲左右玩中學；數學「比較」MA-7、科學「猜了再看」）的出題和升降級。
// 只有純函式，scripts/test-sort-seesaw.ts 直接測；畫面在 ./Seesaw.tsx，東西在 ./data.ts。題目由程式組，不照任何現成 App 的關卡。
//
// 難度（從 3 歲做得到的開始，熟練了自動升級）：
//   1 級：兩樣東西差很多（重量差 ≥ 4 級），重的也比較大 → 猜哪一邊會往下，再看蹺蹺板
//   2 級：兩樣東西差得少一點（2～3 級），重的不一定比較大（一樣大也有）
//   3 級：三樣東西從輕排到重（重的也比較大）
//   4 級：「大的不一定比較重」：一局 4 題裡 2 題是大而輕對小而重（氣球和石頭），另外 2 題是一般的（不能只挑小的）
//   5 級：三樣東西從輕排到重，裡面有大而輕或小而重的
// 升級：連續 2 局每題都第一次就對（自己答的，不是示範、一起做、手帶著的）；退級：一局有 2 題以上沒有第一次就對。
// 同一天不重複：今天出過的組合（兩樣、三樣）不再出；最近幾題用過的東西也先避開。
import { ITEM, ITEMS, type Item } from './data'

export type SeesawLevel = 1 | 2 | 3 | 4 | 5
export const SEESAW_MAX: SeesawLevel = 5
export const SEESAW_GAME = 'logic-seesaw'
/** 一局幾題：猜哪邊重 4 題、排輕重 3 題（準則 LOAD-3：3～5 題） */
export const PAIR_QS = 4
export const ORDER_QS = 3
/** 連續幾局全對才升級；一局有幾題沒有第一次就對就退級 */
export const UP_AFTER = 2
export const DOWN_AT = 2
/** 最近幾題用過的東西先避開 */
export const RECENT_ITEMS = 10
/** 畫多大：size 1～5 → 場景裡的大小（./Seesaw.tsx，1000×600 的場景） */
export const SIZE_PX = (size: number) => 74 + (size - 1) * 27
/** 「大的不一定比較重」：輕的畫成最大、重的畫成最小 */
export const TRICK_BIG = 5
export const TRICK_SMALL = 1.4

export const isOrderLevel = (l: SeesawLevel) => l === 3 || l === 5
export const seesawSkill = (l: SeesawLevel) => `seesaw:${l}`

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

/** 一個放上去的東西：畫多大 */
export interface Placed {
  id: string
  size: number
}

/** 猜哪一邊往下 */
export interface PairQ {
  kind: 'pair'
  level: SeesawLevel
  /** 左邊、右邊 */
  left: Placed
  right: Placed
  /** 重的在哪一邊 */
  heavy: 'left' | 'right'
  /** 大而輕對小而重 */
  trick: boolean
  sig: string
  itemId: string
}
/** 三樣東西從輕排到重 */
export interface OrderQ {
  kind: 'order'
  level: SeesawLevel
  /** 桌上的樣子（打亂的） */
  items: Placed[]
  /** 從輕到重的 id */
  answer: string[]
  trick: boolean
  sig: string
  itemId: string
}
export type SeesawQ = PairQ | OrderQ

const sigOf = (ids: string[]) => [...ids].sort().join('+')

// ── 每一級的題庫（組合都先算好） ──

const pairs: [Item, Item][] = ITEMS.flatMap((a, i) => ITEMS.slice(i + 1).map((b) => (a.w < b.w ? [a, b] : [b, a]) as [Item, Item])).filter(([a, b]) => a.w !== b.w)
/** 1 級：差 ≥ 4 級、重的比較大（兩個線索都對） */
export const POOL1 = pairs.filter(([l, h]) => h.w - l.w >= 4 && h.size > l.size)
/** 2 級（4 級的一般題）：差 2～3 級、重的不比輕的小 */
export const POOL2 = pairs.filter(([l, h]) => h.w - l.w >= 2 && h.w - l.w <= 3 && h.size >= l.size)
/** 4 級：大而輕對小而重，差 ≥ 2 級 */
export const POOL_TRICK = pairs.filter(([l, h]) => l.big && h.small && h.w - l.w >= 2)

const triples: [Item, Item, Item][] = []
{
  const byW = [...ITEMS].sort((a, b) => a.w - b.w)
  for (let i = 0; i < byW.length; i++)
    for (let j = i + 1; j < byW.length; j++)
      for (let k = j + 1; k < byW.length; k++) {
        const [a, b, c] = [byW[i], byW[j], byW[k]]
        if (b.w - a.w >= 2 && c.w - b.w >= 2) triples.push([a, b, c])
      }
}
/** 3 級：三樣差 ≥ 2 級，越重越大（跟著大小排也對） */
export const POOL3 = triples.filter(([a, b, c]) => a.size < b.size && b.size < c.size && !a.big && !c.small)
/** 5 級：三樣差 ≥ 2 級，最輕的是大而輕的（畫最大）或最重的是小而重的（畫最小）：照大小排會錯 */
export const POOL5 = triples.filter(([a, , c]) => a.big || c.small)

/** 每一級的題目有幾種（回報、測試用） */
export const poolSizes = () => ({ 1: POOL1.length, 2: POOL2.length, 3: POOL3.length, 4: POOL_TRICK.length, 5: POOL5.length })

/** 記著今天出過的組合、最近用過的東西 */
export interface SeesawMemory {
  date: string
  used: string[]
  recent: string[]
}

/** 從題庫挑一組：今天沒出過、東西最近沒用過、這一局還沒出現；挑不到就放寬（先放寬最近的東西，再放寬今天出過的） */
function choose<T extends Item[]>(pool: T[], mem: SeesawMemory, rnd: Rnd, also: Set<string>): T {
  const fresh = (x: T) => !mem.used.includes(sigOf(x.map((i) => i.id)))
  const unseen = (x: T) => x.every((i) => !mem.recent.includes(i.id))
  const notHere = (x: T) => x.every((i) => !also.has(i.id))
  // 同一局不會有同一樣東西兩次（除非題庫真的不夠）
  const tiers = [pool.filter((x) => fresh(x) && unseen(x) && notHere(x)), pool.filter((x) => fresh(x) && notHere(x)), pool.filter(notHere), pool]
  const from = tiers.find((t) => t.length)!
  return pick(from, rnd)
}

function remember(mem: SeesawMemory, ids: string[]) {
  mem.used = [...mem.used, sigOf(ids)].slice(-400)
  mem.recent = [...mem.recent, ...ids].slice(-RECENT_ITEMS)
}

function pairQ(level: SeesawLevel, [l, h]: [Item, Item], trick: boolean, heavy: 'left' | 'right'): PairQ {
  const light: Placed = { id: l.id, size: trick ? TRICK_BIG : l.size }
  const hv: Placed = { id: h.id, size: trick ? TRICK_SMALL : h.size }
  const [left, right] = heavy === 'left' ? [hv, light] : [light, hv]
  return { kind: 'pair', level, left, right, heavy, trick, sig: sigOf([l.id, h.id]), itemId: `seesaw:${l.id}:${h.id}` }
}

function orderQ(level: SeesawLevel, t: [Item, Item, Item], rnd: Rnd): OrderQ {
  const [a, b, c] = t
  const placed: Placed[] = [
    { id: a.id, size: level === 5 && a.big ? TRICK_BIG : a.size },
    { id: b.id, size: b.size },
    { id: c.id, size: level === 5 && c.small ? TRICK_SMALL : c.size },
  ]
  // 桌上的順序打亂，但不剛好是從輕到重（不然不用想）
  let items = shuffle(placed, rnd)
  for (let k = 0; k < 10 && items.every((x, i) => x.id === placed[i].id); k++) items = shuffle(placed, rnd)
  if (items.every((x, i) => x.id === placed[i].id)) items = [placed[1], placed[0], placed[2]]
  return { kind: 'order', level, items, answer: [a.id, b.id, c.id], trick: level === 5, sig: sigOf([a.id, b.id, c.id]), itemId: `seesaw:${a.id}:${b.id}:${c.id}` }
}

/** 重的那一邊：隨機，但同一邊不連 3 次（不會變成一直點同一邊） */
function sides(n: number, rnd: Rnd): ('left' | 'right')[] {
  for (let k = 0; k < 20; k++) {
    const o = Array.from({ length: n }, () => (rnd() < 0.5 ? 'left' : 'right') as 'left' | 'right')
    if (!o.some((x, i) => i >= 2 && o[i - 1] === x && o[i - 2] === x) && o.includes('left') && o.includes('right')) return o
  }
  return Array.from({ length: n }, (_, i) => (i % 2 ? 'left' : 'right'))
}

/**
 * 出一局。mem 會被更新（記下這一局的組合、東西）。同一局不會有同一樣東西出現兩次。
 * firstTrick：4 級第一次（要示範）時，第一題一定是大而輕對小而重。
 */
export function seesawRound(level: SeesawLevel, mem: SeesawMemory, rnd: Rnd = Math.random, firstTrick = false): SeesawQ[] {
  const inRound = new Set<string>()
  const take = <T extends Item[]>(x: T) => {
    for (const i of x) inRound.add(i.id)
    remember(
      mem,
      x.map((i) => i.id),
    )
    return x
  }
  if (isOrderLevel(level)) {
    const pool = level === 3 ? POOL3 : POOL5
    return Array.from({ length: ORDER_QS }, () => orderQ(level, take(choose(pool, mem, rnd, inRound)), rnd))
  }
  const sd = sides(PAIR_QS, rnd)
  // 4 級：2 題大而輕對小而重、2 題一般的，順序打亂（第一次示範時第一題是大而輕對小而重）
  const tricks = level === 4 ? shuffle([true, true, false, false], rnd) : [false, false, false, false]
  if (level === 4 && firstTrick && !tricks[0]) {
    const j = tricks.indexOf(true)
    ;[tricks[0], tricks[j]] = [tricks[j], tricks[0]]
  }
  return tricks.map((trick, i) => {
    const pool = trick ? POOL_TRICK : level === 1 ? POOL1 : POOL2
    return pairQ(level, take(choose(pool, mem, rnd, inRound)), trick, sd[i])
  })
}

/** 題目裡比較重的那一樣（猜哪邊）；排輕重的最後一樣 */
export const heavyOf = (q: PairQ) => (q.heavy === 'left' ? q.left.id : q.right.id)
export const weightOf = (id: string) => ITEM[id]?.w ?? 0

// ── 進度 ─────────────────────────────────────────────────────

export interface SeesawState extends SeesawMemory {
  level: SeesawLevel
  /** 連續全對的局數 */
  streak: number
  /** 示範過的級數 */
  taught: number[]
}

export const SEESAW_START: SeesawState = { level: 1, streak: 0, taught: [], date: '', used: [], recent: [] }

/** 讀進來的東西不一定完整（壞掉、舊格式）：缺的補預設，級數夾在 1～max；換日了就清掉今天出過的 */
export function normalizeSeesaw(raw: unknown, today: string): SeesawState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<SeesawState>
  const level = (Number.isInteger(o.level) ? Math.min(SEESAW_MAX, Math.max(1, o.level as number)) : 1) as SeesawLevel
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n) : [])
  const sameDay = o.date === today
  return {
    level,
    streak: Number.isInteger(o.streak) && (o.streak as number) >= 0 ? (o.streak as number) : 0,
    taught: Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : [],
    date: today,
    used: sameDay ? strs(o.used, 400) : [],
    recent: strs(o.recent, RECENT_ITEMS),
  }
}

/**
 * 一局玩完：counted 是自己答的題數（示範、一起做、手帶著的不算），misses 是其中沒有第一次就對的題數。
 * 全對（而且自己答的至少 一局的題數 − 1）→ streak + 1，到 UP_AFTER 就升一級；misses ≥ DOWN_AT → 退一級。
 */
export function afterSeesaw(s: SeesawState, r: { counted: number; misses: number }): SeesawState {
  if (r.misses >= DOWN_AT) return { ...s, level: Math.max(1, s.level - 1) as SeesawLevel, streak: 0 }
  const need = (isOrderLevel(s.level) ? ORDER_QS : PAIR_QS) - 1
  if (r.counted >= need && r.misses === 0) {
    const streak = s.streak + 1
    if (streak >= UP_AFTER && s.level < SEESAW_MAX) return { ...s, level: (s.level + 1) as SeesawLevel, streak: 0 }
    return { ...s, streak }
  }
  return { ...s, streak: 0 }
}
