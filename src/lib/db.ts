import Dexie, { type Table } from 'dexie'

export type StationId = 'english' | 'math' | 'mandarin' | 'draw' | 'park'

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
}

export interface GameLevel {
  key: string
  level: number
  up: number
  down: number
  plays: number
  lastTs: number
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
  }
}

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
