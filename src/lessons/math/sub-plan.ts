// 一眼看出幾個（T-150 M，設計稿 2-1 案 A）：純函式（排法、選項），畫面在 ./Subitize.tsx。
// 波波掀開布：點點亮一下（./stage4.ts 的 flashMs）、蓋回去，下面 3 張卡（另一種東西、另一種排法）點跟剛剛一樣多的那張。
// - 第 1 級：1～3，2 選 1，兩個數量差 2 以上（1 和 3）。
// - 第 2 級：1～3，3 選 1。
// - 第 3 級：1～5，4～5 只用骰子點和五格框（指引 4 歲「骰子點、手指這種排好的樣子」；打散這次不做）。
import { pick, shuffle } from '../../lib/random'
import type { SubLevel } from './stage4'

export type Layout = 'one' | 'line' | 'diag' | 'col' | 'tri' | 'dice' | 'frame'

/** 每個數量可以用的排法（4～5 只有骰子點和五格框） */
export const LAYOUTS: Record<number, readonly Layout[]> = {
  1: ['one'],
  2: ['line', 'diag', 'col'],
  3: ['line', 'diag', 'tri'],
  4: ['dice', 'frame'],
  5: ['dice', 'frame'],
}

/** 點的位置（0～100 的方格裡，百分比）。五格框是一排 5 格，前 n 格有東西 */
export function spots(n: number, layout: Layout): { x: number; y: number }[] {
  const P: Record<string, [number, number][]> = {
    'one-1': [[50, 50]],
    'line-2': [[30, 50], [70, 50]],
    'diag-2': [[30, 30], [70, 70]],
    'col-2': [[50, 28], [50, 72]],
    'line-3': [[20, 50], [50, 50], [80, 50]],
    'diag-3': [[24, 24], [50, 50], [76, 76]],
    'tri-3': [[50, 26], [26, 72], [74, 72]],
    'dice-4': [[28, 28], [72, 28], [28, 72], [72, 72]],
    'dice-5': [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  }
  if (layout === 'frame') return Array.from({ length: n }, (_, i) => ({ x: 10 + i * 20, y: 50 }))
  const xs = P[`${layout}-${n}`] ?? P['one-1']
  return xs.map(([x, y]) => ({ x, y }))
}

export interface SubCard {
  n: number
  layout: Layout
  icon: string
}

export interface SubRound {
  /** 閃的那一組有幾個、怎麼排 */
  n: number
  layout: Layout
  /** 下面的卡（照畫面上的順序）；答案是 n 的那張 */
  cards: SubCard[]
}

/** 這一級出哪些數量 */
export const levelNums = (level: SubLevel): number[] => (level === 1 ? [1, 3] : level === 2 ? [1, 2, 3] : [1, 2, 3, 4, 4, 5, 5])

/** 選項的數量：第 1 級 2 選 1（1 和 3），其他 3 選 1。第 3 級：一個離答案遠的（差 ≥ 2）＋一個隨便的 */
export function subOptions(n: number, level: SubLevel): number[] {
  if (level === 1) return [1, 3]
  if (level === 2) return [1, 2, 3]
  const others = [1, 2, 3, 4, 5].filter((x) => x !== n)
  const far = pick(others.filter((x) => Math.abs(x - n) >= 2))!
  const rest = pick(others.filter((x) => x !== far))!
  return [n, far, rest].sort((a, b) => a - b)
}

/** 換一種排法（有別的就不跟 not 一樣） */
const otherLayout = (n: number, not?: Layout) => {
  const ls = LAYOUTS[n]
  return pick(ls.length > 1 && not ? ls.filter((l) => l !== not) : [...ls])!
}

/**
 * 一回合。icons：3 張卡各一種東西（數數用的圖，countIcons）。
 * 答案那張一定換一種排法（2 個以上的數量），所以要看「幾個」，不能只看樣子。
 */
export function subRound(level: SubLevel, icons: readonly string[], n0?: number): SubRound {
  const nums = levelNums(level)
  const n = n0 && nums.includes(n0) ? n0 : pick(nums)!
  const layout = otherLayout(n)
  const opts = shuffle(subOptions(n, level))
  const cards = opts.map((x, i) => ({ n: x, layout: x === n ? otherLayout(x, layout) : otherLayout(x), icon: icons[i % icons.length] }))
  return { n, layout, cards }
}
