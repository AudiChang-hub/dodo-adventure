import { useState } from 'react'
import { isNew, pickTarget, teachable, withTargetFilter } from '../../lib/adaptive'

/** 一局最多教幾個新數量（PRD §5.8） */
export const MAX_TEACH = 2

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/** 每一級出的數量範圍：塗格子（fill）、給波波蛋（give）、一眼看幾個（flash） */
export const NUMBER_RANGE: Record<'fill' | 'give' | 'flash', Record<number, [number, number]>> = {
  fill: { 1: [1, 3], 2: [2, 5], 3: [4, 8], 4: [6, 10] },
  give: { 1: [1, 3], 2: [2, 5], 3: [3, 7], 4: [5, 10] },
  flash: { 1: [1, 3], 2: [1, 4], 3: [1, 5], 4: [1, 5] },
}

/**
 * 數量類遊戲（塗格子、給波波蛋、一眼看出幾個）共用的「這一題出幾個、要不要教」。
 * - 每個數量是一個技能點（例如 give:3）；沒在自己答出現過的就是新的，要先教。
 * - 一局已經教滿兩個新數量時，其餘題目只出已經學過的（沒有就照常出，但仍然先教）。
 * - 負擔過重、或數與規律這條線本週的新概念額度用完時也一樣（在別的遊戲學過的數字不算新概念，可以教）。
 */
export function numberPicker(prefix: string, game: string) {
  let taught = 0
  let recent: number[] = []
  return {
    pick(lo: number, hi: number): { n: number; fresh: boolean } {
      const gen = () => pickTarget(range(lo, hi), (x) => `${prefix}:${x}`, recent)
      let n = gen()
      const ok = teachable(game, taught, MAX_TEACH)
      for (let k = 0; k < 6 && !ok(`${prefix}:${n}`); k++) n = withTargetFilter(ok, gen)
      recent = [n, ...recent].slice(0, 2)
      const fresh = isNew(`${prefix}:${n}`)
      if (fresh) taught++
      return { n, fresh }
    },
  }
}

/** 一局一個 numberPicker（自動檢查 scripts/sim-teach.ts 直接用 numberPicker） */
export function useNumberPicker(prefix: string, game: string) {
  const [p] = useState(() => numberPicker(prefix, game))
  return p
}
