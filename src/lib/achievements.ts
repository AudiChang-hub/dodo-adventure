import { db, getKV, setKV, today, uid, type Attempt } from './db'
import { isProbing, level, plays } from './adaptive'
import { requestSync } from './sync'
import { rand } from './random'
import { game as gameDef } from '../content/games'
import { FIX_STEPS, artSticker, fixSticker, stickerFor, thingPic, type Pic, type StickerDef } from '../content/stickers'
import { ACH_COUNT } from '../content/lines-achieve'
import type { Speaker } from '../content/registry'
import { featureFor, recommend, type Stk } from './sticker-pick'

/**
 * 成就感強化：孩子看得見、會一直累積的進步（不是分數、不會被拿走）。
 * - 每一題：答對時一顆星星飛進上方的進度列；錯了一次又自己改對，換成稱讚「自己改好了」。
 * - 每一局：結束時用圖片回顧這一局做了什麼，配一句講努力或改正的話。
 * - 里程碑：技能第一次熟練、遊戲升到新的最高級、程式車庫累計修好幾個程式。
 * - 貼紙（2026-10-28 家長：「獲得途徑不夠明確」「樣式可以讓他選」）：每玩完一關，貼紙卡上多一顆星；
 *   那一關學會新東西、自己改正、升級，各再多一顆（一關最多再多 2 顆）。集滿 5 顆，就從圖庫挑一張自己喜歡的貼紙，
 *   照拿到的順序一張張貼進貼紙本（同一款可以一再選）。規則的數字都在下面的 CARD_GOAL、CARD_BONUS_MAX。
 *   這個版本以前「學會一個東西就自動給」的貼紙（v1）全部保留在貼紙本裡，照當時拿到的時間排在前面。
 * - 今日冒險結尾：回顧今天的里程碑與貼紙、邀請孩子拿給爸爸看。
 *
 * 只讀學習引擎的結果（adaptive 的熟練度、難度），不改它的規則。
 * 資料存在 kv 的 achieve（一份很小的 JSON），同步時跟著 meta/state 一起上雲端，家長用手機也看得到。
 * 重置學習進度會刪掉整個 achieve（reset.ts 的 KEEP_KV 不含它），重新載入後是一張空的貼紙卡、空的貼紙本。
 */

// ── 貼紙卡的規則 ─────────────────────────────────────────────
/** 幾顆星換一張貼紙（卡片上的格子數） */
export const CARD_GOAL = 5
/** 一關最多多給幾顆加速的星（學會新東西、自己改正、升級各一顆）：一關最多 1 + 2 = 3 顆 */
export const CARD_BONUS_MAX = 2

/** 一顆星是怎麼來的：玩完一關、學會新東西、自己改正、升級 */
export type StarWhy = 'round' | 'learn' | 'fix' | 'level'
export type Why = Record<StarWhy, number>
const noWhy = (): Why => ({ round: 0, learn: 0, fix: 0, level: 0 })

export type Milestone =
  | { id: string; ts: number; date: string; kind: 'master'; skill: string; sticker: string; game: string; backfill?: 1 }
  | { id: string; ts: number; date: string; kind: 'level'; game: string; from: number; to: number; backfill?: 1 }
  | { id: string; ts: number; date: string; kind: 'fixes'; n: number; backfill?: 1 }
  /**
   * 集滿星星後挑的貼紙：art 是圖庫的主角、seed 決定隨機的外觀（sticker-look.ts，同一個 seed 重畫一模一樣），
   * why 是這張卡的 5 顆星怎麼來的（家長區說明「為什麼拿到」）。只存這幾個數字，不存圖。
   */
  | { id: string; ts: number; date: string; kind: 'sticker'; art: string; seed: number; why: Why; backfill?: 1 }

/** 現在這張貼紙卡：已經幾顆星、星星的來源、卡片上蓋著的那一款（集滿時翻開，一定在挑選的 6 款裡） */
interface Card {
  stars: number
  why: Why
  feature: Stk
}

/** 集滿了、還沒挑的貼紙（孩子說「等一下再選」，或還在挑） */
export interface PendingPick {
  ts: number
  why: Why
  feature: Stk
}

interface Store {
  v: 2
  log: Milestone[]
  /** 每個遊戲到過的最高級：超過它才算「升級」，降級後再升回來不重複慶祝 */
  best: Record<string, number>
  /** 程式車庫累計自己修好幾個程式 */
  fixes: number
  /** 在貼紙本點過（看過）的貼紙，其餘的會輕輕發光 */
  seen: string[]
  card: Card
  picks: PendingPick[]
  /**
   * 換成挑選式貼紙的時間（v1 → v2）。這之前的「學會」「修好程式」里程碑在 v1 是自動給的貼紙，
   * 照樣放在貼紙本裡（舊貼紙不會消失）；這之後的里程碑改成給加速的星星，不再自動變成貼紙。
   */
  since: number
}

const KEY = 'achieve'
const newCard = (history: string[] = []): Card => ({ stars: 0, why: noWhy(), feature: featureFor(history) })
let store: Store = { v: 2, log: [], best: {}, fixes: 0, seen: [], card: newCard(), picks: [], since: 0 }
const subs = new Set<() => void>()

function save() {
  void setKV(KEY, store)
  requestSync()
  subs.forEach((f) => f())
}

/** 貼紙本等畫面訂閱變動 */
export function onAchieve(fn: () => void) {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

const stamp = () => ({ id: uid(), ts: Date.now(), date: today() })

/**
 * 開機時載入（在 loadAdaptive 之後）。第一次用這個功能時，把「已經熟的技能」「已經到的難度」補成貼紙，
 * 標記 backfill：不慶祝、不算在今日亮點，但貼紙本不會是空的（之前的努力也算數）。
 */
export async function loadAchievements() {
  const saved = await getKV<(Partial<Store> & { v: number }) | null>(KEY, null)
  if (saved) {
    store = { ...store, ...saved } as Store
    // v1（學會就自動給貼紙）→ v2（集星星、自己挑）：舊的里程碑與貼紙都留著，從一張空的貼紙卡開始
    if (saved.v !== 2) {
      store = { ...store, v: 2, since: Date.now(), card: newCard(), picks: [] }
      await setKV(KEY, store)
    }
    return
  }
  const [skills, levels, fixed] = await Promise.all([db.skills.toArray(), db.levels.toArray(), db.attempts.filter((a) => isCodeFix(a)).count()])
  const owned = new Set<string>()
  for (const s of skills.sort((a, b) => a.lastTs - b.lastTs)) {
    const st = s.box >= 3 ? stickerFor(s.key) : null
    if (!st || owned.has(st.id)) continue
    owned.add(st.id)
    const ts = s.lastTs || Date.now()
    store.log.push({ id: uid(), ts, date: today(new Date(ts)), kind: 'master', skill: s.key, sticker: st.id, game: '', backfill: 1 })
  }
  for (const l of levels) store.best[l.key] = l.level
  store.fixes = fixed
  for (const n of FIX_STEPS) if (fixed >= n) store.log.push({ ...stamp(), kind: 'fixes', n, backfill: 1 })
  // 補發的都算「以前的貼紙」（這台裝置在貼紙功能出現前就學會的東西）；重置後的空資料庫什麼都不會補
  store.since = Date.now() + 1
  await setKV(KEY, store)
}

// ── 判斷 ─────────────────────────────────────────────────────
type Judge = Pick<Attempt, 'phase' | 'firstTryCorrect' | 'attempts' | 'hintUsed' | 'metrics'>

/**
 * 自己改正：自己答時錯了（第一次沒對），沒有看提示、沒有重教，自己再試就對了。
 * 探測題、Sam 教豆豆、靠延遲提示的光才答對的，都不算。家長區也用這個規則數次數。
 */
export function isSelfFix(a: Judge): boolean {
  const m = a.metrics
  return (a.phase ?? 'quiz') === 'quiz' && !a.firstTryCorrect && a.attempts >= 2 && !a.hintUsed && !m?.retaught && !m?.probe && !m?.protege && !m?.softHint
}

/** 程式車庫的「修好程式」：開錯之後自己改卡片，再開一次就到了 */
export const isCodeFix = (a: Judge) => isSelfFix(a) && !!a.metrics?.fixed

// ── 每一題：星星與自己改正的稱讚 ──────────────────────────────
type CheerFn = () => void
const cheerSubs = new Set<CheerFn>()

/** 進度列訂閱：每一次稱讚（答對）就飛一顆星星過去 */
export function onCheer(fn: CheerFn) {
  cheerSubs.add(fn)
  return () => {
    cheerSubs.delete(fn)
  }
}

/** 剛剛那一題是自己改正的：接下來的那一句稱讚換成「自己改好了」 */
let lastFix: { ts: number; code: boolean } | null = null
/** 多久以內的稱讚算是同一題的（logAttempt 之後馬上就會稱讚） */
const FIX_WINDOW_MS = 2500

/**
 * 遊戲說稱讚之前呼叫（games/lines.ts 的 praiseKey）：
 * 送出「答對了」給進度列的星星；剛才是自己改正的，回傳改正的稱讚 key（不然回傳 null，照原本的稱讚）。
 */
export function cheer(host: Speaker): string | null {
  cheerSubs.forEach((f) => f())
  const f = lastFix
  lastFix = null
  if (!f || Date.now() - f.ts > FIX_WINDOW_MS) return null
  if (f.code) return `ach.code.${rand(ACH_COUNT.code)}`
  return `ach.fix.${host}.${rand(ACH_COUNT.fix)}`
}

// ── 每一局 ───────────────────────────────────────────────────
export interface Thing {
  itemId: string
  skill: string
  answer: string
  pic: Pic
  firstTry: boolean
  selfFix: boolean
  /** 比這局開始時的難度高（最後的挑戰題） */
  tricky: boolean
}

interface Round {
  game: string
  startLevel: number
  /** 第一次玩或正在做程度校準：難度是校準出來的，不算升級 */
  calibrating: boolean
  things: Thing[]
  /** 這一局新教了幾個東西 */
  taught: number
  fixes: number
  codeFixes: number
}

/** 這一關讓貼紙卡多了幾顆星（每局回顧畫面上的那張卡） */
export interface CardGain {
  /** 這一關之前卡片上有幾顆 */
  before: number
  /** 這一關飛進這張卡的星（集滿時只算到填滿為止，多的留給下一張） */
  gained: StarWhy[]
  /** 這一關把卡片集滿了：接著挑貼紙 */
  full: boolean
  /** 卡片上蓋著的那一張 */
  feature: Stk
  /** 沒集滿時還差幾顆 */
  left: number
}

export interface RoundSummary {
  game: string
  things: Thing[]
  taught: number
  fixes: number
  codeFixes: number
  milestones: Milestone[]
  card: CardGain | null
}

let round: Round | null = null
/** 還沒慶祝過的里程碑（這一局裡發生的） */
let pending: Milestone[] = []

/** 遊戲一開始（在遊戲自己的 markPlayed 之前）呼叫 */
export function beginRound(game: string) {
  round = { game, startLevel: level(game), calibrating: plays(game) === 0 || isProbing(game), things: [], taught: 0, fixes: 0, codeFixes: 0 }
  // 上一局中途離開時留下的里程碑不帶過來：今日回顧、家長區都看得到
  pending = []
}

/** 遊戲結束（onDone）時呼叫：結算升級與貼紙卡，回傳這一局的回顧與要慶祝的里程碑 */
export function endRound(game: string): RoundSummary {
  const r = round?.game === game ? round : null
  round = null
  if (r) {
    const max = gameDef(game).maxLevel
    const lv = level(game)
    const best = store.best[game] ?? r.startLevel
    if (lv > best && !r.calibrating && max > 1) addMilestone({ ...stamp(), kind: 'level', game, from: best, to: lv })
    if (lv > best || store.best[game] == null) {
      store.best[game] = Math.max(best, lv)
      save()
    }
  }
  const milestones = pending
  pending = []
  // 貼紙卡：玩完一關（真的有作答，中途離開不算）一顆星；學會新東西、自己改正、升級各再一顆，最多再多 CARD_BONUS_MAX 顆
  let card: CardGain | null = null
  if (r && r.things.length) {
    const bonus: StarWhy[] = []
    if (milestones.some((m) => m.kind === 'master')) bonus.push('learn')
    if (r.fixes > 0) bonus.push('fix')
    if (milestones.some((m) => m.kind === 'level')) bonus.push('level')
    card = addStars(['round', ...bonus.slice(0, CARD_BONUS_MAX)])
  }
  return { game, things: r?.things ?? [], taught: r?.taught ?? 0, fixes: r?.fixes ?? 0, codeFixes: r?.codeFixes ?? 0, milestones, card }
}

function addStars(gained: StarWhy[]): CardGain {
  const { stars: before, feature } = store.card
  const shown: StarWhy[] = []
  let full = false
  for (const g of gained) {
    if (!full) shown.push(g)
    store.card = { ...store.card, stars: store.card.stars + 1, why: { ...store.card.why, [g]: store.card.why[g] + 1 } }
    if (store.card.stars >= CARD_GOAL) {
      store.picks = [...store.picks, { ts: Date.now(), why: store.card.why, feature: store.card.feature }]
      store.card = newCard(history())
      full = true
    }
  }
  save()
  return { before, gained: shown, full, feature, left: full ? 0 : CARD_GOAL - store.card.stars }
}

function addMilestone(m: Milestone) {
  store.log.push(m)
  pending.push(m)
  save()
}

type AttemptIn = Pick<Attempt, 'game' | 'itemId' | 'skill' | 'answer' | 'level' | 'phase' | 'firstTryCorrect' | 'attempts' | 'hintUsed' | 'metrics'>

/**
 * 每寫一筆作答紀錄就呼叫（record.ts 的 logAttempt，在寫進資料庫之前，同步執行）。
 * becameMastered：這一題讓技能第一次跨過「已熟」。
 */
export function noteAttempt(a: AttemptIn, becameMastered: boolean) {
  const r = round?.game === a.game ? round : null
  if (a.phase === 'teach') {
    if (r && !a.metrics?.retaught) r.taught++
    return
  }
  const fixed = isSelfFix(a)
  if (fixed) lastFix = { ts: Date.now(), code: !!a.metrics?.fixed }
  if (r) {
    // 同一題可能有好幾筆（答錯兩次重教 → 一起練），併成一張圖
    const last = r.things[r.things.length - 1]
    const same = last && last.itemId === a.itemId && last.skill === a.skill
    const quiz = (a.phase ?? 'quiz') === 'quiz'
    const t: Thing = same
      ? { ...last, selfFix: last.selfFix || fixed, firstTry: quiz ? a.firstTryCorrect : last.firstTry }
      : { itemId: a.itemId, skill: a.skill, answer: a.answer, pic: thingPic(a), firstTry: quiz && a.firstTryCorrect, selfFix: fixed, tricky: a.level > r.startLevel }
    if (same) r.things[r.things.length - 1] = t
    else r.things.push(t)
    if (fixed) r.fixes++
    if (fixed && a.metrics?.fixed) r.codeFixes++
  }
  if (fixed && a.metrics?.fixed) {
    store.fixes++
    if ((FIX_STEPS as readonly number[]).includes(store.fixes)) addMilestone({ ...stamp(), kind: 'fixes', n: store.fixes })
    else save()
  }
  if (becameMastered) {
    const st = stickerFor(a.skill)
    if (st && !learned().has(st.id)) addMilestone({ ...stamp(), kind: 'master', skill: a.skill, sticker: st.id, game: a.game })
  }
}

// ── 每局結束的那一句話 ───────────────────────────────────────
/** 依這一局最值得講的事挑一句：修好程式 > 自己改正 > 學了新的 > 挑戰題 > 全部自己答對 > 一般的鼓勵 */
export function roundLine(s: RoundSummary, host: Speaker): string {
  const k = (kind: string, n = 2) => `ach.round.${kind}.${host}.${rand(n)}`
  if (s.codeFixes > 0 && host === 'bobo') return k('code')
  if (s.fixes > 0) return k('fix')
  if (s.taught > 0) return k('new')
  if (s.things.some((t) => t.tricky && t.firstTry)) return k('tricky')
  if (s.things.length >= 3 && s.things.every((t) => t.firstTry)) return k('all')
  return k('done', ACH_COUNT.done)
}

// ── 貼紙卡、挑貼紙 ───────────────────────────────────────────
/** 選過的貼紙主角（舊到新）：推薦時留一點點「他喜歡的類型」的權重 */
function history(): string[] {
  return store.log
    .filter((m): m is Extract<Milestone, { kind: 'sticker' }> => m.kind === 'sticker')
    .sort((a, b) => a.ts - b.ts)
    .map((m) => m.art)
}

export interface CardState {
  stars: number
  goal: number
  feature: Stk
  /** 集滿了還沒挑的張數 */
  pending: number
}

export const cardState = (): CardState => ({ stars: store.card.stars, goal: CARD_GOAL, feature: store.card.feature, pending: store.picks.length })
export const pendingPicks = () => store.picks.length
export const nextPick = (): PendingPick | null => store.picks[0] ?? null

/** 一批 6 張（位置已打亂）。seen：這次挑選已經看過的主角（按「再看別的」時先避開） */
export const pickOptions = (seen: Set<string>, feature?: Stk): Stk[] => recommend(history(), seen, feature)

/** 挑好了：貼進貼紙本（用掉最早的那一張待選） */
export function placeSticker({ art, seed }: Stk): Milestone | null {
  const p = store.picks[0]
  if (!p) return null
  const m: Milestone = { ...stamp(), kind: 'sticker', art, seed, why: p.why }
  store.log = [...store.log, m]
  store.seen = [...store.seen, m.id]
  store.picks = store.picks.slice(1)
  // 卡片還是空的：蓋著的那一張重新抽（已經有星星的卡片不換，孩子看過它的樣子）
  if (store.card.stars === 0) store.card = newCard(history())
  save()
  return m
}

// ── 貼紙本 ───────────────────────────────────────────────────
export interface OwnedSticker {
  /** 貼紙本裡的這一張（同一款貼了好幾次，每一張都有自己的 key） */
  key: string
  def: StickerDef
  ts: number
  /** 還沒在貼紙本點過 */
  fresh: boolean
  /** 遊戲的星星徽章：遊戲 id、到過的最高級 */
  badge?: { game: string; stars: number; max: number }
}

/** 已經慶祝過「學會」的概念：同一個概念只慶祝一次 */
function learned(): Set<string> {
  const s = new Set<string>()
  for (const m of store.log) if (m.kind === 'master') s.add(m.sticker)
  return s
}

export function stickerOfMilestone(m: Milestone): StickerDef | null {
  if (m.kind === 'master') return stickerFor(m.skill)
  if (m.kind === 'fixes') return fixSticker(m.n)
  if (m.kind === 'sticker') return artSticker(m.art, m.seed)
  return null
}

/**
 * 貼紙本：照拿到的先後一張張貼上去，頁數不限。
 * 前面是 v1 自動給的舊貼紙（學會的東西、修好程式），之後是集星星挑的；同一款挑了兩次就貼兩張。
 */
export function album(): OwnedSticker[] {
  const seen = new Set(store.seen)
  const out: OwnedSticker[] = []
  const have = new Set<string>()
  for (const m of [...store.log].sort((a, b) => a.ts - b.ts)) {
    if (m.kind === 'sticker') {
      out.push({ key: m.id, def: artSticker(m.art, m.seed), ts: m.ts, fresh: !seen.has(m.id) })
      continue
    }
    if (m.ts >= store.since) continue
    const d = stickerOfMilestone(m)
    if (!d || have.has(d.id)) continue
    have.add(d.id)
    out.push({ key: d.id, def: d, ts: m.ts, fresh: !m.backfill && !seen.has(d.id) })
  }
  return out
}

/** 遊戲徽章：升過級的遊戲才有（2 顆星以上），點了會說幾顆星；放在貼紙本的第一頁 */
export function starBadges(): OwnedSticker[] {
  const seen = new Set(store.seen)
  const out: OwnedSticker[] = []
  const lastUp = new Map<string, number>()
  for (const m of store.log) if (m.kind === 'level') lastUp.set(m.game, m.ts)
  for (const [g, stars] of Object.entries(store.best)) {
    const max = safeMax(g)
    if (stars < 2 || max < 2) continue
    const id = `badge:${g}`
    const def: StickerDef = { id, pic: { t: 'emoji', icon: safeIcon(g) }, tint: '#F8EDC6', lines: [`stk.stars.${Math.min(6, stars)}`], zh: `${gameDef(g).title} 第 ${stars} 級` }
    out.push({ key: `${id}:${stars}`, def, ts: lastUp.get(g) ?? 0, fresh: lastUp.has(g) && !seen.has(`${id}:${stars}`), badge: { game: g, stars, max } })
  }
  return out.sort((a, b) => a.ts - b.ts)
}

const safeMax = (g: string) => {
  try {
    return gameDef(g).maxLevel
  } catch {
    return 0
  }
}
const safeIcon = (g: string) => {
  try {
    return gameDef(g).icon
  } catch {
    return 'star'
  }
}

/** 在貼紙本點了一張：不再發光 */
export function markSeen(s: OwnedSticker) {
  if (!s.fresh || store.seen.includes(s.key)) return
  store.seen = [...store.seen, s.key]
  save()
}

export const freshCount = () => [...album(), ...starBadges()].filter((s) => s.fresh).length

// ── 今日回顧、家長區 ─────────────────────────────────────────
/** 今天（不含補發的）里程碑，由舊到新 */
export const todayMilestones = (date = today()) => store.log.filter((m) => m.date === date && !m.backfill).sort((a, b) => a.ts - b.ts)

/** 上傳雲端（sync.ts 的 meta/state）用：只放家長區需要的 */
export const achieveForSync = () => ({ log: store.log.filter((m) => !m.backfill), fixes: store.fixes, card: localCard() })

/** 家長區：貼紙卡現在的進度 */
export const localCard = (): CardProgress => ({ stars: store.card.stars, goal: CARD_GOAL, pending: store.picks.length })

export interface CardProgress {
  stars: number
  goal: number
  pending: number
}

/** 家長區（這台裝置）讀取 */
export const localMilestones = () => store.log.filter((m) => !m.backfill)
