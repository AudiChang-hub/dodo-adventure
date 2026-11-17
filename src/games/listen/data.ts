// 聽兩步驟指令（T-164，英文 EN-1：聽懂兩個步驟的指令，工作記憶）的詞彙。只有資料，沒有畫面（scripts/test-order-listen.ts 直接測）。
// 只用 3～4 歲常見的字：
//   - 有顏色的東西（自己畫的，./art.tsx）：6 種顏色 × 11 樣東西 = 66 個（the red ball、the blue car…）
//   - 不分顏色的東西（Fluent Emoji，MIT）：動物、水果、每天看得到的東西 28 個（the dog、the apple…）
// 顏色挑一眼分得出來的六種（紅、藍、黃、綠、紫、橘），不用粉紅（跟紅、紫太近）。

export type ColorId = 'red' | 'blue' | 'yellow' | 'green' | 'purple' | 'orange'
export const COLORS: { id: ColorId; zh: string; fill: string; dark: string }[] = [
  { id: 'red', zh: '紅', fill: '#E0473A', dark: '#A8302A' },
  { id: 'blue', zh: '藍', fill: '#3F7FD9', dark: '#2A5AA0' },
  { id: 'yellow', zh: '黃', fill: '#F6CB2F', dark: '#C29A12' },
  { id: 'green', zh: '綠', fill: '#47A85C', dark: '#2F7A40' },
  { id: 'purple', zh: '紫', fill: '#8E5CC9', dark: '#643C96' },
  { id: 'orange', zh: '橘', fill: '#F28A2E', dark: '#B8611A' },
]
export const COLOR_IDS = COLORS.map((c) => c.id)
export const colorOf = (id: ColorId) => COLORS.find((c) => c.id === id)!

/** 有顏色的東西（./art.tsx 畫，顏色是參數） */
export type ShapeId = 'ball' | 'balloon' | 'car' | 'hat' | 'cup' | 'sock' | 'boat' | 'flower' | 'star' | 'heart' | 'triangle'
export const SHAPES: { id: ShapeId; en: string; zh: string }[] = [
  { id: 'ball', en: 'ball', zh: '球' },
  { id: 'balloon', en: 'balloon', zh: '氣球' },
  { id: 'car', en: 'car', zh: '車子' },
  { id: 'hat', en: 'hat', zh: '帽子' },
  { id: 'cup', en: 'cup', zh: '杯子' },
  { id: 'sock', en: 'sock', zh: '襪子' },
  { id: 'boat', en: 'boat', zh: '小船' },
  { id: 'flower', en: 'flower', zh: '花' },
  { id: 'star', en: 'star', zh: '星星' },
  { id: 'heart', en: 'heart', zh: '愛心' },
  { id: 'triangle', en: 'triangle', zh: '三角形' },
]
export const SHAPE_IDS = SHAPES.map((s) => s.id)

/** 不分顏色的東西：en 是念的名字，emoji 是 Fluent Emoji 的名字 */
export const PLAIN: { id: string; en: string; zh: string; emoji: string }[] = [
  { id: 'cat', en: 'cat', zh: '貓', emoji: 'cat' },
  { id: 'dog', en: 'dog', zh: '狗', emoji: 'dog' },
  { id: 'duck', en: 'duck', zh: '鴨子', emoji: 'duck' },
  { id: 'frog', en: 'frog', zh: '青蛙', emoji: 'frog' },
  { id: 'pig', en: 'pig', zh: '豬', emoji: 'pig' },
  { id: 'cow', en: 'cow', zh: '牛', emoji: 'cow' },
  { id: 'bird', en: 'bird', zh: '小鳥', emoji: 'bird' },
  { id: 'bunny', en: 'bunny', zh: '兔子', emoji: 'rabbit' },
  { id: 'bear', en: 'bear', zh: '熊', emoji: 'bear' },
  { id: 'lion', en: 'lion', zh: '獅子', emoji: 'lion' },
  { id: 'monkey', en: 'monkey', zh: '猴子', emoji: 'monkey' },
  { id: 'turtle', en: 'turtle', zh: '烏龜', emoji: 'turtle' },
  { id: 'fish', en: 'fish', zh: '魚', emoji: 'tropical-fish' },
  { id: 'elephant', en: 'elephant', zh: '大象', emoji: 'elephant' },
  { id: 'apple', en: 'apple', zh: '蘋果', emoji: 'red-apple' },
  { id: 'banana', en: 'banana', zh: '香蕉', emoji: 'banana' },
  { id: 'carrot', en: 'carrot', zh: '紅蘿蔔', emoji: 'carrot' },
  { id: 'book', en: 'book', zh: '書', emoji: 'closed-book' },
  { id: 'shoe', en: 'shoe', zh: '鞋子', emoji: 'running-shoe' },
  { id: 'spoon', en: 'spoon', zh: '湯匙', emoji: 'spoon' },
  { id: 'umbrella', en: 'umbrella', zh: '雨傘', emoji: 'umbrella' },
  { id: 'clock', en: 'clock', zh: '時鐘', emoji: 'alarm-clock' },
  { id: 'tree', en: 'tree', zh: '樹', emoji: 'deciduous-tree' },
  { id: 'sun', en: 'sun', zh: '太陽', emoji: 'sun' },
  { id: 'moon', en: 'moon', zh: '月亮', emoji: 'crescent-moon' },
  { id: 'train', en: 'train', zh: '火車', emoji: 'locomotive' },
  { id: 'house', en: 'house', zh: '房子', emoji: 'house' },
  { id: 'teddy', en: 'teddy bear', zh: '泰迪熊', emoji: 'teddy-bear' },
]

/** 畫面上的一樣東西：有顏色的（color + shape）或不分顏色的（plain） */
export type Thing = { kind: 'color'; color: ColorId; shape: ShapeId } | { kind: 'plain'; plain: string }

export const thingId = (t: Thing) => (t.kind === 'color' ? `${t.color}-${t.shape}` : t.plain)
export function thingEn(t: Thing): string {
  if (t.kind === 'color') return `${t.color} ${SHAPES.find((s) => s.id === t.shape)!.en}`
  return PLAIN.find((p) => p.id === t.plain)!.en
}
export function thingZh(t: Thing): string {
  if (t.kind === 'color') return `${colorOf(t.color).zh}色的${SHAPES.find((s) => s.id === t.shape)!.zh}`
  return PLAIN.find((p) => p.id === t.plain)!.zh
}

/** 所有東西（念的台詞每個都有：Touch the …、Then the …、That's the …） */
export const ALL_THINGS: Thing[] = [...COLOR_IDS.flatMap((color) => SHAPE_IDS.map((shape): Thing => ({ kind: 'color', color, shape }))), ...PLAIN.map((p): Thing => ({ kind: 'plain', plain: p.id }))]

export const LISTEN_EMOJI = [...PLAIN.map((p) => p.emoji), 'ear']
