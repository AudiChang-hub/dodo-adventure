// 「真的學會了嗎？」（T-109，家長：孩子把 App 當遊戲在玩，照自己的想法亂試）：
// 某個概念照新規則熟練了（最近 5 次聽完才答、對 4 次以上，lib/heard.ts），家長區出一張卡，請家長離開螢幕問一次。
// - 「他會」：記下來，家長區標「家長確認過」。
// - 「還不會」：這個概念退回練習——孩子端的熟練度退到 1 格、聽完才答的紀錄清掉（lib/adaptive.ts 的 applyChecks），
//   家長區的熟練、這張卡都只看這個決定之後的作答；之後又熟練了，卡會再出來。
// - 決定存在這台裝置（kv check:learned），登入時也寫到雲端 users/{uid}/meta/check，平板同步時讀回來合併（同一個概念以比較晚的為準），
//   跟故事審稿（lib/review.ts）同一個做法：家長常用手機看。重置學習進度時本機、雲端一起清掉（lib/reset.ts、lib/reset-cloud.ts）。
// 熟練的判斷和問法是純函式（單元測試在 scripts/test-heard.ts）；下面才是存取。
import { useSyncExternalStore } from 'react'
import { getKV, isLed, phaseOf, setKV, type Attempt } from './db'
import { HEARD_WINDOW, choicesOf, heardNeed } from './heard'
import { listenItem } from './listen-report'
import { LESSON_LETTERS } from '../lessons/english/data'

export interface Check {
  /** true：他會；false：還不會 */
  ok: boolean
  /** 家長按下去的時間（合併兩台裝置時，比較晚的為準；「還不會」只看這之後的作答） */
  at: number
}

export const CHECK_KV = 'check:learned'

// ── 純函式 ───────────────────────────────────────────────────

/**
 * 這個概念照新規則熟練了沒：since 之後、聽完才答（heard: true）、不是手先示範過的，最近 HEARD_WINDOW 次裡對的次數達到 heardNeed。
 * T-109 之前的舊紀錄沒有 heard，不算（這張卡只給新規則確認過的）。
 */
export function heardMastered(attempts: readonly Attempt[], skill: string, since = 0): boolean {
  const mine = attempts
    .filter((a) => a.skill === skill && a.heard === true && a.ts > since && phaseOf(a) !== 'teach' && !isLed(a) && listenItem(a) && choicesOf(a) >= 2)
    .sort((x, y) => x.ts - y.ts)
    .slice(-HEARD_WINDOW)
  if (mine.length < HEARD_WINDOW) return false
  // 字母題只算跟答案同樣大小寫的選項（一直點大的不算學會，choicesOf；猜都猜得中的上面已經濾掉）
  const need = heardNeed(Math.min(...mine.map((a) => choicesOf(a))))
  return need != null && mine.filter((a) => a.firstTryCorrect).length >= need
}

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** 家長怎麼問（離開螢幕、用家裡的東西）：用家長看得懂的中文，英文句子照 App 裡的說法 */
export function askFor(skill: string): string {
  const [kind, v = ''] = skill.split(':')
  if (kind === 'letter') {
    const L = v.toUpperCase()
    const big = v === L
    return `拿兩張紙，一張寫大寫 ${L}、一張寫小寫 ${L.toLowerCase()}，問他：「Where is ${big ? 'big' : 'little'} ${big ? L : L.toLowerCase()}?」看他指哪一張。`
  }
  if (kind === 'phonics') {
    const ws = LESSON_LETTERS.find((x) => x.l === v)?.starts.map((w) => w.w) ?? []
    const eg = ws.length ? `（例如 ${ws.slice(0, 2).join('、')}）` : ''
    return `拿三樣東西或三張圖，其中一樣是 ${v.toUpperCase()} 開頭的${eg}，問他：「Which one starts with ${v.toUpperCase()}?」`
  }
  if (kind === 'compare')
    return v === 'less'
      ? '左手放 2 個、右手放 5 個小東西（積木、餅乾都可以），問他：「Which side has fewer?」看他指哪一邊。'
      : '左手放 2 個、右手放 5 個小東西（積木、餅乾都可以），問他：「Which side has more?」看他指哪一邊。'
  const n = Number(v)
  const say = NUM[n] ?? v
  if (kind === 'num') return `在三張紙上寫 ${n} 和另外兩個學過的數字，問他：「Where is ${say}?」`
  if (kind === 'count') return `在桌上放 ${n} 個小東西，問他：「How many?」讓他自己數，說出或比出幾個。`
  if (kind === 'give') return `放一堆小東西在他面前，跟他說：「Give me ${say}!」看他是不是剛好拿 ${n} 個給你。`
  return '用家裡的東西，照 App 裡的問法問他一次。'
}

export interface CheckCard {
  skill: string
  /** 找大 S、哪邊比較多… */
  label: string
  ask: string
}

/**
 * 現在要出的確認卡：照新規則熟練了、家長還沒說「他會」的概念。按過「還不會」的，那之後又熟練了才再出來。
 * 最近熟練的在前面。
 */
export function checkCards(attempts: readonly Attempt[], checks: Readonly<Record<string, Check>>): CheckCard[] {
  const skills = new Map<string, { label: string; last: number }>()
  for (const a of attempts) {
    const it = a.heard === true ? listenItem(a) : null
    if (!it) continue
    // 「找數字 3」「拿 3 個給波波」：概念用技能分（letter:S、num:3…）
    const s = skills.get(a.skill)
    if (!s || s.last < a.ts) skills.set(a.skill, { label: it.label, last: a.ts })
  }
  const out: (CheckCard & { last: number })[] = []
  for (const [skill, { label, last }] of skills) {
    const c = checks[skill]
    if (c?.ok) continue
    if (!heardMastered(attempts, skill, c ? c.at : 0)) continue
    out.push({ skill, label: labelOf(skill, label), ask: askFor(skill), last })
  }
  return out.sort((x, y) => y.last - x.last).map(({ last: _l, ...c }) => c)
}

/** 卡上的名字：有幾個的那一題用技能分（count:4 → 數 4 個） */
const labelOf = (skill: string, label: string) => (skill.startsWith('count:') ? `數出 ${skill.slice(6)} 個（How many?）` : label)

/** 家長按「還不會」的概念：家長區的熟練（學習進度、下一步準備度）只看這之後的作答 */
export function afterChecks<T extends Pick<Attempt, 'skill' | 'ts'>>(attempts: readonly T[], checks: Readonly<Record<string, Check>>): T[] {
  return attempts.filter((a) => {
    const c = checks[a.skill]
    return !c || c.ok || a.ts > c.at
  })
}

/** 家長確認過「他會」的概念 */
export const confirmed = (checks: Readonly<Record<string, Check>>) => Object.keys(checks).filter((k) => checks[k].ok)

/** 和雲端的合併（純函式）：同一個概念以比較晚的決定為準 */
export function mergeChecks(local: Readonly<Record<string, Check>>, remote: Record<string, Check> | null | undefined): Record<string, Check> {
  const next = { ...local }
  for (const [k, v] of Object.entries(remote ?? {})) {
    if (!v || typeof v.at !== 'number' || typeof v.ok !== 'boolean') continue
    if (!next[k] || next[k].at < v.at) next[k] = v
  }
  return next
}

// ── 存取（這台裝置的 kv、雲端）────────────────────────────────

let checks: Record<string, Check> = {}
const subs = new Set<() => void>()
const listeners = new Set<(c: Record<string, Check>) => void>()
const emit = () => {
  subs.forEach((f) => f())
  listeners.forEach((f) => f(checks))
}

export async function loadChecks() {
  checks = await getKV<Record<string, Check>>(CHECK_KV, {}).catch(() => ({}))
  emit()
  return checks
}

export const allChecks = () => checks

/** 決定有變（家長按了、從雲端合併進來）：孩子端的熟練度跟著退（lib/adaptive.ts 的 applyChecks） */
export function onChecks(fn: (c: Record<string, Check>) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 家長按「他會」或「還不會」 */
export async function decideCheck(skill: string, ok: boolean) {
  checks = { ...checks, [skill]: { ok, at: Date.now() } }
  await setKV(CHECK_KV, checks)
  emit()
  // 登入時寫到雲端，平板下次同步就拿得到（沒網路、沒登入就只存這台）
  void import('./sync').then((m) => m.syncChecks()).catch(() => {})
}

/** 和雲端的合併：回傳合併後的全部（寫回雲端用） */
export async function mergeRemoteChecks(remote: Record<string, Check> | null | undefined): Promise<Record<string, Check>> {
  const next = mergeChecks(checks, remote)
  if (JSON.stringify(next) !== JSON.stringify(checks)) {
    checks = next
    await setKV(CHECK_KV, checks)
    emit()
  }
  return checks
}

export function useChecks(): Record<string, Check> {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => checks,
  )
}
