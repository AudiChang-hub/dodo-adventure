// 躲起來了幾隻（家長 2026-11-17，指引 MA-10 5 以內的合成分解、MA-3 點數）：級數、出題、選項、升降級。
// 只有純函式，scripts/test-race-hide.ts 直接測；畫面在 ./Hide.tsx，內容在 ./data.ts。
//
// 一題：N 隻一樣的小動物一隻一隻走出來（豆豆數 One! Two! Three!），其中幾隻躲進山洞、箱子、樹叢，
// 外面還剩幾隻看得到；問「How many are hiding?」，用點數圈圈或數字作答；打開來一起數，說「Two and one make three!」。
//
// 難度（LOAD-2、LOAD-4：數量先小、5 以內的分與合；LOAD-1：選項先 2 個）：
//   1 級：3 隻，2 個點數圈圈選項；上面的「全部幾隻」卡片上，躲起來的那幾個是空心圈（看得出缺幾個）
//   2 級：3～4 隻，3 個點數圈圈選項，空心圈不先給（答錯第 2 次才出來）
//   3 級：4～5 隻，3 個選項（圈圈＋數字）
//   4 級：5 隻，3 個數字選項（4 歲：數字代表數量）
// 升級：最近 6 題有 5 題第一次就對；退級：最近 4 題只有 ≤ 1 題第一次就對（ADAPT-4）。示範、一起做、手帶著答的不算。
import { ANIMALS, PLACES, SCENES, placesFor, type HidePlace, type HideScene } from './data'

type Rnd = () => number
const pickOf = <T,>(a: readonly T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length) % a.length]

export type HideLevel = 1 | 2 | 3 | 4
export const HIDE_MAX: HideLevel = 4
export const HIDE_GAME = 'logic-hide'
/** 一局幾題（LOAD-3：3～5 題）；第一次到這一級多一題示範 */
export const HIDE_QS = 4

export interface HideLevelSpec {
  /** 全部幾隻從這幾個挑 */
  totals: number[]
  /** 幾個選項 */
  options: number
  /** 選項的樣子：點數圈圈、圈圈＋數字、只有數字 */
  show: 'dots' | 'both' | 'num'
  /** 「全部幾隻」卡片一開始就畫出空心圈（躲起來的那幾個） */
  frame: boolean
}
export const HIDE_LEVELS: Record<HideLevel, HideLevelSpec> = {
  1: { totals: [3], options: 2, show: 'dots', frame: true },
  2: { totals: [3, 4], options: 3, show: 'dots', frame: false },
  3: { totals: [4, 5], options: 3, show: 'both', frame: false },
  4: { totals: [5], options: 3, show: 'num', frame: false },
}
/** 最多幾隻（台詞、版面要到這裡） */
export const MAX_TOTAL = 5
/** 作答紀錄的技能：hide:3-frame、hide:3-4、hide:4-5、hide:5-num */
export const hideSkill = (level: HideLevel) => ['', 'hide:3-frame', 'hide:3-4', 'hide:4-5', 'hide:5-num'][level]

export interface HideQ {
  level: HideLevel
  total: number
  /** 躲起來幾隻（答案） */
  hidden: number
  animal: string
  place: string
  /** 選項（由小到大） */
  options: number[]
  itemId: string
}

export interface HideRound {
  level: HideLevel
  scene: string
  qs: HideQ[]
  /** 第一次到這一級：第一題是手示範的（不算他的） */
  demo: boolean
}

/**
 * 選項：答案＋最容易搞混的（外面那幾隻的數量、差 1 的），由小到大排（數字順序，不用顏色區分）。
 * 都在 1～total 裡（全部都躲起來不會出：外面一定看得到至少一隻；total 本身可以當選項）。
 */
export function hideOptions(total: number, hidden: number, n: number, rnd: Rnd = Math.random): number[] {
  const pool = Array.from({ length: total }, (_, i) => i + 1).filter((v) => v !== hidden)
  const prefer = [total - hidden, hidden - 1, hidden + 1].filter((v, i, a) => v !== hidden && pool.includes(v) && a.indexOf(v) === i)
  const rest = pool.filter((v) => !prefer.includes(v)).sort(() => rnd() - 0.5)
  // 第一個最容易搞混的一定放；第二個從剩下的隨機挑（不是每次都同一組）
  const picks = [...prefer.slice(0, 1), ...[...prefer.slice(1), ...rest].sort(() => rnd() - 0.5)].slice(0, n - 1)
  return [hidden, ...picks].sort((a, b) => a - b)
}

// ── 今天用過的（同一天不重複） ─────────────────────────────────

export interface HideMemory {
  date: string
  scenes: string[]
  animals: string[]
  places: string[]
}

/** 今天還沒用過的；都用過了就挑最久以前的那一半 */
function freshToday<T>(pool: readonly T[], id: (x: T) => string, used: readonly string[], rnd: Rnd, avoid: readonly string[] = []): T {
  const ok = pool.filter((x) => !avoid.includes(id(x)))
  const base = ok.length ? ok : pool
  const left = base.filter((x) => !used.includes(id(x)))
  if (left.length) return pickOf(left, rnd)
  const old = used.slice(0, Math.max(1, Math.floor(used.length / 2)))
  const olds = base.filter((x) => old.includes(id(x)))
  return pickOf(olds.length ? olds : base, rnd)
}

const push = (a: readonly string[], x: string) => [...a.filter((v) => v !== x), x]

/** 一局：一個場景、HIDE_QS 題（每題不同的小動物、不同的躲藏處，躲起來的數量不跟上一題一樣） */
export function makeHide(s: HideState, date: string, rnd: Rnd = Math.random): { round: HideRound; state: HideState } {
  const level = s.level as HideLevel
  const spec = HIDE_LEVELS[level]
  let m: HideMemory = s.today.date === date ? s.today : { date, scenes: [], animals: [], places: [] }
  const demo = !s.taught.includes(level)
  const scene: HideScene = freshToday(SCENES, (x) => x.id, m.scenes, rnd)
  m = { ...m, scenes: push(m.scenes, scene.id) }
  const places = placesFor(scene)
  const qs: HideQ[] = []
  const n = HIDE_QS + (demo ? 1 : 0)
  for (let i = 0; i < n; i++) {
    const animal = freshToday(
      ANIMALS,
      (x) => x,
      m.animals,
      rnd,
      qs.map((q) => q.animal),
    )
    const place: HidePlace = freshToday(
      places,
      (x) => x.id,
      m.places,
      rnd,
      qs.map((q) => q.place),
    )
    m = { ...m, animals: push(m.animals, animal), places: push(m.places, place.id) }
    // 示範那一題：3 隻躲 1 隻（最好看懂）；其他照這一級，躲起來的數量不跟上一題一樣
    const total = demo && i === 0 ? 3 : pickOf(spec.totals, rnd)
    const prev = qs[i - 1]?.hidden
    const ks = Array.from({ length: total - 1 }, (_, j) => j + 1).filter((k) => k !== prev)
    const hidden = demo && i === 0 ? 1 : pickOf(ks.length ? ks : [1], rnd)
    const options = hideOptions(total, hidden, demo && i === 0 ? 2 : spec.options, rnd)
    qs.push({ level, total, hidden, animal, place: place.id, options, itemId: `hide:${total}-${hidden}:${animal}:${place.id}` })
  }
  return { round: { level, scene: scene.id, qs, demo }, state: { ...s, today: m } }
}

// ── 進度、升降級 ──────────────────────────────────────────────

export const UP_OF = 6
export const UP_OK = 5
export const DOWN_OF = 4
export const DOWN_OK = 1

export interface HideState {
  level: number
  /** 這一級（升降之後重新算）的每一題：第一次就對了沒 */
  recent: boolean[]
  /** 示範過的級 */
  taught: number[]
  today: HideMemory
}

export const HIDE_START: HideState = { level: 1, recent: [], taught: [], today: { date: '', scenes: [], animals: [], places: [] } }

export function stepHide(s: HideState, r: { first: boolean; counted: boolean }): HideState {
  if (!r.counted) return s
  const recent = [...s.recent, r.first].slice(-UP_OF)
  const lastDown = recent.slice(-DOWN_OF)
  if (s.level > 1 && lastDown.length >= DOWN_OF && lastDown.filter(Boolean).length <= DOWN_OK) return { ...s, level: s.level - 1, recent: [] }
  if (s.level < HIDE_MAX && recent.length >= UP_OF && recent.filter(Boolean).length >= UP_OK) return { ...s, level: s.level + 1, recent: [] }
  return { ...s, recent }
}

const strs = (x: unknown, ok: readonly string[]) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && ok.includes(v)).slice(-ok.length) : [])

/** 讀進來的東西不一定完整（壞掉、舊格式）：缺的補預設，級數夾在 1～max */
export function normalizeHide(raw: unknown): HideState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const t = (o.today && typeof o.today === 'object' ? o.today : {}) as Record<string, unknown>
  return {
    level: Number.isInteger(o.level) ? Math.min(HIDE_MAX, Math.max(1, o.level as number)) : 1,
    recent: Array.isArray(o.recent) ? o.recent.map((x) => !!x).slice(-UP_OF) : [],
    taught: Array.isArray(o.taught) ? (o.taught as unknown[]).filter((x): x is number => Number.isInteger(x)) : [],
    today: {
      date: typeof t.date === 'string' ? t.date : '',
      scenes: strs(
        t.scenes,
        SCENES.map((x) => x.id),
      ),
      animals: strs(t.animals, ANIMALS),
      places: strs(
        t.places,
        PLACES.map((x) => x.id),
      ),
    },
  }
}

/** 總共有幾種題目的組合（場景 × 放得下的躲藏處 × 小動物 × 分法）：回報、測試用 */
export function hideCombos() {
  let splits = 0
  for (let t = 3; t <= MAX_TOTAL; t++) splits += t - 1
  return SCENES.reduce((a, sc) => a + placesFor(sc).length, 0) * ANIMALS.length * splits
}
