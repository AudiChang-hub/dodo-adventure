// 字母遊戲時間（T-147 英文門案 A）：今天的課上完、同一天再進英文門玩的那一段。純資料，不碰畫面（畫面在 Play.tsx、Wall.tsx、Pair.tsx、Flip.tsx）。
// 不教不考（指引 HOW-2）：只用學過的字母，和英文課教過的那 2 個代表字（data.ts 每個字母 words 的前 2 個）。
// 不考「哪個是 A 開頭」（家長 2026-11-14：孩子沒記得單字，只能用猜的；指引 A6 音素要 4～5 歲才穩），配對遊戲都是聽字找圖。
// 進度存在 kv `lesson.english.play`（舊版不讀）：今天玩到哪裡、第幾次進來、新遊戲自己做對幾次（示範到什麼時候）。
// 作答記 skill `enword:apple`（不是 letter:A、phonics:a）：不改家長區 NEXT-2 準備度的算法。
import { getKV, setKV, today } from '../../lib/db'
import { LESSON_LETTERS, ORDER, wordId, type LessonLetter } from './data'
import type { PhonicsWord } from './letters-extra'
import { EASY_ONSET, farApart, onsetOf, type OnsetMode } from './stage4'

export const PLAY_KV = 'lesson.english.play'

/**
 * 配對遊戲：放進籃子（pair，聽字找圖）、翻翻卡（兩張一樣的圖）；每天輪流，同一天再進來換另一種。
 * 聽開頭（onset，T-150 E 4 歲內容）：門開了才有，不在 ABC_GAMES 的每天輪流裡（./stage4.ts 的 onsetToday 決定哪天玩）。
 */
export type AbcGame = 'pair' | 'flip' | 'onset'
export const ABC_GAMES: readonly ('pair' | 'flip')[] = ['pair', 'flip']
/** 作答紀錄的 game */
export const ABC_GAME_ID: Record<AbcGame, string> = { pair: 'abc-find', flip: 'abc-flip', onset: 'abc-onset' }
const isGame = (g: unknown): g is AbcGame => g === 'pair' || g === 'flip' || g === 'onset'

/** 字母牆一頁最多幾塊 */
export const WALL_MAX = 6
/** 放進籃子幾回合（LOAD-3） */
export const PAIR_ROUNDS = 4
/** 翻翻卡幾盤（一盤 2 對，兩盤共 4 對；熟了第一盤 3 對） */
export const FLIP_BOARDS = 2
/** 新遊戲自己做對幾次以前，第一回合都先示範（照 math/plays.ts 的 PLAY_SOLO） */
export const DEMO_UNTIL = 2
/** 自己做對幾次以後算熟了：放進籃子 3 選 1、翻翻卡第一盤 3 對 */
export const MATURE_AT = 4

const byL = new Map(LESSON_LETTERS.map((x) => [x.L, x]))
export const letterOf = (L: string): LessonLetter => byL.get(L) ?? LESSON_LETTERS[0]

/** 教到第 3 個字的字母（T-150 E 更多單字，./stage4.ts 的 moreSet）；沒有就是空的，照 3 歲的只用 2 個字 */
export type More = ReadonlySet<string>
const NONE: More = new Set()

/** 英文課教過的字（家長 2026-11-14：一個字母教 2 個代表字）；4 歲的「新朋友」教過第 3 個字的字母（more）是 3 個 */
export const taughtWords = (x: LessonLetter, more: More = NONE): PhonicsWord[] => x.words.slice(0, more.has(x.L) ? 3 : 2)
/** 教過、而且真的是這個字母開頭的字（X 只有 x-ray）：下課的陪玩小字用 */
export const taughtStarts = (x: LessonLetter): PhonicsWord[] => taughtWords(x).filter((w) => x.starts.includes(w))

/**
 * 學過的字母：這一輪 seq 裡 idx 以前的，加上今天的（今天上完了才算）。
 * 跟 quiz-plan.ts 的 learned／taught 同一套算法。
 */
export function learnedLetters(idx: number, seq = ORDER, doneToday = true): string[] {
  return [...seq.slice(0, Math.max(0, idx) + (doneToday ? 1 : 0))]
}

/**
 * 字母牆上的字母（最多 WALL_MAX 塊）：今天的字母先，再來是到期該複習的（lib/adaptive 的 isDue），
 * 再來是最近學的。learned 照學的順序，最後一個是最新的。
 */
export function wallLetters(learned: readonly string[], todayL: string, due: (L: string) => boolean = () => false, max = WALL_MAX): string[] {
  const recent = [...learned].reverse().filter((L) => L !== todayL)
  const first = learned.includes(todayL) ? [todayL] : []
  // 每個字母只問一次 due（讀進度的函式不一定每次回答一樣）
  const dues = recent.filter((L) => due(L))
  const rest = recent.filter((L) => !dues.includes(L))
  return [...first, ...dues, ...rest].slice(0, max)
}

/** 配對遊戲出得了題：學過 2 個字母以上（新帳號第一天只有字母牆），而且教過的字裡有兩類以上 */
export const canMatch = (learned: readonly string[], more: More = NONE) =>
  learned.length >= 2 && new Set(learned.flatMap((L) => findable(letterOf(L), more).map((w) => kindOf(w.w)))).size >= 2

/**
 * 這幾回合要玩哪幾個字母（n 個）：今天的字母先，再來是到期該複習的，再來隨便挑最近學的；
 * 字母不夠就重複，但不連續兩回合同一個。
 */
export function targets(learned: readonly string[], todayL: string, n: number, due: (L: string) => boolean = () => false, rnd: () => number = Math.random, more: More = NONE): string[] {
  const ok = [...learned].filter((L) => findable(letterOf(L), more).length > 0)
  if (!ok.length) return []
  const recent = ok.slice().reverse()
  const first = ok.includes(todayL) ? [todayL] : []
  const dues = recent.filter((L) => L !== todayL && due(L))
  const rest = shuffleWith(
    recent.filter((L) => L !== todayL && !dues.includes(L)).slice(0, 8),
    rnd,
  )
  const order = [...first, ...dues, ...rest]
  const out: string[] = []
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const L = order[i % order.length]
    if (out.length && out[out.length - 1] === L && order.length > 1) continue
    out.push(L)
  }
  return out
}

function shuffleWith<T>(a: T[], rnd: () => number): T[] {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

// ── 聽字找圖（家長 2026-11-14：拿掉「哪個是 A 開頭」，孩子沒記得單字只能用猜的；改成念剛教過的字，從圖裡點出來）──

/** 代表字是哪一類東西：聽字找圖的干擾圖要明顯不同類（蘋果配公車，不配檸檬） */
const KIND: Record<string, string> = {
  apple: 'food', egg: 'food', lemon: 'food', watermelon: 'food',
  ant: 'animal', cat: 'animal', dinosaur: 'animal', dog: 'animal', elephant: 'animal', fish: 'animal', fox: 'animal', gorilla: 'animal',
  horse: 'animal', iguana: 'animal', insect: 'animal', jellyfish: 'animal', kangaroo: 'animal', koala: 'animal', lion: 'animal', mouse: 'animal',
  octopus: 'animal', otter: 'animal', pig: 'animal', panda: 'animal', rabbit: 'animal', snake: 'animal', tiger: 'animal', turtle: 'animal',
  whale: 'animal', zebra: 'animal',
  bus: 'vehicle', car: 'vehicle', helicopter: 'vehicle', rocket: 'vehicle', van: 'vehicle',
  ball: 'toy', 'yo-yo': 'toy', gift: 'thing', umbrella: 'thing', yarn: 'thing', 'x-ray': 'thing',
  jeans: 'clothes', queen: 'person', nose: 'body',
  moon: 'sky', sun: 'sky', nest: 'nature', volcano: 'nature',
  zero: 'symbol', up: 'symbol', question: 'symbol',
}
/** 看圖認不出是哪個字的（箭頭、問號）：不拿來考、也不當干擾圖 */
const ABSTRACT = new Set(['up', 'question'])
export const isAbstract = (w: string) => ABSTRACT.has(wordId(w))
export const kindOf = (w: string) => KIND[wordId(w)] ?? 'thing'
/** 聽字找圖可以用的字：教過、看圖認得出來的 */
export const findable = (x: LessonLetter, more: More = NONE): PhonicsWord[] => taughtWords(x, more).filter((w) => !ABSTRACT.has(wordId(w.w)))

/** 答對時念的三明治：Apple. → A… → Apple.（現有的單字、字母名音檔，把字母和單字連起來） */
export const sandwich = (L: string, w: string) => [`ph.word.${wordId(w)}`, `en.pop.${L.toLowerCase()}`, `ph.word.${wordId(w)}`]

export interface WordPick {
  /** 這個字是哪個字母教的 */
  L: string
  w: PhonicsWord
}

/**
 * 干擾圖：其他教過的字（learned 字母的 2 個代表字），跟答案不同類、圖不一樣；n 張。
 * 同一類的不放（蘋果和西瓜都是水果，三歲分得出來，但這一題要練的是聽懂 apple）。
 */
export function distractors(ans: WordPick, learned: readonly string[], n: number, rnd: () => number = Math.random, more: More = NONE): PhonicsWord[] {
  const k = kindOf(ans.w.w)
  const pool = learned
    .flatMap((L) => findable(letterOf(L), more))
    .filter((w) => w.icon !== ans.w.icon && kindOf(w.w) !== k)
  const out: PhonicsWord[] = []
  for (const w of shuffleWith(pool, rnd)) {
    // 干擾圖彼此也不同類、圖不一樣
    if (out.some((o) => o.icon === w.icon || kindOf(o.w) === kindOf(w.w))) continue
    out.push(w)
    if (out.length >= n) break
  }
  return out
}

/**
 * 這幾回合聽哪幾個字（n 個）：今天的 2 個代表字先，再來是到期該複習的字母、最近學的字母各一個字；
 * 字不夠就重複，但不連續兩回合同一個字。
 */
export function wordTargets(learned: readonly string[], todayL: string, n: number, due: (L: string) => boolean = () => false, rnd: () => number = Math.random, more: More = NONE): WordPick[] {
  const mine: WordPick[] = learned.includes(todayL) ? shuffleWith(findable(letterOf(todayL), more), rnd).map((w) => ({ L: todayL, w })) : []
  const others: WordPick[] = targets(learned, todayL, 8, due, rnd, more)
    .filter((L) => L !== todayL)
    .map((L) => {
      const ws = findable(letterOf(L), more)
      return ws.length ? { L, w: ws[Math.floor(rnd() * ws.length) % ws.length] } : null
    })
    .filter((p): p is WordPick => !!p)
  const order = [...mine, ...others].filter((p, i, a) => a.findIndex((q) => q.w.w === p.w.w) === i)
  if (!order.length) return []
  const out: WordPick[] = []
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const p = order[i % order.length]
    if (out.length && out[out.length - 1].w.w === p.w.w && order.length > 1) continue
    out.push(p)
  }
  return out
}

// ── 放進籃子（聽字找圖）──────────────────────────────────

export interface PairOpt {
  /** wordId（apple、fire-truck） */
  id: string
  w: string
  icon: string
}

export interface PairRound {
  /** 這個字是哪個字母教的（答對時的三明治：Apple. A… Apple.） */
  L: string
  /** 要找的字（wordId）和它的英文 */
  answer: string
  w: string
  options: PairOpt[]
  /** 作答紀錄：enword:apple（不算進字母熟練、也不算進隔天重不重上）；聽開頭是 onset:a */
  skill: string
  /**
   * 聽開頭（T-150 E）的回合才有：問的開頭音（小寫 a）。豆豆先念每張圖的名字、再問 Find the one that starts with | a, a…（問音，不問字母名）；
   * 籃子上是嘴巴、不寫字母；答對念 A… a, a… apple!（ph.<音>.echo.<字>）
   */
  onset?: string
  /** 聽開頭的「一起做」：問完手就指著答案（記 guided，不算熟練） */
  led?: boolean
}

const optOf = (w: PhonicsWord): PairOpt => ({ id: wordId(w.w), w: w.w, icon: w.icon })

/** 放進籃子一回合：豆豆說 Where's the apple?，2～3 張圖（答案＋不同類的干擾圖）。干擾圖一張都沒有回傳 null */
export function makePair(p: WordPick, learned: readonly string[], nOpts: 2 | 3 = 2, rnd: () => number = Math.random, more: More = NONE): PairRound | null {
  const others = distractors(p, learned, nOpts - 1, rnd, more)
  if (!others.length) return null
  return { L: p.L, answer: wordId(p.w.w), w: p.w.w, options: shuffleWith([p.w, ...others], rnd).map(optOf), skill: `enword:${wordId(p.w.w)}` }
}

/** 放進籃子這一次的 4 回合（出不了題的回合跳過）；2 選 1 開始，熟了、學過 3 個字母以上才 3 選 1 */
export function makePairs(learned: readonly string[], todayL: string, mature: boolean, due?: (L: string) => boolean, rnd: () => number = Math.random, more: More = NONE): PairRound[] {
  const n: 2 | 3 = mature && learned.length >= 3 ? 3 : 2
  return wordTargets(learned, todayL, PAIR_ROUNDS, due, rnd, more)
    .map((p) => makePair(p, learned, n, rnd, more))
    .filter((r): r is PairRound => !!r)
}

// ── 翻翻卡（兩張一樣的圖配一對）───────────────────────────

export interface FlipCard {
  /** apple:1、apple:2 */
  id: string
  /** 這張卡是哪一對（wordId） */
  pair: string
  /** 這個字是哪個字母教的（配好時的三明治、卡角的字母） */
  L: string
  icon: string
  w: string
}

/** 一盤翻翻卡：每個字兩張一樣的圖，洗牌（翻一張念一張：Apple.；配好念三明治 Apple. A… Apple.） */
export function makeFlip(picks: readonly WordPick[], rnd: () => number = Math.random): FlipCard[] {
  const used = new Set<string>()
  const cards: FlipCard[] = []
  for (const p of picks) {
    if (used.has(p.w.icon)) continue
    used.add(p.w.icon)
    const id = wordId(p.w.w)
    for (const k of [1, 2]) cards.push({ id: `${id}:${k}`, pair: id, L: p.L, icon: p.w.icon, w: p.w.w })
  }
  return shuffleWith(cards, rnd)
}

/** 翻翻卡這一次的幾盤：每盤 2 對（熟了、學過 3 個字母以上，第一盤 3 對）；同一盤的字不重複，第一盤有今天的字 */
export function makeFlips(learned: readonly string[], todayL: string, mature: boolean, due?: (L: string) => boolean, rnd: () => number = Math.random, more: More = NONE): FlipCard[][] {
  const sizes = [mature && learned.length >= 3 ? 3 : 2, 2].slice(0, FLIP_BOARDS)
  const order = wordTargets(learned, todayL, 10, due, rnd, more).filter((p, i, a) => a.findIndex((q) => q.w.icon === p.w.icon) === i)
  const boards: FlipCard[][] = []
  for (const [b, size] of sizes.entries()) {
    // 第二盤從別的字開始，不跟第一盤一模一樣（字不夠就再用一次）
    const pool = b === 0 ? order : [...order.slice(sizes[0]), ...order.slice(0, sizes[0])]
    boards.push(makeFlip(pool.slice(0, size), rnd))
  }
  return boards.filter((x) => x.length >= 4)
}

// ── 進度 ──────────────────────────────────────────────

export interface PlayState {
  /** cur、sessions 是哪一天的 */
  date: string
  /** 今天玩完幾次（同一天第二次以後換另一種配對遊戲） */
  sessions: number
  /** 今天最後玩完的那一種 */
  last?: AbcGame
  /** 玩到一半（同一天回來從這裡接著玩）：字母牆看完了沒、配對遊戲做完幾回合（翻翻卡是幾盤） */
  cur?: { game: AbcGame | null; wall: boolean; round: number }
  /** 新遊戲自己做對幾次（跨天累計）：DEMO_UNTIL 以前示範、MATURE_AT 以後算熟了 */
  solo?: Partial<Record<AbcGame, number>>
  /** 最後一個「放上字母牆」的字母（T-149 E5：今天新學的那塊第一次出現才播放上去的動畫） */
  placed?: string
}

const clean = (v: unknown): PlayState | null => {
  if (!v || typeof v !== 'object') return null
  const s = v as Partial<PlayState>
  if (typeof s.date !== 'string') return null
  const cur = s.cur && typeof s.cur === 'object' ? s.cur : undefined
  return {
    date: s.date,
    sessions: typeof s.sessions === 'number' ? s.sessions : 0,
    ...(isGame(s.last) ? { last: s.last } : {}),
    ...(cur ? { cur: { game: isGame(cur.game) ? cur.game : null, wall: !!cur.wall, round: Math.max(0, Number(cur.round) || 0) } } : {}),
    solo: s.solo && typeof s.solo === 'object' ? s.solo : {},
    ...(typeof s.placed === 'string' ? { placed: s.placed } : {}),
  }
}

export async function loadPlay(): Promise<PlayState | null> {
  try {
    return clean(await getKV<unknown>(PLAY_KV, null))
  } catch {
    return null
  }
}
export const savePlay = (s: PlayState) => setKV(PLAY_KV, s).catch(() => {})

/**
 * 這次進來玩什麼（純函式）：今天玩到一半就接著玩；不然開新的一次——今天第一次照 variety（每天輪流，連續兩天不一樣），
 * 第二次以後換成跟上一次不一樣的那一種。學過的字母不夠配對（canMatch）：game 是 null，只有字母牆。
 */
export function startPlay(old: PlayState | null, variety: AbcGame, match: boolean, d = today()): PlayState {
  const solo = old?.solo ?? {}
  const placed = old?.placed ? { placed: old.placed } : {}
  if (old && old.date === d && old.cur) {
    const cur = old.cur.game || !match ? old.cur : { ...old.cur, game: variety }
    return { ...old, solo, cur: match ? cur : { ...cur, game: null } }
  }
  const sessions = old && old.date === d ? old.sessions : 0
  const last = old && old.date === d ? old.last : undefined
  const game: AbcGame | null = !match ? null : sessions > 0 && last ? (last === 'pair' ? 'flip' : 'pair') : variety
  return { date: d, sessions, ...(last ? { last } : {}), cur: { game, wall: false, round: 0 }, solo, ...placed }
}

/** 今天的字母還沒放上過字母牆（T-149 E5：放上去的動畫只播一次） */
export const isFresh = (s: PlayState | null, todayL: string) => s?.placed !== todayL

/** 玩完一次（純函式）：sessions 加一、記下玩的是哪一種，cur 清掉（再進來是新的一次） */
export function endPlay(s: PlayState): PlayState {
  const out: PlayState = { date: s.date, sessions: s.sessions + 1, solo: s.solo ?? {}, ...(s.placed ? { placed: s.placed } : {}) }
  const g = s.cur?.game ?? s.last
  if (g) out.last = g
  return out
}

// ── 4 歲：新朋友（T-150 E 更多單字，設計稿 3-1 案 A）───────────────

/** 不當新朋友教的第 3 個字：不是看得出來的東西（quiet 是安靜的臉） */
const NOT_NEW = new Set(['quiet'])

/**
 * 今天的新朋友：學過的字母裡，教過的 2 個字（看圖認得出的）都答得出來（known，./stage4.ts 的 knownWords）、還沒教第 3 個字的，
 * 挑最久以前學的那一個。沒有就回傳 null。learned 照學的順序，第一個是最久以前學的。
 */
export function pickNewWord(learned: readonly string[], known: ReadonlySet<string>, more: More): WordPick | null {
  const icons = new Set(learned.flatMap((M) => findable(letterOf(M), more)).map((w) => w.icon))
  for (const L of learned) {
    if (more.has(L)) continue
    const x = letterOf(L)
    const third = x.words[2]
    if (!third || isAbstract(third.w) || NOT_NEW.has(wordId(third.w))) continue
    const two = findable(x)
    if (!two.length || !two.every((w) => known.has(wordId(w.w)))) continue
    // 第 3 個字的圖跟別的教過的字同一張圖：不教，免得聽字找圖分不出來
    if (icons.has(third.icon)) continue
    return { L, w: third }
  }
  return null
}

// ── 4 歲：聽開頭（T-150 E 開頭音，設計稿 3-2 案 A）────────────────

/** 聽開頭一次幾回合（LOAD-3） */
export const ONSET_ROUNDS = 4

/** 26 個字母的 3 個字（同一個字只留一次） */
const ALL_WORDS: PhonicsWord[] = LESSON_LETTERS.flatMap((x) => x.words).filter((w, i, a) => a.findIndex((v) => wordId(v.w) === wordId(w.w)) === i)
const onsetW = (w: PhonicsWord) => onsetOf(wordId(w.w))

/**
 * 聽開頭一回合：答案的開頭音是它的第一個字母（onsetOf），干擾圖從 pool（答得出的字）裡挑——開頭音跟答案、跟彼此都差很遠
 * （不是同一組容易混的，stage4.ts 的 CONFUSE），也不同類、圖不一樣。湊不到 n−1 張干擾圖回傳 null。
 */
export function makeOnset(ans: PhonicsWord, pool: readonly PhonicsWord[], n: 2 | 3, led: boolean, rnd: () => number = Math.random): PairRound | null {
  const o = onsetW(ans)
  if (!o) return null
  const picked: PhonicsWord[] = []
  for (const w of shuffleWith([...pool], rnd)) {
    const wo = onsetW(w)
    if (!wo || w.icon === ans.icon || kindOf(w.w) === kindOf(ans.w) || !farApart(o, wo)) continue
    if (picked.some((p) => p.icon === w.icon || kindOf(p.w) === kindOf(w.w) || !farApart(onsetW(p)!, wo))) continue
    picked.push(w)
    if (picked.length >= n - 1) break
  }
  if (picked.length < n - 1) return null
  return { L: o.toUpperCase(), answer: wordId(ans.w), w: ans.w, options: shuffleWith([ans, ...picked], rnd).map(optOf), skill: `onset:${o}`, onset: o, ...(led ? { led: true } : {}) }
}

/**
 * 聽開頭這一次的回合（./stage4.ts 的 onsetMode）。只用答得出的字（known），答案先挑好聽出來的開頭（EASY_ONSET），
 * 連續兩回合不同一個開頭音、4 回合盡量不重複同一個字：
 * - intro（第一次）：4 回合 2 選 1，第 1 回合示範（Play 給 Pair 的 demo）、其他 3 回合一起做（手指著答案）。
 * - 1（退一級）：4 回合 2 選 1，第 1 回合示範，其他自己做（只是練習：2 選 1 不算熟練）。
 * - 2（平常）：第 1 回合一起做（2 選 1），其他 3 回合自己做 3 選 1（湊不到 3 張就 2 選 1）。
 * 出得了的回合少於 2 個：回傳空的（這一次不玩聽開頭）。
 */
export function makeOnsets(known: ReadonlySet<string>, mode: OnsetMode, rnd: () => number = Math.random): PairRound[] {
  const pool = ALL_WORDS.filter((w) => known.has(wordId(w.w)) && !isAbstract(w.w) && onsetW(w))
  const easy = (w: PhonicsWord) => EASY_ONSET.has(onsetW(w)!)
  const answers = [...shuffleWith(pool.filter(easy), rnd), ...shuffleWith(pool.filter((w) => !easy(w)), rnd)]
  const out: PairRound[] = []
  for (let r = 0; r < ONSET_ROUNDS; r++) {
    const led = mode === 'intro' ? r > 0 : mode === 2 && r === 0
    const n: 2 | 3 = mode === 2 && r > 0 ? 3 : 2
    const prev = out[out.length - 1]
    const ok = answers.filter((w) => !prev || onsetW(w) !== prev.onset)
    const used = new Set(out.map((q) => q.answer))
    const order = [...ok.filter((w) => !used.has(wordId(w.w))), ...ok.filter((w) => used.has(wordId(w.w)))]
    let q: PairRound | null = null
    for (const w of order) {
      q = makeOnset(w, pool, n, led, rnd) ?? (n === 3 ? makeOnset(w, pool, 2, led, rnd) : null)
      if (q) break
    }
    if (q) out.push(q)
  }
  return out.length >= 2 ? out : []
}
