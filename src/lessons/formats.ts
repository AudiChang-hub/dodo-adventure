// 題型示範（T-96，準則 PHASE-1、LANG-3、指引 HOW-2）：英文課、數學課的選擇題，孩子聽不懂英文題目，要先看手做一次。
// 每一種題型（找大寫、找小寫、找開頭的圖、找數字、數一數點數字），孩子自己一次就答對 2 次以前，每堂課這種題型的第一題手先做一次：
// 手指著波波／豆豆頭上的泡泡（要找的樣子）→ 點答案 → 選項換位置 → Your turn!。之後只剩泡泡。
import { getKV, setKV } from '../lib/db'

export type Format = 'en-big' | 'en-little' | 'en-word' | 'ma-find' | 'ma-howmany'

const KEY = 'lesson-format-solo'
/** 一次就答對幾次以後不再示範 */
export const SOLO = 2

let solo: Partial<Record<Format, number>> | null = null

/** 上課前讀一次（讀不到就當作都還沒會，照樣示範） */
export async function loadFormats() {
  solo ??= await getKV<Partial<Record<Format, number>>>(KEY, {}).catch(() => ({}))
}

export const needsDemo = (f: Format) => (solo?.[f] ?? 0) < SOLO

/** 這種題型答完了：一次就答對才算一次 */
export function noteFormat(f: Format, firstTry: boolean) {
  if (!firstTry) return
  solo = { ...solo, [f]: (solo?.[f] ?? 0) + 1 }
  void setKV(KEY, solo).catch(() => {})
}

/** 示範完換位置：轉一格，答案一定換到別的地方（看的是樣子，不是位置） */
export function rotate<T>(xs: T[]): T[] {
  return xs.length > 1 ? [...xs.slice(1), xs[0]] : xs
}
