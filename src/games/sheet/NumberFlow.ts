import { useState } from 'react'
import { isNew, mastered, pickTarget, teachable, withTargetFilter } from '../../lib/adaptive'

/** 一局最多教幾個新數量（PRD §5.8） */
export const MAX_TEACH = 2

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/** 每一級出的數量範圍：塗格子（fill）、給波波蛋（give）、一眼看幾個（flash） */
export const NUMBER_RANGE: Record<'fill' | 'give' | 'flash', Record<number, [number, number]>> = {
  fill: { 1: [1, 3], 2: [2, 5], 3: [4, 8], 4: [6, 10] },
  give: { 1: [1, 3], 2: [2, 5], 3: [3, 7], 4: [5, 10] },
  // 一眼看幾個：1、2 級只出 1–3（3–4 歲不用數就看得出來的上限，T-49 LOAD-2、成長系統 N1）；
  // 3 級起才有 4、5，而且要先會數到 5（flashRange）。再往上是十格框看出 6–10（成長系統 N15），到時候加在這裡
  flash: { 1: [1, 3], 2: [1, 3], 3: [1, 4], 4: [1, 5] },
}

/** 數到 5 穩了沒：點點數數、塗格子、給波波蛋，任一個遊戲的 4 和 5 都已熟 */
const countsToFive = () => [4, 5].every((n) => ['count', 'fill', 'give'].some((g) => mastered(`${g}:${n}`)))

/**
 * 這一級實際出的範圍：一眼看幾個的 4、5 是「看骰子排法認出來」，要先會一個一個數到 5 才有意義，
 * 所以級數到了、但還沒數熟，就先停在 1–3（看能力，不看年紀）。其他遊戲照 NUMBER_RANGE。
 */
export function numberRange(kind: keyof typeof NUMBER_RANGE, lv: number): [number, number] {
  const [a, b] = NUMBER_RANGE[kind][lv]
  return kind === 'flash' && b > 3 && !countsToFive() ? [a, 3] : [a, b]
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
      // 這一級的範圍裡沒有能出的（例如程度校準一下跳到 6–10，卻一個都還沒學過、也不能再教新的數字）：
      // 先往下找學過、能出的數字，不要硬教第二個新概念（FRAME-8）或還沒開放的數字（成長系統 N2、N3）
      // 往下也沒有（例如剛教了 4、答錯降回 1–3）：往上找學過的
      if (!ok(`${prefix}:${n}`)) {
        const lower = range(1, hi).filter((x) => ok(`${prefix}:${x}`))
        const near = lower.length ? lower : range(hi + 1, 20).filter((x) => !isNew(`${prefix}:${x}`))
        if (near.length) n = withTargetFilter(ok, () => pickTarget(near, (x) => `${prefix}:${x}`, recent))
      }
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
