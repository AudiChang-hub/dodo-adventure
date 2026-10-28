import { useRef } from 'react'
import { isNew, pickTarget, teachable, withTargetFilter } from '../../lib/adaptive'

/** 一局最多教幾個新數量（PRD §5.8） */
export const MAX_TEACH = 2

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/**
 * 數量類遊戲（塗格子、給波波蛋、一眼看出幾個）共用的「這一題出幾個、要不要教」。
 * - 每個數量是一個技能點（例如 give:3）；沒在自己答出現過的就是新的，要先教。
 * - 一局已經教滿兩個新數量時，其餘題目只出已經學過的（沒有就照常出，但仍然先教）。
 * - 負擔過重、或數與規律這條線本週的新概念額度用完時也一樣（在別的遊戲學過的數字不算新概念，可以教）。
 */
export function useNumberPicker(prefix: string, game: string) {
  const taught = useRef(0)
  const recent = useRef<number[]>([])
  return useRef({
    pick(lo: number, hi: number): { n: number; fresh: boolean } {
      const gen = () => pickTarget(range(lo, hi), (x) => `${prefix}:${x}`, recent.current)
      let n = gen()
      const ok = teachable(game, taught.current, MAX_TEACH)
      for (let k = 0; k < 6 && !ok(`${prefix}:${n}`); k++) n = withTargetFilter(ok, gen)
      recent.current = [n, ...recent.current].slice(0, 2)
      const fresh = isNew(`${prefix}:${n}`)
      if (fresh) taught.current++
      return { n, fresh }
    },
  }).current
}
