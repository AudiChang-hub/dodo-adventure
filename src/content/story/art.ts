// 故事自己畫的圖（Pic 裡 @ 開頭的代號）：Fluent Emoji 沒有的東西，畫在 ui/StoryPic.tsx
export const STORY_ART = {
  /** 彩虹蛋：七個彩色斑點（紅、橘、黃、綠、藍、靛、紫），故事世界 §2.1 */
  '@rainbow-egg': '彩虹蛋',
  /** 軟軟的格子毯 */
  '@blanket': '毯子',
  /** 蛋窩：籃子裡鋪著羊毛和毯子，蛋在裡面，旁邊一隻泰迪熊（第 1 篇講完，魔法屋客廳角落多的東西） */
  '@egg-nest': '蛋窩',
  /** 方舟：木頭的大船，上面一間小屋（挪亞方舟；Fluent 的 ship 是現代的郵輪） */
  '@ark': '方舟',
  /** 方舟，長頸鹿和大象從窗戶探出頭（大家在船裡暖暖的） */
  '@ark-full': '方舟（動物探頭）',
  /** 一對一對的動物：兩隻獅子、兩隻猴子、兩隻烏龜（數一數有幾對） */
  '@pairs': '一對一對的動物',
} as const

export type StoryArt = keyof typeof STORY_ART

/** 兩隻一樣的動物並排（@two-elephant：兩隻大象，面對面）：挪亞方舟的「兩隻兩隻」 */
export const TWO = '@two-'

/** 自己畫的圖裡用到的 Fluent Emoji（要一起打包） */
const USES: Partial<Record<StoryArt, string[]>> = {
  '@egg-nest': ['basket', 'teddy-bear'],
  '@ark-full': ['giraffe', 'elephant'],
  '@pairs': ['lion', 'monkey', 'turtle'],
}

/** 這張自己畫的圖用到哪些 Fluent Emoji；不是故事的圖回傳 null */
export function artParts(name: string): string[] | null {
  if (name.startsWith(TWO)) return [name.slice(TWO.length)]
  return name in STORY_ART ? (USES[name as StoryArt] ?? []) : null
}
