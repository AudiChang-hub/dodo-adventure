// 數字小路（T-150 M，設計稿 2-2 案 A）：純函式，畫面在 ./Path.tsx。
// 一條水平直線的 10 格（1～10），不彎、不繞圈、沒有岔路、沒有場景或關卡（Siegler & Ramani：一直線的才有效果）。
// 骰子只有 1 點和 2 點（兩面各半）；點小恐龍一下走一格、念那一格的數字；走多了不會超過骰子的點數；走到 10 就停。
// 不記作答（每一步都對），走完記一筆 logTeach（warm:path）。
export const PATH_END = 10
/** 骰子的面：只有 1 點和 2 點（熟了才換 1～3，這次不做） */
export const DIE_FACES = [1, 2] as const

/** 擲一次骰子（rnd 是 0～1 的亂數，測試可以固定） */
export const rollDie = (rnd: () => number = Math.random): number => DIE_FACES[Math.min(DIE_FACES.length - 1, Math.floor(rnd() * DIE_FACES.length))]

/** 擲到 roll 點：從 pos 最多可以走幾格（到 10 就停，不會超過） */
export const stepsFor = (pos: number, roll: number) => Math.max(0, Math.min(roll, PATH_END - pos))

/** 走一格：還有步數才走（多點的不算），回傳新的位置和剩幾步 */
export function stepOnce(pos: number, left: number): { pos: number; left: number; moved: boolean } {
  if (left <= 0 || pos >= PATH_END) return { pos, left: 0, moved: false }
  return { pos: pos + 1, left: left - 1, moved: true }
}
