// 成長模擬（成長系統 G-5，docs/成長系統設計.md §6.1）：
// 幾種虛構的孩子從 3 歲 3 個月玩到 6 歲（每週玩 5 天），用 App 真正的引擎和外框：
// - 年段：lib/growth.ts 的 loadGrowth（照生日換段、4 週慢慢放寬），games/frame.ts 的外框；
// - 學習引擎：lib/adaptive.ts（熟練度、到期複習、每週額度、一回合最多 1 個新概念、負擔控制、階梯、回補、卡關保險）；
// - 出題：games/pick.ts、sheet/NumberFlow.ts、lib/fluency.ts、games/draw/glyphs.ts（和 sim-teach 同一套）；
// - 排課：lib/tracks.ts 的 trackNeeds、planDay（和 lib/plan.ts 的 readPlan 同一套條件）。
// 每個有玩的日子都「開機」一次（loadGrowth、loadAdaptive），跟平板上每天打開 App 一樣。
// IndexedDB 換成記憶體裡的假資料表（只做引擎用到的幾個查詢），所以開機時讀作答紀錄、kv 都是真的流程。
//
// 孩子怎麼答（模擬的部分，不是引擎）：每個題目內容有一個「會的程度」0–1，教一次、答一次都會往上，
// 隔越久沒練越會忘（答對過越多次忘得越慢）；答對的機率 = 0.25 + 0.72 × 會的程度，遊戲的級數越高越難一點。
// 學習速度 = 孩子類型的倍數（每條主線各自） × 年齡（3 歲 3 個月是 1，6 歲是 1.5，學習速度隨年齡上升）。
//
// 斷言（違規就 exit 1）：
// 1. 不教不考：每一題自己答的內容都學過，或這一題剛教過。
// 2. 操作外框：選項數不超過年段上限；小班段只用點的；一回合題數在外框內（小班段照 LEGACY_SMALL）；
//    一回合、一天的時間不超過上限（時間是用每題幾秒估的）。
// 3. 開放新階一定是因為前置條件滿足（或卡關保險），不看年齡；家長鎖住的支線不開新階。
// 5. 每條主線每週的新概念不超過額度（太順的支線多 1 個）；一回合最多 1 個新概念（FRAME-8）。
// 7. 一般孩子 9 成以上的週，第一次答對率在 65–90%。
// 另外：不會卡死在某一階（有內容的下一階一定開得了）；回補會回來；負擔控制不會讓一條線長期停擺；
// 換年段時 4 週慢慢放寬；長時間沒玩回來的第一天不教新的。
// §6.1 的第 4 項（退回時孩子看不到）、第 6 項（故事）不在這裡檢查：前者是畫面，後者是 G-9 的 check-story。
//
// 輸出（--out，預設 docs/成長模擬）：結果.md（每種孩子每個月各支線在第幾階、內容大約幾歲用完）、原始數據.json。
//
// 執行：npx tsx scripts/sim-growth.ts [--small=legacy|new] [--to=72] [--kids=typical,fast] [--seeds=5] [--seed=數字] [--no-fix] [--out=資料夾]
//   --small：小班段一回合幾題、教幾個新的。legacy＝現行（6 題、2 個），new＝準則（3–5 題、1 個）；
//            沒給就讀 games/frame.ts 的 LEGACY_SMALL，另外用另一種設定再跑一次一般孩子做對照。
//   --to：模擬到幾個月大（預設 72，也就是 6 歲）；想快一點看結果可以給 54。
//   --kids：只跑哪幾種孩子（typical、fast、uneven、slow、gaps、tapper、locked）。
//   --seeds：每種孩子跑幾個亂數種子（預設 5；同一種孩子換個種子，完成的時間可以差好幾個月，報告用中位數）。
//   --no-fix：不跑「假設零件的速度判斷修好了」的對照組（--fix=part-speed，見下面 FIX_PART_SPEED）。
//   除錯（只跑一個孩子時）：--kid=typical --trace=2030-04-03（印出那一天每一題）、--debug=H2,H6b（印出那幾階最後的單位）、
//   --watch=code（印出那條支線暫停的每一天）。
// 每種孩子、每個種子在自己的子行程裡跑（引擎是模組裡的單例），同時跑好幾個，預設全部約 2 分鐘。
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, type Attempt } from '../src/lib/db'
import { GAMES, ROUND_ITEMS, game as gameOf, type GameDef } from '../src/content/games'
import { SHEET_MAKERS } from '../src/content/games-worksheet'
import { PHONICS_MAKERS } from '../src/content/games'
import { THEMES } from '../src/content/themes'
import { enterTheme, themeNow } from '../src/lib/theme-play'
import {
  conceptIntrosNow,
  contentStock,
  isDue,
  ladderNow,
  lastPlayed,
  level,
  loadAdaptive,
  markPlayed,
  needsDemo,
  noteAttempt,
  pauseNew,
  plays,
  recordSkill,
  refreshLadder,
  reportLevel,
  roundNewConcepts,
  rungOpen,
  skill,
  strandLoadNow,
  stalledGame,
  unlockedNumbers,
  weeklyNew,
} from '../src/lib/adaptive'
import { fluencyKey, fluencyReady, fluencyTargets, isFluency } from '../src/lib/fluency'
import { numberPicker, numberRange } from '../src/games/sheet/NumberFlow'
import { MAX_TEACH, planChoice, planCount, planDots, planDrive, planOrder, planPhonics, planSequence, planSheet, roundState, type RoundState } from '../src/games/pick'
import { patternRounds, seqSkill } from '../src/content/code'
import { glyphLevel, glyphLevelCap, glyphSkill, isPart, lettersOpen, planGlyph } from '../src/games/draw/glyphs'
import { bandOf, dragOf } from '../src/games/frame'
import { addDays, daysBetween, getGrowth, loadGrowth, monthsOld, GROWTH_KV, PROFILE_KV, type GrowthState, type LadderState, type GrowthStatus } from '../src/lib/growth'
import { BAND_ZH, FRAMES, RAMP_WEEK, RAMP_WEEKS, type Band, type Frame } from '../src/content/growth'
import { budgetOf, planDay, trackNeeds, MASTERY_DAYS } from '../src/lib/tracks'
import { trackOf, type TrackId } from '../src/content/tracks'
import { FAST_BONUS, RUNGS, STRANDS, STUCK_DAYS, STUCK_RATIO, entryRung, rung as rungDef, strandRungs, unitsOf, type StrandId } from '../src/content/ladder'
import { bandSetting } from '../src/lib/settings'

const ARGS = process.argv.slice(2)
const arg = (k: string) => ARGS.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)

// ── 孩子的類型（§6.1）────────────────────────────────────────
interface KidDef {
  id: string
  name: string
  desc: string
  /** 每條主線的學習速度倍數 */
  mult: Record<TrackId, number>
  /** 停多久：[幾個月大開始, 幾天] */
  breaks?: [months: number, days: number][]
  /** 亂點（T-50 的三歲亂點）：3 歲 3 個月時幾成的題目亂點，到 6 歲降到幾成 */
  tap?: [from: number, to: number]
  /** 家長鎖住一條支線：幾個月大時鎖、鎖在第幾階 */
  lock?: { months: number; strand: StrandId; rung: number }
}

const all = (x: number): Record<TrackId, number> => ({ lang: x, num: x, think: x, hand: x })
const KIDS: KidDef[] = [
  { id: 'typical', name: '一般', desc: '每條線速度一樣，學習速度隨年齡上升', mult: all(1) },
  { id: 'fast', name: '學得快', desc: '全部 ×1.6（一直很順）', mult: all(1.6) },
  { id: 'uneven', name: '偏科', desc: '數與規律 ×1.8、語言 ×0.6（某條線特別快、某條線特別慢）', mult: { lang: 0.6, num: 1.8, think: 1, hand: 1 } },
  { id: 'slow', name: '學得慢', desc: '全部 ×0.6', mult: all(0.6) },
  { id: 'gaps', name: '中斷', desc: '4 歲 2 個月、5 歲 2 個月各停 3 週（例如出國、生病）', mult: all(1), breaks: [[50, 21], [62, 21]] },
  { id: 'tapper', name: '亂點', desc: '3 歲 3 個月時 3 成的題目亂點（T-50），到 6 歲降到 1 成以下', mult: all(1), tap: [0.3, 0.08] },
  { id: 'locked', name: '家長調整', desc: '3 歲 4 個月時家長把「數數與數字」鎖在第 2 階（6–10），11–20 先不開', mult: all(1), lock: { months: 40, strand: 'count', rung: 2 } },
]

// ── 虛構的生日與日期：不是任何真的孩子（D2：程式和 repo 不寫真的生日）──────
const BIRTH = '2027-01'
/** 3 歲 3 個月 */
const START = '2030-04-01'
const START_MONTHS = 39
const END_MONTHS = Number(arg('to') ?? 72)

/** 讀 games/frame.ts 的 LEGACY_SMALL（沒有匯出，直接讀原始碼）；G-3 改成 false 之後這裡會跟著變 */
function legacySmallInFile(): boolean {
  const src = readFileSync(fileURLToPath(new URL('../src/games/frame.ts', import.meta.url)), 'utf8')
  const hit = /const LEGACY_SMALL\s*=\s*(true|false)/.exec(src)
  return hit ? hit[1] === 'true' : false
}

// ── 子行程（一種孩子）的結果 ─────────────────────────────────
interface MonthRow {
  months: number
  strands: Record<string, { done: string[]; current: string[]; left: number; out: boolean }>
  band: string
  /** 開了、還沒完成、有內容的階：穩固的比例 */
  ratio: Record<string, number>
}
interface Violation {
  date: string
  what: string
  detail: string
}
interface KidResult {
  kid: string
  small: 'legacy' | 'new'
  seed: number
  /** 對照組（主行程填）：見 Job */
  variant: '' | 'small' | 'fix'
  months: MonthRow[]
  weeks: { week: number; months: number; n: number; ok: number }[]
  /** 每一階什麼時候開、怎麼開、什麼時候完成（最後的階梯） */
  rungs: Record<string, { open?: string; by?: string; done?: string; openMonths?: number; doneMonths?: number }>
  /** 每條支線：現有內容全部教過（之後只能橫向加深）、有內容的階全部完成，是幾個月大 */
  exhausted: Record<string, { allSeen: number | null; allDone: number | null }>
  /** 內容快用完的提醒（contentStock 的 soon）第一次出現 */
  warned: Record<string, number>
  stats: {
    days: number
    quizzes: number
    teaches: number
    rate: number
    byTrack: Record<string, { n: number; ok: number }>
    roundNew: [number, number, number]
    stuckOpens: number
    reopens: number
    reopenRecovered: number
    /** 連續回補還沒回來、停下來改提醒家長（時間軸 reopen 的 hold） */
    reopenHeld: number
    reopenDays: number[]
    pauseMax: Record<string, number>
    globalPauseMax: number
    longestWait: { rung: string; days: number } | null
    returnDays: number
    returnNew: number
    lockedOpens: number
    lockedReviews: number
    rampChecks: number
    roundItems: Record<string, number[]>
    maxRoundSec: number
    maxDayMin: Record<string, number>
    reduced: number
    reteach: number
    intros: Record<string, number>
    /** 答對但引擎判斷「明顯偏慢」、沒有升格的題數 */
    slowOk: number
    /** 第一次玩、額度已經用完還是先教一個的回合（pick.ts 的規則：不考沒教過的） */
    firstPlayOver: number
    /** 難度型遊戲升了一級，下一回合才記成新概念，那時額度已經用完 */
    levelLate: number
    /** 前置開了一年下一階還沒開、但前置還在進步的（很慢，不算卡死） */
    slowRungs: string[]
    /** 同一階回補結束後馬上又重新開始，最多連續幾次 */
    reopenAgain: number
    ms: number
  }
  violations: Violation[]
}

const MARK = '@@RESULT@@'
/** --fix=part-speed：假設引擎已經修好零件的速度判斷（見檔頭） */
const FIX_PART_SPEED = arg('fix') === 'part-speed'
/** 一條支線最多連續幾個有玩的日子暫停新內容（4 週），超過就算長期停擺 */
const PAUSE_MAX = 20
/** 沒給 --seed 時的亂數種子 */
const SEED0 = 20261030

// ════════════════════════════════════════════════════════════
// 子行程：模擬一種孩子
// ════════════════════════════════════════════════════════════
async function runKid(kid: KidDef, small: 'legacy' | 'new'): Promise<KidResult> {
  const t0 = performance.now()
  process.on('unhandledRejection', (e) => {
    throw e
  })

  // ── 假時鐘 ──
  const RealDate = Date
  let clock = RealDate.parse(`${START}T09:00:00`)
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
  const tick = (ms: number) => (clock += ms)

  // ── 固定亂數：題目產生器、孩子的作答都用它 ──
  const seed0 = Number(arg('seed') ?? SEED0)
  let seed = seed0 + [...kid.id].reduce((s, c) => s + c.charCodeAt(0), 0)
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  Math.random = rnd

  // ── 假資料庫：引擎用到的查詢 ──
  const attempts: Attempt[] = []
  const kv = new Map<string, unknown>()
  const growthLog: { kind: string; date: string; data: Record<string, unknown> }[] = []
  installFakeDb(attempts, kv, growthLog)

  const v: Violation[] = []
  let date = START
  const bad = (what: string, detail: string) => v.push({ date, what, detail })

  // 家長在家長區設好生日（虛構的）
  kv.set(PROFILE_KV, { birth: BIRTH, setAt: 0 })

  // ── 孩子：每個概念會的程度 ──
  interface Know {
    k: number
    day: number
    reps: number
  }
  const know = new Map<string, Know>()
  let dayNo = 0
  const ageMonths = () => (daysBetween(START, date) / 30.44) + START_MONTHS
  const ageFactor = () => 1 + (0.5 * Math.max(0, ageMonths() - START_MONTHS)) / (72 - START_MONTHS)
  const multOf = (game: string) => kid.mult[trackOf(game) ?? 'think'] * ageFactor()
  /** 會的程度記在哪：一個題目內容一份；數字在數數、認數字、給蛋、塗格子、一眼看幾個是同一個數字，圈圈看和找出全部是同一個東西 */
  const knowKey = (_game: string, key: string) => {
    const [kind, v] = key.split(':')
    if (['num', 'count', 'give', 'fill', 'flash'].includes(kind)) return `n:${v}`
    if (kind === 'lasso') return `all:${v}`
    return key
  }
  /** 同一類的內容會互相幫忙（認得 1–10 之後，11–20 不是從零開始）：第一次碰到的內容，從同類已經會的平均的 3 成起算 */
  function knowNow(game: string, key: string): Know {
    const id = knowKey(game, key)
    let x = know.get(id)
    if (!x) {
      const kind = `${id.split(':')[0]}:`
      const same = [...know].filter(([k]) => k.startsWith(kind)).map(([, y]) => y.k)
      x = { k: same.length ? (0.3 * same.reduce((a, b) => a + b, 0)) / same.length : 0, day: dayNo, reps: 0 }
    }
    // 忘記：隔越久越會忘，答對過越多次忘得越慢
    const gap = dayNo - x.day
    if (gap > 0) x.k *= Math.exp(-gap / (15 * (1 + x.reps)))
    x.day = dayNo
    know.set(id, x)
    return x
  }
  const gain = (x: number, m: number) => 1 - Math.pow(1 - x, m)
  function learn(game: string, key: string, how: 'teach' | 'ok' | 'no') {
    const x = knowNow(game, key)
    const g = how === 'teach' ? 0.45 : how === 'ok' ? 0.18 : 0.08
    x.k += (1 - x.k) * gain(g, multOf(game))
    if (how === 'ok') x.reps++
  }
  const tapRate = () => (kid.tap ? kid.tap[0] + ((kid.tap[1] - kid.tap[0]) * (ageMonths() - START_MONTHS)) / (72 - START_MONTHS) : 0)

  // ── 統計 ──
  const S: KidResult['stats'] = {
    days: 0,
    quizzes: 0,
    teaches: 0,
    rate: 0,
    byTrack: {},
    roundNew: [0, 0, 0],
    stuckOpens: 0,
    reopens: 0,
    reopenRecovered: 0,
    reopenHeld: 0,
    reopenDays: [],
    pauseMax: {},
    globalPauseMax: 0,
    longestWait: null,
    returnDays: 0,
    returnNew: 0,
    lockedOpens: 0,
    lockedReviews: 0,
    rampChecks: 0,
    roundItems: {},
    maxRoundSec: 0,
    maxDayMin: {},
    reduced: 0,
    reteach: 0,
    intros: {},
    slowOk: 0,
    firstPlayOver: 0,
    levelLate: 0,
    slowRungs: [],
    reopenAgain: 0,
    ms: 0,
  }
  const weeks = new Map<number, { n: number; ok: number }>()
  let status: GrowthStatus = getGrowth()
  let daySec = 0
  let roundSec = 0
  let roundFirst = false
  let lockOn = false

  // ── 一題 ──
  const learned = (k: string) => skill(k).seen > 0 || (k.startsWith('lasso:') && skill(`all:${k.slice(6)}`).seen > 0)
  let playLevel: number | null = null
  const lvOf = (g: GameDef) => playLevel ?? level(g.id)
  const base = (g: GameDef, k: string) => ({ id: String(attempts.length), ts: Date.now(), date, sessionId: date, station: g.station, game: g.id, itemId: k, skill: k, level: lvOf(g), options: [], answer: k, taps: [], attempts: 1, synced: 0 as const })

  const TRACE = arg('trace')
  const trace = (s: string) => TRACE === date && console.error(`  ${s}  roundNew=${roundNewConcepts().join(',')}`)
  function teach(g: GameDef, k: string) {
    trace(`教 ${g.id} ${k}`)
    S.teaches++
    roundSec += 20
    noteAttempt({ game: g.id, skill: k, phase: 'teach', firstTryCorrect: true, level: lvOf(g) })
    attempts.push({ ...base(g, k), phase: 'teach', firstTryCorrect: true, responseMs: 0, hintUsed: false })
    learn(g.id, k, 'teach')
    tick(30_000)
  }

  function quiz(g: GameDef, k: string, taughtNow: boolean, why: string, opts?: { probe: boolean }, maxLevel = g.maxLevel, nOptions = 0): boolean {
    S.quizzes++
    if (!(learned(k) || taughtNow)) bad('沒教就考', `${g.id} ${k}（${why}）`)
    const x = knowNow(g.id, k)
    let p = 0.25 + 0.72 * x.k - 0.02 * (lvOf(g) - 1)
    if (rnd() < tapRate()) p = nOptions ? 1 / nOptions : 0.3
    p = Math.min(0.97, Math.max(0.05, p))
    const ok = rnd() < p
    trace(`考 ${g.id} ${k} ${ok ? '對' : '錯'} 第 ${level(g.id)} 級${opts?.probe ? ' 探測' : ''} seen=${skill(k).seen}`)
    // 反應時間：年紀越大越快，越會的越快一點，每題上下 10% 的起伏（估計值）。引擎拿它判斷「答對但明顯偏慢」（不升格）
    const ms = Math.round((4200 - 1800 * ((ageMonths() - START_MONTHS) / (72 - START_MONTHS))) * (1.15 - 0.25 * x.k) * (0.9 + 0.2 * rnd()))
    const box0 = skill(k).box
    // --fix=part-speed：模擬修好「零件也照畫畫類不看速度」之後（每次一樣快，引擎就不會判偏慢）
    const msIn = FIX_PART_SPEED && k.startsWith('part:') ? 3000 : ms
    const metrics = opts?.probe ? { probe: 1 } : undefined
    recordSkill(k, ok, { game: g.id, responseMs: msIn, hintUsed: !ok, metrics })
    noteAttempt({ game: g.id, skill: k, phase: 'quiz', firstTryCorrect: ok, level: lvOf(g), hintUsed: !ok, metrics })
    attempts.push({ ...base(g, k), phase: 'quiz', firstTryCorrect: ok, responseMs: ms, hintUsed: !ok, ...(metrics ? { metrics } : {}) })
    if (ok && !opts?.probe && box0 < 5 && skill(k).box === box0) S.slowOk++
    reportLevel(g.id, ok, maxLevel, opts ? { probe: opts.probe, skill: k } : undefined)
    learn(g.id, k, ok ? 'ok' : 'no')
    if (!opts?.probe) {
      const w = Math.floor(daysBetween(START, date) / 7)
      const e = weeks.get(w) ?? { n: 0, ok: 0 }
      e.n++
      if (ok) e.ok++
      weeks.set(w, e)
      const t = trackOf(g.id) ?? '?'
      const bt = (S.byTrack[t] ??= { n: 0, ok: 0 })
      bt.n++
      if (ok) bt.ok++
      if (lockOn && kid.lock && rungDef(rungOfSkill(k) ?? '')?.strand === kid.lock.strand) S.lockedReviews++
    }
    // 一題：唸題目、作答、回饋約 8 秒；答錯要再試、看提示，多 6 秒（估計值，不是引擎）
    roundSec += ok ? 8 + ms / 1000 : 14 + ms / 1000
    tick(15_000)
    return ok
  }

  /** 選項數不超過年段上限（FRAME-2、LOAD-1） */
  function checkOptions(g: GameDef, n: number) {
    const cap = FRAMES[bandOf(status, 'maxOptions')].maxOptions
    if (n > cap) bad('選項超過年段上限', `${g.id} ${n} 個（上限 ${cap}）`)
    if (n < 2) bad('選項少於 2 個', g.id)
  }

  /** 一回合幾題、教幾個新的：照 --small 的設定（小班段），中班段起照外框 */
  function round(firstPlay: boolean): RoundState {
    const st = roundState(firstPlay)
    if (bandOf(status, 'roundItems') === 'small') st.items = small === 'legacy' ? ROUND_ITEMS : clamp(ROUND_ITEMS, FRAMES.small.roundItems)
    if (bandOf(status, 'newPerRound') === 'small') st.maxTeach = small === 'legacy' ? MAX_TEACH : Math.min(MAX_TEACH, FRAMES.small.newPerRound)
    const band = bandOf(status, 'roundItems')
    ;(S.roundItems[band] ??= []).push(st.items)
    if (!(small === 'legacy' && band === 'small')) {
      const [a, b] = status.frame.roundItems
      if (st.items < a || st.items > b) bad('一回合題數超出外框', `${st.items} 題（${BAND_ZH[band]} ${a}–${b}）`)
    }
    return st
  }

  // ── 每個引擎的一局（和 sim-teach 同一套決定）──
  function playChoice(g: GameDef) {
    const st = round(plays(g.id) === 0)
    markPlayed(g.id)
    for (let i = 0; i < st.items; i++) {
      const p = planChoice(g, st, i)
      if (p.fresh) teach(g, p.it.skill)
      checkOptions(g, p.it.options.length)
      quiz(g, p.it.skill, p.fresh, p.probe ? '探測題直接考' : '選擇題', { probe: p.probe }, g.maxLevel, p.it.options.length)
    }
  }
  function playPattern(g: GameDef) {
    const st = round(plays(g.id) === 0)
    const rounds = patternRounds(st.firstPlay)
    markPlayed(g.id)
    for (let i = 0; i < rounds; i++) {
      const p = planChoice(g, st, i)
      if (p.fresh) teach(g, p.it.skill)
      checkOptions(g, p.it.options.length)
      quiz(g, p.it.skill, p.fresh, p.probe ? '探測題直接考' : '找規律', { probe: p.probe }, g.maxLevel, p.it.options.length)
    }
  }
  function playPhonics(g: GameDef) {
    const st = round(plays(g.id) === 0)
    markPlayed(g.id)
    for (let i = 0; i < st.items; i++) {
      const p = planPhonics(g, PHONICS_MAKERS[g.id], st, i)
      if (p.fresh) teach(g, p.it.skill)
      for (const c of p.cards) noteAttempt({ game: g.id, skill: c.key, phase: 'teach', firstTryCorrect: true, level: lvOf(g) })
      checkOptions(g, p.it.options.length)
      quiz(g, p.it.skill, p.fresh, '自然發音', undefined, g.maxLevel, p.it.options.length)
    }
  }
  function playSheet(g: GameDef) {
    const mode = g.kind === 'lasso' ? 'lasso' : 'tap'
    const st = round(plays(g.id) === 0)
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
      const [a, b] = numberRange(prefix, level(g.id))
      const { n, fresh } = picker.pick(a, b)
      if (fresh) teach(g, `${prefix}:${n}`)
      quiz(g, `${prefix}:${n}`, fresh, '數量')
    }
  }
  function playCount(g: GameDef) {
    const st = round(plays(g.id) === 0)
    markPlayed(g.id)
    for (let i = 0; i < 4; i++) {
      const { n, show } = planCount(g.id, level(g.id), st, i)
      if (show) teach(g, `count:${n}`)
      quiz(g, `count:${n}`, show, '數數（沒示範）')
    }
  }
  function playOrder(g: GameDef) {
    const st = round(plays(g.id) === 0)
    markPlayed(g.id)
    for (let i = 0; i < 3; i++) {
      const { n, show } = planOrder(g.id, level(g.id), unlockedNumbers(), st, i)
      if (show) teach(g, `order:${n}`)
      quiz(g, `order:${n}`, show, '照順序（沒示範）')
    }
  }
  function playDrive(g: GameDef) {
    const st = round(plays(g.id) === 0)
    markPlayed(g.id)
    for (let i = 0; i < 4; i++) {
      const p = planDrive(g, st, i)
      if (p.fresh) teach(g, p.key)
      quiz(g, p.key, p.fresh, '箭頭卡')
    }
  }
  const seqSeen = new Set<string>()
  function playSequence(g: GameDef) {
    const st = { ...round(plays(g.id) === 0), stories: [] }
    markPlayed(g.id)
    for (let i = 0; i < 4; i++) {
      const p = planSequence(g, st, i)
      if (!seqSeen.has(p.s.id)) {
        seqSeen.add(p.s.id)
        if (!p.fresh) bad('新故事沒先示範', `${g.id} ${p.s.id}`)
      }
      if (p.fresh) teach(g, seqSkill(p.s))
      quiz(g, seqSkill(p.s), p.fresh, '排順序')
    }
  }
  function playDots(g: GameDef) {
    const st = round(plays(g.id) === 0)
    markPlayed(g.id)
    for (let i = 0; i < 2; i++) {
      const { pic, show } = planDots(g.id, level(g.id), unlockedNumbers(), st, i, themeNow()?.dots ?? [])
      const k = `dots:${pic.id}`
      if (show) teach(g, k)
      quiz(g, k, show, '連點成圖（沒示範）')
    }
  }
  function playTrace(g: GameDef) {
    const firstPlay = plays(g.id) === 0
    let demos = 0
    markPlayed(g.id)
    for (let i = 0; i < 3; i++) {
      const idx = Math.min(6, level(g.id) - 1 + (i === 2 ? 1 : 0))
      const k = `trace:${idx + 1}`
      const show = demos < 2 && needsDemo(firstPlay && i === 0, k)
      if (show) {
        demos++
        teach(g, k)
      }
      quiz(g, k, show, '運筆小路（沒示範）')
    }
  }
  function playGlyph(g: GameDef) {
    refreshLadder()
    const open = lettersOpen()
    const st = { firstPlay: plays(g.id) === 0, demos: 0, recent: [] as string[] }
    markPlayed(g.id)
    for (let i = 0; i < 3; i++) {
      const lv = glyphLevel(level(g.id), open, g.maxLevel)
      playLevel = lv
      const { g: x, isNew } = planGlyph(g.id, lv, st, i)
      st.recent = [x, ...st.recent].slice(0, 3)
      const k = glyphSkill(x)
      if (!isPart(x) && !open) bad('描字母那一階還沒開就描字母', k)
      if (isNew) {
        st.demos++
        teach(g, k)
      }
      quiz(g, k, isNew, '描字（沒示範）', undefined, glyphLevelCap(open, g.maxLevel))
      playLevel = null
    }
  }
  function playFluency(g: GameDef) {
    const ts = fluencyTargets()
    if (!ts.length) return playChoice(gameOf('m-find'))
    markPlayed(g.id)
    for (let i = 0; i < 5; i++) quiz(g, fluencyKey(ts[Math.floor(rnd() * ts.length)]), false, '數字快答')
  }
  function playOne(g: GameDef) {
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
      case 'trace':
        return playTrace(g)
      case 'glyph':
        return playGlyph(g)
      case 'sequence':
        return playSequence(g)
      case 'pattern':
        return playPattern(g)
      case 'coloring':
      case 'free':
        // 著色、自由畫：沒有對錯，只記一次遊玩（ColoringGame、FreeDraw 也是這樣）
        markPlayed(g.id)
        roundSec += 120
        return
    }
  }

  /** 玩一個遊戲：前後檢查階梯有沒有亂開、一回合教了幾個新概念、時間 */
  let dayNew = 0
  let fastNow = new Set<string>()
  function play(id: string, theme: string | null) {
    const g = gameOf(id)
    if (TRACE === date) console.error(`${id}（第 ${plays(id) + 1} 次玩）`)
    roundSec = 15
    roundFirst = plays(id) === 0
    const before = snapshotLadder()
    const t = trackOf(id)
    const b0 = t ? budgetOf(t, conceptIntrosNow(), date, weeklyNew()) : null
    const leave = enterTheme(theme)
    try {
      playOne(g)
    } finally {
      leave()
    }
    checkSteps(before)
    const n = roundNewConcepts()
    S.roundNew[Math.min(2, n.length)]++
    dayNew += n.length
    if (n.length > 1) bad('一回合超過 1 個新概念', `${id}：${n.join('、')}`)
    // 每條主線最近 7 天的新概念不超過額度（太順的支線多 1 個）。例外：第一次玩的遊戲什麼都還沒學過，照規則先教一個（pick.ts）
    // 難度型遊戲的「新的一級」（lv:）另外算：升級當下額度還有，下一回合在新的一級作答時才記成新概念，中間額度可能被別的用掉
    const late = n.filter((c) => c.startsWith('lv:'))
    if (late.length && b0 && b0.used.length >= b0.limit) S.levelLate++
    const nn = n.filter((c) => !c.startsWith('lv:'))
    if (b0 && nn.length && b0.used.length >= b0.limit) {
      const s = rungOfSkill(attempts.at(-1)!.skill)
      const bonus = s && fastNow.has(rungDef(s)!.strand) && b0.used.length < b0.limit + FAST_BONUS
      if (roundFirst) S.firstPlayOver++
      else if (!bonus) bad('每週新概念超過額度', `${id} 教了 ${nn.join('、')}；${t} 這 7 天已經 ${b0.used.length} 個（額度 ${b0.limit}）`)
    }
    const lim = (roundFirst ? status.frame.firstRoundMinutes : status.frame.roundMinutes) * 60
    S.maxRoundSec = Math.max(S.maxRoundSec, roundSec)
    if (roundSec > lim) bad('一回合超過時間', `${id} 約 ${Math.round(roundSec)} 秒（上限 ${lim} 秒）`)
    daySec += roundSec
  }

  // ── 階梯：每次往前走一步都檢查新開的階 ──
  function snapshotLadder() {
    const view = ladderNow()
    return { state: structuredClone((kv.get('ladder') as LadderState | undefined) ?? { v: 0, rungs: {} }), view }
  }
  function checkSteps(before: ReturnType<typeof snapshotLadder>) {
    const now = (kv.get('ladder') as LadderState | undefined) ?? { v: 0, rungs: {} }
    for (const r of RUNGS) {
      const a = before.state.rungs[r.id]
      const b = now.rungs[r.id]
      if (!b?.open || a?.open) continue
      // 新開的階
      if (b.by === 'legacy') bad('新的孩子出現補記', r.id)
      if (b.by === 'stuck') S.stuckOpens++
      for (const p of r.prereq) {
        const pm = now.rungs[p]
        if (pm?.done) continue
        const c = before.view.rungs.get(p)!
        const okStuck = b.by === 'stuck' && !!pm?.open && c.total > 0 && c.ratio >= STUCK_RATIO && daysBetween(pm.open, b.open) >= STUCK_DAYS
        if (!okStuck) bad('前置條件沒滿足就開', `${r.id}（${b.by}）：前置 ${p} ${pm?.open ? `開了 ${daysBetween(pm.open, b.open)} 天、穩固 ${Math.round(c.ratio * 100)}%` : '還沒開'}`)
      }
      const lock = lockOn && kid.lock && r.strand === kid.lock.strand ? kid.lock.rung : undefined
      if (lock !== undefined && strandRungs(r.strand).indexOf(r) + 1 > lock) {
        S.lockedOpens++
        bad('家長鎖住的支線開了新階', r.id)
      }
    }
  }

  // ── 每天 ──
  const playable = (id: string) => plays(id) > 0 || !entryRung(id) || rungOpen(entryRung(id)!)
  function planToday(): string[] {
    const from = addDays(date, -(MASTERY_DAYS - 1))
    const recent = attempts.filter((a) => a.date >= from)
    const needs = trackNeeds({ attempts: recent, date, boxOf: (k) => skill(k).box, intros: conceptIntrosNow(), isDue, perWeek: weeklyNew() })
    const byGame = new Map<string, Set<string>>()
    for (const a of recent) byGame.set(a.game, (byGame.get(a.game) ?? new Set()).add(a.skill))
    const dueIn = (g: string) => [...(byGame.get(g) ?? [])].filter(isDue).length
    const games = GAMES.filter((g) => g.kind !== 'free' && trackOf(g.id) && (!isFluency(g.id) || fluencyReady()) && playable(g.id))
    const n = Math.max(2, Math.min(5, bandSetting('activitiesPerDay')))
    return planDay({ date, n, needs, games, lastPlayed, plays, dueIn, focus: stalledGame, overloaded: pauseNew() }).map((s) => s.game)
  }

  const breakDays = new Set<string>()
  for (const [mo, days] of kid.breaks ?? []) {
    const from = addDays(START, Math.round((mo - START_MONTHS) * 30.44))
    for (let i = 0; i < days; i++) breakDays.add(addDays(from, i))
  }

  const months: MonthRow[] = []
  const exhausted: KidResult['exhausted'] = {}
  const warned: KidResult['warned'] = {}
  const pauseRun = new Map<string, number>()
  let globalRun = 0
  let booted = false
  /** 回補：開始的日子 → 那一階 */
  /** 回補中的階：第一次開始的日子、接著又重新開始了幾次（7 天到了還是掉著，隔天又開始） */
  const reopenOpen = new Map<string, { from: string; again: number; ended?: string }>()
  let logSeen = 0
  let lastBand: Band | null = null
  let rampFrom: string | null = null
  const monthAt = (d: string) => Math.round(((daysBetween(START, d) / 30.44) + START_MONTHS) * 10) / 10

  function snapshotMonth() {
    if (!booted) return
    const view = ladderNow()
    months.push({
      months: Math.round(ageMonths()),
      band: status.ramp ? `${BAND_ZH[status.ramp.from]}→${BAND_ZH[status.ramp.to]} 第 ${status.ramp.week} 週` : BAND_ZH[status.band],
      strands: Object.fromEntries(view.strands.map((s) => [s.id, { done: s.done, current: s.current, left: s.left, out: s.out }])),
      ratio: Object.fromEntries([...view.rungs.values()].filter((r) => r.open && !r.complete && r.total && !r.free).map((r) => [r.id, Math.round(r.ratio * 100) / 100])),
    })
  }

  for (; ; date = addDays(date, 1)) {
    const mo = monthsOld(BIRTH, date)!
    if (mo >= END_MONTHS) break
    clock = RealDate.parse(`${date}T09:00:00`)
    dayNo = daysBetween(START, date)
    if (date.endsWith('-01')) snapshotMonth()
    const wd = new RealDate(`${date}T12:00:00`).getDay()
    if (wd === 0 || wd === 6 || breakDays.has(date)) continue

    // 家長在家長區鎖支線（G-6 的畫面還沒有，直接寫 kv.growth.locks）
    if (kid.lock && !lockOn && mo >= kid.lock.months) {
      const g = (kv.get(GROWTH_KV) as GrowthState | undefined) ?? { locks: {} }
      kv.set(GROWTH_KV, { ...g, locks: { ...g.locks, [kid.lock.strand]: kid.lock.rung } })
      lockOn = true
    }

    // ── 開機 ──
    const before = booted ? snapshotLadder() : null
    await loadGrowth()
    await loadAdaptive()
    if (before) checkSteps(before)
    booted = true
    status = getGrowth()
    S.days++
    daySec = 0
    dayNew = 0

    // 年段：換段時 4 週慢慢放寬（§1.5）
    checkRamp()

    // 小班段只用點的（TOUCH-2）
    if (bandOf(status, 'drag') === 'small' && dragOf(status) !== 'tap') bad('小班段可以拖', dragOf(status))

    // 負擔控制：一條支線（或全部）連續暫停幾個有玩的日子
    const sl = strandLoadNow()
    for (const s of STRANDS) {
      const on = sl.strands.includes(s.id)
      const run = on ? (pauseRun.get(s.id) ?? 0) + 1 : 0
      pauseRun.set(s.id, run)
      S.pauseMax[s.id] = Math.max(S.pauseMax[s.id] ?? 0, run)
    }
    globalRun = sl.global ? globalRun + 1 : 0
    // 除錯：--watch=code 印出那條支線每天開機時暫停了沒、遊戲在第幾級，和當天那條支線的答對率
    const watch = arg('watch') as StrandId | undefined
    const watchGames = watch ? [...new Set(strandRungs(watch).flatMap((r) => r.games))] : []
    const watchFrom = attempts.length
    if (watch && (pauseRun.get(watch) ?? 0) > 0) console.error(`${date} ${watch} 暫停第 ${pauseRun.get(watch)} 天，開機後 ${watchGames.map((g) => `${g} ${level(g)} 級`).join('、')}`)
    S.globalPauseMax = Math.max(S.globalPauseMax, globalRun)
    const returning = sl.returning
    if (returning) S.returnDays++

    fastNow = new Set(sl.fast)

    // ── 今天的冒險＋自由探索 ──
    const theme = THEMES[Math.floor(rnd() * THEMES.length)].id
    for (const id of planToday()) play(id, theme)
    const dailyMax = status.frame.dailyMinutes * 60
    const free = GAMES.filter((g) => !['free', 'coloring'].includes(g.kind) && trackOf(g.id) && playable(g.id) && (!isFluency(g.id) || fluencyReady()))
    for (let k = 0; k < 2 && daySec + 200 <= dailyMax; k++) {
      const known = free.filter((g) => plays(g.id) > 0)
      const pool = known.length && rnd() < 0.7 ? known : free
      play(pool[Math.floor(rnd() * pool.length)].id, null)
    }
    if (watch && (pauseRun.get(watch) ?? 0) > 0) {
      const xs = attempts.slice(watchFrom).filter((a) => a.phase === 'quiz' && rungDef(rungOfSkill(a.skill) ?? '')?.strand === watch)
      console.error(`   當天 ${watch} ${xs.length} 題、答對 ${xs.filter((a) => a.firstTryCorrect).length}；收尾 ${watchGames.map((g) => `${g} ${level(g)} 級`).join('、')}`)
    }
    const dayMin = daySec / 60
    const bandNow = bandOf(status, 'dailyMinutes')
    S.maxDayMin[bandNow] = Math.max(S.maxDayMin[bandNow] ?? 0, Math.round(dayMin * 10) / 10)
    if (daySec > dailyMax) bad('一天超過總時間', `約 ${Math.round(dayMin)} 分鐘（上限 ${status.frame.dailyMinutes}）`)
    if (returning && dayNew) {
      S.returnNew += dayNew
      bad('長時間沒玩回來的第一天教了新的', `${dayNew} 個`)
    }


    // 時間軸：回補開始、結束
    for (; logSeen < growthLog.length; logSeen++) {
      const e = growthLog[logSeen]
      if (e.kind !== 'reopen') continue
      const r = String(e.data.rung)
      // 連續回補還沒回來，引擎停下來改提醒家長（REOPEN_MAX）：這一段回補到這裡結束，不再暫停這條支線
      if (e.data.event === 'hold') {
        const cur = [...reopenOpen].find(([k, x]) => k.startsWith(`${r}|`) && !x.ended)
        if (cur) cur[1].ended = e.date
        S.reopenHeld++
      }
      if (e.data.event === 'start') {
        const cur = [...reopenOpen].find(([k, x]) => k.startsWith(`${r}|`) && !x.ended)
        if (cur) cur[1].again++
        else {
          S.reopens++
          reopenOpen.set(`${r}|${e.date}`, { from: e.date, again: 0 })
        }
      }
    }
    // 回補會回來：開始之後，這一階掉出已熟的比例回到 30% 以下（不再符合回補的條件）
    const lv = ladderNow()
    for (const [k, x] of reopenOpen) {
      if (x.ended) continue
      const r = k.split('|')[0]
      const c = lv.rungs.get(r)!
      if (c.total && (c.total - c.mastered) / c.total < 0.3 && daysBetween(x.from, date) >= 7) {
        x.ended = date
        S.reopenRecovered++
        S.reopenDays.push(daysBetween(x.from, date))
      }
    }
    // 內容用完、提醒家長
    const m = Math.round(ageMonths() * 10) / 10
    for (const s of lv.strands) {
      const built = strandRungs(s.id).filter((r) => unitsOf(r.id).length && !r.with && !r.free)
      if (!built.length) continue
      const e = (exhausted[s.id] ??= { allSeen: null, allDone: null })
      if (e.allSeen === null && s.out) e.allSeen = m
      if (e.allDone === null && built.every((r) => lv.rungs.get(r.id)!.complete)) e.allDone = m
    }
    for (const st of contentStock()) if (st.soon && warned[st.strand] === undefined) warned[st.strand] = m
  }
  snapshotMonth()

  function checkRamp() {
    const b = status.ramp ? status.ramp.to : status.band
    if (lastBand && b !== lastBand) {
      // 照年齡往上換段：第一天就要在放寬的第 1 週，不能整個換掉
      if (!status.ramp || status.ramp.week !== 1) bad('換年段沒有慢慢放寬', `${BAND_ZH[lastBand]} → ${BAND_ZH[b]}`)
      rampFrom = date
    }
    lastBand = b
    if (status.ramp) {
      S.rampChecks++
      const week = Math.floor(daysBetween(status.ramp.start, date) / 7) + 1
      if (status.ramp.week !== week) bad('放寬的週數不對', `第 ${status.ramp.week} 週，應該是第 ${week} 週`)
      for (const k of Object.keys(RAMP_WEEK) as (keyof Frame)[]) {
        const want = RAMP_WEEK[k] <= week ? status.ramp.to : status.ramp.from
        if (bandOf(status, k) !== want || JSON.stringify(status.frame[k]) !== JSON.stringify(FRAMES[want][k])) bad('放寬中的外框不對', `${String(k)} 第 ${week} 週應該是${BAND_ZH[want]}`)
      }
    } else if (rampFrom && daysBetween(rampFrom, date) < RAMP_WEEKS * 7 && daysBetween(rampFrom, date) > 0) {
      bad('放寬不到 4 週就結束', `${daysBetween(rampFrom, date)} 天`)
    }
  }

  // 除錯：--debug=H2,H6b 印出那幾階最後的單位、技能點（熟練度、通過幾次到期複習）
  for (const id of arg('debug')?.split(',') ?? []) {
    const c = ladderNow().rungs.get(id)!
    console.error(`${id}：穩固 ${c.firm}/${c.total}、遷移 ${c.transferred}/${c.transferable}、done ${c.complete}`)
    for (const u of c.units) console.error(`  ${u.id} firm=${u.firm} mastered=${u.mastered} ${u.skills.map((k) => `${k}(box ${skill(k).box} rev ${skill(k).rev ?? '-'} seen ${skill(k).seen} firmAt ${skill(k).firmAt ? 'y' : 'n'})`).join(' ')}`)
  }

  // ── 最後整理 ──
  const final = (kv.get('ladder') as LadderState).rungs
  const rungs: KidResult['rungs'] = {}
  for (const r of RUNGS) {
    const mk = final[r.id]
    if (!mk) continue
    rungs[r.id] = { ...mk, openMonths: mk.open ? monthAt(mk.open) : undefined, doneMonths: mk.done ? monthAt(mk.done) : undefined }
    delete (rungs[r.id] as { reopen?: unknown }).reopen
  }
  // 卡死：有內容的階，前置（有內容的）都開了之後，多久才開
  for (const r of RUNGS) {
    if (!unitsOf(r.id).length || r.with || !r.prereq.length) continue
    if (!r.prereq.every((p) => unitsOf(p).length)) continue
    const opens = r.prereq.map((p) => final[p]?.open)
    if (opens.some((x) => !x)) continue
    if (kid.lock && r.strand === kid.lock.strand && strandRungs(r.strand).indexOf(r) + 1 > kid.lock.rung) continue
    const from = opens.sort().at(-1)!
    const to = final[r.id]?.open ?? date
    const wait = daysBetween(from, to)
    if (!S.longestWait || wait > S.longestWait.days) S.longestWait = { rung: r.id, days: wait }
    if (final[r.id]?.open || wait <= 365) continue
    // 前置開了一年，下一階還沒開：擋住的前置（沒完成）穩固的比例半年來都沒有往上，才算卡死；有往上只是很慢
    const blocking = r.prereq.filter((p) => !final[p]?.done)
    const ratioAt = (p: string, back: number) => months.at(-1 - back)?.ratio[p] ?? 0
    const flat = blocking.filter((p) => ratioAt(p, 0) < STUCK_RATIO && ratioAt(p, 0) <= ratioAt(p, 6))
    const why = blocking.map((p) => `${p} 穩固 ${pct(ratioAt(p, 6))} → ${pct(ratioAt(p, 0))}`).join('、')
    if (flat.length) bad('卡死：前置開了一年，下一階還沒開，半年來沒有進展', `${r.id}（${why}）`)
    else S.slowRungs.push(`${r.id}（${why}）`)
  }
  for (const [k, x] of reopenOpen) {
    if (x.again) S.reopenAgain = Math.max(S.reopenAgain, x.again)
    if (!x.ended && daysBetween(x.from, date) > 56) bad('回補 8 週後還沒回來', `${k.split('|')[0]} 從 ${x.from} 開始回補，之後又重新開始 ${x.again} 次`)
  }
  // 長期停擺：一條支線連續 4 週（20 個有玩的日子）暫停新內容
  for (const [s, n] of Object.entries(S.pauseMax)) if (n > PAUSE_MAX) bad('一條支線長期停擺', `${s} 連續 ${n} 個有玩的日子暫停新內容`)
  if (S.globalPauseMax > PAUSE_MAX) bad('長期全部暫停', `連續 ${S.globalPauseMax} 個有玩的日子`)

  const quizN = [...weeks.values()].reduce((s, w) => s + w.n, 0)
  S.rate = quizN ? [...weeks.values()].reduce((s, w) => s + w.ok, 0) / quizN : 0
  for (const [c, x] of conceptIntrosNow()) {
    const s = c.startsWith('lv:') ? 'lv' : (c.split(':')[0] ?? c)
    S.intros[`${x.track}:${s}`] = (S.intros[`${x.track}:${s}`] ?? 0) + 1
  }
  S.reteach = growthLog.filter((e) => e.kind === 'reopen' && e.data.event === 'start').reduce((n, e) => n + ((e.data.dropped as string[] | undefined)?.length ?? 0), 0)
  S.ms = Math.round(performance.now() - t0)
  return {
    kid: kid.id,
    small,
    seed: seed0,
    variant: '',
    months,
    weeks: [...weeks].sort((a, b) => a[0] - b[0]).map(([w, x]) => ({ week: w, months: Math.round((w * 7) / 30.44 + START_MONTHS), ...x })),
    rungs,
    exhausted,
    warned,
    stats: S,
    violations: v,
  }
}

const clamp = (n: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, n))
const rungOfSkill = (k: string) => {
  for (const r of RUNGS) if (unitsOf(r.id).some((u) => u.match(k))) return r.id
  return null
}

/**
 * 把 Dexie 的資料表換成記憶體裡的假表：只做引擎用到的查詢（get、put、bulkAdd、toArray、where().aboveOrEqual()、orderBy().uniqueKeys()）。
 * 作答紀錄放在 attempts 陣列（模擬自己也要讀）；kv 放在 Map（階梯、額度、遷移的快取都在這裡，跟平板一樣）。
 */
function installFakeDb(attempts: Attempt[], kv: Map<string, unknown>, growthLog: { kind: string; date: string; data: Record<string, unknown> }[]) {
  const coll = <T,>(rows: () => T[]) => ({
    toArray: async () => rows(),
    sortBy: async (k: keyof T) => [...rows()].sort((a, b) => ((a[k] as number) < (b[k] as number) ? -1 : 1)),
    count: async () => rows().length,
    uniqueKeys: async () => [] as unknown[],
  })
  const table = <T extends Record<string, unknown>>(pk: string, store: Map<string, T> = new Map()) => ({
    get: async (k: string) => store.get(k),
    put: async (r: T) => void store.set(String(r[pk]), r),
    add: async (r: T) => void store.set(String(r[pk]), r),
    bulkAdd: async (rs: T[]) => rs.forEach((r) => store.set(String(r[pk]), r)),
    bulkPut: async (rs: T[]) => rs.forEach((r) => store.set(String(r[pk]), r)),
    delete: async (k: string) => void store.delete(k),
    clear: async () => store.clear(),
    toArray: async () => [...store.values()],
    count: async () => store.size,
    where: () => ({ aboveOrEqual: () => coll(() => [...store.values()]), equals: () => coll(() => [...store.values()]) }),
    orderBy: () => coll(() => [...store.values()]),
    filter: (f: (r: T) => boolean) => coll(() => [...store.values()].filter(f)),
  })
  const d = db as unknown as Record<string, unknown>
  for (const t of db.tables) d[t.name] = table(String(t.schema.primKey.keyPath ?? 'id'))
  d.kv = {
    ...table('key'),
    get: async (k: string) => (kv.has(k) ? { key: k, value: kv.get(k) } : undefined),
    put: async (r: { key: string; value: unknown }) => void kv.set(r.key, r.value),
    delete: async (k: string) => void kv.delete(k),
  }
  d.growthLog = { ...table('id'), bulkAdd: async (rs: { kind: string; date: string; data: Record<string, unknown> }[]) => void growthLog.push(...rs) }
  const byDate = (from: string) => {
    // attempts 依日期排好（模擬一天一天往前）：從後面找起
    let i = attempts.length
    while (i > 0 && attempts[i - 1].date >= from) i--
    return attempts.slice(i)
  }
  d.attempts = {
    ...table('id'),
    put: async () => {},
    add: async () => {},
    bulkAdd: async () => {},
    toArray: async () => [...attempts],
    where: (k: string) => {
      if (k !== 'date') throw new Error(`假資料庫沒有做 attempts.where('${k}')`)
      return { aboveOrEqual: (from: string) => coll(() => byDate(from)) }
    },
    orderBy: (k: string) => {
      if (k !== 'date') throw new Error(`假資料庫沒有做 attempts.orderBy('${k}')`)
      return { uniqueKeys: async () => [...new Set(attempts.map((a) => a.date))] }
    },
  }
}

// ════════════════════════════════════════════════════════════
// 主行程：每種孩子開一個子行程，收結果、跨孩子的斷言、寫報告
// ════════════════════════════════════════════════════════════
interface Job {
  kid: string
  small: 'legacy' | 'new'
  seed: number
  /** 對照組：''＝主要的一組；small＝小班段用另一種設定；fix＝假設零件的速度判斷修好了 */
  variant: '' | 'small' | 'fix'
}

function runChild(job: Job): Promise<KidResult> {
  return new Promise((ok, fail) => {
    const self = fileURLToPath(import.meta.url)
    const pass = ARGS.filter((a) => /^--to=/.test(a))
    const p = spawn(process.execPath, [...process.execArgv, self, `--kid=${job.kid}`, `--small=${job.small}`, `--seed=${job.seed}`, ...(job.variant === 'fix' ? ['--fix=part-speed'] : []), ...pass], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (b) => (out += b))
    p.stderr.on('data', (b) => (err += b))
    p.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith(MARK))
      if (!line) return fail(new Error(`${job.kid}（${job.small}、種子 ${job.seed}）沒有跑完，exit ${code}\n${err.slice(-3000)}\n${out.slice(-2000)}`))
      ok({ ...(JSON.parse(line.slice(MARK.length)) as KidResult), variant: job.variant })
    })
  })
}

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await f(items[k])
      }
    }),
  )
  return out
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const age = (m: number | null | undefined) => (m == null ? '—' : `${Math.floor(m / 12)} 歲 ${Math.floor(m % 12)} 個月`)
const ageShort = (m: number | null | undefined) => (m == null ? '—' : `${Math.floor(m / 12)}:${String(Math.floor(m % 12)).padStart(2, '0')}`)
const kidName = (id: string) => KIDS.find((k) => k.id === id)!.name
const smallName = (s: 'legacy' | 'new') => (s === 'legacy' ? '小班段現行（6 題、教 2 個）' : '小班段準則（3–5 題、教 1 個）')
const variantName = (r: KidResult) => (r.variant === 'small' ? `對照：${smallName(r.small)}` : r.variant === 'fix' ? '對照：假設零件的速度判斷修好了' : '')
const NUM_STRANDS: readonly StrandId[] = ['count', 'measure', 'pattern', 'shape', 'compose']

/**
 * 幾次模擬的中位數；沒到的（null）當作「6 歲前沒到」排在最後。
 * 一半以上沒到就是 null；另外回傳到了幾次。
 */
function med(xs: (number | null | undefined)[]): { m: number | null; hit: number; n: number } {
  const n = xs.length
  const s = xs.map((x) => (x == null ? Infinity : x)).sort((a, b) => a - b)
  const mid = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
  return { m: Number.isFinite(mid) ? mid : null, hit: xs.filter((x) => x != null).length, n }
}
/** 中位數的年齡，有幾次沒到就註明（3 次裡 1 次沒到：「4:02（1/5 沒到）」） */
const medAge = (xs: (number | null | undefined)[]) => {
  const r = med(xs)
  const miss = r.n - r.hit
  return `${ageShort(r.m)}${miss && r.m != null ? `（${miss}/${r.n} 沒到）` : ''}`
}

/** 跨孩子的斷言（§6.1 的「要看的事」），用幾次模擬的中位數比 */
function crossChecks(rs: KidResult[]): Violation[] {
  const v: Violation[] = []
  const of = (id: string) => rs.filter((r) => r.kid === id && !r.variant)
  const bad = (what: string, detail: string) => v.push({ date: '—', what, detail })
  for (const r of of('typical')) {
    const ws = r.weeks.filter((w) => w.n >= 20)
    const good = ws.filter((w) => w.ok / w.n >= 0.65 && w.ok / w.n <= 0.9).length
    if (good / ws.length < 0.9) bad('一般孩子的第一次答對率', `種子 ${r.seed}：${good}/${ws.length} 週在 65–90%（要 9 成以上）`)
  }
  for (const r of of('slow')) {
    if (r.stats.rate < 0.65) bad('學得慢的第一次答對率', `種子 ${r.seed}：${pct(r.stats.rate)}（要 65% 以上）`)
    if (!r.stats.stuckOpens) bad('學得慢沒有用到卡關保險', `種子 ${r.seed}`)
  }
  const uneven = of('uneven')
  const typical = of('typical')
  if (uneven.length && typical.length) {
    // 強的那條不被弱的那條拖住：數與規律每一階完成的中位數，不比一般孩子晚 1 個月以上
    for (const r of RUNGS.filter((x) => NUM_STRANDS.includes(x.strand) && unitsOf(x.id).length)) {
      const a = med(uneven.map((x) => x.rungs[r.id]?.doneMonths)).m
      const b = med(typical.map((x) => x.rungs[r.id]?.doneMonths)).m
      if (b != null && (a == null || a > b + 1)) bad('偏科：數學被拖住', `${r.id} 完成的中位數 ${age(a)}，一般孩子 ${age(b)}`)
    }
    // 弱的那條多排：語言的題數占比比一般孩子高
    const share = (r: KidResult, t: string) => (r.stats.byTrack[t]?.n ?? 0) / Object.values(r.stats.byTrack).reduce((s, x) => s + x.n, 0)
    const a = med(uneven.map((r) => share(r, 'lang'))).m!
    const b = med(typical.map((r) => share(r, 'lang'))).m!
    if (a <= b) bad('偏科：語言沒有多排', `語言的題數占比中位數 ${pct(a)}，一般孩子 ${pct(b)}`)
    // 弱的那條不硬升：語言的第一次答對率沒有掉到 65% 以下（沒有被推進太難的內容）
    for (const r of uneven) {
      const x = r.stats.byTrack.lang
      if (x && x.ok / x.n < 0.65) bad('偏科：語言被推進太難的內容', `種子 ${r.seed}：語言第一次答對率 ${pct(x.ok / x.n)}`)
    }
  }
  for (const r of of('fast')) if (!Object.keys(r.warned).length) bad('學得快：內容用完沒有提醒家長', `種子 ${r.seed}`)
  for (const r of of('gaps')) {
    if (!r.stats.returnDays) bad('中斷：沒有偵測到長時間沒玩', `種子 ${r.seed}`)
    if (!r.stats.reopens) bad('中斷：回補沒有啟動', `種子 ${r.seed}：停了 3 週回來，沒有任何一階回補`)
  }
  for (const r of of('locked')) if (!r.stats.lockedReviews) bad('家長調整：鎖住之後沒有複習', `種子 ${r.seed}`)
  return v
}

function writeReport(rs: KidResult[], cross: Violation[], main: 'legacy' | 'new', seeds: number[], out: string, seconds: number) {
  /** 每一欄：主要的各種孩子，再加上對照組 */
  const cols = [...new Map(rs.map((r) => [`${r.kid}|${r.variant}`, { id: r.kid, variant: r.variant }])).values()].sort((a, b) => (a.variant ? 1 : 0) - (b.variant ? 1 : 0))
  const runs = (c: { id: string; variant: string }) => rs.filter((r) => r.kid === c.id && r.variant === c.variant)
  const colName = (c: { id: string; variant: string }) => `${kidName(c.id)}${c.variant === 'small' ? `（${smallName(runs(c)[0].small).replace(/（.*/, '')}）` : c.variant === 'fix' ? '（零件修好）' : ''}`
  const L: string[] = []
  const p = (s = '') => L.push(s)
  p('# 成長模擬結果（G-5）')
  p()
  p(`由 \`npx tsx scripts/sim-growth.ts\` 產生（${REPORT_DAY}）。虛構的孩子，生日也是虛構的（${BIRTH}），從 3 歲 3 個月玩到 ${age(END_MONTHS)}，每週玩 5 天。`)
  p(`每種孩子用 ${seeds.length} 個亂數種子（${seeds.join('、')}）各跑一次，表上的年齡是中位數（同一種孩子換個種子，完成的時間可以差好幾個月）。`)
  p(`小班段：${smallName(main)}，照 games/frame.ts 的 LEGACY_SMALL。共跑了 ${Math.round(seconds)} 秒。`)
  const vs = cols.filter((c) => c.variant)
  if (vs.length) p(`對照組：${vs.map((c) => `${colName(c)}＝${variantName(runs(c)[0]).replace('對照：', '')}`).join('；')}。`)
  p()
  p('## 斷言')
  p()
  const allV = [...rs.flatMap((r) => r.violations.map((x) => ({ ...x, kid: colName({ id: r.kid, variant: r.variant }), seed: r.seed }))), ...cross.map((x) => ({ ...x, kid: '跨孩子', seed: 0 }))]
  if (!allV.length) p('全部通過。')
  else {
    const g = new Map<string, typeof allV>()
    for (const x of allV) g.set(`${x.kid}｜${x.what}`, [...(g.get(`${x.kid}｜${x.what}`) ?? []), x])
    p('| 孩子 | 斷言 | 次數（幾個種子） | 例子 |')
    p('|---|---|---|---|')
    for (const [k, xs] of g) {
      const ex = xs[0]
      p(`| ${k.split('｜')[0]} | ${k.split('｜')[1]} | ${xs.length}（${new Set(xs.map((x) => x.seed)).size}） | ${ex.seed ? `種子 ${ex.seed} ` : ''}${ex.date} ${ex.detail} |`)
    }
  }
  p()
  p('## 各種孩子的總覽（幾次模擬的中位數）')
  p()
  p('| 孩子 | 設定 | 第一次答對率 | 65–90% 的週 | 卡關保險開的階 | 回補（回來了／停下來提醒家長） | 支線最長連續暫停（有玩的日子） | 一回合 0／1／2+ 個新概念 | 答對但偏慢不升格 | 第一次玩先教一個（超過額度） |')
  p('|---|---|---|---|---|---|---|---|---|---|')
  for (const c of cols) {
    const xs = runs(c)
    const k = KIDS.find((x) => x.id === c.id)!
    const m = (f: (r: KidResult) => number) => med(xs.map(f)).m ?? 0
    const goodWeeks = (r: KidResult) => {
      const ws = r.weeks.filter((w) => w.n >= 20)
      return ws.filter((w) => w.ok / w.n >= 0.65 && w.ok / w.n <= 0.9).length / ws.length
    }
    const pauseTop = (r: KidResult) => Math.max(0, ...Object.values(r.stats.pauseMax))
    const rn = [0, 1, 2].map((i) => Math.round(m((r) => r.stats.roundNew[i])))
    p(
      `| ${colName(c)} | ${k.desc}${c.variant ? `；${variantName(xs[0])}` : ''} | ${pct(m((r) => r.stats.rate))} | ${pct(m(goodWeeks))} | ${m((r) => r.stats.stuckOpens)} | ${m((r) => r.stats.reopens)}（${m((r) => r.stats.reopenRecovered)}／${m((r) => r.stats.reopenHeld ?? 0)}） | ${m(pauseTop)}（最長 ${Math.max(...xs.map(pauseTop))}） | ${rn.join('／')} | ${pct(m((r) => r.stats.slowOk / r.stats.quizzes))} | ${m((r) => r.stats.firstPlayOver)} |`,
    )
  }
  p()
  p('## 每一階大約幾歲完成（中位數）')
  p()
  p('只列現在有內容（有遊戲）的階。「—」是一半以上的模擬到 6 歲都沒完成；括號是幾次裡有幾次沒完成。開放的方式見原始數據（start：沒有前置；prereq：前置完成；stuck：卡關保險）。')
  p()
  p(`| 階 | 內容 | 參考年齡 | ${cols.map(colName).join(' | ')} |`)
  p(`|---|---|---|${cols.map(() => '---').join('|')}|`)
  for (const r of RUNGS) {
    if (!unitsOf(r.id).length || r.with || r.free) continue
    p(`| ${r.id} | ${r.what} | ${ageShort(r.age)} | ${cols.map((c) => medAge(runs(c).map((x) => x.rungs[r.id]?.doneMonths))).join(' | ')} |`)
  }
  p()
  p('## 內容大約幾歲用完（中位數）')
  p()
  p('- 教完：這條支線現有的內容都出現過了，之後只剩複習（橫向加深還沒做）。')
  p('- 完成：這條支線現有內容的階都完成了。')
  p('- 提醒：家長區第一次出現「快沒有新內容了」（lib/adaptive.ts 的 contentStock）。')
  p()
  p(`| 支線 | ${cols.map(colName).join(' | ')} |`)
  p(`|---|${cols.map(() => '---').join('|')}|`)
  for (const s of STRANDS) {
    if (!strandRungs(s.id).some((r) => unitsOf(r.id).length && !r.free)) continue
    p(
      `| ${s.name} | ${cols
        .map((c) => {
          const xs = runs(c)
          return `教完 ${medAge(xs.map((x) => x.exhausted[s.id]?.allSeen))}／完成 ${medAge(xs.map((x) => x.exhausted[s.id]?.allDone))}／提醒 ${medAge(xs.map((x) => x.warned[s.id]))}`
        })
        .join(' | ')} |`,
    )
  }
  p()
  p('## 還沒做的階：前置條件幾歲滿足（中位數）＝ 這時候就需要那個遊戲')
  p()
  p('引擎會把前置條件滿足、但還沒有內容的階記成「開了」。沒有前置的階（例如拍音節 L7）一開始就是開的，表上寫「隨時」。前置也還沒做出來的，寫「等 X」（要等 X 的遊戲做好、孩子練完才會開）。')
  p()
  p(`| 階 | 內容 | 參考年齡 | 工作項目 | ${cols.map(colName).join(' | ')} |`)
  p(`|---|---|---|---|${cols.map(() => '---').join('|')}|`)
  for (const r of RUNGS) {
    if (unitsOf(r.id).length || r.with) continue
    const cells = cols.map((c) => {
      if (!r.prereq.length) return '隨時'
      const xs = runs(c)
      const mm = med(xs.map((x) => x.rungs[r.id]?.openMonths))
      if (mm.m != null) return medAge(xs.map((x) => x.rungs[r.id]?.openMonths))
      const wait = r.prereq.filter((q) => !unitsOf(q).length)
      return wait.length ? `等 ${wait.join('、')}` : '6 歲前沒開'
    })
    p(`| ${r.id} | ${r.what} | ${ageShort(r.age)} | ${WORK[r.id] ?? '—'} | ${cells.join(' | ')} |`)
  }
  p()
  p('## 每個月各支線在第幾階（各孩子第 1 個種子的那一次）')
  p()
  p('格子是「完成的最後一階 → 正在練的階」；✓ 是現有內容都教過了。只列有內容的階。')
  for (const c of cols) {
    const r = runs(c)[0]
    p()
    p(`### ${colName(c)}`)
    p()
    const shown = STRANDS.filter((s) => strandRungs(s.id).some((x) => unitsOf(x.id).length && !x.free))
    p(`| 年齡 | 年段 | ${shown.map((s) => s.name).join(' | ')} |`)
    p(`|---|---|${shown.map(() => '---').join('|')}|`)
    for (const m of r.months) {
      const cell = (sid: string) => {
        const x = m.strands[sid]
        const built = (rid: string) => unitsOf(rid).length > 0
        const done = x.done.filter(built).at(-1) ?? '—'
        const cur = x.current.filter(built)
        return `${done}${cur.length ? ` → ${cur.join('/')}` : ''}${x.out ? ' ✓' : ''}`
      }
      p(`| ${age(m.months)} | ${m.band} | ${shown.map((s) => cell(s.id)).join(' | ')} |`)
    }
  }
  mkdirSync(out, { recursive: true })
  writeFileSync(resolve(out, '結果.md'), L.join('\n') + '\n')
  writeFileSync(resolve(out, '原始數據.json'), JSON.stringify({ birth: BIRTH, start: START, endMonths: END_MONTHS, main, seeds, kids: KIDS, results: rs, cross }, null, 1))
}

/** 還沒做的階對到哪個工作項目（docs/成長系統設計.md §7） */
const WORK: Record<string, string> = {
  L3: '—（跟 T6 共用，未排）',
  L4: 'G-32',
  L6: 'G-12',
  L7: 'G-12',
  L8: 'G-13',
  L10: '—（未排）',
  L11: 'G-22',
  L12: 'G-23',
  L13: 'G-22',
  L14: '故事系統',
  L15: 'G-32',
  N4: 'G-14',
  N5: 'G-14',
  N6: 'G-25',
  N8: 'G-15',
  N9: 'G-25',
  N13: 'G-25',
  N14: 'G-16',
  N15: 'G-24',
  N16: 'G-24',
  T3: 'G-17',
  T4: 'G-17',
  T5: '—（未排）',
  T7: 'G-18',
  T8: 'G-18',
  T9: 'G-26',
  T14: 'G-27',
  T15: 'G-18',
  T16: 'G-26',
  T17: 'G-32',
  P3: 'G-19',
  P4: 'G-19',
  P5: 'G-19',
  P6: 'G-20',
  P7: 'G-20',
  P8: 'G-28',
  P9: 'G-29',
  P10: 'G-29',
  P11: 'G-29',
  P12: 'G-30',
  H4: 'G-21',
  H5: 'G-21',
  H7: '—（有內容，d-glyph 3 級）',
  H8: 'G-31',
  H9: 'G-31',
  H12: '—（未排）',
  H13: '故事系統',
  H14: 'G-21',
}

/** 報告上的日期：主行程沒有假時鐘，就是今天 */
const REPORT_DAY = new Date().toISOString().slice(0, 10)

async function main() {
  const kidArg = arg('kid')
  const smallArg = arg('small') as 'legacy' | 'new' | undefined
  if (kidArg) {
    const kid = KIDS.find((k) => k.id === kidArg)
    if (!kid) throw new Error(`沒有這種孩子：${kidArg}`)
    const r = await runKid(kid, smallArg ?? (legacySmallInFile() ? 'legacy' : 'new'))
    process.stdout.write(`\n${MARK}${JSON.stringify(r)}\n`)
    return
  }
  const t0 = performance.now()
  const main: 'legacy' | 'new' = smallArg ?? (legacySmallInFile() ? 'legacy' : 'new')
  const other: 'legacy' | 'new' = main === 'legacy' ? 'new' : 'legacy'
  const ids = arg('kids')?.split(',') ?? KIDS.map((k) => k.id)
  const seed0 = Number(arg('seed') ?? SEED0)
  const seeds = Array.from({ length: Number(arg('seeds') ?? 5) }, (_, i) => seed0 + i)
  const jobs: Job[] = ids.flatMap((kid) => seeds.map((seed) => ({ kid, small: main, seed, variant: '' as const })))
  // 對照組（只跑一般孩子）：沒指定 --small 時，小班段用另一種設定再跑一次；假設零件的速度判斷修好了再跑一次
  if (ids.includes('typical')) {
    if (!smallArg) jobs.push(...seeds.map((seed) => ({ kid: 'typical', small: other, seed, variant: 'small' as const })))
    if (!ARGS.includes('--no-fix')) jobs.push(...seeds.map((seed) => ({ kid: 'typical', small: main, seed, variant: 'fix' as const })))
  }
  const n = Math.max(1, Math.min(jobs.length, cpus().length - 1))
  console.log(`成長模擬：${ids.length} 種孩子 × ${seeds.length} 個種子，共 ${jobs.length} 次（同時 ${n} 個），3 歲 3 個月 → ${age(END_MONTHS)}；${smallName(main)}`)
  const rs = await pool(jobs, n, async (j) => {
    const r = await runChild(j)
    console.log(`  ${kidName(r.kid)}${r.variant ? `（${variantName(r)}）` : ''} 種子 ${r.seed}：${r.stats.days} 天、${r.stats.quizzes} 題，第一次答對 ${pct(r.stats.rate)}，違規 ${r.violations.length}，${Math.round(r.stats.ms / 1000)} 秒`)
    return r
  })
  const cross = crossChecks(rs)
  const out = resolve(arg('out') ?? 'docs/成長模擬')
  const seconds = (performance.now() - t0) / 1000
  writeReport(rs, cross, main, seeds, out, seconds)

  // ── 終端機的摘要：每種孩子一句話 ──
  console.log()
  for (const id of ids) {
    const xs = rs.filter((r) => r.kid === id && !r.variant)
    const done = (sid: StrandId) => medAge(xs.map((x) => x.exhausted[sid]?.allDone))
    console.log(`${kidName(id)}：現有內容完成的中位數——字母與讀 ${done('read')}、數數與數字 ${done('count')}、規律 ${done('pattern')}、程式 ${done('code')}、描寫 ${done('write')}`)
  }
  const vs = [...rs.flatMap((r) => r.violations.map((x) => `${kidName(r.kid)}${r.variant ? `（${variantName(r)}）` : ''} 種子 ${r.seed} ${x.date} ${x.what}：${x.detail}`)), ...cross.map((x) => `跨孩子 ${x.what}：${x.detail}`)]
  console.log(`\n斷言：${vs.length ? `${vs.length} 個違規` : '全部通過'}`)
  const byWhat = new Map<string, number>()
  for (const x of [...rs.flatMap((r) => r.violations), ...cross]) byWhat.set(x.what, (byWhat.get(x.what) ?? 0) + 1)
  for (const [w, c] of byWhat) console.log(`  ${String(c).padStart(4)}  ${w}`)
  for (const x of vs.slice(0, 20)) console.log(`  例：${x}`)
  console.log(`\n結果寫在 ${out}（結果.md、原始數據.json），共 ${Math.round(seconds)} 秒`)
  if (vs.length) process.exitCode = 1
}

await main()
