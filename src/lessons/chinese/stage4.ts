// 中文的 4 歲內容（T-150 Z，設計稿 docs/T-150-4歲階段設計.md 第二節案 A、第五節案 B）：熟練了才自動開的「門」。
// 純函式（不碰資料庫、不碰畫面），scripts/test-zh-stage4.ts 直接測；存取在 ./progress.ts，家長區（T-150 P）只讀 gates()。
//
// 兩道門（同一科一天最多開一道，先開上面那道）：
//   zh-long   加長版課文：複習舊篇時換成 5～6 行的加長版（texts.json 的 linesLong），新篇照舊用短版。
//             前置：紅字選圖（zhtext:，三選一）照 lib/readiness.ts 的 mastery 熟練（最近 10 題對 8 題、分在 3 天以上、
//             隔 2 天再考還對），而且最近 20 題 ≥ 90%（家長區 NEXT-3）；找一樣的字到過第 3 級（自己答的）。
//   zh-glyph4 找一樣的字 4 選 1：前置：加長版的門已經開了（前一天以前），第 3 級的找字照 mastery 熟練。
// 開了不關（不會因為後來答錯又關掉）；答不好時內容自己退一級：
//   - 加長版：最近 2 週加長版裡的選圖，最近 6 題第一次就對 ≤ 3 題 → 退回短版（level 0）；退了以後的作答再過一次同樣的門檻 → 回到加長版。
//   - 4 選 1：找字的級數（./match.ts 的 afterGlyph）自己會從 4 退回 3、第 3 級熟練再升回 4。
// 怎麼混著出（避免一下子變難）：
//   - 頭 14 天（任何一道門剛開）：每堂最多 1 個 4 歲回合；加長版每 2 次複習才 1 次。
//   - 14 天以後：每次複習都用加長版；找字最多一半是 4 選 1。
//   - 開門以後第一次出 4 選 1：先讓手示範（示範那題不記熟練，Glyph 的 demo）。
// 暫停：家長區的「暫停 4 歲內容」（T-150 P 會做開關）寫 kv 的 PAUSE_KEY（true＝暫停），暫停時照 3 歲的上、門也不會開。預設不暫停。
// 緊急開關：STAGE4_ON 改成 false 重新部署，門全部當作關。
import type { Attempt } from '../../lib/db'
import { MIN_DAYS, NEED_RIGHT, RECENT, RETAIN_GAP_DAYS, counts, mastery, recentRate } from '../../lib/readiness'

/** 4 歲內容總開關（緊急時改 false：門全部當作關，孩子端回到 3 歲的內容） */
export const STAGE4_ON = true
/** 門的狀態（Stage4Kv）存在這個 kv；家長重置學習進度時跟著清掉，門回到關 */
export const STAGE4_KEY = 'lesson.chinese.stage4'
/** 家長區的「暫停中文 4 歲內容」：kv 存 true 就暫停（沒有＝不暫停） */
export const PAUSE_KEY = 'stage4.paused.zh'

/** 剛開的頭幾天（少量混著出） */
export const FRESH_DAYS = 14
/** 退一級：最近幾題、第一次就對 ≤ 幾題、只看最近幾天 */
export const BACK_OF = 6
export const BACK_MAX_RIGHT = 3
export const BACK_DAYS = 14
/** 家長區 NEXT-3：紅字選圖最近 20 題 ≥ 90% */
export const RATE_N = 20
export const RATE_PCT = 90

export type GateId = 'zh-long' | 'zh-glyph4'
/** 兩道門，照開的順序 */
export const GATE_IDS: readonly GateId[] = ['zh-long', 'zh-glyph4']
const LABEL: Record<GateId, string> = { 'zh-long': '中文 加長版課文（複習時）', 'zh-glyph4': '中文 找一樣的字 4 選 1' }

/** 一道門（三科同一個形狀，家長區 T-150 P 照這個顯示） */
export interface Gate {
  id: string
  label: string
  open: boolean
  /** 開的那一天（YYYY-MM-DD） */
  openedOn?: string
  /** 還差什麼（開了的話是現在的狀況，例如退回短版） */
  need: string
  /** 現在的難度級：zh-long 1＝加長版、0＝退回短版；zh-glyph4 是找字最近一題的級數 */
  level?: number
}

/** 一道門存的東西 */
export interface GateKv {
  opened: string
  /** zh-long：1 加長版、0 退回短版（沒有＝1） */
  level?: 0 | 1
  /** 最近一次退回短版的那一天：之後的作答才拿來判斷升回去、再退 */
  downOn?: string
  /** zh-glyph4：第一題 4 選 1 手示範過了 */
  demoed?: boolean
}
export type Stage4Kv = Partial<Record<GateId, GateKv>>

const dayNo = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}
/** 開門以後第幾天還算「剛開」 */
export const isFresh = (g: GateKv | undefined, today: string) => !!g && dayNo(today) - dayNo(g.opened) < FRESH_DAYS

// ── 熟練（沿用 readiness.mastery）─────────────────────────────

/** 一組技能合起來熟練了沒（例：所有 zhtext:<字詞>） */
export interface Firm {
  ok: boolean
  need: string
}

/**
 * 一組技能（同一個前綴）合起來照 readiness.mastery 判斷：最近 10 題、對幾題、幾天把整組當同一個技能算；
 * 「隔 2 天再考還對」看每一個技能自己的（同一個字詞隔幾次課才會再考到；整組合起來天天都有練，永遠不會「隔 2 天」）。
 */
export function firmOf(attempts: readonly Attempt[], prefix: string, keep: (a: Attempt) => boolean = () => true): Firm {
  const mine = attempts.filter((a) => a.skill.startsWith(prefix) && keep(a))
  const pool = mastery(
    mine.map((a) => ({ ...a, skill: prefix })),
    prefix,
  )
  const retained = [...new Set(mine.map((a) => a.skill))].some((s) => mastery(mine, s).retained)
  const lacks: string[] = []
  if (pool.recent < RECENT) lacks.push(`還要再答 ${RECENT - pool.recent} 題`)
  else if (pool.right < NEED_RIGHT) lacks.push(`最近 ${RECENT} 題對 ${pool.right} 題（要 ${NEED_RIGHT} 題）`)
  if (pool.days < MIN_DAYS) lacks.push(`分在 ${pool.days} 天（要 ${MIN_DAYS} 天）`)
  if (!retained) lacks.push(`還沒有隔 ${RETAIN_GAP_DAYS} 天再考還對`)
  return { ok: !lacks.length, need: lacks.join('、') }
}

const isText = (a: Attempt) => a.skill.startsWith('zhtext:')
const isGlyph = (a: Attempt) => a.skill.startsWith('zhglyph:')
/** 加長版裡的選圖（Quiz 記 metrics.long） */
export const isLong = (a: Pick<Attempt, 'metrics'>) => a.metrics?.long === 1

/** 加長版的門檻（開門、退回短版以後升回去都用這個）。since：只看這一天以後的作答 */
export function longReady(attempts: readonly Attempt[], since?: string, needGlyph = true): Firm {
  const xs = since ? attempts.filter((a) => a.date > since) : attempts
  const text = firmOf(xs, 'zhtext:')
  const rate = recentRate(xs, isText, RATE_N)
  const pct = rate.n ? Math.round((100 * rate.right) / rate.n) : 0
  const glyph3 = attempts.some((a) => isGlyph(a) && a.level >= 3 && counts(a))
  const lacks = [
    !text.ok && `選圖還在練（${text.need}）`,
    (rate.n < RATE_N || pct < RATE_PCT) && `選圖最近 ${rate.n} 題對 ${pct}%（要 ${RATE_N} 題、${RATE_PCT}%）`,
    needGlyph && !glyph3 && '找一樣的字還沒到第 3 級',
  ].filter(Boolean)
  return { ok: !lacks.length, need: lacks.join('；') }
}

/** 4 選 1 的門檻：第 3 級的找字照 mastery 熟練 */
export function glyph4Ready(attempts: readonly Attempt[]): Firm {
  const f = firmOf(attempts, 'zhglyph:', (a) => a.level === 3)
  return f.ok ? f : { ok: false, need: `第 3 級找字還在練（${f.need}）` }
}

/** 加長版要不要退回短版：退了（或開門）以後、最近 2 週加長版的選圖，最近 6 題第一次就對 ≤ 3 題 */
export function longSlipping(attempts: readonly Attempt[], g: GateKv, today: string): boolean {
  const from = g.downOn ?? ''
  const xs = attempts
    .filter((a) => isText(a) && isLong(a) && counts(a) && a.date > from && dayNo(today) - dayNo(a.date) < BACK_DAYS)
    .sort((x, y) => x.ts - y.ts)
    .slice(-BACK_OF)
  return xs.length >= BACK_OF && xs.filter((a) => a.firstTryCorrect).length <= BACK_MAX_RIGHT
}

// ── 進課時更新門 ──────────────────────────────────────────────

/**
 * 進中文課時算一次（./progress.ts 的 stage4Today）：該開的門開、加長版該退就退、該升回去就升。回傳新的 kv（沒變就是同一個物件）。
 * 暫停中、總開關關著：不開門、不動。同一天最多開一道門。
 */
export function advance(kv: Stage4Kv, attempts: readonly Attempt[], today: string, paused = false): Stage4Kv {
  if (!STAGE4_ON || paused) return kv
  let out = kv
  let openedToday = GATE_IDS.some((id) => kv[id]?.opened === today)
  const L = kv['zh-long']
  if (!L) {
    if (!openedToday && longReady(attempts).ok) {
      out = { ...out, 'zh-long': { opened: today, level: 1 } }
      openedToday = true
    }
  } else if (L.level === 0) {
    // 退回短版的那一天以後，又過了一次同樣的門檻（不再看找字的級數：那是另一道門的事）
    if (longReady(attempts, L.downOn, false).ok) out = { ...out, 'zh-long': { ...L, level: 1 } }
  } else if (longSlipping(attempts, L, today)) out = { ...out, 'zh-long': { ...L, level: 0, downOn: today } }
  const G = kv['zh-glyph4']
  const longBefore = out['zh-long'] && out['zh-long'].opened < today
  if (!G && !openedToday && longBefore && glyph4Ready(attempts).ok) out = { ...out, 'zh-glyph4': { opened: today } }
  return out
}

// ── 家長區看的 ────────────────────────────────────────────────

/** 每道門現在怎樣（家長區 T-150 P 讀；不改 kv） */
export function gates(attempts: readonly Attempt[], kv: Stage4Kv, today: string): Gate[] {
  void today
  return GATE_IDS.map((id): Gate => {
    const g = STAGE4_ON ? kv[id] : undefined
    if (id === 'zh-long') {
      if (g) return { id, label: LABEL[id], open: true, openedOn: g.opened, level: g.level ?? 1, need: g.level === 0 ? '最近答得不太好，先用短版複習；再答穩就回到加長版' : '' }
      return { id, label: LABEL[id], open: false, need: STAGE4_ON ? longReady(attempts).need || '下次進中文課就開' : '4 歲內容總開關關著' }
    }
    const last = attempts.filter((a) => isGlyph(a) && counts(a)).sort((x, y) => x.ts - y.ts).pop()
    if (g) return { id, label: LABEL[id], open: true, openedOn: g.opened, level: last?.level, need: last && last.level < 4 ? '最近答得不太好，先回到 3 選 1；再答穩就回到 4 選 1' : '' }
    const need = !STAGE4_ON
      ? '4 歲內容總開關關著'
      : !kv['zh-long']
        ? '加長版課文開了以後，隔天以後才開'
        : glyph4Ready(attempts).need || '下次進中文課就開'
    return { id, label: LABEL[id], open: false, need }
  })
}

// ── 這一堂出什麼 ──────────────────────────────────────────────

/** 這一堂的 4 歲內容（./steps.ts 的 stepsOf 照這個排） */
export interface Stage4Plan {
  /** 複習舊篇用加長版 */
  long: boolean
  /** 這一堂最多幾題找字用 4 選 1（'half'：找字的一半，至少 1 題） */
  glyph4: number | 'half'
  /** 第一題 4 選 1 先讓手示範（開門以後第一次出 4 選 1） */
  demo4: boolean
}

export const NO_STAGE4: Stage4Plan = { long: false, glyph4: 0, demo4: false }

/**
 * 這一堂怎麼混著出。idx 是第幾次課（course.ts 的 Plan.idx，舊篇是 3 次前的新篇）：頭 14 天加長版只在 idx 是偶數的那次複習用（每 2 次 1 次）。
 * glyphLevel 是找字現在的級數（./match.ts 的 GlyphState.level）：退回 3 的時候就不出 4 選 1。
 */
export function planToday(kv: Stage4Kv, today: string, idx: number, glyphLevel: number, paused = false): Stage4Plan {
  if (!STAGE4_ON || paused) return NO_STAGE4
  const L = kv['zh-long']
  const G = kv['zh-glyph4']
  const fresh = isFresh(L, today) || isFresh(G, today)
  const long = !!L && L.level !== 0 && (!isFresh(L, today) || idx % 2 === 0)
  const can4 = !!G && glyphLevel >= 4
  // 頭 14 天每堂最多 1 個 4 歲回合：這一堂已經用加長版，就不再出 4 選 1
  const glyph4 = !can4 ? 0 : fresh ? (long ? 0 : 1) : 'half'
  return { long, glyph4, demo4: !!G && !G.demoed && glyph4 !== 0 }
}

/** 找字最多到第幾級（./progress.ts 的 saveGlyph）：4 選 1 的門開了、沒暫停才到 4 */
export const glyphMax = (kv: Stage4Kv, paused = false): 3 | 4 => (STAGE4_ON && !paused && kv['zh-glyph4'] ? 4 : 3)
