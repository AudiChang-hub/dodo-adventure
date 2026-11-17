// 豆豆收拾的 4 歲玩法（家長 2026-11-17）：原本的 1～5 級熟練了才開，原本的玩法完全不變。
// 只有純函式，scripts/test-sort-seesaw.ts 直接測；畫面在 ./Sort.tsx。
//
//   第 6 級「換規則」（指引 CG-3 的 DCCS，4 歲）：同一堆 4 個東西先照顏色分，分完倒出來，換成照形狀（或照是什麼東西）再分一次。
//     兩個籃子：一個是「紅、圓形」、一個是「藍、三角形」；東西裡有「紅色的三角形」「藍色的圓形」，換規則以後要放到另一邊（衝突題）。
//     換規則時籃子上的牌子從一團顏料翻成形狀的線條（不上色），豆豆說 New rule! Now sort by shape!。
//     升降級只看換規則以後的那 4 個；換規則以前那 4 個是暖身（照樣記作答紀錄）。示範過了以後，偶爾先照形狀、再換成照顏色。
//   第 7 級「兩個一起看」：4 個籃子是 2 個顏色 × 2 種形狀（或東西），牌子上是「紅色的圓形」，要兩個都對才放得進去。
//
// 內容量：顏色 4 個 × 形狀 3 種（一般、餅乾兩種樣子）或自己畫的東西 12 種（長得太像的不放同一局），同一天用過的組合不再出現。
import { COLOR_IDS, SCENE_IDS, SCENES, SHAPE_IDS, TOY_IDS, type Basket, type BinId, type ColorId, type SceneId, type ShapeId, type SortDim, type SortItem, type SortRound, type Thing, type ToyId } from './sort-plan'

export type SortXLevel = 6 | 7
/** 豆豆收拾最高到第幾級（原本的玩法是 1～5，見 ./sort-plan 的 SORT_MAX） */
export const SORT_TOP = 7
/** 第 6 級：換規則以前分幾個（換規則以後同一堆再分一次） */
export const SWITCH_AT = 4
/** 第 6 級示範過了以後，先照形狀（東西）、再換成照顏色的機率 */
export const FLIP_P = 1 / 3
/** 作答紀錄的技能：換規則以後、兩個一起看 */
export const SKILL_SWITCH = 'sort:switch'
export const SKILL_BOTH = 'sort:both'

/** 長得太像、不放在同一局的兩種東西（杯子和碗、碗和盤子、球和氣球） */
const CLASH: [ToyId, ToyId][] = [
  ['cup', 'bowl'],
  ['bowl', 'plate'],
  ['ball', 'balloon'],
]
const clash = (a: ToyId, b: ToyId) => CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
/** 可以放在同一局的兩種東西 */
export const TOY_PAIRS: [ToyId, ToyId][] = TOY_IDS.flatMap((a, i) => TOY_IDS.slice(i + 1).filter((b) => !clash(a, b)).map((b) => [a, b] as [ToyId, ToyId]))
export const SHAPE_PAIRS: [ShapeId, ShapeId][] = SHAPE_IDS.flatMap((a, i) => SHAPE_IDS.slice(i + 1).map((b) => [a, b] as [ShapeId, ShapeId]))
export const COLOR_PAIRS: [ColorId, ColorId][] = COLOR_IDS.flatMap((a, i) => COLOR_IDS.slice(i + 1).map((b) => [a, b] as [ColorId, ColorId]))

/** 東西的樣子：形狀（一般的、餅乾）或自己畫的東西 */
export type Family = 'shape' | 'cookie' | 'thing'
/** 每一種樣子出現的比重（自己畫的東西種類最多） */
const FAMILY_W: [Family, number][] = [
  ['shape', 0.2],
  ['cookie', 0.2],
  ['thing', 0.6],
]

/** 有幾種組合（樣子 × 兩種形狀／東西 × 兩個顏色）：回報、測試用 */
export const comboCount = () => (SHAPE_PAIRS.length * 2 + TOY_PAIRS.length) * COLOR_PAIRS.length

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

/** 2 個籃子各 2 個，同一個籃子不連 3 次（跟 ./sort-plan 的 answerOrder 一樣） */
function order2(ids: string[], rnd: Rnd): string[] {
  const bag = [ids[0], ids[0], ids[1], ids[1]]
  for (let k = 0; k < 20; k++) {
    const o = shuffle(bag, rnd)
    if (!o.some((x, i) => i >= 2 && o[i - 1] === x && o[i - 2] === x)) return o
  }
  return bag
}

/** 東西在哪個情境、收進哪種容器：餅乾進餅乾罐（廚房）、形狀進玩具箱；自己畫的東西找它們都在的那個情境 */
function sceneOf(fam: Family, vals: string[]): { scene: SceneId; bin: BinId } {
  if (fam === 'cookie') return { scene: 'kitchen', bin: 'jar' }
  if (fam === 'shape') return { scene: 'toys', bin: 'toybox' }
  const scene = SCENE_IDS.find((s) => vals.every((v) => SCENES[s].toys?.includes(v as ToyId))) ?? 'toys'
  return { scene, bin: SCENES[scene].bin }
}

/** 一個東西：顏色 c、形狀／東西 v */
function thingOf(fam: Family, c: ColorId, v: string): Thing {
  if (fam === 'thing') return { t: 'toy', toy: v as ToyId, color: c }
  return { t: 'shape', shape: v as ShapeId, color: c, ...(fam === 'cookie' ? { look: 'cookie' as const } : {}) }
}
/** 籃子上只看一個特徵的樣品：一團顏料、形狀的線條、東西的線條（都不給另一個特徵的線索） */
function sampleOf(fam: Family, dim: SortDim, c: ColorId, v: string): Thing {
  if (dim === 'color') return { t: 'swatch', color: c }
  if (fam === 'thing') return { t: 'outline', toy: v as ToyId }
  return { t: 'shape', shape: v as ShapeId, ...(fam === 'cookie' ? { look: 'cookie' as const } : {}) }
}

/** 一局開始說的規則、換規則時說的那一句 */
export const byKey = (dim: SortDim) => `lg.sort.by.${dim}`
export const nowKey = (dim: SortDim) => `lg.sort.now.${dim}`
export const bothKey = (fam: Family) => `lg.sort.both.${fam === 'thing' ? 'thing' : 'shape'}`
export const SWITCH_LINE = 'lg.sort.switch'

export interface SortXOpts {
  /** 今天用過的組合（sig），不再出 */
  avoid?: readonly string[]
  /** 第 6 級可以先照形狀再換成顏色（這一級示範過了才給 true） */
  flip?: boolean
}

/** 挑樣子、兩種形狀／東西、兩個顏色：避開今天用過的組合（都用過了就隨便挑） */
function pickSet(level: SortXLevel, rnd: Rnd, avoid: readonly string[]) {
  const roll = () => {
    let r = rnd()
    let fam: Family = 'thing'
    for (const [f, w] of FAMILY_W) {
      if (r < w) {
        fam = f
        break
      }
      r -= w
    }
    const vals = shuffle(fam === 'thing' ? pick(TOY_PAIRS, rnd) : pick(SHAPE_PAIRS, rnd), rnd) as string[]
    const cs = shuffle(pick(COLOR_PAIRS, rnd), rnd)
    const sig = `${level}:${fam}:${[...vals].sort().join('+')}:${[...cs].sort().join('+')}`
    return { fam, vals, cs, sig }
  }
  let s = roll()
  for (let k = 0; k < 60 && avoid.includes(s.sig); k++) s = roll()
  return s
}

/**
 * 出一局第 6、7 級。第 6 級：items 是換規則以前的 4 個，then 是換規則以後的（同一堆東西）；第 7 級：4 個籃子、4 個東西。
 * 同一局沒有重複的東西。
 */
export function sortRoundX(level: SortXLevel, rnd: Rnd = Math.random, opts: SortXOpts = {}): SortRound {
  const { fam, vals, cs, sig } = pickSet(level, rnd, opts.avoid ?? [])
  const { scene, bin } = sceneOf(fam, vals)
  const other: SortDim = fam === 'thing' ? 'thing' : 'shape'
  const look = fam === 'cookie' ? '-cookie' : ''
  const itemOf = (c: ColorId, v: string, answer: string, dim: SortDim): SortItem => ({ id: `sort:${dim}:${c}-${v}${look}`, thing: thingOf(fam, c, v), answer })

  if (level === 7) {
    const combos = shuffle(
      cs.flatMap((c) => vals.map((v) => ({ c, v }))),
      rnd,
    )
    const baskets: Basket[] = combos.map(({ c, v }) => ({ id: `${c}-${v}`, sample: thingOf(fam, c, v), bin }))
    const items = shuffle(combos, rnd).map(({ c, v }) => itemOf(c, v, `${c}-${v}`, 'both'))
    return { level, dim: 'both', skill: SKILL_BOTH, review: false, scene, baskets, items, intro: bothKey(fam), sig }
  }

  // 第 6 級：籃子 k 是（cs[k]、vals[k]）；4 個東西是兩個籃子各自的（不衝突）和顏色、形狀交叉的（衝突）
  const flip = !!opts.flip && rnd() < FLIP_P
  const first: SortDim = flip ? other : 'color'
  const second: SortDim = flip ? 'color' : other
  const four = [0, 1].flatMap((i) => [0, 1].map((j) => ({ c: cs[i], v: vals[j], conflict: i !== j })))
  const key = (dim: SortDim, x: { c: ColorId; v: string }) => (dim === 'color' ? x.c : x.v)
  const ids = (dim: SortDim) => [0, 1].map((k) => key(dim, { c: cs[k], v: vals[k] }))
  const half = (dim: SortDim, conflictFirst: boolean): SortItem[] => {
    const order = order2(ids(dim), rnd)
    // 每個籃子的兩個東西：一個衝突、一個不衝突。換規則以後的第一個一定是衝突的（最考驗有沒有換過來）
    const left = new Map(ids(dim).map((id) => [id, shuffle(four.filter((x) => key(dim, x) === id), rnd)]))
    return order.map((id, n) => {
      const pool = left.get(id)!
      const at = n === 0 && conflictFirst ? pool.findIndex((x) => x.conflict) : 0
      const [x] = pool.splice(Math.max(0, at), 1)
      return itemOf(x.c, x.v, id, dim)
    })
  }
  const basketsFor = (dim: SortDim): Basket[] => [0, 1].map((k) => ({ id: key(dim, { c: cs[k], v: vals[k] }), sample: sampleOf(fam, dim, cs[k], vals[k]), bin }))
  return {
    level,
    dim: first,
    skill: `sort:${first}`,
    review: false,
    scene,
    baskets: basketsFor(first),
    items: half(first, false),
    intro: byKey(first),
    then: { dim: second, skill: SKILL_SWITCH, baskets: basketsFor(second), items: half(second, true) },
    sig,
  }
}

/** 第 6 級的東西有沒有「衝突」（換規則以前、以後要放到不同位置的籃子）：測試用 */
export function isConflict(r: SortRound, item: SortItem) {
  if (!r.then) return false
  const a = r.items.find((x) => x.thing === item.thing || JSON.stringify(x.thing) === JSON.stringify(item.thing))
  const b = r.then.items.find((x) => JSON.stringify(x.thing) === JSON.stringify(item.thing))
  if (!a || !b) return false
  return r.baskets.findIndex((k) => k.id === a.answer) !== r.then.baskets.findIndex((k) => k.id === b.answer)
}

/** 記今天用過的組合：換日就清掉 */
export interface SortMix {
  date: string
  sigs: string[]
}
export function noteMix(m: SortMix | undefined, date: string, sig: string): SortMix {
  const sigs = m && m.date === date ? m.sigs : []
  return { date, sigs: [...sigs.filter((s) => s !== sig), sig].slice(-200) }
}
export const todaySigs = (m: SortMix | undefined, date: string) => (m && m.date === date ? m.sigs : [])
