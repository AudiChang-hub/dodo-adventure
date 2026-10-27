// 顏色刻意比紙感主題飽和一點：要讓孩子分得出「紅」和「粉紅」，但不刺眼
export const COLORS = [
  { id: 'red', en: 'red', zh: '紅', hex: '#DE6B5A' },
  { id: 'yellow', en: 'yellow', zh: '黃', hex: '#F2C84B' },
  { id: 'blue', en: 'blue', zh: '藍', hex: '#5E93D1' },
  { id: 'green', en: 'green', zh: '綠', hex: '#6DB06B' },
  { id: 'orange', en: 'orange', zh: '橘', hex: '#EE9A4C' },
  { id: 'purple', en: 'purple', zh: '紫', hex: '#9C7FCB' },
  { id: 'pink', en: 'pink', zh: '粉紅', hex: '#F09DB9' },
  { id: 'brown', en: 'brown', zh: '咖啡', hex: '#9C7356' },
] as const

export type ColorId = (typeof COLORS)[number]['id']

/** 顏色教學卡旁邊的例子：An apple is red! */
export const COLOR_EXAMPLES: Record<ColorId, string> = {
  red: 'red-apple',
  yellow: 'banana',
  blue: 'spouting-whale',
  green: 'frog',
  orange: 'carrot',
  purple: 'grapes',
  pink: 'pig-face',
  brown: 'teddy-bear',
}

export const SHAPES = [
  { id: 'circle', en: 'circle', zh: '圓形' },
  { id: 'triangle', en: 'triangle', zh: '三角形' },
  { id: 'square', en: 'square', zh: '正方形' },
  { id: 'star', en: 'star', zh: '星星' },
  { id: 'heart', en: 'heart', zh: '愛心' },
  { id: 'rect', en: 'rectangle', zh: '長方形' },
] as const

export type ShapeId = (typeof SHAPES)[number]['id']

/** 比大小用的圖示 */
export const SIZE_ICONS = ['t-rex', 'red-apple', 'automobile', 'elephant', 'fish', 'teddy-bear', 'balloon', 'sauropod']

/** 數數用的圖示 */
export const COUNT_ICONS = ['egg', 'automobile', 't-rex', 'red-apple', 'fish', 'star', 'balloon', 'sauropod', 'bus', 'strawberry']

/** 孵蛋會孵出的朋友 */
export const FRIENDS = [
  't-rex', 'sauropod', 'dragon', 'baby-chick', 'turtle', 'penguin', 'owl', 'fox', 'koala', 'panda',
  'rabbit-face', 'lion', 'tiger-face', 'elephant', 'giraffe', 'zebra', 'hedgehog', 'dolphin', 'octopus', 'crab',
  'racing-car', 'fire-engine', 'locomotive', 'helicopter', 'rocket', 'tractor', 'sailboat', 'police-car', 'bus', 'ambulance',
]

// ── 工作線 B：學習單題型 ───────────────────────────────────────
/** 立體形狀（找出全部、找立體形狀）：用 src/art/Solid.tsx 畫成有明暗面的立體圖 */
export const SOLIDS = [
  { id: 'cube', en: 'cube', zh: '正方體' },
  { id: 'sphere', en: 'sphere', zh: '球體' },
  { id: 'cylinder', en: 'cylinder', zh: '圓柱' },
  { id: 'cone', en: 'cone', zh: '圓錐' },
  { id: 'prism', en: 'prism', zh: '三角柱' },
] as const

export type SolidId = (typeof SOLIDS)[number]['id']

/** 立體形狀教學卡的第二句：連到孩子看過的東西 */
export const SOLID_LIKE: Record<SolidId, string> = {
  cube: 'Like a | block!',
  sphere: 'Round, like a | ball!',
  cylinder: 'Like a | can!',
  cone: 'Like an ice cream | cone!',
  prism: 'Like a | tent!',
}

/** 立體形狀容易混淆的對象：高難度時優先當干擾（正方體 vs 三角柱，就是學習單的原題） */
export const SOLID_LOOKALIKE: Record<SolidId, SolidId[]> = {
  cube: ['prism', 'cylinder'],
  sphere: ['cylinder', 'cone'],
  cylinder: ['cube', 'sphere'],
  cone: ['prism', 'cylinder'],
  prism: ['cube', 'cone'],
}

/** 氣球的造型：「找出全部」的顏色題用（同色、不同形，包含熊形氣球） */
export const BALLOON_KINDS = ['round', 'heart', 'star', 'bear'] as const
export type BalloonKind = (typeof BALLOON_KINDS)[number]

/** 學習單題型用到、但不在詞彙表裡的圖示（scripts/build-emoji.ts 會一起打包） */
export const SHEET_ICONS = [
  'green-apple', 'tomato', 'peach', 'tangerine', 'cherries', 'lemon',
  'soccer-ball', 'basketball', 'baseball', 'tennis',
  'baby-chick', 'front-facing-baby-chick', 'hatching-chick', 'hamster',
  'lady-beetle', 'beetle', 'ant', 'snail',
  'racing-car', 'game-die', 'package', 'basket', 'leaf-fluttering-in-wind',
]
