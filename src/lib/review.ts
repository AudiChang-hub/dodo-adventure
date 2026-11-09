// 本週新故事（G-9 的故事審稿，T-120 起改成直接上線；docs/故事世界.md §8）：家長對每週新故事每一章的決定。
//
// - 2026-11-09 家長決定「不用審稿，我相信你」：每週流程寫好、通過自動檢查（scripts/check-story.ts）的章節直接進孩子端，
//   不用等家長按通過。家長不喜歡可以「撤下」（附一句原因更好），撤下的章節孩子端不播；之後也可以「放回」。
// - 撤下記著那一章內容的指紋（chapterHash）：家長的原因交給每週流程重寫（story-weekly --feedback）之後內容不一樣了，
//   新的這一版通過自動檢查，就直接上線。
// - 手寫的示範章節（part1/、classics/）和 12 扇門的通用章節一直都能播。
// - 家長常用手機看：決定存在這台裝置（kv story:review），登入時也寫到雲端 users/{uid}/meta/review，
//   平板同步時讀回來合併（同一章以比較晚的決定為準）。之前「通過」的紀錄照樣算上線。
import { useSyncExternalStore } from 'react'
import { getKV, setKV } from './db'
import { chapterHash, chapterOf, weeklyOf, type Chapter } from '../content/story'

export interface Verdict {
  /** false：撤下；true：放回（以前的「通過」也是 true） */
  ok: boolean
  /** 決定時那一章的內容指紋 */
  hash: string
  /** 撤下的原因（一句話；ok: false 是撤下，以前叫退回；true 是放回，以前叫通過） */
  reason?: string
  /** 決定的時間（合併兩台裝置時，比較晚的為準） */
  at: number
  /** 劇本第幾版 */
  rev?: number
}

/** 手寫的（builtin）、上線中（live）、家長撤下了（off） */
export type ReviewStatus = 'builtin' | 'live' | 'off'

export const REVIEW_KV = 'story:review'

let verdicts: Record<string, Verdict> = {}
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export async function loadReview() {
  verdicts = await getKV<Record<string, Verdict>>(REVIEW_KV, {})
  emit()
}

export const verdictOf = (id: string): Verdict | undefined => verdicts[id]

/** 一章的狀態（純函式）：不在每週新故事裡的是 builtin；家長撤下的這一版是 off；其他（還沒有決定、放回、撤下之後重寫過）都是 live */
export function statusOf(ch: Chapter, v: Verdict | undefined): ReviewStatus {
  if (!weeklyOf(ch.id)) return 'builtin'
  return v && !v.ok && v.hash === chapterHash(ch) ? 'off' : 'live'
}

export const reviewStatus = (ch: Chapter): ReviewStatus => statusOf(ch, verdicts[ch.id])

/** 孩子端可以播這一章嗎：家長沒有撤下的都可以 */
export const playable = (ch: Chapter) => reviewStatus(ch) !== 'off'

/** 撤下之後內容改過了（每週流程照原因重寫過）：回傳那一次撤下的決定，給家長看「上次撤下的原因」 */
export function staleVerdict(ch: Chapter): Verdict | null {
  const v = verdicts[ch.id]
  return v && !v.ok && v.hash !== chapterHash(ch) ? v : null
}

/** 家長按撤下（ok: false）或放回（ok: true） */
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

/** 「本週新故事」的「匯出撤下的原因」：給每週流程讀（撤下的原因拿去重寫，story-weekly --feedback） */
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
