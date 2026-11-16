// 串珠珠（規律 ABAB，T-152 設計稿第三節案 A②，指引 MA-7：3 歲接著做 ABAB，只當遊戲、不考）的出題。
// 只有純函式，scripts/test-logic.ts 直接測；畫面在 ./Pattern.tsx。升降級跟豆豆收拾共用 ./sort-plan.ts 的 stepLevel。
// T-157：每一局隨機換「串的東西」（項鍊、火車、彩旗、餅乾、花園、排隊的小動物），不跟最近兩局一樣；規律照舊是 ABAB。
import { COLOR_IDS, pickScene, type ColorId, type Thing } from './sort-plan'

export type PatLevel = 1 | 2 | 3 | 4
export const PATTERN_MAX: PatLevel = 4
export const PATTERN_GAME = 'logic-pattern'
/** 一局幾題 */
export const PATTERN_QS = 3
/** 繩子上幾格（含空的那一格） */
export const STRAND = 5

/** 東西的 id → Fluent Emoji 的名字（id 也是念出來的字的 key，見 ./lines.ts 的 lg.w.*）；舊的 car、red-apple 沿用 */
export const OBJ_ICON: Record<string, string> = {
  'red-apple': 'red-apple',
  banana: 'banana',
  cat: 'cat',
  duck: 'duck',
  star: 'star',
  fish: 'fish',
  car: 'automobile',
  sun: 'sun',
  moon: 'crescent-moon',
  strawberry: 'strawberry',
  cloud: 'cloud',
  rainbow: 'rainbow',
  snowflake: 'snowflake',
  umbrella: 'umbrella',
  teddy: 'teddy-bear',
  ball: 'soccer-ball',
  box: 'package',
  carrot: 'carrot',
  watermelon: 'watermelon',
  cookie: 'cookie',
  donut: 'doughnut',
  cupcake: 'cupcake',
  lollipop: 'lollipop',
  'ice-cream': 'ice-cream',
  tulip: 'tulip',
  sunflower: 'sunflower',
  flower: 'blossom',
  mushroom: 'mushroom',
  snail: 'snail',
  butterfly: 'butterfly',
  ladybug: 'lady-beetle',
  bee: 'honeybee',
  cow: 'cow',
  pig: 'pig',
  rabbit: 'rabbit',
  frog: 'frog',
  penguin: 'penguin',
  monkey: 'monkey',
  horse: 'horse',
  chicken: 'chicken',
  elephant: 'elephant',
  turtle: 'turtle',
}
export const OBJ_IDS = Object.keys(OBJ_ICON)

// ── 串的東西（T-157）────────────────────────────────────────

export type PatThemeId = 'necklace' | 'train' | 'flags' | 'cookies' | 'garden' | 'animals'
export const THEME_IDS: PatThemeId[] = ['necklace', 'train', 'flags', 'cookies', 'garden', 'animals']
export interface ThemeDef {
  /** 顏色的規律（第 1、3 級）用哪些顏色；沒有：這個主題只串東西 */
  colors?: ColorId[]
  /** 東西的規律（第 2 級）的東西（OBJ_ICON 的 id，至少 4 個） */
  objs: string[]
}
export const THEMES: Record<PatThemeId, ThemeDef> = {
  // 項鍊：顏色珠子、畫著東西的木頭珠子
  necklace: { colors: COLOR_IDS, objs: ['red-apple', 'banana', 'cat', 'duck', 'star', 'fish', 'car', 'sun', 'moon', 'strawberry'] },
  // 火車：一節一節的車廂，載著東西
  train: { colors: COLOR_IDS, objs: ['red-apple', 'banana', 'teddy', 'ball', 'box', 'carrot', 'watermelon', 'duck'] },
  // 彩旗：一面一面掛在繩子上
  flags: { colors: COLOR_IDS, objs: ['sun', 'star', 'moon', 'cloud', 'rainbow', 'snowflake', 'umbrella'] },
  // 餅乾排排放：糖霜換顏色，或是不同的點心
  cookies: { colors: COLOR_IDS, objs: ['cookie', 'donut', 'cupcake', 'lollipop', 'ice-cream', 'strawberry'] },
  // 花園：花瓣換顏色（綠色的花看不出來，不用），或是花和小蟲
  garden: { colors: ['red', 'blue', 'yellow'], objs: ['tulip', 'sunflower', 'flower', 'mushroom', 'snail', 'butterfly', 'ladybug', 'bee'] },
  // 排隊的小動物：只有東西的規律
  animals: { objs: ['cat', 'duck', 'cow', 'pig', 'rabbit', 'frog', 'penguin', 'monkey', 'horse', 'chicken', 'elephant', 'turtle'] },
}
/** 這一級可以用的主題：第 1、3 級要有顏色；第 2 級串東西；第 4 級兩種都會出 */
export const themesFor = (level: PatLevel): PatThemeId[] => THEME_IDS.filter((t) => level === 2 || !!THEMES[t].colors)

export interface Bead {
  /** 顏色（珠子）或東西的 id；念的字是 lg.w.<id> */
  id: string
  thing: Thing
}
export interface PatQ {
  level: PatLevel
  /** 串的東西（同一局三題一樣） */
  theme: PatThemeId
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
 * 一題。第 1 級：只差顏色，空第 5 格；第 2 級：東西（🍎🍌🍎🍌），空第 5 格；
 * 第 3 級：顏色，空在中間（紅、藍、＿、藍、紅）；第 4 級：空第 5 格，3 個選項（多一個不在規律裡的）。
 * a、b 是這一題的 A、B；c 是第 4 級多出來的那一個。
 */
function makeQ(level: PatLevel, theme: PatThemeId, objs: boolean, a: string, b: string, c: string | null, rnd: Rnd): PatQ {
  const mk = objs ? obj : (x: string) => bead(x as ColorId)
  const A = mk(a)
  const B = mk(b)
  const seq = Array.from({ length: STRAND }, (_, i) => (i % 2 ? B : A))
  const blank = level === 3 ? 2 : STRAND - 1
  const options = shuffle([A, B, ...(c ? [mk(c)] : [])], rnd)
  const skill = objs ? 'pattern:ab-obj' : 'pattern:ab'
  return { level, theme, seq, blank, options, answer: seq[blank].id, skill, itemId: `${skill}:${a}-${b}${level === 3 ? ':mid' : ''}` }
}

/**
 * 出一局（3 題）。recent：最近用過的主題（舊的在前），不挑一樣的。
 * 同一局的三題用不一樣的組合（不會連兩題都是紅藍）。第 4 級：顏色或東西隨機（各題自己決定）。
 */
export function patternRound(level: PatLevel, rnd: Rnd = Math.random, recent: readonly string[] = []): PatQ[] {
  const theme = pickScene(themesFor(level), recent, rnd)
  const def = THEMES[theme]
  const out: PatQ[] = []
  const used = new Set<string>()
  for (let q = 0; q < PATTERN_QS; q++) {
    const objs = level === 2 || (level === 4 && rnd() < 0.5)
    const pool = objs ? def.objs : def.colors!
    let a = ''
    let b = ''
    for (let k = 0; k < 30; k++) {
      ;[a, b] = shuffle(pool, rnd)
      if (!used.has([a, b].sort().join())) break
    }
    used.add([a, b].sort().join())
    let c: string | null = null
    if (level === 4) {
      const rest = pool.filter((x) => x !== a && x !== b)
      c = rest[Math.floor(rnd() * rest.length) % rest.length]
    }
    out.push(makeQ(level, theme, objs, a, b, c, rnd))
  }
  return out
}
