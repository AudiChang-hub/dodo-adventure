// 數學的 4 歲內容（T-150 M，主 repo docs/T-150-4歲階段設計.md 第二節案 A、第三節 2-1 案 A、2-2 案 A）：熟練了才自動開的「門」。
// 純函式（不碰資料庫、不碰畫面），scripts/test-math-stage4.ts 直接測；存取在 ./stage4-store.ts，家長區（T-150 P）只讀 gates()。
//
// 三道門（同一科一天最多開一道，照這個順序先開上面的）：
//   math-sub    一眼看出 1～3：小遊戲段裡一題換成「點一樣多的那一組」（./sub-plan.ts）。
//               前置：1～5 熟練（plan.ts 的 countReady，也就是已經開了 6；開過一次記在 kv 的 firm，不會因為後來答錯又算沒熟練）。
//   math-sub45  一眼看出 4～5（骰子點、五格框）：前置：一眼看出開了（前一天以前），sub:1～sub:3 照 readiness.mastery 熟練。
//   math-path   數字小路：開場「玩著數數」多一種（./path-plan.ts）。前置：1～5 熟練，找數字 num:1～num:5 照 readiness.mastery 熟練。
// 熟練：同一組技能（sub:1～3、num:1～5）合起來照 lib/readiness.ts 的 mastery（3 選 1 以上、第一次就對、聽完才答、不是手帶著做的；
//   最近 10 題 ≥ 8 題、分在 ≥ 3 天；隔 2 天再考還對），而且每一個數字都至少第一次就答對過一次（跟 countReady 的 missing 一樣）。
//   一個數字一堂只考一次，每個數字各自湊 10 題要好幾個月，所以合起來算（跟中文 stage4.ts 的 firmOf 一樣）。
// 開了不關；答不好時內容自己退一級（一眼看出的級數 SubKv.level）：
//   1：1～3，2 選 1（兩個數量差 2 以上：1 和 3），閃 3 秒
//   2：1～3，3 選 1，閃 2 秒（換到這一級的頭 3 題 3 秒）
//   3：1～5（骰子點、五格框），3 選 1（要 math-sub45 開了）
//   這一級最近 6 題第一次就對 ≤ 3 題 → 退一級；最近 5 題對 ≥ 4 題 → 升一級。只看換到這一級以後、聽完才答、不是手帶著做的。
// 怎麼混著出（index.tsx 照 planToday 排）：
//   - 頭 14 天（任何一道門剛開）：每堂最多 1 個 4 歲回合（今天開場是數字小路，小遊戲就不出一眼看出）。
//   - 14 天以後：開場一個、小遊戲 2 題裡最多一題，不超過一堂的一半。
//   - 一眼看出第一次出：手先示範（那一題記 guided，不算熟練）。
// 暫停：家長區的「暫停 4 歲內容」寫 kv 的 PAUSE_KEY（true＝暫停），暫停時照 3 歲的上、門也不會開。預設不暫停。
// 緊急開關：STAGE4_ON 改成 false 重新部署，門全部當作關。
import { isLed, phaseOf, type Attempt } from '../../lib/db'
import { MIN_DAYS, NEED_RIGHT, RECENT, RETAIN_GAP_DAYS, mastery } from '../../lib/readiness'
import { FIRM, countReady, range } from './plan'

/** 4 歲內容總開關（緊急時改 false：門全部當作關，孩子端回到 3 歲的內容） */
export const STAGE4_ON = true
/** 門的狀態（Stage4Kv）存在這個 kv；家長重置學習進度時跟著清掉，門回到關 */
export const STAGE4_KEY = 'lesson.math.stage4'
/** 家長區的「暫停數學 4 歲內容」：kv 存 true 就暫停（沒有＝不暫停） */
export const PAUSE_KEY = 'stage4.paused.math'

/** 剛開的頭幾天（少量混著出） */
export const FRESH_DAYS = 14
/** 一眼看出退一級：最近幾題、第一次就對 ≤ 幾題 */
export const BACK_OF = 6
export const BACK_MAX_RIGHT = 3
/** 一眼看出升一級：最近幾題、第一次就對 ≥ 幾題 */
export const UP_OF = 5
export const UP_RIGHT = 4

export type GateId = 'math-sub' | 'math-sub45' | 'math-path'
/** 三道門，照開的順序 */
export const GATE_IDS: readonly GateId[] = ['math-sub', 'math-sub45', 'math-path']
const LABEL: Record<GateId, string> = {
  'math-sub': '數學 一眼看出 1～3',
  'math-sub45': '數學 一眼看出 4～5',
  'math-path': '數學 數字小路（開場）',
}

/** 一道門（三科同一個形狀，家長區 T-150 P 照這個顯示） */
export interface Gate {
  id: string
  label: string
  open: boolean
  /** 開的那一天（YYYY-MM-DD） */
  openedOn?: string
  /** 還差什麼（開了的話是現在的狀況，例如退一級了） */
  need: string
  /** 一眼看出現在的難度級（1～3，見檔頭） */
  level?: number
}

/** 一道門存的東西 */
export interface GateKv {
  opened: string
}
export type SubLevel = 1 | 2 | 3
/** 一眼看出的級數：since 是換到這一級的時間（ts），之後的作答才拿來判斷升降 */
export interface SubKv {
  level: SubLevel
  since: number
  /** 第一題手示範過了 */
  demoed?: boolean
}
export type Stage4Kv = Partial<Record<GateId, GateKv>> & {
  sub?: SubKv
  /** 1～5 熟練過了（plan.ts 的 firm：開過一次就記著） */
  firm?: boolean
}

const dayNo = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}
/** 開門以後第幾天還算「剛開」 */
export const isFresh = (g: GateKv | undefined, today: string) => !!g && dayNo(today) - dayNo(g.opened) < FRESH_DAYS

// ── 熟練（沿用 readiness.mastery）─────────────────────────────

export interface Firm {
  ok: boolean
  need: string
}

/**
 * 一組技能（例：sub:1～sub:3）合起來照 readiness.mastery 判斷；「隔 2 天再考還對」看每一個技能自己的
 * （合起來天天都有練，永遠不會「隔 2 天」）。每一個都至少第一次就答對過一次。
 */
export function firmOf(attempts: readonly Attempt[], skills: readonly string[], name: string): Firm {
  const mine = attempts.filter((a) => skills.includes(a.skill))
  const pool = mastery(
    mine.map((a) => ({ ...a, skill: name })),
    name,
  )
  const per = skills.map((s) => mastery(mine, s))
  const retained = per.some((m) => m.retained)
  const missing = skills.filter((s) => !mine.some((a) => a.skill === s && a.firstTryCorrect && countsHere(a)))
  const lacks: string[] = []
  if (pool.recent < RECENT) lacks.push(`還要再答 ${RECENT - pool.recent} 題`)
  else if (pool.right < NEED_RIGHT) lacks.push(`最近 ${RECENT} 題對 ${pool.right} 題（要 ${NEED_RIGHT} 題）`)
  if (pool.days < MIN_DAYS) lacks.push(`分在 ${pool.days} 天（要 ${MIN_DAYS} 天）`)
  if (!retained) lacks.push(`還沒有隔 ${RETAIN_GAP_DAYS} 天再考還對`)
  if (missing.length) lacks.push(`${missing.map((s) => s.split(':')[1]).join('、')} 還沒自己答對過`)
  return { ok: !lacks.length, need: lacks.join('、') }
}

/** 拿來判斷熟練的（跟 readiness.counts 一樣：3 選 1 以上、聽完才答、不是手帶著做的） */
const countsHere = (a: Attempt) => phaseOf(a) === 'quiz' && a.heard !== false && !isLed(a) && (a.options?.length ?? 0) >= 3

const SUB13 = range(1, 3).map((n) => `sub:${n}`)
const NUM15 = range(1, FIRM).map((n) => `num:${n}`)

/** 1～5 熟練了沒（countReady；kv 記過就算） */
export function firmReady(attempts: readonly Attempt[], kv: Stage4Kv): Firm {
  if (kv.firm) return { ok: true, need: '' }
  const r = countReady(attempts)
  if (r.ready) return { ok: true, need: '' }
  const lacks: string[] = []
  if (r.recent < 10) lacks.push(`還要再答 ${10 - r.recent} 題`)
  else if (r.right < 8) lacks.push(`最近 10 題對 ${r.right} 題（要 8 題）`)
  if (r.days < 3) lacks.push(`分在 ${r.days} 天（要 3 天）`)
  if (r.missing.length) lacks.push(`${r.missing.join('、')} 還沒自己答對過`)
  return { ok: false, need: `1～5 的「有幾個」還在練（${lacks.join('、')}）` }
}

export function sub45Ready(attempts: readonly Attempt[]): Firm {
  const f = firmOf(attempts, SUB13, 'sub')
  return f.ok ? f : { ok: false, need: `一眼看出 1～3 還在練（${f.need}）` }
}

export function pathReady(attempts: readonly Attempt[], kv: Stage4Kv): Firm {
  const a = firmReady(attempts, kv)
  const b = firmOf(attempts, NUM15, 'num')
  const lacks = [!a.ok && a.need, !b.ok && `找數字 1～5 還在練（${b.need}）`].filter(Boolean)
  return { ok: !lacks.length, need: lacks.join('；') }
}

// ── 一眼看出的級數 ────────────────────────────────────────────

/** 一眼看出拿來升降級的作答：換到這一級以後、聽完才答、不是手帶著做的（2 選 1 也算：級數是孩子端的難度，不是熟練判斷） */
export function subRounds(attempts: readonly Attempt[], since: number): Attempt[] {
  return attempts
    .filter((a) => a.skill.startsWith('sub:') && a.ts > since && phaseOf(a) === 'quiz' && a.heard !== false && !isLed(a))
    .sort((x, y) => x.ts - y.ts)
}

/** 最高能到第幾級：4～5 的門開了才到 3 */
export const subCap = (kv: Stage4Kv): SubLevel => (kv['math-sub45'] ? 3 : 2)

/** 照最近的作答升一級、退一級，或不變（回傳新的 SubKv；沒變就是同一個物件） */
export function stepSub(sub: SubKv, attempts: readonly Attempt[], cap: SubLevel, now: number): SubKv {
  const xs = subRounds(attempts, sub.since)
  const right = (k: number) => xs.slice(-k).filter((a) => a.firstTryCorrect).length
  if (xs.length >= BACK_OF && right(BACK_OF) <= BACK_MAX_RIGHT && sub.level > 1) return { ...sub, level: (sub.level - 1) as SubLevel, since: now }
  if (xs.length >= UP_OF && right(UP_OF) >= UP_RIGHT && sub.level < cap) return { ...sub, level: (sub.level + 1) as SubLevel, since: now }
  if (sub.level > cap) return { ...sub, level: cap, since: now }
  return sub
}

/** 一次閃多久（ms）：第 1 級、剛換到這一級的頭 3 題 3 秒，熟了 2 秒。不短於 1.5 秒 */
export const FLASH_SLOW = 3000
export const FLASH_FAST = 2000
export const FLASH_MIN = 1500
export function flashMs(sub: SubKv, attempts: readonly Attempt[]): number {
  if (sub.level === 1 || subRounds(attempts, sub.since).length < 3) return FLASH_SLOW
  return Math.max(FLASH_MIN, FLASH_FAST)
}

// ── 進課時更新門 ──────────────────────────────────────────────

/**
 * 進數學課時算一次（./stage4-store.ts）：該開的門開、一眼看出升降級。回傳新的 kv（沒變就是同一個物件）。
 * firm：plan.ts 存著的「1～5 熟練過了」。暫停中、總開關關著：不開門、不動。同一天最多開一道門。now 是現在的時間（ts）。
 */
export function advance(kv: Stage4Kv, attempts: readonly Attempt[], today: string, opts: { paused?: boolean; firm?: boolean; now: number }): Stage4Kv {
  if (!STAGE4_ON || opts.paused) return kv
  let out = kv
  if (opts.firm && !kv.firm) out = { ...out, firm: true }
  let openedToday = GATE_IDS.some((id) => kv[id]?.opened === today)
  const open = (id: GateId, extra: Partial<Stage4Kv> = {}) => {
    out = { ...out, [id]: { opened: today }, ...extra }
    openedToday = true
  }
  if (!out['math-sub']) {
    if (!openedToday && firmReady(attempts, out).ok) open('math-sub', { sub: { level: 1, since: opts.now } })
  } else if (!out['math-sub45']) {
    const before = out['math-sub'].opened < today
    // 4～5 開了：直接換到第 3 級（熟練了才開，開了就出）
    if (!openedToday && before && sub45Ready(attempts).ok) open('math-sub45', { sub: { ...(out.sub ?? { level: 1, since: opts.now }), level: 3, since: opts.now } })
  }
  if (!out['math-path'] && !openedToday && pathReady(attempts, out).ok) open('math-path')
  // 一眼看出的級數（今天剛換過級的不再動）
  if (out['math-sub'] && out.sub) {
    const s = stepSub(out.sub, attempts, subCap(out), opts.now)
    if (s !== out.sub) out = { ...out, sub: s }
  } else if (out['math-sub'] && !out.sub) out = { ...out, sub: { level: 1, since: opts.now } }
  return out
}

// ── 家長區看的 ────────────────────────────────────────────────

const LEVEL_TEXT: Record<SubLevel, string> = { 1: '1～3，2 選 1', 2: '1～3，3 選 1', 3: '1～5（骰子點、五格框），3 選 1' }

/** 每道門現在怎樣（家長區 T-150 P 讀；不改 kv） */
export function gates(attempts: readonly Attempt[], kv: Stage4Kv, today: string): Gate[] {
  void today
  const k: Stage4Kv = kv && typeof kv === 'object' ? kv : {}
  return GATE_IDS.map((id): Gate => {
    const g = STAGE4_ON ? k[id] : undefined
    const base = { id, label: LABEL[id] }
    if (!STAGE4_ON) return { ...base, open: false, need: '4 歲內容總開關關著' }
    if (id === 'math-sub') {
      const level = k.sub?.level ?? 1
      if (g) return { ...base, open: true, openedOn: g.opened, level, need: `現在出：${LEVEL_TEXT[level]}` }
      return { ...base, open: false, need: firmReady(attempts, k).need || '下次進數學課就開' }
    }
    if (id === 'math-sub45') {
      if (g) {
        const level = k.sub?.level ?? 3
        return { ...base, open: true, openedOn: g.opened, level, need: level < 3 ? '最近答得不太好，先回到 1～3；再答穩就回到 4～5' : '' }
      }
      if (!k['math-sub']) return { ...base, open: false, need: '一眼看出 1～3 開了以後，隔天以後才開' }
      return { ...base, open: false, need: sub45Ready(attempts).need || '下次進數學課就開' }
    }
    if (g) return { ...base, open: true, openedOn: g.opened, need: '開場輪到的那天玩（每 2 天最多 1 次）' }
    return { ...base, open: false, need: pathReady(attempts, k).need || '下次進數學課就開' }
  })
}

// ── 這一堂出什麼 ──────────────────────────────────────────────

/** 這一堂的 4 歲內容（index.tsx 照這個排） */
export interface MathToday {
  /** 開場可以抽到數字小路 */
  path: boolean
  /** 小遊戲可以出一眼看出（null：不出）。level、demo（第一題手示範）、flash（閃幾毫秒） */
  sub: { level: SubLevel; demo: boolean; flash: number } | null
  /** 有門剛開（頭 14 天）：一堂最多 1 個 4 歲回合 */
  fresh: boolean
}

export const NO_STAGE4: MathToday = { path: false, sub: null, fresh: false }

export function planToday(kv: Stage4Kv, attempts: readonly Attempt[], today: string, paused = false): MathToday {
  if (!STAGE4_ON || paused) return NO_STAGE4
  const fresh = GATE_IDS.some((id) => isFresh(kv[id], today))
  const sub = kv['math-sub'] && kv.sub ? { level: kv.sub.level, demo: !kv.sub.demoed, flash: flashMs(kv.sub, attempts) } : null
  return { path: !!kv['math-path'], sub, fresh }
}

/**
 * 小遊戲今天出哪兩題（三種輪流，連續兩天不一樣：lib/variety.ts 挑 GAME_SETS 的一組）。
 * 今天開場是數字小路、門又剛開（頭 14 天）：一堂最多 1 個 4 歲回合，不出一眼看出。
 */
export const GAME_SETS = { 'boat+dots': ['compare', 'sub'], 'dots+balloon': ['sub', 'find'], 'boat+balloon': ['compare', 'find'] } as const
export type GameSet = keyof typeof GAME_SETS
export const GAME_SET_IDS = Object.keys(GAME_SETS) as GameSet[]
export const GAME_VARIETY = 'math.game'
export type GameKind = 'compare' | 'sub' | 'find'

export const subAllowed = (t: MathToday, warm: string) => !!t.sub && !(t.fresh && warm === 'path')

/** 這一堂小遊戲的題目順序。hasFind：今天有沒有找數字（只教了 1、2 的那兩天沒有） */
export function gameKinds(hasFind: boolean, set: GameSet | null): GameKind[] {
  const base: GameKind[] = hasFind ? ['compare', 'find'] : ['compare']
  if (!set) return base
  const kinds = GAME_SETS[set].filter((k) => k !== 'find' || hasFind) as GameKind[]
  return kinds.length ? kinds : base
}
