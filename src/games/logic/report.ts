// 家長區看邏輯遊戲（T-152）：作答紀錄的名稱、總覽的「會了什麼」（PARENT-3）。
// 只看得到，不算進下一步準備度（NEXT-1～3 只看三堂課）。純函式，scripts/test-logic.ts 直接測。
import type { Attempt } from '../../lib/db'
import { MASTER_DAYS, MASTER_OF, MASTER_OK } from './sort-plan'

export const LOGIC_GAME_NAME: Record<string, string> = { 'logic-sort': '豆豆收拾', 'logic-pattern': '串珠珠', 'logic-puzzle': '拼圖', 'logic-maze': '迷宮' }

/** 技能的中文（作答紀錄、總覽用） */
export const LOGIC_SKILLS: { skill: string; zh: string }[] = [
  { skill: 'sort:color', zh: '依顏色分類' },
  { skill: 'sort:kind', zh: '依種類分類' },
  { skill: 'sort:shape', zh: '依形狀分類' },
  { skill: 'sort:size', zh: '依大小分類' },
  { skill: 'pattern:ab', zh: 'ABAB 接下去（珠子）' },
  { skill: 'pattern:ab-obj', zh: 'ABAB 接下去（東西）' },
  // T-156 拼圖、迷宮：一張拼完、一個走完記一筆
  { skill: 'puzzle:4', zh: '拼 4 片拼圖' },
  { skill: 'puzzle:6', zh: '拼 6 片拼圖' },
  { skill: 'maze:3x3', zh: '走迷宮（3×3）' },
  { skill: 'maze:4x3', zh: '走迷宮（4×3）' },
  { skill: 'maze:4x4', zh: '走迷宮（4×4）' },
  { skill: 'maze:5x4', zh: '走迷宮（5×4）' },
  { skill: 'maze:5x5', zh: '走迷宮（5×5）' },
]

/** 邏輯遊戲的技能名稱；不是邏輯遊戲的回傳 null（交給家長區原本的 skillLabel） */
export function logicSkillLabel(skill: string, station?: string): string | null {
  if (station != null && station !== 'logic') return null
  return LOGIC_SKILLS.find((s) => s.skill === skill)?.zh ?? null
}

export type LogicStatus = 'ok' | 'learning'

/**
 * 每個玩過的技能：會了（最近 8 題自己答、第一次就對 ≥ 7、分布在 ≥ 3 天，跟升級同一個門檻）或還在學。
 * 示範、一起做、手帶著放的不算。沒玩過的不列。
 */
export function logicSummary(attempts: Pick<Attempt, 'station' | 'skill' | 'phase' | 'metrics' | 'firstTryCorrect' | 'date' | 'ts'>[]): { skill: string; zh: string; status: LogicStatus }[] {
  const out: { skill: string; zh: string; status: LogicStatus }[] = []
  for (const s of LOGIC_SKILLS) {
    const rows = attempts.filter((a) => a.station === 'logic' && a.skill === s.skill && (a.phase ?? 'quiz') === 'quiz' && !a.metrics?.led && !a.metrics?.shown).sort((a, b) => a.ts - b.ts)
    if (!rows.length) continue
    const last = rows.slice(-MASTER_OF)
    const ok = last.length >= MASTER_OF && last.filter((a) => a.firstTryCorrect).length >= MASTER_OK && new Set(last.map((a) => a.date)).size >= MASTER_DAYS
    out.push({ skill: s.skill, zh: s.zh, status: ok ? 'ok' : 'learning' })
  }
  return out
}
