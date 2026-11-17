// 小熊野餐（T-160，指引 MA-2「照數量拿東西」）：場景、客人、出題、升降級。只有純函式，scripts/test-picnic-drum.ts 直接測；畫面在 ./Picnic.tsx。
// 小動物說「I want three apples!」，孩子把食物一個一個放到牠的盤子上（每放一個牠數一聲），自己決定什麼時候停、按鈴鐺給牠。
// 指引：知道「最後數到的數就是有幾個」是 3 歲最重要的一步；「拿 N 個給我」比「數一數」更能看出真的懂。所以盤子上不畫格子、不提示要放幾個。
// 數量照 LOAD-2：先 1～3、排成一排；熟練了 2～4、3～5；第 4 級（4 歲的「打散的」）托盤裡的東西散開放。
// 場景全部自己畫（./art.tsx）＋ Fluent Emoji 的食物，不照任何現成 App 的關卡或圖。
import { FOODS, type Food } from './foods'

export { FOODS, type Food } from './foods'

type Rnd = () => number
const pickOf = <T,>(a: readonly T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length) % a.length]

// ── 場景：野餐的地方、桌布、盤子 ───────────────────────────────

/** 野餐的地方（背景）：天空、地面、遠景的東西（./art.tsx 的 PicnicPlace） */
export type PlaceId = 'park' | 'beach' | 'forest' | 'garden' | 'meadow' | 'snow' | 'lake' | 'farm' | 'night' | 'autumn' | 'rainbow' | 'hill'
export const PLACE_IDS: PlaceId[] = ['park', 'beach', 'forest', 'garden', 'meadow', 'snow', 'lake', 'farm', 'night', 'autumn', 'rainbow', 'hill']

/** 桌布（./art.tsx 的 Cloth）：格子、條紋、點點、星星…（狀態不靠顏色，花紋也不一樣） */
export type ClothId = 'red-check' | 'blue-check' | 'green-check' | 'yellow-stripe' | 'pink-dots' | 'orange-plain' | 'purple-stars' | 'mint-hearts' | 'leaf-mat' | 'straw-mat'
export const CLOTH_IDS: ClothId[] = ['red-check', 'blue-check', 'green-check', 'yellow-stripe', 'pink-dots', 'orange-plain', 'purple-stars', 'mint-hearts', 'leaf-mat', 'straw-mat']

/** 盤子（./art.tsx 的 Plate） */
export type PlateId = 'white' | 'blue-rim' | 'leaf' | 'wood' | 'flower' | 'paper' | 'tray' | 'basket'
export const PLATE_IDS: PlateId[] = ['white', 'blue-rim', 'leaf', 'wood', 'flower', 'paper', 'tray', 'basket']

/** 裝食物的地方（左邊、孩子拿東西的那一邊） */
export type BasketId = 'basket' | 'box' | 'bowl' | 'cart'
export const BASKET_IDS: BasketId[] = ['basket', 'box', 'bowl', 'cart']

/** 客人：故事繪本裡 App 自己畫的角色（art/storybook）。不放魚、章魚、鯨魚、蝴蝶（坐不上野餐墊） */
export const GUEST_IDS = [
  'teddy',
  'rabbit',
  'turtle',
  'elephant',
  'giraffe',
  'zebra',
  'lion',
  'monkey',
  'cow',
  'sheep',
  'pig',
  'chicken',
  'cat',
  'frog',
  'snail',
  'sauropod',
  'trex',
  'bird',
  'dodo',
  'bobo',
  'momo',
] as const
export type GuestId = (typeof GUEST_IDS)[number]

// ── 級數 ─────────────────────────────────────────────────────

export type PicnicLevel = 1 | 2 | 3 | 4
export const PICNIC_MAX: PicnicLevel = 4
export interface PicnicLevelSpec {
  /** 要的數量從這幾個挑 */
  wants: number[]
  /** 籃子裡放幾個（比要的多，孩子要自己停下來） */
  tray: number
  /** 籃子裡排成一排（3 歲），或打散（4 歲：MA-2 的下一步） */
  layout: 'row' | 'scatter'
}
export const PICNIC_LEVELS: Record<PicnicLevel, PicnicLevelSpec> = {
  1: { wants: [1, 2, 3], tray: 5, layout: 'row' },
  2: { wants: [2, 3, 4], tray: 6, layout: 'row' },
  3: { wants: [3, 4, 5], tray: 7, layout: 'row' },
  4: { wants: [3, 4, 5], tray: 8, layout: 'scatter' },
}
/** 籃子最多放幾個（盤子也最多放這麼多）：數一數的台詞要到這裡 */
export const MAX_TRAY = 8
export const PICNIC_GAME = 'logic-picnic'
/** 作答紀錄的技能：picnic:1-3、picnic:2-4、picnic:3-5、picnic:3-5-scatter */
export const picnicSkill = (level: PicnicLevel) => {
  const w = PICNIC_LEVELS[level].wants
  return `picnic:${w[0]}-${w[w.length - 1]}${PICNIC_LEVELS[level].layout === 'scatter' ? '-scatter' : ''}`
}
/** 一次野餐來幾個客人（LOAD-3：一回合 3～5 題） */
export const GUESTS_PER_PICNIC = 3

// ── 不跟最近幾次一樣 ──────────────────────────────────────────

/** 記住最近幾個：客人 6 個（兩次野餐）、食物 9 種（三次野餐）、場地／桌布／盤子／籃子各 3 個 */
export const RECENT = { guests: 6, foods: 9, places: 3, cloths: 3, plates: 3, baskets: 2, scenes: 12 }

/** 從 pool 挑一個不在 recent（最近的在後面）裡的；都用過了就至少不跟上一個一樣 */
export function freshPick<T>(pool: readonly T[], recent: readonly T[], keep: number, rnd: Rnd = Math.random): T {
  const last = recent.slice(-keep)
  let left = pool.filter((x) => !last.includes(x))
  if (!left.length) left = pool.filter((x) => x !== recent[recent.length - 1])
  if (!left.length) left = [...pool]
  return pickOf(left, rnd)
}

const push = <T,>(a: readonly T[], x: T | T[], keep: number) => [...a, ...(Array.isArray(x) ? x : [x])].slice(-keep)

// ── 出題 ─────────────────────────────────────────────────────

export interface Guest {
  who: GuestId
  food: Food
  want: number
}

export interface Picnic {
  level: PicnicLevel
  place: PlaceId
  cloth: ClothId
  plate: PlateId
  basket: BasketId
  /** 依序來吃的客人 */
  guests: Guest[]
  /** 第一次到這一級：第一個客人是手示範的（不算他的） */
  demo: boolean
}

/** 場景組合的記號（不跟最近 RECENT.scenes 次一樣） */
export const sceneSig = (p: Pick<Picnic, 'place' | 'cloth' | 'plate'>) => `${p.place}/${p.cloth}/${p.plate}`

/** 要的數量：從這一級挑，不跟上一個客人一樣（一次野餐不會三個都要一樣多） */
export function pickWants(level: PicnicLevel, n: number, rnd: Rnd = Math.random): number[] {
  const pool = PICNIC_LEVELS[level].wants
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const left = pool.filter((w) => w !== out[i - 1])
    out.push(pickOf(left, rnd))
  }
  return out
}

/** 一次新的野餐：場地、桌布、盤子、籃子都不跟最近幾次一樣；客人、食物不重複，也不跟最近幾次一樣 */
export function makePicnic(s: PicnicState, rnd: Rnd = Math.random): Picnic {
  const level = s.level as PicnicLevel
  const demo = !s.taught.includes(level)
  const n = GUESTS_PER_PICNIC + (demo ? 1 : 0)
  let place = freshPick(PLACE_IDS, s.places, RECENT.places, rnd)
  let cloth = freshPick(CLOTH_IDS, s.cloths, RECENT.cloths, rnd)
  let plate = freshPick(PLATE_IDS, s.plates, RECENT.plates, rnd)
  // 整組（地方＋桌布＋盤子）也不跟最近 12 次一樣（幾乎不會碰到，保險）
  for (let k = 0; k < 20 && s.scenes.includes(sceneSig({ place, cloth, plate })); k++) {
    place = freshPick(PLACE_IDS, s.places, RECENT.places, rnd)
    cloth = freshPick(CLOTH_IDS, s.cloths, RECENT.cloths, rnd)
    plate = freshPick(PLATE_IDS, s.plates, RECENT.plates, rnd)
  }
  const basket = freshPick(BASKET_IDS, s.baskets, RECENT.baskets, rnd)
  const guests: GuestId[] = []
  const foods: Food[] = []
  for (let i = 0; i < n; i++) {
    guests.push(freshPick(GUEST_IDS.filter((g) => !guests.includes(g)), s.guests, RECENT.guests, rnd))
    const icon = freshPick(
      FOODS.map((f) => f.icon).filter((x) => !foods.some((f) => f.icon === x)),
      s.foods,
      RECENT.foods,
      rnd,
    )
    foods.push(FOODS.find((f) => f.icon === icon)!)
  }
  // 示範的那一位要 2 個（看得出「一個、兩個，停」）；其他照這一級
  const wants = demo ? [2, ...pickWants(level, GUESTS_PER_PICNIC, rnd)] : pickWants(level, GUESTS_PER_PICNIC, rnd)
  return { level, place, cloth, plate, basket, demo, guests: guests.map((who, i) => ({ who, food: foods[i], want: wants[i] })) }
}

/** 籃子裡第 i 個東西散開多少（-1～1，畫面再乘上可以挪的距離）；排成一排的級是 0 */
export function trayJitter(level: PicnicLevel, n: number, rnd: Rnd = Math.random): { dx: number; dy: number }[] {
  const row = PICNIC_LEVELS[level].layout === 'row'
  return Array.from({ length: n }, () => (row ? { dx: 0, dy: 0 } : { dx: rnd() * 2 - 1, dy: rnd() * 2 - 1 }))
}

// ── 給了以後 ────────────────────────────────────────────────

export type Verdict = 'ok' | 'over' | 'under' | 'empty'
export const judge = (given: number, want: number): Verdict => (given === 0 ? 'empty' : given === want ? 'ok' : given > want ? 'over' : 'under')

/**
 * 手帶著做（第 3 次給錯、或示範）要動哪幾個：多了就從盤子拿回最後放的幾個，少了就從籃子補前面還沒拿的。
 * plate：盤子上的（放的順序）、tray：籃子裡還在的（籃子裡的順序）。回傳 { back: 拿回去的, add: 補上的 }。
 */
export function fixMoves(plate: readonly number[], tray: readonly number[], want: number): { back: number[]; add: number[] } {
  if (plate.length > want) return { back: plate.slice(want).reverse(), add: [] }
  return { back: [], add: tray.slice(0, want - plate.length) }
}

// ── 進度、升降級 ──────────────────────────────────────────────

/**
 * 一個客人算「第一次就對」：第一次按鈴就剛好、沒有手帶著做。
 * 升級：最近 6 個客人有 5 個第一次就對（三歲做得到就往上，不用等好幾天：家長 2026-11-16 要遊戲角升級快一點，T-159 同一個方向）。
 * 退級：最近 4 個客人只有 ≤ 1 個第一次就對（ADAPT-4：看到挫折就變簡單）。示範、手帶著做、發呆時手帶著的不算。
 */
export const UP_OF = 6
export const UP_OK = 5
export const DOWN_OF = 4
export const DOWN_OK = 1

export interface PicnicState {
  level: number
  /** 這一級（升降之後重新算）的客人：哪一天、第一次就對了沒 */
  recent: { date: string; ok: boolean }[]
  /** 示範過的級 */
  taught: number[]
  guests: GuestId[]
  foods: string[]
  places: PlaceId[]
  cloths: ClothId[]
  plates: PlateId[]
  baskets: BasketId[]
  /** 最近的場景組合（sceneSig） */
  scenes: string[]
}

export const PICNIC_START: PicnicState = { level: 1, recent: [], taught: [], guests: [], foods: [], places: [], cloths: [], plates: [], baskets: [], scenes: [] }

export function stepPicnic(s: PicnicState, r: { date: string; first: boolean; counted: boolean }): PicnicState {
  if (!r.counted) return s
  const recent = [...s.recent, { date: r.date, ok: r.first }].slice(-UP_OF)
  const lastDown = recent.slice(-DOWN_OF)
  if (s.level > 1 && lastDown.length >= DOWN_OF && lastDown.filter((x) => x.ok).length <= DOWN_OK) return { ...s, level: s.level - 1, recent: [] }
  if (s.level < PICNIC_MAX && recent.length >= UP_OF && recent.filter((x) => x.ok).length >= UP_OK) return { ...s, level: s.level + 1, recent: [] }
  return { ...s, recent }
}

/** 野餐開始：記住這次的場景、客人、食物（不管玩完沒，下次都不一樣） */
export function rememberPicnic(s: PicnicState, p: Picnic): PicnicState {
  return {
    ...s,
    guests: push(s.guests, p.guests.map((g) => g.who), RECENT.guests),
    foods: push(s.foods, p.guests.map((g) => g.food.icon), RECENT.foods),
    places: push(s.places, p.place, RECENT.places),
    cloths: push(s.cloths, p.cloth, RECENT.cloths),
    plates: push(s.plates, p.plate, RECENT.plates),
    baskets: push(s.baskets, p.basket, RECENT.baskets),
    scenes: push(s.scenes, sceneSig(p), RECENT.scenes),
  }
}

const strs = <T extends string>(x: unknown, ok: readonly T[], keep: number): T[] => (Array.isArray(x) ? (x.filter((v) => ok.includes(v)) as T[]).slice(-keep) : [])

/** 讀進來的東西不一定完整（壞掉、舊格式）：缺的補預設，級數夾在 1～max */
export function normalizePicnic(raw: unknown): PicnicState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const level = Number.isInteger(o.level) ? Math.min(PICNIC_MAX, Math.max(1, o.level as number)) : 1
  const recent = Array.isArray(o.recent) ? (o.recent as { date?: unknown; ok?: unknown }[]).filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date as string, ok: !!x.ok })) : []
  const taught = Array.isArray(o.taught) ? (o.taught as unknown[]).filter((x): x is number => Number.isInteger(x)) : []
  return {
    level,
    recent: recent.slice(-UP_OF),
    taught,
    guests: strs(o.guests, GUEST_IDS, RECENT.guests),
    foods: strs(o.foods, FOODS.map((f) => f.icon), RECENT.foods),
    places: strs(o.places, PLACE_IDS, RECENT.places),
    cloths: strs(o.cloths, CLOTH_IDS, RECENT.cloths),
    plates: strs(o.plates, PLATE_IDS, RECENT.plates),
    baskets: strs(o.baskets, BASKET_IDS, RECENT.baskets),
    scenes: Array.isArray(o.scenes) ? (o.scenes as unknown[]).filter((x): x is string => typeof x === 'string').slice(-RECENT.scenes) : [],
  }
}

/** 總共可以組出幾種野餐（場地 × 桌布 × 盤子 × 籃子 × 客人 × 食物）：回報、測試用 */
export const PICNIC_COMBOS = PLACE_IDS.length * CLOTH_IDS.length * PLATE_IDS.length * BASKET_IDS.length * GUEST_IDS.length * FOODS.length
