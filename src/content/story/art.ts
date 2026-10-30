// 故事自己畫的圖（Pic 裡 @ 開頭的代號）：Fluent Emoji 沒有的東西，畫在 ui/StoryPic.tsx
export const STORY_ART = {
  /** 彩虹蛋：七個彩色斑點（紅、橘、黃、綠、藍、靛、紫），故事世界 §2.1 */
  '@rainbow-egg': '彩虹蛋',
  /** 軟軟的格子毯 */
  '@blanket': '毯子',
  /** 蛋窩：籃子裡鋪著羊毛和毯子，蛋在裡面，旁邊一隻泰迪熊（第 1 篇講完，魔法屋客廳角落多的東西） */
  '@egg-nest': '蛋窩',
} as const

export type StoryArt = keyof typeof STORY_ART
