// 今天的世界（T-127，docs/T-127-新鮮感提案.md 第三節）：每天一個情境（農場、海邊、工地……），三堂課、故事、畫畫換上這個世界的背景和東西；
// 學習目標和進度規則不變（研究：同一個目標用長得不一樣的例子學得更好，Perry 2010；一模一樣的第二天「太好預測」，Kidd 2012）。
// - 純函式、不存任何東西：世界由日期算出來，沒有資料遷移。
// - 每 10 天是一輪：一輪裡 10 個世界各出現一次（順序由日期雜湊打亂），所以連續兩天一定不一樣，輪和輪的交界也特別擋掉重複。
// - getTodayWorld 回傳 null（WORLDS_ON 關掉、或測試把它關掉）時，各處照舊用原本的背景和東西。
import { fnv1a } from './hash'
import type { SceneId } from '../art/storybook/layout'
import type { Speaker } from '../content/registry'

export type WorldId = 'farm' | 'beach' | 'site' | 'zoo' | 'market' | 'city' | 'valley' | 'party' | 'rain' | 'garden'

export interface World {
  id: WorldId
  /** 給大人看的中文名字（陪玩小字、家長區） */
  name: string
  /** 背景：故事插畫的場景（art/storybook/scenes.tsx 的 <Scene id>） */
  scene: SceneId
  /** 可以數的東西（emoji 名字，art/emoji.generated.ts 裡都有）：數數、拿給波波、比多少用 */
  things: readonly string[]
  /** 畫畫的印章（emoji 名字，2～3 個） */
  stamps: readonly string[]
  /** 恐龍的開場句（台詞 id，content/lines-world.ts）：每隻恐龍各一句，念的內容一樣 */
  hi: Readonly<Record<Speaker, string>>
}

/** 每個世界的東西念成英文的複數（「Let's count the cows!」）；所有世界的 things 都要有 */
export const THING_NOUNS: Readonly<Record<string, string>> = {
  cow: 'cows',
  pig: 'pigs',
  ewe: 'sheep',
  'baby-chick': 'chicks',
  horse: 'horses',
  crab: 'crabs',
  'tropical-fish': 'fish',
  octopus: 'octopuses',
  sailboat: 'boats',
  dolphin: 'dolphins',
  construction: 'cones',
  brick: 'bricks',
  'delivery-truck': 'trucks',
  hammer: 'hammers',
  tractor: 'tractors',
  elephant: 'elephants',
  lion: 'lions',
  giraffe: 'giraffes',
  monkey: 'monkeys',
  zebra: 'zebras',
  'red-apple': 'apples',
  banana: 'bananas',
  grapes: 'grapes',
  watermelon: 'watermelons',
  strawberry: 'strawberries',
  carrot: 'carrots',
  automobile: 'cars',
  bus: 'buses',
  taxi: 'taxis',
  'fire-engine': 'fire trucks',
  'police-car': 'police cars',
  't-rex': 'dinosaurs',
  sauropod: 'dinosaurs',
  egg: 'eggs',
  footprints: 'footprints',
  volcano: 'volcanoes',
  balloon: 'balloons',
  'birthday-cake': 'cakes',
  'wrapped-gift': 'presents',
  lollipop: 'lollipops',
  'party-popper': 'party poppers',
  umbrella: 'umbrellas',
  frog: 'frogs',
  snail: 'snails',
  droplet: 'raindrops',
  duck: 'ducks',
  butterfly: 'butterflies',
  'lady-beetle': 'ladybugs',
  sunflower: 'sunflowers',
  bird: 'birds',
  honeybee: 'bees',
  tulip: 'flowers',
}

const hi = (id: WorldId) => ({ dodo: `world.${id}.hi.dodo`, bobo: `world.${id}.hi.bobo`, momo: `world.${id}.hi.momo` })

/** 世界清單。開場句的英文在 content/lines-world.ts 的 WORLD_HI */
export const WORLDS: readonly World[] = [
  { id: 'farm', name: '農場', scene: 'farm', things: ['cow', 'pig', 'ewe', 'baby-chick', 'horse', 'tractor'], stamps: ['cow', 'pig', 'baby-chick'], hi: hi('farm') },
  { id: 'beach', name: '海邊', scene: 'beach', things: ['crab', 'tropical-fish', 'octopus', 'sailboat', 'dolphin'], stamps: ['crab', 'tropical-fish', 'octopus'], hi: hi('beach') },
  { id: 'site', name: '工地', scene: 'site', things: ['construction', 'brick', 'delivery-truck', 'hammer', 'tractor'], stamps: ['delivery-truck', 'brick', 'construction'], hi: hi('site') },
  { id: 'zoo', name: '動物園', scene: 'zoo', things: ['elephant', 'lion', 'giraffe', 'monkey', 'zebra'], stamps: ['elephant', 'lion', 'giraffe'], hi: hi('zoo') },
  { id: 'market', name: '水果市場', scene: 'market', things: ['red-apple', 'banana', 'grapes', 'watermelon', 'strawberry', 'carrot'], stamps: ['red-apple', 'banana', 'strawberry'], hi: hi('market') },
  { id: 'city', name: '城市', scene: 'city', things: ['automobile', 'bus', 'taxi', 'fire-engine', 'police-car'], stamps: ['automobile', 'bus', 'fire-engine'], hi: hi('city') },
  { id: 'valley', name: '恐龍谷', scene: 'valley', things: ['t-rex', 'sauropod', 'egg', 'footprints', 'volcano'], stamps: ['t-rex', 'sauropod', 'egg'], hi: hi('valley') },
  { id: 'party', name: '生日派對', scene: 'party', things: ['balloon', 'birthday-cake', 'wrapped-gift', 'lollipop', 'party-popper'], stamps: ['balloon', 'wrapped-gift', 'birthday-cake'], hi: hi('party') },
  { id: 'rain', name: '下雨天', scene: 'rain', things: ['umbrella', 'frog', 'snail', 'droplet', 'duck'], stamps: ['umbrella', 'frog', 'duck'], hi: hi('rain') },
  { id: 'garden', name: '花園', scene: 'meadow', things: ['butterfly', 'lady-beetle', 'sunflower', 'bird', 'honeybee', 'tulip'], stamps: ['butterfly', 'sunflower', 'lady-beetle'], hi: hi('garden') },
]

/** 整個功能的開關：false 時 getTodayWorld 一律回傳 null，各處用原本的東西 */
export const WORLDS_ON = true

/** 本機（1970-01-01 起）第幾天：用當地的年月日算，不受時區、夏令時間影響 */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/** 第 b 輪（每輪 WORLDS.length 天）的順序：用 fnv1a 當亂數洗牌（同一輪每台裝置算出來都一樣） */
function rawOrder(b: number): number[] {
  const n = WORLDS.length
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = parseInt(fnv1a(`today-world:${b}:${i}`), 36) % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/** 第 b 輪的順序：開頭跟上一輪的最後一天一樣的話，開頭兩個對調（只動第 0、1 個，上一輪的最後一個不會被動到，不用往回遞迴） */
function blockOrder(b: number): number[] {
  const order = rawOrder(b)
  const prev = rawOrder(b - 1)
  if (order[0] === prev[prev.length - 1]) [order[0], order[1]] = [order[1], order[0]]
  return order
}

/** 某一天的世界（不看開關、不看測試的覆寫） */
export function worldOn(date: Date): World {
  const k = dayNumber(date)
  const n = WORLDS.length
  const b = Math.floor(k / n)
  return WORLDS[blockOrder(b)[k - b * n]]
}

/**
 * 測試、家長除錯用的覆寫：localStorage 的 `dodo:world` 設成世界 id 就固定用那個世界，設成 `off` 就關掉（回傳 null）。
 * 沒有 localStorage（單元測試、node）就不看。
 */
function override(): World | null | undefined {
  try {
    const v = globalThis.localStorage?.getItem('dodo:world')
    if (!v) return undefined
    if (v === 'off') return null
    // 不認得的 id：不理它，照日期
    return WORLDS.find((w) => w.id === v)
  } catch {
    return undefined
  }
}

/** 今天的世界；null 表示這個功能關掉了，各處照舊用原本的東西 */
export function getTodayWorld(date: Date = new Date()): World | null {
  if (!WORLDS_ON) return null
  const o = override()
  if (o !== undefined) return o
  return worldOn(date)
}

export const worldById = (id: string): World | null => WORLDS.find((w) => w.id === id) ?? null
