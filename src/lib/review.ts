// 故事審稿（G-9，docs/成長系統設計.md §3.6.4、docs/故事世界.md §8）：家長對審稿佇列每一章的決定。
//
// - 審稿佇列的章節（content/story/weekly/）要家長按「通過」才會進孩子端；退回的、還沒審的都播不到，孩子那天講通用章節。
// - 通過記著那一章內容的指紋（chapterHash）：之後內容改了（退回重寫），指紋不一樣，就要重審。
// - 手寫的示範章節（part1/、classics/）和 12 扇門的通用章節不用審。
// - 家長常在手機上審：決定存在這台裝置（kv story:review），登入時也寫到雲端 users/{uid}/meta/review，
//   平板同步時讀回來合併（同一章以比較晚的決定為準）。退回的原因由審稿頁匯出給每週流程（scripts/story-weekly.ts）重寫。
import { useSyncExternalStore } from 'react'
import { getKV, setKV } from './db'
import { chapterHash, chapterOf, weeklyOf, type Chapter } from '../content/story'

export interface Verdict {
  ok: boolean
  /** 決定時那一章的內容指紋 */
  hash: string
  /** 退回的原因（一句話） */
  reason?: string
  /** 決定的時間（合併兩台裝置時，比較晚的為準） */
  at: number
  /** 劇本第幾版 */
  rev?: number
}

export type ReviewStatus = 'builtin' | 'pending' | 'ok' | 'no'

export const REVIEW_KV = 'story:review'

let verdicts: Record<string, Verdict> = {}
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export async function loadReview() {
  verdicts = await getKV<Record<string, Verdict>>(REVIEW_KV, {})
  emit()
}

export const verdictOf = (id: string): Verdict | undefined => verdicts[id]

/** 這一章的審稿狀態：不用審（builtin）、待審（pending，含內容改過要重審）、通過、退回 */
export function reviewStatus(ch: Chapter): ReviewStatus {
  if (!weeklyOf(ch.id)) return 'builtin'
  const v = verdicts[ch.id]
  if (!v || v.hash !== chapterHash(ch)) return 'pending'
  return v.ok ? 'ok' : 'no'
}

/** 孩子端可以播這一章嗎：不用審的，或家長通過的這一版 */
export const playable = (ch: Chapter) => {
  const s = reviewStatus(ch)
  return s === 'builtin' || s === 'ok'
}

/** 這一章的決定被改過內容（重寫過）：之前有決定，但不是現在這一版 */
export function staleVerdict(ch: Chapter): Verdict | null {
  const v = verdicts[ch.id]
  return v && v.hash !== chapterHash(ch) ? v : null
}

/** 家長按通過或退回（可以一次好幾章：整篇通過） */
export async function decide(list: { chapter: Chapter; ok: boolean; reason?: string; rev?: number }[]) {
  const at = Date.now()
  const next = { ...verdicts }
  for (const x of list) {
    const reason = x.reason?.trim()
    next[x.chapter.id] = { ok: x.ok, hash: chapterHash(x.chapter), at, ...(reason && !x.ok ? { reason } : {}), ...(x.rev ? { rev: x.rev } : {}) }
  }
  verdicts = next
  await setKV(REVIEW_KV, verdicts)
  emit()
  // 登入時寫到雲端，平板下次同步就拿得到（沒網路、沒登入就只存這台）
  void import('./sync').then((m) => m.syncReview()).catch(() => {})
}

/** 和雲端的合併：同一章以比較晚的決定為準。回傳合併後的全部（寫回雲端用） */
export async function mergeVerdicts(remote: Record<string, Verdict> | null | undefined): Promise<Record<string, Verdict>> {
  let changed = false
  const next = { ...verdicts }
  for (const [id, v] of Object.entries(remote ?? {})) {
    if (!v || typeof v.at !== 'number') continue
    if (!next[id] || next[id].at < v.at) {
      next[id] = v
      changed = true
    }
  }
  if (changed) {
    verdicts = next
    await setKV(REVIEW_KV, verdicts)
    emit()
  }
  return verdicts
}

export const allVerdicts = () => verdicts

export function useReview(): Record<string, Verdict> {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => verdicts,
  )
}

/** 審稿頁「匯出審稿結果」：給每週流程讀（退回的原因拿去重寫；通過的記下來） */
export function exportVerdicts(): { kind: 'story-review'; at: number; verdicts: (Verdict & { id: string; current: boolean })[] } {
  return {
    kind: 'story-review',
    at: Date.now(),
    verdicts: Object.entries(verdicts).map(([id, v]) => {
      const ch = chapterOf(id)
      return { id, ...v, current: !!ch && chapterHash(ch) === v.hash }
    }),
  }
}
