// 下一步準備度（docs/全球幼教指引-3到4歲.md 第七章 NEXT-1～6，現況對照 A2、A4）：
// 讀三堂課的作答紀錄，算每一條做到了沒、還差什麼，給家長看「可不可以開始 4 歲的內容」。純函式，不碰資料庫、不碰畫面。
//
// 「熟練」比孩子端的熟練度（lib/adaptive.ts 的盒子，排複習用）嚴格，因為這裡要決定能不能往下走，不能被亂點騙過（A4）：
//   1. 只算三選一以上的選擇題（二選一亂點也有一半會對）；數數、描字這種不是選擇題的（選項是空的）照算。
//      比多少天生只有兩邊可以選：改成最近 10 題要對 9 題（亂點連對 9 題的機會不到 1%）。
//   2. 只算「第一次就答對」。
//   3. 最近 10 題至少對 8 題。
//   4. 這 10 題分布在至少 3 個不同的日子（同一天答對 10 次不算）。
//   5. 隔一段時間還記得：有一次是隔了至少 2 天沒練、再考還是第一次就答對。
import { phaseOf, type Attempt } from './db'

export const RECENT = 10
export const NEED_RIGHT = 8
/** 比多少（只有兩邊）：最近 10 題要對 9 題 */
export const NEED_RIGHT_BINARY = 9
export const MIN_DAYS = 3
/** 隔幾天沒練再考還記得，才算「記得住」 */
export const RETAIN_GAP_DAYS = 2
export const MIN_OPTIONS = 3

/** 天生只有兩個選擇的技能（比多少：哪邊比較多／少） */
const BINARY = (skill: string) => skill.startsWith('compare:')

const dayNo = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** 這一題能不能拿來判斷熟練：不是教學卡；選擇題要三選一以上（比多少例外） */
export function counts(a: Pick<Attempt, 'phase' | 'options' | 'skill'>): boolean {
  if (phaseOf(a as Attempt) === 'teach') return false
  const n = a.options?.length ?? 0
  return n === 0 || n >= MIN_OPTIONS || BINARY(a.skill)
}

export interface Mastery {
  skill: string
  ok: boolean
  /** 拿來判斷的最近幾題（最多 10 題） */
  recent: number
  right: number
  days: number
  retained: boolean
  /** 還差什麼（ok 時是空字串） */
  need: string
}

/** 一個技能熟練了沒（attempts 不用先排序、可以混著別的技能） */
export function mastery(attempts: readonly Attempt[], skill: string): Mastery {
  const mine = attempts.filter((a) => a.skill === skill && phaseOf(a) !== 'teach').sort((x, y) => x.ts - y.ts)
  const usable = mine.filter(counts)
  const last = usable.slice(-RECENT)
  const right = last.filter((a) => a.firstTryCorrect).length
  const days = new Set(last.map((a) => a.date)).size
  // 記得住：這一題之前最近一次練是隔了 RETAIN_GAP_DAYS 天以上，這一題還是第一次就對
  let retained = false
  for (let i = 0; i < mine.length && !retained; i++) {
    const a = mine[i]
    if (!a.firstTryCorrect || !counts(a)) continue
    const prev = mine.slice(0, i).filter((b) => b.date !== a.date).pop()
    if (prev && dayNo(a.date) - dayNo(prev.date) >= RETAIN_GAP_DAYS) retained = true
  }
  const need = BINARY(skill) ? NEED_RIGHT_BINARY : NEED_RIGHT
  const lacks: string[] = []
  if (last.length < RECENT) lacks.push(`還要再答 ${RECENT - last.length} 題`)
  else if (right < need) lacks.push(`最近 ${RECENT} 題對 ${right} 題（要 ${need} 題）`)
  if (days < MIN_DAYS) lacks.push(`分在 ${days} 天（要 ${MIN_DAYS} 天）`)
  if (!retained) lacks.push(`還沒有隔 ${RETAIN_GAP_DAYS} 天再考`)
  return { skill, ok: !lacks.length, recent: last.length, right, days, retained, need: lacks.join('、') }
}

/** 最近 n 題（不分技能）的正確率：只算可以判斷的題、第一次就對 */
export function recentRate(attempts: readonly Attempt[], match: (a: Attempt) => boolean, n: number): { n: number; right: number } {
  const xs = attempts.filter((a) => match(a) && counts(a)).sort((x, y) => x.ts - y.ts).slice(-n)
  return { n: xs.length, right: xs.filter((a) => a.firstTryCorrect).length }
}

// ── 上課紀錄（中途離開、提示：NEXT-4、NEXT-6）───────────────────

/** 一堂課：開始、上完（lessons/LessonScreen.tsx 寫進 kv 的 lesson.log） */
export interface LessonRun {
  subject: 'english' | 'chinese' | 'math'
  date: string
  start: number
  done?: number
}

// ── 家長觀察（NEXT-5、NEXT-6）────────────────────────────────

/** 家長每月勾一次的觀察清單（App 量不到的；指引 NEXT-5 的 8 項） */
export const OBSERVE = [
  { id: 'retell', text: '說得出故事裡的 1～2 件事' },
  { id: 'sentence', text: '會說 4～5 個字以上的句子' },
  { id: 'why', text: '會問「為什麼」' },
  { id: 'turns', text: '大人提醒下會輪流' },
  { id: 'song', text: '跟著唱完一首兒歌' },
  { id: 'draw', text: '會畫圓、畫直線' },
  { id: 'feelings', text: '說得出 4 種情緒' },
  { id: 'three', text: '拿得出「3 個」給你' },
] as const
export const OBSERVE_NEED = 5
/** 觀察多久要重新勾一次 */
export const OBSERVE_DAYS = 31

export interface Observation {
  date: string
  checks: string[]
  /** 家長覺得孩子有壓力（NEXT-6 的警訊） */
  stress: boolean
}

// ── 準備度 ─────────────────────────────────────────────────────

export type NextId = 'NEXT-1' | 'NEXT-2' | 'NEXT-3' | 'NEXT-4' | 'NEXT-5' | 'NEXT-6'

export interface NextItem {
  id: NextId
  area: string
  /** 做到了（NEXT-6 是「沒有警訊」） */
  ok: boolean
  /** 一句話：做到了什麼、還差什麼 */
  detail: string
}

export interface Readiness {
  items: NextItem[]
  /** NEXT-1～5 都做到、NEXT-6 沒有警訊 */
  ready: boolean
  advice: string
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const pct = (r: { n: number; right: number }) => (r.n ? Math.round((100 * r.right) / r.n) : 0)

/** 沒熟練的技能，用家長看得懂的話列出來（例：「4、5」） */
function pending(ms: Mastery[], label: (s: string) => string): string {
  return ms
    .filter((m) => !m.ok)
    .map((m) => label(m.skill))
    .join('、')
}

export interface ReadinessInput {
  attempts: readonly Attempt[]
  runs: readonly LessonRun[]
  observation: Observation | null
  today: string
}

export function readiness({ attempts, runs, observation, today }: ReadinessInput): Readiness {
  const m = (skill: string) => mastery(attempts, skill)
  const num = (s: string) => s.split(':')[1]

  // NEXT-1 數學：有幾個、找數字、拿 N 個給波波的 1～5；比多少的多和少
  const count = range(1, 5).map((n) => m(`count:${n}`))
  const find = range(1, 5).map((n) => m(`num:${n}`))
  const give = range(1, 5).map((n) => m(`give:${n}`))
  const cmp = [m('compare:more'), m('compare:less')]
  const mathLeft = [
    pending(count, num) && `有幾個 ${pending(count, num)}`,
    pending(find, num) && `找數字 ${pending(find, num)}`,
    pending(give, num) && `拿給波波 ${pending(give, num)}`,
    pending(cmp, (s) => (s.endsWith('more') ? '多' : '少')) && `比多少（${pending(cmp, (s) => (s.endsWith('more') ? '多' : '少'))}）`,
  ].filter(Boolean)
  const n1: NextItem = { id: 'NEXT-1', area: '數學', ok: !mathLeft.length, detail: mathLeft.length ? `還在練：${mathLeft.join('；')}` : '1～5 的數量、找數字、拿給波波、比多少都熟練了' }

  // NEXT-2 英文：大寫字母熟練 ≥ 10 個；單字選圖最近 20 題 ≥ 80%
  const upper = LETTERS.map((L) => m(`letter:${L}`)).filter((x) => x.ok)
  const words = recentRate(attempts, (a) => a.skill.startsWith('phonics:'), 20)
  const n2ok = upper.length >= 10 && words.n >= 20 && pct(words) >= 80
  const n2: NextItem = {
    id: 'NEXT-2',
    area: '英文',
    ok: n2ok,
    detail: `大寫字母熟練 ${upper.length} 個（要 10 個${upper.length ? `：${upper.map((x) => num(x.skill)).join(' ')}` : ''}）；單字選圖最近 ${words.n} 題對 ${pct(words)}%（要 20 題、80%）`,
  }

  // NEXT-3 中文：紅字選圖最近 20 題 ≥ 90%（三選一）。故事題還沒做，先不算
  const zh = recentRate(attempts, (a) => a.skill.startsWith('zhtext:'), 20)
  const n3: NextItem = { id: 'NEXT-3', area: '中文', ok: zh.n >= 20 && pct(zh) >= 90, detail: `紅字選圖最近 ${zh.n} 題對 ${pct(zh)}%（要 20 題、90%）；「故事裡發生了什麼」的題目還沒做，先不算` }

  // NEXT-4 學習的樣子：最近 2 週每堂課的提示平均 ≤ 1 次、中途離開 ≤ 20%
  const from = dayNo(today) - 13
  const recentRuns = runs.filter((r) => dayNo(r.date) >= from)
  const done = recentRuns.filter((r) => r.done)
  const left = recentRuns.length ? Math.round((100 * (recentRuns.length - done.length)) / recentRuns.length) : 0
  const lessonA = attempts.filter((a) => dayNo(a.date) >= from && (a.station === 'english' || a.station === 'math' || a.station === 'mandarin') && phaseOf(a) !== 'teach')
  const hints = lessonA.filter((a) => a.hintUsed).length
  const perLesson = done.length ? hints / done.length : 0
  const n4: NextItem =
    recentRuns.length < 3
      ? { id: 'NEXT-4', area: '學習的樣子', ok: false, detail: `最近 2 週上了 ${recentRuns.length} 堂，上 3 堂以後才算` }
      : {
          id: 'NEXT-4',
          area: '學習的樣子',
          ok: perLesson <= 1 && left <= 20,
          detail: `最近 2 週 ${recentRuns.length} 堂：每堂提示平均 ${perLesson.toFixed(1)} 次（要 ≤ 1）、中途離開 ${left}%（要 ≤ 20%）`,
        }

  // NEXT-5 家長觀察：一個月內勾過，8 項至少 5 項做得到
  const fresh = observation && dayNo(today) - dayNo(observation.date) < OBSERVE_DAYS
  const checked = fresh ? observation!.checks.filter((c) => OBSERVE.some((o) => o.id === c)).length : 0
  const n5: NextItem = !fresh
    ? { id: 'NEXT-5', area: '家長觀察', ok: false, detail: observation ? `上次勾是 ${observation.date}，超過一個月了，請再勾一次` : '還沒勾過（在下面勾，每月一次）' }
    : { id: 'NEXT-5', area: '家長觀察', ok: checked >= OBSERVE_NEED, detail: `${observation!.date} 勾了 ${checked} 項做得到（要 ${OBSERVE_NEED} 項）` }

  // NEXT-6 警訊：家長覺得有壓力；最近一週中途離開變多（> 40%，而且比前一週多）
  const week = (a: number, b: number) => runs.filter((r) => dayNo(r.date) > dayNo(today) - a && dayNo(r.date) <= dayNo(today) - b)
  const leftRate = (rs: LessonRun[]) => (rs.length ? rs.filter((r) => !r.done).length / rs.length : 0)
  const thisWeek = week(7, 0)
  const lastWeek = week(14, 7)
  const leaving = thisWeek.length >= 3 && leftRate(thisWeek) > 0.4 && leftRate(thisWeek) > leftRate(lastWeek)
  const stress = !!(fresh && observation!.stress)
  const warns = [stress && '家長覺得孩子有壓力', leaving && `最近一週中途離開 ${Math.round(leftRate(thisWeek) * 100)}%，比前一週多`].filter(Boolean)
  const n6: NextItem = { id: 'NEXT-6', area: '警訊', ok: !warns.length, detail: warns.length ? warns.join('；') : '沒有' }

  const items = [n1, n2, n3, n4, n5, n6]
  const ready = items.every((x) => x.ok)
  const lacking = items.slice(0, 5).filter((x) => !x.ok).map((x) => x.area)
  const advice = ready
    ? '建議：可以開始 4 歲的內容（還沒做好，PM 會再排）。'
    : !n6.ok
      ? '建議：先不要往下走，照現在的步調玩，多陪他。'
      : `建議：再等等，照現在的內容繼續（還差：${lacking.join('、')}）。滿 4 歲時，還沒做到的領域繼續照 3 歲的內容走。`
  return { items, ready, advice }
}
