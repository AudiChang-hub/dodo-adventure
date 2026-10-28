// 學習單題型的純資料（沒有任何執行期相依）：題目產生器 games-worksheet.ts 與台詞 lines-worksheet.ts 共用。
// 只學紙本學習單的「題型」，圖文全部是自己的：圖示來自 Fluent Emoji、形狀與氣球是自己畫的 SVG。

/** 「找出全部」的類別題：targets 是答案的圖示，easy / hard 是低、高難度的干擾 */
export interface CategoryDef {
  /** 題目裡的複數，例如 Find all the | apples! */
  plural: string
  targets: string[]
  easy: string[]
  hard: string[]
  /** 教學卡的兩個例子與兩句話 */
  examples: [string, string]
  teach: [string, string]
}

export const CATEGORIES = {
  // 學習單原題：找出蘋果並塗色（避開球）
  apple: {
    plural: 'apples',
    targets: ['red-apple', 'green-apple'],
    easy: ['soccer-ball', 'basketball', 'tennis', 'baseball'],
    // 櫻桃不常吃、又是複數（2026-10-28 單字盤點）：高難度改用番茄、桃子、球
    hard: ['tomato', 'peach', 'soccer-ball', 'baseball'],
    examples: ['red-apple', 'green-apple'],
    teach: ['This is an | apple.', 'This is an apple, | too!'],
  },
  // 學習單原題是「找出小雞（避開倉鼠）」；倉鼠的圖像老鼠，又不是孩子會的字，改用差很多的東西
  chick: {
    plural: 'chicks',
    targets: ['baby-chick', 'front-facing-baby-chick', 'hatching-chick'],
    easy: ['soccer-ball', 'fish', 'turtle', 'automobile'],
    hard: ['lemon', 'duck', 'chicken', 'snail'],
    examples: ['baby-chick', 'front-facing-baby-chick'],
    teach: ['This is a | chick.', 'This is a chick, | too!'],
  },
  bug: {
    plural: 'bugs',
    // 甲蟲（beetle）陌生、圖小：只留瓢蟲和螞蟻
    targets: ['lady-beetle', 'ant'],
    easy: ['red-apple', 'automobile', 'star', 'teddy-bear'],
    hard: ['frog', 'turtle', 'mouse-face', 'snail'],
    examples: ['lady-beetle', 'ant'],
    teach: ['A ladybug is a | bug.', 'An ant is a bug, | too!'],
  },
  car: {
    plural: 'cars',
    targets: ['automobile', 'taxi', 'police-car', 'racing-car'],
    easy: ['cat-face', 'banana', 'star', 'fish'],
    hard: ['bus', 'delivery-truck', 'bicycle', 'tractor', 'fire-engine'],
    examples: ['automobile', 'taxi'],
    teach: ['This is a | car.', 'A taxi is a car, | too!'],
  },
  fruit: {
    plural: 'fruit',
    // 橘子（tangerine）不放：orange 同時是顏色，點到也不唸名字
    targets: ['banana', 'grapes', 'strawberry', 'watermelon', 'red-apple', 'peach'],
    easy: ['automobile', 'dog-face', 'soccer-ball', 'bed'],
    hard: ['carrot', 'cookie', 'teddy-bear', 'soccer-ball'],
    examples: ['banana', 'grapes'],
    teach: ['A banana is a | fruit.', 'Grapes are fruit, | too!'],
  },
  animal: {
    plural: 'animals',
    targets: ['dog-face', 'cat-face', 'cow-face', 'pig-face', 'rabbit-face', 'elephant', 'lion', 'monkey-face', 'bird', 'fish'],
    easy: ['automobile', 'banana', 'umbrella', 'bus'],
    // 泰迪熊是玩具、不是動物：高難度的「長得像」
    hard: ['teddy-bear', 'automobile', 'red-apple', 'bed', 'balloon'],
    examples: ['dog-face', 'bird'],
    teach: ['A dog is an | animal.', 'A bird is an animal, | too!'],
  },
} satisfies Record<string, CategoryDef>

export type CategoryId = keyof typeof CATEGORIES

/**
 * 學習單上、不在詞彙表的圖示的名稱：點錯時說「This is a | ball.」（只有教過的字才唸，見 games-worksheet.ts）。
 * 橘子（tangerine）刻意不給名字：orange 同時是顏色。
 */
export const SHEET_NAMES: Record<string, string> = {
  'soccer-ball': 'ball',
  basketball: 'ball',
  tennis: 'ball',
  baseball: 'ball',
  tomato: 'tomato',
  peach: 'peach',
  lemon: 'lemon',
  snail: 'snail',
  star: 'star',
  'teddy-bear': 'teddy bear',
  balloon: 'balloon',
  'green-apple': 'green apple',
  'red-apple': 'apple',
  'baby-chick': 'chick',
  'front-facing-baby-chick': 'chick',
  'hatching-chick': 'chick',
  'lady-beetle': 'ladybug',
  ant: 'ant',
  'racing-car': 'race car',
}

/** 複數名詞：念「These are | grapes.」 */
export const PLURAL_NAMES = new Set(['cherries', 'grapes', 'socks', 'noodles'])

/** 顏色題：低難度只出四個主要顏色 */
export const SHEET_COLORS_EASY = ['red', 'yellow', 'blue', 'green'] as const
export const SHEET_COLORS_HARD = ['orange', 'purple', 'pink'] as const

/** 容易混淆的顏色：高難度時優先當干擾 */
export const COLOR_LOOKALIKE: Record<string, string[]> = {
  red: ['pink', 'orange'],
  yellow: ['orange', 'green'],
  blue: ['purple', 'green'],
  green: ['blue', 'yellow'],
  orange: ['red', 'yellow'],
  purple: ['blue', 'pink'],
  pink: ['red', 'purple'],
}

/** 平面形狀題：容易混淆的對象 */
export const SHAPE_LOOKALIKE: Record<string, string[]> = {
  circle: ['heart', 'square'],
  triangle: ['star', 'square'],
  square: ['rect', 'circle'],
  star: ['triangle', 'heart'],
  heart: ['circle', 'star'],
}

/**
 * 功能分類的題目（動物村，莫莫說）。句型和「動動腦」同一種：Which one can we | eat?（找出全部是 Which ones）。
 * 不用 things、use 這種抽象字（2026-10-28 單字盤點第 4 章）。
 */
export const USE_QUESTION: Record<string, string> = {
  rain: 'Which ones are for a | rainy day?',
  bath: 'Which ones are for | bath time?',
  bed: 'Which ones are for | bedtime?',
  eat: 'Which ones can we | eat?',
  wear: 'Which ones can we | wear?',
}
/**
 * 功能分類的教學句：第一個例子、第二個例子（「…, too.」）各一句。{a} 是 a／an，{w} 是名字。
 * 例子是哪個字見 vocab.ts 的 USE_EXAMPLES（家長勾掉的字不當例子，換下一個候選字，句子跟著換）。
 */
export const USE_TEACH: Record<string, [string, string]> = {
  rain: ['On a rainy day, we use {a} | {w}.', 'We use {a} {w}, | too.'],
  bath: ['At bath time, we use {a} | {w}.', 'We use {a} {w}, | too.'],
  bed: ['At bedtime, we use {a} | {w}.', 'We use {a} {w}, | too.'],
  eat: ['We can eat {a} | {w}.', 'We can eat {a} {w}, | too.'],
  wear: ['We wear {a} | {w}.', 'We wear {a} {w}, | too.'],
}
/** 舊版預設例子的句子比較生動，預設的那兩個字照舊用 */
export const USE_TEACH_DEFAULT: Record<string, Record<string, string>> = {
  bath: { bathtub: 'At bath time, we sit in the | bathtub.' },
  bed: { bed: 'At bedtime, we sleep in a | bed.', teddy: 'We hug a | teddy bear.' },
}

/** 「塗格子」要數的東西（學習單原題是甲蟲與貓） */
export const FILL_ICONS = ['lady-beetle', 'cat-face', 'red-apple', 'fish', 'baby-chick', 'star', 'automobile', 'strawberry']
