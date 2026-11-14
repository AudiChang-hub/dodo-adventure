// 家長區「4 歲的內容」讀的三科門（T-150 P，設計稿 docs/T-150-4歲階段設計.md 第二節案 A、第六節、第七節的 stage4.ts API）。
// 純函式（不碰資料庫、不碰畫面），scripts/test-stage4-registry.ts 直接測；畫面在 ./NextStep.tsx。
//
// 每科一個 stage4.ts（src/lessons/<科>/stage4.ts），形狀照約定：
//   export function gates(attempts, kv, today): Gate[]
//   export const STAGE4_KEY（門存的 kv）、PAUSE_KEY（暫停開關的 kv，存 true 就暫停）
// 還沒有 stage4.ts 的科目放 null，家長區顯示「尚未提供」。
//
// ★ 英文、數學的 stage4.ts 合併以後，只要把下面那一行 `const EN ... = null` / `const MATH ... = null`
//   換成 `import * as EN from '../../lessons/english/stage4'` / `import * as MATH from '../../lessons/math/stage4'`。
import type { Attempt } from '../../lib/db'
import * as ZH from '../../lessons/chinese/stage4'

/** 一道門（三科同一個形狀，設計稿第七節） */
export interface Gate {
  id: string
  label: string
  open: boolean
  /** 開的那一天（YYYY-MM-DD） */
  openedOn?: string
  /** 還差什麼（開了的話是現在的狀況，例如退一級了） */
  need: string
  /** 現在的難度級 */
  level?: number
}

/** 一科的 stage4.ts 要給家長區的東西 */
export interface Stage4Module {
  /** 各科的 kv 型別不同（中文是 Stage4Kv），家長區只把讀出來的值原封不動傳回去，所以這裡是 never */
  gates: (attempts: readonly Attempt[], kv: never, today: string) => Gate[]
  STAGE4_KEY?: string
  PAUSE_KEY?: string
}

const EN: Stage4Module | null = null
import * as MATH from '../../lessons/math/stage4'

export type Subject = 'zh' | 'en' | 'math'

export interface Stage4Subject {
  id: Subject
  /** 家長看的科目名稱 */
  name: string
  /** 門存的 kv（lesson.<科>.stage4） */
  kvKey: string
  /** 暫停開關的 kv（stage4.paused.<科>）：存 true 就暫停 */
  pauseKey: string
  /** 這一科的 stage4.ts；還沒有就是 null（尚未提供） */
  mod: Stage4Module | null
}

/** 三科，照家長區顯示的順序。kv 的名字先用各科 stage4.ts 自己 export 的，沒有才照命名規則 */
const entry = (id: Subject, name: string, folder: string, mod: Stage4Module | null): Stage4Subject => ({
  id,
  name,
  kvKey: mod?.STAGE4_KEY ?? `lesson.${folder}.stage4`,
  pauseKey: mod?.PAUSE_KEY ?? `stage4.paused.${id}`,
  mod,
})

export const STAGE4_SUBJECTS: readonly Stage4Subject[] = [
  entry('zh', '中文', 'chinese', ZH),
  entry('en', '英文', 'english', EN),
  entry('math', '數學', 'math', MATH),
]

/** 剛開的頭幾天：每堂最多 1 個 4 歲回合（設計稿第二節「怎麼混著出」） */
export const FRESH_DAYS = 14

const dayNo = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** 11/20（同一年不寫年份） */
export const shortDate = (date: string, today: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return y === Number(today.slice(0, 4)) ? `${m}/${d}` : `${y}/${m}/${d}`
}

/** 家長區一道門那一行要寫的字 */
export interface GateRow {
  id: string
  label: string
  state: 'open' | 'closed' | 'paused'
  /** 開了沒、哪天開的（例：「11/20 開的」「還沒開」） */
  status: string
  /** 現在每堂出多少（開了才有） */
  dose?: string
  /** 目前的級數（有才寫） */
  level?: string
  /** 還差什麼／現在的狀況（沒有就空字串） */
  need: string
}

/** 一道門 → 家長看的一行。暫停中：開了的門記著，但孩子端照 3 歲的上；沒開的門暫停中不會開 */
export function gateRow(g: Gate, today: string, paused: boolean): GateRow {
  const level = g.level == null ? undefined : `目前第 ${g.level} 級`
  if (g.open) {
    const opened = g.openedOn ? `${shortDate(g.openedOn, today)} 開的` : '已經開了'
    const age = g.openedOn ? dayNo(today) - dayNo(g.openedOn) : FRESH_DAYS
    const dose = paused
      ? '暫停中，每堂照 3 歲的上'
      : age < FRESH_DAYS
        ? `剛開（頭 ${FRESH_DAYS} 天）：每堂最多 1 個 4 歲回合`
        : '每堂最多一半是 4 歲回合'
    return { id: g.id, label: g.label, state: paused ? 'paused' : 'open', status: opened, dose, level, need: g.need }
  }
  return { id: g.id, label: g.label, state: paused ? 'paused' : 'closed', status: paused ? '還沒開（暫停中不會開）' : '還沒開', level, need: g.need ? `還差：${g.need}` : '' }
}

/** 家長區一科的樣子 */
export interface SubjectView {
  subject: Stage4Subject
  /** false：這一科還沒有 4 歲內容（尚未提供） */
  ready: boolean
  paused: boolean
  rows: GateRow[]
}

/** 一科現在怎樣：kv 是那一科 kvKey 讀出來的值（沒有就 {}） */
export function subjectView(s: Stage4Subject, attempts: readonly Attempt[], kv: unknown, paused: boolean, today: string): SubjectView {
  if (!s.mod) return { subject: s, ready: false, paused, rows: [] }
  let gs: Gate[] = []
  try {
    gs = s.mod.gates(attempts, (kv ?? {}) as never, today)
  } catch {
    gs = []
  }
  return { subject: s, ready: true, paused, rows: gs.map((g) => gateRow(g, today, paused)) }
}
