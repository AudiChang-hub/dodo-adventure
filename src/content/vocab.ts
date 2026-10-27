export type VocabTheme = 'animal' | 'vehicle' | 'dino' | 'food'

export interface VocabEntry {
  id: string
  en: string
  zh: string
  icon: string
  theme: VocabTheme
  /** 英文的叫聲或引擎聲，用在「聽聲音猜猜看」 */
  sound?: string
  tags: Tag[]
}

/** 「聽指令找圖」的分類題 */
export type Tag = 'fly' | 'water' | 'wheels' | 'legs4' | 'eat'

export const VOCAB: VocabEntry[] = [
  { id: 'dog', en: 'dog', zh: '小狗', icon: 'dog-face', theme: 'animal', sound: 'Woof woof!', tags: ['legs4'] },
  { id: 'cat', en: 'cat', zh: '小貓', icon: 'cat-face', theme: 'animal', sound: 'Meow, meow!', tags: ['legs4'] },
  { id: 'cow', en: 'cow', zh: '牛', icon: 'cow-face', theme: 'animal', sound: 'Moo!', tags: ['legs4'] },
  { id: 'sheep', en: 'sheep', zh: '小羊', icon: 'ewe', theme: 'animal', sound: 'Baa, baa!', tags: ['legs4'] },
  { id: 'pig', en: 'pig', zh: '小豬', icon: 'pig-face', theme: 'animal', sound: 'Oink oink!', tags: ['legs4'] },
  { id: 'chicken', en: 'rooster', zh: '公雞', icon: 'chicken', theme: 'animal', sound: 'Cock-a-doodle-doo!', tags: [] },
  { id: 'duck', en: 'duck', zh: '鴨子', icon: 'duck', theme: 'animal', sound: 'Quack quack!', tags: ['water'] },
  { id: 'frog', en: 'frog', zh: '青蛙', icon: 'frog', theme: 'animal', sound: 'Ribbit, ribbit!', tags: ['water'] },
  { id: 'bird', en: 'bird', zh: '小鳥', icon: 'bird', theme: 'animal', sound: 'Tweet tweet!', tags: ['fly'] },
  { id: 'fish', en: 'fish', zh: '小魚', icon: 'fish', theme: 'animal', tags: ['water'] },
  { id: 'rabbit', en: 'rabbit', zh: '兔子', icon: 'rabbit-face', theme: 'animal', tags: ['legs4'] },
  { id: 'elephant', en: 'elephant', zh: '大象', icon: 'elephant', theme: 'animal', tags: ['legs4'] },
  { id: 'lion', en: 'lion', zh: '獅子', icon: 'lion', theme: 'animal', sound: 'Roar!', tags: ['legs4'] },
  { id: 'giraffe', en: 'giraffe', zh: '長頸鹿', icon: 'giraffe', theme: 'animal', tags: ['legs4'] },
  { id: 'monkey', en: 'monkey', zh: '猴子', icon: 'monkey-face', theme: 'animal', sound: 'Ooh ooh, ah ah!', tags: [] },
  { id: 'tiger', en: 'tiger', zh: '老虎', icon: 'tiger-face', theme: 'animal', tags: ['legs4'] },
  { id: 'panda', en: 'panda', zh: '熊貓', icon: 'panda', theme: 'animal', tags: ['legs4'] },
  { id: 'turtle', en: 'turtle', zh: '烏龜', icon: 'turtle', theme: 'animal', tags: ['water', 'legs4'] },
  { id: 'whale', en: 'whale', zh: '鯨魚', icon: 'spouting-whale', theme: 'animal', tags: ['water'] },
  { id: 'butterfly', en: 'butterfly', zh: '蝴蝶', icon: 'butterfly', theme: 'animal', tags: ['fly'] },
  { id: 'owl', en: 'owl', zh: '貓頭鷹', icon: 'owl', theme: 'animal', sound: 'Hoot, hoot!', tags: ['fly'] },
  { id: 'mouse', en: 'mouse', zh: '老鼠', icon: 'mouse-face', theme: 'animal', sound: 'Squeak, squeak!', tags: ['legs4'] },

  { id: 'car', en: 'car', zh: '汽車', icon: 'automobile', theme: 'vehicle', sound: 'Beep beep!', tags: ['wheels'] },
  { id: 'bus', en: 'bus', zh: '公車', icon: 'bus', theme: 'vehicle', tags: ['wheels'] },
  { id: 'train', en: 'train', zh: '火車', icon: 'locomotive', theme: 'vehicle', sound: 'Choo choo!', tags: ['wheels'] },
  { id: 'plane', en: 'airplane', zh: '飛機', icon: 'airplane', theme: 'vehicle', sound: 'Zoom!', tags: ['fly'] },
  { id: 'boat', en: 'boat', zh: '帆船', icon: 'sailboat', theme: 'vehicle', tags: ['water'] },
  { id: 'bike', en: 'bike', zh: '腳踏車', icon: 'bicycle', theme: 'vehicle', sound: 'Ring, ring!', tags: ['wheels'] },
  { id: 'firetruck', en: 'fire truck', zh: '消防車', icon: 'fire-engine', theme: 'vehicle', sound: 'Wee-oo, wee-oo!', tags: ['wheels'] },
  { id: 'ambulance', en: 'ambulance', zh: '救護車', icon: 'ambulance', theme: 'vehicle', tags: ['wheels'] },
  { id: 'police', en: 'police car', zh: '警車', icon: 'police-car', theme: 'vehicle', tags: ['wheels'] },
  { id: 'taxi', en: 'taxi', zh: '計程車', icon: 'taxi', theme: 'vehicle', tags: ['wheels'] },
  { id: 'truck', en: 'truck', zh: '卡車', icon: 'delivery-truck', theme: 'vehicle', tags: ['wheels'] },
  { id: 'helicopter', en: 'helicopter', zh: '直升機', icon: 'helicopter', theme: 'vehicle', sound: 'Chop, chop, chop!', tags: ['fly'] },
  { id: 'tractor', en: 'tractor', zh: '拖拉機', icon: 'tractor', theme: 'vehicle', tags: ['wheels'] },
  { id: 'rocket', en: 'rocket', zh: '火箭', icon: 'rocket', theme: 'vehicle', tags: ['fly'] },
  { id: 'scooter', en: 'scooter', zh: '機車', icon: 'motor-scooter', theme: 'vehicle', tags: ['wheels'] },

  { id: 'trex', en: 'T-rex', zh: '暴龍', icon: 't-rex', theme: 'dino', sound: 'Stomp, stomp, rawr!', tags: [] },
  { id: 'sauropod', en: 'long-neck dinosaur', zh: '長頸龍', icon: 'sauropod', theme: 'dino', tags: ['legs4'] },
  { id: 'dragon', en: 'dragon', zh: '恐龍', icon: 'dragon', theme: 'dino', tags: ['legs4'] },

  { id: 'apple', en: 'apple', zh: '蘋果', icon: 'red-apple', theme: 'food', tags: ['eat'] },
  { id: 'banana', en: 'banana', zh: '香蕉', icon: 'banana', theme: 'food', tags: ['eat'] },
  { id: 'grapes', en: 'grapes', zh: '葡萄', icon: 'grapes', theme: 'food', tags: ['eat'] },
  { id: 'strawberry', en: 'strawberry', zh: '草莓', icon: 'strawberry', theme: 'food', tags: ['eat'] },
  { id: 'watermelon', en: 'watermelon', zh: '西瓜', icon: 'watermelon', theme: 'food', tags: ['eat'] },
  { id: 'carrot', en: 'carrot', zh: '紅蘿蔔', icon: 'carrot', theme: 'food', tags: ['eat'] },
]

export const TAG_QUESTION: Record<Tag, string> = {
  fly: 'Which one can | fly?',
  water: 'Which one goes in the | water?',
  wheels: 'Which one has | wheels?',
  legs4: 'Which one has | four legs?',
  eat: 'Which one can we | eat?',
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
