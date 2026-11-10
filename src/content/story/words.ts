// 故事的單字三明治（T-127 B 案②）：每一句的主角名詞第一次出現時念「Rabbit → 兔子 → Rabbit」，不念整句中文（AGENTS.md、LANG-4）。
// 角色庫 id（art/storybook/meta.ts）→ 念的英文、中文。中文音檔走現有的 zh.* 流程（content/zh-words.ts 的 ZH_WORDS → npm run phrases →
// scripts/gen_zh_words.py），跟課程同一個中文的共用同一個音檔；還沒產生音檔的字照舊只念英文。
// 不在這裡的（三隻恐龍的名字、拱門、獎盃、蓋到一半的房子這種說不清楚的東西）不念三明治。
// 中文至少兩個字（BreezyVoice 單一個字唸得不穩，scripts/extract-phrases.ts 會擋）：門寫大門、樹寫大樹。

export interface StoryNoun {
  /** 念的英文（Rabbit.） */
  en: string
  /** 念的中文 */
  zh: string
}

export const STORY_NOUNS: Record<string, StoryNoun> = {
  egg: { en: 'egg', zh: '彩虹蛋' },
  rabbit: { en: 'rabbit', zh: '兔子' },
  turtle: { en: 'turtle', zh: '烏龜' },
  elephant: { en: 'elephant', zh: '大象' },
  giraffe: { en: 'giraffe', zh: '長頸鹿' },
  zebra: { en: 'zebra', zh: '斑馬' },
  lion: { en: 'lion', zh: '獅子' },
  monkey: { en: 'monkey', zh: '猴子' },
  cow: { en: 'cow', zh: '乳牛' },
  sheep: { en: 'sheep', zh: '綿羊' },
  pig: { en: 'pig', zh: '小豬' },
  chicken: { en: 'chicken', zh: '母雞' },
  cat: { en: 'cat', zh: '小貓' },
  frog: { en: 'frog', zh: '青蛙' },
  snail: { en: 'snail', zh: '蝸牛' },
  fish: { en: 'fish', zh: '小魚' },
  octopus: { en: 'octopus', zh: '章魚' },
  whale: { en: 'whale', zh: '鯨魚' },
  butterfly: { en: 'butterfly', zh: '蝴蝶' },
  bird: { en: 'bird', zh: '小鳥' },
  dove: { en: 'dove', zh: '鴿子' },
  sauropod: { en: 'dinosaur', zh: '恐龍' },
  trex: { en: 'T-rex', zh: '暴龍' },
  teddy: { en: 'teddy bear', zh: '泰迪熊' },
  tree: { en: 'tree', zh: '大樹' },
  ark: { en: 'ark', zh: '方舟' },
  hammer: { en: 'hammer', zh: '槌子' },
  planks: { en: 'wood', zh: '木頭' },
  apples: { en: 'apple', zh: '蘋果' },
  'book-open': { en: 'book', zh: '書本' },
  'book-closed': { en: 'book', zh: '書本' },
  door: { en: 'door', zh: '大門' },
  house: { en: 'house', zh: '房子' },
  'new-house': { en: 'house', zh: '房子' },
  bed: { en: 'bed', zh: '床鋪' },
  yarn: { en: 'wool', zh: '毛線' },
  blanket: { en: 'blanket', zh: '毯子' },
  basket: { en: 'basket', zh: '籃子' },
  nest: { en: 'nest', zh: '鳥巢' },
  'dino-nest': { en: 'egg', zh: '恐龍蛋' },
  bus: { en: 'bus', zh: '公車' },
  'bus-stop': { en: 'bus stop', zh: '公車站' },
  'traffic-light': { en: 'traffic light', zh: '紅綠燈' },
  bridge: { en: 'bridge', zh: '大橋' },
  volcano: { en: 'volcano', zh: '火山' },
  tractor: { en: 'tractor', zh: '拖拉機' },
  'fire-truck': { en: 'fire truck', zh: '消防車' },
  'police-car': { en: 'police car', zh: '警車' },
  ladder: { en: 'ladder', zh: '梯子' },
  sailboat: { en: 'boat', zh: '小船' },
  'beach-umbrella': { en: 'beach', zh: '海灘' },
  umbrella: { en: 'umbrella', zh: '雨傘' },
  banana: { en: 'banana', zh: '香蕉' },
  grapes: { en: 'grapes', zh: '葡萄' },
  watermelon: { en: 'watermelon', zh: '西瓜' },
  blocks: { en: 'blocks', zh: '積木' },
  truck: { en: 'truck', zh: '卡車' },
  bathtub: { en: 'bathtub', zh: '浴缸' },
  toothbrush: { en: 'toothbrush', zh: '牙刷' },
  gift: { en: 'present', zh: '禮物' },
  balloons: { en: 'balloon', zh: '氣球' },
  cake: { en: 'cake', zh: '蛋糕' },
  kite: { en: 'kite', zh: '風箏' },
  sandwich: { en: 'sandwich', zh: '三明治' },
  'picnic-blanket': { en: 'picnic', zh: '野餐' },
  sun: { en: 'sun', zh: '太陽' },
  moon: { en: 'moon', zh: '月亮' },
  rainbow: { en: 'rainbow', zh: '彩虹' },
  raincloud: { en: 'cloud', zh: '雲朵' },
}

/** 三明治在 zh-words 裡的 key（story.rabbit）；三明治台詞的 key 是 zh.<說話者>.story.rabbit（bridgeKey） */
export const storyNounKey = (id: string) => `story.${id}`

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
/** 三明治前後念的英文（Rabbit.） */
export const storyNounEn = (id: string) => `${cap(STORY_NOUNS[id]?.en ?? id)}.`
