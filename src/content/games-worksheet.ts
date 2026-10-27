// 工作線 B：學習單題型的題目產生器（找出全部、用筆圈起來、立體形狀、功能分類）
// 只用 type-only import 取用 games.ts 的型別，避免循環 import
import type { GameDef } from './games'
import { COLORS, SHAPES, SOLIDS, SOLID_LOOKALIKE, BALLOON_KINDS, type BalloonKind, type ShapeId, type SolidId } from './park'
import { VOCAB, USE_AMBIGUOUS, USE_EXAMPLES, usesOf, vocab, type UseTag } from './vocab'
import { CATEGORIES, COLOR_LOOKALIKE, SHAPE_LOOKALIKE, SHEET_COLORS_EASY, SHEET_COLORS_HARD, type CategoryId } from './worksheet-data'
import { pickTarget } from '../lib/adaptive'
import { pick, rand, sample, shuffle } from '../lib/random'

/** 學習單上的一個東西：Fluent 圖示、氣球、平面形狀或立體形狀 */
export type Thing =
  | { t: 'emoji'; icon: string }
  | { t: 'balloon'; kind: BalloonKind; hex: string }
  | { t: 'shape'; shape: ShapeId; hex: string }
  | { t: 'solid'; solid: SolidId; hex: string }

export interface SheetThing {
  id: string
  v: Thing
  /** 符合題目條件（要找出來的） */
  ok: boolean
  /** 點錯時說的那一句：That's a | ball. / This is | red. */
  say?: string
  /** 大小變化：同一種形狀有大有小，孩子要學會不看大小 */
  scale: number
}

export interface SheetItem {
  /** 概念，例如 apple、blue、circle、cube、rain */
  itemId: string
  skill: string
  /** 點選版的題目：Find all the | apples! */
  prompt: string
  /** 圈選版的題目：Circle all the | apples! */
  lasso: string
  things: SheetThing[]
  /** 教學卡：兩個例子、兩句話（先看例子，再考） */
  teach: { examples: Thing[]; lines: string[] }
}

type Basis = 'category' | 'color' | 'shape' | 'solid' | 'use'
const hexOf = (id: string) => COLORS.find((c) => c.id === id)!.hex
const SHAPE_IDS = ['circle', 'triangle', 'square', 'star', 'heart'] as const

/** 從 pool 依序取 n 個：先不重複，用完才重複（同一張學習單上可以有好幾顆蘋果） */
function cycle<T>(pool: readonly T[], n: number): T[] {
  const out: T[] = []
  while (out.length < n) out.push(...shuffle(pool))
  return out.slice(0, n)
}

/** 先放「長得像」的干擾，再補其他的 */
function preferFirst<T>(first: T[], rest: T[], n: number): T[] {
  const f = shuffle(first).slice(0, n)
  return [...f, ...cycle(rest.filter((x) => !f.includes(x)).length ? rest.filter((x) => !f.includes(x)) : rest, n - f.length)]
}

interface Parts {
  targets: Omit<SheetThing, 'id' | 'ok'>[]
  others: Omit<SheetThing, 'id' | 'ok'>[]
  examples: Thing[]
}

function category(c: CategoryId, lv: number, n: number, k: number): Parts {
  const d = CATEGORIES[c]
  const pool: string[] = lv >= 4 ? [...d.hard, ...d.easy] : lv >= 3 ? d.hard : d.easy
  return {
    targets: cycle(d.targets, k).map((icon) => ({ v: { t: 'emoji', icon }, scale: 1, say: `ws.isa.${icon}` })),
    others: cycle(pool, n - k).map((icon) => ({ v: { t: 'emoji', icon }, scale: 1, say: `ws.isa.${icon}` })),
    examples: d.examples.map((icon) => ({ t: 'emoji', icon }) as Thing),
  }
}

function color(c: string, lv: number, n: number, k: number): Parts {
  const kinds = cycle(BALLOON_KINDS, n)
  // 高難度：答案裡混一個同色的形狀或立體形狀（形狀不同但同色）
  const odd = (hex: string): Thing => (Math.random() < 0.5 ? { t: 'shape', shape: pick(SHAPE_IDS), hex } : { t: 'solid', solid: pick(SOLIDS).id, hex })
  const targets = kinds.slice(0, k).map((kind, i) => ({ v: lv >= 3 && i === k - 1 ? odd(hexOf(c)) : ({ t: 'balloon', kind, hex: hexOf(c) } as Thing), scale: 1 }))
  // 一定要有熊形氣球（學習單原題），第 2 級起
  if (lv >= 2 && !targets.some((t) => t.v.t === 'balloon' && t.v.kind === 'bear')) targets[0] = { v: { t: 'balloon', kind: 'bear', hex: hexOf(c) }, scale: 1 }
  const easy = SHEET_COLORS_EASY.filter((x) => x !== c) as string[]
  const all = [...SHEET_COLORS_EASY, ...SHEET_COLORS_HARD].filter((x) => x !== c) as string[]
  const cols = lv >= 3 ? preferFirst(COLOR_LOOKALIKE[c] ?? [], all, n - k) : cycle(easy, n - k)
  const others = cols.map((x, i) => ({ v: lv >= 3 && i === 0 ? odd(hexOf(x)) : ({ t: 'balloon', kind: kinds[k + i], hex: hexOf(x) } as Thing), scale: 1, say: `p.thisis.color.${x}` }))
  return { targets, others, examples: [{ t: 'balloon', kind: 'round', hex: hexOf(c) }, { t: 'balloon', kind: 'bear', hex: hexOf(c) }] }
}

/** 平面形狀：同一種形狀換顏色、換大小 */
function shape(s: ShapeId, lv: number, n: number, k: number): Parts {
  const hexes = cycle(COLORS.map((c) => c.hex), n)
  const scales = [1, 0.78, 0.64]
  const pool = SHAPE_IDS.filter((x) => x !== s) as ShapeId[]
  const look = (lv >= 3 ? [...(SHAPE_LOOKALIKE[s] ?? [])] : []) as ShapeId[]
  const kinds = lv >= 3 ? preferFirst(look, pool, n - k) : cycle(pool, n - k)
  return {
    targets: Array.from({ length: k }, (_, i) => ({ v: { t: 'shape', shape: s, hex: hexes[i] } as Thing, scale: lv >= 2 ? scales[i % 3] : 1 })),
    others: kinds.map((x, i) => ({ v: { t: 'shape', shape: x, hex: hexes[k + i] } as Thing, scale: lv >= 2 ? pick(scales) : 1, say: `p.thisis.shape.${x}` })),
    examples: [{ t: 'shape', shape: s, hex: '#F0B088' }, { t: 'shape', shape: s, hex: '#A3C4E4' }],
  }
}

function solid(s: SolidId, lv: number, n: number, k: number, pool: SolidId[]): Parts {
  const hexes = cycle(COLORS.slice(0, 6).map((c) => c.hex), n)
  const rest = pool.filter((x) => x !== s)
  const kinds = lv >= 3 ? preferFirst(SOLID_LOOKALIKE[s].filter((x) => pool.includes(x)), rest, n - k) : cycle(rest, n - k)
  return {
    targets: Array.from({ length: k }, (_, i) => ({ v: { t: 'solid', solid: s, hex: hexes[i] } as Thing, scale: lv >= 2 ? [1, 0.82, 0.7][i % 3] : 1 })),
    others: kinds.map((x, i) => ({ v: { t: 'solid', solid: x, hex: hexes[k + i] } as Thing, scale: lv >= 2 ? pick([1, 0.85]) : 1, say: `ws.thisis.${x}` })),
    examples: [{ t: 'solid', solid: s, hex: '#F0B088' }, { t: 'solid', solid: s, hex: '#8FCBAA' }],
  }
}

/** 功能分類：低難度的干擾是動物、交通工具（差很多），高難度是其他生活用品（同一類） */
function use(u: UseTag, lv: number, n: number, k: number): Parts {
  const yes = VOCAB.filter((v) => usesOf(v).includes(u))
  const no = VOCAB.filter((v) => !usesOf(v).includes(u) && !USE_AMBIGUOUS[u].includes(v.id))
  const far = no.filter((v) => v.theme === 'animal' || v.theme === 'vehicle')
  const near = no.filter((v) => v.theme === 'home' || v.theme === 'food')
  const others = lv >= 3 ? preferFirst(near, far, n - k) : lv === 2 ? preferFirst(sample(near, 1), far, n - k) : sample(far, n - k)
  return {
    targets: sample(yes, k).map((v) => ({ v: { t: 'emoji', icon: v.icon } as Thing, scale: 1, say: `z.itis.${v.id}` })),
    others: others.map((v) => ({ v: { t: 'emoji', icon: v.icon } as Thing, scale: 1, say: `z.itis.${v.id}` })),
    examples: USE_EXAMPLES[u].map((id) => ({ t: 'emoji', icon: vocab(id).icon }) as Thing),
  }
}

const basisOf = (c: string): Basis =>
  c in CATEGORIES ? 'category' : COLORS.some((x) => x.id === c) ? 'color' : SOLIDS.some((x) => x.id === c) ? 'solid' : SHAPES.some((x) => x.id === c) ? 'shape' : 'use'

/** 題目大小：第 1 級 4 個找 2 個，第 2 級 5 個找 2–3 個，之後 6 個找 3 個（學習單上大約就是這個量） */
function size(lv: number): { n: number; k: number } {
  if (lv <= 1) return { n: 4, k: 2 }
  if (lv === 2) return { n: 5, k: 2 + rand(2) }
  if (lv === 3) return { n: 6, k: 3 }
  return { n: 6, k: 2 + rand(2) }
}

function build(c: string, lv: number, skillPrefix: string, n: number, k: number, solidPool: SolidId[] = SOLIDS.map((s) => s.id)): SheetItem {
  const b = basisOf(c)
  const p =
    b === 'category' ? category(c as CategoryId, lv, n, k)
    : b === 'color' ? color(c, lv, n, k)
    : b === 'shape' ? shape(c as ShapeId, lv, n, k)
    : b === 'solid' ? solid(c as SolidId, lv, n, k, solidPool)
    : use(c as UseTag, lv, n, k)
  const things = shuffle([...p.targets.map((t) => ({ ...t, ok: true })), ...p.others.map((t) => ({ ...t, ok: false }))]).map((t, i) => ({ ...t, id: `t${i}` }))
  return {
    itemId: c,
    skill: `${skillPrefix}:${c}`,
    // 立體形狀第 1 級只找一個：「Where is the | cube?」
    prompt: b === 'solid' && k === 1 ? `ws.where.${c}` : `ws.all.${c}`,
    lasso: `ws.circle.${c}`,
    things,
    teach: { examples: p.examples, lines: [`teach.ws.${c}.0`, `teach.ws.${c}.1`] },
  }
}

const FIND_POOL = (lv: number) => [
  'apple', 'chick', 'red', 'blue', 'yellow', 'circle', 'triangle', 'square',
  ...(lv >= 2 ? ['bug', 'car', 'green', 'star', 'heart'] : []),
  ...(lv >= 3 ? ['fruit', 'animal', 'orange', 'purple', 'pink'] : []),
]

export type SheetMaker = (level: number, recent: string[]) => SheetItem

/** 找出全部（彩虹公園）：類別、顏色、形狀輪流出 */
const pFindAll: SheetMaker = (lv, recent) => {
  const c = pickTarget(FIND_POOL(lv), (x) => `all:${x}`, recent)
  const { n, k } = size(lv)
  return build(c, lv, 'all', n, k)
}

/** 用筆圈起來：同一套題目，外加學習單原題「圈出所有正方體積木（避開三角柱）」 */
const pLasso: SheetMaker = (lv, recent) => {
  const pool = [...FIND_POOL(lv), ...(lv >= 2 ? ['cube'] : [])]
  const c = pickTarget(pool, (x) => `lasso:${x}`, recent)
  // 圈選比點選難：同一級少一個東西，圈與圈之間才有空間
  const { n, k } = size(lv)
  return build(c, lv, 'lasso', Math.min(n, 5), Math.min(k, 3), ['cube', 'prism', 'cylinder', 'sphere'])
}

/** 找立體形狀：第 1 級三選一（Where is the cube?），之後是找出全部 */
const pSolid: SheetMaker = (lv, recent) => {
  const pool: SolidId[] = ['cube', 'sphere', 'cylinder', ...(lv >= 2 ? (['cone'] as SolidId[]) : []), ...(lv >= 3 ? (['prism'] as SolidId[]) : [])]
  const c = pickTarget(pool, (x) => `all:${x}`, recent as SolidId[])
  const { n, k } = lv <= 1 ? { n: 3, k: 1 } : size(lv)
  return build(c, lv, 'all', n, k, pool)
}

/** 功能分類（動物村）：下雨天、吃的、穿的，熟了再加洗澡、睡覺 */
const zUse: SheetMaker = (lv, recent) => {
  const pool: UseTag[] = ['rain', 'eat', 'wear', ...(lv >= 2 ? (['bath', 'bed'] as UseTag[]) : [])]
  const c = pickTarget(pool, (x) => `all:${x}`, recent as UseTag[])
  const { n, k: k0 } = size(lv)
  const k = Math.min(k0, VOCAB.filter((v) => usesOf(v).includes(c)).length)
  return build(c, lv, 'all', n, k)
}

export const SHEET_MAKERS: Record<string, SheetMaker> = {
  'p-findall': pFindAll,
  'p-lasso': pLasso,
  'p-solid': pSolid,
  'z-use': zUse,
}

export const sheetMaker = (def: GameDef): SheetMaker => SHEET_MAKERS[def.id]
