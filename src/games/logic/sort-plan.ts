// 豆豆收拾（分類，T-152 設計稿第三節案 A①，指引 CG-1：3 歲一次只用一個特徵分）的出題和升降級。
// 只有純函式，scripts/test-logic.ts 直接測；畫面在 ./Sort.tsx，存取在 ./progress.ts。
// 東西都是通用的：自己畫的球、積木、形狀（./art.tsx），加上現成的 Fluent Emoji。題目由程式出，不照任何現成 App 的關卡。

// ── 顏色、形狀、種類 ─────────────────────────────────────────

export type ColorId = 'red' | 'blue' | 'yellow' | 'green'
export const COLOR_IDS: ColorId[] = ['red', 'blue', 'yellow', 'green']
/** 紙感螢幕上也分得開的四個顏色（明暗也拉開：黃最亮、藍最暗） */
export const COLOR_HEX: Record<ColorId, string> = { red: '#E0604E', blue: '#4F7FC2', yellow: '#F2C94C', green: '#5DAE76' }

export type ShapeId = 'circle' | 'triangle' | 'square'
export const SHAPE_IDS: ShapeId[] = ['circle', 'triangle', 'square']

export type KindId = 'animal' | 'food' | 'vehicle'
/** 每一種的東西（Fluent Emoji）：第一個是籃子上的樣品，其他是要收的東西 */
export const KIND_ICONS: Record<KindId, string[]> = {
  animal: ['cow', 'pig', 'cat', 'rabbit', 'duck', 'elephant', 'giraffe', 'monkey', 'horse', 'penguin', 'zebra', 'turtle'],
  food: ['red-apple', 'banana', 'strawberry', 'cookie', 'pizza', 'grapes', 'carrot', 'bread', 'cupcake', 'watermelon', 'pear', 'doughnut'],
  vehicle: ['automobile', 'bus', 'airplane', 'bicycle', 'fire-engine', 'taxi', 'tractor', 'sailboat', 'rocket', 'helicopter', 'locomotive', 'motorcycle'],
}
/** 第 3 級的兩個籃子：動物／吃的、交通工具／動物 */
export const KIND_PAIRS: [KindId, KindId][] = [
  ['animal', 'food'],
  ['vehicle', 'animal'],
]

/** 第 2 級：本來就是這個顏色的東西（不同的東西、同一個顏色要放一起） */
export const COLOR_ICONS: Partial<Record<ColorId, string[]>> = {
  red: ['red-apple', 'strawberry', 'tomato', 'cherries', 'lady-beetle'],
  yellow: ['banana', 'lemon', 'sunflower', 'star', 'front-facing-baby-chick'],
  green: ['green-apple', 'frog', 'crocodile', 'herb', 'leaf-fluttering-in-wind'],
}

/** 第 1 級：同一種玩具、只差顏色 */
export type ToyId = 'ball' | 'block' | 'balloon'
export const TOY_IDS: ToyId[] = ['ball', 'block', 'balloon']

/** 第 5 級：同一種東西、只差大小 */
export const SIZE_ICONS = ['teddy-bear', 'red-apple', 'duck', 'soccer-ball', 'fish', 'star', 'turtle', 'strawberry']
/** 小的那一個畫多大（大的是 1） */
export const SMALL = 0.5

/** 畫一個東西需要的資料（./art.tsx 的 ThingArt） */
export type Thing =
  | { t: 'toy'; toy: ToyId; color: ColorId }
  /** 籃子上的顏色樣品：一團顏料 */
  | { t: 'swatch'; color: ColorId }
  | { t: 'emoji'; icon: string; scale?: number }
  /** color 沒給：籃子上的樣品，只有線條、不上色（不讓顏色變成線索） */
  | { t: 'shape'; shape: ShapeId; color?: ColorId }

// ── 級數 ─────────────────────────────────────────────────────

export type SortDim = 'color' | 'kind' | 'shape' | 'size'
export type SortLevel = 1 | 2 | 3 | 4 | 5
export const SORT_MAX: SortLevel = 5
/** 每一級分什麼（設計稿的表）：1 顏色（只差顏色）、2 顏色（不同東西）、3 種類、4 形狀、5 大小 */
export const LEVEL_DIM: Record<SortLevel, SortDim> = { 1: 'color', 2: 'color', 3: 'kind', 4: 'shape', 5: 'size' }
/** 作答紀錄的技能（設計稿「作答紀錄」）：sort:color、sort:kind、sort:shape、sort:size */
export const sortSkill = (level: SortLevel) => `sort:${LEVEL_DIM[level]}`

export const SORT_GAME = 'logic-sort'
/** 一局幾個東西 */
export const SORT_ITEMS = 4

export interface Basket {
  /** 這個籃子收什麼：顏色、種類、形狀，或 big／small */
  id: string
  sample: Thing
}
export interface SortItem {
  /** 作答紀錄的 itemId：sort:<特徵>:<東西>，例如 sort:color:red-ball */
  id: string
  thing: Thing
  /** 要放進哪個籃子（Basket.id） */
  answer: string
}
export interface SortRound {
  level: SortLevel
  dim: SortDim
  baskets: Basket[]
  items: SortItem[]
}

type Rnd = () => number
const pick = <T,>(a: readonly T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length) % a.length]
function shuffle<T>(a: readonly T[], rnd: Rnd): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
/** 從 a 裡挑 n 個不一樣的 */
const pickN = <T,>(a: readonly T[], n: number, rnd: Rnd): T[] => shuffle(a, rnd).slice(0, n)

/**
 * 每個籃子各分到幾個（4 個東西）：2 個籃子 2＋2，3 個籃子 2＋1＋1。每個籃子至少一個；
 * 排順序：同一個籃子不連 3 次（3 歲會變成「一直點同一邊」）。
 */
function answerOrder(ids: string[], rnd: Rnd): string[] {
  const counts = ids.length === 2 ? [2, 2] : [2, 1, 1]
  const bag = shuffle(ids, rnd).flatMap((id, i) => Array<string>(counts[i]).fill(id))
  for (let k = 0; k < 20; k++) {
    const o = shuffle(bag, rnd)
    if (!o.some((x, i) => i >= 2 && o[i - 1] === x && o[i - 2] === x)) return o
  }
  return bag
}

/**
 * 出一局（4 個東西）。同一局只有一個規則（籃子不換）：一局裡換規則是 4 歲的 DCCS（CG-3），3 歲不做。
 * three：第 4 級（形狀）用 3 個籃子（升到第 4 級、2 個籃子玩熟一點之後，見 ./progress 的 sortThree）。
 * 同一局沒有重複的東西。
 */
export function sortRound(level: SortLevel, rnd: Rnd = Math.random, three = false): SortRound {
  const dim = LEVEL_DIM[level]
  if (level === 1) {
    const cs = pickN(COLOR_IDS, 2, rnd)
    const toys = pickN(TOY_IDS, 2, rnd)
    const order = answerOrder(cs, rnd)
    // 每種玩具各一個紅、一個藍（同一種東西、只差顏色）；排出來的順序照 order
    const left = new Map(cs.map((c) => [c, shuffle(toys, rnd)]))
    const items = order.map((c) => {
      const toy = left.get(c as ColorId)!.pop()!
      return { id: `sort:color:${c}-${toy}`, thing: { t: 'toy', toy, color: c as ColorId } as Thing, answer: c }
    })
    return { level, dim, baskets: cs.map((c) => ({ id: c, sample: { t: 'swatch', color: c } })), items }
  }
  if (level === 2) {
    const cs = pickN(Object.keys(COLOR_ICONS) as ColorId[], 2, rnd)
    const order = answerOrder(cs, rnd)
    const left = new Map(cs.map((c) => [c, pickN(COLOR_ICONS[c]!, 2, rnd)]))
    const items = order.map((c) => {
      const icon = left.get(c as ColorId)!.pop()!
      return { id: `sort:color:${icon}`, thing: { t: 'emoji', icon } as Thing, answer: c }
    })
    return { level, dim, baskets: cs.map((c) => ({ id: c, sample: { t: 'swatch', color: c } })), items }
  }
  if (level === 3) {
    const ks = shuffle(pick(KIND_PAIRS, rnd), rnd)
    const order = answerOrder(ks, rnd)
    // 第一個是籃子上的樣品，不拿來收
    const left = new Map(ks.map((k) => [k, pickN(KIND_ICONS[k as KindId].slice(1), 2, rnd)]))
    const items = order.map((k) => {
      const icon = left.get(k as KindId)!.pop()!
      return { id: `sort:kind:${icon}`, thing: { t: 'emoji', icon } as Thing, answer: k }
    })
    return { level, dim, baskets: ks.map((k) => ({ id: k, sample: { t: 'emoji', icon: KIND_ICONS[k as KindId][0] } })), items }
  }
  if (level === 4) {
    const ss = three ? shuffle(SHAPE_IDS, rnd) : pickN(SHAPE_IDS, 2, rnd)
    const order = answerOrder(ss, rnd)
    // 顏色混著：同一個形狀的兩個不同色，不同形狀之間也不照顏色分
    const used = new Set<string>()
    const items = order.map((s) => {
      let color = pick(COLOR_IDS, rnd)
      for (let k = 0; k < 8 && used.has(`${s}-${color}`); k++) color = pick(COLOR_IDS, rnd)
      if (used.has(`${s}-${color}`)) color = COLOR_IDS.find((c) => !used.has(`${s}-${c}`))!
      used.add(`${s}-${color}`)
      return { id: `sort:shape:${color}-${s}`, thing: { t: 'shape', shape: s as ShapeId, color } as Thing, answer: s }
    })
    return { level, dim, baskets: ss.map((s) => ({ id: s, sample: { t: 'shape', shape: s } })), items }
  }
  // 第 5 級：大小。兩種東西各一大一小；籃子上的樣品是第一種東西的大、小
  const icons = pickN(SIZE_ICONS, 2, rnd)
  const order = answerOrder(['big', 'small'], rnd)
  const left = new Map(['big', 'small'].map((z) => [z, shuffle(icons, rnd)]))
  const items = order.map((z) => {
    const icon = left.get(z)!.pop()!
    return { id: `sort:size:${z}-${icon}`, thing: { t: 'emoji', icon, scale: z === 'big' ? 1 : SMALL } as Thing, answer: z }
  })
  const sampleIcon = 'soccer-ball'
  return {
    level,
    dim,
    baskets: ['big', 'small'].map((z) => ({ id: z, sample: { t: 'emoji', icon: sampleIcon, scale: z === 'big' ? 1 : SMALL } })),
    items,
  }
}

// ── 升降級（豆豆收拾、串珠珠共用）───────────────────────────

/** 熟練（同 chinese/match.ts）：這一級最近 8 題裡 ≥ 7 題自己第一次就對、分布在 ≥ 3 天 */
export const MASTER_OF = 8
export const MASTER_OK = 7
export const MASTER_DAYS = 3
/** 退一級（同 T-150）：最近 6 題第一次就對 ≤ 3 */
export const BACK_OF = 6
export const BACK_RIGHT = 3

export interface LevelState {
  level: number
  /** 這一級（升降之後重新算）自己答的題：哪一天、第一次就對了沒 */
  recent: { date: string; ok: boolean }[]
  /** 示範過的級（第一次到這一級才示範） */
  taught: number[]
}
export const LEVEL_START: LevelState = { level: 1, recent: [], taught: [] }

/**
 * 答完一個之後：
 * - counted false（示範、一起做、手帶著放、發呆時手點過答案才點的）：不算熟練、不算退級。
 * - 這一級熟練了：升一級（最多到 max），升降之後重新算；最近 6 題第一次就對 ≤ 3：退一級（最少 1）。
 */
export function stepLevel(s: LevelState, r: { date: string; first: boolean; counted: boolean }, max: number): LevelState {
  if (!r.counted) return s
  const recent = [...s.recent, { date: r.date, ok: r.first }].slice(-MASTER_OF)
  const last6 = recent.slice(-BACK_OF)
  if (s.level > 1 && last6.length >= BACK_OF && last6.filter((x) => x.ok).length <= BACK_RIGHT) return { ...s, level: s.level - 1, recent: [] }
  const mastered = recent.length >= MASTER_OF && recent.filter((x) => x.ok).length >= MASTER_OK && new Set(recent.map((x) => x.date)).size >= MASTER_DAYS
  if (mastered && s.level < max) return { ...s, level: s.level + 1, recent: [] }
  return { ...s, recent }
}

/** 第 4 級（形狀）什麼時候換成 3 個籃子：這一級自己第一次就對 ≥ 4 題以後 */
export const THREE_AFTER = 4
export const sortThree = (s: LevelState) => s.level === 4 && s.recent.filter((x) => x.ok).length >= THREE_AFTER
