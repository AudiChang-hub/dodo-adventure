// 主題式綜合冒險（2026-10-28 家長決定）：每天的冒險是一個主題故事，一個主題同時練四條能力主線。
// 孩子看不到「科目」：今天是「莫莫的公車旅行」，每一站都是在幫公車的忙——數公車、聽 bus 的開頭音、
// 用箭頭卡把公車開到站牌、描 B、把旅行排好順序。主線、雷達圖、額度只出現在家長區。
//
// 這個檔案只放資料（沒有執行期相依，只 import 型別與純資料），題目產生器、排課、畫面都從這裡讀。
// 加一個新主題：照下面的格式加一筆，台詞在 lines-themes.ts 會自動產生（故事旁白另外寫在 BEATS），
// 圖示會由 scripts/build-emoji.ts 一起打包（npm run emoji），音檔用 npm run audio 產生。
//
// 主題只決定「題目裡出現什麼東西」，不決定「練什麼技能」：
// 排課照四條主線的需要排（lib/tracks.ts），每個遊戲照常挑到期複習、還不熟的內容；
// 主題給不出這個技能需要的內容時（例如今天該複習的音不是主題的字），就用一般的題目——學習的正確性比主題純度重要。
import type { Speaker } from './registry'
import type { Story } from './code'
import type { ColorId } from './park'
import type { Tag, UseTag, VocabTheme } from './vocab'

export type ThemeId = 'bus' | 'dino' | 'farm' | 'fire' | 'ocean' | 'rain' | 'fruit' | 'zoo' | 'build' | 'bedtime' | 'birthday' | 'picnic'

/** 背景的造型（src/ui/ThemeScenery.tsx）：只畫在畫面邊緣的低對比剪影 */
export type SceneKind = 'city' | 'valley' | 'farm' | 'sea' | 'rain' | 'market' | 'zoo' | 'site' | 'night' | 'party' | 'park'

/** 箭頭卡開車的目的地（和 code.ts 的 TARGETS 同一個格式；台詞 c.drive.to.<id>） */
export interface DriveGoal {
  id: string
  icon: string
  en: string
}

export interface ThemeDef {
  id: ThemeId
  /** 標題卡上的英文（也是第一句旁白的文字） */
  title: string
  /** 家長區用的中文名 */
  zh: string
  /** 說故事的恐龍：標題、每站之間的旁白都是牠；路線圖上開的也是牠的車（莫莫是黃色公車） */
  host: Speaker
  /** 標題卡的大圖 */
  icon: string
  scene: SceneKind
  /** 背景色、強調色、地面色：低彩度、高明度（紙感螢幕） */
  tint: string
  deep: string
  ground: string
  /** 每一站的故事圖（第 i 站用第 i 張），旁白在 BEATS[id].stops[i] */
  stops: [string, string, string, string, string]
  /** 故事的終點：最後一站之後大大地出現 */
  finale: string[]
  /** 家長設定的「本週主題」對到哪幾個主題：本週主題是動物時，動物多的主題比較常排到 */
  matches: VocabTheme[]

  // ── 題目內容：每一項都是「優先用」，沒有或不適合就用一般的 ─────────
  /** 詞彙（vocab.ts 的 id）：聽詞找圖、聽聲音、分類題的答案 */
  vocab: string[]
  /** 自然發音的字（letters.ts 的字）：主題的音先出、答案先用主題的字 */
  words: string[]
  /** 要數的東西（Fluent Emoji）：點點數數、有幾個、比多少、塗格子 */
  count: string[]
  colors: ColorId[]
  /** 箭頭卡開車的目的地 */
  goal: DriveGoal
  /** 排順序的故事 id（可以用 code.ts 原有的故事，也可以是下面 THEME_STORIES 的） */
  stories: string[]
  /** 描數字字母：主題的字（B is for bus） */
  glyphs: string
  /** 著色頁（games/draw/pictures.ts 的 id） */
  coloring?: string
  /** 連點成圖（content/dots.ts 的 id） */
  dots?: string[]
  /** 找規律的圖（code.ts 的 PATTERN_TOKS id） */
  pattern: string[]
  /** 找出全部、圈圈看（games-worksheet.ts 的題目 id） */
  sort: string[]
  /** 動動腦的分類 */
  tags?: Tag[]
  /** 做什麼用的分類 */
  uses?: UseTag[]
  /** 爸爸可以在路上、家裡接著玩的一句（陪玩提示、出門任務卡） */
  dad: string
}

/** 主題專用的排順序小故事：一樣只挑順序不會因家庭習慣而不同的 */
export const THEME_STORIES: Story[] = [
  { id: 'bus2', zh: '等公車、公車來了', icons: ['bus-stop', 'bus'], lines: ['First, wait at the | bus stop.', 'Then, here comes the | bus!'] },
  { id: 'bus3', zh: '等車、坐車、到動物園', icons: ['bus-stop', 'bus', 'lion'], lines: ['Wait at the | bus stop.', 'Ride the | bus.', 'Hello, | lion!'], easy: true },
  { id: 'farm2', zh: '發芽到紅蘿蔔', icons: ['seedling', 'carrot'], lines: ['First, a little | sprout.', 'Then, a big | carrot!'] },
  { id: 'fire2', zh: '火、灑水', icons: ['fire', 'droplet'], lines: ['First, a | fire!', 'Then, splash, | water!'] },
  { id: 'fire3', zh: '火、消防車來了、灑水', icons: ['fire', 'fire-engine', 'droplet'], lines: ['Oh no, a | fire!', 'Here comes the | fire truck!', 'Splash! | Water!'], easy: true },
  { id: 'ocean2', zh: '蛋孵出小海龜', icons: ['egg', 'turtle'], lines: ['First, an | egg.', 'Then, a baby | turtle!'] },
  { id: 'fruit2', zh: '發芽到草莓', icons: ['seedling', 'strawberry'], lines: ['First, a little | sprout.', 'Then, a | strawberry!'] },
  { id: 'fruit3', zh: '發芽、開花、結草莓', icons: ['seedling', 'blossom', 'strawberry'], lines: ['A tiny | sprout.', 'A pretty | flower.', 'A yummy | strawberry!'], easy: true },
  { id: 'zoo2', zh: '蛋孵出企鵝', icons: ['egg', 'penguin'], lines: ['First, an | egg.', 'Then, a baby | penguin!'] },
  { id: 'build2', zh: '磚塊蓋成房子', icons: ['brick', 'house'], lines: ['First, | bricks.', 'Then, a | house!'] },
  { id: 'build3', zh: '磚塊、蓋房子、新房子', icons: ['brick', 'building-construction', 'house'], lines: ['Here are the | bricks.', 'Build, build, | build!', 'A new | house!'], easy: true },
  { id: 'party2', zh: '拆禮物', icons: ['wrapped-gift', 'teddy-bear'], lines: ['First, a | present.', 'Open it! A | teddy bear!'] },
]

/** 主題的開車目的地（house 沿用 code.ts 原本的） */
export const THEME_GOALS: DriveGoal[] = [
  { id: 'busstop', icon: 'bus-stop', en: 'bus stop' },
  { id: 'nest', icon: 'nest-with-eggs', en: 'nest' },
  { id: 'cow', icon: 'cow', en: 'cow' },
  { id: 'kitty', icon: 'cat', en: 'kitty' },
  { id: 'beach', icon: 'beach-with-umbrella', en: 'beach' },
  { id: 'rainbow', icon: 'rainbow', en: 'rainbow' },
  { id: 'basket', icon: 'basket', en: 'basket' },
  { id: 'monkey', icon: 'monkey', en: 'monkey' },
  { id: 'bed', icon: 'bed', en: 'bed' },
  { id: 'cake', icon: 'birthday-cake', en: 'cake' },
  { id: 'kite', icon: 'kite', en: 'kite' },
]
const goal = (id: string): DriveGoal => (id === 'house' ? { id: 'house', icon: 'house', en: 'house' } : THEME_GOALS.find((g) => g.id === id)!)

export const THEMES: ThemeDef[] = [
  {
    id: 'bus', title: "Momo's Bus Trip", zh: '公車旅行', host: 'momo', icon: 'bus', scene: 'city',
    tint: '#F5EBCB', deep: '#BF9A3F', ground: '#E6D6A6',
    stops: ['bus-stop', 'bus', 'vertical-traffic-light', 'bridge-at-night', 'giraffe'], finale: ['lion', 'elephant', 'giraffe'],
    matches: ['vehicle', 'animal'],
    vocab: ['bus', 'car', 'taxi', 'bike', 'police', 'ambulance', 'truck', 'scooter'],
    words: ['bus', 'bicycle', 'taxi', 'car', 'ambulance', 'motorcycle', 'police car', 'van', 'lion'],
    count: ['bus', 'automobile', 'taxi', 'bicycle'], colors: ['yellow', 'red', 'blue'],
    goal: goal('busstop'), stories: ['bus2', 'bus3'], glyphs: 'BCOT', coloring: 'bus', dots: ['square'],
    pattern: ['bus', 'car'], sort: ['car', 'yellow', 'circle'], tags: ['wheels'],
    dad: '路上看到公車，問他 How many buses? 一起數一數',
  },
  {
    id: 'dino', title: "Dodo's Dino Valley", zh: '恐龍谷', host: 'dodo', icon: 'sauropod', scene: 'valley',
    tint: '#DDEBD5', deep: '#6E9D6B', ground: '#C4DCB6',
    stops: ['footprints', 'sauropod', 'volcano', 'nest-with-eggs', 't-rex'], finale: ['nest-with-eggs', 'sauropod'],
    matches: ['dino'],
    vocab: ['trex', 'sauropod', 'dragon', 'volcano', 'turtle', 'frog'],
    words: ['dinosaur', 'T-rex', 'egg', 'volcano', 'mammoth', 'lizard', 'nest'],
    count: ['t-rex', 'sauropod', 'egg'], colors: ['green', 'orange', 'brown'],
    goal: goal('nest'), stories: ['dino'], glyphs: 'DTO', coloring: 'dodo', dots: ['triangle'],
    pattern: ['trex', 'dino'], sort: ['animal', 'green', 'triangle'], tags: ['legs4'],
    dad: '一起學恐龍走路 stomp, stomp，問他 Big or small?',
  },
  {
    id: 'farm', title: "Bobo's Farm Day", zh: '農場', host: 'bobo', icon: 'tractor', scene: 'farm',
    tint: '#F2E8D2', deep: '#AE8A5C', ground: '#DDCDA2',
    stops: ['tractor', 'cow', 'ewe', 'pig', 'chicken'], finale: ['cow', 'pig', 'chicken'],
    matches: ['animal', 'food'],
    vocab: ['cow', 'sheep', 'pig', 'chicken', 'duck', 'horse', 'goat', 'dog', 'cat', 'tractor'],
    words: ['cow', 'cat', 'pig', 'duck', 'dog', 'horse', 'goat', 'egg', 'ox', 'carrot', 'goose'],
    count: ['egg', 'baby-chick', 'ewe', 'pig'], colors: ['brown', 'pink', 'red', 'green'],
    goal: goal('cow'), stories: ['farm2', 'chick', 'chicken'], glyphs: 'COHE', coloring: 'house', dots: ['house'],
    pattern: ['cow', 'pig', 'duck'], sort: ['chick', 'animal'], tags: ['legs4'], uses: ['eat'],
    dad: '你學動物叫，讓他說英文：cow、pig、duck',
  },
  {
    id: 'fire', title: "Dodo's Fire Rescue", zh: '消防救援', host: 'dodo', icon: 'fire-engine', scene: 'city',
    tint: '#F5DED6', deep: '#C2725F', ground: '#E8C8BB',
    stops: ['fire-engine', 'police-car', 'ladder', 'droplet', 'cat'], finale: ['cat', 'fire-engine'],
    matches: ['vehicle'],
    vocab: ['firetruck', 'ambulance', 'police', 'helicopter', 'truck', 'car', 'cat'],
    words: ['fire truck', 'helicopter', 'ambulance', 'police car', 'car', 'house', 'cat'],
    count: ['fire-engine', 'ambulance', 'police-car', 'droplet'], colors: ['red', 'yellow', 'orange'],
    goal: goal('kitty'), stories: ['fire2', 'fire3'], glyphs: 'FHTL', coloring: 'firetruck', dots: ['house', 'triangle'],
    pattern: ['firetruck', 'car'], sort: ['car', 'red'], tags: ['wheels'],
    dad: '看到紅色的車，問他 What color? Is it a fire truck?',
  },
  {
    id: 'ocean', title: "Momo's Ocean Day", zh: '海洋', host: 'momo', icon: 'spouting-whale', scene: 'sea',
    tint: '#D7E8EE', deep: '#5D90A4', ground: '#BCD7E1',
    stops: ['sailboat', 'tropical-fish', 'octopus', 'spouting-whale', 'beach-with-umbrella'], finale: ['beach-with-umbrella', 'crab'],
    matches: ['animal'],
    vocab: ['fish', 'whale', 'turtle', 'boat', 'octopus', 'crab', 'duck'],
    words: ['fish', 'whale', 'octopus', 'turtle', 'seal', 'dolphin', 'jellyfish', 'anchor', 'sun'],
    count: ['fish', 'tropical-fish', 'crab', 'octopus'], colors: ['blue', 'green', 'orange'],
    goal: goal('beach'), stories: ['ocean2'], glyphs: 'OCF', coloring: 'fish', dots: ['boat', 'fish'],
    pattern: ['fish', 'boat', 'crab'], sort: ['blue', 'animal'], tags: ['water'],
    dad: '洗澡時問他 Fish can swim. Can you swim?',
  },
  {
    id: 'rain', title: "Bobo's Rainy Day", zh: '下雨天', host: 'bobo', icon: 'umbrella-with-rain-drops', scene: 'rain',
    tint: '#DFE5EC', deep: '#6F87A3', ground: '#CAD4E0',
    stops: ['cloud', 'umbrella', 'frog', 'snail', 'rainbow'], finale: ['rainbow'],
    matches: ['home', 'animal'],
    vocab: ['umbrella', 'raincoat', 'boot', 'duck', 'frog', 'bird'],
    words: ['rainbow', 'frog', 'duck', 'snail', 'worm', 'socks'],
    count: ['droplet', 'umbrella', 'frog', 'snail'], colors: ['blue', 'yellow', 'green'],
    goal: goal('rainbow'), stories: ['rain', 'clouds', 'weather'], glyphs: 'UCO', coloring: 'umbrella', dots: ['diamond'],
    pattern: ['frog', 'duck', 'umbrella'], sort: ['blue', 'yellow'], tags: ['water'], uses: ['rain'],
    dad: '下雨天出門，讓他說 umbrella、boots，數一數有幾個水窪',
  },
  {
    id: 'fruit', title: "Momo's Fruit Market", zh: '水果市場', host: 'momo', icon: 'basket', scene: 'market',
    tint: '#F4E4D6', deep: '#C3895B', ground: '#E6CDB5',
    stops: ['basket', 'red-apple', 'banana', 'grapes', 'watermelon'], finale: ['basket', 'strawberry'],
    matches: ['food'],
    vocab: ['apple', 'banana', 'grapes', 'strawberry', 'watermelon', 'carrot'],
    words: ['apple', 'banana', 'watermelon', 'lemon', 'mango', 'pear', 'tomato', 'carrot', 'olive', 'kiwi'],
    count: ['red-apple', 'strawberry', 'tangerine', 'lemon'], colors: ['red', 'yellow', 'green', 'orange', 'purple'],
    goal: goal('basket'), stories: ['fruit2', 'fruit3', 'flower'], glyphs: 'OCLA', dots: ['heart'],
    pattern: ['apple', 'banana', 'strawberry', 'grapes'], sort: ['fruit', 'apple', 'red'], tags: ['eat'], uses: ['eat'],
    dad: '去市場時問他 How many apples? 讓他幫忙拿',
  },
  {
    id: 'zoo', title: "Bobo's Zoo Visit", zh: '動物園', host: 'bobo', icon: 'elephant', scene: 'zoo',
    tint: '#E5EBD4', deep: '#869C5A', ground: '#CFDCB2',
    stops: ['elephant', 'giraffe', 'monkey', 'zebra', 'lion'], finale: ['lion', 'monkey'],
    matches: ['animal'],
    vocab: ['elephant', 'lion', 'giraffe', 'monkey', 'tiger', 'panda', 'zebra', 'penguin'],
    words: ['lion', 'monkey', 'tiger', 'elephant', 'panda', 'penguin', 'kangaroo', 'koala', 'hippo', 'gorilla', 'seal', 'llama', 'camel'],
    count: ['monkey', 'elephant', 'penguin', 'giraffe'], colors: ['brown', 'orange', 'yellow'],
    goal: goal('monkey'), stories: ['zoo2'], glyphs: 'LTMZ',
    pattern: ['lion', 'trex'], sort: ['animal', 'orange'], tags: ['legs4'],
    dad: '看動物圖鑑問他 Where is the lion? 一起學獅子叫',
  },
  {
    id: 'build', title: "Bobo's Building Site", zh: '工地', host: 'bobo', icon: 'building-construction', scene: 'site',
    tint: '#F3E2CB', deep: '#C28A50', ground: '#E2C8A5',
    stops: ['construction', 'brick', 'delivery-truck', 'hammer', 'house'], finale: ['house'],
    matches: ['vehicle', 'home'],
    vocab: ['truck', 'tractor', 'car', 'taxi', 'bike'],
    words: ['house', 'tent', 'robot', 'helicopter'],
    count: ['brick', 'delivery-truck', 'hammer', 'construction'], colors: ['orange', 'yellow', 'brown'],
    goal: goal('house'), stories: ['build2', 'build3'], glyphs: 'HTLI', coloring: 'house', dots: ['house', 'square', 'triangle'],
    pattern: ['tractor', 'square', 'triangle'], sort: ['square', 'triangle', 'cube', 'yellow'], tags: ['wheels'],
    dad: '看到工地時問他 What is that? A truck! 一起數有幾台',
  },
  {
    id: 'bedtime', title: "Momo's Bedtime", zh: '睡前時光', host: 'momo', icon: 'crescent-moon', scene: 'night',
    tint: '#E0DEEE', deep: '#7D77AA', ground: '#CCC8E1',
    stops: ['bathtub', 'toothbrush', 'teddy-bear', 'crescent-moon', 'bed'], finale: ['bed', 'crescent-moon'],
    matches: ['home'],
    vocab: ['bed', 'teddy', 'toothbrush', 'bathtub', 'sponge', 'shower', 'owl', 'cat'],
    words: ['moon', 'mouse', 'teddy bear', 'bear', 'socks', 'yawn'],
    count: ['ewe', 'star', 'teddy-bear'], colors: ['blue', 'purple', 'yellow'],
    goal: goal('bed'), stories: ['bed', 'sleep', 'day'], glyphs: 'CO1', dots: ['star', 'house'],
    pattern: ['star', 'heart', 'circle'], sort: ['star', 'circle', 'purple'], uses: ['bed', 'bath'],
    dad: '睡前一起說 Good night, moon. 數三隻羊再睡',
  },
  {
    id: 'birthday', title: "Dodo's Birthday Party", zh: '生日派對', host: 'dodo', icon: 'birthday-cake', scene: 'party',
    tint: '#F4DFE6', deep: '#BE7C94', ground: '#E8C8D4',
    stops: ['wrapped-gift', 'balloon', 'birthday-cake', 'party-popper', 'teddy-bear'], finale: ['birthday-cake', 'balloon'],
    matches: ['food', 'home'],
    vocab: ['cake', 'gift', 'cookie', 'teddy', 'dress', 'cap', 'strawberry'],
    words: ['balloon', 'cupcake', 'cookie', 'popcorn', 'pizza', 'yo-yo', 'kite', 'robot', 'lollipop', 'teddy bear'],
    count: ['balloon', 'wrapped-gift', 'cupcake', 'candle'], colors: ['pink', 'purple', 'red', 'yellow'],
    goal: goal('cake'), stories: ['party2'], glyphs: 'OCU', coloring: 'balloons', dots: ['heart', 'star'],
    pattern: ['balloon', 'heart', 'star'], sort: ['heart', 'star', 'pink'], tags: ['eat'], uses: ['eat', 'wear'],
    dad: '吃點心時一起數 one, two, three，問他 How many candles?',
  },
  {
    id: 'picnic', title: "Bobo's Park Picnic", zh: '公園野餐', host: 'bobo', icon: 'sandwich', scene: 'park',
    tint: '#DDEBD9', deep: '#6C9F79', ground: '#C4DDC1',
    stops: ['deciduous-tree', 'butterfly', 'sandwich', 'kite', 'sun-with-face'], finale: ['kite', 'sun-with-face'],
    matches: ['food', 'animal'],
    vocab: ['dog', 'bird', 'butterfly', 'bike', 'apple', 'banana', 'cookie'],
    words: ['sandwich', 'ball', 'butterfly', 'bicycle', 'kite', 'sun', 'ant', 'ladybug', 'leaf', 'worm', 'apple', 'dog'],
    count: ['ant', 'butterfly', 'lady-beetle', 'sandwich'], colors: ['green', 'red', 'yellow'],
    goal: goal('kite'), stories: ['bug', 'flower', 'plant'], glyphs: 'OLS', dots: ['diamond', 'triangle'],
    pattern: ['apple', 'banana', 'circle'], sort: ['bug', 'apple', 'green'], tags: ['fly', 'eat'], uses: ['eat'],
    dad: '去公園找螞蟻、蝴蝶，問他 How many ants?',
  },
]

/**
 * 故事旁白：標題（主持的恐龍念標題卡上的字）、開場、每站之間、結尾。
 * 每句不超過 6、7 個字、說一次就好（家長嫌吵過）；`|` 之後是加重的字。
 * 每站的旁白對著那一站的故事圖（THEMES[].stops），只講旅程，不講「現在要學什麼」。
 */
export const BEATS: Record<ThemeId, { intro: string; stops: [string, string, string, string, string]; end: string }> = {
  bus: {
    intro: 'Today, we ride the bus to the | zoo.',
    stops: ['We wait at the | bus stop.', 'Here comes the bus. Hop on.', 'Red light, stop. Green light, | go.', 'Over the big | bridge.', 'Look, I can see a | giraffe.'],
    end: 'Hooray. We made it to the | zoo.',
  },
  dino: {
    intro: "Let's go to | Dino Valley!",
    stops: ['Stomp, stomp! Dino | footprints!', 'Look up! A long-neck | dino!', 'The volcano goes | puff, puff!', 'Shh... dino | eggs!', 'Rawr! A friendly | T-rex!'],
    end: 'Hooray! We found the dino | nest!',
  },
  farm: {
    intro: "Let's go to the | farm!",
    stops: ['Hop on the big | tractor!', 'Moo! Hello, | cows!', 'Baa! Hello, | sheep!', 'Oink, oink! Muddy | pigs!', 'Cock-a-doodle-doo!'],
    end: 'Hooray! What a fun | farm day!',
  },
  fire: {
    intro: 'Wee-oo! The fire truck needs | help!',
    stops: ['Hop on the | fire truck!', 'The police car comes, | too!', 'Up, up the tall | ladder!', 'Splash! Lots of | water!', 'Meow! The kitty is | safe!'],
    end: 'Hooray! Everyone is | safe!',
  },
  ocean: {
    intro: 'Today, we sail on the | sea.',
    stops: ['Our little boat goes | bob, bob.', 'Look, fish are | swimming.', 'Hello, | octopus.', 'Splash! A big | whale.', 'I can see the | beach.'],
    end: 'Hooray. We made it to the | beach.',
  },
  rain: {
    intro: "Drip, drop! It's a | rainy day!",
    stops: ['Look at the gray | clouds!', 'Open your | umbrella!', 'Ribbit! Frogs love | rain!', 'A slow, slow | snail!', 'The rain is | stopping!'],
    end: 'Hooray! Look, a big | rainbow!',
  },
  fruit: {
    intro: "Let's shop at the fruit | market.",
    stops: ['Here is our | basket.', 'Shiny red | apples.', 'Yummy yellow | bananas.', 'So many | grapes.', 'A big, big | watermelon.'],
    end: 'Hooray. Our basket is | full.',
  },
  zoo: {
    intro: "Let's visit the | zoo!",
    stops: ['Look! A big | elephant!', 'A giraffe! So | tall!', 'Ooh ooh! Silly | monkeys!', 'Stripes! A | zebra!', 'Roar! A | lion!'],
    end: 'Hooray! Bye-bye, | zoo!',
  },
  build: {
    intro: "Let's build a | house!",
    stops: ["Hard hats on! Let's | go!", 'Bring the | bricks!', 'Beep, beep! Big | truck!', 'Bang, bang! | Hammer time!', 'Almost | done!'],
    end: 'Hooray! We built a | house!',
  },
  bedtime: {
    intro: 'It is almost | bedtime.',
    stops: ['Splash, splash. | Bath time.', 'Brush, brush, | brush.', 'Hug your | teddy bear.', 'Hello, big round | moon.', 'One big | yawn.'],
    end: 'Good night, bed. Good night, | moon.',
  },
  birthday: {
    intro: "It's a birthday | party!",
    stops: ['Knock, knock! A | present!', 'So many | balloons!', 'Here is the | cake!', 'Pop! | Party time!', 'A new | teddy bear!'],
    end: 'Hooray! What a happy | party!',
  },
  picnic: {
    intro: "Let's have a | picnic!",
    stops: ['Find a big | tree!', 'Look! A | butterfly!', 'Yum! | Sandwich time!', 'Up goes the | kite!', 'The sun is | warm!'],
    end: 'Hooray! What a sunny | picnic!',
  },
}

export const theme = (id: string | null | undefined): ThemeDef | null => (id ? (THEMES.find((t) => t.id === id) ?? null) : null)

/** 主題用到的圖示（scripts/build-emoji.ts 會一起打包） */
export const THEME_ICONS = [
  ...THEMES.flatMap((t) => [t.icon, ...t.stops, ...t.finale, ...t.count, t.goal.icon]),
  ...THEME_STORIES.flatMap((s) => s.icons),
  ...THEME_GOALS.map((g) => g.icon),
]

// ── 今天的主題 ─────────────────────────────────────────────────
/** 幾天內不重複同一個主題（12 個主題，一週內不會撞到） */
export const THEME_GAP_DAYS = 6

/** 32 位元的 FNV-1a（和 lib/hash.ts 同一個算法；這裡不 import，保持這個檔案沒有執行期相依） */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * 挑今天的主題（純函式，同一天、同樣的歷史一定挑到同一個）：
 * 1. 最近 THEME_GAP_DAYS 天出現過的不挑（recent 是那幾天存下來的冒險主題，沒玩的日子沒有）；
 * 2. 家長設了「本週主題」（對應聯絡簿）：只從對得到的主題裡挑，都用過了才放寬；
 * 3. 剩下的依「日期＋主題」的雜湊排序取第一個：每天看起來隨機，但重新整理不會變。
 */
export function pickTheme(input: { date: string; recent: readonly (string | null | undefined)[]; week?: VocabTheme | null }): ThemeId {
  const used = new Set(input.recent.filter(Boolean) as string[])
  let pool = THEMES.filter((t) => !used.has(t.id))
  if (!pool.length) pool = THEMES.filter((t) => t.id !== input.recent[0])
  if (input.week) {
    const fav = pool.filter((t) => t.matches.includes(input.week!))
    if (fav.length) pool = fav
  }
  return [...pool].sort((a, b) => hash(`${input.date}|${a.id}`) - hash(`${input.date}|${b.id}`))[0].id
}
