// 家長區「聽完才答」（T-109）：英文課、數學課要聽懂才答得出來的題目，孩子是聽完題目的關鍵字才點，還是還沒聽完就點（用猜的）。
// 純函式，只讀作答紀錄（有 heard 欄位的才算；T-109 之前的舊紀錄沒有），家長區學習進度用。單元測試在 scripts/test-heard.ts。
import { phaseOf, type Attempt } from './db'

export type ListenLesson = 'english' | 'math'

/** 一種題目（找大 S、哪邊比較多…）的統計 */
export interface ListenRow {
  /** 家長看的名字：找大 S、找小 s、找 S 開頭的圖、哪邊比較多、找數字 3、有幾個（3 個）、拿 3 個給波波 */
  label: string
  /** 聽完才答幾次、其中第一次就對幾次 */
  heard: number
  right: number
  /** 沒聽完就點幾次、其中猜對幾次 */
  guessed: number
  guessedRight: number
  /** 最近一次的時間（排序用） */
  last: number
}

export interface ListenStats {
  /** 全部（有記錄聽完了沒的）題數 */
  total: number
  heard: number
  right: number
  guessed: number
  guessedRight: number
  rows: ListenRow[]
}

/** 這一題算哪一堂課、叫什麼；不是要聽懂才答的題目回傳 null */
export function listenItem(a: Pick<Attempt, 'game' | 'skill'>): { lesson: ListenLesson; label: string; order: number } | null {
  const [kind, v = ''] = a.skill.split(':')
  if (a.game === 'lesson-en') {
    if (kind === 'letter') return v === v.toUpperCase() ? { lesson: 'english', label: `找大 ${v}`, order: 0 } : { lesson: 'english', label: `找小 ${v}`, order: 1 }
    if (kind === 'phonics') return { lesson: 'english', label: `找 ${v.toUpperCase()} 開頭的圖`, order: 2 }
    return null
  }
  if (a.game === 'm-compare') return { lesson: 'math', label: v === 'less' ? '哪邊比較少' : '哪邊比較多', order: v === 'less' ? 1 : 0 }
  if (a.game === 'm-find') return { lesson: 'math', label: `找數字 ${v}`, order: 2 }
  if (a.game === 'm-match') return { lesson: 'math', label: `有幾個（${v} 個）`, order: 3 }
  if (a.game === 'm-give') return { lesson: 'math', label: `拿 ${v} 個給波波`, order: 4 }
  return null
}

/**
 * 算一堂課最近 days 天的「聽完才答」。只算孩子自己答的（教學卡、手先示範過才答的不算：答案已經看過了）。
 * 每一題只看第一次點：那一刻關鍵字念完了沒（heard）、點的對不對（firstTryCorrect）。
 */
export function listenStats(attempts: readonly Attempt[], lesson: ListenLesson, days = 14, now = Date.now()): ListenStats {
  const since = now - days * 86_400_000
  const rows = new Map<string, ListenRow & { order: number }>()
  const out: ListenStats = { total: 0, heard: 0, right: 0, guessed: 0, guessedRight: 0, rows: [] }
  for (const a of attempts) {
    if (typeof a.heard !== 'boolean' || a.ts < since || phaseOf(a) === 'teach' || a.metrics?.shown) continue
    const it = listenItem(a)
    if (!it || it.lesson !== lesson) continue
    const r = rows.get(it.label) ?? { label: it.label, order: it.order, heard: 0, right: 0, guessed: 0, guessedRight: 0, last: 0 }
    out.total++
    if (a.heard) {
      r.heard++
      out.heard++
      if (a.firstTryCorrect) (r.right++, out.right++)
    } else {
      r.guessed++
      out.guessed++
      if (a.firstTryCorrect) (r.guessedRight++, out.guessedRight++)
    }
    r.last = Math.max(r.last, a.ts)
    rows.set(it.label, r)
  }
  // 最近練過的在前面；同一天的照題型（大寫、小寫、開頭的圖／多、少、找數字、有幾個、拿給波波）
  out.rows = [...rows.values()].sort((x, y) => y.last - x.last || x.order - y.order).map(({ order: _o, ...r }) => r)
  return out
}

/** 一列的中文：找大 S：聽完才答 6 次，對 5 次；沒聽完就點 9 次 */
export function listenLine(r: Pick<ListenRow, 'label' | 'heard' | 'right' | 'guessed'>): string {
  const h = r.heard ? `聽完才答 ${r.heard} 次，對 ${r.right} 次` : '還沒有聽完才答的'
  return `${r.label}：${h}${r.guessed ? `；沒聽完就點 ${r.guessed} 次` : ''}`
}
