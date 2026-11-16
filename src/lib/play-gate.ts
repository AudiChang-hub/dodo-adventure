// 首頁「遊戲角」（畫畫、邏輯遊戲）的鎖（T-152，設計稿 docs/T-152-邏輯小遊戲與解鎖設計.md 第二節案 A）。
// 三堂課今天各「上完一次」（課叫了 onDone，lesson.log 那一筆有 done）才開；中途離開不算，但三堂課同一天回去都會接著上。
// 家長區可以「今天先打開」（kv home.unlockToday，只算今天）或設成「一直開著」（settings.freePlay = 'always'，預設）。
// 只鎖首頁的入口：路由 draw、coloring、logic 本身不擋（孩子畫到一半跨過半夜不會被踢出去，TIME-2）。貼紙本不鎖。
import { useEffect, useState } from 'react'
import { getKV, setKV, today } from './db'
import { lessonRuns } from './lesson-log'
import { useSettings, type Settings } from './settings'
import type { LessonRun } from './readiness'

export type GateSubject = LessonRun['subject']
/** 門燈和「還沒上的那一扇」的順序：跟首頁的門一樣，英文 → 中文 → 數學 */
export const GATE_ORDER: readonly GateSubject[] = ['english', 'chinese', 'math']

export type PlayGate = {
  open: boolean
  /** 三科今天各上完了沒，給門燈用 */
  lit: Record<GateSubject, boolean>
  /** 為什麼開：家長設成一直開、家長今天先打開、三堂上完了（同時成立時照這個順序取第一個） */
  why?: 'always' | 'today' | 'done'
}

/** 家長按的「今天先打開」：只有 date 是今天才算，隔天自動失效（不用清） */
export const UNLOCK_KEY = 'home.unlockToday'
/** 今天那一句 Play corner is open! 說過了沒（只記日期） */
export const OPENED_KEY = 'home.cornerOpened'

/**
 * 判斷遊戲角開了沒（純函式）。
 * - 一科「上過」＝今天（開始那一天，startRun 寫的 date）有一筆 done。跨過半夜才上完的，算開始的那一天。
 * - 同一科上兩次還是一科；三科都要有。
 */
export function playGate(runs: readonly LessonRun[], unlock: { date: string } | null, freePlay: Settings['freePlay'], day: string): PlayGate {
  const lit = { english: false, chinese: false, math: false }
  for (const r of runs) if (r.date === day && r.done && r.subject in lit) lit[r.subject] = true
  const why: PlayGate['why'] =
    freePlay === 'always' ? 'always' : unlock?.date === day ? 'today' : GATE_ORDER.every((s) => lit[s]) ? 'done' : undefined
  return why ? { open: true, lit, why } : { open: false, lit }
}

/** 還沒上完的第一科（點了鎖住的窗，亮這一扇門）；三科都上完是 null */
export function firstUnlit(g: PlayGate): GateSubject | null {
  return GATE_ORDER.find((s) => !g.lit[s]) ?? null
}

// ── 讀 kv（首頁、家長區）──────────────────────────────────────

export const unlockedFor = () => getKV<{ date: string } | null>(UNLOCK_KEY, null)

/** 家長區的「今天先打開」／「取消」 */
export async function setUnlockToday(on: boolean) {
  await setKV(UNLOCK_KEY, on ? { date: today() } : null)
}

/** 首頁用：鎖的狀態，加上今天那一句 Play corner is open! 該不該說（因為三堂上完才開，而且今天還沒說過） */
export type HomeGate = PlayGate & { announce: boolean }

/** 上一次讀到的（首頁每次掛上先照這個畫，讀到新的再換；不會每次回首頁窗簾都先拉上再拉開） */
let lastGate: HomeGate | null = null

/** 今天那一句說過了（說了才記；同一天再回首頁不再說） */
export function markOpenAnnounced() {
  if (lastGate) lastGate = { ...lastGate, announce: false }
  return setKV(OPENED_KEY, today()).catch(() => {})
}

/**
 * 首頁用：進首頁時、App 從背景回來時（半夜跨日、家長在家長區按了今天先打開）、設定改了的時候重算。
 * 從課回到首頁時首頁會重新掛上，也就重算一次。打開 App 後第一次還沒讀到是 null。
 */
export function usePlayGate(): HomeGate | null {
  const { freePlay } = useSettings()
  const [g, setG] = useState<HomeGate | null>(lastGate)
  useEffect(() => {
    let alive = true
    const read = async () => {
      const [runs, unlock, opened] = await Promise.all([
        lessonRuns().catch(() => []),
        unlockedFor().catch(() => null),
        getKV<string | null>(OPENED_KEY, null).catch(() => null),
      ])
      const day = today()
      const pg = playGate(runs, unlock, freePlay, day)
      lastGate = { ...pg, announce: pg.why === 'done' && opened !== day }
      if (alive) setG(lastGate)
    }
    void read()
    const vis = () => {
      if (document.visibilityState === 'visible') void read()
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', vis)
    }
  }, [freePlay])
  return g
}

/** 家長區用：今天先打開了沒（按了就重讀） */
export function useUnlockToday(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let alive = true
    void unlockedFor()
      .then((u) => alive && setOn(u?.date === today()))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return [
    on,
    (v: boolean) => {
      setOn(v)
      void setUnlockToday(v)
    },
  ]
}
