// 積木蓋蓋看（T-162）的出題、托盤、步驟、升降級。只有純函式，scripts/test-blocks.ts 直接測；畫面在 ./Build.tsx。
// 依據：指引 MA-6（用形狀拼出圖案、轉了方向也認得）、MA-8（旁邊、中間、上下）、CG-3（動手前先看計畫：第 4 級的步驟圖）。
// 四級（拼圖同一套：順利蓋完一個就升一級；最近 6 個 ≤ 3 個順利就退一級）：
//   1 小的（3～4 塊）、從側面看的平面版　2 中的（6～8 塊）平面版
//   3 小的換成前後兩排（斜著看的立體版）　4 中的換成前後兩排，看步驟圖一步一步蓋（每步只多畫要加的積木）
import { stepLevel, type LevelState } from '../logic/sort-plan'
import { COLOR_IDS, buildOrder, kindOf, supported, type Brick, type ColorId } from './bricks'
import { MODELS, modelBricks, modelOf, type Model, type ModelSize } from './models'

export type BlocksLevel = 1 | 2 | 3 | 4
export const BLOCKS_MAX: BlocksLevel = 4
export const LEVELS: Record<BlocksLevel, { size: ModelSize; deep: boolean; steps: boolean; extra: number }> = {
  1: { size: 'S', deep: false, steps: false, extra: 1 },
  2: { size: 'M', deep: false, steps: false, extra: 2 },
  3: { size: 'S', deep: true, steps: false, extra: 2 },
  4: { size: 'M', deep: true, steps: true, extra: 2 },
}
export const BLOCKS_GAME = 'logic-blocks'
/** 作答紀錄的技能：blocks:1～4 */
export const blocksSkill = (level: BlocksLevel) => `blocks:${level}`
/** 一個蓋完算「順利」：放錯 ≤ 1 次、沒有手帶著放 */
export const OK_WRONGS = 1
/** 新的一個不跟最近幾個一樣 */
export const RECENT_MODELS = 10
/** 第 4 級每一步最多加幾塊 */
export const STEP_MAX = 3

type Rnd = () => number

/** 挑一個模型：這一級的大小、不在最近 10 個裡、不跟上一個同主題（都用過了才放寬） */
export function pickModel(level: BlocksLevel, recent: readonly string[], rnd: Rnd = Math.random): Model {
  const size = LEVELS[level].size
  const last = recent.slice(-RECENT_MODELS)
  const prev = modelOf(recent[recent.length - 1] ?? '')
  const all = MODELS.filter((m) => m.size === size)
  let pool = all.filter((m) => !last.includes(m.id) && (!prev || m.theme !== prev.theme))
  if (!pool.length) pool = all.filter((m) => !last.includes(m.id))
  if (!pool.length) pool = all.filter((m) => m.id !== prev?.id)
  return pool[Math.floor(rnd() * pool.length) % pool.length]
}

/** 托盤裡的一塊：kind 是種類；step 是第幾步要用的（第 4 級；-1：多放的、用不到的那幾塊） */
export interface TrayItem {
  id: number
  kind: string
  b: Brick
  step: number
}

/** 把積木搬到原點（托盤、拖著的時候畫） */
export const atOrigin = (b: Brick): Brick => ({ ...b, x: 0, z: 0, y: 0 })

/**
 * 多放幾塊用不到的（不說錯，放上去會彈回來）：同大小換一個模型裡沒有的顏色，或同顏色換大小（寬一格、窄一格）。
 * 種類不會跟要用的任何一塊一樣。
 */
export function extras(target: readonly Brick[], n: number, rnd: Rnd = Math.random): Brick[] {
  const used = new Set(target.map(kindOf))
  const colors = new Set(target.map((b) => b.color))
  const free = COLOR_IDS.filter((c) => !colors.has(c) && c !== 'D')
  const cands: Brick[] = []
  for (const b of target) {
    if (b.shape === 'wheel') continue
    for (const c of free) cands.push({ ...atOrigin(b), color: c as ColorId })
    const max = b.shape === 'brick' ? 4 : b.shape.startsWith('slope') || b.shape.startsWith('eye') ? 2 : 1
    for (const w of [b.w - 1, b.w + 1]) if (w >= 1 && w <= max) cands.push({ ...atOrigin(b), w, shape: w === 1 && b.shape === 'eyeR' ? 'eyeL' : b.shape })
  }
  const out: Brick[] = []
  const seen = new Set<string>()
  while (out.length < n && cands.length) {
    const [c] = cands.splice(Math.floor(rnd() * cands.length) % cands.length, 1)
    const k = kindOf(c)
    if (used.has(k) || seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}

/** 第 4 級的步驟：照放得上去的順序（下面先），同一層的一步最多 3 塊；換層就換一步 */
export function stepsOf(target: readonly Brick[]): number[][] {
  const order = buildOrder(target) ?? target.map((_, i) => i)
  const out: number[][] = []
  for (const i of order) {
    const cur = out[out.length - 1]
    if (cur && cur.length < STEP_MAX && target[cur[0]].z === target[i].z) cur.push(i)
    else out.push([i])
  }
  // 太碎的（只有 1 塊的一步，下一步也只有 1～2 塊）併起來：一步 2～3 塊比較好看圖
  for (let k = 0; k < out.length - 1; k++) {
    if (out[k].length + out[k + 1].length <= STEP_MAX && (out[k].length === 1 || out[k + 1].length === 1)) {
      out[k] = [...out[k], ...out[k + 1]]
      out.splice(k + 1, 1)
      k--
    }
  }
  return out
}

export interface BlocksRound {
  level: BlocksLevel
  model: Model
  deep: boolean
  /** 要蓋的積木（模型的座標，第 0 欄是模型最左邊） */
  target: Brick[]
  /** 托盤（已經洗好牌） */
  tray: TrayItem[]
  /** 第 4 級：每一步要放的積木（target 的編號）；其他級 null */
  steps: number[][] | null
}

function shuffle<T>(a: T[], rnd: Rnd): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function blocksRound(level: BlocksLevel, recent: readonly string[], rnd: Rnd = Math.random): BlocksRound {
  const L = LEVELS[level]
  const model = pickModel(level, recent, rnd)
  const target = modelBricks(model, L.deep)
  const steps = L.steps ? stepsOf(target) : null
  const stepOf = (i: number) => (steps ? steps.findIndex((s) => s.includes(i)) : 0)
  const real: TrayItem[] = target.map((b, i) => ({ id: i, kind: kindOf(b), b: atOrigin(b), step: stepOf(i) }))
  const more: TrayItem[] = extras(target, L.extra, rnd).map((b, k) => ({ id: target.length + k, kind: kindOf(b), b, step: -1 }))
  return { level, model, deep: L.deep, target, tray: shuffle([...real, ...more], rnd), steps }
}

/** 這一塊現在放得上去嗎（下面或旁邊撐住它的已經放好了） */
export function placeable(target: readonly Brick[], placed: readonly boolean[], i: number): boolean {
  return !placed[i] && supported(target[i], target.filter((_, k) => placed[k]))
}

/** 下一塊可以放的（提示、示範用）：照放的順序，第一塊還沒放、放得上去的；allowed 限制在這一步裡 */
export function nextTarget(target: readonly Brick[], placed: readonly boolean[], allowed?: readonly number[]): number | null {
  const order = buildOrder(target) ?? target.map((_, i) => i)
  return order.find((i) => (!allowed || allowed.includes(i)) && placeable(target, placed, i)) ?? null
}

/** 拿著這一種，可以放到哪幾塊的位置（還沒放的、同一種；allowed 限制在這一步裡） */
export const spotsFor = (target: readonly Brick[], placed: readonly boolean[], kind: string, allowed?: readonly number[]) =>
  target.map((_, i) => i).filter((i) => !placed[i] && kindOf(target[i]) === kind && (!allowed || allowed.includes(i)))

// ── 進度 ─────────────────────────────────────────────────────

export interface BlocksState extends LevelState {
  /** 最近蓋過的模型（新的在後面，最多留 RECENT_MODELS 個） */
  models: string[]
}

export function normalizeBlocks(raw: unknown): BlocksState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<BlocksState>
  const level = Number.isInteger(o.level) ? Math.min(BLOCKS_MAX, Math.max(1, o.level as number)) : 1
  const recent = Array.isArray(o.recent) ? o.recent.filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date, ok: !!x.ok })) : []
  const taught = Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : []
  const models = Array.isArray(o.models) ? o.models.filter((x) => typeof x === 'string').slice(-RECENT_MODELS) : []
  return { level, recent, taught, models }
}

/** 蓋完一個：記住這個模型、照結果升降級（順利蓋完就升一級，跟拼圖一樣） */
export function afterBlocks(s: BlocksState, r: { model: string; date: string; wrongs: number; shown: boolean; counted: boolean }): BlocksState {
  const models = [...s.models.filter((m) => m !== r.model), r.model].slice(-RECENT_MODELS)
  const first = r.wrongs <= OK_WRONGS && !r.shown
  if (r.counted && first && s.level < BLOCKS_MAX) return { ...s, level: s.level + 1, recent: [], models }
  const lv = stepLevel(s, { date: r.date, first, counted: r.counted }, BLOCKS_MAX)
  return { ...s, ...lv, models }
}

// ── 自由蓋 ───────────────────────────────────────────────────

/** 自由蓋的底板：寬 12 格、高 9 層；最多放 60 塊 */
export const FREE_COLS = 12
export const FREE_ROWS = 9
export const FREE_MAX = 60

/**
 * 自由蓋放下去：從上面掉下來，停在底下最高的那一塊上面（x 夾在底板裡）。太高（超過 FREE_ROWS 層）放不下：null。
 */
export function dropFree(bricks: readonly Brick[], b: Brick, x: number): Brick | null {
  const cx = Math.max(0, Math.min(FREE_COLS - b.w, x))
  let z = 0
  for (const o of bricks) if (o.x < cx + b.w && cx < o.x + o.w) z = Math.max(z, o.z + 1)
  if (z >= FREE_ROWS) return null
  return { ...b, x: cx, z, y: 0, d: 1 }
}

/** 上面有沒有壓著別的（壓著的拿不起來） */
export const covered = (bricks: readonly Brick[], b: Brick) => bricks.some((o) => o !== b && o.z === b.z + 1 && o.x < b.x + b.w && b.x < o.x + o.w)
