// 蹺蹺板比輕重（家長 2026-11-17）的東西：都是 Fluent Emoji（主程式那一套沒有的在 ./emoji.generated.ts，scripts/build-seesaw-emoji.ts 產生）。
// 重量是「級」不是公克：每一級大約差好幾倍（羽毛、鉛筆、蘋果、鳳梨、貓、狗、豬、汽車、大象），題目只出差 2 級以上的（大人一看就知道哪個重）。
// size 是畫多大（1 小～5 大，照真的東西的樣子）；big：可以畫得很大但很輕（氣球、風箏）；small：可以畫得很小但很重（石頭、磚塊）。
// 「大的不一定比較重」的題目只用 big 對 small（./plan.ts）。

export interface Item {
  /** Fluent Emoji 的名字，也是作答紀錄、台詞的 id */
  id: string
  /** 英文（The rock is heavier.） */
  en: string
  /** 重量級 1～9 */
  w: number
  /** 平常畫多大 1～5 */
  size: number
  /** 可以畫得很大但很輕 */
  big?: true
  /** 可以畫得很小但很重 */
  small?: true
}

export const ITEMS: Item[] = [
  // 1：幾乎沒有重量
  { id: 'feather', en: 'feather', w: 1, size: 2 },
  { id: 'leaf-fluttering-in-wind', en: 'leaf', w: 1, size: 2, big: true },
  { id: 'butterfly', en: 'butterfly', w: 1, size: 2 },
  { id: 'lady-beetle', en: 'ladybug', w: 1, size: 1 },
  { id: 'honeybee', en: 'bee', w: 1, size: 1 },
  { id: 'snail', en: 'snail', w: 1, size: 1 },
  { id: 'balloon', en: 'balloon', w: 1, size: 4, big: true },
  { id: 'sponge', en: 'sponge', w: 1, size: 3, big: true },
  // 2：拿在手上很輕
  { id: 'pencil', en: 'pencil', w: 2, size: 2 },
  { id: 'crayon', en: 'crayon', w: 2, size: 1 },
  { id: 'key', en: 'key', w: 2, size: 1 },
  { id: 'egg', en: 'egg', w: 2, size: 2 },
  { id: 'strawberry', en: 'strawberry', w: 2, size: 1 },
  { id: 'cherries', en: 'cherry', w: 2, size: 1 },
  { id: 'socks', en: 'sock', w: 2, size: 2 },
  { id: 'cookie', en: 'cookie', w: 2, size: 2 },
  { id: 'tennis', en: 'tennis ball', w: 2, size: 2 },
  { id: 'mouse', en: 'mouse', w: 2, size: 1 },
  { id: 'kite', en: 'kite', w: 2, size: 5, big: true },
  { id: 'yarn', en: 'yarn ball', w: 2, size: 3, big: true },
  { id: 'mushroom', en: 'mushroom', w: 2, size: 1 },
  // 3：一個水果、一隻鞋
  { id: 'red-apple', en: 'apple', w: 3, size: 2 },
  { id: 'banana', en: 'banana', w: 3, size: 2 },
  { id: 'pear', en: 'pear', w: 3, size: 2 },
  { id: 'tangerine', en: 'orange', w: 3, size: 2 },
  { id: 'running-shoe', en: 'shoe', w: 3, size: 3 },
  { id: 'teddy-bear', en: 'teddy bear', w: 3, size: 4, big: true },
  { id: 'soccer-ball', en: 'ball', w: 3, size: 3 },
  { id: 'umbrella', en: 'umbrella', w: 3, size: 5, big: true },
  { id: 'closed-book', en: 'book', w: 3, size: 3 },
  // 4：要用兩隻手拿
  { id: 'pineapple', en: 'pineapple', w: 4, size: 3 },
  { id: 'coconut', en: 'coconut', w: 4, size: 3 },
  { id: 'hammer', en: 'hammer', w: 4, size: 2, small: true },
  { id: 'bell', en: 'bell', w: 4, size: 2, small: true },
  { id: 'rabbit', en: 'rabbit', w: 4, size: 3 },
  { id: 'chicken', en: 'chicken', w: 4, size: 3 },
  { id: 'duck', en: 'duck', w: 4, size: 3 },
  { id: 'basketball', en: 'basketball', w: 4, size: 3 },
  // 5：抱得動但很重
  { id: 'brick', en: 'brick', w: 5, size: 2, small: true },
  { id: 'rock', en: 'rock', w: 5, size: 2, small: true },
  { id: 'bowling', en: 'bowling ball', w: 5, size: 2, small: true },
  { id: 'cat', en: 'cat', w: 5, size: 3 },
  { id: 'watermelon', en: 'watermelon', w: 5, size: 3 },
  { id: 'jack-o-lantern', en: 'pumpkin', w: 5, size: 3 },
  // 6：抱不動
  { id: 'dog', en: 'dog', w: 6, size: 4 },
  { id: 'anchor', en: 'anchor', w: 6, size: 2, small: true },
  { id: 'goat', en: 'goat', w: 6, size: 4 },
  { id: 'ewe', en: 'sheep', w: 6, size: 4 },
  { id: 'kangaroo', en: 'kangaroo', w: 6, size: 4 },
  // 7：比大人還重
  { id: 'pig', en: 'pig', w: 7, size: 4 },
  { id: 'panda', en: 'panda', w: 7, size: 4 },
  { id: 'gorilla', en: 'gorilla', w: 7, size: 4 },
  { id: 'lion', en: 'lion', w: 7, size: 4 },
  { id: 'bear', en: 'bear', w: 7, size: 5 },
  { id: 'horse', en: 'horse', w: 7, size: 5 },
  { id: 'cow', en: 'cow', w: 7, size: 5 },
  // 8、9：非常非常重
  { id: 'automobile', en: 'car', w: 8, size: 5 },
  { id: 'elephant', en: 'elephant', w: 9, size: 5 },
  { id: 'hippopotamus', en: 'hippo', w: 9, size: 5 },
  { id: 'rhinoceros', en: 'rhino', w: 9, size: 5 },
  { id: 'bus', en: 'bus', w: 9, size: 5 },
]

export const ITEM: Record<string, Item> = Object.fromEntries(ITEMS.map((x) => [x.id, x]))
/** 要用到的圖示（scripts/build-seesaw-emoji.ts） */
export const SEESAW_ICONS = ITEMS.map((x) => x.id)
