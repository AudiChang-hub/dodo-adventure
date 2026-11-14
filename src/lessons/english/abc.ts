// 字母遊戲時間（T-147 英文門案 A）：今天的課上完、同一天再進英文門玩的那一段。純資料，不碰畫面（畫面在 Play.tsx、Wall.tsx、Pair.tsx、Flip.tsx）。
// 不教不考（指引 HOW-2）：只用學過的字母，和英文課教過的那 2 個代表字（data.ts 每個字母 words 的前 2 個）。
// 不考「哪個是 A 開頭」（家長 2026-11-14：孩子沒記得單字，只能用猜的；指引 A6 音素要 4～5 歲才穩），配對遊戲都是聽字找圖。
// 進度存在 kv `lesson.english.play`（舊版不讀）：今天玩到哪裡、第幾次進來、新遊戲自己做對幾次（示範到什麼時候）。
// 作答記 skill `enword:apple`（不是 letter:A、phonics:a）：不改家長區 NEXT-2 準備度的算法。
import { getKV, setKV, today } from '../../lib/db'
import { LESSON_LETTERS, ORDER, wordId, type LessonLetter } from './data'
import type { PhonicsWord } from './letters-extra'

export const PLAY_KV = 'lesson.english.play'

/** 配對遊戲：放進籃子（pair，聽字找圖）、翻翻卡（兩張一樣的圖）；每天輪流，同一天再進來換另一種 */
export type AbcGame = 'pair' | 'flip'
export const ABC_GAMES: readonly AbcGame[] = ['pair', 'flip']
/** 作答紀錄的 game */
export const ABC_GAME_ID: Record<AbcGame, string> = { pair: 'abc-find', flip: 'abc-flip' }

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

/** 英文課教過的字（家長 2026-11-14：一個字母教 2 個代表字） */
export const taughtWords = (x: LessonLetter): PhonicsWord[] => x.words.slice(0, 2)
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
export const canMatch = (learned: readonly string[]) =>
  learned.length >= 2 && new Set(learned.flatMap((L) => findable(letterOf(L)).map((w) => kindOf(w.w)))).size >= 2

/**
 * 這幾回合要玩哪幾個字母（n 個）：今天的字母先，再來是到期該複習的，再來隨便挑最近學的；
 * 字母不夠就重複，但不連續兩回合同一個。
 */
export function targets(learned: readonly string[], todayL: string, n: number, due: (L: string) => boolean = () => false, rnd: () => number = Math.random): string[] {
  const ok = [...learned].filter((L) => findable(letterOf(L)).length > 0)
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
export const kindOf = (w: string) => KIND[wordId(w)] ?? 'thing'
/** 聽字找圖可以用的字：教過、看圖認得出來的 */
export const findable = (x: LessonLetter): PhonicsWord[] => taughtWords(x).filter((w) => !ABSTRACT.has(wordId(w.w)))

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
export function distractors(ans: WordPick, learned: readonly string[], n: number, rnd: () => number = Math.random): PhonicsWord[] {
  const k = kindOf(ans.w.w)
  const pool = learned
    .flatMap((L) => findable(letterOf(L)))
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
export function wordTargets(learned: readonly string[], todayL: string, n: number, due: (L: string) => boolean = () => false, rnd: () => number = Math.random): WordPick[] {
  const mine: WordPick[] = learned.includes(todayL) ? shuffleWith(findable(letterOf(todayL)), rnd).map((w) => ({ L: todayL, w })) : []
  const others: WordPick[] = targets(learned, todayL, 8, due, rnd)
    .filter((L) => L !== todayL)
    .map((L) => {
      const ws = findable(letterOf(L))
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
  /** 作答紀錄：enword:apple（不算進字母熟練、也不算進隔天重不重上） */
  skill: string
}

const optOf = (w: PhonicsWord): PairOpt => ({ id: wordId(w.w), w: w.w, icon: w.icon })

/** 放進籃子一回合：豆豆說 Where's the apple?，2～3 張圖（答案＋不同類的干擾圖）。干擾圖一張都沒有回傳 null */
export function makePair(p: WordPick, learned: readonly string[], nOpts: 2 | 3 = 2, rnd: () => number = Math.random): PairRound | null {
  const others = distractors(p, learned, nOpts - 1, rnd)
  if (!others.length) return null
  return { L: p.L, answer: wordId(p.w.w), w: p.w.w, options: shuffleWith([p.w, ...others], rnd).map(optOf), skill: `enword:${wordId(p.w.w)}` }
}

/** 放進籃子這一次的 4 回合（出不了題的回合跳過）；2 選 1 開始，熟了、學過 3 個字母以上才 3 選 1 */
export function makePairs(learned: readonly string[], todayL: string, mature: boolean, due?: (L: string) => boolean, rnd: () => number = Math.random): PairRound[] {
  const n: 2 | 3 = mature && learned.length >= 3 ? 3 : 2
  return wordTargets(learned, todayL, PAIR_ROUNDS, due, rnd)
    .map((p) => makePair(p, learned, n, rnd))
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
export function makeFlips(learned: readonly string[], todayL: string, mature: boolean, due?: (L: string) => boolean, rnd: () => number = Math.random): FlipCard[][] {
  const sizes = [mature && learned.length >= 3 ? 3 : 2, 2].slice(0, FLIP_BOARDS)
  const order = wordTargets(learned, todayL, 10, due, rnd).filter((p, i, a) => a.findIndex((q) => q.w.icon === p.w.icon) === i)
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
    ...(s.last === 'pair' || s.last === 'flip' ? { last: s.last } : {}),
    ...(cur ? { cur: { game: cur.game === 'pair' || cur.game === 'flip' ? cur.game : null, wall: !!cur.wall, round: Math.max(0, Number(cur.round) || 0) } } : {}),
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
