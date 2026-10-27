import type { Speaker } from './lines'
import type { StationId } from '../lib/db'
import { LETTERS, LOOKALIKE, letterEntry } from './letters'
import { VOCAB, AMBIGUOUS, CAT_EXAMPLES, vocab, type Tag } from './vocab'
import { COLORS, COLOR_EXAMPLES, SHAPES, SIZE_ICONS, COUNT_ICONS, type ShapeId } from './park'
import { pickTarget, unlockedLetters, unlockedNumbers } from '../lib/adaptive'
import { getSettings } from '../lib/settings'
import { pick, rand, sample, shuffle } from '../lib/random'

export type Visual =
  | { t: 'emoji'; icon: string; scale?: number }
  | { t: 'letter'; ch: string }
  | { t: 'number'; n: number }
  | { t: 'group'; icon: string; count: number }
  | { t: 'color'; hex: string }
  | { t: 'shape'; shape: ShapeId; hex: string }

export interface ChoiceItem {
  itemId: string
  skill: string
  stimulus?: Visual
  prompt: string[]
  options: { id: string; v: Visual }[]
  answer: string
  /** 答錯兩次或提示時要說的話 */
  correction: string[]
  /** 答對之後順便複習的一句，例如「B is for bus!」 */
  after?: string[]
  /** 新內容第一次出現時的教學卡（PRD §5.8：先教 → 一起練 → 自己答） */
  teach?: TeachSpec
}

/**
 * 教學卡：主持的恐龍大大地展示內容、念教學句。
 * visual 是陣列時並排展示（例如數字＋數量、比多少的兩組），focus[i] 是念第 i 句時要指著哪一個。
 */
export interface TeachSpec {
  visual: Visual | Visual[]
  /** 旁邊的小例子貼紙，例如 B 旁邊的公車；在第 sideAt 句時出現 */
  side?: Visual
  sideAt?: number
  focus?: number[]
  lines: string[]
  /** 答錯兩次重教時的精簡版，預設只念第一句 */
  short?: string[]
}

export type GameKind =
  | 'choice' | 'count' | 'order' | 'trace' | 'dots' | 'coloring' | 'free' | 'glyph'
  // 工作線 B：學習單題型
  | 'findall' | 'lasso' | 'fill' | 'give' | 'subitize'

export interface GameDef {
  id: string
  station: StationId
  kind: GameKind
  title: string
  icon: string
  intro: string
  maxLevel: number
  make?: (level: number, recent: string[]) => ChoiceItem
}

export interface StationDef {
  id: StationId
  name: string
  host: Speaker
  icon: string
  tint: string
  deep: string
}

export const STATIONS: StationDef[] = [
  { id: 'english', name: '字母森林', host: 'dodo', icon: 'deciduous-tree', tint: '#CFE8D9', deep: '#5FA883' },
  { id: 'math', name: '數字工地', host: 'bobo', icon: 'construction', tint: '#F8DCC8', deep: '#D38A5E' },
  { id: 'mandarin', name: '動物村', host: 'momo', icon: 'house-with-garden', tint: '#D8E6F4', deep: '#6F9CC8' },
  { id: 'draw', name: '畫畫小屋', host: 'dodo', icon: 'artist-palette', tint: '#E6DFF2', deep: '#8F7CC0' },
  { id: 'park', name: '彩虹公園', host: 'bobo', icon: 'rainbow', tint: '#F6E7B8', deep: '#C9A23E' },
]

export const station = (id: StationId) => STATIONS.find((s) => s.id === id)!

/** 選項數：第 1 級 2 個、第 2 級 3 個、之後 4 個 */
const optCount = (level: number) => Math.min(4, level + 1)

// ── 字母森林 ───────────────────────────────────────────────
function letterDistractors(target: string, n: number, level: number): string[] {
  const unlocked = unlockedLetters()
  const pool = unlocked.length > n + 1 ? unlocked : LETTERS.map((l) => l.letter)
  const out: string[] = []
  if (level >= 4) for (const c of LOOKALIKE[target] ?? '') if (out.length < n) out.push(c)
  return [...out, ...sample(pool, n - out.length, [target, ...out])]
}

const enFind = (level: number, recent: string[]): ChoiceItem => {
  const L = pickTarget(unlockedLetters(), (l) => `letter:${l}`, recent)
  const opts = shuffle([L, ...letterDistractors(L, optCount(level) - 1, level)])
  return {
    itemId: L,
    skill: `letter:${L}`,
    prompt: [`en.where.${L}`],
    options: opts.map((c) => ({ id: c, v: { t: 'letter', ch: c } })),
    answer: L,
    correction: [`en.thisis.${L}`],
    after: [`en.is.${L}`],
    teach: { visual: { t: 'letter', ch: L }, side: { t: 'emoji', icon: letterEntry(L).icon }, sideAt: 1, lines: [`teach.letter.${L}`, `teach.letterfor.${L}`] },
  }
}

const enPic = (level: number, recent: string[]): ChoiceItem => {
  const L = pickTarget(unlockedLetters(), (l) => `word:${l}`, recent)
  const opts = shuffle([L, ...letterDistractors(L, optCount(level) - 1, 1)])
  return {
    itemId: L,
    skill: `word:${L}`,
    stimulus: { t: 'letter', ch: L },
    prompt: [`en.is.${L}`, `en.findword.${L}`],
    options: opts.map((c) => ({ id: c, v: { t: 'emoji', icon: letterEntry(c).icon } })),
    answer: L,
    correction: [`en.itis.${L}`],
    teach: { visual: { t: 'letter', ch: L }, side: { t: 'emoji', icon: letterEntry(L).icon }, sideAt: 0, lines: [`teach.letterfor.${L}`, `teach.word.${L}`] },
  }
}

const enWord = (level: number, recent: string[]): ChoiceItem => {
  const pool = unlockedLetters()
  const L = pickTarget(pool, (l) => `word:${l}`, recent)
  const others = LETTERS.map((l) => l.letter)
  const opts = shuffle([L, ...sample(others, optCount(level) - 1, [L])])
  return {
    itemId: L,
    skill: `word:${L}`,
    prompt: [`en.findword.${L}`],
    options: opts.map((c) => ({ id: c, v: { t: 'emoji', icon: letterEntry(c).icon } })),
    answer: L,
    correction: [`en.itis.${L}`],
    after: [`en.is.${L}`],
    teach: { visual: { t: 'emoji', icon: letterEntry(L).icon }, side: { t: 'letter', ch: L }, sideAt: 1, lines: [`teach.word.${L}`, `teach.letterfor.${L}`] },
  }
}

// ── 數字工地 ───────────────────────────────────────────────
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

function numDistractors(n: number, k: number, max: number, close: boolean): number[] {
  const pool = close ? range(Math.max(1, n - 2), Math.min(max, n + 2)) : range(1, max)
  const base = sample(pool, k, [n])
  return base.length >= k ? base : [...base, ...sample(range(1, Math.max(max, k + 1)), k - base.length, [n, ...base])]
}

const mFind = (level: number, recent: string[]): ChoiceItem => {
  const max = unlockedNumbers()
  const n = pickTarget(range(1, max), (x) => `num:${x}`, recent.map(Number))
  const opts = shuffle([n, ...numDistractors(n, optCount(level) - 1, max, level >= 4)])
  return {
    itemId: String(n),
    skill: `num:${n}`,
    prompt: [`m.findnum.${n}`],
    options: opts.map((x) => ({ id: String(x), v: { t: 'number', n: x } })),
    answer: String(n),
    correction: [`m.thisis.${n}`],
    teach:
      n <= 10
        ? { visual: [{ t: 'number', n }, { t: 'group', icon: pick(COUNT_ICONS), count: n }], focus: [0, 1], lines: [`teach.num.${n}`, `teach.count.${n}`] }
        : { visual: { t: 'number', n }, lines: [`teach.num.${n}`] },
  }
}

const mMatch = (level: number, recent: string[]): ChoiceItem => {
  const max = Math.min(10, [3, 5, unlockedNumbers(), unlockedNumbers()][level - 1] ?? 5)
  const n = pickTarget(range(1, Math.max(2, max)), (x) => `count:${x}`, recent.map(Number))
  const opts = shuffle([n, ...numDistractors(n, optCount(level) - 1, Math.max(max, 4), level >= 3)])
  const icon = pick(COUNT_ICONS)
  return {
    itemId: String(n),
    skill: `count:${n}`,
    stimulus: { t: 'group', icon, count: n },
    prompt: ['m.howmany'],
    options: opts.map((x) => ({ id: String(x), v: { t: 'number', n: x } })),
    answer: String(n),
    correction: [`m.total.${n}`],
    teach: { visual: [{ t: 'group', icon, count: n }, { t: 'number', n }], focus: [0, 1], lines: [`teach.count.${n}`, `teach.total.${n}`] },
  }
}

const mCompare = (level: number): ChoiceItem => {
  const gap = [4, 3, 2, 1][level - 1] ?? 1
  const a = 1 + rand(10 - gap)
  const b = Math.min(10, a + gap + (level <= 2 ? rand(2) : 0))
  const askLess = level >= 3 && Math.random() < 0.5
  const icon = pick(COUNT_ICONS)
  const pair = shuffle([a, b])
  const target = askLess ? Math.min(a, b) : Math.max(a, b)
  return {
    itemId: `${pair[0]}v${pair[1]}${askLess ? '<' : '>'}`,
    skill: askLess ? 'compare:less' : 'compare:more',
    prompt: [askLess ? 'm.less' : 'm.more'],
    options: pair.map((c) => ({ id: String(c), v: { t: 'group', icon, count: c } })),
    answer: String(target),
    correction: [askLess ? 'm.this.less' : 'm.this.more'],
    // 先示範一組差很多的：這邊比較多、這邊比較少
    teach: {
      visual: [{ t: 'group', icon, count: 6 }, { t: 'group', icon, count: 2 }],
      focus: askLess ? [1, 0] : [0, 1],
      lines: askLess ? ['teach.fewer', 'teach.more'] : ['teach.more', 'teach.fewer'],
    },
  }
}

// ── 動物村 ─────────────────────────────────────────────────
function themedVocab() {
  const theme = getSettings().theme
  return theme === 'all' ? VOCAB : [...VOCAB, ...VOCAB.filter((v) => v.theme === theme), ...VOCAB.filter((v) => v.theme === theme)]
}

const zFind = (level: number, recent: string[]): ChoiceItem => {
  const v = pickTarget(themedVocab(), (x) => `vocab:${x.id}`, VOCAB.filter((x) => recent.includes(x.id)))
  // 低難度用不同類別當干擾（貓 vs 汽車），高難度用同一類（貓 vs 狗）
  const pool = VOCAB.filter((x) => x.id !== v.id && (level >= 3 ? x.theme === v.theme : x.theme !== v.theme))
  const opts = shuffle([v, ...sample(pool.length >= 3 ? pool : VOCAB.filter((x) => x.id !== v.id), optCount(level) - 1)])
  return {
    itemId: v.id,
    skill: `vocab:${v.id}`,
    prompt: [`z.where.${v.id}`],
    options: opts.map((x) => ({ id: x.id, v: { t: 'emoji', icon: x.icon } })),
    answer: v.id,
    correction: [`z.itis.${v.id}`],
    teach: { visual: { t: 'emoji', icon: v.icon }, lines: [`teach.vocab.${v.id}`] },
  }
}

const zCategory = (level: number, recent: string[]): ChoiceItem => {
  const tags: Tag[] = ['fly', 'water', 'wheels', 'eat', 'legs4']
  const tag = pickTarget(tags.slice(0, level >= 3 ? 5 : 4), (t) => `cat:${t}`, recent as Tag[])
  const ok = (x: (typeof VOCAB)[number]) => !AMBIGUOUS[tag].includes(x.id)
  const ans = pick(VOCAB.filter((x) => x.tags.includes(tag) && ok(x)))
  const wrong = sample(VOCAB.filter((x) => !x.tags.includes(tag) && ok(x)), optCount(level) - 1)
  const opts = shuffle([ans, ...wrong])
  return {
    itemId: tag,
    skill: `cat:${tag}`,
    prompt: [`z.cat.${tag}`],
    options: opts.map((x) => ({ id: x.id, v: { t: 'emoji', icon: x.icon } })),
    answer: ans.id,
    correction: [`z.itis.${ans.id}`],
    // 先看例子：Birds can fly. Airplanes can fly, too!
    teach: { visual: CAT_EXAMPLES[tag].map((id) => ({ t: 'emoji', icon: vocab(id).icon }) as Visual), focus: [0, 1], lines: [`teach.cat.${tag}.0`, `teach.cat.${tag}.1`] },
  }
}

const zSound = (level: number, recent: string[]): ChoiceItem => {
  const pool = VOCAB.filter((x) => x.sound)
  const v = pickTarget(pool, (x) => `sound:${x.id}`, pool.filter((x) => recent.includes(x.id)))
  const opts = shuffle([v, ...sample(pool.filter((x) => x.id !== v.id), optCount(level) - 1)])
  return {
    itemId: v.id,
    skill: `sound:${v.id}`,
    prompt: [`z.sound.${v.id}`],
    options: opts.map((x) => ({ id: x.id, v: { t: 'emoji', icon: x.icon } })),
    answer: v.id,
    correction: [`z.itis.${v.id}`],
    teach: { visual: { t: 'emoji', icon: v.icon }, lines: [`teach.sound.${v.id}`] },
  }
}

// ── 彩虹公園 ───────────────────────────────────────────────
const pColor = (level: number, recent: string[]): ChoiceItem => {
  const pool = COLORS.slice(0, level >= 3 ? 8 : 5)
  const c = pickTarget(pool, (x) => `color:${x.id}`, pool.filter((x) => recent.includes(x.id)))
  const opts = shuffle([c, ...sample(pool, optCount(level) - 1, [c])])
  const shape = level >= 4 ? (pick(SHAPES).id as ShapeId) : null
  return {
    itemId: c.id,
    skill: `color:${c.id}`,
    prompt: [`p.color.${c.id}`],
    options: opts.map((x) => ({ id: x.id, v: shape ? { t: 'shape', shape, hex: x.hex } : { t: 'color', hex: x.hex } })),
    answer: c.id,
    correction: [`p.thisis.color.${c.id}`],
    teach: { visual: { t: 'color', hex: c.hex }, side: { t: 'emoji', icon: COLOR_EXAMPLES[c.id] }, sideAt: 1, lines: [`teach.color.${c.id}`, `teach.colorlike.${c.id}`] },
  }
}

const pShape = (level: number, recent: string[]): ChoiceItem => {
  const pool = SHAPES.slice(0, level >= 3 ? 6 : 4)
  const s = pickTarget(pool, (x) => `shape:${x.id}`, pool.filter((x) => recent.includes(x.id)))
  const opts = shuffle([s, ...sample(pool, optCount(level) - 1, [s])])
  // 低難度全部同色，只比形狀；高難度顏色各不同，要忽略顏色
  const hexes = shuffle(COLORS.map((c) => c.hex))
  return {
    itemId: s.id,
    skill: `shape:${s.id}`,
    prompt: [`p.shape.${s.id}`],
    options: opts.map((x, i) => ({ id: x.id, v: { t: 'shape', shape: x.id, hex: level >= 3 ? hexes[i] : '#F0B088' } })),
    answer: s.id,
    correction: [`p.thisis.shape.${s.id}`],
    teach: { visual: { t: 'shape', shape: s.id, hex: '#F0B088' }, lines: [`teach.shape.${s.id}`, `teach.shapefun.${s.id}`] },
  }
}

const pSize = (level: number): ChoiceItem => {
  const icon = pick(SIZE_ICONS)
  const askSmall = level >= 2 && Math.random() < 0.5
  const scales = level >= 3 ? shuffle([1, 0.68, 0.42]) : shuffle(level === 1 ? [1, 0.45] : [1, 0.6])
  const target = askSmall ? Math.min(...scales) : Math.max(...scales)
  const pair: Visual[] = [{ t: 'emoji', icon, scale: 1 }, { t: 'emoji', icon, scale: 0.45 }]
  return {
    itemId: `${icon}:${askSmall ? 'small' : 'big'}`,
    skill: askSmall ? 'size:small' : 'size:big',
    prompt: [askSmall ? 'p.smaller' : 'p.bigger'],
    options: scales.map((s) => ({ id: String(s), v: { t: 'emoji', icon, scale: s } })),
    answer: String(target),
    correction: [askSmall ? 'p.this.smaller' : 'p.this.bigger'],
    teach: { visual: pair, focus: askSmall ? [1, 0] : [0, 1], lines: askSmall ? ['teach.smaller', 'teach.bigger'] : ['teach.bigger', 'teach.smaller'] },
  }
}

export const GAMES: GameDef[] = [
  { id: 'en-find', station: 'english', kind: 'choice', title: '找字母', icon: 'glowing-star', intro: 'en.intro.find', maxLevel: 4, make: enFind },
  { id: 'en-pic', station: 'english', kind: 'choice', title: '字母找朋友', icon: 'red-apple', intro: 'en.intro.pic', maxLevel: 3, make: enPic },
  { id: 'en-word', station: 'english', kind: 'choice', title: '聽英文找圖', icon: 'bus', intro: 'en.intro.word', maxLevel: 3, make: enWord },

  { id: 'm-count', station: 'math', kind: 'count', title: '點點數數', icon: 'egg', intro: 'm.intro.count', maxLevel: 4 },
  { id: 'm-match', station: 'math', kind: 'choice', title: '有幾個', icon: 'automobile', intro: 'm.intro.match', maxLevel: 4, make: mMatch },
  { id: 'm-find', station: 'math', kind: 'choice', title: '找數字', icon: 'star', intro: 'm.intro.find', maxLevel: 4, make: mFind },
  { id: 'm-compare', station: 'math', kind: 'choice', title: '比多少', icon: 'strawberry', intro: 'm.intro.compare', maxLevel: 4, make: mCompare },
  { id: 'm-order', station: 'math', kind: 'order', title: '照順序', icon: 'construction', intro: 'm.intro.order', maxLevel: 4 },

  { id: 'z-find', station: 'mandarin', kind: 'choice', title: '聽詞找圖', icon: 'dog-face', intro: 'z.intro.find', maxLevel: 4, make: zFind },
  { id: 'z-category', station: 'mandarin', kind: 'choice', title: '動動腦', icon: 'airplane', intro: 'z.intro.category', maxLevel: 4, make: zCategory },
  { id: 'z-sound', station: 'mandarin', kind: 'choice', title: '聽聲音猜猜看', icon: 'cow-face', intro: 'z.intro.sound', maxLevel: 4, make: zSound },

  { id: 'd-trace', station: 'draw', kind: 'trace', title: '運筆小路', icon: 'automobile', intro: 'd.intro.trace', maxLevel: 6 },
  { id: 'd-dots', station: 'draw', kind: 'dots', title: '連點成圖', icon: 'star', intro: 'd.intro.dots', maxLevel: 4 },
  { id: 'd-color', station: 'draw', kind: 'coloring', title: '著色', icon: 'crayon', intro: 'd.intro.color', maxLevel: 1 },
  { id: 'd-free', station: 'draw', kind: 'free', title: '自由畫畫', icon: 'framed-picture', intro: 'd.intro.free', maxLevel: 1 },
  { id: 'd-glyph', station: 'draw', kind: 'glyph', title: '描數字字母', icon: 'pencil', intro: 'd.intro.glyph', maxLevel: 4 },

  { id: 'p-color', station: 'park', kind: 'choice', title: '找顏色', icon: 'balloon', intro: 'p.intro.color', maxLevel: 4, make: pColor },
  { id: 'p-shape', station: 'park', kind: 'choice', title: '找形狀', icon: 'glowing-star', intro: 'p.intro.shape', maxLevel: 4, make: pShape },
  { id: 'p-size', station: 'park', kind: 'choice', title: '比大小', icon: 'elephant', intro: 'p.intro.size', maxLevel: 3, make: pSize },

  // ── 工作線 A ──
  // 功文式小練習：全是已熟的數字題、一題接一題（由 ChoiceGame 交給 src/games/FluencyGame.tsx）
  { id: 'm-quick', station: 'math', kind: 'choice', title: '數字快答', icon: 'rocket', intro: 'quick.intro', maxLevel: 1 },
  // ── 工作線 A ──
  // ── 工作線 B ── 學習單題型（題目產生器在 games-worksheet.ts）
  { id: 'm-fill', station: 'math', kind: 'fill', title: '塗格子', icon: 'lady-beetle', intro: 'ws.intro.fill', maxLevel: 4 },
  { id: 'm-give', station: 'math', kind: 'give', title: '給波波蛋', icon: 'basket', intro: 'ws.intro.give', maxLevel: 4 },
  { id: 'm-flash', station: 'math', kind: 'subitize', title: '一眼看幾個', icon: 'game-die', intro: 'ws.intro.flash', maxLevel: 4 },
  { id: 'p-findall', station: 'park', kind: 'findall', title: '找出全部', icon: 'red-apple', intro: 'ws.intro.findall', maxLevel: 4 },
  { id: 'p-lasso', station: 'park', kind: 'lasso', title: '圈圈看', icon: 'crayon', intro: 'ws.intro.lasso', maxLevel: 4 },
  { id: 'p-solid', station: 'park', kind: 'findall', title: '立體形狀', icon: 'package', intro: 'ws.intro.solid', maxLevel: 4 },
  { id: 'z-use', station: 'mandarin', kind: 'findall', title: '做什麼用', icon: 'umbrella', intro: 'ws.intro.use', maxLevel: 4 },
  // ── 工作線 B ──
]

export const game = (id: string) => GAMES.find((g) => g.id === id)!
export const gamesOf = (s: StationId) => GAMES.filter((g) => g.station === s)

/** 每局題數 */
export const ROUND_ITEMS = 6
