// 數學課開場「玩著數數」（T-147，家長 2026-11-14 選定，取代童謠）：三種輪流，都數到今天的數字。純資料，不碰畫面（畫面在 Warm.tsx）。
// 依據：主 repo docs/T-149-熱門幼兒App參考.md 第 3 節 M1～M3、C1。
// - hop 動作數數（M2）：點一下青蛙跳一格、念一個數，跳過的荷葉留著亮起來，到今天的數字就停，說「Three jumps!」、放煙火。
// - fingers 手指數數（M1）：一隻大手，點一下伸出一根手指、念一個數；固定的比法（家長家裡的：從食指開始），旁邊同時出現同樣數量的東西，最後「Three fingers!」。
// - find 找找看（M3）：一片草地上有要找的東西（≤ 5 個）和少少幾個明顯不同類的東西，「Find three ducks!」點到的留記號、念數字，點夠了說總數。
// 每天輪一種（lib/variety.ts，連續兩天不一樣）；今天的數字超過 5 找找看放不下，改成動作數數。
// 不記作答（每一下都對，沒有對錯），只記一筆 logTeach（warm:<玩法>），家長區看得到玩過幾次；熟練判斷照舊看拿給波波（give:N）。
import { pickVariety } from '../../lib/variety'
import { pick, shuffle } from '../../lib/random'

export const WARM_PLAYS = ['hop', 'fingers', 'find'] as const
export type WarmPlay = (typeof WARM_PLAYS)[number]
/** lib/variety.ts 裡這一段的名字（測試可以用 localStorage 的 dodo:variety:math.warm 固定一種） */
export const WARM_VARIETY = 'math.warm'

/** 今天的玩法（同一天再進來沿用；讀不到資料庫也會回傳一種） */
export const pickWarmPlay = (date?: Date) => pickVariety<WarmPlay>(WARM_VARIETY, WARM_PLAYS, date)

/** 找找看要數的東西最多幾個（M3：3 歲範圍 ≤ 5） */
export const FIND_MAX = 5
/** 今天的數字超過 5：找找看放不下，改成動作數數 */
export const warmFor = (p: WarmPlay, n: number): WarmPlay => (p === 'find' && n > FIND_MAX ? 'hop' : p)

/** 兩次數數之間至少隔多久（M2：節奏慢而穩；連點、多指壓下去只算一下） */
export const COUNT_GAP_MS = 650

// ── 手指（M1）────────────────────────────────────────────

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
export type Finger = (typeof FINGERS)[number]
/** 固定的比法（家長 2026-11-14：家裡從食指開始）：1 食指、2 加中指、3 加無名指、4 加小指、5 整個手掌張開。每天都一樣，不換 */
export const FINGER_ORDER: readonly Finger[] = ['index', 'middle', 'ring', 'pinky', 'thumb']

/** 比 k 的時候兩隻手各伸出哪幾根（6 以上：第一隻手整個張開，第二隻手照同樣的比法） */
export function fingersUp(k: number): [Finger[], Finger[]] {
  const a = Math.max(0, Math.min(5, k))
  const b = Math.max(0, Math.min(5, k - 5))
  return [FINGER_ORDER.slice(0, a), FINGER_ORDER.slice(0, b)]
}

// ── 找找看（M3）──────────────────────────────────────────

export interface FindThing {
  icon: string
  /** 複數（Find three ducks!） */
  many: string
  /** 單數（Find one duck!） */
  one: string
}

/** 要找的東西：都是小動物或水果，跟干擾物（植物、石頭）明顯不同類 */
export const FIND_THINGS: readonly FindThing[] = [
  { icon: 'duck', many: 'ducks', one: 'duck' },
  { icon: 'lady-beetle', many: 'ladybugs', one: 'ladybug' },
  { icon: 'butterfly', many: 'butterflies', one: 'butterfly' },
  { icon: 'baby-chick', many: 'chicks', one: 'chick' },
  { icon: 'snail', many: 'snails', one: 'snail' },
]
/** 干擾物：少少幾個，而且明顯不是要找的那一類（LOAD-1） */
export const FIND_DISTRACTORS = ['deciduous-tree', 'tulip', 'rock', 'mushroom'] as const

export interface FindSpot {
  x: number
  y: number
  icon: string
  /** 是不是要找的 */
  target: boolean
}

/**
 * 草地上的位置（百分比，在舞台裡）：避開左下角的波波、上面今天的數字那一排；左右錯開，東西不會疊在一起。
 * 9 格，要找的 ≤ 5 個＋干擾物 2～3 個一定放得下。
 */
const SLOTS = [
  { x: 34, y: 34 },
  { x: 52, y: 28 },
  { x: 70, y: 34 },
  { x: 86, y: 30 },
  { x: 42, y: 58 },
  { x: 60, y: 54 },
  { x: 78, y: 60 },
  { x: 50, y: 80 },
  { x: 70, y: 82 },
]

/** 一片草地：要找的 n 個（最多 5 個）＋干擾物（n ≤ 2 放 2 個，其他 3 個），位置打散 */
export function findScene(n: number, thing: FindThing = pick([...FIND_THINGS])): { thing: FindThing; spots: FindSpot[] } {
  const k = Math.max(1, Math.min(FIND_MAX, n))
  const d = k <= 2 ? 2 : 3
  const others = shuffle([...FIND_DISTRACTORS]).slice(0, d)
  const cells = shuffle([...SLOTS]).slice(0, k + d)
  const spots = cells.map((c, i) => ({ ...c, icon: i < k ? thing.icon : others[i - k], target: i < k }))
  return { thing, spots }
}

// ── 下課給大人的一句（C1）────────────────────────────────

const NUM = ['zero', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十']

/**
 * 下課畫面給大人看的一句「今天在家可以做的事」（C1，PBS KIDS 的研究：數位＋大人一起做才有效）。
 * 不念、不新增語音；同一天固定同一句（照日期輪）。
 */
export function homeTip(n: number, date: Date = new Date()): string {
  const x = NUM[Math.max(1, Math.min(10, n))]
  const tips = [
    `吃點心時一起數 ${x} 塊餅乾。`,
    `上樓梯時一起數 ${x} 階，一階說一個數。`,
    `收玩具時一起數 ${x} 個，一個一個放進盒子。`,
    `一起舉手指比 ${x}（從食指開始比），再找 ${x} 樣東西擺在旁邊。`,
    `洗澡時一起數 ${x} 個小玩具。`,
  ]
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  return tips[day % tips.length]
}
