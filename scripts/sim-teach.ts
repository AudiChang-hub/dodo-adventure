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
// 執行：npx tsx scripts/sim-teach.ts [亂數種子]（有違規時 exit 1）
import { GAMES, PHONICS_MAKERS, ROUND_ITEMS, game as gameOf, type GameDef } from '../src/content/games'
import { SHEET_MAKERS } from '../src/content/games-worksheet'
import { THEMES } from '../src/content/themes'
import { enterTheme, themeNow } from '../src/lib/theme-play'
import { dotsNumbers } from '../src/content/dots'
import { gameLevel, level, markPlayed, noteAttempt, plays, recordSkill, reportLevel, skill, unlockedNumbers } from '../src/lib/adaptive'
import { fluencyKey, fluencyTargets } from '../src/lib/fluency'
import { NUMBER_RANGE, numberPicker } from '../src/games/sheet/NumberFlow'
import { planChoice, planCount, planDots, planDrive, planOrder, planPhonics, planSequence, planSheet, roundState } from '../src/games/pick'
import { seqSkill } from '../src/content/code'

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
let seed = Number(process.argv[2] ?? 20261028)
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
    quiz(g, p.it.skill, p.fresh, p.probe ? '探測題直接考' : '選擇題', { probe: p.probe })
  }
}

function playPhonics(g: GameDef) {
  const st = roundState(plays(g.id) === 0)
  markPlayed(g.id)
  for (let i = 0; i < ROUND_ITEMS; i++) {
    const p = planPhonics(g, PHONICS_MAKERS[g.id], st, i)
    if (p.fresh) teach(g, p.it.skill)
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

function playSequence(g: GameDef) {
  const st = { ...roundState(plays(g.id) === 0), stories: [] }
  markPlayed(g.id)
  for (let i = 0; i < 4; i++) {
    const p = planSequence(g, st, i)
    if (p.fresh) teach(g, seqSkill(p.s))
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

for (day = 1; day <= DAYS; day++) {
  clock = RealDate.parse('2026-11-02T09:00:00') + (day - 1) * 86_400_000
  // 第一天：家長回報的情境——空資料庫、消防救援主題（偏好紅色）、第一站就是找顏色
  const adventure = day === 1 ? ['p-color', 'p-shape', 'z-find', 'm-find'] : pickN(CHECKED, 4)
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
// 程度校準還在：探測題照樣出（只是都考學過的），各遊戲最後停在哪一級
const placed = CHECKED.map((id) => gameLevel(gameOf(id).id)?.placed)
  .map((p, k) => (p && !p.skipped ? `${CHECKED[k]} ${p.from}→${p.to}` : ''))
  .filter(Boolean)
console.log(`選擇題的探測題 ${probes} 題（都是學過的）；校準完成：${placed.join('、') || '（無）'}`)
console.log(
  `連點成圖 ${dotsPics} 張：${[...dotsSeen].sort((a, b) => a[0] - b[0]).map(([lv, s]) => `第 ${lv} 級 ${[...s].join('/')}`).join('；')}；最後數字解鎖到 ${unlockedNumbers()}`,
)
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
for (const v of violations.slice(0, 12)) console.log(`  例：第 ${v.day} 天 ${v.game} ${v.skill}（${v.why}）`)
if (violations.length) process.exit(1)
