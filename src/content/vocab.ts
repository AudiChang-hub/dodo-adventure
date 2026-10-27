export type VocabTheme = 'animal' | 'vehicle' | 'dino' | 'food'

export interface VocabEntry {
  id: string
  zh: string
  icon: string
  theme: VocabTheme
  /** 叫聲或引擎聲，用在「聽聲音猜猜看」 */
  sound?: string
  tags: Tag[]
}

/** 「聽指令找圖」的分類題 */
export type Tag = 'fly' | 'water' | 'wheels' | 'legs4' | 'eat'

export const VOCAB: VocabEntry[] = [
  { id: 'dog', zh: '小狗', icon: 'dog-face', theme: 'animal', sound: '汪汪汪', tags: ['legs4'] },
  { id: 'cat', zh: '小貓', icon: 'cat-face', theme: 'animal', sound: '喵～喵～', tags: ['legs4'] },
  { id: 'cow', zh: '牛', icon: 'cow-face', theme: 'animal', sound: '哞～', tags: ['legs4'] },
  { id: 'sheep', zh: '小羊', icon: 'ewe', theme: 'animal', sound: '咩～咩～', tags: ['legs4'] },
  { id: 'pig', zh: '小豬', icon: 'pig-face', theme: 'animal', sound: '齁齁齁', tags: ['legs4'] },
  { id: 'chicken', zh: '公雞', icon: 'chicken', theme: 'animal', sound: '喔喔喔～', tags: [] },
  { id: 'duck', zh: '鴨子', icon: 'duck', theme: 'animal', sound: '呱呱呱', tags: ['water'] },
  { id: 'frog', zh: '青蛙', icon: 'frog', theme: 'animal', sound: '嘓嘓嘓', tags: ['water'] },
  { id: 'bird', zh: '小鳥', icon: 'bird', theme: 'animal', sound: '啾啾啾', tags: ['fly'] },
  { id: 'fish', zh: '小魚', icon: 'fish', theme: 'animal', tags: ['water'] },
  { id: 'rabbit', zh: '兔子', icon: 'rabbit-face', theme: 'animal', tags: ['legs4'] },
  { id: 'elephant', zh: '大象', icon: 'elephant', theme: 'animal', sound: '噗噗～', tags: ['legs4'] },
  { id: 'lion', zh: '獅子', icon: 'lion', theme: 'animal', sound: '吼～', tags: ['legs4'] },
  { id: 'giraffe', zh: '長頸鹿', icon: 'giraffe', theme: 'animal', tags: ['legs4'] },
  { id: 'monkey', zh: '猴子', icon: 'monkey-face', theme: 'animal', sound: '嗚嗚啊啊', tags: [] },
  { id: 'tiger', zh: '老虎', icon: 'tiger-face', theme: 'animal', tags: ['legs4'] },
  { id: 'panda', zh: '熊貓', icon: 'panda', theme: 'animal', tags: ['legs4'] },
  { id: 'turtle', zh: '烏龜', icon: 'turtle', theme: 'animal', tags: ['water', 'legs4'] },
  { id: 'whale', zh: '鯨魚', icon: 'spouting-whale', theme: 'animal', tags: ['water'] },
  { id: 'butterfly', zh: '蝴蝶', icon: 'butterfly', theme: 'animal', tags: ['fly'] },
  { id: 'owl', zh: '貓頭鷹', icon: 'owl', theme: 'animal', sound: '咕咕～咕咕～', tags: ['fly'] },
  { id: 'mouse', zh: '老鼠', icon: 'mouse-face', theme: 'animal', sound: '吱吱吱', tags: ['legs4'] },

  { id: 'car', zh: '汽車', icon: 'automobile', theme: 'vehicle', sound: '叭叭！', tags: ['wheels'] },
  { id: 'bus', zh: '公車', icon: 'bus', theme: 'vehicle', tags: ['wheels'] },
  { id: 'train', zh: '火車', icon: 'locomotive', theme: 'vehicle', sound: '嘟嘟～ 喀隆喀隆', tags: ['wheels'] },
  { id: 'plane', zh: '飛機', icon: 'airplane', theme: 'vehicle', sound: '咻～', tags: ['fly'] },
  { id: 'boat', zh: '帆船', icon: 'sailboat', theme: 'vehicle', tags: ['water'] },
  { id: 'bike', zh: '腳踏車', icon: 'bicycle', theme: 'vehicle', sound: '叮鈴叮鈴', tags: ['wheels'] },
  { id: 'firetruck', zh: '消防車', icon: 'fire-engine', theme: 'vehicle', sound: '喔咿～喔咿～', tags: ['wheels'] },
  { id: 'ambulance', zh: '救護車', icon: 'ambulance', theme: 'vehicle', tags: ['wheels'] },
  { id: 'police', zh: '警車', icon: 'police-car', theme: 'vehicle', tags: ['wheels'] },
  { id: 'taxi', zh: '計程車', icon: 'taxi', theme: 'vehicle', tags: ['wheels'] },
  { id: 'truck', zh: '卡車', icon: 'delivery-truck', theme: 'vehicle', tags: ['wheels'] },
  { id: 'helicopter', zh: '直升機', icon: 'helicopter', theme: 'vehicle', sound: '噠噠噠噠', tags: ['fly'] },
  { id: 'tractor', zh: '拖拉機', icon: 'tractor', theme: 'vehicle', tags: ['wheels'] },
  { id: 'rocket', zh: '火箭', icon: 'rocket', theme: 'vehicle', tags: ['fly'] },
  { id: 'scooter', zh: '機車', icon: 'motor-scooter', theme: 'vehicle', tags: ['wheels'] },

  { id: 'trex', zh: '暴龍', icon: 't-rex', theme: 'dino', sound: '嗷嗚～', tags: [] },
  { id: 'sauropod', zh: '長頸龍', icon: 'sauropod', theme: 'dino', tags: ['legs4'] },
  { id: 'dragon', zh: '恐龍', icon: 'dragon', theme: 'dino', tags: ['legs4'] },

  { id: 'apple', zh: '蘋果', icon: 'red-apple', theme: 'food', tags: ['eat'] },
  { id: 'banana', zh: '香蕉', icon: 'banana', theme: 'food', tags: ['eat'] },
  { id: 'grapes', zh: '葡萄', icon: 'grapes', theme: 'food', tags: ['eat'] },
  { id: 'strawberry', zh: '草莓', icon: 'strawberry', theme: 'food', tags: ['eat'] },
  { id: 'watermelon', zh: '西瓜', icon: 'watermelon', theme: 'food', tags: ['eat'] },
  { id: 'carrot', zh: '紅蘿蔔', icon: 'carrot', theme: 'food', tags: ['eat'] },
]

export const TAG_QUESTION: Record<Tag, string> = {
  fly: '哪一個會飛呢？',
  water: '哪一個住在水裡，或是在水上呢？',
  wheels: '哪一個有輪子呢？',
  legs4: '哪一個有四隻腳呢？',
  eat: '哪一個可以吃呢？',
}

export const THEME_LABEL: Record<VocabTheme, string> = {
  animal: '動物',
  vehicle: '交通工具',
  dino: '恐龍',
  food: '水果蔬菜',
}

export const vocab = (id: string) => VOCAB.find((v) => v.id === id)!

/** 分類題中容易讓孩子混淆的項目：不出成答案，也不出成干擾選項 */
export const AMBIGUOUS: Record<Tag, string[]> = {
  fly: ['duck', 'chicken', 'dragon'],
  water: ['duck', 'frog', 'turtle', 'elephant'],
  wheels: ['plane'],
  legs4: ['frog', 'turtle', 'mouse', 'dragon', 'sauropod'],
  eat: [],
}
