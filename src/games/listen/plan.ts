// 聽兩步驟指令（T-164）的出題和升降級。只有純函式，scripts/test-order-listen.ts 直接測；畫面在 ./Listen.tsx。
// 一局 5 句指令。同一天不重複（同樣的目標組合今天不會再出現；組合有上千種）。
//
// 難度（準則 LOAD-1：選項 3～4 個；指引 EN-1：3 歲一個步驟、4 歲兩個步驟）：
//   1 級：一步驟、只說名字（Touch the dog.），3 樣東西，名字都不一樣
//   2 級：一步驟、顏色＋名字（Touch the red ball.），4 樣：答案、同名字別的顏色、同顏色別的東西、再一個別的 → 兩個字都要聽
//   3 級：兩步驟、只說名字（Touch the cat. Then the star.），4 樣東西
//   4 級：兩步驟、顏色＋名字（Touch the red ball. Then the blue car.），4 樣：兩個答案＋顏色對調的兩個（blue ball、red car）
// 答錯不扣分：那一樣輕輕晃一下，豆豆說「That's the cat.」再說一次這一步；同一步點錯兩次，手指出對的。
// 升降級：連續 2 局全對（每句都一次就做對）升一級；一局 ≥ 2 句沒做對退一級。
import { COLOR_IDS, PLAIN, SHAPE_IDS, thingId, type ColorId, type ShapeId, type Thing } from './data'

export type ListenLevel = 1 | 2 | 3 | 4
export const LISTEN_MAX: ListenLevel = 4
export const LISTEN_GAME = 'logic-listen'
export const LISTEN_QS = 5
export const UP_AFTER = 2
export const DOWN_AT = 2

type Rnd = () => number
function shuffle<T>(a: readonly T[], rnd: Rnd): T[] {
  const o = [...a]
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[o[i], o[j]] = [o[j], o[i]]
  }
  return o
}

export const stepsOf = (level: ListenLevel) => (level >= 3 ? 2 : 1)
export const usesColor = (level: ListenLevel) => level === 2 || level === 4
export const thingsOf = (level: ListenLevel) => (level === 1 ? 3 : 4)
export const listenSkill = (level: ListenLevel) => ['listen:1-name', 'listen:1-color', 'listen:2-name', 'listen:2-color'][level - 1]

export interface ListenQ {
  level: ListenLevel
  /** 畫面上的東西（順序就是畫面上的順序） */
  things: Thing[]
  /** 要依序點的（things 的第幾個），1 或 2 個 */
  targets: number[]
  /** 這句的記號（同一天不重複用） */
  sig: string
  skill: string
  itemId: string
}

const color = (c: ColorId, s: ShapeId): Thing => ({ kind: 'color', color: c, shape: s })
const plain = (id: string): Thing => ({ kind: 'plain', plain: id })

/** 一句指令的東西（還沒打亂）：第一個是第一步、第二個是第二步（兩步驟才有），其他是不是答案的 */
function build(level: ListenLevel, rnd: Rnd): Thing[] {
  if (!usesColor(level)) {
    return shuffle(PLAIN, rnd)
      .slice(0, thingsOf(level))
      .map((p) => plain(p.id))
  }
  const [c1, c2, c3] = shuffle(COLOR_IDS, rnd)
  const [s1, s2, s3] = shuffle(SHAPE_IDS, rnd)
  // 一步驟：答案、同名字別的顏色、同顏色別的東西、別的顏色別的東西
  if (level === 2) return [color(c1, s1), color(c2, s1), color(c1, s2), color(c3, s3)]
  // 兩步驟：兩個答案（顏色、東西都不一樣），另外兩個是顏色對調的（只聽一半會點錯）
  return [color(c1, s1), color(c2, s2), color(c2, s1), color(c1, s2)]
}

/** 記號：要點的（照順序）｜其他的（排序）。同一天先避開「要點的一樣」，都用過了（1 級只有 28 種）再避開「整個畫面一樣」 */
const sigOf = (level: ListenLevel, raw: Thing[]) => {
  const n = stepsOf(level)
  return `${raw
    .slice(0, n)
    .map((t) => thingId(t))
    .join('>')}|${raw
    .slice(n)
    .map((t) => thingId(t))
    .sort()
    .join(',')}`
}
const headOf = (sig: string) => sig.split('|')[0]

export function listenQ(level: ListenLevel, avoid: string[], rnd: Rnd = Math.random): ListenQ {
  const heads = new Set(avoid.map(headOf))
  let raw = build(level, rnd)
  let sig = sigOf(level, raw)
  for (let k = 0; k < 60 && heads.has(headOf(sig)); k++) {
    raw = build(level, rnd)
    sig = sigOf(level, raw)
  }
  for (let k = 0; k < 60 && avoid.includes(sig); k++) {
    raw = build(level, rnd)
    sig = sigOf(level, raw)
  }
  const order = shuffle(
    raw.map((_, i) => i),
    rnd,
  )
  const things = order.map((i) => raw[i])
  const targets = Array.from({ length: stepsOf(level) }, (_, s) => order.indexOf(s))
  return { level, things, targets, sig, skill: listenSkill(level), itemId: `listen:${headOf(sig)}` }
}

export interface ListenMemory {
  day: string
  /** 今天出過的指令（sig） */
  today: string[]
}

/** 一局 5 句，今天出過的不再出，mem 會更新 */
export function listenRound(level: ListenLevel, mem: ListenMemory, day: string, rnd: Rnd = Math.random): ListenQ[] {
  if (mem.day !== day) {
    mem.day = day
    mem.today = []
  }
  const out: ListenQ[] = []
  for (let i = 0; i < LISTEN_QS; i++) {
    const q = listenQ(level, mem.today, rnd)
    out.push(q)
    mem.today = [...mem.today, q.sig].slice(-TODAY_MAX)
  }
  return out
}
/** 一天最多記這麼多句（夠玩 40 局） */
export const TODAY_MAX = 200

/** 1 級總共有幾種不一樣的指令（同一天不重複夠不夠用） */
export const comboCount = (level: ListenLevel) => {
  const P = PLAIN.length
  const C = COLOR_IDS.length * SHAPE_IDS.length
  if (level === 1) return P
  if (level === 2) return C
  if (level === 3) return P * (P - 1)
  return C * (COLOR_IDS.length - 1) * (SHAPE_IDS.length - 1)
}

// ── 進度 ─────────────────────────────────────────────────────

export interface ListenState extends ListenMemory {
  level: ListenLevel
  streak: number
  taught: number[]
}

export const LISTEN_START: ListenState = { level: 1, streak: 0, taught: [], day: '', today: [] }

export function normalizeListen(raw: unknown): ListenState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ListenState>
  const level = (Number.isInteger(o.level) ? Math.min(LISTEN_MAX, Math.max(1, o.level as number)) : 1) as ListenLevel
  return {
    level,
    streak: Number.isInteger(o.streak) && (o.streak as number) >= 0 ? (o.streak as number) : 0,
    taught: Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : [],
    day: typeof o.day === 'string' ? o.day : '',
    today: Array.isArray(o.today) ? o.today.filter((x): x is string => typeof x === 'string').slice(-TODAY_MAX) : [],
  }
}

/** 一局玩完：全對（自己做的至少 4 句）→ streak + 1，到 UP_AFTER 升一級；≥ DOWN_AT 句沒做對 → 退一級 */
export function afterListen(s: ListenState, r: { counted: number; misses: number }): ListenState {
  if (r.misses >= DOWN_AT) return { ...s, level: Math.max(1, s.level - 1) as ListenLevel, streak: 0 }
  if (r.counted >= LISTEN_QS - 1 && r.misses === 0) {
    const streak = s.streak + 1
    if (streak >= UP_AFTER && s.level < LISTEN_MAX) return { ...s, level: (s.level + 1) as ListenLevel, streak: 0 }
    return { ...s, streak }
  }
  return { ...s, streak: 0 }
}
