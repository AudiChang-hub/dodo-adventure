// 出門任務卡（PRD §5.11）：依這週的作答紀錄產生任務，記下爸爸勾了哪些、回到 App 後孩子說看到了什麼。
//
// 一週從星期一開始，卡片的 key 是那週一的日期（2026-10-26）。
// 內容取「那週最後一天（或今天）往前 7 天」的紀錄：星期一打開也看得到上週學的，不會是空的；
// 週中再學新東西，卡片會跟著更新。爸爸勾過的任務一定留在卡片上，不會因為內容更新而消失。
//
// 資料只存在這台裝置的 kv（outing.ticks、outing.recall），不上傳：雲端同步只同步作答紀錄與設定。
// 回到 App 的「你有看到 bus 嗎？」不寫進 attempts，所以不會影響熟練度、答對率與作答紀錄。
import { db, getKV, setKV, today, type Attempt } from './db'
import { fnv1a } from './hash'
import { vocab, VOCAB } from '../content/vocab'
import { COLORS, SHAPES } from '../content/park'
import { upper, PHONICS } from '../content/letters'
import { DIR_ZH, DIRS, type Dir } from '../content/code'
import { COLOR_WHERE, COMMON_SIGHTS, findable, NUM_EN, NUM_ZH, SHAPE_WHERE, THINK, type ThinkKind, type Track } from '../content/outing'

// ── 日期 ───────────────────────────────────────────────────
const parse = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}
export const addDays = (d: string, n: number) => {
  const x = parse(d)
  return today(new Date(x.getFullYear(), x.getMonth(), x.getDate() + n))
}
/** 這一天所在那週的星期一 */
export function weekOf(d: string = today()): string {
  const dow = parse(d).getDay()
  return addDays(d, dow === 0 ? -6 : 1 - dow)
}
/** 卡片取哪幾天的紀錄：那週最後一天（還沒到就用今天）往前 7 天 */
export function windowOf(week: string, now: string = today()) {
  const end = addDays(week, 6) < now ? addDays(week, 6) : now
  return { from: addDays(end, -6), to: end }
}
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`

// ── 這週學了什麼 ───────────────────────────────────────────
export type LearnedKind = 'vocab' | 'color' | 'num' | 'phonics' | 'shape' | 'letter' | 'dir'

export interface Learned {
  kind: LearnedKind
  id: string
  en: string
  zh: string
  score: number
}

/** 把一個技能代碼對到「學了什麼」；不是詞、顏色、數字、字母音、方向的技能回傳 null */
function learnedOf(skill: string): Omit<Learned, 'score'> | null {
  const [k, v] = skill.split(':')
  if (!v) return null
  if (k === 'vocab' || k === 'sound') {
    const e = VOCAB.find((x) => x.id === v)
    return e ? { kind: 'vocab', id: e.id, en: e.en, zh: e.zh } : null
  }
  if (k === 'color') {
    const c = COLORS.find((x) => x.id === v)
    return c ? { kind: 'color', id: c.id, en: c.en, zh: `${c.zh}色` } : null
  }
  if (k === 'num' || k === 'count') {
    const n = Number(v)
    return n >= 1 && n <= 10 ? { kind: 'num', id: String(n), en: NUM_EN[n], zh: NUM_ZH[n] } : null
  }
  if (k === 'phonics') {
    const u = PHONICS.find((x) => x.letter === v)
    return u ? { kind: 'phonics', id: u.letter, en: u.ipa, zh: `${upper(u.letter)} 的音` } : null
  }
  if (k === 'shape') {
    const s = SHAPES.find((x) => x.id === v)
    return s ? { kind: 'shape', id: s.id, en: s.en, zh: s.zh } : null
  }
  if (k === 'letter' || k === 'word') return /^[A-Z]$/.test(v) ? { kind: 'letter', id: v, en: v, zh: `字母 ${v}` } : null
  if (k === 'arrow' && (DIRS as string[]).includes(v)) return { kind: 'dir', id: v, en: v, zh: DIR_ZH[v as Dir] }
  return null
}

/**
 * 這幾天學過的東西，依「接觸多寡」排序：每一筆紀錄（教學、一起練、自己答都算）加 1，
 * 這週新教的（教學卡，不含答錯後重教）再加 2——新學的最值得出門複習。
 */
export function learnedFrom(attempts: Attempt[]): Learned[] {
  const m = new Map<string, Learned>()
  for (const a of attempts) {
    const l = learnedOf(a.skill)
    if (!l) continue
    const key = `${l.kind}:${l.id}`
    const cur = m.get(key) ?? { ...l, score: 0 }
    cur.score += 1 + (a.phase === 'teach' && !a.metrics?.retaught ? 2 : 0)
    m.set(key, cur)
  }
  return [...m.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

// ── 任務 ───────────────────────────────────────────────────
export type MissionIcon =
  | { t: 'emoji'; name: string }
  | { t: 'color'; hex: string }
  | { t: 'num'; n: number }
  | { t: 'letter'; s: string }
  | { t: 'shape'; id: string }
  | { t: 'think'; kind: ThinkKind }

export interface Mission {
  /** find:vocab:bus、find:color:red、think:seq……勾選紀錄用這個 id */
  id: string
  track: Track
  /** 運算思維的名稱，或「找找看」 */
  concept: string
  title: string
  /** 爸爸可以說的一句英文 */
  en: string
  dad: string
  /** 小字：去哪裡找、或為什麼這樣玩 */
  note: string
  where: string[]
  /** 這題用到的英文字（給爸爸看中英對照） */
  words: { en: string; zh: string }[]
  icon: MissionIcon
}

/** 由任務 id 還原一張任務；資料對不上（內容改版了）回傳 null */
export function missionOf(id: string, tied: Set<ThinkKind> = new Set()): Mission | null {
  const [group, kind, v] = id.split(':')
  if (group === 'think') {
    const t = THINK.find((x) => x.kind === kind)
    if (!t) return null
    return {
      id,
      track: 'think',
      concept: t.concept,
      title: t.title,
      en: t.en,
      dad: t.dad,
      note: tied.has(t.kind) ? t.tied : t.why,
      where: t.where,
      words: [],
      icon: { t: 'think', kind: t.kind },
    }
  }
  if (group !== 'find' || !v) return null
  if (kind === 'vocab') {
    const f = findable(v)
    const e = VOCAB.find((x) => x.id === v)
    if (!f || !e) return null
    return {
      id,
      track: 'lang',
      concept: '找找看',
      title: `找${e.zh}`,
      en: `Can you find ${f.art} ${e.en}?`,
      dad: `看到${e.zh}就停下來指給他看，一起說「${e.en}」。讓他先找到，你再跟著說。`,
      note: `哪裡找：${f.where}`,
      where: ['走路', '等車'],
      words: [{ en: e.en, zh: e.zh }],
      icon: { t: 'emoji', name: e.icon },
    }
  }
  if (kind === 'color') {
    const c = COLORS.find((x) => x.id === v)
    if (!c) return null
    return {
      id,
      track: 'lang',
      concept: '找找看',
      title: `找${c.zh}色的東西`,
      en: `Can you find something ${c.en}?`,
      dad: `輪流找${c.zh}色的東西，找到的人說「${c.en}!」。找到三個就換一個顏色。`,
      note: `哪裡找：${COLOR_WHERE[c.id] ?? '路上看看'}`,
      where: ['走路', '排隊'],
      words: [{ en: c.en, zh: `${c.zh}色` }],
      icon: { t: 'color', hex: c.hex },
    }
  }
  if (kind === 'num') {
    const n = Number(v)
    if (!(n >= 2 && n <= 10)) return null
    const counting = NUM_EN.slice(1, Math.min(n, 3) + 1).join(', ') + (n > 3 ? '…' : '!')
    return {
      id,
      track: 'math',
      concept: '數數',
      title: `找 ${n} 個一樣的東西`,
      en: `Can you find ${NUM_EN[n]} cars? ${counting[0].toUpperCase()}${counting.slice(1)}`,
      dad: `找 ${n} 個一樣的東西：${n} 台車、${n} 棵樹、${n} 隻鳥。一邊用手指一個一個點，一邊用英文數。`,
      note: '一個指一下、數一個字，數完再說一次總數。',
      where: ['等車', '排隊'],
      words: [{ en: NUM_EN[n], zh: NUM_ZH[n] }],
      icon: { t: 'num', n },
    }
  }
  if (kind === 'phonics') {
    const u = PHONICS.find((x) => x.letter === v)
    if (!u) return null
    const U = upper(u.letter)
    const ex = u.keys.map((k) => k.w)
    return {
      id,
      track: 'lang',
      concept: '找找看',
      title: `找 ${U} 開頭的東西`,
      en: `What starts like “${ex[0]}”?`,
      dad: `${U} 的音是 ${u.ipa}，像 ${ex.join('、')} 的開頭。看到 ${U} 開頭的東西，就把開頭的音說清楚：${ex[0][0]}-${ex[0][0]}-${ex[0]}！`,
      note: '只要開頭的音一樣就算數，不用會拼字。',
      where: ['走路', '逛超市'],
      words: ex.map((w) => ({ en: w, zh: VOCAB.find((x) => x.en === w)?.zh ?? '' })),
      icon: { t: 'letter', s: `${U}${u.letter}` },
    }
  }
  if (kind === 'shape') {
    const s = SHAPES.find((x) => x.id === v)
    if (!s) return null
    return {
      id,
      track: 'math',
      concept: '找找看',
      title: `找${s.zh}`,
      en: `Can you find a ${s.en}?`,
      dad: `找${s.zh}的東西，找到就用手指在空中畫一次，說「${s.en}」。`,
      note: `例如：${SHAPE_WHERE[s.id] ?? '路上看看'}`,
      where: ['走路', '等車'],
      words: [{ en: s.en, zh: s.zh }],
      icon: { t: 'shape', id: s.id },
    }
  }
  if (kind === 'letter') {
    if (!/^[A-Z]$/.test(v)) return null
    return {
      id,
      track: 'lang',
      concept: '找找看',
      title: `在招牌上找 ${v}`,
      en: `Can you find the letter ${v}?`,
      dad: `捷運站名、車牌、招牌上都有英文字母，一起找 ${v}，找到就說「${v}!」。`,
      note: '捷運站的英文站名最好找。',
      where: ['搭捷運', '走路'],
      words: [{ en: v, zh: `字母 ${v}` }],
      icon: { t: 'letter', s: v },
    }
  }
  return null
}

export interface OutingCard {
  week: string
  from: string
  to: string
  learned: Learned[]
  missions: Mission[]
}

/** 同一週每次產生都一樣、不同週輪流：用週一日期當種子排序 */
const seeded = (week: string, id: string) => fnv1a(`${week}:${id}`)

/**
 * 產生一週的任務卡：
 * - 「找找看」最多 3 題：每一類（詞、顏色、數字、字母音、形狀、字母）先各取最常接觸的一個，
 *   詞可以出兩題；再依接觸多寡挑。
 * - 思考題補到共 5 題（至少 2 題）：這週在 App 玩過相關技能的優先，其餘依週輪流；
 *   玩過的思考題比名額多時最多放到 6 題。
 * - keep：爸爸已經勾過的任務一定留著。
 */
export function buildCard(attempts: Attempt[], week: string, keep: string[] = [], now: string = today()): OutingCard {
  const { from, to } = windowOf(week, now)
  const inWeek = attempts.filter((a) => a.date >= from && a.date <= to)
  const learned = learnedFrom(inWeek)

  // 找找看
  const cand: { id: string; score: number; kind: LearnedKind }[] = []
  const perKind = new Map<LearnedKind, number>()
  for (const l of learned) {
    if (l.kind === 'dir') continue
    if (l.kind === 'vocab' && !findable(l.id)) continue
    if (l.kind === 'num' && Number(l.id) < 2) continue
    const n = perKind.get(l.kind) ?? 0
    if (n >= (l.kind === 'vocab' ? 2 : 1)) continue
    perKind.set(l.kind, n + 1)
    // 第二個詞排在其他類之後，讓卡片有變化
    cand.push({ id: `find:${l.kind}:${l.id}`, score: n ? l.score / 4 : l.score, kind: l.kind })
  }
  const finds = cand.sort((a, b) => b.score - a.score).slice(0, 3).map((c) => c.id)

  // 思考題
  const tied = new Set<ThinkKind>(THINK.filter((t) => inWeek.some((a) => t.skills.some((s) => a.skill.startsWith(s)))).map((t) => t.kind))
  const order = [...THINK].sort((a, b) => Number(tied.has(b.kind)) - Number(tied.has(a.kind)) || seeded(week, a.kind).localeCompare(seeded(week, b.kind)))
  const want = Math.min(6 - finds.length, Math.max(2, 5 - finds.length, tied.size))
  const thinks = order.slice(0, want).map((t) => `think:${t.kind}`)

  const ids = [...finds, ...thinks]
  for (const k of keep) if (!ids.includes(k)) ids.push(k)
  const missions = ids.map((id) => missionOf(id, tied)).filter((m): m is Mission => !!m)
  return { week, from, to, learned, missions }
}

export async function loadCard(week: string, keep: string[] = []): Promise<OutingCard> {
  const { from, to } = windowOf(week)
  const attempts = await db.attempts.where('date').between(from, to, true, true).toArray()
  return buildCard(attempts, week, keep)
}

/** 複製成文字（傳給家人、貼在記事本） */
export function cardText(c: OutingCard, ticks: Record<string, number> = {}): string {
  const words = c.learned.filter((l) => l.kind !== 'dir').slice(0, 6)
  const rows = [`豆豆冒險・出門任務卡（${shortDate(c.week)}–${shortDate(addDays(c.week, 6))}）`]
  if (words.length) rows.push(`這週學了：${words.map((w) => `${w.en} ${w.zh}`).join('、')}`)
  rows.push('走路、等車、排隊的空檔玩 1–2 分鐘就好，不用道具。', '')
  c.missions.forEach((m, i) => {
    rows.push(`${ticks[m.id] ? '☑' : '☐'} ${i + 1}. ${m.title}（${m.concept}）`, `   ${m.dad}`, `   說說看：${m.en}`, `   ${m.note}`, '')
  })
  return rows.join('\n').trimEnd()
}

// ── 勾選紀錄 ───────────────────────────────────────────────
/** { 週一日期: { 任務 id: 勾選時間 } } */
export type Ticks = Record<string, Record<string, number>>
const TICKS = 'outing.ticks'

export const loadTicks = () => getKV<Ticks>(TICKS, {})

export async function setTick(week: string, id: string, on: boolean): Promise<Ticks> {
  const all = await loadTicks()
  const w = { ...(all[week] ?? {}) }
  if (on) w[id] = Date.now()
  else delete w[id]
  // 只留最近 8 週
  const next: Ticks = Object.fromEntries(
    Object.entries({ ...all, [week]: w })
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 8),
  )
  await setKV(TICKS, next)
  return next
}

// ── 回到 App：你有看到 bus 嗎？ ─────────────────────────────
export interface RecallEntry {
  date: string
  ts: number
  week: string
  /** 出現的圖（VOCAB id），第一個是恐龍問的那個 */
  ids: string[]
  /** 孩子點了哪一個；沒點就是 null */
  pick: string | null
}
const RECALL = 'outing.recall'

export const loadRecall = () => getKV<RecallEntry[]>(RECALL, [])

export interface RecallAsk {
  week: string
  /** 2–3 個 VOCAB id；第一個是恐龍問的那個 */
  ids: string[]
}

/**
 * 今天要不要問、問哪幾個（PRD §5.11 回到 App 時恐龍會問）。一天最多一次，以下任一成立才問：
 * 1. 爸爸最近三天勾了任務，而且是上次問之後才勾的（剛出門回來）。
 * 2. 星期一、二：上個週末之後還沒問過（週末後第一次回來）。
 * 3. 星期六、日下午三點以後（出門回來了）。
 * 圖一定有這張任務卡上的東西：先放爸爸勾過的「找找看」，再放其他「找找看」，
 * 不夠三張用這週學過、外面找得到的詞補，再不夠才用常見的（汽車、公車、小狗）。
 * 任務卡上一個詞都沒有（例如這週只學了數字）就不問。
 */
export async function recallToday(now = new Date()): Promise<RecallAsk | null> {
  const t = today(now)
  const [log, ticks] = await Promise.all([loadRecall(), loadTicks()])
  const last = log[log.length - 1]
  if (last?.date === t) return null

  const dow = now.getDay()
  const weekend = dow === 0 || dow === 6
  const since = last?.ts ?? 0
  const fresh = Object.entries(ticks)
    .filter(([, w]) => Object.values(w).some((ts) => ts > since && now.getTime() - ts < 3 * 86_400_000))
    .map(([wk]) => wk)
    .sort()
    .pop()

  let week: string | null = null
  if (fresh) week = fresh
  else if (weekend && now.getHours() >= 15) week = weekOf(t)
  else if (dow === 1 || dow === 2) {
    const sat = addDays(t, -(dow + 1))
    if (!last || last.date < sat) week = weekOf(sat)
  }
  if (!week) return null

  const wt = ticks[week] ?? {}
  const card = await loadCard(week, Object.keys(wt))
  const vocabOf = (m: Mission) => (m.id.startsWith('find:vocab:') ? m.id.slice('find:vocab:'.length) : null)
  const finds = card.missions.map(vocabOf).filter((x): x is string => !!x)
  if (!finds.length) return null
  const ticked = finds.filter((id) => wt[`find:vocab:${id}`])
  const extra = card.learned.filter((l) => l.kind === 'vocab' && findable(l.id)).map((l) => l.id)
  const common = [...COMMON_SIGHTS].sort((a, b) => seeded(t, a).localeCompare(seeded(t, b)))
  const ids = [...new Set([...ticked, ...finds, ...extra, ...common])].slice(0, 3)
  return { week, ids }
}

export async function markAsked(a: RecallAsk) {
  const log = await loadRecall()
  log.push({ date: today(), ts: Date.now(), week: a.week, ids: a.ids, pick: null })
  await setKV(RECALL, log.slice(-30))
}

export async function markPicked(id: string) {
  const log = await loadRecall()
  const last = log[log.length - 1]
  if (!last || last.date !== today()) return
  last.pick = id
  await setKV(RECALL, log)
}

/** 回到 App 那一刻的圖 */
export const recallIcon = (id: string) => vocab(id).icon
