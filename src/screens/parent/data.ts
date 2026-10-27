import { useEffect, useState } from 'react'
import { db, phaseOf, today, type Attempt, type Drawing, type Phase, type Session, type StationId } from '../../lib/db'
import { fetchCloud } from '../../lib/sync'
import { DIR_ZH, PATTERN_ZH, story, type Dir, type PatternKind } from '../../content/code'

export interface ParentData {
  attempts: Attempt[]
  sessions: Session[]
  drawings: Drawing[]
  skills: Map<string, { box: number; seen: number; firstTry: number }>
  source: 'local' | 'cloud'
}

export function useParentData(source: 'local' | 'cloud', reloadKey: number) {
  const [data, setData] = useState<ParentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setError(null)
    ;(async () => {
      if (source === 'cloud') {
        const c = await fetchCloud().catch((e) => {
          setError(String(e))
          return null
        })
        if (!c || cancelled) return
        setData({ ...c, skills: new Map(c.skills.map((s) => [s.key, s])), source })
        return
      }
      const [attempts, sessions, drawings, skills] = await Promise.all([
        db.attempts.orderBy('ts').reverse().toArray(),
        db.sessions.orderBy('start').reverse().toArray(),
        db.drawings.orderBy('ts').reverse().toArray(),
        db.skills.toArray(),
      ])
      if (!cancelled) setData({ attempts, sessions, drawings, skills: new Map(skills.map((s) => [s.key, s])), source })
    })()
    return () => {
      cancelled = true
    }
  }, [source, reloadKey])
  return { data, error }
}

export const STATION_NAME: Record<StationId, string> = { english: '字母森林', math: '數字工地', mandarin: '動物村', draw: '畫畫小屋', park: '彩虹公園', code: '程式車庫' }

/** 教學階段（PRD §5.8）：只有「自己答」計入答對率與熟練度 */
export const PHASE_NAME: Record<Phase, string> = { teach: '教學', guided: '一起練', quiz: '自己答' }

export function lastDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => today(new Date(Date.now() - (n - 1 - i) * 86_400_000)))
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export function minutesByDay(sessions: Session[]) {
  const m = new Map<string, number>()
  for (const s of sessions) m.set(s.date, (m.get(s.date) ?? 0) + s.activeSec / 60)
  return m
}

/** 把技能代碼翻成家長看得懂的中文 */
export function skillLabel(key: string): string {
  const [kind, v] = key.split(':')
  const map: Record<string, (v: string) => string> = {
    letter: (v) => `認字母 ${v}`,
    word: (v) => `字母單字 ${v}`,
    num: (v) => `認數字 ${v}`,
    count: (v) => `數數量 ${v}`,
    compare: (v) => (v === 'more' ? '比多少（多）' : '比多少（少）'),
    order: (v) => `照順序 1–${v}`,
    vocab: (v) => `詞彙 ${v}`,
    cat: (v) => `分類 ${({ fly: '會飛', water: '水裡', wheels: '有輪子', legs4: '四隻腳', eat: '可以吃' } as Record<string, string>)[v] ?? v}`,
    sound: (v) => `聽聲音 ${v}`,
    color: (v) => `顏色 ${v}`,
    shape: (v) => `形狀 ${v}`,
    size: (v) => (v === 'big' ? '比大小（大）' : '比大小（小）'),
    trace: (v) => `運筆小路 第 ${v} 條`,
    dots: (v) => `連點 ${v}`,
    glyph: (v) => `描 ${v}`,
    coloring: (v) => `著色 ${v}`,
    phonics: (v) => `字母音 ${v}`,
    // 程式車庫
    arrow: (v) => `方向 ${DIR_ZH[v as Dir] ?? v}`,
    route: (v) => `箭頭卡 ${v} 張`,
    pattern: (v) => `規律 ${PATTERN_ZH[v as PatternKind] ?? v}`,
    seq: (v) => `排順序：${story(v)?.zh ?? v}`,
  }
  return map[kind]?.(v) ?? key
}

export function download(name: string, content: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function toCSV(rows: Attempt[]): string {
  const cols = ['date', 'ts', 'station', 'game', 'phase', 'itemId', 'skill', 'level', 'answer', 'options', 'taps', 'firstTryCorrect', 'attempts', 'responseMs', 'hintUsed', 'metrics'] as const
  const esc = (v: unknown) => {
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(c === 'ts' ? new Date(r.ts).toISOString() : c === 'phase' ? phaseOf(r) : r[c])).join(','))].join('\n')
}
