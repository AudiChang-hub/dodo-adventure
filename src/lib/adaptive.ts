import { db, getKV, setKV, today, type Attempt, type GameLevel, type Skill } from './db'
import { LETTER_GROUPS } from '../content/letters'
import { weightedPick } from './random'
import { beginProbe, probing, stepProbe, stopProbe } from './placement'
import {
  HINT_DELAY_MAX,
  HINT_DELAY_START,
  HINT_DELAY_STEP,
  MASTERED_BOX,
  REVIEW_DAYS,
  SPEED_WINDOW,
  dayIndexOf,
  isDueAt,
  isProtege,
  isSlow,
  loadCheck,
  overdueBy,
  replayHintDelay,
  speedCat,
  type LoadState,
} from './engine'
import { budgetOf, conceptIntros, fastStrands, noteIntro, shiftDate, strandLoad, type Budget, type Intro, type Intros } from './tracks'
import { conceptOf, levelConcepts, trackOf, type TrackId } from '../content/tracks'
import { weekTheme } from './settings'
import { addLadderLog, contentWeeks, daysBetween, emptyLadder, getFrame, getGrowthState, isFirm, LADDER_V, stepLadder, type LadderState, type LadderView, type StepOpts, type UnitStat } from './growth'
import {
  BREAK_DAYS,
  CONTENT_WARN_WEEKS,
  FAST_BONUS,
  FAST_DAYS,
  FAST_RATE,
  LEVEL_RUNG,
  RUNGS,
  STRAND_MIN_ITEMS,
  STUCK_DAYS,
  entryRung,
  levelRung,
  rung as rungDef,
  strandOfSkill,
  unitOfSkill,
  unitsOf,
  type StrandId,
} from '../content/ladder'

// 技能熟練度與遊戲難度都很小，開機時整份載入記憶體，題目產生器就能同步取用
const skills = new Map<string, Skill>()
const levels = new Map<string, GameLevel>()
/** 熟練度改過幾次：lib/words.ts 從熟練度推算「教過哪些字」時拿來判斷要不要重算 */
let skillsVer = 0
export const skillsVersion = () => skillsVer

// ── 學習引擎的執行狀態：開機時從作答紀錄推算（第二批・工作線 A）──
/** 有玩的日子（作答紀錄的日期） */
const playDates = new Set<string>()
/** 每一類題目最近幾次「第一次就答對」的反應時間 */
const speed = new Map<string, number[]>()
let load: LoadState = { overloaded: false, days: [] }
let hintDelay = HINT_DELAY_START
let hintRecent: number[] = []

/** 開機時讀多久以內的紀錄來推算速度、負擔與延遲提示 */
const LOOKBACK_DAYS = 60

export async function loadAdaptive() {
  ;(await db.skills.toArray()).forEach((s) => skills.set(s.key, s))
  skillsVer++
  ;(await db.levels.toArray()).forEach((l) => levels.set(l.key, l))
  ;((await db.attempts.orderBy('date').uniqueKeys()) as string[]).forEach((d) => playDates.add(d))

  const since = today(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000))
  const recent = await db.attempts.where('date').aboveOrEqual(since).sortBy('ts')
  for (const a of recent) if (a.phase === 'quiz' || a.phase == null) noteSpeed(a)
  const h = replayHintDelay(recent)
  hintDelay = h.ms
  hintRecent = h.recent
  const t = today()
  const sl = strandLoad(recent, t, attemptStrand, STRAND_MIN_ITEMS)
  load = { ...loadCheck(recent, t), overloaded: sl.global }
  strandPause = new Set(sl.strands as StrandId[])
  fast = new Set(fastStrands(recent, t, attemptStrand, { days: FAST_DAYS, rate: FAST_RATE, minItems: STRAND_MIN_ITEMS }) as StrandId[])
  const before = [...playDates].filter((d) => d < t).sort()
  if (before.length && before[before.length - 1] < shiftDate(t, -BREAK_DAYS)) returnDay = t
  await applyLoadDrop()
  // 每週新概念額度、遷移、階梯：規則改版或第一次升級時，才讀一次全部的作答紀錄
  let all: Attempt[] | null = null
  const allAttempts = async () => (all ??= await db.attempts.toArray())
  await loadIntros(allAttempts)
  await loadTransfer(allAttempts)
  await loadLadder(allAttempts)
}

export function skill(key: string): Skill {
  return skills.get(key) ?? { key, box: 0, seen: 0, firstTry: 0, streak: 0, lastTs: 0 }
}

// ── 有玩的日子 ───────────────────────────────────────────────
/** 今天是第幾個有玩的日子 */
export const dayIndex = () => dayIndexOf(playDates, today())
const notePlayDay = () => playDates.add(today())

export const isDue = (key: string) => dueFor(key, dayIndex())

/** 今天到期、該複習的已熟技能（越久沒確認的越前面） */
export function dueSkills(): Skill[] {
  const day = dayIndex()
  return [...skills.values()].filter((s) => dueFor(s.key, day)).sort((a, b) => overdueBy(b, day) - overdueBy(a, day))
}

// ── 又對又快 ─────────────────────────────────────────────────
function noteSpeed(a: Pick<Attempt, 'game' | 'skill' | 'firstTryCorrect' | 'hintUsed' | 'responseMs' | 'metrics'>) {
  if (!a.firstTryCorrect || a.hintUsed || isProtege(a) || !(a.responseMs > 0)) return
  const cat = speedCat(a.game, a.skill)
  if (!cat) return
  speed.set(cat, [...(speed.get(cat) ?? []), a.responseMs].slice(-SPEED_WINDOW))
}

/** 這一類題目目前的速度樣本（家長區、除錯用） */
export const speedWindow = (game: string, skillKey: string) => speed.get(speedCat(game, skillKey) ?? '') ?? []

export interface SkillInput {
  game: string
  responseMs: number
  hintUsed: boolean
  metrics?: Record<string, number>
}

/**
 * 熟練度分 0–5 格（只採計「自己答」）：
 * - 第一次就答對，而且沒有比他自己這類題目的移動中位數明顯慢 → 往上一格；
 *   答對但明顯偏慢 → 維持原格（功文式：又對又快才算熟練）。
 * - 答錯 → 退一格。
 * - 已熟（3 格以上）的技能排到期複習：依序隔 1、2、4、7、14 個有玩的日子。
 *   到期那天答對就拉長間隔；答錯就降一格、隔天再考，間隔從頭開始。
 * - 延遲提示亮了才答對（softHint）：不算第一次答對，但也不退格。
 * - 探測題答錯、Sam 教豆豆：不改熟練度（前者是用比較難的題型考學過的內容，答錯不代表退步；後者是另一種題型）。
 */
export function recordSkill(key: string, firstTry: boolean, info?: SkillInput) {
  const m = info?.metrics
  if (m?.protege) return
  if (m?.probe && !firstTry) return
  notePlayDay()
  const s = { ...skill(key) }
  const day = dayIndex()
  const wasMastered = s.box >= MASTERED_BOX
  const due = wasMastered && isDueAt(s, day)
  const slow = !!info && firstTry && isSlow(speedWindow(info.game, key), info.responseMs)
  s.seen++
  s.lastTs = Date.now()
  if (firstTry) {
    s.firstTry++
    s.streak++
    if (slow) s.slow = (s.slow ?? 0) + 1
    else s.box = Math.min(5, s.box + 1)
  } else {
    s.streak = 0
    if (!m?.softHint) s.box = Math.max(0, s.box - 1)
  }
  if (info) noteSpeed({ ...info, skill: key, firstTryCorrect: firstTry })

  // 到期複習的排程
  if (s.box >= MASTERED_BOX) {
    if (!wasMastered) {
      s.rev = 0
      s.due = day + REVIEW_DAYS[0]
    } else if (!firstTry) {
      s.rev = 0
      s.due = day + 1
      if (due) s.lastReview = { day, ts: s.lastTs, result: 'no' }
    } else if (due) {
      const rev = slow ? (s.rev ?? 0) : Math.min(REVIEW_DAYS.length - 1, (s.rev ?? 0) + 1)
      s.rev = rev
      s.due = day + REVIEW_DAYS[rev]
      s.lastReview = { day, ts: s.lastTs, result: slow ? 'slow' : 'ok' }
    }
  } else if (wasMastered) {
    // 複習答錯、掉出已熟：回到一般的「越不熟越常出」，重新熟了再排複習
    s.lastReview = due ? { day, ts: s.lastTs, result: 'no' } : s.lastReview
    delete s.rev
    delete s.due
  }
  // 穩固（成長系統 §1.4）：第一次通過 2 次到期複習時記下來；掉出已熟才拿掉
  if (s.box < MASTERED_BOX) delete s.firmAt
  else if (!s.firmAt && isFirm(s)) s.firmAt = s.lastTs
  skills.set(key, s)
  skillsVer++
  void db.skills.put(s)
  doneReteach(key)
}

export const mastered = (key: string) => skill(key).box >= MASTERED_BOX

// ── 遊戲難度與程度校準 ─────────────────────────────────────
const blankLevel = (game: string): GameLevel => ({ key: game, level: 1, up: 0, down: 0, plays: 0, lastTs: 0 })

function putLevel(l: GameLevel) {
  levels.set(l.key, l)
  void db.levels.put(l)
}

export function level(game: string): number {
  return levels.get(game)?.level ?? 1
}

/** 這個遊戲正在做程度校準的探測（第一次玩的前 2–3 題） */
export const isProbing = (game: string) => probing(levels.get(game))

export const gameLevel = (game: string): GameLevel | undefined => levels.get(game)

/**
 * 維持約七到八成的答對率：連續 3 題第一次就答對升一級，連續 2 題沒答對降一級。
 * 回傳是否升降級，讓畫面可以給一句鼓勵。
 *
 * 程度校準中（第一次玩）：這一題是探測題，改用階梯法（答對升、答錯降），不給升級語音。
 * opts.probe 為 false 時（例如教完之後的自己答）不算探測題；沒給就照遊戲狀態判斷，
 * 這樣數數、照順序這些沒有改程式的遊戲也會自動校準。
 */
export function reportLevel(game: string, firstTry: boolean, maxLevel: number, opts?: { probe?: boolean; skill?: string }): 'up' | 'down' | null {
  const cur = levels.get(game) ?? blankLevel(game)
  if (probing(cur) && opts?.probe !== false) {
    // 這一回合已經教了新概念、又答錯：停在這一級，不往下探。低一級可能沒有學過的內容，只好再教一個，一回合就 2 個新概念（FRAME-8）
    const stop = !firstTry && roundNew.size >= newPerRound()
    putLevel(stop ? stopProbe(cur, firstTry, opts?.skill) : stepProbe(cur, firstTry, maxLevel, opts?.skill))
    return null
  }
  const l = { ...cur }
  let change: 'up' | 'down' | null = null
  if (firstTry) {
    l.up++
    l.down = 0
    if (l.up >= 3 && l.level < maxLevel) {
      l.up = 0
      // 升級就是換一批新內容的遊戲（運筆、箭頭卡…）：這條線本週的新概念額度用完，先在這一級多練，下週再升
      if (holdLevelUp(game, l.level + 1)) {
        putLevel(l)
        return null
      }
      l.level++
      change = 'up'
      noteLevelIntro(game, l.level)
    }
  } else {
    l.down++
    l.up = 0
    if (l.down >= 2 && l.level > 1) {
      l.level--
      l.down = 0
      change = 'down'
    }
  }
  putLevel(l)
  return change
}

/**
 * 升級就是換一批新內容的遊戲（運筆小路、連點成圖、描數字字母的「新的一級」，排順序的 4 張圖、開車的左右…）升了一級：
 * 新的一級當下就記成這條線的新概念（全是新的才記，記第一個）。
 * 原本要等下一次在新的一級作答才記，那時額度可能已經被別的用掉，或剛好是長時間沒玩回來的第一天（G-5 成長模擬）。
 * 升級前 holdLevelUp 已經看過額度、這一回合有沒有教過新概念。
 */
function noteLevelIntro(game: string, lv: number) {
  const cs = levelConcepts(game, lv)
  const c = cs?.[0]
  const t = trackOf(game)
  if (!c || !t || cs.some((x) => intros.has(x))) return
  intros.set(c, { date: today(), track: t, taught: true })
  saveIntros()
  roundNew.add(c)
}

/**
 * 這個遊戲練得到的內容，孩子學過任何一個了沒（不管在哪個遊戲學的）。
 * 什麼都還沒學過就不做程度校準：探測題只能考學過的，找不到就照常教，探測答錯降級後又找不到，就會一回合教 2 個新概念（FRAME-8）。
 */
function learnedFor(game: string): boolean {
  for (const s of skills.values()) {
    if (s.seen > 0 && unitOfSkill(s.key)?.unit.games.includes(game)) return true
  }
  return false
}

/** 每個遊戲開始時呼叫：記一次遊玩；還沒校準過的遊戲在這裡開始探測（負擔過重的期間先不探測；這個遊戲的內容什麼都還沒學過就不探測） */
export function markPlayed(game: string) {
  notePlayDay()
  roundNew = new Set()
  refreshLadder()
  let l: GameLevel = { ...(levels.get(game) ?? blankLevel(game)) }
  if (!load.overloaded) {
    const p = beginProbe(l)
    // 什麼都還沒學過：從第 1 級照教學順序走，之後也不再探測（升級規則會帶到該有的難度）
    if (p?.probe && !learnedFor(game)) l = { ...l, placed: { ts: Date.now(), from: l.level, to: l.level, steps: [], skipped: true } }
    else if (p) l = p
  }
  l.plays++
  l.lastTs = Date.now()
  putLevel(l)
}

export const lastPlayed = (game: string) => levels.get(game)?.lastTs ?? 0

/** 直接設定遊戲的級數，不經過升級規則（模擬「改版前就已經升到這一級」的舊資料用：scripts/sim-teach.ts --old-glyph） */
export function restoreLevel(game: string, lv: number) {
  putLevel({ ...(levels.get(game) ?? blankLevel(game)), level: lv })
}

/** 這個遊戲玩過幾次（markPlayed 之前讀，0 代表第一次玩，一定要示範） */
export const plays = (game: string) => levels.get(game)?.plays ?? 0

/**
 * 從沒在「自己答」出現過的內容：要先教才能考。
 * 教學卡、一起練都不算（seen 只在自己答時加一）；教完之後的那一題自己答做完，才算學過。
 * 探測題只出學過的內容（games/pick.ts），所以不會有「探測猜對就算學過」的情況。
 */
export const isNew = (key: string) => skill(key).seen === 0 || needsReteach(key)

/**
 * 示範規則（運筆、數數這類沒有教學卡的遊戲）：
 * 每個遊戲第一次玩一定示範；之後只示範還沒學過的內容，已經熟的不再重複。
 */
export const needsDemo = (firstPlay: boolean, key: string) => firstPlay || isNew(key)

// ── 負擔控制（PRD §5.10；成長系統 §1.4 改成依支線）──────────────
export const loadState = () => load
/** 整天都很差、或長時間沒玩回來的第一天：全部暫停教新內容 */
export const pauseNew = () => load.overloaded || returnDay === today()

/** 遊戲現在這一級屬於哪條支線 */
const gameStrand = (l: GameLevel): StrandId | null => {
  const r = levelRung(l.key, l.level) ?? entryRung(l.key)
  return r ? rungDef(r)!.strand : null
}

/** 依支線的負擔控制：這一段暫停已經降過級的支線 */
const STRAND_DROP_KEY = 'engine:strandDrop'

/**
 * 連續 3 個有玩的日子第一次答對率都低於 6 成：
 * - 錯的散在每一條支線（整天都很差，例如生病）：每個遊戲降一級；
 * - 錯的集中在某幾條支線：只降那幾條支線的遊戲。
 * 某條支線自己最近 3 個有玩到它的日子都低於 6 成，也只降那一條。
 * 一天只做一次（重新整理不會重複降）；同時暫停教新內容（全部、或那幾條），直到有一天回到 6 成以上。
 * 只降那幾條支線的：同一段暫停只降一次（engine:strandDrop 記著這一段已經降過的支線）。
 * 每天降的話，開車會從程式的級數一路降到上下左右的級數、不再出程式題，程式支線就等不到回到 6 成的日子（G-5 成長模擬）。
 */
async function applyLoadDrop() {
  const t = today()
  if ((await getKV<string>('engine:loadDrop', '')) === t) return
  const dropped = await getKV<string[]>(STRAND_DROP_KEY, [])
  const fresh = [...strandPause].filter((s) => !dropped.includes(s))
  if (load.overloaded || fresh.length) {
    for (const l of levels.values()) {
      if (l.level <= 1) continue
      const s = gameStrand(l)
      if (load.overloaded || (s && fresh.includes(s))) putLevel({ ...l, level: l.level - 1, up: 0, down: 0 })
    }
    await setKV('engine:loadDrop', t)
  }
  // 暫停解除的支線拿掉：下一段暫停再降一次
  if (dropped.length || strandPause.size) await setKV(STRAND_DROP_KEY, [...strandPause])
}


// ── 每條主線每週的新概念額度（PRD §5.10）──────────────────────
/**
 * 每個概念（例如字母音 b、數字 7、詞彙主題「交通工具」，定義見 content/tracks.ts）第一次出現的日期。
 * 存在 KV 裡，開機不用重讀全部作答紀錄；規則改版（CONCEPT_VERSION）時才從作答紀錄重建一次。
 * 不另外同步到雲端：家長區直接從作答紀錄算（lib/tracks.ts 的 conceptIntros），結果一樣。
 */
const INTRO_KEY = 'engine:concepts'
const CONCEPT_VERSION = 1
let intros: Intros = new Map()

async function loadIntros(all: () => Promise<Attempt[]>) {
  const saved = await getKV<{ v: number; rows: [string, Intro][] } | null>(INTRO_KEY, null)
  if (saved?.v === CONCEPT_VERSION) intros = new Map(saved.rows)
  else {
    intros = conceptIntros(await all())
    saveIntros()
  }
}

const saveIntros = () => void setKV(INTRO_KEY, { v: CONCEPT_VERSION, rows: [...intros] })

type NoteInput = Pick<Attempt, 'game' | 'skill' | 'phase' | 'firstTryCorrect' | 'level'> & Partial<Pick<Attempt, 'hintUsed' | 'metrics'>>

/** 每一筆作答（含教學卡）都呼叫：第一次出現的概念記下日期，之後的額度就算得到；自己答第一次就答對的，記下是哪個遊戲（遷移） */
export function noteAttempt(a: NoteInput) {
  const added = noteIntro(intros, { ...a, date: today() })
  if (added.length) {
    saveIntros()
    for (const c of added) if (intros.get(c)?.taught) roundNew.add(c)
  }
  noteTransfer(a)
}

export const conceptIntrosNow = () => intros
/** 每條線每週的新概念額度：照年段外框的上限（FRAME-8：小班 2、中班 2–3、大班 3） */
export const weeklyNew = () => getFrame().weeklyConcepts[1]
export const budget = (t: TrackId): Budget => budgetOf(t, intros, today(), weeklyNew())

/**
 * 這個新內容現在能不能教：
 * - 負擔過重（整天都很差）、長時間沒玩回來的第一天：全部暫停；
 * - 這個內容所在的階還沒開放（前置條件還沒到，D1、LOAD-4）：不教；
 * - 這條支線負擔過重、或回補中：暫停這一條；
 * - 概念已經教過（例如動物主題裡的新動物、在別的遊戲學過的數字 3）：可以，只是同一個概念的新內容；
 * - 這一回合已經教了一個新概念：不再教第二個（FRAME-8：三個年段一回合都最多 1 個新概念）；
 * - 家長設定的本週主題：可以，那是學校正在教的，App 是幫忙複習；
 * - 其他新概念：看這條主線最近 7 天的額度（一般 2 個，剛開始玩的頭 7 天 5 個）；太順的支線多 1 個。
 */
export function canIntroduce(game: string, key: string): boolean {
  if (pauseNew()) return false
  // 回補中掉出已熟、要重教一次的：不是新概念，照教
  if (needsReteach(key)) return true
  const u = unitOfSkill(key)
  if (u && !rungOpen(u.rung)) return false
  const s = u ? rungDef(u.rung)!.strand : null
  if (s && strandPaused(s)) return false
  const c = conceptOf(game, key)
  if (!c || intros.has(c)) return true
  if (roundNew.size >= newPerRound()) return false
  if (c === `theme:${weekTheme()}`) return true
  const t = trackOf(game)
  if (!t) return true
  const b = budget(t)
  return b.left > 0 || (!!s && fast.has(s) && b.used.length < b.limit + FAST_BONUS)
}

// ── 一回合的新概念（FRAME-8）──────────────────────────────────
/** 這一回合（markPlayed 到下一次 markPlayed）教了哪些新概念 */
let roundNew = new Set<string>()
/** 一回合最多幾個新概念：照年段的外框（三段都是 1） */
const newPerRound = () => Math.max(1, getFrame().newPerRound)
export const roundNewConcepts = () => [...roundNew]

// ── 遷移：同一個技能點在哪些遊戲第一次就答對過 ─────────────────
const TRANSFER_KEY = 'engine:transfer'
const TRANSFER_VERSION = 1
let okGames = new Map<string, Set<string>>()

async function loadTransfer(all: () => Promise<Attempt[]>) {
  const saved = await getKV<{ v: number; rows: [string, string[]][] } | null>(TRANSFER_KEY, null)
  if (saved?.v === TRANSFER_VERSION) okGames = new Map(saved.rows.map(([k, g]) => [k, new Set(g)]))
  else {
    okGames = new Map()
    for (const a of await all()) noteTransfer(a, false)
    saveTransfer()
  }
}

const saveTransfer = () => void setKV(TRANSFER_KEY, { v: TRANSFER_VERSION, rows: [...okGames].map(([k, g]) => [k, [...g]]) })

function noteTransfer(a: NoteInput, save = true) {
  if (!a.firstTryCorrect || a.hintUsed || (a.phase ?? 'quiz') !== 'quiz' || a.metrics?.probe || a.metrics?.protege) return
  const set = okGames.get(a.skill) ?? new Set<string>()
  if (set.has(a.game)) return
  okGames.set(a.skill, set.add(a.game))
  if (save) saveTransfer()
}

// ── 支線與階梯（成長系統 §1.3、§1.4、§5.4）──────────────────────
const LADDER_KEY = 'ladder'
// 開機讀進來之前是空的（不在模組頂層呼叫 growth.ts：它和這個檔案在引用循環裡）
let ladder: LadderState = { v: 0, rungs: {} }
let view: LadderView | null = null
let viewAt = -1
/** 這次開機算過階梯了沒（模擬裡沒有開機，第一次用到時才算） */
let stepped = false

/** 作答屬於哪條支線 */
const attemptStrand = (a: Pick<Attempt, 'skill'>) => strandOfSkill(a.skill)
/** 依支線的負擔控制：答錯集中在這幾條支線（整天都很差時是 load.overloaded） */
let strandPause = new Set<StrandId>()
/** 太順的支線：每週新概念額度 +1 */
let fast = new Set<StrandId>()
/** 超過 14 天沒玩回來的那一天：這一天不教新內容 */
let returnDay = ''

const facts = () => ({ skills, okGames })

/**
 * 依現在的熟練度往前走一步（開機、每一回合開始時）：該開的階開、完成的記下來、掉了的開始回補，寫進時間軸。
 * migrate：舊資料第一次開（kv 裡還沒有階梯），用現有的作答紀錄算出每條支線在第幾階，時間軸標成「補記」。
 */
function stepNow(migrate?: StepOpts['migrate']) {
  const r = stepLadder(ladder, facts(), today(), { locks: getGrowthState().locks, migrate })
  const changed = JSON.stringify(r.state) !== JSON.stringify(ladder)
  ladder = r.state
  view = r.view
  viewAt = skillsVer
  stepped = true
  if (changed) void setKV(LADDER_KEY, ladder)
  if (r.log.length) void addLadderLog(r.log).catch(() => {})
}

export const refreshLadder = () => stepNow()

async function loadLadder(all: () => Promise<Attempt[]>) {
  const saved = await getKV<LadderState | null>(LADDER_KEY, null)
  if (saved?.v === LADDER_V) {
    ladder = saved
    stepNow()
    return
  }
  // 舊資料升級：每一階第一次、最後一次作答的日期（補記用）
  const first = new Map<string, string>()
  const last = new Map<string, string>()
  for (const a of await all()) {
    const u = unitOfSkill(a.skill)
    if (!u) continue
    if (!first.has(u.rung) || a.date < first.get(u.rung)!) first.set(u.rung, a.date)
    if (!last.has(u.rung) || a.date > last.get(u.rung)!) last.set(u.rung, a.date)
  }
  // G-33 的暫時門檻已經開過描字母的，描字母那一階算開放（開了不收回）
  const glyphOpen = await getKV('glyph:lettersOpen', false)
  ladder = emptyLadder()
  stepNow({ first: (r) => first.get(r), last: (r) => last.get(r), open: glyphOpen ? ['H7'] : [] })
}

/** 現在的階梯（熟練度變了就重新整理，不寫時間軸；寫時間軸只在回合開始的 refreshLadder） */
export function ladderNow(): LadderView {
  if (!view || viewAt !== skillsVer) {
    view = stepLadder(ladder, facts(), today(), { locks: getGrowthState().locks }).view
    viewAt = skillsVer
  }
  return view
}

/** 這一階開了沒（記下來的才算：一回合中間不會突然開） */
export function rungOpen(id: string): boolean {
  if (!stepped) stepNow()
  return !!ladder.rungs[id]?.open
}

/** 這條支線暫停教新內容：負擔過重、回補中 */
export const strandPaused = (s: StrandId) => strandPause.has(s) || RUNGS.some((r) => r.strand === s && reopenOf(r.id))

const reopenOf = (id: string) => {
  const ro = ladder.rungs[id]?.reopen
  return ro && today() < ro.until ? ro : undefined
}

/** 回補中、掉出已熟的技能點：重跑一次短教學卡（isNew 當作新的），自己答過一次就拿掉 */
function needsReteach(key: string): boolean {
  const u = unitOfSkill(key)
  return !!u && !!reopenOf(u.rung)?.reteach.includes(key)
}

function doneReteach(key: string) {
  const u = unitOfSkill(key)
  const ro = u && reopenOf(u.rung)
  if (!ro || !ro.reteach.includes(key)) return
  ro.reteach = ro.reteach.filter((k) => k !== key)
  void setKV(LADDER_KEY, ladder)
}

/**
 * 回補中、但遊戲現在的級數已經不出的內容：掉出已熟的技能點（描數字字母升到字母的級數就不再出零件）。
 * 這些混進這一局（games/draw/glyphs.ts 的 planGlyph），不然回補永遠練不到、回不來（G-5 成長模擬：零件連續回補 61 次）。
 * 運筆小路、連點成圖這種高一級包含低一級的遊戲（NESTED_GAMES）不需要：高一級穩固了低的也算。
 */
export function reopenExtras(game: string, lv: number): string[] {
  const rs = LEVEL_RUNG[game]
  if (!rs) return []
  const here = new Set(rs.slice(lv - 1))
  const below = [...new Set(rs.slice(0, lv - 1))].filter((r) => !here.has(r) && reopenOf(r))
  const v = below.length ? ladderNow() : null
  return below.flatMap((r) => v!.rungs.get(r)!.units.filter((u) => !u.mastered).flatMap((u) => u.skills.filter((k) => skill(k).seen > 0)))
}

/** 回補中的階：到期複習加倍（間隔減半） */
function dueFor(key: string, day: number): boolean {
  const s = skill(key)
  if (isDueAt(s, day)) return true
  if (s.box < MASTERED_BOX || s.due == null) return false
  const u = unitOfSkill(key)
  if (!u || !reopenOf(u.rung)) return false
  return s.due - Math.floor(REVIEW_DAYS[s.rev ?? 0] / 2) <= day
}

/**
 * 卡住的階裡還沒穩固的內容：開了滿 3 週（STUCK_DAYS）還沒完成的階，這個技能點所在的單位還沒穩固。
 * 挑題時和到期複習輪流出（pickTarget）：一回合只有 2–3 題的遊戲（連點成圖、描數字字母），名額常常全被已熟內容的到期複習用掉，
 * 還在學的圖、字一兩個月才輪到一次，隔太久又忘，那一階永遠穩固不了（G-5 成長模擬：連點第 3、4 級、零件第 2 組到 6 歲都沒穩固）。
 * 穩固的標準不變（家長決定「都練穩才開」），只是讓它們練得到。
 */
function stalled(key: string): UnitStat | null {
  const u = unitOfSkill(key)
  const mk = u && ladder.rungs[u.rung]
  if (!u || !mk?.open || mk.done || daysBetween(mk.open, today()) < STUCK_DAYS) return null
  const x = ladderNow().rungs.get(u.rung)?.units.find((y) => y.id === u.unit.id)
  return x && !x.firm ? x : null
}

/**
 * 卡住的階先練的機會（pickTarget）。只挑單位還沒熟的：已經熟了、只差通過到期複習的單位，提早練不會更快穩固，
 * 它們在到期複習裡優先（STALLED_DUE）。
 */
const STALLED_SHARE = 0.5
/** 到期複習裡，卡住的階的權重 */
const STALLED_DUE = 4

/**
 * 卡住的階先練哪一個：隨機挑一個單位，單位裡挑最接近穩固（格數最高）的那一個。
 * 一個單位只要有一個技能點穩固就算穩固（11–15 只要穩住其中一個數字），集中練比十個數字輪流快得多。
 */
function focusPick<T>(items: readonly T[], keyOf: (t: T) => string): T {
  const units = new Map<string, T[]>()
  for (const t of items) {
    const id = unitOfSkill(keyOf(t))!.unit.id
    units.set(id, [...(units.get(id) ?? []), t])
  }
  const group = [...units.values()][Math.floor(Math.random() * units.size)]
  const top = Math.max(...group.map((t) => skill(keyOf(t)).box))
  return weightedPick(group.filter((t) => skill(keyOf(t)).box === top), () => 1)
}

/** 這個遊戲練得到卡住的階（排課時比較容易排到，lib/tracks.ts 的 planDay） */
export function stalledGame(game: string): boolean {
  const t = today()
  return RUNGS.some((r) => {
    const mk = ladder.rungs[r.id]
    return r.games.includes(game) && !r.free && !!mk?.open && !mk.done && unitsOf(r.id).length > 0 && daysBetween(mk.open, t) >= STUCK_DAYS
  })
}

/** 依支線的狀態（家長區、除錯用） */
export const strandLoadNow = () => ({ global: load.overloaded, strands: [...strandPause], fast: [...fast], returning: returnDay === today() })

/** 一個概念屬於哪條支線（內容庫存用）：單位的 id 就是概念；描數字字母的 lv: 概念看那一級屬於哪一階 */
function conceptStrand(c: string): StrandId | null {
  const lv = /^lv:(.+):(\d+)$/.exec(c)
  if (lv) {
    const r = levelRung(lv[1], Number(lv[2]))
    if (r) return rungDef(r)!.strand
  }
  for (const r of RUNGS) if (unitsOf(r.id).some((u) => u.id === c)) return r.strand
  return null
}

export interface Stock {
  strand: StrandId
  /** 還沒出現過的新內容 */
  left: number
  /** 照最近 4 週的速度，大約還能撐幾週（算不出來是 null） */
  weeks: number | null
  /** 快用完了，要提醒家長（§1.1） */
  soon: boolean
}

/** 內容庫存：每條支線的現有內容大約還能撐幾週（§1.1、§4.1） */
export function contentStock(): Stock[] {
  const v = ladderNow()
  const by = new Map<StrandId, string[]>()
  for (const [c, x] of intros) {
    const s = conceptStrand(c)
    if (s) by.set(s, [...(by.get(s) ?? []), x.date])
  }
  return v.strands
    .filter((s) => s.left > 0 || s.out)
    .map((s) => {
      const weeks = contentWeeks(s.left, by.get(s.id) ?? [], today())
      return { strand: s.id, left: s.left, weeks, soon: s.out || (weeks !== null && weeks <= CONTENT_WARN_WEEKS) }
    })
}

/**
 * 出題篩選：學過的內容，或（這局還沒教滿 max 個、而且 canIntroduce）可以教的新內容。
 * 遊戲裡找不到符合的題目時（例如第一次玩的遊戲，什麼都還沒學過），照常教一個，不考沒教過的。
 */
export const teachable = (game: string, taught: number, max: number) => (key: string) => !isNew(key) || (taught < max && canIntroduce(game, key))

/**
 * 先不升級的情況：
 * - 下一級屬於還沒開放的階（例如上下還沒穩固，開車先不升到有左右的 2 級；LOAD-4）；
 * - 下一級全是沒教過的新概念，而這條線本週已經不能再教新的，或這一回合已經教過一個新概念（FRAME-8）。
 */
function holdLevelUp(game: string, next: number): boolean {
  const r = levelRung(game, next)
  if (r && !rungOpen(r)) return true
  const cs = levelConcepts(game, next)
  if (!cs || cs.some((c) => intros.has(c))) return false
  const t = trackOf(game)
  const s = r ? rungDef(r)!.strand : null
  return pauseNew() || (!!s && strandPaused(s)) || roundNew.size >= newPerRound() || (!!t && budget(t).left <= 0)
}

// ── 延遲提示（benchmark 手法 3）──────────────────────────────
/** 學習中的題目：唸完題目後幾毫秒，正確答案才淡淡亮起 */
export const hintDelayMs = () => hintDelay

/**
 * 每一題延遲提示的結果：waited = 光亮了之後很快才點（孩子在等光）。
 * 最近 5 題有 3 題在等光，就把延遲拉長 1 秒（和 engine.replayHintDelay 同一套規則）。
 */
export function noteHintWait(waited: boolean) {
  hintRecent = [...hintRecent, waited ? 1 : 0].slice(-5)
  if (hintRecent.reduce((s, x) => s + x, 0) >= 3 && hintDelay < HINT_DELAY_MAX) {
    hintDelay = Math.min(HINT_DELAY_MAX, hintDelay + HINT_DELAY_STEP)
    hintRecent = []
  }
}

// ── 挑題 ─────────────────────────────────────────────────────
let targetFilter: ((key: string) => boolean) | null = null

/**
 * 在 run 裡面呼叫的 pickTarget 只挑 ok(key) 為真的內容（沒有符合的就照常挑）。
 * 一局已經教滿兩個新內容時，用它讓其餘題目都是複習題。
 */
export function withTargetFilter<T>(ok: (key: string) => boolean, run: () => T): T {
  targetFilter = ok
  try {
    return run()
  } finally {
    targetFilter = null
  }
}

/**
 * 到期的已熟內容優先（到期複習）；沒有到期的，越不熟、越久沒練的越容易被選中。
 * 並避開剛剛才出過的。
 */
export function pickTarget<T>(items: readonly T[], keyOf: (t: T) => string, avoid: T[] = []): T {
  let pool = items.length > avoid.length ? items.filter((t) => !avoid.includes(t)) : items
  if (!pool.length) pool = [...items]
  if (targetFilter) {
    const ok = targetFilter
    const fit = pool.filter((t) => ok(keyOf(t)))
    // 避開剛出過的之後沒有可複習的，就放寬「避開」的限制，也不要考沒教過的
    const loose = fit.length ? fit : items.filter((t) => ok(keyOf(t)))
    if (loose.length) pool = loose
  }
  const day = dayIndex()
  const due = pool.filter((t) => dueFor(keyOf(t), day))
  // 卡住的階還沒穩固的內容：一半的機會先練它，不然到期複習把名額用光、練習又分散在一堆內容上（見 stalled）
  const push = pool.filter((t) => !due.includes(t) && stalled(keyOf(t))?.mastered === false)
  if (push.length && Math.random() < STALLED_SHARE) return focusPick(push, keyOf)
  // 到期複習裡，卡住的階的先（穩固要通過 2 次到期複習，到期那天沒輪到就又要等）
  if (due.length) return weightedPick(due, (t) => (1 + overdueBy(skill(keyOf(t)), day)) * (stalled(keyOf(t)) ? STALLED_DUE : 1))
  const now = Date.now()
  return weightedPick(pool, (t) => {
    const s = skill(keyOf(t))
    const staleness = s.lastTs ? Math.min(3, (now - s.lastTs) / 86_400_000) : 2
    return Math.pow(6 - s.box, 1.6) + staleness
  })
}

/** 主題外有到期複習、主題裡沒有時，這一題先複習的機會 */
const REVIEW_OVER_THEME = 0.5

/**
 * 主題式冒險：先從主題的內容（prefer，必須是 items 裡的同一批東西）挑，挑法和 pickTarget 一樣（到期複習優先、越不熟越常出）。
 * 退回全部內容的情況（學習的正確性比主題純度重要）：
 * - 主題裡沒有現在能出的：例如 withTargetFilter 規定這局只出學過的，主題的東西卻都還沒教過，或剛剛才出過；
 * - 主題外有到期該複習的、主題裡沒有：一半的機會先複習，到期複習不會因為換主題就一直往後延。
 */
export function pickPreferred<T>(prefer: readonly T[], items: readonly T[], keyOf: (t: T) => string, avoid: T[] = []): T {
  const ok = targetFilter
  // 剛出過的主題內容也先避開：主題只有一兩個能出的時候（一個音、一張圖），就和一般的輪流
  const mine = items.filter((t) => prefer.includes(t) && !avoid.includes(t))
  const fav = ok ? mine.filter((t) => ok(keyOf(t))) : mine
  if (!fav.length) {
    // 篩選條件連主題外也沒有符合的（例如「開局先出已熟的」但還沒有任何已熟的）：pickTarget 本來就會忽略它，那就留在主題裡挑
    if (ok && mine.length && !items.some((t) => ok(keyOf(t)))) return pickTarget(mine, keyOf)
    return pickTarget(items, keyOf, avoid)
  }
  const day = dayIndex()
  const due = (t: T) => dueFor(keyOf(t), day)
  const dueOut = items.some((t) => !fav.includes(t) && (!ok || ok(keyOf(t))) && due(t))
  if (dueOut && !fav.some(due) && Math.random() < REVIEW_OVER_THEME) return pickTarget(items, keyOf, avoid)
  return pickTarget(fav, keyOf)
}

const ratio = (keys: string[]) => keys.filter(mastered).length / keys.length

/** 字母一組一組解鎖：前面每一組都有八成熟了才開下一組 */
export function unlockedLetters(): string[] {
  const out: string[] = []
  for (const g of LETTER_GROUPS) {
    out.push(...g)
    if (ratio([...g].map((l) => `letter:${l}`)) < 0.8) break
  }
  return out
}

/** 穩固（成長系統 §1.4，lib/growth.ts 的 isFirm） */
const firm = (key: string) => isFirm(skill(key))

/**
 * 數字從 1–5 開始，熟了才延伸到 10、再到 20（成長系統 N2 → N3，看能力不看年紀）。
 * 1–10 是 3–4 歲的數字範圍（T-49 LOAD-2）；11–20 要等 6–10 有八成「穩固」才開，
 * 不會因為一局裡連對幾題就冒出 11 以上。已經開過 11–20（學過其中一個）的不收回。
 */
export function unlockedNumbers(): number {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `num:${a + i}`)
  if (ratio(range(1, 5)) < 0.8) return 5
  const opened = range(11, 20).some((k) => skill(k).seen > 0)
  if (!opened && range(6, 10).filter(firm).length / 5 < 0.8) return 10
  return 20
}

