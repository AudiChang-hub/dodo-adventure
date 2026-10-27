import Dexie, { type Table } from 'dexie'

export type StationId = 'english' | 'math' | 'mandarin' | 'draw' | 'park'

/**
 * 教學階段（PRD §5.8）：teach 教學卡／示範、guided 一起練、quiz 自己答。
 * 只有 quiz 會計入熟練度與難度。
 */
export type Phase = 'teach' | 'guided' | 'quiz'

/** 一題的完整作答紀錄：PRD §7 的資料模型 */
export interface Attempt {
  id: string
  ts: number
  date: string
  sessionId: string
  station: StationId
  game: string
  itemId: string
  skill: string
  /** 舊資料（v1）沒有這個欄位，一律視為 quiz；請用 phaseOf() 讀 */
  phase?: Phase
  level: number
  options: string[]
  answer: string
  /** 每一次點擊：選了什麼、距離題目出現幾毫秒 */
  taps: { pick: string; ms: number }[]
  firstTryCorrect: boolean
  attempts: number
  responseMs: number
  hintUsed: boolean
  /** 畫畫類的額外指標，例如偏離路徑的平均距離 */
  metrics?: Record<string, number>
  synced: 0 | 1
}

export interface Session {
  id: string
  date: string
  start: number
  end: number
  activeSec: number
  activities: { game: string; station: StationId; done: boolean }[]
  synced: 0 | 1
}

export interface Skill {
  key: string
  box: number
  seen: number
  firstTry: number
  streak: number
  lastTs: number
  // ── 以下是第二批（學習引擎）新增的欄位，都不建索引，舊資料沒有也能讀 ──
  /** 到期複習的階段 0–4，對應隔 1、2、4、7、14 個「有玩的日子」；只有已熟（3 格以上）才有 */
  rev?: number
  /** 下一次該複習的「第幾個有玩的日子」；已熟卻沒有這個欄位（舊資料）視為今天到期 */
  due?: number
  /** 最近一次到期複習：第幾個有玩的日子、結果（ok／slow 答對但偏慢／no 答錯） */
  lastReview?: { day: number; ts: number; result: 'ok' | 'slow' | 'no' }
  /** 答對但明顯偏慢、所以沒有升格的次數 */
  slow?: number
}

/** 程度校準（第一次玩的 2–3 題探測）的一題 */
export interface ProbeStep {
  level: number
  ok: boolean
  skill?: string
}

export interface GameLevel {
  key: string
  level: number
  up: number
  down: number
  plays: number
  lastTs: number
  /** 探測中：從哪一級開始、已經出了哪些題 */
  probe?: { from: number; start: number; steps: ProbeStep[] }
  /** 探測完成：從 from 級調到 to 級；skipped 表示原本的難度已經夠高，沒有探測 */
  placed?: { ts: number; from: number; to: number; steps: ProbeStep[]; skipped?: boolean }
}

export interface Drawing {
  id: string
  ts: number
  date: string
  game: string
  title: string
  thumb: string
  strokes: string
  synced: 0 | 1
}

export interface Friend {
  id: string
  ts: number
}

export interface KV {
  key: string
  value: unknown
}

class AppDB extends Dexie {
  attempts!: Table<Attempt, string>
  sessions!: Table<Session, string>
  skills!: Table<Skill, string>
  levels!: Table<GameLevel, string>
  drawings!: Table<Drawing, string>
  friends!: Table<Friend, string>
  kv!: Table<KV, string>

  constructor() {
    super('dodo-adventure')
    this.version(1).stores({
      attempts: 'id, ts, date, station, game, skill, synced',
      sessions: 'id, date, start, synced',
      skills: 'key',
      levels: 'key',
      drawings: 'id, ts, synced',
      friends: 'id, ts',
      kv: 'key',
    })
    // v2：作答紀錄加上教學階段。舊紀錄都是當時的一般題目，補上 quiz
    this.version(2)
      .stores({ attempts: 'id, ts, date, station, game, skill, phase, synced' })
      .upgrade((tx) =>
        tx
          .table('attempts')
          .toCollection()
          .modify((a: Attempt) => {
            if (!a.phase) a.phase = 'quiz'
          }),
      )
  }
}

export const phaseOf = (a: Pick<Attempt, 'phase'>): Phase => a.phase ?? 'quiz'
export const isQuiz = (a: Pick<Attempt, 'phase'>) => phaseOf(a) === 'quiz'

export const db = new AppDB()

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}

export const setKV = (key: string, value: unknown) => db.kv.put({ key, value })

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

export function today(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
