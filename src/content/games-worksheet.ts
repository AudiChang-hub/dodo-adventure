// 工作線 B：學習單題型的題目產生器（找出全部、用筆圈起來、立體形狀、功能分類）
// 只用 type-only import 取用 games.ts 的型別，避免循環 import
//
// 單字也不教不考（2026-10-28）：
// - 點錯時唸名字（This is a | ball.）只唸教過的字；沒教過的字不唸名字，只有畫面上的回饋（SheetGame 改說「再試一次」）。
// - 干擾的圖先用教過的字，不夠才放沒教過的圖（只是圖，不唸名字、不考它）。
// - 家長勾了「他不認得」的字：不當例子、不放上學習單。「找出全部的蘋果」這種題目本身就是那個字時，先重新教過。
// - 立體形狀只出 block（正方體）、ball（球）；圓柱、圓錐、三角柱延後。
import type { GameDef } from './games'
import { COLORS, SHAPES, SOLIDS, ACTIVE_SOLIDS, SOLID_LOOKALIKE, BALLOON_KINDS, type BalloonKind, type ShapeId, type SolidId } from './park'
import { VOCAB, USE_AMBIGUOUS, USE_EXAMPLES, EXAMPLE_ALT_ICON, usesOf, useLine, vocab, type UseTag, type VocabEntry } from './vocab'
import { CATEGORIES, COLOR_LOOKALIKE, SHAPE_LOOKALIKE, SHEET_COLORS_EASY, SHEET_COLORS_HARD, type CategoryId } from './worksheet-data'
import { keyOfIcon, keyOfVocab, thisIs } from './lexicon'
import { isNew, pickPreferred, pickTarget } from '../lib/adaptive'
import { isUnknown, needsTeach, usable } from '../lib/words'
import { themeNow } from '../lib/theme-play'
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
  /** 點錯時說的那一句：This is a | ball. / This is | red.（沒教過的不唸，沒有這個欄位） */
  say?: string
  /** 這張圖是哪個單字（lexicon.ts 的 key；氣球、形狀沒有）：自動檢查用 */
  word?: string
  /** 大小變化：同一種形狀有大有小，孩子要學會不看大小 */
  scale: number
}

export interface SheetItem {
  /** 概念，例如 apple、blue、circle、cube、rain */
  itemId: string
  skill: string
  /** 點選版的題目：Find all the | apples! */
  prompt: string
  /** 圈選版的題目：和點選版同一句（Find all the | apples!），圈的動作由「Use your pen!」示範 */
  lasso: string
  things: SheetThing[]
  /** 教學卡：兩個例子、兩句話（先看例子，再考） */
  teach: { examples: Thing[]; lines: string[] }
  /** 教學卡上教了哪些單字：出題規劃決定要跑教學卡時記成「教過」（lib/words.ts） */
  teachWords?: string[]
  /** 概念學過了、但這一題還是要先跑教學卡（題目本身的字家長勾了「他不認得」） */
  needTeach?: boolean
}

type Basis = 'category' | 'color' | 'shape' | 'solid' | 'use'
const hexOf = (id: string) => COLORS.find((c) => c.id === id)!.hex
const SHAPE_IDS = ['circle', 'triangle', 'square', 'star', 'heart'] as const

/** 從 pool 依序取 n 個：先不重複，用完才重複（同一張學習單上可以有好幾顆蘋果） */
function cycle<T>(pool: readonly T[], n: number): T[] {
  if (!pool.length) return []
  const out: T[] = []
  while (out.length < n) out.push(...shuffle(pool))
  return out.slice(0, n)
}

/** 先放 first（長得像的、教過的），再補其他的 */
function preferFirst<T>(first: T[], rest: T[], n: number): T[] {
  const f = shuffle(first).slice(0, n)
  const r = rest.filter((x) => !f.includes(x))
  return [...f, ...cycle(r.length ? r : rest.length ? rest : first, n - f.length)]
}

interface Parts {
  targets: Omit<SheetThing, 'id' | 'ok'>[]
  others: Omit<SheetThing, 'id' | 'ok'>[]
  examples: Thing[]
  lines: string[]
  teachWords: string[]
  needTeach?: boolean
}

/** 這一題會不會先跑教學卡（新的概念）：卡上的例子這一題就算教過 */
type Known = (key: string | null) => boolean

/** 圖示 → 學習單上的東西：教過的字點錯時唸名字 */
function emojiThing(icon: string, known: Known): Omit<SheetThing, 'id' | 'ok'> {
  const k = keyOfIcon(icon)
  return { v: { t: 'emoji', icon }, scale: 1, ...(k ? { word: k } : {}), ...(k && known(k) ? { say: thisIs(k) } : {}) }
}

/** 類別題的名字就是一個單字（找出全部的蘋果、小雞、車子）：那個字家長勾了不認得，要先重新教 */
const CATEGORY_WORD: Partial<Record<CategoryId, string>> = { apple: 'apple', chick: 'chick', car: 'car' }

function category(c: CategoryId, lv: number, n: number, k: number, teaching: boolean): Parts {
  const d = CATEGORIES[c]
  const flagged = (icon: string) => {
    const key = keyOfIcon(icon)
    return !!key && isUnknown(key)
  }
  // 例子：預設的兩張，家長勾掉的換成其他答案圖（句子改成 This is a | ___.）
  const subs = d.targets.filter((x) => !d.examples.includes(x as never) && !flagged(x))
  const ex = d.examples.map((icon, i) => (flagged(icon) && subs.length ? { icon: subs.shift()!, line: '' } : { icon, line: d.teach[i] ? `teach.ws.${c}.${i}` : '' }))
  const exKeys = ex.map((e) => keyOfIcon(e.icon)).filter((x): x is string => !!x)
  const word = CATEGORY_WORD[c]
  const needTeach = !!word && !teaching && needsTeach(word)
  const known: Known = (key) => !!key && (usable(key) || ((teaching || needTeach) && exKeys.includes(key)))
  const targets = d.targets.filter((x) => !flagged(x))
  const pool = (lv >= 4 ? [...d.hard, ...d.easy] : lv >= 3 ? d.hard : d.easy).filter((x) => !flagged(x))
  // 干擾先用教過的字，不夠才放沒教過的圖（不唸名字）
  const others = preferFirst(
    pool.filter((x) => known(keyOfIcon(x))),
    pool.filter((x) => !known(keyOfIcon(x))),
    n - k,
  )
  return {
    targets: cycle(targets.length ? targets : d.targets, k).map((icon) => emojiThing(icon, known)),
    others: others.map((icon) => emojiThing(icon, known)),
    examples: ex.map((e) => ({ t: 'emoji', icon: e.icon }) as Thing),
    lines: ex.map((e) => e.line || thisIs(keyOfIcon(e.icon) ?? c)),
    teachWords: exKeys,
    needTeach,
  }
}

/** 顏色、形狀、立體形狀是概念（技能代碼 color:red、all:cube…）：學過的才唸名字 */
const conceptKnown = (...keys: string[]) => keys.some((k) => !isNew(k))

function color(c: string, lv: number, n: number, k: number): Parts {
  const kinds = cycle(BALLOON_KINDS, n)
  // 高難度：答案裡混一個同色的形狀或立體形狀（形狀不同但同色）
  const odd = (hex: string): Thing => (Math.random() < 0.5 ? { t: 'shape', shape: pick(SHAPE_IDS), hex } : { t: 'solid', solid: pick(ACTIVE_SOLIDS), hex })
  const targets = kinds.slice(0, k).map((kind, i) => ({ v: lv >= 3 && i === k - 1 ? odd(hexOf(c)) : ({ t: 'balloon', kind, hex: hexOf(c) } as Thing), scale: 1 }))
  // 一定要有熊形氣球（學習單原題），第 2 級起
  if (lv >= 2 && !targets.some((t) => t.v.t === 'balloon' && t.v.kind === 'bear')) targets[0] = { v: { t: 'balloon', kind: 'bear', hex: hexOf(c) }, scale: 1 }
  const easy = SHEET_COLORS_EASY.filter((x) => x !== c) as string[]
  const all = [...SHEET_COLORS_EASY, ...SHEET_COLORS_HARD].filter((x) => x !== c) as string[]
  const cols = lv >= 3 ? preferFirst(COLOR_LOOKALIKE[c] ?? [], all, n - k) : cycle(easy, n - k)
  const others = cols.map((x, i) => ({
    v: lv >= 3 && i === 0 ? odd(hexOf(x)) : ({ t: 'balloon', kind: kinds[k + i], hex: hexOf(x) } as Thing),
    scale: 1,
    ...(conceptKnown(`color:${x}`, `all:${x}`) ? { say: `p.thisis.color.${x}` } : {}),
  }))
  return { targets, others, examples: [{ t: 'balloon', kind: 'round', hex: hexOf(c) }, { t: 'balloon', kind: 'bear', hex: hexOf(c) }], lines: [`teach.ws.${c}.0`, `teach.ws.${c}.1`], teachWords: [] }
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
    others: kinds.map((x, i) => ({
      v: { t: 'shape', shape: x, hex: hexes[k + i] } as Thing,
      scale: lv >= 2 ? pick(scales) : 1,
      ...(conceptKnown(`shape:${x}`, `all:${x}`) ? { say: `p.thisis.shape.${x}` } : {}),
    })),
    examples: [{ t: 'shape', shape: s, hex: '#F0B088' }, { t: 'shape', shape: s, hex: '#A3C4E4' }],
    lines: [`teach.ws.${s}.0`, `teach.ws.${s}.1`],
    teachWords: [],
  }
}

function solid(s: SolidId, lv: number, n: number, k: number, pool: SolidId[]): Parts {
  const hexes = cycle(COLORS.slice(0, 6).map((c) => c.hex), n)
  const rest = pool.filter((x) => x !== s)
  const kinds = lv >= 3 ? preferFirst(SOLID_LOOKALIKE[s].filter((x) => pool.includes(x)), rest, n - k) : cycle(rest, n - k)
  return {
    targets: Array.from({ length: k }, (_, i) => ({ v: { t: 'solid', solid: s, hex: hexes[i] } as Thing, scale: lv >= 2 ? [1, 0.82, 0.7][i % 3] : 1 })),
    others: kinds.map((x, i) => ({
      v: { t: 'solid', solid: x, hex: hexes[k + i] } as Thing,
      scale: lv >= 2 ? pick([1, 0.85]) : 1,
      ...(conceptKnown(`all:${x}`, `lasso:${x}`) ? { say: `ws.thisis.${x}` } : {}),
    })),
    examples: [{ t: 'solid', solid: s, hex: '#F0B088' }, { t: 'solid', solid: s, hex: '#8FCBAA' }],
    lines: [`teach.ws.${s}.0`, `teach.ws.${s}.1`],
    teachWords: [],
  }
}

/** 功能分類的兩個例子：預設的、家長勾掉的往後換；只有一個（下雨天的 umbrella）就用它的另一張圖 */
export function useExamples(u: UseTag): { v: VocabEntry; icon: string }[] {
  const c = USE_EXAMPLES[u].map(vocab).filter((x) => x && !isUnknown(keyOfVocab(x.id))).slice(0, 2)
  if (c.length === 1) return [{ v: c[0], icon: c[0].icon }, { v: c[0], icon: EXAMPLE_ALT_ICON[c[0].id] ?? c[0].icon }]
  return c.map((v) => ({ v, icon: v.icon }))
}

/** 功能分類：低難度的干擾是動物、交通工具（差很多），高難度是其他生活用品（同一類） */
function use(u: UseTag, lv: number, n: number, k: number, teaching: boolean): Parts {
  const ex = useExamples(u)
  const exKeys = [...new Set(ex.map((e) => keyOfVocab(e.v.id)))]
  const known = (v: VocabEntry) => usable(keyOfVocab(v.id)) || (teaching && exKeys.includes(keyOfVocab(v.id)))
  const say = (v: VocabEntry) => (known(v) ? { say: thisIs(keyOfVocab(v.id)) } : {})
  const ok = (v: VocabEntry) => !isUnknown(keyOfVocab(v.id))
  const yes = VOCAB.filter((v) => usesOf(v).includes(u) && ok(v))
  const no = VOCAB.filter((v) => !usesOf(v).includes(u) && !USE_AMBIGUOUS[u].includes(v.id) && ok(v))
  const far = no.filter((v) => v.theme === 'animal' || v.theme === 'vehicle')
  const near = no.filter((v) => v.theme === 'home' || v.theme === 'food')
  // 干擾先用教過的字（不夠才放沒教過的圖，不唸名字）；答案也一樣，教過的先放
  const kfar = far.filter(known)
  const knear = near.filter(known)
  const others =
    lv >= 3 ? preferFirst(knear.length ? knear : near, kfar.length ? kfar : far, n - k)
    : lv === 2 ? preferFirst(sample(knear.length ? knear : near, 1), kfar.length ? kfar : far, n - k)
    : preferFirst(kfar, far, n - k)
  const targets = preferFirst(yes.filter(known), yes, k)
  // 只有一個答案的分類（下雨天）：同一個字換另一張圖，學習單上才不會全是同一張
  const iconOf = (v: VocabEntry, i: number) => (i % 2 && EXAMPLE_ALT_ICON[v.id] ? EXAMPLE_ALT_ICON[v.id] : v.icon)
  return {
    targets: targets.map((v, i) => ({ v: { t: 'emoji', icon: iconOf(v, i) } as Thing, scale: 1, word: keyOfVocab(v.id), ...say(v) })),
    others: others.map((v) => ({ v: { t: 'emoji', icon: v.icon } as Thing, scale: 1, word: keyOfVocab(v.id), ...say(v) })),
    examples: ex.map((e) => ({ t: 'emoji', icon: e.icon }) as Thing),
    lines: ex.map((e, i) => useLine(u, e.v.id, i)),
    teachWords: exKeys,
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

function build(c: string, lv: number, skillPrefix: string, n: number, k: number, solidPool: SolidId[] = ACTIVE_SOLIDS): SheetItem {
  const b = basisOf(c)
  const skill = `${skillPrefix}:${c}`
  // 圈選：概念在「找出全部」學過就不用再看教學卡（pick.ts 的 planSheet）
  const teaching = isNew(skill) && (skillPrefix !== 'lasso' || isNew(`all:${c}`))
  const p =
    b === 'category' ? category(c as CategoryId, lv, n, k, teaching)
    : b === 'color' ? color(c, lv, n, k)
    : b === 'shape' ? shape(c as ShapeId, lv, n, k)
    : b === 'solid' ? solid(c as SolidId, lv, n, k, solidPool)
    : use(c as UseTag, lv, n, k, teaching)
  const things = shuffle([...p.targets.map((t) => ({ ...t, ok: true })), ...p.others.map((t) => ({ ...t, ok: false }))]).map((t, i) => ({ ...t, id: `t${i}` }))
  const prompt = b === 'solid' && k === 1 ? `ws.where.${c}` : `ws.all.${c}`
  return {
    itemId: c,
    skill,
    // 立體形狀第 1 級只找一個：「Where is the | block?」
    prompt,
    lasso: `ws.circle.${c}`,
    things,
    teach: { examples: p.examples, lines: p.lines },
    teachWords: p.teachWords,
    ...(p.needTeach ? { needTeach: true } : {}),
  }
}

export const FIND_POOL = (lv: number) => [
  'apple', 'chick', 'red', 'blue', 'yellow', 'circle', 'triangle', 'square',
  ...(lv >= 2 ? ['bug', 'car', 'green', 'star', 'heart'] : []),
  ...(lv >= 3 ? ['fruit', 'animal', 'orange', 'purple', 'pink'] : []),
]

export type SheetMaker = (level: number, recent: string[]) => SheetItem

/** 主題式冒險：主題優先的題目（公車旅行找出全部的車、黃色的東西；下雨天找下雨天用的） */
const themeSort = (pool: readonly string[]) => pool.filter((x) => themeNow()?.sort.includes(x))

/** 找出全部（彩虹公園）：類別、顏色、形狀輪流出 */
const pFindAll: SheetMaker = (lv, recent) => {
  const pool = FIND_POOL(lv)
  const c = pickPreferred(themeSort(pool), pool, (x) => `all:${x}`, recent)
  const { n, k } = size(lv)
  return build(c, lv, 'all', n, k)
}

/** 用筆圈起來：同一套題目，外加學習單原題「圈出所有正方體積木」（三角柱延後，改成避開球） */
const pLasso: SheetMaker = (lv, recent) => {
  const pool = [...FIND_POOL(lv), ...(lv >= 2 ? ['cube'] : [])]
  const c = pickPreferred(themeSort(pool), pool, (x) => `lasso:${x}`, recent)
  // 圈選比點選難：同一級少一個東西，圈與圈之間才有空間
  const { n, k } = size(lv)
  return build(c, lv, 'lasso', Math.min(n, 5), Math.min(k, 3), ACTIVE_SOLIDS)
}

/** 找立體形狀：第 1 級三選一（Where is the block?），之後是找出全部。只有 block、ball 兩種（其餘延後） */
const pSolid: SheetMaker = (lv, recent) => {
  const pool: SolidId[] = [...ACTIVE_SOLIDS]
  const c = pickTarget(pool, (x) => `all:${x}`, recent as SolidId[])
  const { n, k } = lv <= 1 ? { n: 3, k: 1 } : size(lv)
  return build(c, lv, 'all', n, k, pool)
}

/** 功能分類（動物村）：下雨天、吃的、穿的，熟了再加洗澡、睡覺。家長把例子都勾掉的分類先不出 */
const zUse: SheetMaker = (lv, recent) => {
  const all: UseTag[] = ['rain', 'eat', 'wear', ...(lv >= 2 ? (['bath', 'bed'] as UseTag[]) : [])]
  const fit = all.filter((u) => useExamples(u).length)
  const pool = fit.length ? fit : all
  const c = pickPreferred(pool.filter((x) => themeNow()?.uses?.includes(x)), pool, (x) => `all:${x}`, recent as UseTag[])
  const { n, k } = size(lv)
  return build(c, lv, 'all', n, k)
}

export const SHEET_MAKERS: Record<string, SheetMaker> = {
  'p-findall': pFindAll,
  'p-lasso': pLasso,
  'p-solid': pSolid,
  'z-use': zUse,
}

export const sheetMaker = (def: GameDef): SheetMaker => SHEET_MAKERS[def.id]
