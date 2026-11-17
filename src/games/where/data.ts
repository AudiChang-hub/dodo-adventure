// 躲在哪裡（數學 MA-8 位置詞，T-160）的內容：躲起來的小動物、大東西（家具、車子、樹…）、場景。只有資料，沒有畫面（scripts/test-where-feel.ts 直接測）。
// 3 歲只做 in、on、under（指引 MA-8、準則 LOAD-4：上下、裡外先；next to、behind 是 4 歲的內容，這裡不做）。
// 小動物用 Fluent Emoji（MIT，../play-emoji.generated.ts），大東西和場景是自己畫的 SVG（./art.tsx），畫風跟故事插畫同一套。

export type Rel = 'in' | 'on' | 'under'
export const RELS: Rel[] = ['in', 'on', 'under']

/** 躲起來的小動物：en 是念的名字（Find the cat…）；emoji 是 Fluent Emoji 的名字 */
export interface Hider {
  id: string
  en: string
  emoji: string
  /** 看起來比較大的（兔子、猴子）畫小一點，躲在下面才不會頂到 */
  k?: number
}

// 都是全身或一看就知道的小動物、3 歲聽得懂的名字；大型動物（大象、長頸鹿）躲不進桌子底下，不用
export const HIDERS: Hider[] = [
  { id: 'cat', en: 'cat', emoji: 'cat' },
  { id: 'dog', en: 'dog', emoji: 'dog' },
  { id: 'bunny', en: 'bunny', emoji: 'rabbit' },
  { id: 'mouse', en: 'mouse', emoji: 'mouse' },
  { id: 'pig', en: 'pig', emoji: 'pig' },
  { id: 'duck', en: 'duck', emoji: 'duck' },
  { id: 'chick', en: 'chick', emoji: 'baby-chick' },
  { id: 'hen', en: 'hen', emoji: 'chicken' },
  { id: 'penguin', en: 'penguin', emoji: 'penguin' },
  { id: 'turtle', en: 'turtle', emoji: 'turtle' },
  { id: 'frog', en: 'frog', emoji: 'frog' },
  { id: 'hedgehog', en: 'hedgehog', emoji: 'hedgehog' },
  { id: 'owl', en: 'owl', emoji: 'owl' },
  { id: 'bird', en: 'bird', emoji: 'bird' },
  { id: 'snail', en: 'snail', emoji: 'snail' },
  { id: 'ladybug', en: 'ladybug', emoji: 'lady-beetle' },
  { id: 'squirrel', en: 'squirrel', emoji: 'chipmunk' },
  { id: 'fox', en: 'fox', emoji: 'fox' },
  { id: 'panda', en: 'panda', emoji: 'panda' },
  { id: 'koala', en: 'koala', emoji: 'koala' },
  { id: 'monkey', en: 'monkey', emoji: 'monkey' },
  { id: 'parrot', en: 'parrot', emoji: 'parrot' },
  { id: 'otter', en: 'otter', emoji: 'otter' },
  { id: 'crab', en: 'crab', emoji: 'crab' },
  { id: 'butterfly', en: 'butterfly', emoji: 'butterfly' },
]

/**
 * 小動物可以躲的一個位置（大東西自己的座標：原點在大東西底部正中間、地板上，y 往上是負的）。
 * x、y 是小動物的腳（emoji 方框底部正中間）；k 是大小（1 = 標準的 ANIMAL 大小）。
 * in 的位置：小動物的下半身會被大東西前面那一層（front）擋住，只露出上半身。
 */
export interface Slot {
  rel: Rel
  x: number
  y: number
  k?: number
}

/** 小動物在場景裡的標準大小（場景座標；場景寬 1000，平板上大約 1.1 倍，> 2 cm，準則 TOUCH-1） */
export const ANIMAL = 118

export type ObjectId =
  | 'table'
  | 'chair'
  | 'bed'
  | 'sofa'
  | 'desk'
  | 'cupboard'
  | 'toybox'
  | 'bathtub'
  | 'car'
  | 'wagon'
  | 'stroller'
  | 'slide'
  | 'bench'
  | 'tree'
  | 'wheelbarrow'
  | 'doghouse'
  | 'boat'
  | 'truck'
  | 'bus'
  | 'trampoline'
  | 'piano'
  | 'bridge'
  | 'crib'
  | 'deckchair'
  | 'basket'
  | 'shelf'

export interface BigThing {
  id: ObjectId
  /** 念的時候：under the table */
  en: string
  slots: Slot[]
}

export const OBJECTS: Record<ObjectId, BigThing> = {
  table: { id: 'table', en: 'the table', slots: [{ rel: 'on', x: -120, y: -262 }, { rel: 'on', x: 120, y: -262 }, { rel: 'under', x: -110, y: 0 }, { rel: 'under', x: 110, y: 0 }] },
  chair: { id: 'chair', en: 'the chair', slots: [{ rel: 'on', x: 0, y: -178 }, { rel: 'under', x: 0, y: 0, k: 0.92 }] },
  bed: { id: 'bed', en: 'the bed', slots: [{ rel: 'on', x: -60, y: -236 }, { rel: 'on', x: 150, y: -236 }, { rel: 'under', x: -110, y: 0, k: 0.86 }, { rel: 'under', x: 130, y: 0, k: 0.86 }] },
  sofa: { id: 'sofa', en: 'the sofa', slots: [{ rel: 'on', x: -110, y: -170 }, { rel: 'on', x: 110, y: -170 }, { rel: 'under', x: 0, y: 0, k: 0.78 }] },
  desk: { id: 'desk', en: 'the desk', slots: [{ rel: 'in', x: 150, y: -96, k: 0.86 }, { rel: 'on', x: -150, y: -262 }, { rel: 'on', x: 60, y: -262 }, { rel: 'under', x: -100, y: 0 }] },
  cupboard: { id: 'cupboard', en: 'the cupboard', slots: [{ rel: 'in', x: -74, y: -136, k: 0.84 }, { rel: 'in', x: 74, y: -136, k: 0.84 }, { rel: 'on', x: -80, y: -312 }, { rel: 'on', x: 80, y: -312 }, { rel: 'under', x: 0, y: 0, k: 0.8 }] },
  toybox: { id: 'toybox', en: 'the toybox', slots: [{ rel: 'in', x: -100, y: -180 }, { rel: 'in', x: 100, y: -180 }, { rel: 'under', x: 0, y: 0, k: 0.66 }] },
  bathtub: { id: 'bathtub', en: 'the bathtub', slots: [{ rel: 'in', x: -110, y: -186 }, { rel: 'in', x: 100, y: -186 }, { rel: 'under', x: 0, y: 0, k: 0.76 }] },
  car: { id: 'car', en: 'the car', slots: [{ rel: 'in', x: -86, y: -170, k: 0.82 }, { rel: 'in', x: 92, y: -170, k: 0.82 }, { rel: 'on', x: -70, y: -298 }, { rel: 'on', x: 80, y: -298 }, { rel: 'under', x: 0, y: 0, k: 0.72 }] },
  wagon: { id: 'wagon', en: 'the wagon', slots: [{ rel: 'in', x: -100, y: -178 }, { rel: 'in', x: 100, y: -178 }, { rel: 'under', x: 0, y: 0, k: 0.74 }] },
  stroller: { id: 'stroller', en: 'the stroller', slots: [{ rel: 'in', x: -10, y: -222, k: 0.9 }, { rel: 'under', x: -10, y: 0, k: 0.82 }] },
  slide: { id: 'slide', en: 'the slide', slots: [{ rel: 'on', x: -150, y: -286 }, { rel: 'on', x: 120, y: -150 }, { rel: 'under', x: -40, y: 0 }, { rel: 'under', x: 70, y: 0, k: 0.74 }] },
  bench: { id: 'bench', en: 'the bench', slots: [{ rel: 'on', x: -120, y: -158 }, { rel: 'on', x: 120, y: -158 }, { rel: 'under', x: -110, y: 0, k: 0.92 }, { rel: 'under', x: 110, y: 0, k: 0.92 }] },
  tree: { id: 'tree', en: 'the tree', slots: [{ rel: 'in', x: 6, y: -168, k: 0.8 }, { rel: 'on', x: -150, y: -292 }, { rel: 'on', x: 160, y: -318 }, { rel: 'under', x: -190, y: 0 }, { rel: 'under', x: 200, y: 0 }] },
  wheelbarrow: { id: 'wheelbarrow', en: 'the wheelbarrow', slots: [{ rel: 'in', x: -30, y: -184 }, { rel: 'under', x: -40, y: 0, k: 0.78 }] },
  doghouse: { id: 'doghouse', en: 'the doghouse', slots: [{ rel: 'in', x: 0, y: -14, k: 0.86 }, { rel: 'on', x: -70, y: -330 }, { rel: 'on', x: 80, y: -322 }] },
  boat: { id: 'boat', en: 'the boat', slots: [{ rel: 'in', x: -170, y: -142 }, { rel: 'in', x: 170, y: -142 }, { rel: 'on', x: 0, y: -272 }] },
  truck: { id: 'truck', en: 'the truck', slots: [{ rel: 'in', x: -170, y: -184 }, { rel: 'in', x: -50, y: -184 }, { rel: 'on', x: 150, y: -312 }, { rel: 'under', x: -20, y: 0, k: 0.7 }] },
  bus: { id: 'bus', en: 'the bus', slots: [{ rel: 'in', x: -150, y: -190, k: 0.8 }, { rel: 'in', x: 20, y: -190, k: 0.8 }, { rel: 'on', x: -120, y: -326 }, { rel: 'on', x: 110, y: -326 }, { rel: 'under', x: -40, y: 0, k: 0.68 }] },
  trampoline: { id: 'trampoline', en: 'the trampoline', slots: [{ rel: 'on', x: -120, y: -150 }, { rel: 'on', x: 120, y: -150 }, { rel: 'under', x: -120, y: 0, k: 0.86 }, { rel: 'under', x: 120, y: 0, k: 0.86 }] },
  piano: { id: 'piano', en: 'the piano', slots: [{ rel: 'on', x: -110, y: -318 }, { rel: 'on', x: 100, y: -318 }, { rel: 'under', x: 0, y: 0, k: 0.86 }] },
  bridge: { id: 'bridge', en: 'the bridge', slots: [{ rel: 'on', x: -120, y: -214 }, { rel: 'on', x: 120, y: -214 }, { rel: 'under', x: -60, y: 0 }, { rel: 'under', x: 70, y: 0 }] },
  crib: { id: 'crib', en: 'the crib', slots: [{ rel: 'in', x: -80, y: -150 }, { rel: 'in', x: 80, y: -150 }, { rel: 'under', x: 0, y: 0, k: 0.8 }] },
  deckchair: { id: 'deckchair', en: 'the deckchair', slots: [{ rel: 'on', x: 50, y: -166 }, { rel: 'under', x: 50, y: 0, k: 0.86 }] },
  basket: { id: 'basket', en: 'the basket', slots: [{ rel: 'in', x: 116, y: -186 }, { rel: 'on', x: -120, y: -218 }] },
  shelf: { id: 'shelf', en: 'the shelf', slots: [{ rel: 'in', x: -84, y: -122, k: 0.8 }, { rel: 'in', x: 84, y: -122, k: 0.8 }, { rel: 'on', x: -80, y: -322 }, { rel: 'on', x: 80, y: -322 }, { rel: 'under', x: 0, y: 0, k: 0.72 }] },
}
export const OBJECT_IDS = Object.keys(OBJECTS) as ObjectId[]

export type PlaceId =
  | 'bedroom'
  | 'kitchen'
  | 'living'
  | 'bathroom'
  | 'playroom'
  | 'classroom'
  | 'garden'
  | 'park'
  | 'farm'
  | 'forest'
  | 'beach'
  | 'street'
  | 'snow'
  | 'lake'

/** 場景：indoor 是房間（牆＋地板），其他是戶外（天空＋草地、沙灘、雪地）；things 是這個場景放得下的大東西 */
export interface Place {
  id: PlaceId
  zh: string
  indoor: boolean
  things: ObjectId[]
}

export const PLACES: Record<PlaceId, Place> = {
  bedroom: { id: 'bedroom', zh: '臥室', indoor: true, things: ['bed', 'desk', 'toybox', 'crib', 'chair', 'shelf', 'basket'] },
  kitchen: { id: 'kitchen', zh: '廚房', indoor: true, things: ['table', 'chair', 'cupboard', 'basket'] },
  living: { id: 'living', zh: '客廳', indoor: true, things: ['sofa', 'table', 'piano', 'cupboard', 'toybox', 'shelf'] },
  bathroom: { id: 'bathroom', zh: '浴室', indoor: true, things: ['bathtub', 'cupboard', 'basket'] },
  playroom: { id: 'playroom', zh: '遊戲室', indoor: true, things: ['toybox', 'slide', 'table', 'wagon', 'shelf', 'chair', 'trampoline'] },
  classroom: { id: 'classroom', zh: '教室', indoor: true, things: ['desk', 'table', 'chair', 'piano', 'shelf'] },
  garden: { id: 'garden', zh: '院子', indoor: false, things: ['wheelbarrow', 'doghouse', 'trampoline', 'bench', 'tree', 'wagon', 'table'] },
  park: { id: 'park', zh: '公園', indoor: false, things: ['slide', 'bench', 'tree', 'bridge', 'stroller'] },
  farm: { id: 'farm', zh: '農場', indoor: false, things: ['truck', 'wheelbarrow', 'tree', 'doghouse', 'wagon', 'basket'] },
  forest: { id: 'forest', zh: '森林', indoor: false, things: ['tree', 'bridge', 'bench', 'basket'] },
  beach: { id: 'beach', zh: '海邊', indoor: false, things: ['boat', 'deckchair', 'basket', 'table'] },
  street: { id: 'street', zh: '街上', indoor: false, things: ['car', 'bus', 'truck', 'bench', 'stroller'] },
  snow: { id: 'snow', zh: '雪地', indoor: false, things: ['tree', 'bench', 'doghouse', 'car', 'slide'] },
  lake: { id: 'lake', zh: '湖邊', indoor: false, things: ['boat', 'bridge', 'tree', 'bench'] },
}
export const PLACE_IDS = Object.keys(PLACES) as PlaceId[]

/** 大東西有哪些位置（不重複） */
export const relsOf = (o: ObjectId): Rel[] => RELS.filter((r) => OBJECTS[o].slots.some((s) => s.rel === r))
export const slotsOf = (o: ObjectId, r: Rel) => OBJECTS[o].slots.filter((s) => s.rel === r)

/** 位置詞的中文（家長區、陪玩用） */
export const REL_ZH: Record<Rel, string> = { in: '裡面', on: '上面', under: '下面' }

/** 所有用得到的 emoji（scripts/build-play-emoji.ts） */
export const WHERE_EMOJI = HIDERS.map((h) => h.emoji)
