import type { GameLevel, ProbeStep } from './db'

/**
 * 程度校準（第二批・工作線 A）：每個遊戲第一次玩（或舊資料還沒校準過）時，
 * 用 2–3 題比較難的題目快速探測，答對就把起始難度往上調，
 * 讓 Sam 不會從 2 選 1、數 1–3 這種對他太簡單的地方開始。
 *
 * 探測的起點依 Sam 的實際程度（2026-10-25 學習單）訂：
 * - 選擇題從 3 級（4 選 1）開始；
 * - 數數、照順序、有幾個從 2 級開始（他能數到 5，2 級是 2–5、3 級是 4–8）。
 * 不在表上的遊戲（畫畫類照發展順序走、全新的能力）不探測，理由寫在表的最後。
 */
export const PROBE_START: Record<string, number> = {
  'en-find': 3,
  'en-pic': 2,
  'en-word': 2,
  'm-count': 2,
  'm-match': 2,
  'm-find': 3,
  'm-compare': 3,
  'm-order': 2,
  'z-find': 3,
  'z-category': 3,
  'z-sound': 3,
  'p-color': 3,
  'p-shape': 3,
  'p-size': 2,
  // 第三批補上：學習單題型的遊戲。紙本學習單他寫得很快（數到 5 一對一塗格子、依類別／顏色／功能分類、
  // 正方體 vs 三角柱都會），從 1 級開始太簡單，所以也探測；2 級正好是學習單的量（數量 2–5、5 個找 2–3 個）
  'm-fill': 2,
  'm-give': 2,
  'm-flash': 2,
  'p-findall': 2,
  'p-solid': 2,
  'z-use': 2,
  // 刻意不探測的：
  // - 自然發音（ph-*）、程式車庫（c-*）：全新的能力，學習單沒有做過，探測只會先答錯一串，照教學順序從頭教。
  // - 圈圈看（p-lasso）：紙上用蠟筆圈過，但在平板上用筆圈是新的運筆動作，和畫畫小屋一樣照發展順序走。
  // - 數字快答（m-quick）：只有一級，出的都是已熟的題目。
}

/** 最多探測幾題 */
export const PROBE_ITEMS = 3
/** 探測時錯幾題就停 */
const PROBE_MAX_WRONG = 2

export const probing = (l: GameLevel | undefined) => !!l?.probe

/**
 * 開始探測：還沒校準過、而且目前難度低於探測起點的遊戲。
 * 原本難度已經夠高的，直接記為「已校準（略過）」。回傳 null 代表這個遊戲不探測。
 */
export function beginProbe(l: GameLevel): GameLevel | null {
  if (l.placed || l.probe) return null
  const start = PROBE_START[l.key]
  if (!start) return null
  if (l.level >= start) return { ...l, placed: { ts: Date.now(), from: l.level, to: l.level, steps: [], skipped: true } }
  return { ...l, level: start, up: 0, down: 0, probe: { from: l.level, start, steps: [] } }
}

/**
 * 探測一題的結果（階梯法）：答對往上一級、答錯退一級；
 * 出滿 3 題或錯 2 題就結束，停在當時的難度。
 */
export function stepProbe(l: GameLevel, ok: boolean, maxLevel: number, skill?: string): GameLevel {
  const p = l.probe!
  const steps: ProbeStep[] = [...p.steps, { level: l.level, ok, ...(skill ? { skill } : {}) }]
  const level = ok ? Math.min(maxLevel, l.level + 1) : Math.max(1, l.level - 1)
  const wrong = steps.filter((s) => !s.ok).length
  if (steps.length >= PROBE_ITEMS || wrong >= PROBE_MAX_WRONG) {
    const { probe: _p, ...rest } = l
    return { ...rest, level, up: 0, down: 0, placed: { ts: Date.now(), from: p.from, to: level, steps } }
  }
  return { ...l, level, probe: { ...p, steps } }
}
