// 程式車庫（PRD §10）的資料：方向、規律的圖、排順序的故事。
// 程式車庫的遊戲 2026-10-31 起孩子點不到了（T-75 拿掉畫面，T-76 第 3 層拿掉題目產生器）；
// 這裡留的是台詞（lines-code.ts）、貼紙、家長區看舊紀錄還會用到的資料。
import type { Visual } from './games'
import { THEME_GOALS, THEME_STORIES } from './themes'

// ── 方向 ───────────────────────────────────────────────────
// 3 歲用「絕對方向」（上下左右，跟畫面一致），不用「左轉、右轉」：
// 相對方向要先站在車子的角度想，4–5 歲才開始，見 PRD §10 的年齡表
export type Dir = 'up' | 'down' | 'left' | 'right'
export const DIRS: Dir[] = ['up', 'down', 'left', 'right']
export const DIR_ZH: Record<Dir, string> = { up: '上', down: '下', left: '左', right: '右' }

// ── 箭頭卡開車 ─────────────────────────────────────────────
/** 豆豆要開去的地方：一局裡輪流出現，每個都有一句「Drive to the | house!」 */
export const TARGETS = [
  { id: 'house', icon: 'house', en: 'house' },
  { id: 'teddy', icon: 'teddy-bear', en: 'teddy bear' },
  { id: 'apple', icon: 'red-apple', en: 'apple' },
  { id: 'balloon', icon: 'balloon', en: 'balloon' },
  { id: 'gas', icon: 'fuel-pump', en: 'gas pump' },
] as const
export type TargetId = (typeof TARGETS)[number]['id']

/** 全部的目的地：原本的五個，加上主題式冒險的（公車站牌、恐龍巢…，在 themes.ts） */
export const DRIVE_TARGETS: { id: string; icon: string; en: string }[] = [...TARGETS, ...THEME_GOALS]

/** 擋路的樹：最高難度才出現，要繞過去 */
export const BLOCK_ICON = 'evergreen-tree'

// ── 找規律 ─────────────────────────────────────────────────
// 2026-10-28 重做（docs/玩法看得懂盤點.md 第 0 節）：豆豆的小火車拉著一節節車廂，最後一節是空位，接上對的車廂火車才開走。
// 畫面在 games/code/PatternGame.tsx。由簡到難：
//   1 級：形狀和顏色都不同的積木（紅圓、藍方），AB，2 選 1
//   2 級：換成實物（水果、動物，只用第 1 層的字），AB，3 選 1（多一個和答案同一類的干擾，不能只看「是不是水果」）
//   3 級：加入 AABB；4 級：加入 ABC。每一種規律第一次出現都重新示範（技能是 pattern:AB、pattern:AABB…）
// 箭頭規律拿掉了（和開車的箭頭卡長得一樣、意思不同）；AAB、ABB 停在一組的中間，3 歲太難，也拿掉
export type PatternKind = 'AB' | 'AABB' | 'ABC'
export const PATTERN_ZH: Record<PatternKind, string> = { AB: 'ABAB', AABB: 'AABB', ABC: 'ABC' }

/** thing：主題式冒險補的生活用品（雨傘、氣球），只在主題裡優先出，一般的規律題不會特別挑它們；block：1 級的積木 */
type Theme = 'vehicle' | 'animal' | 'food' | 'arrow' | 'shape' | 'thing' | 'block'
export interface PatternTok {
  id: string
  en: string
  theme: Theme
  v: Visual
}

const emojiTok = (id: string, en: string, theme: Theme, icon: string): PatternTok => ({ id, en, theme, v: { t: 'emoji', icon } })

/** 規律用的圖：名字要短，念起來才有節奏（Car! Dino! Car! Dino!） */
export const PATTERN_TOKS: PatternTok[] = [
  emojiTok('car', 'car', 'vehicle', 'automobile'),
  emojiTok('bus', 'bus', 'vehicle', 'bus'),
  emojiTok('firetruck', 'fire truck', 'vehicle', 'fire-engine'),
  emojiTok('tractor', 'tractor', 'vehicle', 'tractor'),
  // 一張圖一個名字（2026-10-28 單字盤點）：airplane、dinosaur 和動物村同名
  emojiTok('plane', 'airplane', 'vehicle', 'airplane'),
  emojiTok('boat', 'boat', 'vehicle', 'sailboat'),
  emojiTok('trex', 'T-rex', 'animal', 't-rex'),
  emojiTok('dino', 'dinosaur', 'animal', 'sauropod'),
  emojiTok('fish', 'fish', 'animal', 'fish'),
  emojiTok('frog', 'frog', 'animal', 'frog'),
  emojiTok('duck', 'duck', 'animal', 'duck'),
  // 主題式冒險補的（農場、海洋、動物園、下雨天、生日派對）
  emojiTok('cow', 'cow', 'animal', 'cow'),
  emojiTok('pig', 'pig', 'animal', 'pig'),
  emojiTok('crab', 'crab', 'animal', 'crab'),
  emojiTok('lion', 'lion', 'animal', 'lion'),
  emojiTok('umbrella', 'umbrella', 'thing', 'umbrella'),
  emojiTok('balloon', 'balloon', 'thing', 'balloon'),
  emojiTok('apple', 'apple', 'food', 'red-apple'),
  emojiTok('banana', 'banana', 'food', 'banana'),
  emojiTok('strawberry', 'strawberry', 'food', 'strawberry'),
  emojiTok('grapes', 'grapes', 'food', 'grapes'),
  // 箭頭也可以排規律：跟箭頭卡開車連在一起（上、下、上、下）
  ...DIRS.map((d): PatternTok => ({ id: d, en: d, theme: 'arrow', v: { t: 'arrow', dir: d } })),
  // 形狀（同一個顏色）：不用顏色排規律，因為 PRD §3 規定不能只靠顏色區分（墨水模式也要能玩）
  ...(['circle', 'triangle', 'square', 'star', 'heart'] as const).map((sh): PatternTok => ({ id: sh, en: sh, theme: 'shape', v: { t: 'shape', shape: sh, hex: '#F0B088' } })),
  // 第 1 層的動物（docs/vocab-audit.json）：實物的規律只用孩子天天看到的東西
  emojiTok('dog', 'dog', 'animal', 'dog-face'),
  emojiTok('cat', 'cat', 'animal', 'cat-face'),
  // 1 級的積木：形狀和顏色同時不同（PRD §3 不能只靠顏色；墨水模式看形狀也分得出來）。名字念形狀（Circle! Square!）
  { id: 'redcircle', en: 'circle', theme: 'block', v: { t: 'shape', shape: 'circle', hex: '#DE6B5A' } },
  { id: 'bluesquare', en: 'square', theme: 'block', v: { t: 'shape', shape: 'square', hex: '#5E93D1' } },
  { id: 'yellowtriangle', en: 'triangle', theme: 'block', v: { t: 'shape', shape: 'triangle', hex: '#F2C84B' } },
]


// ── 排順序 ─────────────────────────────────────────────────
// 每個小故事 2–4 張圖，只挑順序不會因家庭習慣而不同的（先穿襪子再穿鞋、蛋先孵出小雞）。
// 洗澡和刷牙誰先、早餐吃什麼這類每家不一樣的，不放進來。
//
// 2026-10-29 重做（家長在平板上看了說「這我看不懂要玩啥」）：依 3 歲 3 個月能理解的「先後」重排難度。
// 3 歲懂的先後是「自己天天做的事」和「看得到的變化」（蛋裂開跑出小雞、打哈欠然後睡著），
// 原因看不到、要等很久、或很少親眼看過的（雨停了才有彩虹、毛毛蟲變蝴蝶）延到 2 級。
//   1 級：兩步、看得到變化或自己天天做（蛋→小雞、蛋→恐龍、襪子→鞋子、下雨→撐傘、洗手→吃飯、打哈欠→睡著）
//   2 級：兩步、原因看不到或要等很久（hard：雨→彩虹、毛毛蟲→蝴蝶、冰→水、芽→花）
//   3 級：三步；4 級：四步
// 刷牙→睡覺拿掉了：早上起床後也刷牙，「先睡覺再刷牙」也說得通，不是唯一的順序。
export interface Story {
  id: string
  zh: string
  icons: string[]
  /** 每一張圖的旁白（英文，一張一句） */
  lines: string[]
  /** 兩步故事裡比較難的（原因看不到、要等很久）：2 級才出 */
  hard?: boolean
}

export const STORIES: Story[] = [
  // 1 級
  { id: 'hatch', zh: '蛋孵出小雞', icons: ['egg', 'hatching-chick'], lines: ['First, an | egg.', 'Crack! A baby | chick!'] },
  { id: 'dino', zh: '恐龍蛋孵出恐龍', icons: ['egg', 'sauropod'], lines: ['First, an | egg.', 'Then, a baby | dinosaur!'] },
  { id: 'shoes', zh: '先穿襪子再穿鞋', icons: ['socks', 'running-shoe'], lines: ['First, | socks.', 'Then, | shoes!'] },
  { id: 'umbrella', zh: '下雨了、撐傘', icons: ['cloud-with-rain', 'umbrella-with-rain-drops'], lines: ['Oh, | rain!', 'Open the | umbrella!'] },
  { id: 'wash', zh: '先洗手再吃飯', icons: ['soap', 'cooked-rice'], lines: ['First, wash your | hands.', 'Then, | eat!'] },
  { id: 'nap', zh: '打哈欠、睡著了', icons: ['yawning-face', 'sleeping-face'], lines: ['A big | yawn.', 'Now, | sleep!'] },
  // 2 級
  { id: 'rain', zh: '下雨後出彩虹', icons: ['cloud-with-rain', 'rainbow'], lines: ['First, | rain.', 'Then, a | rainbow!'], hard: true },
  { id: 'bug', zh: '毛毛蟲變蝴蝶', icons: ['bug', 'butterfly'], lines: ['First, a | caterpillar.', 'Then, a | butterfly!'], hard: true },
  { id: 'melt', zh: '冰塊融化成水', icons: ['ice', 'droplet'], lines: ['First, | ice.', 'Then, | water!'], hard: true },
  { id: 'grow', zh: '小芽長成花', icons: ['seedling', 'sunflower'], lines: ['First, a tiny | sprout.', 'Then, a big | flower!'], hard: true },
  // 3 級
  { id: 'chick', zh: '蛋孵出小雞（三步）', icons: ['egg', 'hatching-chick', 'baby-chick'], lines: ['First, an | egg.', 'Crack, | crack!', 'Hello, baby | chick!'] },
  { id: 'clouds', zh: '雲到彩虹（三步）', icons: ['cloud', 'cloud-with-rain', 'rainbow'], lines: ['Clouds | come.', 'Rain | falls.', 'A | rainbow!'] },
  { id: 'flower', zh: '發芽到開花', icons: ['seedling', 'herb', 'sunflower'], lines: ['A tiny | sprout.', 'It grows | bigger.', 'A big | flower!'] },
  { id: 'sleep', zh: '打哈欠到睡著', icons: ['yawning-face', 'bed', 'sleeping-face'], lines: ['A big | yawn!', 'Into | bed.', 'Zzz... | sleeping!'] },
  { id: 'day', zh: '早上到晚上', icons: ['sunrise', 'sun', 'crescent-moon'], lines: ['Good | morning!', 'It is | day.', 'Good | night!'] },
  // 4 級
  { id: 'chicken', zh: '蛋到大雞（四步）', icons: ['egg', 'hatching-chick', 'baby-chick', 'chicken'], lines: ['An | egg.', 'Crack, | crack!', 'A baby | chick.', 'A big | chicken!'] },
  { id: 'weather', zh: '晴天到彩虹（四步）', icons: ['sun', 'cloud', 'cloud-with-rain', 'rainbow'], lines: ['A sunny | day.', 'Clouds | come.', 'Rain | falls.', 'A | rainbow!'] },
  { id: 'plant', zh: '發芽到花束（四步）', icons: ['seedling', 'herb', 'tulip', 'bouquet'], lines: ['A tiny | sprout.', 'It grows | bigger.', 'A | flower!', 'Lots of | flowers!'] },
]

/** 原本的故事加上主題的故事（themes.ts）：台詞、家長區的名稱、概念都要對得到 */
export const ALL_STORIES: Story[] = [...STORIES, ...THEME_STORIES]

/** 不再出題的故事：家長區的舊紀錄還叫得出名字（不產生台詞、不算進熟練度） */
const RETIRED_STORIES: Story[] = [{ id: 'bed', zh: '刷牙再睡覺（已拿掉）', icons: ['toothbrush', 'bed'], lines: [] }]

export const story = (id: string) => ALL_STORIES.find((s) => s.id === id) ?? RETIRED_STORIES.find((s) => s.id === id)

// ── 圖示 ───────────────────────────────────────────────────
/** 程式車庫用到的 Fluent Emoji（scripts/build-emoji.ts 會一起打包） */
export const CODE_ICONS = [
  'vertical-traffic-light', 'automobile', 'puzzle-piece', 'hatching-chick', BLOCK_ICON,
  ...TARGETS.map((t) => t.icon),
  ...PATTERN_TOKS.flatMap((t) => (t.v.t === 'emoji' ? [t.v.icon] : [])),
  ...ALL_STORIES.flatMap((s) => s.icons),
]
