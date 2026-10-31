// 孩子端的功能開關（2026-10-31 簡化成學校的教法：首頁只剩英文、中文、數學三個大門，加上故事和畫畫）。
// 藏起來的畫面程式都還在，改成 true 就回來；家長區的學習紀錄、作答紀錄不受影響，照常記錄。
// 這個檔不能 import 任何東西：三歲測試（tests/toddler/lib/features.ts）直接讀它，決定哪些測試要跳過。

export const FEATURES = {
  /** 地圖、站點（字母森林、數字工地、動物村、畫畫小屋、彩虹公園、程式車庫的遊戲卡） */
  map: false,
  /** 今日冒險（首頁的「出發」、路線圖、故事時間、每日回顧） */
  adventure: false,
  /** 魔法屋（故事書改成從首頁的「故事」直接進） */
  house: false,
  /** 我的朋友、貼紙本 */
  collection: false,
  /** 出遊任務卡（首頁的「Did you see a bus?」） */
  outing: false,
  /**
   * 成長系統的關卡鎖和排課：新內容要等階梯開到那一階、每週新概念有額度（lib/adaptive.ts 的 canIntroduce、rungOpen）。
   * 關掉時新內容由每一課自己決定什麼時候教；熟練度、作答紀錄照常記。
   */
  growthGates: false,
  /**
   * 每日時間到的睡覺畫面（家長設定的每天幾分鐘）。這是家長的時間限制，不是孩子玩的功能，先留著；
   * 冒險裡的「睡前時光」主題跟著今日冒險一起藏起來了。
   */
  bedtime: true,
} as const

export type Feature = keyof typeof FEATURES

const forced: Partial<Record<Feature, boolean>> = {}

/**
 * 離線的單元測試、模擬（scripts/test-ladder.ts、sim-teach.ts、sim-growth.ts）測的是藏起來的那一套（成長系統的關卡鎖）：
 * 它們在開頭把開關打開再測。App 裡不要用。
 */
export function forceFeature(f: Feature, v: boolean) {
  forced[f] = v
}

export const on = (f: Feature): boolean => forced[f] ?? FEATURES[f]
