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
