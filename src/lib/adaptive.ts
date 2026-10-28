import { db, getKV, setKV, today, type Attempt, type GameLevel, type Skill } from './db'
import { LETTER_GROUPS } from '../content/letters'
import { weightedPick } from './random'
import { beginProbe, probing, stepProbe } from './placement'
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
import { budgetOf, conceptIntros, noteIntro, type Budget, type Intro, type Intros } from './tracks'
import { conceptOf, levelConcepts, trackOf, type TrackId } from '../content/tracks'
import { weekTheme } from './settings'

// 技能熟練度與遊戲難度都很小，開機時整份載入記憶體，題目產生器就能同步取用
const skills = new Map<string, Skill>()
const levels = new Map<string, GameLevel>()

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
  ;(await db.levels.toArray()).forEach((l) => levels.set(l.key, l))
  ;((await db.attempts.orderBy('date').uniqueKeys()) as string[]).forEach((d) => playDates.add(d))

  const since = today(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000))
  const recent = await db.attempts.where('date').aboveOrEqual(since).sortBy('ts')
  for (const a of recent) if (a.phase === 'quiz' || a.phase == null) noteSpeed(a)
  const h = replayHintDelay(recent)
  hintDelay = h.ms
  hintRecent = h.recent
  load = loadCheck(recent, today())
  await applyLoadDrop()
  await loadIntros()
}

export function skill(key: string): Skill {
  return skills.get(key) ?? { key, box: 0, seen: 0, firstTry: 0, streak: 0, lastTs: 0 }
}

// ── 有玩的日子 ───────────────────────────────────────────────
/** 今天是第幾個有玩的日子 */
export const dayIndex = () => dayIndexOf(playDates, today())
const notePlayDay = () => playDates.add(today())

export const isDue = (key: string) => isDueAt(skill(key), dayIndex())

/** 今天到期、該複習的已熟技能（越久沒確認的越前面） */
export function dueSkills(): Skill[] {
  const day = dayIndex()
  return [...skills.values()].filter((s) => isDueAt(s, day)).sort((a, b) => overdueBy(b, day) - overdueBy(a, day))
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
 * - 探測題答錯、Sam 教豆豆：不改熟練度（前者還沒教過，後者是另一種題型）。
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
  skills.set(key, s)
  void db.skills.put(s)
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
    putLevel(stepProbe(cur, firstTry, maxLevel, opts?.skill))
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

/** 每個遊戲開始時呼叫：記一次遊玩；還沒校準過的遊戲在這裡開始探測（負擔過重的期間先不探測） */
export function markPlayed(game: string) {
  notePlayDay()
  let l: GameLevel = { ...(levels.get(game) ?? blankLevel(game)) }
  if (!load.overloaded) l = beginProbe(l) ?? l
  l.plays++
  l.lastTs = Date.now()
  putLevel(l)
}

export const lastPlayed = (game: string) => levels.get(game)?.lastTs ?? 0

/** 這個遊戲玩過幾次（markPlayed 之前讀，0 代表第一次玩，一定要示範） */
export const plays = (game: string) => levels.get(game)?.plays ?? 0

/** 從沒在「自己答」出現過的內容：要先教才能考 */
export const isNew = (key: string) => skill(key).seen === 0

/**
 * 示範規則（運筆、數數這類沒有教學卡的遊戲）：
 * 每個遊戲第一次玩一定示範；之後只示範還沒學過的內容，已經熟的不再重複。
 */
export const needsDemo = (firstPlay: boolean, key: string) => firstPlay || isNew(key)

// ── 負擔控制（PRD §5.10）────────────────────────────────────
export const loadState = () => load
/** 負擔過重：暫停教新內容 */
export const pauseNew = () => load.overloaded

/**
 * 連續 3 個有玩的日子第一次答對率都低於 6 成：每個遊戲降一級。
 * 一天只做一次（重新整理不會重複降）；同時暫停教新內容，直到有一天回到 6 成以上。
 */
async function applyLoadDrop() {
  if (!load.overloaded) return
  const t = today()
  if ((await getKV<string>('engine:loadDrop', '')) === t) return
  for (const l of levels.values()) if (l.level > 1) putLevel({ ...l, level: l.level - 1, up: 0, down: 0 })
  await setKV('engine:loadDrop', t)
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

async function loadIntros() {
  const saved = await getKV<{ v: number; rows: [string, Intro][] } | null>(INTRO_KEY, null)
  if (saved?.v === CONCEPT_VERSION) intros = new Map(saved.rows)
  else {
    intros = conceptIntros(await db.attempts.toArray())
    saveIntros()
  }
}

const saveIntros = () => void setKV(INTRO_KEY, { v: CONCEPT_VERSION, rows: [...intros] })

/** 每一筆作答（含教學卡）都呼叫：第一次出現的概念記下日期，之後的額度就算得到 */
export function noteAttempt(a: Pick<Attempt, 'game' | 'skill' | 'phase' | 'firstTryCorrect' | 'level'>) {
  if (noteIntro(intros, { ...a, date: today() }).length) saveIntros()
}

export const conceptIntrosNow = () => intros
export const budget = (t: TrackId): Budget => budgetOf(t, intros, today())

/**
 * 這個新內容現在能不能教：
 * - 負擔過重：全部暫停；
 * - 概念已經教過（例如動物主題裡的新動物、在別的遊戲學過的數字 3）：可以，只是同一個概念的新內容；
 * - 家長設定的本週主題：可以，那是學校正在教的，App 是幫忙複習；
 * - 其他新概念：看這條主線最近 7 天的額度（一般 2 個，剛開始玩的頭 7 天 5 個）。
 */
export function canIntroduce(game: string, key: string): boolean {
  if (load.overloaded) return false
  const c = conceptOf(game, key)
  if (!c || intros.has(c)) return true
  if (c === `theme:${weekTheme()}`) return true
  const t = trackOf(game)
  return !t || budget(t).left > 0
}

/**
 * 出題篩選：學過的內容，或（這局還沒教滿 max 個、而且 canIntroduce）可以教的新內容。
 * 遊戲裡找不到符合的題目時（例如第一次玩的遊戲，什麼都還沒學過），照常教一個，不考沒教過的。
 */
export const teachable = (game: string, taught: number, max: number) => (key: string) => !isNew(key) || (taught < max && canIntroduce(game, key))

/** 升到 next 級會不會全是沒教過的新概念、而這條線本週已經不能再教新的 */
function holdLevelUp(game: string, next: number): boolean {
  const cs = levelConcepts(game, next)
  if (!cs || cs.some((c) => intros.has(c))) return false
  const t = trackOf(game)
  return load.overloaded || (!!t && budget(t).left <= 0)
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
  const due = pool.filter((t) => isDueAt(skill(keyOf(t)), day))
  if (due.length) return weightedPick(due, (t) => 1 + overdueBy(skill(keyOf(t)), day))
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
  const due = (t: T) => isDueAt(skill(keyOf(t)), day)
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

/** 數字從 1–5 開始，熟了才延伸到 10、再到 20 */
export function unlockedNumbers(): number {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `num:${a + i}`)
  if (ratio(range(1, 5)) < 0.8) return 5
  if (ratio(range(6, 10)) < 0.8) return 10
  return 20
}

