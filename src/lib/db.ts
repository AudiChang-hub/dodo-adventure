import Dexie, { type Table } from 'dexie'
import type { Band } from '../content/growth'

export type StationId = 'english' | 'math' | 'mandarin' | 'draw' | 'park' | 'code'

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
  /** 主題式冒險的主題（content/themes.ts 的 id）；自由探索、舊資料沒有 */
  theme?: string
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
  /**
   * 第一次穩固（已熟、通過 2 次到期複習）的時間（成長系統 §1.4，G-2）。已熟之後偶爾答錯一題，rev 會從頭算，
   * 但「隔 1 天、再隔 2 天都還記得」已經證明過了，所以穩固記在這裡；掉出已熟才拿掉。舊資料沒有，照 rev 判斷
   */
  firmAt?: number
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

/**
 * 成長時間軸的一筆（成長系統 §5.1）：換年段、完成一階、家長的調整……家長區「成長」分頁由新到舊列出。
 * 孩子端看不到；退回、回補的原因只寫在這裡（§1.4）。不放生日的值。
 */
export interface GrowthLogEntry {
  id: string
  ts: number
  date: string
  /** profile：家長設定或清除生日（不記生日本身） */
  kind: 'band' | 'rung' | 'reopen' | 'override' | 'lock' | 'story' | 'voice' | 'profile'
  track?: string
  strand?: string
  rung?: number
  data?: Record<string, unknown>
  synced: 0 | 1
}

/** 故事的一章（成長系統 §3、§5.1）；G-8 的故事播放器才開始寫入 */
export interface Chapter {
  id: string
  date: string
  part: number
  arc: string
  chapter: number
  kind: 'epic' | 'classic' | 'evergreen'
  faith?: string
  band: Band
  picks: { words: string[]; friends: string[]; stickers: string[]; drawings: string[] }
  choices: Record<string, string>
  done: boolean
  synced: 0 | 1
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
  growthLog!: Table<GrowthLogEntry, string>
  chapters!: Table<Chapter, string>

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
    // v3：成長系統（docs/成長系統設計.md §5.1）。只新增表、不動舊資料；
    // kv 另外多了 profile（生日年月）、growth（年段覆寫、跨段放寬），沒有就是預設，不必在這裡補
    this.version(3).stores({
      growthLog: 'id, ts, kind, synced',
      chapters: 'id, date, arc, synced',
    })
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
