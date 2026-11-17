// 豆豆收拾（分類，T-152 設計稿第三節案 A①，指引 CG-1：3 歲一次只用一個特徵分）的出題和升降級。
// 只有純函式，scripts/test-logic.ts 直接測；畫面在 ./Sort.tsx，存取在 ./progress.ts。
// 東西都是通用的：自己畫的玩具、衣服、碗盤、形狀（./art.tsx），加上現成的 Fluent Emoji。題目由程式出，不照任何現成 App 的關卡。
// T-157：每一局隨機挑一個「收拾的情境」（玩具進箱子、水果進籃子、動物回農場…），容器和背景跟著換；不跟最近兩局一樣。

// ── 顏色、形狀、種類 ─────────────────────────────────────────

export type ColorId = 'red' | 'blue' | 'yellow' | 'green'
export const COLOR_IDS: ColorId[] = ['red', 'blue', 'yellow', 'green']
/** 紙感螢幕上也分得開的四個顏色（明暗也拉開：黃最亮、藍最暗） */
export const COLOR_HEX: Record<ColorId, string> = { red: '#E0604E', blue: '#4F7FC2', yellow: '#F2C94C', green: '#5DAE76' }

export type ShapeId = 'circle' | 'triangle' | 'square'
export const SHAPE_IDS: ShapeId[] = ['circle', 'triangle', 'square']

export type KindId = 'animal' | 'food' | 'vehicle' | 'clothes' | 'toy'
export const KIND_IDS: KindId[] = ['animal', 'food', 'vehicle', 'clothes', 'toy']
/** 每一種的東西（Fluent Emoji，都在 src/art/emoji.generated.ts 裡）：籃子上的樣品也從這裡挑，挑到的不拿來收 */
export const KIND_ICONS: Record<KindId, string[]> = {
  animal: ['cow', 'pig', 'cat', 'rabbit', 'duck', 'elephant', 'giraffe', 'monkey', 'horse', 'penguin', 'zebra', 'turtle', 'lion', 'bear', 'koala', 'panda', 'chicken', 'frog', 'goat', 'kangaroo', 'hippopotamus', 'owl'],
  food: ['red-apple', 'banana', 'strawberry', 'cookie', 'pizza', 'grapes', 'carrot', 'bread', 'cupcake', 'watermelon', 'pear', 'doughnut', 'hamburger', 'sandwich', 'ice-cream', 'cherries', 'tangerine', 'cooked-rice'],
  vehicle: ['automobile', 'bus', 'airplane', 'bicycle', 'fire-engine', 'taxi', 'tractor', 'sailboat', 'rocket', 'helicopter', 'locomotive', 'motorcycle', 'police-car', 'racing-car', 'ambulance', 'delivery-truck'],
  clothes: ['t-shirt', 'jeans', 'socks', 'dress', 'scarf', 'coat', 'billed-cap', 'hiking-boot', 'running-shoe'],
  // 沒有泰迪熊（跟動物放一起會分不清）、沒有玩具車（跟交通工具分不清）
  toy: ['soccer-ball', 'basketball', 'kite', 'yo-yo', 'game-die', 'puzzle-piece', 'drum', 'balloon', 'baseball', 'tennis', 'robot'],
}
/** 第 3 級：哪兩種可以一起分（玩具和動物、玩具和交通工具會混淆，不配） */
export const KIND_PARTNERS: Record<KindId, KindId[]> = {
  animal: ['food', 'vehicle', 'clothes'],
  food: ['animal', 'toy', 'vehicle', 'clothes'],
  vehicle: ['animal', 'food', 'clothes'],
  clothes: ['toy', 'food', 'animal', 'vehicle'],
  toy: ['clothes', 'food'],
}

/** 自己畫的、可以換顏色的東西（./art.tsx 的 ThingArt）：第 1 級同一種只差顏色，第 2 級不同的東西同一個顏色 */
export type ToyId = 'ball' | 'block' | 'balloon' | 'car' | 'sock' | 'shirt' | 'hat' | 'mitten' | 'cup' | 'bowl' | 'plate' | 'spoon'
export const TOY_IDS: ToyId[] = ['ball', 'block', 'balloon', 'car', 'sock', 'shirt', 'hat', 'mitten', 'cup', 'bowl', 'plate', 'spoon']

/** 小的那一個畫多大（大的是 1） */
export const SMALL = 0.5

/** 畫一個東西需要的資料（./art.tsx 的 ThingArt） */
export type Thing =
  | { t: 'toy'; toy: ToyId; color: ColorId }
  /** 籃子上的顏色樣品：一團顏料 */
  | { t: 'swatch'; color: ColorId }
  | { t: 'emoji'; icon: string; scale?: number }
  /** color 沒給：籃子上的樣品，只有線條、不上色（不讓顏色變成線索）；look cookie：餅乾（糖霜是 color） */
  | { t: 'shape'; shape: ShapeId; color?: ColorId; look?: 'cookie' }
  /** 籃子上「看是什麼東西」的樣品（第 6、7 級，./sort-switch.ts）：自己畫的東西只有線條、不上色 */
  | { t: 'outline'; toy: ToyId }

// ── 收拾的情境（T-157）───────────────────────────────────────

/** 容器的樣子（./art.tsx 的 BinArt） */
export type BinId = 'basket' | 'toybox' | 'barn' | 'drawer' | 'tub' | 'jar' | 'garage'
export type SceneId = 'toys' | 'fruit' | 'farm' | 'clothes' | 'kitchen' | 'garage'
export const SCENE_IDS: SceneId[] = ['toys', 'fruit', 'farm', 'clothes', 'kitchen', 'garage']

export interface SceneDef {
  /** 這個情境的容器 */
  bin: BinId
  /** 第 1、2 級：自己畫的、可以換顏色的東西（4 種） */
  toys?: ToyId[]
  /** 第 2 級：本來就是這個顏色的東西（每個顏色至少 2 個） */
  colors?: Partial<Record<ColorId, string[]>>
  /** 第 3 級：這個情境主要收哪一種（另一種從 KIND_PARTNERS 挑） */
  kind?: KindId
  /** 第 4 級：形狀長什麼樣子、收進哪種容器 */
  shapes?: { look?: 'cookie'; bin: BinId }
  /** 第 5 級：同一種東西一大一小 */
  sizes?: string[]
}
export const SCENES: Record<SceneId, SceneDef> = {
  toys: { bin: 'toybox', toys: ['ball', 'block', 'balloon', 'car'], kind: 'toy', shapes: { bin: 'toybox' }, sizes: ['teddy-bear', 'soccer-ball', 'balloon', 'kite', 'drum', 'yo-yo', 'robot'] },
  fruit: {
    bin: 'basket',
    colors: {
      red: ['red-apple', 'strawberry', 'tomato', 'cherries'],
      yellow: ['banana', 'lemon'],
      green: ['green-apple', 'pear'],
    },
    kind: 'food',
    sizes: ['red-apple', 'strawberry', 'watermelon', 'banana', 'pear', 'carrot', 'lemon'],
  },
  farm: { bin: 'barn', kind: 'animal', sizes: ['cow', 'pig', 'horse', 'duck', 'ewe', 'rabbit', 'chicken', 'goat'] },
  clothes: { bin: 'drawer', toys: ['sock', 'shirt', 'hat', 'mitten'], kind: 'clothes', sizes: ['t-shirt', 'socks', 'dress', 'coat', 'jeans', 'billed-cap', 'running-shoe'] },
  kitchen: { bin: 'tub', toys: ['cup', 'bowl', 'plate', 'spoon'], shapes: { look: 'cookie', bin: 'jar' } },
  garage: { bin: 'garage', kind: 'vehicle', sizes: ['bus', 'automobile', 'fire-engine', 'tractor', 'taxi', 'helicopter', 'airplane'] },
}
/** 第 3 級：每一種收進哪種容器（動物回農場、車子停車庫…） */
export const KIND_BIN: Record<KindId, BinId> = { animal: 'barn', food: 'basket', vehicle: 'garage', clothes: 'drawer', toy: 'toybox' }

// ── 級數 ─────────────────────────────────────────────────────

/** thing：看是哪一種東西（球、車子…，第 6、7 級）；both：顏色和形狀／東西一起看（第 7 級），見 ./sort-switch.ts */
export type SortDim = 'color' | 'kind' | 'shape' | 'size' | 'thing' | 'both'
export type SortLevel = 1 | 2 | 3 | 4 | 5
export const SORT_MAX: SortLevel = 5
/** 每一級分什麼（設計稿的表）：1 顏色（只差顏色）、2 顏色（不同東西）、3 種類、4 形狀、5 大小 */
export const LEVEL_DIM: Record<SortLevel, SortDim> = { 1: 'color', 2: 'color', 3: 'kind', 4: 'shape', 5: 'size' }
/** 作答紀錄的技能（設計稿「作答紀錄」）：sort:color、sort:kind、sort:shape、sort:size */
export const sortSkill = (level: SortLevel) => `sort:${LEVEL_DIM[level]}`

/** 這一級的情境有哪些（第 sub 級的內容） */
export function scenesFor(sub: SortLevel): SceneId[] {
  return SCENE_IDS.filter((id) => {
    const s = SCENES[id]
    if (sub === 1) return (s.toys?.length ?? 0) >= 2
    if (sub === 2) return (s.toys?.length ?? 0) >= 4 || Object.values(s.colors ?? {}).filter((x) => x.length >= 2).length >= 2
    if (sub === 3) return !!s.kind
    if (sub === 4) return !!s.shapes
    return (s.sizes?.length ?? 0) >= 3
  })
}

/**
 * 同一級也換分的特徵（T-157）：第 3 級以上、這一級示範過了，每 3 局約有 1 局複習學過的特徵（第 2～4 級的內容，形狀只用 2 個籃子）。
 * 複習的那一局不算進升降級（升降級只看這一級自己的特徵），作答紀錄記實際分的特徵。
 */
export const REVIEW_P = 1 / 3

export const SORT_GAME = 'logic-sort'
/** 一局幾個東西 */
export const SORT_ITEMS = 4

export interface Basket {
  /** 這個籃子收什麼：顏色、種類、形狀，或 big／small */
  id: string
  sample: Thing
  /** 容器的樣子 */
  bin: BinId
}
export interface SortItem {
  /** 作答紀錄的 itemId：sort:<特徵>:<東西>，例如 sort:color:red-ball */
  id: string
  thing: Thing
  /** 要放進哪個籃子（Basket.id） */
  answer: string
}
/** 第 6 級換規則之後的那一半（./sort-switch.ts）：同一堆東西照新的特徵再分一次 */
export interface SortPhase {
  dim: SortDim
  skill: string
  baskets: Basket[]
  items: SortItem[]
}
export interface SortRound {
  /** 1～5 是原本的玩法；6、7 是熟練了才開的 4 歲玩法（./sort-switch.ts） */
  level: SortLevel | 6 | 7
  dim: SortDim
  /** 作答紀錄的技能：sort:<這一局實際分的特徵> */
  skill: string
  /** 複習學過的特徵：不算進升降級 */
  review: boolean
  scene: SceneId
  baskets: Basket[]
  items: SortItem[]
  /** 一局開始先說的規則（第 6、7 級：Sort by color!） */
  intro?: string
  /** 第 6 級：分完 items 之後換規則，換成這一半 */
  then?: SortPhase
  /** 這一局的組合（第 6、7 級同一天不重複） */
  sig?: string
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
 * 挑一個情境：不跟最近兩局一樣（能挑的只有 2 個時，只避開上一局）。recent 是最近用過的（舊的在前）。
 */
export function pickScene<T extends string>(valid: readonly T[], recent: readonly string[], rnd: Rnd): T {
  for (let k = Math.min(2, valid.length - 1); k >= 0; k--) {
    const avoid = new Set(k ? recent.slice(-k) : [])
    const left = valid.filter((v) => !avoid.has(v))
    if (left.length) return pick(left, rnd)
  }
  return pick(valid, rnd)
}

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

export interface SortOpts {
  /** 最近用過的情境（舊的在前），不挑一樣的 */
  recent?: readonly string[]
  /** 可以複習學過的特徵（這一級示範過了才給 true；第一次到這一級一定玩這一級的特徵） */
  review?: boolean
}

/**
 * 出一局（4 個東西）。同一局只有一個規則（籃子不換）：一局裡換規則是 4 歲的 DCCS（CG-3），3 歲不做。
 * three：第 4 級（形狀）用 3 個籃子（升到第 4 級、2 個籃子玩熟一點之後，見 ./progress 的 sortThree）。
 * 同一局沒有重複的東西。
 */
export function sortRound(level: SortLevel, rnd: Rnd = Math.random, three = false, opts: SortOpts = {}): SortRound {
  // 複習：第 3 級以上，從第 2 級起學過的特徵挑一個（第 1 級的顏色跟第 2 級同一個特徵，用第 2 級的）
  let sub: SortLevel = level
  if (opts.review && level >= 3 && rnd() < REVIEW_P) sub = pick(([2, 3, 4] as SortLevel[]).filter((x) => x < level), rnd)
  const review = sub !== level
  const dim = LEVEL_DIM[sub]
  const scene = pickScene(scenesFor(sub), opts.recent ?? [], rnd)
  const def = SCENES[scene]
  const base = { level, dim, skill: `sort:${dim}`, review, scene }
  const colorBaskets = (cs: ColorId[]): Basket[] => cs.map((c) => ({ id: c, sample: { t: 'swatch', color: c }, bin: def.bin }))

  if (sub === 1) {
    const cs = pickN(COLOR_IDS, 2, rnd)
    const toys = pickN(def.toys!, 2, rnd)
    const order = answerOrder(cs, rnd)
    // 每種東西各一個紅、一個藍（同一種東西、只差顏色）；排出來的順序照 order
    const left = new Map(cs.map((c) => [c, shuffle(toys, rnd)]))
    const items = order.map((c) => {
      const toy = left.get(c as ColorId)!.pop()!
      return { id: `sort:color:${c}-${toy}`, thing: { t: 'toy', toy, color: c as ColorId } as Thing, answer: c }
    })
    return { ...base, baskets: colorBaskets(cs), items }
  }
  if (sub === 2) {
    // 自己畫的：4 種東西分給兩個顏色（每個顏色 2 種，兩邊沒有同一種）；本來就有顏色的：每個顏色挑 2 個
    const natural = !def.toys || (def.colors && rnd() < 0.5)
    const cs = natural ? pickN((Object.keys(def.colors!) as ColorId[]).filter((c) => def.colors![c]!.length >= 2), 2, rnd) : pickN(COLOR_IDS, 2, rnd)
    const order = answerOrder(cs, rnd)
    const toys = natural ? [] : pickN(def.toys!, 4, rnd)
    const left = new Map(cs.map((c, i) => [c, natural ? pickN(def.colors![c]!, 2, rnd) : toys.slice(i * 2, i * 2 + 2)]))
    const items = order.map((c) => {
      const x = left.get(c as ColorId)!.pop()!
      return natural
        ? { id: `sort:color:${x}`, thing: { t: 'emoji', icon: x } as Thing, answer: c }
        : { id: `sort:color:${c}-${x}`, thing: { t: 'toy', toy: x as ToyId, color: c as ColorId } as Thing, answer: c }
    })
    return { ...base, baskets: colorBaskets(cs), items }
  }
  if (sub === 3) {
    const ks = shuffle([def.kind!, pick(KIND_PARTNERS[def.kind!], rnd)], rnd)
    const order = answerOrder(ks, rnd)
    // 每一種挑 3 個：1 個當籃子上的樣品（不拿來收）、2 個要收
    const picked = new Map(ks.map((k) => [k, pickN(KIND_ICONS[k], 3, rnd)]))
    const left = new Map(ks.map((k) => [k, picked.get(k)!.slice(1)]))
    const items = order.map((k) => {
      const icon = left.get(k as KindId)!.pop()!
      return { id: `sort:kind:${icon}`, thing: { t: 'emoji', icon } as Thing, answer: k }
    })
    return { ...base, baskets: ks.map((k) => ({ id: k, sample: { t: 'emoji', icon: picked.get(k)![0] }, bin: KIND_BIN[k] })), items }
  }
  if (sub === 4) {
    const ss = three && !review ? shuffle(SHAPE_IDS, rnd) : pickN(SHAPE_IDS, 2, rnd)
    const order = answerOrder(ss, rnd)
    const look = def.shapes!.look
    // 顏色混著：同一個形狀的兩個不同色，不同形狀之間也不照顏色分
    const used = new Set<string>()
    const items = order.map((s) => {
      let color = pick(COLOR_IDS, rnd)
      for (let k = 0; k < 8 && used.has(`${s}-${color}`); k++) color = pick(COLOR_IDS, rnd)
      if (used.has(`${s}-${color}`)) color = COLOR_IDS.find((c) => !used.has(`${s}-${c}`))!
      used.add(`${s}-${color}`)
      return { id: `sort:shape:${color}-${s}${look ? `-${look}` : ''}`, thing: { t: 'shape', shape: s as ShapeId, color, ...(look ? { look } : {}) } as Thing, answer: s }
    })
    return { ...base, baskets: ss.map((s) => ({ id: s, sample: { t: 'shape', shape: s }, bin: def.shapes!.bin })), items }
  }
  // 第 5 級：大小。兩種東西各一大一小；籃子上的樣品是第三種東西的大、小
  const [sampleIcon, ...icons] = pickN(def.sizes!, 3, rnd)
  const order = answerOrder(['big', 'small'], rnd)
  const left = new Map(['big', 'small'].map((z) => [z, shuffle(icons, rnd)]))
  const items = order.map((z) => {
    const icon = left.get(z)!.pop()!
    return { id: `sort:size:${z}-${icon}`, thing: { t: 'emoji', icon, scale: z === 'big' ? 1 : SMALL } as Thing, answer: z }
  })
  return {
    ...base,
    baskets: ['big', 'small'].map((z) => ({ id: z, sample: { t: 'emoji', icon: sampleIcon, scale: z === 'big' ? 1 : SMALL }, bin: def.bin })),
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
 * - counted false（示範、一起做、手帶著放、發呆時手點過答案才點的、複習的那一局）：不算熟練、不算退級。
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
