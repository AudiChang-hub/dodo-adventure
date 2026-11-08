// 題目的關鍵字（T-109）：關鍵字放在題目最前面（Big S!、More! Which side?），這裡登記「開頭幾個字是關鍵字」。
// lib/audio.ts 照 timings.json 的逐字時間算出關鍵字什麼時候念完；孩子在那之前就點，作答紀錄記成沒聽完（heard: false）。
// 沒登記的句子整句都算關鍵字（Big S! 本來就只有關鍵字）。
const KW = new Map<string, number>()

/** 這一句開頭的 words 個字是關鍵字 */
export function keyword(key: string, words: number) {
  KW.set(key, words)
}

/** 這一句的關鍵字有幾個字；沒登記的是整句（Infinity） */
export const keywordWords = (key: string) => KW.get(key) ?? Infinity
