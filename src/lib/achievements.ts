import { db, getKV, setKV, today, uid, type Attempt } from './db'
import { isProbing, level, plays } from './adaptive'
import { requestSync } from './sync'
import { rand } from './random'
import { game as gameDef } from '../content/games'
import { FIX_STEPS, fixSticker, stickerFor, thingPic, type Pic, type StickerDef } from '../content/stickers'
import { ACH_COUNT } from '../content/lines-achieve'
import type { Speaker } from '../content/registry'

/**
 * 成就感強化：孩子看得見、會一直累積的進步（不是分數、不會被拿走）。
 * - 每一題：答對時一顆星星飛進上方的進度列；錯了一次又自己改對，換成稱讚「自己改好了」。
 * - 每一局：結束時用圖片回顧這一局做了什麼，配一句講努力或改正的話。
 * - 里程碑：技能第一次熟練（貼一張貼紙）、遊戲升到新的最高級、程式車庫累計修好幾個程式。
 * - 今日冒險結尾：回顧今天的里程碑、邀請孩子拿給爸爸看。
 *
 * 只讀學習引擎的結果（adaptive 的熟練度、難度），不改它的規則。
 * 資料存在 kv 的 achieve（一份很小的 JSON），同步時跟著 meta/state 一起上雲端，家長用手機也看得到。
 */

export type Milestone =
  | { id: string; ts: number; date: string; kind: 'master'; skill: string; sticker: string; game: string; backfill?: 1 }
  | { id: string; ts: number; date: string; kind: 'level'; game: string; from: number; to: number; backfill?: 1 }
  | { id: string; ts: number; date: string; kind: 'fixes'; n: number; backfill?: 1 }

interface Store {
  v: 1
  log: Milestone[]
  /** 每個遊戲到過的最高級：超過它才算「升級」，降級後再升回來不重複慶祝 */
  best: Record<string, number>
  /** 程式車庫累計自己修好幾個程式 */
  fixes: number
  /** 在貼紙本點過（看過）的貼紙，其餘的會輕輕發光 */
  seen: string[]
}

const KEY = 'achieve'
let store: Store = { v: 1, log: [], best: {}, fixes: 0, seen: [] }
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
  const saved = await getKV<Store | null>(KEY, null)
  if (saved) {
    store = { ...store, ...saved }
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

export interface RoundSummary {
  game: string
  things: Thing[]
  taught: number
  fixes: number
  codeFixes: number
  milestones: Milestone[]
}

let round: Round | null = null
/** 還沒慶祝過的里程碑（這一局裡發生的） */
let pending: Milestone[] = []

/** 遊戲一開始（在遊戲自己的 markPlayed 之前）呼叫 */
export function beginRound(game: string) {
  round = { game, startLevel: level(game), calibrating: plays(game) === 0 || isProbing(game), things: [], taught: 0, fixes: 0, codeFixes: 0 }
  // 上一局中途離開時留下的里程碑不帶過來：貼紙已經在貼紙本裡發光，今日回顧也看得到
  pending = []
}

/** 遊戲結束（onDone）時呼叫：結算升級，回傳這一局的回顧與要慶祝的里程碑 */
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
  return { game, things: r?.things ?? [], taught: r?.taught ?? 0, fixes: r?.fixes ?? 0, codeFixes: r?.codeFixes ?? 0, milestones }
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
    if (st && !ownedStickers().has(st.id)) addMilestone({ ...stamp(), kind: 'master', skill: a.skill, sticker: st.id, game: a.game })
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

// ── 貼紙本 ───────────────────────────────────────────────────
export interface OwnedSticker {
  def: StickerDef
  ts: number
  /** 還沒在貼紙本點過 */
  fresh: boolean
  /** 遊戲的星星徽章：遊戲 id、到過的最高級 */
  badge?: { game: string; stars: number; max: number }
}

function ownedStickers(): Set<string> {
  const s = new Set<string>()
  for (const m of store.log) {
    if (m.kind === 'master') s.add(m.sticker)
    if (m.kind === 'fixes') s.add(fixSticker(m.n).id)
  }
  return s
}

export function stickerOfMilestone(m: Milestone): StickerDef | null {
  if (m.kind === 'master') return stickerFor(m.skill)
  if (m.kind === 'fixes') return fixSticker(m.n)
  return null
}

/** 貼紙本的內容：照得到的先後排好（像一本慢慢貼滿的本子），最後是每個遊戲的星星徽章 */
export function stickerBook(): OwnedSticker[] {
  const seen = new Set(store.seen)
  const out: OwnedSticker[] = []
  const have = new Set<string>()
  for (const m of [...store.log].sort((a, b) => a.ts - b.ts)) {
    const d = stickerOfMilestone(m)
    if (!d || have.has(d.id)) continue
    have.add(d.id)
    out.push({ def: d, ts: m.ts, fresh: !m.backfill && !seen.has(d.id) })
  }
  // 遊戲徽章：升過級的遊戲才有（2 顆星以上），點了會說幾顆星
  const lastUp = new Map<string, number>()
  for (const m of store.log) if (m.kind === 'level') lastUp.set(m.game, m.ts)
  for (const [g, stars] of Object.entries(store.best)) {
    const max = safeMax(g)
    if (stars < 2 || max < 2) continue
    const id = `badge:${g}`
    const def: StickerDef = { id, pic: { t: 'emoji', icon: safeIcon(g) }, tint: '#F8EDC6', lines: [`stk.stars.${Math.min(6, stars)}`], zh: `${gameDef(g).title} 第 ${stars} 級` }
    out.push({ def, ts: lastUp.get(g) ?? 0, fresh: lastUp.has(g) && !seen.has(`${id}:${stars}`), badge: { game: g, stars, max } })
  }
  return out
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
  const id = s.badge ? `${s.def.id}:${s.badge.stars}` : s.def.id
  if (store.seen.includes(id)) return
  store.seen = [...store.seen, id]
  save()
}

export const freshCount = () => stickerBook().filter((s) => s.fresh).length

// ── 今日回顧、家長區 ─────────────────────────────────────────
/** 今天（不含補發的）里程碑，由舊到新 */
export const todayMilestones = (date = today()) => store.log.filter((m) => m.date === date && !m.backfill).sort((a, b) => a.ts - b.ts)

/** 上傳雲端（sync.ts 的 meta/state）用：只放家長區需要的 */
export const achieveForSync = () => ({ log: store.log.filter((m) => !m.backfill), fixes: store.fixes })

/** 家長區（這台裝置）讀取 */
export const localMilestones = () => store.log.filter((m) => !m.backfill)
