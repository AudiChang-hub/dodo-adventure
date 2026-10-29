// 「不教不考」的自動檢查（2026-10-28 家長：「不教而殺謂之虐」）：
// 任何遊戲、任何題目的答案目標，都必須是孩子在 App 裡已經學過的內容；第一次出現的內容一定先跑教學卡（或示範）→ 一起練 → 自己答。
//
// 做法：從空的資料庫開始，假造一個孩子玩 40 天（每天一段主題冒險＋幾個自由探索），
// 用的是 App 真正的出題規則（src/games/pick.ts、sheet/NumberFlow.ts、lib/fluency.ts）和真正的學習引擎（lib/adaptive.ts）：
// 程度校準的探測、一局教滿兩個、每週新概念額度、主題冒險的主題偏好都在裡面。
// 斷言：每一題「自己答」出題時，那個技能已經學過（seen > 0），或這一題本身剛走過教學卡／示範。
// 圈圈看的 lasso:x 在「找出全部」學過 all:x 就算學過（同一個概念，只是換成用筆圈）。
// 連點成圖也在檢查範圍：每張圖第一次出現一定先完整示範；圖上的數字不能超過已經解鎖的數字（adaptive.unlockedNumbers）。
// 不在檢查範圍：畫畫小屋的描線、著色、自由畫、描字，路徑本身就畫在紙上，沒有「答案目標」；換爸爸問是爸爸在問。
//
// 單字也不教不考（2026-10-28 單字盤點）：除了答案的技能，也檢查題目上的「字」（lib/words.ts）——
// - 選擇題（動物村的聽詞找圖、聽聲音、動動腦）：每個選項的字（含干擾選項、動動腦的答案圖）都教過；
// - 字母森林：圖片選項、「開頭一樣」的題目圖、字母卡下面的小圖、複習字（答案）都教過（沒教過的先跑單字卡）；
// - 找出全部、做什麼用：點錯時唸名字的字都教過；沒教過的圖可以出現，但不唸名字（另外統計張數）；
// - 家長勾「他不認得」：第 15 天起模擬家長勾了幾個字，之後它們不能當干擾選項、例子、不能唸名字；當答案時一定先重新教過。
// - 一張圖一個名字：動物村、字母森林、學習單、貼紙、孵蛋朋友、找規律裡同一張圖的英文名字要一樣。
// 執行：npx tsx scripts/sim-teach.ts [亂數種子] [--first=遊戲 id]（有違規時 exit 1）
//   --first：第 1 天空資料庫第一個玩的遊戲（例如 --first=ph-start：什麼字都還沒教過時，字母森林怎麼出干擾圖）
import { GAMES, PHONICS_MAKERS, ROUND_ITEMS, game as gameOf, type GameDef } from '../src/content/games'
import { SHEET_MAKERS } from '../src/content/games-worksheet'
import { THEMES } from '../src/content/themes'
import { enterTheme, themeNow } from '../src/lib/theme-play'
import { dotsNumbers } from '../src/content/dots'
import { gameLevel, level, markPlayed, noteAttempt, plays, recordSkill, reportLevel, skill, unlockedNumbers } from '../src/lib/adaptive'
import { fluencyKey, fluencyTargets } from '../src/lib/fluency'
import { NUMBER_RANGE, numberPicker } from '../src/games/sheet/NumberFlow'
import { planChoice, planCount, planDots, planDrive, planOrder, planPhonics, planSequence, planSheet, roundState } from '../src/games/pick'
import { patternRounds, seqSkill, storiesFor, ALL_STORIES, PATTERN_TOKS } from '../src/content/code'
import type { ChoiceItem, PhonicsItem } from '../src/content/games'
import type { SheetItem } from '../src/content/games-worksheet'
import { PHONICS, wordId } from '../src/content/letters'
import { VOCAB } from '../src/content/vocab'
import { SHEET_NAMES } from '../src/content/worksheet-data'
import { STICKER_ART } from '../src/content/sticker-art'
import { FRIEND_INFO } from '../src/content/friends'
import { keyOfVocab } from '../src/content/lexicon'
import { isUnknown, needsTeach, setUnknownNow, usable } from '../src/lib/words'

// 學習引擎會順手寫 IndexedDB，Node 裡沒有：忽略那些錯誤（記憶體裡的狀態照常更新）
process.on('unhandledRejection', () => {})

// ── 假時鐘：一天一天往前走（每週新概念額度、到期複習都看日期） ──────────
const RealDate = Date
let clock = RealDate.parse('2026-11-02T09:00:00')
class FakeDate extends RealDate {
  constructor(...a: unknown[]) {
    if (a.length) super(...(a as [number]))
    else super(clock)
  }
  static now() {
    return clock
  }
}
globalThis.Date = FakeDate as DateConstructor
const tick = (ms = 4000) => (clock += ms)

// ── 固定亂數：每次跑結果一樣（題目產生器用 Math.random，也一起固定）；換一個孩子：npx tsx scripts/sim-teach.ts 7 ──────
const ARGS = process.argv.slice(2)
let seed = Number(ARGS.find((a) => /^\d+$/.test(a)) ?? 20261028)
const FIRST = ARGS.find((a) => a.startsWith('--first='))?.slice(8)
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
Math.random = rnd

// ── 紀錄與違規 ──────────────────────────────────────────────
interface Violation {
  day: number
  game: string
  skill: string
  why: string
}
const violations: Violation[] = []
let quizzes = 0
let probes = 0
let day = 0
/** 印出第一次玩找顏色的那一局（家長回報的情境） */
let trace: string[] | null = null

// ── 單字的檢查 ─────────────────────────────────────────────
const W = {
  /** 選擇題的干擾選項（動物村） */
  choiceDistract: 0,
  /** 字母森林的干擾圖 */
  phDistract: 0,
  /** 動動腦的答案圖 */
  catAnswers: 0,
  /** 字母森林的複習字當答案 */
  reviewAnswers: 0,
  /** 單字卡（字母森林）、教學卡上多教的字 */
  wordCards: 0,
  companions: 0,
  /** 找出全部：點錯時唸名字的圖、沒教過所以不唸名字的圖 */
  sheetNamed: 0,
  sheetSilent: 0,
  /** 家長勾了之後當答案（都要先重教） */
  flaggedTargets: 0,
  /** 字母森林的字母卡小圖 */
  cues: 0,
  /** 學習循環裡家長勾掉、但這個音沒有別的字可以換（照教） */
  introKept: 0,
  /** 選項比這一級該有的少（教過的字不夠）：題數、少了幾個 */
  reduced: 0,
  items: 0,
}
/** 選項數：第 1 級 2 個、第 2 級 3 個、之後 4 個（games.ts 的 optCount） */
function noteOpts(n: number, lv: number) {
  W.items++
  if (n < Math.min(4, lv + 1)) W.reduced++
  if (n < 2) violations.push({ day, game: '?', skill: '', why: '選項少於 2 個' })
}
const REVIEW_WORDS = new Set(PHONICS.flatMap((u) => u.review.map((x) => wordId(x.w))))
function wordBad(g: GameDef, k: string, why: string) {
  violations.push({ day, game: g.id, skill: k, why })
}
/** 答案的字：教過（或這一題剛教），家長勾過的要在勾選之後重新教過 */
function checkAnswer(g: GameDef, k: string, why: string) {
  if (isUnknown(k)) W.flaggedTargets++
  if (needsTeach(k)) wordBad(g, k, `${why}沒教過`)
}
/** 干擾、例子、唸名字的字：教過，而且家長沒勾 */
function checkShown(g: GameDef, k: string, why: string) {
  if (isUnknown(k)) wordBad(g, k, `家長勾了不認得，卻當${why}`)
  else if (!usable(k)) wordBad(g, k, `${why}沒教過`)
}
const VOCAB_GAMES = new Set(['z-find', 'z-sound', 'z-category'])
function checkChoice(g: GameDef, it: ChoiceItem, fresh: boolean) {
  if (!VOCAB_GAMES.has(g.id)) return
  const ans = keyOfVocab(it.answer)
  checkAnswer(g, ans, g.id === 'z-category' ? '動動腦的答案圖' : '答案的字')
  if (g.id === 'z-category') W.catAnswers++
  for (const o of it.options) {
    if (o.id === it.answer) continue
    W.choiceDistract++
    checkShown(g, keyOfVocab(o.id), '干擾選項')
  }
  const extra = (it.teachWords ?? []).filter((k) => k !== ans)
  if (fresh) W.companions += g.id === 'z-category' ? (it.teach?.lines.filter((l) => l.startsWith('lex.this.')).length ?? 0) : extra.length
  for (const k of extra) if (isUnknown(k)) wordBad(g, k, '家長勾了不認得，卻當例子')
}
function checkPhonics(g: GameDef, it: PhonicsItem, fresh: boolean) {
  W.wordCards += it.wordCards.length
  // 學習循環的三個字：家長勾掉的要換成同一個音的複習字；這個音沒有可以換的字（a 只有三個關鍵字）就照教，另外統計
  if (fresh)
    for (const k of it.unit.keys) {
      if (!isUnknown(wordId(k.w))) continue
      const u = PHONICS.find((x) => x.letter === it.unit.letter)!
      const spare = u.review.some((x) => !x.alt && !isUnknown(wordId(x.w)) && !it.unit.keys.includes(x))
      if (spare) wordBad(g, wordId(k.w), '家長勾了不認得，卻放進學習循環')
      else W.introKept++
    }
  for (const o of it.options) {
    if (o.word) {
      const k = wordId(o.word.w)
      if (o.id === it.answer) {
        checkAnswer(g, k, '答案的字')
        if (REVIEW_WORDS.has(k)) W.reviewAnswers++
      } else {
        W.phDistract++
        checkShown(g, k, '干擾圖')
      }
    }
    if (o.cue) {
      W.cues++
      checkShown(g, wordId(o.cue.w), '字母卡的小圖')
    }
  }
  if (it.stimulus) checkAnswer(g, wordId(it.stimulus.w), '題目圖')
}
function checkSheet(g: GameDef, it: SheetItem) {
  for (const t of it.things) {
    if (!t.word) continue
    if (isUnknown(t.word)) wordBad(g, t.word, '家長勾了不認得，卻放上學習單')
    if (t.say) {
      W.sheetNamed++
      if (t.say.startsWith('lex.this.') && !usable(t.word)) wordBad(g, t.word, '點錯時唸了沒教過的字')
    } else if (!t.ok) W.sheetSilent++
  }
  for (const k of it.teachWords ?? []) if (isUnknown(k) && k !== it.itemId) wordBad(g, k, '家長勾了不認得，卻當例子')
}

const learned = (k: string) => skill(k).seen > 0 || (k.startsWith('lasso:') && skill(`all:${k.slice(6)}`).seen > 0)

function teach(g: GameDef, k: string) {
  noteAttempt({ game: g.id, skill: k, phase: 'teach', firstTryCorrect: true, level: level(g.id) })
  trace?.push(`  教學卡 ${k}`)
}

/** 自己答一題：先檢查，再依孩子的程度隨機答對答錯，更新熟練度與難度 */
function quiz(g: GameDef, k: string, taughtNow: boolean, why: string, opts?: { probe: boolean }): boolean {
  quizzes++
  if (opts?.probe) probes++
  const ok0 = learned(k) || taughtNow
  if (!ok0) violations.push({ day, game: g.id, skill: k, why })
  // 學過的八成答對；剛教完的七成；沒教過的只能猜
  const p = learned(k) ? 0.82 : taughtNow ? 0.72 : 0.3
  const ok = rnd() < p
  trace?.push(`  ${opts?.probe ? '探測題' : taughtNow ? '自己答（剛教）' : '自己答'} ${k} 第 ${level(g.id)} 級 ${ok ? '答對' : '答錯'}${ok0 ? '' : '  ← 沒教過就考'}`)
  const metrics = opts?.probe ? { probe: 1 } : undefined
  recordSkill(k, ok, { game: g.id, responseMs: 1800, hintUsed: !ok, metrics })
  noteAttempt({ game: g.id, skill: k, phase: 'quiz', firstTryCorrect: ok, level: level(g.id) })
  reportLevel(g.id, ok, g.maxLevel, opts ? { probe: opts.probe, skill: k } : undefined)
  tick()
  return ok
}

// ── 每個引擎的一局（和引擎的 present / start 同一套決定） ──────────────
function playChoice(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < ROUND_ITEMS; i++) {
    const p = planChoice(g, st, i)
    if (p.fresh) teach(g, p.it.skill)
    checkChoice(g, p.it, p.fresh)
    if (VOCAB_GAMES.has(g.id)) noteOpts(p.it.options.length, p.lv)
    quiz(g, p.it.skill, p.fresh, p.probe ? '探測題直接考' : '選擇題', { probe: p.probe })
  }
}

/** 找規律（PatternGame）：出題規則和選擇題一樣（planChoice），只是第一次玩一局 4 題 */
function playPattern(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  const rounds = patternRounds(st.firstPlay)
  markPlayed(g.id)
  for (let i = 0; i < rounds; i++) {
    const p = planChoice(g, st, i)
    if (p.fresh) teach(g, p.it.skill)
    quiz(g, p.it.skill, p.fresh, p.probe ? '探測題直接考' : '找規律', { probe: p.probe })
  }
}

function playPhonics(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < ROUND_ITEMS; i++) {
    const p = planPhonics(g, PHONICS_MAKERS[g.id], st, i)
    if (p.fresh) teach(g, p.it.skill)
    checkPhonics(g, p.it, p.fresh)
    noteOpts(p.it.options.length, p.lv)
    quiz(g, p.it.skill, p.fresh, '自然發音')
  }
}

function playSheet(g: GameDef) {
  const mode = g.kind === 'lasso' ? 'lasso' : 'tap'
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < (mode === 'lasso' ? 4 : 5); i++) {
    const p = planSheet(g, SHEET_MAKERS[g.id], mode, st, i)
    if (p.fresh) teach(g, p.it.skill)
    checkSheet(g, p.it)
    quiz(g, p.it.skill, p.fresh, '學習單')
  }
}

function playNumber(g: GameDef, prefix: 'fill' | 'give' | 'flash', rounds: number) {
  const picker = numberPicker(prefix, g.id)
  markPlayed(g.id)
  for (let i = 0; i < rounds; i++) {
    const [a, b] = NUMBER_RANGE[prefix][level(g.id)]
    const { n, fresh } = picker.pick(a, b)
    if (fresh) teach(g, `${prefix}:${n}`)
    quiz(g, `${prefix}:${n}`, fresh, '數量')
  }
}

function playCount(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < 4; i++) {
    const { n, show } = planCount(g.id, level(g.id), st, i)
    if (show) teach(g, `count:${n}`)
    quiz(g, `count:${n}`, show, '數數（沒示範）')
  }
}

function playOrder(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < 3; i++) {
    const { n, show } = planOrder(g.id, level(g.id), unlockedNumbers(), st, i)
    if (show) teach(g, `order:${n}`)
    quiz(g, `order:${n}`, show, '照順序（沒示範）')
  }
}

function playDrive(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < 4; i++) {
    const p = planDrive(g, st, i)
    if (p.fresh) teach(g, p.key)
    quiz(g, p.key, p.fresh, '箭頭卡')
  }
}

/** 排順序：每個故事第一次出現時有沒有先演故事＋手示範（SequenceGame 的 demo，pick.ts 的 fresh） */
const seqSeen = new Map<string, number>()
let seqDemos = 0
function playSequence(g: GameDef) {
  const st = { ...roundState(plays(g.id) === 0), stories: [] }
  markPlayed(g.id)
  for (let i = 0; i < 4; i++) {
    const p = planSequence(g, st, i)
    const id = p.s.id
    if (!seqSeen.has(id)) {
      seqSeen.set(id, p.lv)
      if (!p.fresh) violations.push({ day, game: g.id, skill: seqSkill(p.s), why: '新故事第一次出現沒有先示範' })
    }
    if (p.fresh) {
      seqDemos++
      teach(g, seqSkill(p.s))
    }
    quiz(g, seqSkill(p.s), p.fresh, '排順序')
  }
}

/** 連點成圖一局兩張圖（DotsGame 的 ROUNDS） */
let dotsPics = 0
const dotsSeen = new Map<number, Set<string>>()
function playDots(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < 2; i++) {
    const unlocked = unlockedNumbers()
    const { pic, show } = planDots(g.id, level(g.id), unlocked, st, i, themeNow()?.dots ?? [])
    const k = `dots:${pic.id}`
    dotsPics++
    const lv = level(g.id)
    dotsSeen.set(lv, (dotsSeen.get(lv) ?? new Set()).add(pic.id))
    if (dotsNumbers(pic) > unlocked) violations.push({ day, game: g.id, skill: k, why: `連點的數字到 ${dotsNumbers(pic)}，只解鎖到 ${unlocked}` })
    if (show) teach(g, k)
    quiz(g, k, show, '連點成圖（沒示範）')
  }
}

function playFluency(g: GameDef) {
  const ts = fluencyTargets()
  // 還沒有學過的數字題：數字快答改出找數字（ChoiceGame 的 fallbackGame）
  if (!ts.length) return playChoice(gameOf('m-find'))
  markPlayed(g.id)
  for (let i = 0; i < 5; i++) {
    const t = ts[Math.floor(rnd() * ts.length)]
    // 數字快答沒有教學：記錄在快答裡，熟練度記在 num:n／count:n 上
    quiz(g, fluencyKey(t), false, '數字快答')
  }
}

function play(id: string) {
  const g = gameOf(id)
  switch (g.kind) {
    case 'choice':
      return g.id === 'm-quick' ? playFluency(g) : playChoice(g)
    case 'phonics':
      return playPhonics(g)
    case 'findall':
    case 'lasso':
      return playSheet(g)
    case 'fill':
      return playNumber(g, 'fill', 4)
    case 'give':
      return playNumber(g, 'give', 4)
    case 'subitize':
      return playNumber(g, 'flash', 5)
    case 'count':
      return playCount(g)
    case 'order':
      return playOrder(g)
    case 'drive':
      return playDrive(g)
    case 'dots':
      return playDots(g)
    case 'sequence':
      return playSequence(g)
    case 'pattern':
      return playPattern(g)
  }
}

// ── 40 天：每天一段主題冒險（4 站）＋ 4 個自由探索 ───────────────────
const CHECKED = GAMES.filter((g) => !['trace', 'coloring', 'free', 'glyph'].includes(g.kind)).map((g) => g.id)
const DAYS = 40
const pickN = (pool: string[], n: number) => {
  const a = [...pool]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

/** 第 15 天家長在單字清單勾的字（動物村、字母森林的關鍵字、找出全部的例子都有） */
const FLAG_DAY = 15
const FLAGGED = ['dog', 'sun', 'cat', 'apple', 'ball']

for (day = 1; day <= DAYS; day++) {
  clock = RealDate.parse('2026-11-02T09:00:00') + (day - 1) * 86_400_000
  if (day === FLAG_DAY) for (const k of FLAGGED) setUnknownNow(k, true)
  // 第一天：家長回報的情境——空資料庫、消防救援主題（偏好紅色）、第一站就是找顏色
  const day1 = ['p-color', 'p-shape', 'z-find', 'm-find']
  const adventure = day === 1 ? (FIRST ? [FIRST, ...day1.filter((x) => x !== FIRST)] : day1) : pickN(CHECKED, 4)
  const th = day === 1 ? 'fire' : THEMES[Math.floor(rnd() * THEMES.length)].id
  for (const id of adventure) {
    const leave = enterTheme(th)
    if (day === 1 && id === 'p-color') trace = []
    try {
      play(id)
    } finally {
      leave()
    }
    if (trace) {
      console.log(`第 1 天，空資料庫第一次玩找顏色（主題 ${th}）：`)
      console.log(trace.join('\n'))
      trace = null
    }
  }
  // 第一天的自由探索：從地圖直接點數字快答、比多少、比大小（還什麼都沒學過）
  for (const id of day === 1 ? ['m-quick', 'm-compare', 'p-size', 'm-match'] : pickN(CHECKED, 4)) play(id)
}

// ── 結果 ────────────────────────────────────────────────────
const by = new Map<string, number>()
for (const v of violations) by.set(`${v.game}（${v.why}）`, (by.get(`${v.game}（${v.why}）`) ?? 0) + 1)
console.log(`\n${DAYS} 天、${CHECKED.length} 個遊戲、${quizzes} 題自己答：沒教就考 ${violations.length} 題`)
const bad = (re: RegExp) => violations.filter((v) => re.test(v.why)).length
console.log(`干擾選項：動物村 ${W.choiceDistract} 個、字母森林 ${W.phDistract} 張，沒教過的 ${bad(/^干擾(選項|圖)沒教過/)} 個；家長勾的字當干擾 ${bad(/當干擾/)} 個`)
console.log(`教過的字不夠、選項比平常少的題目：${W.reduced}／${W.items} 題（最少 2 個選項，少於 2 個的 ${bad(/選項少於/)} 題）`)
console.log(`動動腦的答案圖 ${W.catAnswers} 題，沒教過的 ${bad(/動動腦的答案圖沒教過/)} 題；字母卡下面的小圖 ${W.cues} 張，沒教過的 ${bad(/小圖/)} 張`)
console.log(`字母森林的複習字當答案 ${W.reviewAnswers} 題，沒教過的 ${bad(/^答案的字沒教過/)} 題；考之前先教的單字卡 ${W.wordCards} 張；教學卡上多教的字 ${W.companions} 個`)
console.log(`找出全部：點錯時唸名字的圖 ${W.sheetNamed} 張，唸了沒教過的字 ${bad(/唸了沒教過/)} 次；沒教過、只放圖不唸名字的干擾圖 ${W.sheetSilent} 張`)
console.log(`家長勾選（第 ${FLAG_DAY} 天勾 ${FLAGGED.join('、')}）：之後當答案 ${W.flaggedTargets} 題，沒先重新教的 ${bad(/^(答案的字|題目圖|動動腦的答案圖)沒教過/)} 題；當例子、放上學習單、放進學習循環 ${bad(/卻(當例子|放上|放進)/)} 次（a 的 apple 沒有別的字可以換，學習循環照教 ${W.introKept} 次）`)

// ── 一張圖一個名字 ──────────────────────────────────────────
const names = new Map<string, Map<string, string>>()
const nameAdd = (icon: string, name: string, where: string) => {
  const m = names.get(icon) ?? new Map<string, string>()
  const n = name.replace(/!$/, '').toLowerCase()
  if (!m.has(n)) m.set(n, where)
  names.set(icon, m)
}
for (const v of VOCAB) nameAdd(v.icon, v.en, '動物村')
for (const u of PHONICS) for (const w of [...u.keys, ...u.review]) nameAdd(w.icon, w.w, '字母森林')
for (const [icon, n] of Object.entries(SHEET_NAMES)) nameAdd(icon, n, '學習單')
for (const a of STICKER_ART) nameAdd(a.id, a.en, '貼紙')
for (const [icon, fi] of Object.entries(FRIEND_INFO)) nameAdd(icon, fi.name, '孵蛋朋友')
for (const t of PATTERN_TOKS) if (t.v.t === 'emoji') nameAdd(t.v.icon, t.en, '找規律')
const clash = [...names].filter(([, m]) => m.size > 1)
console.log(`一張圖一個名字：${names.size} 張圖，名字不一致 ${clash.length} 張${clash.length ? '：' + clash.map(([icon, m]) => `${icon}（${[...m].map(([n, w]) => `${w} ${n}`).join('／')}）`).join('、') : ''}`)
if (clash.length) process.exitCode = 1
// 程度校準還在：探測題照樣出（只是都考學過的），各遊戲最後停在哪一級
const placed = CHECKED.map((id) => gameLevel(gameOf(id).id)?.placed)
  .map((p, k) => (p && !p.skipped ? `${CHECKED[k]} ${p.from}→${p.to}` : ''))
  .filter(Boolean)
console.log(`選擇題的探測題 ${probes} 題（都是學過的）；校準完成：${placed.join('、') || '（無）'}`)
console.log(
  `連點成圖 ${dotsPics} 張：${[...dotsSeen].sort((a, b) => a[0] - b[0]).map(([lv, s]) => `第 ${lv} 級 ${[...s].join('/')}`).join('；')}；最後數字解鎖到 ${unlockedNumbers()}`,
)
// 排順序的故事：每一級的清單都有故事、一張圖一句旁白；每個故事第一次出現都先示範
for (let l = 1; l <= 4; l++) if (!storiesFor(l).length) violations.push({ day: 0, game: 'c-seq', skill: `lv${l}`, why: '這一級沒有故事' })
for (const s of ALL_STORIES) if (s.lines.length !== s.icons.length) violations.push({ day: 0, game: 'c-seq', skill: seqSkill(s), why: '旁白和圖的張數不一樣' })
console.log(
  `排順序：${seqSeen.size} 個故事出現過、示範 ${seqDemos} 次，第一次出現沒先示範 ${bad(/新故事第一次出現沒有先示範/)} 個；各級故事 ${[1, 2, 3, 4].map((l) => `${l} 級 ${storiesFor(l).map((s) => s.id).join('/')}`).join('；')}`,
)
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
for (const v of violations.slice(0, 12)) console.log(`  例：第 ${v.day} 天 ${v.game} ${v.skill}（${v.why}）`)
if (violations.length) process.exit(1)
