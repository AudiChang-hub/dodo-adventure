// 恐龍賽跑棋（家長 2026-11-17）的內容：棋盤場景（背景 × 格子的樣子）、終點的驚喜、孩子的恐龍。只有資料，沒有畫面（scripts/test-race-hide.ts 直接測）。
// 場景、格子全部自己畫（./art.tsx、../hide/scene.tsx）＋ Fluent Emoji（MIT）的裝飾和驚喜；恐龍是故事繪本的角色（art/storybook）。不照任何現成桌遊或 App 的圖。
import type { SceneDef } from '../hide/scene'

/** 格子的樣子（./art.tsx 的 Cell）：石頭、荷葉、磁磚、雲、木頭切片、葉子、冰塊、星球、花、沙 */
export type CellShape = 'stone' | 'pad' | 'tile' | 'cloud' | 'log' | 'leaf' | 'ice' | 'planet' | 'flower' | 'sand'

export interface Track {
  id: string
  scene: SceneDef
  cell: CellShape
  /** 格子的顏色（彩虹那一條每一格不一樣：給 10 個） */
  fill: string | string[]
  /** 格子的邊 */
  edge: string
  /** 格子上的數字顏色（深色背景的格子用淺色字） */
  ink?: string
}

// 每一條的地平線都在上面（0.2～0.26）：兩條跑道都在地面上
export const TRACKS: Track[] = [
  { id: 'meadow', cell: 'stone', fill: '#E7E2D8', edge: '#A69C8A', scene: { sky: ['#CFE6F0', '#E8F3F6'], ground: '#A9CF8E', horizon: 0.22, deco: [['deciduous-tree', 0.05, 0.02, 0.2], ['sun-with-face', 0.3, 0.01, 0.12], ['blossom', 0.95, 0.16, 0.07]] } },
  { id: 'pond', cell: 'pad', fill: '#8CC77A', edge: '#4F8F45', scene: { sky: ['#D3EAF2', '#EAF5F7'], ground: '#8CC4DE', horizon: 0.2, deco: [['duck', 0.1, 0.1, 0.09], ['lotus', 0.93, 0.13, 0.08], ['cloud', 0.5, 0.01, 0.1]] } },
  { id: 'river', cell: 'stone', fill: '#D9D4CB', edge: '#8D857A', scene: { sky: ['#D6EBF2', '#EEF6F4'], ground: '#93C8E0', far: '#7FB06A', horizon: 0.2, extra: 'hills', deco: [['evergreen-tree', 0.05, 0.0, 0.2], ['evergreen-tree', 0.95, 0.02, 0.18]] } },
  { id: 'beach', cell: 'sand', fill: '#F6E6BC', edge: '#C9A96A', scene: { sky: ['#BFE3F2', '#E6F4F8'], ground: '#F1DDA8', far: '#7DBBD9', horizon: 0.2, extra: 'sea', deco: [['sailboat', 0.72, 0.06, 0.1], ['palm-tree', 0.05, 0.0, 0.22], ['sun', 0.3, 0.01, 0.1]] } },
  { id: 'snow', cell: 'ice', fill: '#DDF0FA', edge: '#7FB2CF', scene: { sky: ['#DDE8F2', '#F2F6FA'], ground: '#F4F6F8', far: '#E4ECF2', horizon: 0.22, deco: [['snowman', 0.05, 0.03, 0.18], ['evergreen-tree', 0.95, 0.0, 0.2], ['snowflake', 0.4, 0.04, 0.06]] } },
  { id: 'forest', cell: 'log', fill: '#E3C08E', edge: '#9B6B3F', scene: { sky: ['#D8EBD8', '#EEF6EA'], ground: '#8FBF7A', horizon: 0.24, deco: [['evergreen-tree', 0.03, 0.0, 0.24], ['evergreen-tree', 0.14, 0.04, 0.18], ['mushroom', 0.95, 0.15, 0.08], ['evergreen-tree', 0.85, 0.02, 0.2]] } },
  { id: 'space', cell: 'planet', fill: ['#F2B88B', '#9FC9EE', '#C9B6E8', '#F4D57E', '#A8DDB5', '#F2A7B6', '#9FC9EE', '#F4D57E', '#C9B6E8', '#F2B88B'], edge: '#3D3566', scene: { sky: ['#22264A', '#3B3F72'], ground: '#4A4C82', horizon: 0.24, extra: 'stars', deco: [['ringed-planet', 0.9, 0.02, 0.14], ['rocket', 0.08, 0.02, 0.13], ['crescent-moon', 0.45, 0.01, 0.1]] } },
  { id: 'sky', cell: 'cloud', fill: '#FFFFFF', edge: '#9DBBD3', scene: { sky: ['#AFD7F0', '#D7ECF8'], ground: '#C4E3F5', horizon: 0.24, extra: 'clouds', deco: [['rainbow', 0.12, 0.0, 0.16], ['kite', 0.88, 0.02, 0.12], ['dove', 0.55, 0.03, 0.08]] } },
  { id: 'desert', cell: 'stone', fill: '#E9C99A', edge: '#AD8556', scene: { sky: ['#F6E3C2', '#FAF0DC'], ground: '#EBCB8E', far: '#E2B978', horizon: 0.22, extra: 'dunes', deco: [['cactus', 0.05, 0.03, 0.17], ['camel', 0.9, 0.05, 0.14], ['sun', 0.45, 0.0, 0.1]] } },
  { id: 'volcano', cell: 'stone', fill: '#C9B8A6', edge: '#7D6A58', scene: { sky: ['#F4DCC8', '#F8EADC'], ground: '#9DBB78', far: '#86A866', horizon: 0.24, extra: 'hills', deco: [['volcano', 0.12, 0.0, 0.2], ['palm-tree', 0.93, 0.0, 0.22], ['sauropod', 0.68, 0.08, 0.13]] } },
  { id: 'garden', cell: 'flower', fill: '#F7B9C9', edge: '#C76F8A', scene: { sky: ['#E4F1F6', '#F4F8F1'], ground: '#B5D99A', horizon: 0.22, deco: [['sunflower', 0.05, 0.0, 0.2], ['tulip', 0.94, 0.08, 0.13], ['butterfly', 0.6, 0.02, 0.08]] } },
  { id: 'autumn', cell: 'leaf', fill: '#F0A85A', edge: '#B4652A', scene: { sky: ['#F3E6CF', '#F8F0E2'], ground: '#D9B377', horizon: 0.22, deco: [['deciduous-tree', 0.05, 0.0, 0.22], ['maple-leaf', 0.4, 0.04, 0.07], ['mushroom', 0.95, 0.12, 0.09]] } },
  { id: 'candy', cell: 'tile', fill: ['#F9C6D3', '#C8EAD9', '#FBE3A8', '#CFE0F8', '#F9C6D3', '#C8EAD9', '#FBE3A8', '#CFE0F8', '#F9C6D3', '#C8EAD9'], edge: '#B98AA0', scene: { sky: ['#FBE4EC', '#FDF2F5'], ground: '#F3D7E1', horizon: 0.22, deco: [['lollipop', 0.05, 0.02, 0.16], ['candy', 0.92, 0.08, 0.1], ['cloud', 0.5, 0.0, 0.1]] } },
  { id: 'jungle', cell: 'leaf', fill: '#7FC27A', edge: '#3E7D3A', scene: { sky: ['#D3EBD6', '#EAF5EA'], ground: '#6FAE62', horizon: 0.24, deco: [['palm-tree', 0.04, 0.0, 0.24], ['parrot', 0.9, 0.02, 0.1], ['monkey', 0.72, 0.08, 0.1]] } },
  { id: 'farm', cell: 'tile', fill: '#F2DDA6', edge: '#B58F48', scene: { sky: ['#D9ECF5', '#F0F6F2'], ground: '#B9D88F', horizon: 0.22, deco: [['house-with-garden', 0.06, 0.02, 0.18], ['tractor', 0.92, 0.09, 0.12], ['cow', 0.7, 0.08, 0.12]] } },
  { id: 'rainbow', cell: 'tile', fill: ['#F4A3A3', '#F7C08A', '#F6DE86', '#B9DD8E', '#9AD3C8', '#9DC4EE', '#B9A9E6', '#E8A9D8', '#F4A3A3', '#F7C08A'], edge: '#8A7F9E', scene: { sky: ['#DDEFF7', '#F1F8FA'], ground: '#A9D49A', horizon: 0.22, extra: 'clouds', deco: [['rainbow', 0.5, 0.0, 0.16]] } },
  { id: 'night', cell: 'stone', fill: '#F3E6B5', edge: '#A99358', ink: '#2E2A25', scene: { sky: ['#34446E', '#56679A'], ground: '#5E8A61', horizon: 0.24, extra: 'stars', deco: [['crescent-moon', 0.88, 0.0, 0.13], ['owl', 0.07, 0.06, 0.12], ['glowing-star', 0.4, 0.02, 0.07]] } },
  { id: 'mountain', cell: 'stone', fill: '#E0DED8', edge: '#8B8A82', scene: { sky: ['#E2F0F7', '#F3F8F8'], ground: '#9CCB7F', far: '#B9DCA0', horizon: 0.24, extra: 'hills', deco: [['evergreen-tree', 0.08, 0.0, 0.2], ['evergreen-tree', 0.9, 0.02, 0.18], ['bird', 0.5, 0.04, 0.06]] } },
  { id: 'lake', cell: 'log', fill: '#DDB98A', edge: '#93663A', scene: { sky: ['#CFE6F0', '#EAF4F7'], ground: '#8CC4DE', far: '#A6CF8C', horizon: 0.22, extra: 'hills', deco: [['swan', 0.08, 0.11, 0.1], ['sailboat', 0.9, 0.06, 0.12], ['deciduous-tree', 0.5, 0.0, 0.14]] } },
  { id: 'park', cell: 'tile', fill: '#E9E4F2', edge: '#9A8FB5', scene: { sky: ['#D5EAF5', '#EDF6F9'], ground: '#A6D18C', horizon: 0.22, deco: [['deciduous-tree', 0.04, 0.0, 0.2], ['kite', 0.6, 0.0, 0.1], ['soccer-ball', 0.95, 0.16, 0.06]] } },
]

/** 終點的驚喜（FB-6：事先不說、每次不一樣）：終點放一個包好的禮物，兩隻都到了才打開。en 是念的（We found a cake!） */
export interface Reward {
  id: string
  emoji: string
  en: string
}

export const REWARDS: Reward[] = [
  { id: 'cake', emoji: 'birthday-cake', en: 'a cake' },
  { id: 'icecream', emoji: 'soft-ice-cream', en: 'ice cream' },
  { id: 'cupcake', emoji: 'cupcake', en: 'a cupcake' },
  { id: 'donut', emoji: 'doughnut', en: 'a donut' },
  { id: 'cookie', emoji: 'cookie', en: 'a cookie' },
  { id: 'lollipop', emoji: 'lollipop', en: 'a lollipop' },
  { id: 'strawberry', emoji: 'strawberry', en: 'a strawberry' },
  { id: 'watermelon', emoji: 'watermelon', en: 'a watermelon' },
  { id: 'cherries', emoji: 'cherries', en: 'cherries' },
  { id: 'grapes', emoji: 'grapes', en: 'grapes' },
  { id: 'banana', emoji: 'banana', en: 'a banana' },
  { id: 'peach', emoji: 'peach', en: 'a peach' },
  { id: 'apple', emoji: 'red-apple', en: 'an apple' },
  { id: 'mango', emoji: 'mango', en: 'a mango' },
  { id: 'pineapple', emoji: 'pineapple', en: 'a pineapple' },
  { id: 'pancakes', emoji: 'pancakes', en: 'pancakes' },
  { id: 'popcorn', emoji: 'popcorn', en: 'popcorn' },
  { id: 'pie', emoji: 'pie', en: 'a pie' },
  { id: 'honey', emoji: 'honey-pot', en: 'honey' },
  { id: 'balloon', emoji: 'balloon', en: 'a balloon' },
  { id: 'kite', emoji: 'kite', en: 'a kite' },
  { id: 'teddy', emoji: 'teddy-bear', en: 'a teddy bear' },
  { id: 'yoyo', emoji: 'yo-yo', en: 'a yo-yo' },
  { id: 'ball', emoji: 'soccer-ball', en: 'a ball' },
  { id: 'drum', emoji: 'drum', en: 'a drum' },
  { id: 'guitar', emoji: 'guitar', en: 'a guitar' },
  { id: 'trumpet', emoji: 'trumpet', en: 'a trumpet' },
  { id: 'crown', emoji: 'crown', en: 'a crown' },
  { id: 'jewel', emoji: 'gem-stone', en: 'a jewel' },
  { id: 'wand', emoji: 'magic-wand', en: 'a magic wand' },
  { id: 'rocket', emoji: 'rocket', en: 'a rocket' },
  { id: 'flowers', emoji: 'bouquet', en: 'flowers' },
]

/** 孩子的恐龍（故事繪本的角色）：每一局換一隻。對手一直是豆豆（dodo） */
export const RUNNERS = ['sauropod', 'trex', 'bobo', 'momo'] as const
export type Runner = (typeof RUNNERS)[number]

/** 要產生的 Fluent Emoji（scripts/build-race-hide-emoji.ts） */
export const RACE_EMOJI = [...new Set([...TRACKS.flatMap((t) => t.scene.deco.map((d) => d[0])), ...REWARDS.map((r) => r.emoji), 'wrapped-gift', 'chequered-flag'])]
