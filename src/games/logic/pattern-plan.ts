// 串珠珠（規律 ABAB，T-152 設計稿第三節案 A②，指引 MA-7：3 歲接著做 ABAB，只當遊戲、不考）的出題。
// 只有純函式，scripts/test-logic.ts 直接測；畫面在 ./Pattern.tsx。升降級跟豆豆收拾共用 ./sort-plan.ts 的 stepLevel。
import { COLOR_IDS, type ColorId, type Thing } from './sort-plan'

export type PatLevel = 1 | 2 | 3 | 4
export const PATTERN_MAX: PatLevel = 4
export const PATTERN_GAME = 'logic-pattern'
/** 一局幾題 */
export const PATTERN_QS = 3
/** 繩子上幾格（含空的那一格） */
export const STRAND = 5

/** 第 2 級的東西：兩兩一組，要看「是什麼」不是顏色（念出來的字在 ./lines.ts 的 lg.w.*） */
export const OBJ_PAIRS: [string, string][] = [
  ['red-apple', 'banana'],
  ['cat', 'duck'],
  ['star', 'fish'],
  ['car', 'sun'],
]
/** 東西的 id → Fluent Emoji 的名字（id 也是念出來的字的 key） */
export const OBJ_ICON: Record<string, string> = { 'red-apple': 'red-apple', banana: 'banana', cat: 'cat', duck: 'duck', star: 'star', fish: 'fish', car: 'automobile', sun: 'sun' }
export const OBJ_IDS = Object.keys(OBJ_ICON)

export interface Bead {
  /** 顏色（珠子）或東西的 id；念的字是 lg.w.<id> */
  id: string
  thing: Thing
}
export interface PatQ {
  level: PatLevel
  /** 整串（含答案）：A B A B A */
  seq: Bead[]
  /** 空的是第幾格 */
  blank: number
  /** 下面讓他挑的：2 個（第 4 級 3 個），答案一定在裡面、不重複，已經洗過 */
  options: Bead[]
  /** 答案（Bead.id） */
  answer: string
  /** 作答紀錄：pattern:ab、pattern:ab-obj */
  skill: string
  /** 作答紀錄的 itemId：pattern:ab:red-blue */
  itemId: string
}

type Rnd = () => number
function shuffle<T>(a: readonly T[], rnd: Rnd): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

const bead = (c: ColorId): Bead => ({ id: c, thing: { t: 'toy', toy: 'ball', color: c } })
const obj = (id: string): Bead => ({ id, thing: { t: 'emoji', icon: OBJ_ICON[id] } })

/**
 * 一題。第 1 級：珠子只差顏色，空第 5 格；第 2 級：東西（🍎🍌🍎🍌），空第 5 格；
 * 第 3 級：珠子，空在中間（紅、藍、＿、藍、紅）；第 4 級：空第 5 格，3 個選項（多一個不在規律裡的）。
 * a、b 是這一題的 A、B；c 是第 4 級多出來的那一個。
 */
function makeQ(level: PatLevel, objs: boolean, a: string, b: string, c: string | null, rnd: Rnd): PatQ {
  const mk = objs ? obj : (x: string) => bead(x as ColorId)
  const A = mk(a)
  const B = mk(b)
  const seq = Array.from({ length: STRAND }, (_, i) => (i % 2 ? B : A))
  const blank = level === 3 ? 2 : STRAND - 1
  const options = shuffle([A, B, ...(c ? [mk(c)] : [])], rnd)
  return { level, seq, blank, options, answer: seq[blank].id, skill: objs ? 'pattern:ab-obj' : 'pattern:ab', itemId: `${objs ? 'pattern:ab-obj' : 'pattern:ab'}:${a}-${b}${level === 3 ? ':mid' : ''}` }
}

/**
 * 出一局（3 題）。同一局的三題用不一樣的組合（不會連兩題都是紅藍）。
 * 第 4 級：珠子或東西隨機（各題自己決定）。
 */
export function patternRound(level: PatLevel, rnd: Rnd = Math.random): PatQ[] {
  const out: PatQ[] = []
  const used = new Set<string>()
  for (let q = 0; q < PATTERN_QS; q++) {
    const objs = level === 2 || (level === 4 && rnd() < 0.5)
    let a = ''
    let b = ''
    for (let k = 0; k < 30; k++) {
      if (objs) {
        const p = OBJ_PAIRS[Math.floor(rnd() * OBJ_PAIRS.length) % OBJ_PAIRS.length]
        ;[a, b] = rnd() < 0.5 ? p : [p[1], p[0]]
      } else {
        ;[a, b] = shuffle(COLOR_IDS, rnd)
      }
      const key = [a, b].sort().join()
      if (!used.has(key)) break
    }
    used.add([a, b].sort().join())
    let c: string | null = null
    if (level === 4) {
      const pool = (objs ? OBJ_IDS : COLOR_IDS).filter((x) => x !== a && x !== b)
      c = pool[Math.floor(rnd() * pool.length) % pool.length]
    }
    out.push(makeQ(level, objs, a, b, c, rnd))
  }
  return out
}
