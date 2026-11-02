// 孩子端的功能開關（2026-10-31 簡化成學校的教法：首頁只剩英文、中文、數學三個大門，加上故事和畫畫）。
// 舊的地圖、今日冒險、魔法屋、貼紙本、出遊任務卡已經從程式拿掉（T-75，2026-11-02 家長同意），要找回來從 git 歷史救。
// 成長系統的關卡鎖（growthGates，一直是關的）跟著階梯一起在 T-76 第 3 層拿掉了。
// 這個檔不能 import 任何東西：三歲測試（tests/toddler/lib/features.ts）直接讀它。

export const FEATURES = {
  /**
   * 每日時間到的睡覺畫面（家長設定的每天幾分鐘）。這是家長的時間限制，不是孩子玩的功能，先留著。
   */
  bedtime: true,
} as const

export type Feature = keyof typeof FEATURES

export const on = (f: Feature): boolean => FEATURES[f]
