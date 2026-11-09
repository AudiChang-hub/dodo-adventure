// 找一樣的字（T-117，家長 2026-11-09：「學校會問以下哪個字跟這個字長的一樣」）：上面一個大字，下面兩、三個字，點長得一模一樣的那個。
// 比的是字的樣子（幼教指引 CG-1 找一樣的、ZH-5 對文字的覺察），不是認字（ZH-6 不考認字）：題目不念、不問「哪個是豬」。
// 只有純函式（出題、像不像、升降級），scripts/test-zh-course.ts 直接測；畫面在 ./Glyph.tsx，存取在 ./progress.ts。設計：docs/T-117-認字配對設計.md
import GLYPHS from './glyphs.generated.json'
import type { ZhText } from './data'

/** 作答紀錄的遊戲 id；技能是 zhglyph:<字>（跟選圖的 zhtext: 分開：2 選 1 不混進下一步準備度 NEXT-3） */
export const GLYPH_GAME = 'zh-glyph'

/** 挑答案字時跳過的字：很多詞都有、不是這個詞的重點（小豬 → 豬，不考「小」） */
const COMMON = new Set([...'子小大兒頭老的一了'])

const isHan = (c: string) => /[一-鿿]/.test(c)

/** 一個詞要考的那個字：第一個不是常見字的字（都是常見字就用第一個） */
export const charOf = (word: string) => [...word].find((c) => isHan(c) && !COMMON.has(c)) ?? [...word][0]

// ── 長得像不像 ──────────────────────────────────────────────
// scripts/build-zh-glyphs.mjs 用粉圓體把每個字畫成 16×16 的小圖（有墨的格是 1）。像不像＝兩張小圖疊起來，重疊的格數 ÷ 兩個字合起來的格數（0～1）。
const N = 16
const MAP = GLYPHS as Record<string, string>
const cache = new Map<string, Uint8Array>()
function bits(c: string): Uint8Array | null {
  const hex = MAP[c]
  if (!hex) return null
  let b = cache.get(c)
  if (!b) {
    b = new Uint8Array(N * N)
    for (let y = 0; y < N; y++) {
      const row = parseInt(hex.slice(y * 4, y * 4 + 4), 16)
      for (let x = 0; x < N; x++) b[y * N + x] = (row >> (N - 1 - x)) & 1
    }
    cache.set(c, b)
  }
  return b
}

/** 兩個字長得多像（0 完全不像～1 一模一樣）；沒有小圖的字回傳 null */
export function glyphSim(a: string, b: string): number | null {
  const A = bits(a)
  const B = bits(b)
  if (!A || !B) return null
  let and = 0
  let or = 0
  for (let i = 0; i < N * N; i++) {
    and += A[i] & B[i]
    or += A[i] | B[i]
  }
  return or ? and / or : 1
}

/** 「長得差很多」：重疊不到這麼多（例：豬／小 0.27、豬／三 0.32；豬／貓 0.53） */
export const FAR = 0.4
/** 「有一點像」的上限：再像就是「大／太」（0.82）這種只差一點點的，那是 4 歲以後的事 */
export const NEAR_MAX = 0.75

// ── 出題 ────────────────────────────────────────────────────
export type GlyphLevel = 1 | 2 | 3

export interface GlyphQuestion {
  /** 要找的字（這一篇紅字裡的一個字） */
  char: string
  /** 它是哪個紅字詞裡的字（給大人看、記錄用） */
  word: string
  /** 選項：答案在第一個（畫面上再洗牌） */
  options: string[]
  level: GlyphLevel
}

/** 同一篇第 run 次考哪個紅字詞：家長定的那一題先，3 次輪流換（只有一個紅字就重複） */
export function glyphWord(t: ZhText, run: number): string | null {
  const words = [t.quiz.answer, ...t.redWords.filter((w) => w !== t.quiz.answer)].filter((w) => t.redWords.includes(w) && bits(charOf(w)))
  return words.length ? words[(Math.max(1, run) - 1) % words.length] : null
}

/** 干擾字的候選：這一篇課文裡的國字（念課文時整篇都在畫面上），不含答案、不含答案那個詞裡的字 */
export function glyphPool(t: ZhText, word: string): string[] {
  const own = new Set([...word])
  return [...new Set(t.lines.join('').replace(/[【】]/g, ''))].filter((c) => isHan(c) && !own.has(c) && bits(c))
}

/**
 * 一題：答案是這一篇第 run 次輪到的紅字詞裡的那個字；干擾字只從這一篇課文裡挑（不教不考）。
 * - 第 1 級：2 選 1，干擾字長得差很多（重疊 < FAR）；
 * - 第 2 級：3 選 1，兩個都差很多；
 * - 第 3 級：3 選 1，一個「有一點像」（課文裡最像、但不超過 NEAR_MAX 的字），一個差很多。
 * 差很多的字有好幾個時隨機挑（rnd，測試給固定的），每次不會都是「了」「小」這幾個。
 */
export function glyphQuestion(t: ZhText, run: number, level: GlyphLevel, rnd: () => number = Math.random): GlyphQuestion | null {
  const word = glyphWord(t, run)
  if (!word) return null
  const char = charOf(word)
  const scored = glyphPool(t, word)
    .map((c) => ({ c, s: glyphSim(char, c)! }))
    .sort((a, b) => a.s - b.s || (a.c < b.c ? -1 : 1))
  // 差很多的字不到 3 個（課文裡的字都很複雜）：用最不像的 3 個
  const far = scored.filter((x) => x.s < FAR).length >= 3 ? scored.filter((x) => x.s < FAR) : scored.slice(0, 3)
  const pickFar = (n: number, not: Set<string>) => {
    const pool = far.filter((x) => !not.has(x.c)).map((x) => x.c)
    const out: string[] = []
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0])
    return out
  }
  let ds: string[]
  if (level === 1) ds = pickFar(1, new Set())
  else if (level === 2) ds = pickFar(2, new Set())
  else {
    const near = [...scored].reverse().find((x) => x.s <= NEAR_MAX && x.s >= FAR)?.c
    ds = near ? [near, ...pickFar(1, new Set([near]))] : pickFar(2, new Set())
  }
  const want = level === 1 ? 1 : 2
  if (ds.length < want) return null
  return { char, word, options: [char, ...ds], level }
}

// ── 升降級 ──────────────────────────────────────────────────
/** 熟練（準則 ADAPT-2，加上指引第七章的「不同日子」）：這一級最近 8 題裡 ≥ 7 題第一次就對、分布在 ≥ 3 天 */
export const MASTER_OF = 8
export const MASTER_OK = 7
export const MASTER_DAYS = 3
/** 最初幾次手先示範（到第一次第一下就點對為止，最多幾堂） */
export const DEMO_MAX = 3

export interface GlyphState {
  level: GlyphLevel
  /** 這一級（升降之後重新算）自己答的題：哪一天、第一下就點對了沒 */
  recent: { date: string; ok: boolean }[]
  /** 示範過幾堂 */
  demos: number
  /** 第一下就點對過（示範完自己點的也算；手指出答案以後才點的不算）：之後不再示範 */
  learned: boolean
}

export const GLYPH_START: GlyphState = { level: 1, recent: [], demos: 0, learned: false }

/** 這一堂要不要先讓手示範一次 */
export const needsDemo = (s: GlyphState) => !s.learned && s.demos < DEMO_MAX

/**
 * 答完一題之後：
 * - demo：這一堂手先示範過；led：第一下點的時候手正指著答案（發呆太久、錯兩次的提示）。兩種都不算熟練（記成一起練）。
 * - 最近 2 題第一次都點錯：退一級（準則 LOAD-5）；這一級熟練了：升一級。升降之後重新算。
 */
export function afterGlyph(s: GlyphState, r: { date: string; first: boolean; demo: boolean; led: boolean }): GlyphState {
  const learned = s.learned || (r.first && !r.led)
  const demos = s.demos + (r.demo ? 1 : 0)
  if (r.demo || r.led) return { ...s, demos, learned }
  const recent = [...s.recent, { date: r.date, ok: r.first }].slice(-MASTER_OF)
  const last2 = recent.slice(-2)
  if (s.level > 1 && last2.length === 2 && last2.every((x) => !x.ok)) return { level: (s.level - 1) as GlyphLevel, recent: [], demos, learned }
  const mastered = recent.length >= MASTER_OF && recent.filter((x) => x.ok).length >= MASTER_OK && new Set(recent.map((x) => x.date)).size >= MASTER_DAYS
  if (mastered && s.level < 3) return { level: (s.level + 1) as GlyphLevel, recent: [], demos, learned }
  return { level: s.level, recent, demos, learned }
}
