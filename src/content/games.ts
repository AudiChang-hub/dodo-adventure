import type { Speaker } from './lines'
import type { StationId } from '../lib/db'
import { PHONICS, PHONICS_WORDS, CONFUSE, LOOKALIKE_LOWER, phonicsSkill, wordsOf, wordId, type PhonicsWord, type SoundUnit } from './letters'
import { VOCAB, AMBIGUOUS, CAT_EXAMPLES, catLine, vocab, type Tag, type VocabEntry } from './vocab'
import { keyOfVocab, lexWord, thisIs } from './lexicon'
import { colorKey, shapeKey } from './zh-words'
import { bridgeLines, isUnknown, needsTeach, usable } from '../lib/words'
import { COLORS, COLOR_EXAMPLES, SHAPES, SIZE_ICONS, COUNT_ICONS, type ShapeId } from './park'
import { COLOR_LOOKALIKE, SHAPE_LOOKALIKE } from './worksheet-data'
import { pickTarget, pickPreferred, unlockedNumbers, mastered, skill, isNew } from '../lib/adaptive'
import { themeNow, themed as themeList } from '../lib/theme-play'
import { weekTheme } from '../lib/settings'
import { pick, rand, sample, shuffle } from '../lib/random'
import { cPattern, type Dir } from './code'

export type Visual =
  | { t: 'emoji'; icon: string; scale?: number }
  | { t: 'letter'; ch: string }
  | { t: 'number'; n: number }
  | { t: 'group'; icon: string; count: number }
  | { t: 'color'; hex: string }
  | { t: 'shape'; shape: ShapeId; hex: string }
  // 程式車庫：箭頭卡、規律的一列（最後一格是「？」）
  | { t: 'arrow'; dir: Dir }
  | { t: 'seq'; items: Visual[] }
  // 比多少、比大小的「題目徽章」：一大堆／一點點、變大／變小（ui/Visual.tsx 的 CueArt）
  | { t: 'cue'; cue: Cue; icon: string }

/** 比較題問的是哪一邊：more 一大堆、less 一點點、big 變大、small 變小 */
export type Cue = 'more' | 'less' | 'big' | 'small'

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
  /**
   * 比較題的題目徽章（盤點：問「多」還是「少」、「大」還是「小」只能靠英文分辨）：
   * 一起練、自己答時一直掛在選項上方；教學卡會先把同一個徽章貼在答案那一邊，教過才考。
   */
  cue?: Extract<Visual, { t: 'cue' }>
  /** 教學卡上教了哪些單字（lexicon.ts 的 key）：出題規劃決定要跑教學卡時，記成「教過」（lib/words.ts） */
  teachWords?: string[]
  /**
   * 技能學過了、但這一題還是要先跑教學卡：答案的字家長勾了「他不認得」（要先重教），
   * 或教過的干擾選項一個都沒有、教學卡上要多教一個字。
   */
  needTeach?: boolean
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
  /** 題目徽章：念第一句時貼到第一句指的那一個（focus[0]）上，之後一直留著（比多少、比大小） */
  cue?: Visual
}

export type GameKind =
  | 'choice' | 'phonics' | 'count' | 'order' | 'trace' | 'dots' | 'coloring' | 'free' | 'glyph'
  // 工作線 B：學習單題型
  | 'findall' | 'lasso' | 'fill' | 'give' | 'subitize'
  // 程式車庫：箭頭卡開車、排順序、找規律（出題照選擇題的 planChoice，畫面是接火車車廂）
  | 'drive' | 'sequence' | 'pattern'

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
  // 車庫的水泥地：其他站都帶一點色相，這一站用偏冷的淺灰，在地圖上一眼分得出來
  { id: 'code', name: '程式車庫', host: 'bobo', icon: 'vertical-traffic-light', tint: '#DDE2E6', deep: '#6F8499' },
]

export const station = (id: StationId) => STATIONS.find((s) => s.id === id)!

/** 選項數：第 1 級 2 個、第 2 級 3 個、之後 4 個 */
const optCount = (level: number) => Math.min(4, level + 1)

// ── 主題式冒險（content/themes.ts）──────────────────────────────
// 今日冒險的那一站有主題時，題目裡的東西優先用主題的（數公車、找公車上的詞、bus 的開頭音）；
// 挑哪個技能照舊（pickPreferred：主題裡沒有能出的、或主題外有到期複習，就用一般的）。
/** 要數的東西：主題的（公車、恐龍蛋），沒有主題就用原本那一批 */
const countIcon = () => pick(themeList(COUNT_ICONS, (t) => t.count))
/** 這一批內容裡主題優先的（沒有主題是空的，pickPreferred 就照常挑） */
const themeFav = <T extends { id: string }>(pool: readonly T[], ids: (t: NonNullable<ReturnType<typeof themeNow>>) => readonly string[] | undefined): T[] => {
  const t = themeNow()
  const want = t ? (ids(t) ?? []) : []
  return pool.filter((x) => want.includes(x.id))
}

// ── 字母森林：自然發音（PRD §6.1b）────────────────────────────
// 不考字母名稱，考「哪個字是這個音開頭」。熟練度記在字母音上（phonics:b），三個遊戲共用：
// 任何一個遊戲遇到新的音，都先跑一次完整的學習循環（PhonicsIntro）再一起練、自己答。
//
// 單字也不教不考（2026-10-28）：
// - 答案的字：剛學的音用學習循環教過的三個關鍵字；熟了之後換複習字，但複習字第一次出現前先跑一張單字卡（看圖、聽名字、開頭音上色）。
// - 干擾圖：只用孩子教過的字（任何地方教過都算，例如動物村學過的 dog）；不夠就少放幾個（最少 2 個選項），
//   一個都沒有時（第一次玩、只學過這個音）先用單字卡教一個別的音開頭的字。
// - 家長勾了「他不認得」的字不當干擾圖、不放進學習循環；是答案時先重新教一次。

export type PhonicsMode = 'start' | 'same' | 'letter'

export interface PhonicsOption {
  id: string
  /** 圖片選項 */
  word?: PhonicsWord
  /** 字母選項（小寫），卡上顯示 B b */
  letter?: string
  /** 字母卡的鷹架：還不熟的音，字母下面放關鍵字的小圖 */
  cue?: PhonicsWord
}

/** 自己答之前先教的一張單字卡：一張圖、幾句話（念完點一下再聽一次第一句） */
export interface WordCard {
  /** 單字 key（lexicon.ts） */
  key: string
  word: PhonicsWord
  lines: string[]
}

export interface PhonicsItem {
  itemId: string
  skill: string
  /** 學習循環用的音：家長勾掉的關鍵字已經換成同一個音的其他字 */
  unit: SoundUnit
  mode: PhonicsMode
  /** 「哪個跟 bus 開頭一樣？」的 bus */
  stimulus?: PhonicsWord
  prompt: string[]
  /** 題目唸完後依序點名的圖片選項 id（字母選項不點名，不然就把答案唸出來了） */
  names: string[]
  options: PhonicsOption[]
  answer: string
  /** 答對之後：這個字配上這個音（Ball! buh, buh, ball!） */
  after: string[]
  /** 自己答之前先教的字（新的複習字、補上的干擾字、家長勾掉後重教的字），依序一張一張 */
  wordCards: WordCard[]
}

/** 同時在學（還沒熟）的音最多幾個：熟了一個才開下一個 */
const LEARNING_WINDOW = 3

/** 依教學順序開放：前面有三個還沒熟的音就先停下來（延後的音不在 PHONICS 裡，不會開放） */
export function unlockedSounds(): SoundUnit[] {
  const out: SoundUnit[] = []
  let learning = 0
  for (const u of PHONICS) {
    if (learning >= LEARNING_WINDOW) break
    out.push(u)
    if (!mastered(phonicsSkill(u.letter))) learning++
  }
  return out
}

/** 學過一陣子（2 格以上）：開始用複習字、聽音找字母拿掉圖片鷹架 */
const familiar = (u: SoundUnit) => skill(phonicsSkill(u.letter)).box >= 2

/** 兩個字母是不是同一個音（c、k 都是 /k/） */
const sameSound = (a: SoundUnit, b: SoundUnit) => a.letter === b.letter || a.phoneme === b.phoneme

type UnitWord = PhonicsWord & { unit: SoundUnit }

/** 這張圖會不會被聽成 u 開頭（本身是、或孩子可能叫成別的名字剛好是） */
function soundsLike(x: UnitWord, u: SoundUnit) {
  if (sameSound(x.unit, u)) return true
  return [...(x.alt ?? '')].some((c) => c === u.letter || PHONICS.some((p) => p.letter === c && p.phoneme === u.phoneme))
}

const wkey = (x: PhonicsWord) => wordId(x.w)
/** 一個字在 PHONICS 只會有一筆（同一張圖同一個名字），第一次出現的那個音為準 */
const UNIT_WORDS: UnitWord[] = PHONICS_WORDS.filter((x, i) => PHONICS_WORDS.findIndex((y) => y.w === x.w) === i)

/** 新的音（還沒自己答過）：這一題一定先跑學習循環，循環裡的三個字這一題就算教過 */
const introNow = (u: SoundUnit) => isNew(phonicsSkill(u.letter))

/** 學習循環的三個字：家長勾了「他不認得」的關鍵字，換成同一個音、沒被勾的複習字（不當例子） */
export function introUnit(u: SoundUnit): SoundUnit {
  if (!u.keys.some((k) => isUnknown(wkey(k)))) return u
  const spare = u.review.filter((x) => !isUnknown(wkey(x)) && !x.alt)
  const keys = u.keys.map((k) => (isUnknown(wkey(k)) ? (spare.shift() ?? k) : k)) as SoundUnit['keys']
  return { ...u, keys }
}

/** 這個字這一題能不能直接考：教過（或這一題的學習循環剛教），而且家長勾選之後有重新教過 */
const ready = (x: PhonicsWord, u: SoundUnit) => (introNow(u) && introUnit(u).keys.some((k) => k.w === x.w)) || !needsTeach(wkey(x))

/** 熟了之後換新的複習字的機會（一題最多教一個新字；教過的複習字照常輪流出） */
const NEW_WORD_SHARE = 0.5

/** 主題的字出成答案的機會 */
const THEME_WORD_SHARE = 0.6
/** 主題式冒險：主題的音出題的機會（其餘照原本挑，到期複習、還不熟的音不會被擠掉） */
const THEME_SOUND_SHARE = 0.5
const themeWords = <T extends PhonicsWord>(ws: readonly T[]): T[] => {
  const t = themeNow()
  return t ? ws.filter((x) => t.words.includes(x.w)) : []
}
/** 主題的字優先（公車旅行的 b 用 bus），但不是每一題：同一個音一局出好幾次時還是要換字 */
const themePick = <T extends PhonicsWord>(pool: readonly T[]): T => {
  const fav = themeWords(pool)
  return fav.length && Math.random() < THEME_WORD_SHARE ? pick(fav) : pick(pool)
}

/** 單字卡：字母森林的字（Noodles. → Noodles starts like Nnnnest!，字幕把開頭字母上色） */
const soundCard = (x: PhonicsWord, u: SoundUnit): WordCard => ({ key: wkey(x), word: x, lines: [...bridgeLines(wkey(x), `ph.word.${wkey(x)}`), `ph.${u.letter}.echo.${wkey(x)}`] })
/** 單字卡：只教名字（干擾圖用，不提它的開頭音：This is a | sun.） */
const nameCard = (x: PhonicsWord): WordCard => ({ key: wkey(x), word: x, lines: bridgeLines(wkey(x)) })

/**
 * 答案用的字：剛學時用三個關鍵字；熟一點之後用複習字，確認是真的懂這個音、不是記住某一張圖。
 * 還沒教過的字（新的複習字、新換上的關鍵字、家長勾掉的字）也可以當答案，但這一題先跑一張單字卡。
 */
function answerWord(u: SoundUnit, exclude: string[] = []): { w: PhonicsWord; card: boolean } {
  const keys = introUnit(u).keys.filter((x) => !exclude.includes(x.w))
  const rev = familiar(u) ? u.review.filter((x) => !exclude.includes(x.w) && !keys.includes(x)) : []
  const ok = (x: PhonicsWord) => ready(x, u)
  const fresh = [...rev, ...keys].filter((x) => !ok(x))
  const readyRev = rev.filter(ok)
  const pool = readyRev.length ? readyRev : keys.filter(ok)
  if (fresh.length && (!pool.length || Math.random() < NEW_WORD_SHARE)) return { w: themePick(fresh), card: true }
  if (pool.length) return { w: themePick(pool), card: false }
  const any = wordsOf(u).filter((x) => !exclude.includes(x.w))
  const w = themePick(any.length ? any : wordsOf(u))
  return { w, card: !ok(w) }
}

/**
 * 干擾圖：別的音開頭、孩子教過的字。優先用已經開放的音的關鍵字（剛在字母森林看過），
 * 最高難度放聽起來相近的音；一個音只放一張。教過的字不夠就少放幾張；一張都沒有時，cards 是要先教的那一張。
 */
function distractorWords(u: SoundUnit, n: number, level: number, exclude: string[] = []): { words: PhonicsWord[]; cards: WordCard[] } {
  const okSound = (x: UnitWord) => !soundsLike(x, u) && !exclude.includes(x.w) && !isUnknown(wkey(x))
  const cands = UNIT_WORDS.filter((x) => okSound(x) && usable(wkey(x)))
  const open = unlockedSounds()
  const out: UnitWord[] = []
  const add = (list: UnitWord[]) => {
    if (out.length >= n) return
    const free = list.filter((x) => !out.some((o) => o.unit === x.unit || o.w === x.w))
    if (!free.length) return
    // 主題的字當干擾也好：公車旅行裡 bus 的旁邊放 taxi、car
    out.push(themePick(free))
  }
  if (level >= 4)
    for (const c of CONFUSE[u.letter] ?? '') if (out.length < n - 1) add(cands.filter((x) => x.unit.letter === c))
  const isKey = (x: UnitWord) => x.unit.keys.some((k) => k.w === x.w)
  const keysOpen = cands.filter((x) => open.includes(x.unit) && isKey(x))
  for (let k = 0; k < n; k++) add(keysOpen)
  for (let k = 0; k < n; k++) add(cands)
  // 同一個音可以放第二張（教過的字很少時，寧可同一個音兩張，也不放沒教過的）
  for (const x of shuffle(cands)) if (out.length < n && !out.some((o) => o.w === x.w)) out.push(x)
  if (out.length) return { words: out, cards: [] }
  // 一個教過的字都沒有：教一個字（後面的音的關鍵字，第 1 層優先），只教名字、不教它的音
  const later = UNIT_WORDS.filter((x) => okSound(x) && isKey(x) && !x.alt)
  const easy = later.filter((x) => lexWord(wkey(x))?.tier === 1)
  const c = pick(easy.length ? easy : later.length ? later : UNIT_WORDS.filter(okSound))
  return { words: [c], cards: [nameCard(c)] }
}

/**
 * 越不熟、越久沒練的音越容易被選中（pickTarget）；但如果選中的是還沒教過的音，
 * 一律換成教學順序上最前面的那個新音——新的音要照研究過的順序教，不能隨機跳。
 */
function pickSound(pool: SoundUnit[], recent: string[]): SoundUnit {
  const key = (x: SoundUnit) => phonicsSkill(x.letter)
  const avoid = pool.filter((x) => recent.some((r) => r.split(':')[0] === x.letter))
  // 主題式冒險：開放中的音有主題的字（公車旅行的 b、t、c），一半的題目先出它們
  const fav = pool.filter((u) => themeWords(wordsOf(u)).length)
  const t = fav.length && Math.random() < THEME_SOUND_SHARE ? pickPreferred(fav, pool, key, avoid) : pickTarget(pool, key, avoid)
  return isNew(key(t)) ? (pool.find((x) => isNew(key(x))) ?? t) : t
}

const pictureOpt = (x: PhonicsWord): PhonicsOption => ({ id: wordId(x.w), word: x })

/** 哪個是 /b/ 開頭的？選圖 */
const phStart = (level: number, recent: string[]): PhonicsItem => {
  const u = pickSound(unlockedSounds(), recent)
  const ans = answerWord(u)
  const d = distractorWords(u, optCount(level) - 1, level, [ans.w.w])
  const opts = shuffle([ans.w, ...d.words]).map(pictureOpt)
  return {
    itemId: `${u.letter}:${wordId(ans.w.w)}`,
    skill: phonicsSkill(u.letter),
    unit: introUnit(u),
    mode: 'start',
    prompt: [`ph.${u.letter}.q.start`],
    names: opts.map((o) => o.id),
    options: opts,
    answer: wordId(ans.w.w),
    after: [`ph.${u.letter}.echo.${wordId(ans.w.w)}`],
    wordCards: [...(ans.card ? [soundCard(ans.w, u)] : []), ...d.cards],
  }
}

/** 哪個跟 bus 開頭一樣？ */
const phSame = (level: number, recent: string[]): PhonicsItem => {
  const u = pickSound(unlockedSounds(), recent)
  const keys = introUnit(u).keys
  const ok = keys.filter((x) => ready(x, u))
  const stim = themePick(ok.length ? ok : keys)
  const stimCard = !ready(stim, u)
  const ans = answerWord(u, [stim.w])
  const d = distractorWords(u, optCount(level) - 1, level, [ans.w.w, stim.w])
  const opts = shuffle([ans.w, ...d.words]).map(pictureOpt)
  return {
    itemId: `${u.letter}:${wordId(stim.w)}>${wordId(ans.w.w)}`,
    skill: phonicsSkill(u.letter),
    unit: introUnit(u),
    mode: 'same',
    stimulus: stim,
    prompt: [`ph.same.${wordId(stim.w)}`],
    names: opts.map((o) => o.id),
    options: opts,
    answer: wordId(ans.w.w),
    after: [`ph.${u.letter}.echo.${wordId(ans.w.w)}`],
    wordCards: [...(stimCard ? [soundCard(stim, u)] : []), ...(ans.card ? [soundCard(ans.w, u)] : []), ...d.cards],
  }
}

/**
 * 聽 /b/ 找字母：熟悉（2 格以上）的音才考；都還不熟時，字母卡下面放關鍵字小圖當鷹架。
 * 干擾的字母優先用已經學過的音（沒學過的音只在一個都沒有時放一個，而且不放圖）；
 * 鷹架的小圖一定是教過的字，有一張字母卡找不到教過的圖，就全部都不放（不然只有答案有圖）。
 */
const phLetter = (level: number, recent: string[]): PhonicsItem => {
  const open = unlockedSounds()
  const known = open.filter(familiar)
  // 熟悉的音少於兩個時，一直考同一個太單調：其他開放的音也出，但帶圖片鷹架
  const u = pickSound(known.length >= 2 ? known : open, recent)
  const n = optCount(level) - 1
  const learned = PHONICS.filter((x) => !sameSound(x, u) && !isNew(phonicsSkill(x.letter)))
  const others = learned.filter((x) => open.includes(x)).length >= n ? learned.filter((x) => open.includes(x)) : learned
  const pool = others.length ? others : open.filter((x) => !sameSound(x, u)).slice(0, 1)
  const look: SoundUnit[] = []
  if (level >= 4)
    for (const c of LOOKALIKE_LOWER[u.letter] ?? '') {
      const cu = pool.find((x) => x.letter === c)
      if (cu && look.length < n - 1) look.push(cu)
    }
  const wrong = [...look, ...sample(pool, n - look.length, [u, ...look])]
  // 這一題的音（u）新的話會先跑學習循環；其他字母卡的小圖要本來就教過
  const cueOf = (x: SoundUnit) => introUnit(x).keys.find((k) => (x === u ? ready(k, x) : !needsTeach(wkey(k))) && !isUnknown(wkey(k)))
  const cues = [u, ...wrong].map(cueOf)
  const scaffold = !familiar(u) && cues.every(Boolean)
  const opts = shuffle([u, ...wrong]).map((x): PhonicsOption => ({ id: x.letter, letter: x.letter, ...(scaffold ? { cue: cueOf(x) } : {}) }))
  const echo = cueOf(u) ?? introUnit(u).keys[0]
  return {
    itemId: u.letter,
    skill: phonicsSkill(u.letter),
    unit: introUnit(u),
    mode: 'letter',
    prompt: [`en.where.sound.${u.letter}`],
    names: [],
    options: opts,
    answer: u.letter,
    after: [`ph.${u.letter}.echo.${wordId(echo.w)}`],
    wordCards: ready(echo, u) ? [] : [soundCard(echo, u)],
  }
}

export const PHONICS_MAKERS: Record<string, (level: number, recent: string[]) => PhonicsItem> = {
  'ph-start': phStart,
  'ph-same': phSame,
  'ph-letter': phLetter,
}

/** 舊的字母遊戲改寫成自然發音：今天已經排好的冒險、舊紀錄裡的遊戲 id 對到新遊戲 */
export const LEGACY_GAME: Record<string, string> = { 'en-word': 'ph-start', 'en-pic': 'ph-same', 'en-find': 'ph-letter' }

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
        ? { visual: [{ t: 'number', n }, { t: 'group', icon: countIcon(), count: n }], focus: [0, 1], lines: [`teach.num.${n}`, `teach.count.${n}`] }
        : { visual: { t: 'number', n }, lines: [`teach.num.${n}`] },
  }
}

const mMatch = (level: number, recent: string[]): ChoiceItem => {
  const max = Math.min(10, [3, 5, unlockedNumbers(), unlockedNumbers()][level - 1] ?? 5)
  const n = pickTarget(range(1, Math.max(2, max)), (x) => `count:${x}`, recent.map(Number))
  const opts = shuffle([n, ...numDistractors(n, optCount(level) - 1, Math.max(max, 4), level >= 3)])
  const icon = countIcon()
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

/**
 * 比多少、比大小的由簡到難（2026-10-28 家長確認）：
 * 1. 先只問 more／bigger，兩邊差很多；
 * 2. more／bigger 真的熟了（到 2 級、而且隔天的到期複習答對過）才開始問 fewer／smaller，
 *    第一次出現照新內容先上教學卡（pick.ts 的 fresh）；
 * 3. fewer／smaller 也開始學了，差距才慢慢縮小：問的那一邊每多通過一次隔天複習，才縮一階；還在學的一律差很多。
 * 難度（level）只是上限：程度校準或同一局連續答對升級，都不會讓還沒熟的孩子看到少／小或很接近的兩邊。
 */
/** 跨天的到期複習答對過幾次（engine 的 REVIEW_DAYS）；還沒熟是 -1。同一局連對三題就「已熟」，不算真的熟 */
const reviews = (key: string) => (mastered(key) ? (skill(key).rev ?? 0) : -1)
/** 這一題的難度階段：1 是差很多；問的那一邊每通過一次複習縮一階（但不超過遊戲難度），另一邊（少／小）還沒學過就不縮 */
const compareStage = (level: number, key: string, second: string) => (isNew(second) ? 1 : Math.max(1, Math.min(level, 1 + reviews(key))))

const mCompare = (level: number): ChoiceItem => {
  const askLess = level >= 2 && reviews('compare:more') >= 1 && Math.random() < 0.5
  const stage = compareStage(level, askLess ? 'compare:less' : 'compare:more', 'compare:less')
  // 1–2 級：差 4–5 個（1 對 5、2 對 6、3 對 8）；3 級差 2–3 個；4 級差 1–2 個
  const gap = stage <= 2 ? 4 + rand(2) : stage === 3 ? 2 + rand(2) : 1 + rand(2)
  const a = 1 + (stage <= 2 ? rand(3) : rand(10 - gap))
  const b = a + gap
  const icon = countIcon()
  const pair = shuffle([a, b])
  const target = askLess ? Math.min(a, b) : Math.max(a, b)
  const cue = { t: 'cue', cue: askLess ? 'less' : 'more', icon } as const
  return {
    itemId: `${pair[0]}v${pair[1]}${askLess ? '<' : '>'}`,
    cue,
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
      cue,
    },
  }
}

// ── 動物村 ─────────────────────────────────────────────────
/**
 * 本週主題（家長設定，對應幼兒園聯絡簿，7 天後自動取消）：這個主題的詞出現機會變三倍。
 * 挑題本身還是到期複習優先、越不熟越常出，所以是「多複習學校正在教的」，不是只出這一類。
 */
function themed<T extends { theme: string }>(pool: readonly T[]): T[] {
  const theme = weekTheme()
  if (!theme) return [...pool]
  const mine = pool.filter((v) => v.theme === theme)
  return [...pool, ...mine, ...mine]
}
const themedVocab = () => themed(VOCAB)

// 單字也不教不考（2026-10-28）：干擾選項、動動腦的答案圖都只用教過的字（lib/words.ts 的 usable）。
// 教過的字不夠就少放幾個選項（最少 2 個）；一個都沒有時，在教學卡上多教一個字（第 1 層優先），這一題一定先跑教學卡。
const vkey = (x: VocabEntry) => keyOfVocab(x.id)
const usableVocab = (x: VocabEntry) => usable(vkey(x))

/** 從 pool 挑最多 n 個教過的干擾選項：prefer 裡的先挑 */
function knownOthers(pool: readonly VocabEntry[], n: number, prefer: (x: VocabEntry) => boolean = () => true): VocabEntry[] {
  const ok = pool.filter(usableVocab)
  const first = sample(ok.filter(prefer), n)
  return [...first, ...sample(ok, n - first.length, first)]
}

/** 補一個要在教學卡上先教的字：家長沒勾的、第 1 層優先 */
function companion(pool: readonly VocabEntry[], prefer: (x: VocabEntry) => boolean = () => true): VocabEntry | null {
  const c = pool.filter((x) => !isUnknown(vkey(x)))
  if (!c.length) return null
  const t1 = c.filter((x) => lexWord(vkey(x))?.tier === 1)
  const best = t1.filter(prefer).length ? t1.filter(prefer) : t1.length ? t1 : c
  return pick(best)
}

const emojiOf = (x: VocabEntry): Visual => ({ t: 'emoji', icon: x.icon })

/**
 * 教學卡上教一個或兩個字：每個字的台詞經過 lib/words.ts 的 bridgeLines（還沒學會的字接著唸中文三明治「蘋果 → Apple」），
 * 念到哪一句就指著那個字的圖。
 */
function wordTeach(items: { x: VocabEntry; line: string }[]): TeachSpec {
  if (items.length === 1) return { visual: emojiOf(items[0].x), lines: bridgeLines(vkey(items[0].x), items[0].line) }
  const per = items.map((it) => bridgeLines(vkey(it.x), it.line))
  return { visual: items.map((it) => emojiOf(it.x)), lines: per.flat(), focus: per.flatMap((ls, i) => ls.map(() => i)), short: per[0] }
}

const zFind = (level: number, recent: string[]): ChoiceItem => {
  const pool = themedVocab()
  const v = pickPreferred(themeFav(pool, (t) => t.vocab), pool, (x) => `vocab:${x.id}`, VOCAB.filter((x) => recent.includes(x.id)))
  // 低難度用不同類別當干擾（貓 vs 汽車），高難度用同一類（貓 vs 狗）
  const near = (x: VocabEntry) => (level >= 3 ? x.theme === v.theme : x.theme !== v.theme)
  const rest = VOCAB.filter((x) => x.id !== v.id)
  let others = knownOthers(rest, optCount(level) - 1, near)
  const comp = others.length ? null : companion(rest, near)
  if (comp) others = [comp]
  const opts = shuffle([v, ...others])
  return {
    itemId: v.id,
    skill: `vocab:${v.id}`,
    prompt: [`z.where.${v.id}`],
    options: opts.map((x) => ({ id: x.id, v: emojiOf(x) })),
    answer: v.id,
    correction: [thisIs(vkey(v))],
    teach: wordTeach([{ x: v, line: `teach.vocab.${v.id}` }, ...(comp ? [{ x: comp, line: `teach.vocab.${comp.id}` }] : [])]),
    teachWords: [vkey(v), ...(comp ? [vkey(comp)] : [])],
    needTeach: !!comp || needsTeach(vkey(v)),
  }
}

/** 動動腦教學卡的兩個例子：預設的兩個，家長勾掉的往後換（CAT_EXAMPLES 的候選字） */
function catExamples(tag: Tag): VocabEntry[] {
  const c = CAT_EXAMPLES[tag].map(vocab).filter((x) => x && !isUnknown(vkey(x)))
  return c.slice(0, 2)
}

const zCategory = (level: number, recent: string[]): ChoiceItem => {
  const tags: Tag[] = ['fly', 'water', 'wheels', 'eat', 'legs4']
  const open = tags.slice(0, level >= 3 ? 5 : 4)
  const tag = pickPreferred(open.filter((t) => themeNow()?.tags?.includes(t)), open, (t) => `cat:${t}`, recent as Tag[])
  const ok = (x: VocabEntry) => !AMBIGUOUS[tag].includes(x.id)
  const ex = catExamples(tag)
  // 新的分類一定先跑教學卡：卡上的兩個例子這一題就算教過
  const teaching = isNew(`cat:${tag}`)
  const known = (x: VocabEntry) => usableVocab(x) || (teaching && ex.includes(x))
  let yes = themed(VOCAB.filter((x) => x.tags.includes(tag) && ok(x) && known(x)))
  let needTeach = false
  // 動動腦的答案圖也要是教過的字：一個都沒有（例如家長把例子都勾掉了）就重跑教學卡，用卡上的例子當答案
  if (!yes.length) {
    needTeach = true
    yes = ex.length ? ex : VOCAB.filter((x) => x.tags.includes(tag) && ok(x) && !isUnknown(vkey(x))).slice(0, 1)
  }
  // 主題的東西當答案：公車旅行問「哪個有輪子」，答案是公車、計程車
  const fav = themeFav(yes, (t) => t.vocab)
  const ans = pick(fav.length ? fav : yes)
  const no = VOCAB.filter((x) => !x.tags.includes(tag) && ok(x))
  let wrong = knownOthers(no, optCount(level) - 1)
  const comp = wrong.length ? null : companion(no)
  if (comp) {
    wrong = [comp]
    needTeach = true
  }
  const opts = shuffle([ans, ...wrong])
  const shown = ex.length && (ex.includes(ans) || !needTeach) ? ex : [ans]
  const exLine = (x: VocabEntry, i: number) => (CAT_EXAMPLES[tag].includes(x.id) ? catLine(tag, x.id, i) : thisIs(vkey(x)))
  // 多教的那個字是教名字（This is a | car.）：還沒學會的話接著唸中文三明治；分類的例子句（Birds can fly.）是教分類，不加中文
  const compLines = comp ? bridgeLines(vkey(comp)) : []
  return {
    itemId: tag,
    skill: `cat:${tag}`,
    prompt: [`z.cat.${tag}`],
    options: opts.map((x) => ({ id: x.id, v: emojiOf(x) })),
    answer: ans.id,
    correction: [thisIs(vkey(ans))],
    // 先看例子：Birds can fly. Airplanes can fly, too!（不夠教過的干擾選項時，再多教一個字：This is a | car.）
    teach: {
      visual: [...shown.map(emojiOf), ...(comp ? [emojiOf(comp)] : [])],
      focus: [...shown.map((_, i) => i), ...compLines.map(() => shown.length)],
      lines: [...shown.map(exLine), ...compLines],
      short: [exLine(shown[0], 0)],
    },
    teachWords: [...shown.map(vkey), ...(comp ? [vkey(comp)] : [])],
    needTeach,
  }
}

const zSound = (level: number, recent: string[]): ChoiceItem => {
  const pool = VOCAB.filter((x) => x.sound)
  const weighted = themed(pool)
  const v = pickPreferred(themeFav(weighted, (t) => t.vocab), weighted, (x) => `sound:${x.id}`, pool.filter((x) => recent.includes(x.id)))
  const rest = pool.filter((x) => x.id !== v.id)
  let others = knownOthers(rest, optCount(level) - 1)
  const comp = others.length ? null : companion(rest)
  if (comp) others = [comp]
  const opts = shuffle([v, ...others])
  return {
    itemId: v.id,
    skill: `sound:${v.id}`,
    prompt: [`z.sound.${v.id}`],
    options: opts.map((x) => ({ id: x.id, v: emojiOf(x) })),
    answer: v.id,
    correction: [thisIs(vkey(v))],
    teach: wordTeach([{ x: v, line: `teach.sound.${v.id}` }, ...(comp ? [{ x: comp, line: `teach.sound.${comp.id}` }] : [])]),
    teachWords: [vkey(v), ...(comp ? [vkey(comp)] : [])],
    needTeach: !!comp || needsTeach(vkey(v)),
  }
}

// ── 彩虹公園 ───────────────────────────────────────────────
/**
 * 低難度（1–2 級）的干擾選項溫和一點：不放和答案長得像的（紅色旁邊不放粉紅、橘色；三角形旁邊不放星星），
 * 剛學會 red 的孩子是在練「聽到名字找到它」，不是在練分辨相近的顏色；3 級以上才放進來。
 * 干擾選項本來就可以是還沒教過的（在紅、綠、藍裡找紅色），答案一定是學過或剛教的（games/pick.ts）。
 */
function gentleOthers<T extends { id: string }>(pool: readonly T[], ans: T, n: number, level: number, like: Record<string, string[]>): T[] {
  const far = level <= 2 ? pool.filter((x) => x !== ans && !(like[ans.id] ?? []).includes(x.id)) : []
  const first = sample(far, n)
  return [...first, ...sample(pool, n - first.length, [ans, ...first])]
}

/** 顏色的教學卡：This is | red.（還沒學會的話接著唸「紅色 → Red.」）→ An apple is | red!（這一句才貼上例子的圖） */
function colorTeach(c: (typeof COLORS)[number]): TeachSpec {
  const lines = [...bridgeLines(colorKey(c.id), `teach.color.${c.id}`), `teach.colorlike.${c.id}`]
  return { visual: { t: 'color', hex: c.hex }, side: { t: 'emoji', icon: COLOR_EXAMPLES[c.id] }, sideAt: lines.length - 1, lines }
}

const pColor = (level: number, recent: string[]): ChoiceItem => {
  const pool = COLORS.slice(0, level >= 3 ? 8 : 5)
  const c = pickPreferred(pool.filter((x) => themeNow()?.colors.includes(x.id)), pool, (x) => `color:${x.id}`, pool.filter((x) => recent.includes(x.id)))
  const opts = shuffle([c, ...gentleOthers(pool, c, optCount(level) - 1, level, COLOR_LOOKALIKE)])
  const shape = level >= 4 ? (pick(SHAPES).id as ShapeId) : null
  return {
    itemId: c.id,
    skill: `color:${c.id}`,
    prompt: [`p.color.${c.id}`],
    options: opts.map((x) => ({ id: x.id, v: shape ? { t: 'shape', shape, hex: x.hex } : { t: 'color', hex: x.hex } })),
    answer: c.id,
    correction: [`p.thisis.color.${c.id}`],
    teach: colorTeach(c),
  }
}

const pShape = (level: number, recent: string[]): ChoiceItem => {
  const pool = SHAPES.slice(0, level >= 3 ? 6 : 4)
  const s = pickTarget(pool, (x) => `shape:${x.id}`, pool.filter((x) => recent.includes(x.id)))
  const opts = shuffle([s, ...gentleOthers(pool, s, optCount(level) - 1, level, SHAPE_LOOKALIKE)])
  // 低難度全部同色，只比形狀；高難度顏色各不同，要忽略顏色
  const hexes = shuffle(COLORS.map((c) => c.hex))
  return {
    itemId: s.id,
    skill: `shape:${s.id}`,
    prompt: [`p.shape.${s.id}`],
    options: opts.map((x, i) => ({ id: x.id, v: { t: 'shape', shape: x.id, hex: level >= 3 ? hexes[i] : '#F0B088' } })),
    answer: s.id,
    correction: [`p.thisis.shape.${s.id}`],
    teach: { visual: { t: 'shape', shape: s.id, hex: '#F0B088' }, lines: [...bridgeLines(shapeKey(s.id), `teach.shape.${s.id}`), `teach.shapefun.${s.id}`] },
  }
}

const pSize = (level: number): ChoiceItem => {
  const icon = pick(themeList(SIZE_ICONS, (t) => t.count))
  // 由簡到難同比多少（compareStage）：bigger 熟了才問 smaller；還在學的一律兩個、差很多
  const askSmall = level >= 2 && reviews('size:big') >= 1 && Math.random() < 0.5
  const stage = compareStage(level, askSmall ? 'size:small' : 'size:big', 'size:small')
  const scales = stage >= 3 ? shuffle([1, 0.68, 0.42]) : shuffle(stage === 2 ? [1, 0.62] : [1, 0.4])
  const target = askSmall ? Math.min(...scales) : Math.max(...scales)
  const pair: Visual[] = [{ t: 'emoji', icon, scale: 1 }, { t: 'emoji', icon, scale: 0.45 }]
  const cue = { t: 'cue', cue: askSmall ? 'small' : 'big', icon } as const
  return {
    itemId: `${icon}:${askSmall ? 'small' : 'big'}`,
    cue,
    skill: askSmall ? 'size:small' : 'size:big',
    prompt: [askSmall ? 'p.smaller' : 'p.bigger'],
    options: scales.map((s) => ({ id: String(s), v: { t: 'emoji', icon, scale: s } })),
    answer: String(target),
    correction: [askSmall ? 'p.this.smaller' : 'p.this.bigger'],
    teach: { visual: pair, focus: askSmall ? [1, 0] : [0, 1], lines: askSmall ? ['teach.smaller', 'teach.bigger'] : ['teach.bigger', 'teach.smaller'], cue },
  }
}

export const GAMES: GameDef[] = [
  { id: 'ph-start', station: 'english', kind: 'phonics', title: '開頭音找圖', icon: 'bus', intro: 'ph.intro.start', maxLevel: 4 },
  { id: 'ph-same', station: 'english', kind: 'phonics', title: '開頭一樣', icon: 'soccer-ball', intro: 'ph.intro.same', maxLevel: 4 },
  { id: 'ph-letter', station: 'english', kind: 'phonics', title: '聽音找字母', icon: 'glowing-star', intro: 'ph.intro.letter', maxLevel: 4 },

  { id: 'm-count', station: 'math', kind: 'count', title: '點點數數', icon: 'egg', intro: 'm.intro.count', maxLevel: 4 },
  { id: 'm-match', station: 'math', kind: 'choice', title: '有幾個', icon: 'automobile', intro: 'm.intro.match', maxLevel: 4, make: mMatch },
  { id: 'm-find', station: 'math', kind: 'choice', title: '找數字', icon: 'star', intro: 'm.intro.find', maxLevel: 4, make: mFind },
  { id: 'm-compare', station: 'math', kind: 'choice', title: '比多少', icon: 'strawberry', intro: 'm.intro.compare', maxLevel: 4, make: mCompare },
  { id: 'm-order', station: 'math', kind: 'order', title: '照順序', icon: 'construction', intro: 'm.intro.order', maxLevel: 4 },

  { id: 'z-find', station: 'mandarin', kind: 'choice', title: '聽詞找圖', icon: 'dog-face', intro: 'z.intro.find', maxLevel: 4, make: zFind },
  { id: 'z-category', station: 'mandarin', kind: 'choice', title: '動動腦', icon: 'airplane', intro: 'z.intro.category', maxLevel: 4, make: zCategory },
  { id: 'z-sound', station: 'mandarin', kind: 'choice', title: '聽聲音猜猜看', icon: 'cow-face', intro: 'z.intro.sound', maxLevel: 4, make: zSound },

  { id: 'd-trace', station: 'draw', kind: 'trace', title: '運筆小路', icon: 'automobile', intro: 'd.intro.trace', maxLevel: 6 },
  { id: 'd-dots', station: 'draw', kind: 'dots', title: '連點成圖', icon: 'star', intro: 'd.dots.intro', maxLevel: 4 },
  { id: 'd-color', station: 'draw', kind: 'coloring', title: '蠟筆著色', icon: 'crayon', intro: 'd.color.intro', maxLevel: 1 },
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
  // ── 程式車庫（PRD §10）── 題目產生器與資料在 code.ts
  { id: 'c-drive', station: 'code', kind: 'drive', title: '箭頭卡開車', icon: 'automobile', intro: 'c.intro.drive', maxLevel: 4 },
  { id: 'c-pattern', station: 'code', kind: 'pattern', title: '找規律', icon: 'puzzle-piece', intro: 'c.intro.pattern', maxLevel: 4, make: cPattern },
  { id: 'c-seq', station: 'code', kind: 'sequence', title: '排順序', icon: 'hatching-chick', intro: 'c.intro.seq', maxLevel: 4 },
]

export const game = (id: string) => GAMES.find((g) => g.id === (LEGACY_GAME[id] ?? id))!
export const gamesOf = (s: StationId) => GAMES.filter((g) => g.station === s)

/** 每局題數 */
export const ROUND_ITEMS = 6
