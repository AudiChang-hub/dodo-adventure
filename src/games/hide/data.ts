// 躲起來了幾隻（家長 2026-11-17）的內容：小動物、躲的地方（山洞、樹叢、箱子…）、場景。只有資料，沒有畫面（scripts/test-race-hide.ts 直接測）。
// 小動物、大部分躲的地方是 Fluent Emoji（MIT，./emoji.tsx）；山洞、樹叢、紙箱、草堆、樹洞是自己畫的 SVG（./art.tsx）。不照任何現成 App 的關卡或圖。
import type { SceneDef } from './scene'

/** 一種小動物（一題裡 N 隻都是同一種）：都是全身、一看就知道的 */
export const ANIMALS = [
  'cat',
  'dog',
  'poodle',
  'rabbit',
  'mouse',
  'hamster',
  'pig',
  'cow',
  'ewe',
  'goat',
  'llama',
  'horse',
  'deer',
  'chipmunk',
  'hedgehog',
  'raccoon',
  'fox',
  'koala',
  'panda',
  'sloth',
  'otter',
  'beaver',
  'kangaroo',
  'monkey',
  'chicken',
  'rooster',
  'baby-chick',
  'duck',
  'swan',
  'penguin',
  'owl',
  'parrot',
  'flamingo',
  'peacock',
  'turtle',
  'frog',
  'lizard',
  'snail',
  'lady-beetle',
  'honeybee',
  'butterfly',
  'crab',
] as const

/** 自己畫的躲藏處（./art.tsx 的 HidePlace） */
export type DrawnPlace = 'cave' | 'bush' | 'box' | 'haystack' | 'log'
export const DRAWN: DrawnPlace[] = ['cave', 'bush', 'box', 'haystack', 'log']

/** 場景的種類：室外、室內；雪地、海邊、晚上（有些躲的地方只放得進某幾種） */
export type SceneKind = 'out' | 'in'
export type Climate = 'snow' | 'sand' | 'night' | 'warm'

export interface HidePlace {
  id: string
  /** 自己畫的（DrawnPlace）或 Fluent Emoji 的名字 */
  art: DrawnPlace | string
  drawn?: boolean
  kinds: SceneKind[]
  /** 只放在這幾種氣候的場景 */
  only?: Climate[]
  /** 不放在這幾種氣候的場景 */
  not?: Climate[]
}

export const PLACES: HidePlace[] = [
  { id: 'cave', art: 'cave', drawn: true, kinds: ['out'] },
  { id: 'bush', art: 'bush', drawn: true, kinds: ['out'], not: ['snow', 'sand'] },
  { id: 'box', art: 'box', drawn: true, kinds: ['out', 'in'] },
  { id: 'haystack', art: 'haystack', drawn: true, kinds: ['out'], not: ['snow', 'sand', 'night'] },
  { id: 'log', art: 'log', drawn: true, kinds: ['out'], not: ['sand'] },
  { id: 'rock', art: 'rock', kinds: ['out'] },
  { id: 'gift', art: 'wrapped-gift', kinds: ['out', 'in'] },
  { id: 'basket', art: 'basket', kinds: ['out', 'in'] },
  { id: 'tent', art: 'tent', kinds: ['out', 'in'], not: ['sand'] },
  { id: 'hut', art: 'hut', kinds: ['out'], not: ['snow'] },
  { id: 'house', art: 'house', kinds: ['out'] },
  { id: 'garden-house', art: 'house-with-garden', kinds: ['out'], not: ['snow', 'sand'] },
  { id: 'castle', art: 'castle', kinds: ['out'] },
  { id: 'circus', art: 'circus-tent', kinds: ['out'], not: ['snow'] },
  { id: 'snowman', art: 'snowman', kinds: ['out'], only: ['snow'] },
  { id: 'pine', art: 'evergreen-tree', kinds: ['out'], not: ['sand'] },
  { id: 'tree', art: 'deciduous-tree', kinds: ['out'], not: ['snow', 'sand'] },
  { id: 'palm', art: 'palm-tree', kinds: ['out'], only: ['sand', 'warm'] },
  { id: 'mushroom', art: 'mushroom', kinds: ['out'], not: ['snow', 'sand'] },
  { id: 'logs', art: 'wood', kinds: ['out'], not: ['sand'] },
  { id: 'pumpkin', art: 'jack-o-lantern', kinds: ['out'], only: ['night'] },
  { id: 'couch', art: 'couch-and-lamp', kinds: ['in'] },
  { id: 'bathtub', art: 'bathtub', kinds: ['in'] },
  { id: 'hat', art: 'top-hat', kinds: ['in', 'out'], not: ['snow', 'sand'] },
  { id: 'bucket', art: 'bucket', kinds: ['out', 'in'], only: ['sand'] },
]

export interface HideScene extends SceneDef {
  id: string
  kind: SceneKind
  climate?: Climate
}

// 地平線在畫面一半上面一點：動物站在草地上，山洞、箱子放得下
export const SCENES: HideScene[] = [
  { id: 'meadow', kind: 'out', sky: ['#CFE6F0', '#E8F3F6'], ground: '#A9CF8E', horizon: 0.42, deco: [['sun-with-face', 0.1, 0.04, 0.13], ['cloud', 0.42, 0.06, 0.1], ['blossom', 0.96, 0.4, 0.06]] },
  { id: 'forest', kind: 'out', sky: ['#D8EBD8', '#EEF6EA'], ground: '#8FBF7A', horizon: 0.42, deco: [['evergreen-tree', 0.03, 0.12, 0.3], ['evergreen-tree', 0.14, 0.18, 0.24], ['evergreen-tree', 0.97, 0.14, 0.28]] },
  { id: 'beach', kind: 'out', climate: 'sand', sky: ['#BFE3F2', '#E6F4F8'], ground: '#F1DDA8', far: '#7DBBD9', horizon: 0.4, extra: 'sea', deco: [['sailboat', 0.3, 0.2, 0.12], ['sun', 0.08, 0.04, 0.12]] },
  { id: 'snow', kind: 'out', climate: 'snow', sky: ['#DDE8F2', '#F2F6FA'], ground: '#F4F6F8', far: '#E4ECF2', horizon: 0.42, extra: 'hills', deco: [['snowflake', 0.25, 0.08, 0.06], ['snowflake', 0.6, 0.14, 0.05], ['evergreen-tree', 0.04, 0.16, 0.26]] },
  { id: 'farm', kind: 'out', sky: ['#D9ECF5', '#F0F6F2'], ground: '#B9D88F', horizon: 0.42, deco: [['tractor', 0.08, 0.3, 0.12], ['sunflower', 0.96, 0.26, 0.16], ['sun', 0.4, 0.04, 0.1]] },
  { id: 'garden', kind: 'out', sky: ['#E4F1F6', '#F4F8F1'], ground: '#B5D99A', horizon: 0.42, deco: [['tulip', 0.04, 0.34, 0.1], ['sunflower', 0.12, 0.24, 0.16], ['tulip', 0.96, 0.34, 0.1], ['butterfly', 0.5, 0.1, 0.07]] },
  { id: 'park', kind: 'out', sky: ['#D5EAF5', '#EDF6F9'], ground: '#A6D18C', horizon: 0.42, extra: 'clouds', deco: [['deciduous-tree', 0.05, 0.14, 0.26], ['kite', 0.62, 0.06, 0.1]] },
  { id: 'desert', kind: 'out', climate: 'sand', sky: ['#F6E3C2', '#FAF0DC'], ground: '#EBCB8E', far: '#E2B978', horizon: 0.42, extra: 'dunes', deco: [['cactus', 0.05, 0.22, 0.18], ['sun', 0.5, 0.04, 0.1], ['cactus', 0.96, 0.26, 0.14]] },
  { id: 'jungle', kind: 'out', climate: 'warm', sky: ['#D3EBD6', '#EAF5EA'], ground: '#6FAE62', horizon: 0.42, deco: [['palm-tree', 0.04, 0.1, 0.32], ['parrot', 0.55, 0.08, 0.08], ['palm-tree', 0.97, 0.12, 0.3]] },
  { id: 'autumn', kind: 'out', sky: ['#F3E6CF', '#F8F0E2'], ground: '#D9B377', horizon: 0.42, deco: [['deciduous-tree', 0.05, 0.14, 0.26], ['maple-leaf', 0.4, 0.12, 0.06], ['fallen-leaf', 0.96, 0.4, 0.06]] },
  { id: 'night', kind: 'out', climate: 'night', sky: ['#34446E', '#56679A'], ground: '#5E8A61', horizon: 0.42, extra: 'stars', deco: [['crescent-moon', 0.88, 0.04, 0.13], ['glowing-star', 0.3, 0.08, 0.06]] },
  { id: 'mountain', kind: 'out', sky: ['#E2F0F7', '#F3F8F8'], ground: '#9CCB7F', far: '#B9DCA0', horizon: 0.42, extra: 'hills', deco: [['evergreen-tree', 0.06, 0.16, 0.24], ['bird', 0.6, 0.08, 0.06]] },
  { id: 'lake', kind: 'out', sky: ['#CFE6F0', '#EAF4F7'], ground: '#A6CF8C', far: '#8CC4DE', horizon: 0.4, extra: 'lake', deco: [['swan', 0.36, 0.3, 0.08], ['deciduous-tree', 0.95, 0.14, 0.24]] },
  { id: 'rainbow', kind: 'out', sky: ['#DDEFF7', '#F1F8FA'], ground: '#A9D49A', horizon: 0.42, extra: 'clouds', deco: [['rainbow', 0.14, 0.12, 0.22]] },
  { id: 'playroom', kind: 'in', sky: ['#F7E8D6', '#FBF1E4'], ground: '#D9B892', horizon: 0.46, extra: 'room', deco: [['teddy-bear', 0.06, 0.32, 0.12], ['kite', 0.3, 0.08, 0.1]] },
  { id: 'bedroom', kind: 'in', sky: ['#E3E6F5', '#EEF0FA'], ground: '#C9B49A', horizon: 0.46, extra: 'room', deco: [['potted-plant', 0.05, 0.3, 0.14], ['crescent-moon', 0.3, 0.1, 0.08]] },
]

/** 這個場景放得下的躲藏處 */
export function placesFor(scene: HideScene): HidePlace[] {
  return PLACES.filter((p) => p.kinds.includes(scene.kind) && (!p.only || (scene.climate != null && p.only.includes(scene.climate))) && !(p.not && scene.climate && p.not.includes(scene.climate)))
}

/** 要產生的 Fluent Emoji（scripts/build-race-hide-emoji.ts） */
export const HIDE_EMOJI = [...new Set([...ANIMALS, ...PLACES.filter((p) => !p.drawn).map((p) => p.art), ...SCENES.flatMap((s) => s.deco.map((d) => d[0]))])]
