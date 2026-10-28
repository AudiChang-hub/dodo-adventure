export type VocabTheme = 'animal' | 'vehicle' | 'dino' | 'food' | 'home'

/** 功能分類（學習單題型）：下雨天、洗澡、睡覺、吃的、穿的 */
export type UseTag = 'rain' | 'bath' | 'bed' | 'eat' | 'wear'

export interface VocabEntry {
  id: string
  en: string
  zh: string
  icon: string
  theme: VocabTheme
  /** 英文的叫聲或引擎聲，用在「聽聲音猜猜看」 */
  sound?: string
  tags: Tag[]
  /** 功能分類；食物不用另外標，會沿用 tags 的 eat */
  uses?: UseTag[]
}

/** 「聽指令找圖」的分類題 */
export type Tag = 'fly' | 'water' | 'wheels' | 'legs4' | 'eat'

export const VOCAB: VocabEntry[] = [
  { id: 'dog', en: 'dog', zh: '小狗', icon: 'dog-face', theme: 'animal', sound: 'Woof woof!', tags: ['legs4'] },
  { id: 'cat', en: 'cat', zh: '小貓', icon: 'cat-face', theme: 'animal', sound: 'Meow, meow!', tags: ['legs4'] },
  { id: 'cow', en: 'cow', zh: '牛', icon: 'cow-face', theme: 'animal', sound: 'Moo!', tags: ['legs4'] },
  { id: 'sheep', en: 'sheep', zh: '小羊', icon: 'ewe', theme: 'animal', sound: 'Baa, baa!', tags: ['legs4'] },
  { id: 'pig', en: 'pig', zh: '小豬', icon: 'pig-face', theme: 'animal', sound: 'Oink oink!', tags: ['legs4'] },
  { id: 'chicken', en: 'chicken', zh: '雞', icon: 'chicken', theme: 'animal', sound: 'Cock-a-doodle-doo!', tags: [] },
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
  // 主題式冒險（content/themes.ts）補的動物：農場、海洋、動物園
  { id: 'horse', en: 'horse', zh: '馬', icon: 'horse', theme: 'animal', sound: 'Neigh!', tags: ['legs4'] },
  { id: 'octopus', en: 'octopus', zh: '章魚', icon: 'octopus', theme: 'animal', tags: ['water'] },
  { id: 'crab', en: 'crab', zh: '螃蟹', icon: 'crab', theme: 'animal', tags: ['water'] },
  { id: 'zebra', en: 'zebra', zh: '斑馬', icon: 'zebra', theme: 'animal', tags: ['legs4'] },
  { id: 'penguin', en: 'penguin', zh: '企鵝', icon: 'penguin', theme: 'animal', tags: [] },

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
  { id: 'sauropod', en: 'dinosaur', zh: '恐龍', icon: 'sauropod', theme: 'dino', tags: ['legs4'] },
  // 恐龍谷的火山：不是恐龍，但只會和恐龍一起出現（同一類的干擾）
  { id: 'volcano', en: 'volcano', zh: '火山', icon: 'volcano', theme: 'dino', tags: [] },

  { id: 'apple', en: 'apple', zh: '蘋果', icon: 'red-apple', theme: 'food', tags: ['eat'] },
  { id: 'banana', en: 'banana', zh: '香蕉', icon: 'banana', theme: 'food', tags: ['eat'] },
  { id: 'grapes', en: 'grapes', zh: '葡萄', icon: 'grapes', theme: 'food', tags: ['eat'] },
  { id: 'strawberry', en: 'strawberry', zh: '草莓', icon: 'strawberry', theme: 'food', tags: ['eat'] },
  { id: 'watermelon', en: 'watermelon', zh: '西瓜', icon: 'watermelon', theme: 'food', tags: ['eat'] },
  { id: 'carrot', en: 'carrot', zh: '紅蘿蔔', icon: 'carrot', theme: 'food', tags: ['eat'] },
  { id: 'cookie', en: 'cookie', zh: '餅乾', icon: 'cookie', theme: 'food', tags: ['eat'] },
  { id: 'cake', en: 'cake', zh: '蛋糕', icon: 'birthday-cake', theme: 'food', tags: ['eat'] },

  // ── 生活用品（功能分類用；en 一律用單數，教學句會念「This is a …」）──
  { id: 'umbrella', en: 'umbrella', zh: '雨傘', icon: 'umbrella', theme: 'home', tags: [], uses: ['rain'] },
  // 雨靴的圖其實是登山靴：只當「穿的」，不當下雨天的答案（有合適的雨鞋圖再加回）
  { id: 'boot', en: 'boot', zh: '靴子', icon: 'hiking-boot', theme: 'home', tags: [], uses: ['wear'] },
  { id: 'bathtub', en: 'bathtub', zh: '浴缸', icon: 'bathtub', theme: 'home', tags: [], uses: ['bath'] },
  // 洗澡的第二個例子：海綿的圖像起司、蓮蓬頭（shower）英文意思對不上，改用肥皂（也是字母森林 s 的複習字）
  { id: 'soap', en: 'soap', zh: '肥皂', icon: 'soap', theme: 'home', tags: [], uses: ['bath'] },
  { id: 'bed', en: 'bed', zh: '床', icon: 'bed', theme: 'home', tags: [], uses: ['bed'] },
  { id: 'teddy', en: 'teddy bear', zh: '泰迪熊', icon: 'teddy-bear', theme: 'home', tags: [], uses: ['bed'] },
  { id: 'toothbrush', en: 'toothbrush', zh: '牙刷', icon: 'toothbrush', theme: 'home', tags: [], uses: ['bed'] },
  { id: 'tshirt', en: 'T-shirt', zh: 'T 恤', icon: 't-shirt', theme: 'home', tags: [], uses: ['wear'] },
  { id: 'cap', en: 'cap', zh: '帽子', icon: 'billed-cap', theme: 'home', tags: [], uses: ['wear'] },
  { id: 'dress', en: 'dress', zh: '洋裝', icon: 'dress', theme: 'home', tags: [], uses: ['wear'] },
  { id: 'scarf', en: 'scarf', zh: '圍巾', icon: 'scarf', theme: 'home', tags: [], uses: ['wear'] },
  { id: 'shoe', en: 'shoe', zh: '鞋子', icon: 'running-shoe', theme: 'home', tags: [], uses: ['wear'] },
  { id: 'gift', en: 'gift', zh: '禮物', icon: 'wrapped-gift', theme: 'home', tags: [] },
]

/**
 * 延後的詞（2026-10-28 單字盤點）：圖不好認、和別的東西太像，或名字對不上圖，先不出題。
 * 資料留著，舊紀錄（vocab:goat…）、貼紙本、家長區還對得到；動物村、學習單都不會用到。
 * - goat：圖和 sheep 很像，中文都叫「羊」；動物村先只留 sheep。
 * - dragon：圖是中國龍，不是恐龍；中文改成「龍」。
 * - raincoat：圖是一般的大衣，看不出是雨衣。
 * - sponge：黃色方塊像起司；shower：英文是「淋浴」，和圖（蓮蓬頭）對不上。
 */
export const DEFERRED_VOCAB: VocabEntry[] = [
  { id: 'goat', en: 'goat', zh: '山羊', icon: 'goat', theme: 'animal', tags: ['legs4'] },
  { id: 'dragon', en: 'dragon', zh: '龍', icon: 'dragon', theme: 'animal', tags: ['legs4'] },
  { id: 'raincoat', en: 'raincoat', zh: '雨衣', icon: 'coat', theme: 'home', tags: [], uses: ['rain', 'wear'] },
  { id: 'sponge', en: 'sponge', zh: '海綿', icon: 'sponge', theme: 'home', tags: [], uses: ['bath'] },
  { id: 'shower', en: 'shower', zh: '蓮蓬頭', icon: 'shower', theme: 'home', tags: [], uses: ['bath'] },
]

/** 教的、延後的詞都找得到（家長區、貼紙本讀舊紀錄用）；出題只用 VOCAB */
export const ALL_VOCAB: VocabEntry[] = [...VOCAB, ...DEFERRED_VOCAB]

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
  home: '生活用品',
}

/** 找詞（延後的詞也找得到，舊紀錄才不會當掉） */
export const vocab = (id: string) => ALL_VOCAB.find((v) => v.id === id)!

/** 分類題中容易讓孩子混淆的項目：不出成答案，也不出成干擾選項 */
export const AMBIGUOUS: Record<Tag, string[]> = {
  fly: ['duck', 'chicken', 'penguin'],
  // 浴缸、肥皂、雨具都和水有關，「哪個在水裡」不能拿它們當干擾
  water: ['duck', 'frog', 'turtle', 'elephant', 'bathtub', 'soap', 'umbrella', 'boot', 'penguin'],
  wheels: ['plane'],
  // 床和泰迪熊也有四隻腳
  legs4: ['frog', 'turtle', 'mouse', 'sauropod', 'bed', 'teddy', 'crab', 'octopus'],
  eat: [],
}

// ── 功能分類（學習單題型「找出全部」）────────────────────────
export const usesOf = (v: VocabEntry): UseTag[] => [...(v.uses ?? []), ...(v.tags.includes('eat') && !v.uses?.includes('eat') ? (['eat'] as UseTag[]) : [])]

export const USE_TAGS: UseTag[] = ['rain', 'eat', 'wear', 'bath', 'bed']

/** 不出成干擾的項目：下雨天也會穿 T 恤、鞋子、靴子；洗澡前後也會刷牙；魚和雞也能吃 */
export const USE_AMBIGUOUS: Record<UseTag, string[]> = {
  rain: ['tshirt', 'cap', 'dress', 'scarf', 'shoe', 'boot', 'duck', 'frog', 'fish', 'boat', 'whale', 'turtle', 'octopus', 'crab', 'penguin'],
  bath: ['toothbrush', 'duck', 'fish', 'frog', 'boat', 'whale', 'turtle', 'octopus', 'crab', 'penguin'],
  bed: ['owl', 'panda', 'cat', 'dog'],
  eat: ['fish', 'chicken', 'duck', 'cow', 'pig', 'sheep', 'crab', 'octopus'],
  wear: ['umbrella'],
}

/**
 * 功能分類的教學卡：先看兩個例子。前兩個是預設，家長勾了「他不認得」的字不當例子，往後面找替代
 * （每個候選字的教學句在 lines-worksheet.ts 都有）。下雨天只剩 umbrella 一個好例子：第二張圖用另一張雨傘的圖。
 */
export const USE_EXAMPLES: Record<UseTag, string[]> = {
  rain: ['umbrella'],
  bath: ['bathtub', 'soap'],
  bed: ['bed', 'teddy', 'toothbrush'],
  eat: ['apple', 'cookie', 'banana', 'strawberry'],
  wear: ['tshirt', 'cap', 'shoe', 'dress'],
}
/** 只有一個例子時，第二張圖換一個樣子（同一個字、同一個名字） */
export const EXAMPLE_ALT_ICON: Record<string, string> = { umbrella: 'umbrella-with-rain-drops' }

/** 分類題的教學卡：先看兩個例子（Birds can fly. Airplanes can fly, too!）；後面是家長勾掉預設例子時的替代 */
export const CAT_EXAMPLES: Record<Tag, string[]> = {
  fly: ['bird', 'plane', 'butterfly', 'helicopter'],
  water: ['fish', 'boat', 'whale', 'octopus'],
  wheels: ['car', 'bus', 'truck', 'taxi'],
  legs4: ['dog', 'cow', 'cat', 'horse'],
  eat: ['apple', 'banana', 'cookie', 'strawberry'],
}

/**
 * 例子的教學句 key：預設的字在預設的位置用原本的句子（teach.cat.fly.0「Birds can fly.」），
 * 替代的字用 <前綴>.<位置>.<id>（台詞在 lines.ts、lines-worksheet.ts 依候選字產生）。
 * 只有一個候選字（下雨天的 umbrella）時，兩個位置都是它。
 */
export function exampleLine(prefix: string, cands: readonly string[], id: string, pos: number): string {
  const dflt = cands[pos] ?? (cands.length === 1 ? cands[0] : undefined)
  return dflt === id ? `${prefix}.${pos}` : `${prefix}.${pos}.${id}`
}
export const catLine = (tag: Tag, id: string, pos: number) => exampleLine(`teach.cat.${tag}`, CAT_EXAMPLES[tag], id, pos)
export const useLine = (u: UseTag, id: string, pos: number) => exampleLine(`teach.ws.${u}`, USE_EXAMPLES[u], id, pos)
