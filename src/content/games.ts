import type { Speaker } from './lines'
import type { StationId } from '../lib/db'
import { PHONICS, CONFUSE, LOOKALIKE_LOWER, phonicsSkill, wordsOf, wordId, type PhonicsWord, type SoundUnit } from './letters'
import { VOCAB, AMBIGUOUS, CAT_EXAMPLES, vocab, type Tag } from './vocab'
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
  | 'choice' | 'phonics' | 'count' | 'order' | 'trace' | 'dots' | 'coloring' | 'free' | 'glyph'
  // 工作線 B：學習單題型
  | 'findall' | 'lasso' | 'fill' | 'give' | 'subitize'
  // 程式車庫：箭頭卡開車、排順序（找規律是選擇題，用 choice）
  | 'drive' | 'sequence'

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

export interface PhonicsItem {
  itemId: string
  skill: string
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
}

/** 同時在學（還沒熟）的音最多幾個：熟了一個才開下一個 */
const LEARNING_WINDOW = 3

/** 依教學順序開放：前面有三個還沒熟的音就先停下來 */
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

/** 學過一陣子（2 格以上）：開始用新字複習、聽音找字母拿掉圖片鷹架 */
const familiar = (u: SoundUnit) => skill(phonicsSkill(u.letter)).box >= 2

/** 兩個字母是不是同一個音（c、k 都是 /k/） */
const sameSound = (a: SoundUnit, b: SoundUnit) => a.letter === b.letter || a.phoneme === b.phoneme

type UnitWord = PhonicsWord & { unit: SoundUnit }

/** 這張圖會不會被聽成 u 開頭（本身是、或孩子可能叫成別的名字剛好是） */
function soundsLike(x: UnitWord, u: SoundUnit) {
  if (sameSound(x.unit, u)) return true
  return [...(x.alt ?? '')].some((c) => c === u.letter || PHONICS.some((p) => p.letter === c && p.phoneme === u.phoneme))
}

/** 答案用的字：剛學時用三個關鍵字；熟一點之後用沒看過的新字，確認是真的懂這個音 */
function answerWord(u: SoundUnit, exclude: string[] = []): PhonicsWord {
  const base = familiar(u) && u.review.length ? u.review : u.keys
  const pool = base.filter((x) => !exclude.includes(x.w))
  // 主題的字優先（公車旅行的 b 用 bus），但不是每一題：同一個音一局出好幾次時還是要換字
  const fav = themeWords(pool)
  if (fav.length && Math.random() < THEME_WORD_SHARE) return pick(fav)
  return pick(pool.length ? pool : wordsOf(u).filter((x) => !exclude.includes(x.w)))
}

/** 主題的字出成答案的機會 */
const THEME_WORD_SHARE = 0.6
/** 主題式冒險：主題的音出題的機會（其餘照原本挑，到期複習、還不熟的音不會被擠掉） */
const THEME_SOUND_SHARE = 0.5
const themeWords = <T extends PhonicsWord>(ws: readonly T[]): T[] => {
  const t = themeNow()
  return t ? ws.filter((x) => t.words.includes(x.w)) : []
}

/** 干擾圖：別的音開頭的字，優先用已經開放的音的關鍵字（孩子叫得出名字）；最高難度放聽起來相近的音 */
function distractorWords(u: SoundUnit, n: number, level: number): PhonicsWord[] {
  const ok = (x: UnitWord) => !soundsLike(x, u)
  const open = unlockedSounds().filter((x) => !sameSound(x, u))
  const units = open.length >= n ? open : PHONICS.filter((x) => !sameSound(x, u)).slice(0, Math.max(n + 2, 6))
  const out: UnitWord[] = []
  const add = (cu: SoundUnit) => {
    const cands = cu.keys.map((k) => ({ ...k, unit: cu })).filter(ok)
    // 主題的字當干擾也好：公車旅行裡 bus 的旁邊放 taxi、car
    const fav = themeWords(cands)
    if (cands.length) out.push(pick(fav.length ? fav : cands))
  }
  if (level >= 4)
    for (const c of CONFUSE[u.letter] ?? '') {
      const cu = PHONICS.find((x) => x.letter === c)
      if (cu && out.length < n - 1) add(cu)
    }
  for (const cu of shuffle(units)) {
    if (out.length >= n) break
    if (!out.some((o) => o.unit === cu)) add(cu)
  }
  return out
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
  const opts = shuffle([ans, ...distractorWords(u, optCount(level) - 1, level)]).map(pictureOpt)
  return {
    itemId: `${u.letter}:${wordId(ans.w)}`,
    skill: phonicsSkill(u.letter),
    unit: u,
    mode: 'start',
    prompt: [`ph.${u.letter}.q.start`],
    names: opts.map((o) => o.id),
    options: opts,
    answer: wordId(ans.w),
    after: [`ph.${u.letter}.echo.${wordId(ans.w)}`],
  }
}

/** 哪個跟 bus 開頭一樣？ */
const phSame = (level: number, recent: string[]): PhonicsItem => {
  const u = pickSound(unlockedSounds(), recent)
  const keyFav = themeWords(u.keys)
  const stim = pick(keyFav.length ? keyFav : u.keys)
  const ans = answerWord(u, [stim.w])
  const opts = shuffle([ans, ...distractorWords(u, optCount(level) - 1, level)]).map(pictureOpt)
  return {
    itemId: `${u.letter}:${wordId(stim.w)}>${wordId(ans.w)}`,
    skill: phonicsSkill(u.letter),
    unit: u,
    mode: 'same',
    stimulus: stim,
    prompt: [`ph.same.${wordId(stim.w)}`],
    names: opts.map((o) => o.id),
    options: opts,
    answer: wordId(ans.w),
    after: [`ph.${u.letter}.echo.${wordId(ans.w)}`],
  }
}

/** 聽 /b/ 找字母：熟悉（2 格以上）的音才考；都還不熟時，字母卡下面放關鍵字小圖當鷹架 */
const phLetter = (level: number, recent: string[]): PhonicsItem => {
  const open = unlockedSounds()
  const known = open.filter(familiar)
  // 熟悉的音少於兩個時，一直考同一個太單調：其他開放的音也出，但帶圖片鷹架
  const u = pickSound(known.length >= 2 ? known : open, recent)
  const scaffold = !familiar(u)
  const n = optCount(level) - 1
  const others = open.filter((x) => !sameSound(x, u))
  const pool = others.length >= n ? others : PHONICS.filter((x) => !sameSound(x, u)).slice(0, 6)
  const look: SoundUnit[] = []
  if (level >= 4)
    for (const c of LOOKALIKE_LOWER[u.letter] ?? '') {
      const cu = PHONICS.find((x) => x.letter === c)
      if (cu && !sameSound(cu, u) && look.length < n - 1) look.push(cu)
    }
  const wrong = [...look, ...sample(pool, n - look.length, [u, ...look])]
  const opts = shuffle([u, ...wrong]).map((x): PhonicsOption => ({ id: x.letter, letter: x.letter, ...(scaffold ? { cue: x.keys[0] } : {}) }))
  return {
    itemId: u.letter,
    skill: phonicsSkill(u.letter),
    unit: u,
    mode: 'letter',
    prompt: [`en.where.sound.${u.letter}`],
    names: [],
    options: opts,
    answer: u.letter,
    after: [`ph.${u.letter}.echo.${wordId(u.keys[0].w)}`],
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

const mCompare = (level: number): ChoiceItem => {
  const gap = [4, 3, 2, 1][level - 1] ?? 1
  const a = 1 + rand(10 - gap)
  const b = Math.min(10, a + gap + (level <= 2 ? rand(2) : 0))
  const askLess = level >= 3 && Math.random() < 0.5
  const icon = countIcon()
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

const zFind = (level: number, recent: string[]): ChoiceItem => {
  const pool = themedVocab()
  const v = pickPreferred(themeFav(pool, (t) => t.vocab), pool, (x) => `vocab:${x.id}`, VOCAB.filter((x) => recent.includes(x.id)))
  // 低難度用不同類別當干擾（貓 vs 汽車），高難度用同一類（貓 vs 狗）
  const others = VOCAB.filter((x) => x.id !== v.id && (level >= 3 ? x.theme === v.theme : x.theme !== v.theme))
  const opts = shuffle([v, ...sample(others.length >= 3 ? others : VOCAB.filter((x) => x.id !== v.id), optCount(level) - 1)])
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
  const open = tags.slice(0, level >= 3 ? 5 : 4)
  const tag = pickPreferred(open.filter((t) => themeNow()?.tags?.includes(t)), open, (t) => `cat:${t}`, recent as Tag[])
  const ok = (x: (typeof VOCAB)[number]) => !AMBIGUOUS[tag].includes(x.id)
  const yes = themed(VOCAB.filter((x) => x.tags.includes(tag) && ok(x)))
  // 主題的東西當答案：公車旅行問「哪個有輪子」，答案是公車、計程車
  const fav = themeFav(yes, (t) => t.vocab)
  const ans = pick(fav.length ? fav : yes)
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
  const weighted = themed(pool)
  const v = pickPreferred(themeFav(weighted, (t) => t.vocab), weighted, (x) => `sound:${x.id}`, pool.filter((x) => recent.includes(x.id)))
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
    teach: { visual: { t: 'color', hex: c.hex }, side: { t: 'emoji', icon: COLOR_EXAMPLES[c.id] }, sideAt: 1, lines: [`teach.color.${c.id}`, `teach.colorlike.${c.id}`] },
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
    teach: { visual: { t: 'shape', shape: s.id, hex: '#F0B088' }, lines: [`teach.shape.${s.id}`, `teach.shapefun.${s.id}`] },
  }
}

const pSize = (level: number): ChoiceItem => {
  const icon = pick(themeList(SIZE_ICONS, (t) => t.count))
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
  // ── 程式車庫（PRD §10）── 題目產生器與資料在 code.ts
  { id: 'c-drive', station: 'code', kind: 'drive', title: '箭頭卡開車', icon: 'automobile', intro: 'c.intro.drive', maxLevel: 4 },
  { id: 'c-pattern', station: 'code', kind: 'choice', title: '找規律', icon: 'puzzle-piece', intro: 'c.intro.pattern', maxLevel: 4, make: cPattern },
  { id: 'c-seq', station: 'code', kind: 'sequence', title: '排順序', icon: 'hatching-chick', intro: 'c.intro.seq', maxLevel: 4 },
]

export const game = (id: string) => GAMES.find((g) => g.id === (LEGACY_GAME[id] ?? id))!
export const gamesOf = (s: StationId) => GAMES.filter((g) => g.station === s)

/** 每局題數 */
export const ROUND_ITEMS = 6
