import { phaseOf, today, type Attempt, type StationId } from './db'
import { isProtege, isProbe, isScored, loadCheck } from './engine'
import { fnv1a } from './hash'
import { TRACKS, conceptOf, levelConcept, trackConcepts, trackOf, type TrackId } from '../content/tracks'

/**
 * 四條能力主線的純函式（PRD §5.10）：孩子端的排課、每週新概念額度，和家長區的雷達圖共用。
 * 都只從作答紀錄推算（家長在手機上看雲端資料也算得出一樣的結果），沒有任何畫面或資料庫的相依。
 * 排課只回答「哪條線多排、排哪個遊戲」，不寫死站點順序：之後改成主題式冒險（一個活動混好幾條線）也能直接用 trackNeeds。
 */

// ── 日期 ─────────────────────────────────────────────────────
/** YYYY-MM-DD 往前／往後 n 天（用本地時間，和 today() 一致） */
export function shiftDate(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return today(new Date(y, m - 1, d + n))
}

// ── 新概念的引入紀錄 ─────────────────────────────────────────
/** 每條主線一週（最近 7 天）最多教幾個新概念 */
export const NEW_PER_WEEK = 2
/** 這條主線剛開始玩的頭 7 天：多給一點新概念，新的孩子才有東西可以玩 */
export const STARTER_NEW = 5
export const STARTER_DAYS = 7

export interface Intro {
  /** 第一次出現的日期 */
  date: string
  track: TrackId
  /** 是教了才會的（第一次出現是教學卡、示範、或答錯）。第一次出現就自己答對的，代表本來就會，不佔額度 */
  taught: boolean
}
export type Intros = Map<string, Intro>

type IntroAttempt = Pick<Attempt, 'game' | 'skill' | 'phase' | 'firstTryCorrect' | 'level' | 'date'>

/** 一筆作答碰到的概念：內容本身的概念，加上「難度就是內容」的遊戲的那一級 */
export function attemptConcepts(a: Pick<Attempt, 'game' | 'skill' | 'level'>): string[] {
  const out: string[] = []
  const c = conceptOf(a.game, a.skill)
  if (c) out.push(c)
  const l = levelConcept(a.game, a.level)
  if (l) out.push(l)
  return out
}

/** 把一筆作答記進引入紀錄（會改動 intros），回傳這一筆新引入的概念 */
export function noteIntro(intros: Intros, a: IntroAttempt): string[] {
  const t = trackOf(a.game)
  if (!t) return []
  const added: string[] = []
  for (const c of attemptConcepts(a)) {
    if (intros.has(c)) continue
    const taught = c.startsWith('lv:') || phaseOf(a) !== 'quiz' || !a.firstTryCorrect
    intros.set(c, { date: a.date, track: t, taught })
    added.push(c)
  }
  return added
}

/** 從作答紀錄重建每個概念第一次出現的日期 */
export function conceptIntros(attempts: readonly Attempt[]): Intros {
  const intros: Intros = new Map()
  for (const a of [...attempts].sort((x, y) => x.ts - y.ts)) noteIntro(intros, a)
  return intros
}

export interface Budget {
  track: TrackId
  limit: number
  /** 最近 7 天教的新概念 */
  used: string[]
  left: number
  /** 這條線剛開始玩的頭 7 天 */
  starter: boolean
}

/** 這條主線最近 7 天（含今天）還能教幾個新概念 */
export function budgetOf(track: TrackId, intros: Intros, date: string): Budget {
  const from = shiftDate(date, -6)
  let first: string | null = null
  const used: string[] = []
  for (const [c, x] of intros) {
    if (x.track !== track || x.date > date) continue
    if (!first || x.date < first) first = x.date
    if (x.taught && x.date >= from) used.push(c)
  }
  const starter = !first || first > shiftDate(date, -STARTER_DAYS)
  const limit = starter ? STARTER_NEW : NEW_PER_WEEK
  return { track, limit, used, left: Math.max(0, limit - used.length), starter }
}

// ── 每條線的狀況 ─────────────────────────────────────────────
/** 熟練度看最近幾天出現過的技能 */
export const MASTERY_DAYS = 28

export interface TrackStat {
  track: TrackId
  /** 最近出現過的技能，平均熟練度（3 格以上算滿分）0–1 */
  mastery: number
  /** 最近出現過幾個技能 */
  skills: number
  /** 最近 7 天、14 天「自己答」的題數與第一次就答對的題數 */
  quiz7: number
  ok7: number
  quiz14: number
  ok14: number
  /** 最近一次玩這條線的日期 */
  lastDate: string | null
  /** 之後又有幾個「有玩的日子」沒玩到這條線；從沒玩過是 Infinity */
  missed: number
  /** 已經接觸過的概念數、這條線全部的概念數 */
  known: number
  total: number
  /** 今天到期該複習的技能 */
  due: string[]
  /** 最近出現過、還不熟（0–1 格）的技能，最不熟的在前 */
  weak: string[]
}

/** 舊版「爸爸回合」的紀錄（2026-10-29 拿掉了，舊資料可能還有）：爸爸代答，不算孩子自己答的 */
const isCoplay = (a: Pick<Attempt, 'skill'>) => a.skill.startsWith('coplay:')

/**
 * 每條線的統計，只看 date 當天（含）以前的紀錄。
 * boxOf：技能的熟練度（孩子端用目前的技能資料；雷達圖用作答紀錄重算，才能和上週比）。
 */
export function trackStats(
  attempts: readonly Attempt[],
  date: string,
  boxOf: (key: string) => number,
  opts: { intros?: Intros; isDue?: (key: string) => boolean } = {},
): TrackStat[] {
  const d7 = shiftDate(date, -6)
  const d14 = shiftDate(date, -13)
  const dM = shiftDate(date, -(MASTERY_DAYS - 1))
  const rows = attempts.filter((a) => a.date <= date && !isCoplay(a))
  const playDates = [...new Set(rows.filter((a) => a.date < date).map((a) => a.date))]
  const intros = opts.intros ?? conceptIntros(rows)
  return TRACKS.map(({ id }) => {
    const mine = rows.filter((a) => trackOf(a.game) === id)
    const scored = mine.filter(isScored)
    const s7 = scored.filter((a) => a.date >= d7)
    const s14 = scored.filter((a) => a.date >= d14)
    const keys = [...new Set(mine.filter((a) => phaseOf(a) === 'quiz' && a.date >= dM).map((a) => a.skill))]
    const mastery = keys.length ? keys.reduce((s, k) => s + Math.min(3, boxOf(k)) / 3, 0) / keys.length : 0
    const before = mine.filter((a) => a.date < date)
    const lastDate = before.reduce<string | null>((m, a) => (!m || a.date > m ? a.date : m), null)
    const universe = trackConcepts(id)
    const known = universe.filter((c) => {
      const x = intros.get(c)
      return x && x.date <= date
    }).length
    return {
      track: id,
      mastery,
      skills: keys.length,
      quiz7: s7.length,
      ok7: s7.filter((a) => a.firstTryCorrect).length,
      quiz14: s14.length,
      ok14: s14.filter((a) => a.firstTryCorrect).length,
      lastDate,
      missed: lastDate ? playDates.filter((x) => x > lastDate).length : Infinity,
      known,
      total: universe.length,
      due: opts.isDue ? keys.filter(opts.isDue) : [],
      weak: keys.filter((k) => boxOf(k) <= 1).sort((a, b) => boxOf(a) - boxOf(b)),
    }
  })
}

// ── 排課：哪條線落後 ─────────────────────────────────────────
export type NeedReason = 'never' | 'gap' | 'mastery' | 'share' | 'review' | 'even'

export interface TrackNeed extends TrackStat {
  /** 0–1，越高越需要多排 */
  need: number
  /** 最近 7 天的題數占比 */
  share: number
  /** 上一個有玩的日子沒玩到：今天一定要排 */
  mustPlay: boolean
  /** 主要原因（家長區的說明用） */
  reason: NeedReason
  budget: Budget
}

/** 權重：熟練度、題數占比、多久沒玩、到期複習 */
const W = { mastery: 0.4, share: 0.3, gap: 0.2, review: 0.1 }

/**
 * 四條線各自有多需要練（由高到低）：
 * - 熟練度低（最近的技能平均不到 3 格）→ 落後，多排；
 * - 最近 7 天題數占比少於四分之一 → 多排；
 * - 越多個有玩的日子沒玩到 → 多排，上一個有玩的日子沒玩到的，今天一定排（每條線至少隔天出現一次）；
 * - 到期複習的技能多 → 稍微多排（已熟的內容在遊戲裡會以到期複習的形式出現）。
 */
export function trackNeeds(input: {
  attempts: readonly Attempt[]
  date: string
  boxOf: (key: string) => number
  intros?: Intros
  isDue?: (key: string) => boolean
}): TrackNeed[] {
  const intros = input.intros ?? conceptIntros(input.attempts.filter((a) => a.date <= input.date))
  const stats = trackStats(input.attempts, input.date, input.boxOf, { intros, isDue: input.isDue })
  const total7 = stats.reduce((s, x) => s + x.quiz7, 0)
  const order = TRACKS.map((t) => t.id)
  return stats
    .map((s): TrackNeed => {
      const share = total7 ? s.quiz7 / total7 : 0.25
      const parts = {
        mastery: W.mastery * (s.skills ? 1 - s.mastery : 1),
        share: W.share * (total7 ? Math.max(0, 0.25 - share) * 4 : 0),
        gap: W.gap * (s.missed === Infinity ? 1 : Math.min(3, s.missed) / 3),
        review: W.review * Math.min(1, s.due.length / 8),
      }
      const need = parts.mastery + parts.share + parts.gap + parts.review
      const top = (Object.entries(parts) as [keyof typeof parts, number][]).sort((a, b) => b[1] - a[1])[0]
      const reason: NeedReason = s.missed === Infinity ? 'never' : s.missed >= 2 ? 'gap' : top[1] < 0.08 ? 'even' : top[0]
      return { ...s, share, need, mustPlay: s.missed >= 1, reason, budget: budgetOf(s.track, intros, input.date) }
    })
    .sort((a, b) => b.need - a.need || order.indexOf(a.track) - order.indexOf(b.track))
}

// ── 排課：今天的冒險 ─────────────────────────────────────────
export interface PlanGame {
  id: string
  station: StationId
}

export interface PlanSlot {
  game: string
  station: StationId
  track: TrackId
}

/** 一條線一天最多排幾格；第二格要比別條線需要得多才排得到 */
const MAX_PER_TRACK = 2
const SECOND_SLOT = 0.5

const seeded = (s: string) => parseInt(fnv1a(s), 36)

/**
 * 依 trackNeeds 排出今天的 n 個遊戲（同一天結果固定，冒險是照日期存的）：
 * 1. 今天一定要排的線先排（越需要的越先）；
 * 2. 其餘的格子給「需要程度 × 0.5^已排格數」最高的線：明顯落後的線會拿到第二格；
 * 3. 每格挑這條線裡最久沒玩的兩個遊戲之一（有到期複習的遊戲當作早一天玩過，比較容易排到）；
 *    負擔過重、或這條線本週新概念額度用完時，先不排從沒玩過的遊戲（第一次玩一定要教新的）；
 * 4. 同一條線不相鄰，最需要的放前面（剛開始最有精神）。
 */
export function planDay(input: {
  date: string
  n: number
  needs: readonly TrackNeed[]
  /** 可以排的遊戲（已經排除自由畫畫、還不能玩的數字快答） */
  games: readonly PlanGame[]
  lastPlayed: (game: string) => number
  plays: (game: string) => number
  /** 這個遊戲裡有幾個到期複習的技能 */
  dueIn?: (game: string) => number
  overloaded?: boolean
}): PlanSlot[] {
  const { date, needs, games } = input
  const of = (t: TrackId) => games.filter((g) => trackOf(g.id) === t)
  const usable = needs.filter((x) => of(x.track).length)
  const count = new Map<TrackId, number>()
  const slots: TrackId[] = []
  const add = (t: TrackId) => {
    slots.push(t)
    count.set(t, (count.get(t) ?? 0) + 1)
  }
  for (const x of usable) if (x.mustPlay && slots.length < input.n) add(x.track)
  while (slots.length < input.n) {
    const open = usable.filter((x) => (count.get(x.track) ?? 0) < Math.min(MAX_PER_TRACK, of(x.track).length))
    if (!open.length) break
    const best = open.reduce((a, b) => (b.need * SECOND_SLOT ** (count.get(b.track) ?? 0) > a.need * SECOND_SLOT ** (count.get(a.track) ?? 0) ? b : a))
    add(best.track)
  }

  const chosen = new Set<string>()
  const picks: PlanSlot[] = []
  const seen = new Map<TrackId, number>()
  for (const t of slots) {
    const k = seen.get(t) ?? 0
    seen.set(t, k + 1)
    let cand = of(t).filter((g) => !chosen.has(g.id))
    const noNew = input.overloaded || !needs.find((x) => x.track === t)?.budget.left
    if (noNew && cand.some((g) => input.plays(g.id) > 0)) cand = cand.filter((g) => input.plays(g.id) > 0)
    const age = (g: PlanGame) => input.lastPlayed(g.id) - ((input.dueIn?.(g.id) ?? 0) > 0 ? 86_400_000 : 0)
    const top = [...cand].sort((a, b) => age(a) - age(b) || (a.id < b.id ? -1 : 1)).slice(0, 2)
    if (!top.length) continue
    const g = top[seeded(`${date}|${t}|${k}`) % top.length]
    chosen.add(g.id)
    picks.push({ game: g.id, station: g.station, track: t })
  }

  // 排順序：每次挑「和上一個不同線」裡最需要的
  const rank = (t: TrackId) => needs.findIndex((x) => x.track === t)
  const rest = [...picks].sort((a, b) => rank(a.track) - rank(b.track))
  const out: PlanSlot[] = []
  while (rest.length) {
    const prev = out[out.length - 1]?.track
    const i = Math.max(0, rest.findIndex((p) => p.track !== prev))
    out.push(rest.splice(i, 1)[0])
  }
  return out
}

// ── 雷達圖 ───────────────────────────────────────────────────
/**
 * 依作答紀錄重算熟練度（和孩子端 recordSkill 同一套規則的簡化版：不看速度）。
 * 雷達圖的「這週」與「上週」都用這個算，兩個形狀才比得起來。
 */
export function replayBoxes(attempts: readonly Attempt[], date: string): Map<string, number> {
  const box = new Map<string, number>()
  for (const a of [...attempts].filter((x) => x.date <= date && phaseOf(x) === 'quiz' && !isProtege(x)).sort((x, y) => x.ts - y.ts)) {
    if (isProbe(a) && !a.firstTryCorrect) continue
    const b = box.get(a.skill) ?? 0
    box.set(a.skill, a.firstTryCorrect ? Math.min(5, b + 1) : a.metrics?.softHint ? b : Math.max(0, b - 1))
  }
  return box
}

export interface RadarAxis {
  track: TrackId
  /** 0–100 */
  score: number
  mastery: number
  coverage: number
  /** 最近 14 天第一次就答對的比例；沒有作答時是 null */
  accuracy: number | null
  quiz14: number
}

/** 分數 = 熟練 45% + 涵蓋 30% + 第一次就答對 25% */
export const RADAR_W = { mastery: 0.45, coverage: 0.3, accuracy: 0.25 }

/**
 * 某一天的四軸分數：
 * - 熟練：最近 4 週出現過的技能，平均熟練度（3 格以上算滿分）；
 * - 涵蓋：這條線 3–6 歲全部的概念裡，已經接觸過幾成（不是越多越好，是看平衡）；
 * - 第一次就答對：最近 14 天自己答的第一次答對率（不含探測題、孩子教豆豆的題目）。
 */
export function radarScores(attempts: readonly Attempt[], date: string): RadarAxis[] {
  const rows = attempts.filter((a) => a.date <= date)
  const box = replayBoxes(rows, date)
  const stats = trackStats(rows, date, (k) => box.get(k) ?? 0, { intros: conceptIntros(rows) })
  return stats.map((s) => {
    const coverage = s.total ? s.known / s.total : 0
    const accuracy = s.quiz14 ? s.ok14 / s.quiz14 : null
    const score = s.skills || s.known ? Math.round(100 * (RADAR_W.mastery * s.mastery + RADAR_W.coverage * coverage + RADAR_W.accuracy * (accuracy ?? 0))) : 0
    return { track: s.track, score, mastery: s.mastery, coverage, accuracy, quiz14: s.quiz14 }
  })
}

// ── 負擔控制的歷程 ───────────────────────────────────────────
export interface LoadSpan {
  /** 第一個啟動減輕負擔的有玩日子 */
  from: string
  /** 恢復的那個有玩日子；還在減輕中是 null */
  to: string | null
}

/** 最近 days 天內，每個有玩的日子是不是在「減輕負擔」狀態（和孩子端開機時的判斷一樣），整理成一段一段 */
export function loadSpans(attempts: readonly Attempt[], date: string, days = 21): LoadSpan[] {
  const from = shiftDate(date, -(days - 1))
  const dates = [...new Set(attempts.filter((a) => a.date >= from && a.date <= date).map((a) => a.date)), date].sort()
  const spans: LoadSpan[] = []
  let cur: LoadSpan | null = null
  for (const d of [...new Set(dates)]) {
    const on = loadCheck(attempts, d).overloaded
    if (on && !cur) spans.push((cur = { from: d, to: null }))
    else if (!on && cur) {
      cur.to = d
      cur = null
    }
  }
  return spans
}
