// 護眼休息（src/ui/EyeBreak.tsx）：每 10 分鐘一次，看遠方 20 秒（20-20-20 原則：20 秒、6 公尺外）。
// 孩子不識字，所以「要做什麼」全靠豆豆的語音和動作示範；中文只寫給爸爸看（角落的陪玩小字）。
// 每次休息：開場一句 → 一個「看遠方找東西」的任務 → 中途一句「繼續看」→ 一個身體小任務（眨眼／伸懶腰／揮手）
// → 「再看遠方」→ 時間到說一句鼓勵。看遠方佔大部分時間，身體小任務只是穿插。
// 全部是豆豆說；`|` 之後是加重的目標字（要找的東西）。這些不是考題，字幕不挖空。
import { def } from './registry'
import { CHILD_EN } from '../lib/env'
import type { ThemeId } from './themes'

def('eye.break', 'dodo', "Eye break! Let's look far, far away.")
def('eye.done', 'dodo', `All rested! Great job, ${CHILD_EN}. Let's keep going!`)

/** 看遠方找東西：icon 是 Fluent Emoji 名稱；color 是找顏色的題目（畫一團低彩度的顏色，不用圖示） */
export interface EyeFind {
  id: string
  /** 台詞 eye.find.<id> */
  en: string
  icon?: string
  color?: string
  /** 給爸爸的中文：接在「帶他看窗外 6 公尺以外的地方，」後面 */
  zh: string
}

export const EYE_FIND: EyeFind[] = [
  { id: 'tree', en: 'Look far away. Can you find a | tree?', icon: 'deciduous-tree', zh: '一起找一棵樹' },
  { id: 'bird', en: 'Look far away. Can you see a | bird?', icon: 'bird', zh: '一起找找有沒有小鳥' },
  { id: 'blue', en: 'Look far away. Find something | blue!', color: '#8FB0CF', zh: '一起找一個藍色的東西' },
  { id: 'car', en: 'Look far away. Can you see a | car?', icon: 'automobile', zh: '一起找一台車子' },
  { id: 'cloud', en: 'Look up high. Can you see a | cloud?', icon: 'cloud', zh: '抬頭看天空，一起找雲' },
  { id: 'green', en: 'Look far away. Find something | green!', color: '#9EC39A', zh: '一起找一個綠色的東西' },
  { id: 'house', en: 'Look far away. Can you see a | house?', icon: 'house', zh: '一起找遠遠的房子、大樓' },
  // 只給主題用（消防救援）
  { id: 'redcar', en: 'Look far away. Can you see a | red car?', icon: 'automobile', zh: '一起找一台紅色的車' },
]

/** 平常輪流出的（主題專用的不在裡面） */
export const EYE_FIND_ROTATION = ['tree', 'bird', 'blue', 'car', 'cloud', 'green', 'house']

/** 今日冒險有主題時，找東西的任務跟故事呼應（沒有對應的主題就照平常輪替） */
export const EYE_FIND_THEME: Partial<Record<ThemeId, string>> = {
  bus: 'car',
  dino: 'green',
  farm: 'tree',
  fire: 'redcar',
  ocean: 'blue',
  rain: 'cloud',
  fruit: 'tree',
  zoo: 'bird',
  build: 'house',
  picnic: 'tree',
}

for (const f of EYE_FIND) def(`eye.find.${f.id}`, 'dodo', f.en)

/** 中途的一句：提醒他繼續看遠方（輪替） */
export const EYE_KEEP = ['Keep looking, far, far away.', 'What else can you see out there?', 'So far away! Keep looking.']
EYE_KEEP.forEach((t, i) => def(`eye.keep.${i}`, 'dodo', t))

/** 身體小任務：豆豆示範同一個動作。眨眼、揮手時眼睛還是看著遠方 */
export type EyeMove = 'blink' | 'stretch' | 'wave'
export const EYE_MOVES: { id: EyeMove; zh: string }[] = [
  { id: 'blink', zh: '中間豆豆會請他慢慢眨三次眼' },
  { id: 'stretch', zh: '中間豆豆會請他舉手伸懶腰' },
  { id: 'wave', zh: '中間豆豆會請他對遠方揮揮手' },
]
def('eye.move.blink', 'dodo', 'Blink, blink, blink!')
def('eye.move.stretch', 'dodo', 'Big stretch! Arms up high!')
def('eye.move.wave', 'dodo', 'Wave to something far away!')
def('eye.again', 'dodo', 'Now look far away again.')
