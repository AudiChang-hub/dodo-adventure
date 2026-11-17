// 家長區看邏輯遊戲（T-152）：作答紀錄的名稱、總覽的「會了什麼」（PARENT-3）。
// 只看得到，不算進下一步準備度（NEXT-1～3 只看三堂課）。純函式，scripts/test-logic.ts 直接測。
import type { Attempt } from '../../lib/db'
import { MASTER_DAYS, MASTER_OF, MASTER_OK } from './sort-plan'

export const LOGIC_GAME_NAME: Record<string, string> = { 'logic-sort': '豆豆收拾', 'logic-pattern': '串珠珠', 'logic-puzzle': '拼圖', 'logic-maze': '迷宮', 'logic-picnic': '小熊野餐', 'logic-drum': '鼓聲停', 'logic-memory': '翻翻牌', 'logic-shadow': '影子配對', 'logic-where': '躲在哪裡', 'logic-feel': '心情臉', 'logic-blocks': '積木蓋蓋看', 'logic-race': '恐龍賽跑棋', 'logic-hide': '躲起來了幾隻' }

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
  { skill: 'puzzle:9', zh: '拼 9 片拼圖' },
  { skill: 'maze:3x3', zh: '走迷宮（3×3）' },
  { skill: 'maze:4x3', zh: '走迷宮（4×3）' },
  { skill: 'maze:4x4', zh: '走迷宮（4×4）' },
  { skill: 'maze:5x4', zh: '走迷宮（5×4）' },
  { skill: 'maze:5x5', zh: '走迷宮（5×5）' },
  // T-158 迷宮加難度（家長 2026-11-16）：6～10 級，第 9 級先拿鑰匙、第 10 級收集星星
  { skill: 'maze:6x5', zh: '走迷宮（6×5）' },
  { skill: 'maze:7x5', zh: '走迷宮（7×5）' },
  { skill: 'maze:8x5', zh: '走迷宮（8×5）' },
  { skill: 'maze:9x6', zh: '走迷宮（9×6，先拿鑰匙）' },
  { skill: 'maze:10x7', zh: '走迷宮（10×7，收集星星）' },
  // T-160 小熊野餐（照數量拿東西，MA-2）：一個客人記一筆
  { skill: 'picnic:1-3', zh: '照數量拿（1～3 個）' },
  { skill: 'picnic:2-4', zh: '照數量拿（2～4 個）' },
  { skill: 'picnic:3-5', zh: '照數量拿（3～5 個）' },
  { skill: 'picnic:3-5-scatter', zh: '照數量拿（3～5 個，打散的）' },
  // T-160 鼓聲停（自我控制，CG-3）：一首記一筆
  { skill: 'drum:1', zh: '鼓聲停就停（慢、會說 Freeze）' },
  { skill: 'drum:2', zh: '鼓聲停就停（不提醒）' },
  { skill: 'drum:3', zh: '鼓聲停就停（忽快忽慢、突然停）' },
  { skill: 'drum:4', zh: '鼓聲停就停（停得更快更短）' },
  // T-160 翻翻牌、影子配對（家長 2026-11-17）：一局玩完記一筆
  { skill: 'memory:4', zh: '翻翻牌（4 張）' },
  { skill: 'memory:6', zh: '翻翻牌（6 張）' },
  { skill: 'memory:8', zh: '翻翻牌（8 張）' },
  { skill: 'memory:10', zh: '翻翻牌（10 張）' },
  { skill: 'memory:12', zh: '翻翻牌（12 張）' },
  { skill: 'shadow:2', zh: '影子配對（2 個）' },
  { skill: 'shadow:3', zh: '影子配對（3 個）' },
  { skill: 'shadow:4', zh: '影子配對（4 個）' },
  { skill: 'shadow:alike', zh: '影子配對（輪廓很像的）' },
  { skill: 'shadow:flip', zh: '影子配對（影子朝另一邊）' },
  // T-160 躲在哪裡（數學 MA-8）：聽懂位置詞；心情臉（社會情緒 SE-1）：認得四種心情
  { skill: 'where:in', zh: '聽懂 in（在裡面）' },
  { skill: 'where:on', zh: '聽懂 on（在上面）' },
  { skill: 'where:under', zh: '聽懂 under（在下面）' },
  { skill: 'feel:happy', zh: '認得開心的臉（happy）' },
  { skill: 'feel:sad', zh: '認得難過的臉（sad）' },
  { skill: 'feel:angry', zh: '認得生氣的臉（angry）' },
  { skill: 'feel:scared', zh: '認得害怕的臉（scared）' },
  // T-162 積木蓋蓋看（MA-6 用形狀拼出圖案、MA-8 旁邊／上面、CG-3 先看計畫）：照圖蓋一個記一筆；自由蓋不評分、不記
  { skill: 'blocks:1', zh: '照圖蓋積木（3～4 塊，平面）' },
  { skill: 'blocks:2', zh: '照圖蓋積木（6～8 塊，平面）' },
  { skill: 'blocks:3', zh: '照圖蓋積木（前後兩排）' },
  { skill: 'blocks:4', zh: '照步驟圖蓋積木' },
  // 家長 2026-11-17：恐龍賽跑棋（MA-3 一一對應、數到 10，SE-2 輪流）：他走完骰子的點數記一筆；躲起來了幾隻（MA-10 5 以內的分與合）：一題記一筆
  { skill: 'race:1-3-glow', zh: '照骰子點數一格一格走（1～3 點，下一格亮著）' },
  { skill: 'race:1-3', zh: '照骰子點數一格一格走（1～3 點）' },
  { skill: 'race:1-6', zh: '照骰子點數一格一格走（1～6 點）' },
  { skill: 'hide:3-frame', zh: '躲起來了幾隻（3 隻，有空心圈提示）' },
  { skill: 'hide:3-4', zh: '躲起來了幾隻（3～4 隻）' },
  { skill: 'hide:4-5', zh: '躲起來了幾隻（4～5 隻）' },
  { skill: 'hide:5-num', zh: '躲起來了幾隻（5 隻，用數字答）' },
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
