// 孩子端的功能開關（2026-10-31 簡化成學校的教法：首頁只剩英文、中文、數學三個大門，加上故事和畫畫）。
// 舊的地圖、今日冒險、魔法屋、貼紙本、出遊任務卡已經從程式拿掉（T-75，2026-11-02 家長同意），要找回來從 git 歷史救。
// 這個檔不能 import 任何東西：三歲測試（tests/toddler/lib/features.ts）直接讀它。

export const FEATURES = {
  /**
   * 成長系統的關卡鎖和排課：新內容要等階梯開到那一階、每週新概念有額度（lib/adaptive.ts 的 canIntroduce、rungOpen）。
   * 關掉時新內容由每一課自己決定什麼時候教；熟練度、作答紀錄照常記。
   */
  growthGates: false,
  /**
   * 每日時間到的睡覺畫面（家長設定的每天幾分鐘）。這是家長的時間限制，不是孩子玩的功能，先留著。
   */
  bedtime: true,
} as const

export type Feature = keyof typeof FEATURES

const forced: Partial<Record<Feature, boolean>> = {}

/**
 * 離線的單元測試（scripts/test-ladder.ts）測的是藏起來的那一套（成長系統的關卡鎖）：
 * 它們在開頭把開關打開再測。App 裡不要用。
 */
export function forceFeature(f: Feature, v: boolean) {
  forced[f] = v
}

export const on = (f: Feature): boolean => forced[f] ?? FEATURES[f]
