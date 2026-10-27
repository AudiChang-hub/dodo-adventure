export const rand = (n: number) => Math.floor(Math.random() * n)
export const pick = <T,>(a: readonly T[]): T => a[rand(a.length)]

export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** 從 pool 取 n 個不重複、且不等於 exclude 的元素 */
export function sample<T>(pool: readonly T[], n: number, exclude: T[] = []): T[] {
  return shuffle(pool.filter((x) => !exclude.includes(x))).slice(0, n)
}

export function weightedPick<T>(items: readonly T[], weight: (t: T) => number): T {
  const ws = items.map((t) => Math.max(0.0001, weight(t)))
  let r = Math.random() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}
