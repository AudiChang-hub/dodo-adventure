// 故事排順序（T-164，語言 ZH-1／認知：先後、因果）的內容：42 個日常小故事，每個 3～4 張圖。只有資料，沒有畫面（scripts/test-order-listen.ts 直接測）。
// 圖是 Fluent Emoji（MIT，../lang-emoji.generated.ts）＋自己畫的小東西（./art.tsx 的 Drawn），座標 0～100 的方格，地面大約在 y = 80。
// 每一張的旁白接在 First, / Then, / Last, 後面念（「First, put a seed in the dirt.」），一句 ≤ 6 個字（不算 First/Then/Last）。
// 順序一定看得出來：東西越來越多（積木一塊一塊疊）、越長越大（種子 → 芽 → 花）、有因果（下雨 → 彩虹），不放「先穿上衣還是褲子」這種都可以的。

/** 自己畫的小東西（./art.tsx） */
export type DrawnId =
  | 'mound'
  | 'bubbles'
  | 'oven'
  | 'snowball'
  | 'slice'
  | 'dough'
  | 'sauce'
  | 'bits'
  | 'mud'
  | 'block'
  | 'castle'
  | 'puddle'
  | 'blanket'
  | 'pan'
  | 'pot'
  | 'canvas'
  | 'pad'
  | 'water'
  | 'half'
  | 'line'

/** 圖上的一樣東西：emoji 或自己畫的；x、y 是中心，s 是大小（0～100），r 旋轉，o 透明度 */
export type Bit = { e: string; x: number; y: number; s: number; r?: number; flip?: boolean; o?: number } | { d: DrawnId; x: number; y: number; s: number; c?: string; r?: number; o?: number }

/** 背景：天空＋地面的顏色（./art.tsx 的 BG） */
export type Bg = 'grass' | 'home' | 'kitchen' | 'bath' | 'sand' | 'snow' | 'night' | 'sky' | 'dusk' | 'school' | 'pond'

export interface Step {
  /** 接在 First, / Then, / Last, 後面念的那一句 */
  say: string
  pic: Bit[]
  bg?: Bg
}

export interface Story {
  id: string
  /** 中文名字（家長區、作答紀錄） */
  zh: string
  bg: Bg
  steps: Step[]
  /** 4 張的故事只排 3 張時拿掉哪一張（預設 1） */
  drop?: number
}

const E = (e: string, x: number, y: number, s: number, more: { r?: number; flip?: boolean; o?: number } = {}): Bit => ({ e, x, y, s, ...more })
const D = (d: DrawnId, x: number, y: number, s: number, c?: string, more: { r?: number; o?: number } = {}): Bit => ({ d, x, y, s, c, ...more })
const step = (say: string, pic: Bit[], bg?: Bg): Step => ({ say, pic, bg })

const RED = '#E0604E'
const YEL = '#F2C94C'
const BLU = '#4F7FC2'

// ── 4 張的故事（熟練了排 4 張；排 3 張時拿掉 drop 那一張） ──

const FOUR: Story[] = [
  {
    id: 'plant',
    zh: '種花',
    bg: 'grass',
    steps: [
      step('put a seed in the dirt.', [D('mound', 50, 80, 60), E('chestnut', 50, 66, 16)]),
      step('give it some water.', [D('mound', 50, 80, 60), E('droplet', 40, 30, 14), E('droplet', 56, 22, 12), E('droplet', 50, 48, 14)]),
      step('a little sprout pops up!', [D('mound', 50, 80, 60), E('seedling', 50, 56, 30)]),
      step('a big flower grows!', [D('mound', 50, 80, 60), E('sunflower', 50, 40, 60)]),
    ],
  },
  {
    id: 'chick',
    zh: '小雞孵出來',
    bg: 'grass',
    steps: [
      step('there is an egg.', [E('empty-nest', 50, 72, 56), E('egg', 50, 56, 30)]),
      step('crack! It is hatching.', [E('empty-nest', 50, 72, 56), E('hatching-chick', 50, 52, 38)]),
      step('a fluffy chick says hi.', [E('empty-nest', 26, 78, 30), E('baby-chick', 56, 56, 42)]),
      step('it grows into a hen.', [E('chicken', 50, 50, 64)]),
    ],
    drop: 2,
  },
  {
    id: 'teeth',
    zh: '刷牙',
    bg: 'bath',
    steps: [
      step('get your toothbrush.', [E('toothbrush', 50, 50, 56, { r: -30 })]),
      step('brush, brush, brush!', [E('tooth', 44, 54, 44), E('toothbrush', 66, 44, 40, { r: -50 }), D('bubbles', 34, 30, 30)]),
      step('rinse with water.', [E('tooth', 44, 56, 44), E('droplet', 70, 30, 14), E('droplet', 78, 48, 12), E('droplet', 66, 62, 12)]),
      step('your teeth are so shiny!', [E('tooth', 50, 54, 50), E('sparkles', 76, 26, 26)]),
    ],
  },
  {
    id: 'cake',
    zh: '做蛋糕',
    bg: 'kitchen',
    steps: [
      step('mix it in a bowl.', [E('bowl-with-spoon', 48, 60, 50), E('egg', 78, 66, 18)]),
      step('bake it in the oven.', [D('oven', 50, 56, 66)]),
      step('add the candles.', [E('birthday-cake', 50, 56, 56)]),
      step('blow! Happy birthday!', [E('birthday-cake', 44, 58, 50), E('party-popper', 78, 30, 28), E('wind-face', 18, 24, 22)]),
    ],
  },
  {
    id: 'shoes',
    zh: '穿鞋子出門',
    bg: 'home',
    steps: [
      step('put on your socks.', [E('socks', 50, 54, 52)]),
      step('put on your shoes.', [E('running-shoe', 50, 58, 54)]),
      step('open the door.', [E('door', 50, 50, 64)]),
      step('off to the park!', [E('deciduous-tree', 34, 48, 52), E('running-shoe', 70, 72, 26), E('sun', 80, 18, 22)], 'grass'),
    ],
    drop: 2,
  },
  {
    id: 'sandcastle',
    zh: '蓋沙堡',
    bg: 'sand',
    steps: [
      step('fill the bucket with sand.', [E('bucket', 50, 60, 44), D('mound', 50, 84, 50, '#E8CC8E')]),
      step('flip it upside down.', [E('bucket', 50, 58, 44, { r: 180 })]),
      step('look, a sand castle!', [D('castle', 50, 62, 56)]),
      step('add a little flag.', [D('castle', 50, 62, 56), E('triangular-flag', 56, 20, 26)]),
    ],
  },
  {
    id: 'bath',
    zh: '洗澡',
    bg: 'bath',
    steps: [
      step('fill up the tub.', [E('bathtub', 50, 62, 70), E('droplet', 34, 24, 12), E('droplet', 46, 16, 12)]),
      step('add lots of bubbles.', [E('bathtub', 50, 62, 70), D('bubbles', 50, 42, 44)]),
      step('scrub, scrub, scrub!', [E('bathtub', 50, 62, 70), D('bubbles', 50, 42, 44), E('soap', 26, 22, 22), E('duck', 74, 34, 20)]),
      step('dry off. All clean!', [E('child', 50, 52, 56), E('sparkles', 78, 24, 22)]),
    ],
  },
  {
    id: 'snowman',
    zh: '堆雪人',
    bg: 'snow',
    steps: [
      step('roll a big snowball.', [D('snowball', 50, 66, 40)]),
      step('put one more on top.', [D('snowball', 50, 66, 40), D('snowball', 50, 38, 28)]),
      step('add a face and a hat.', [E('snowman-without-snow', 50, 50, 70)]),
      step('the sun melts it.', [E('sun', 78, 18, 26), D('puddle', 46, 82, 54), E('carrot', 40, 76, 16, { r: 30 }), E('top-hat', 60, 74, 18)]),
    ],
  },
  {
    id: 'sandwich',
    zh: '做三明治',
    bg: 'kitchen',
    steps: [
      step('get a slice of bread.', [D('slice', 50, 56, 50)]),
      step('add some cheese.', [D('slice', 50, 56, 50), E('cheese-wedge', 50, 52, 30)]),
      step('add a green leaf.', [D('slice', 50, 56, 50), E('cheese-wedge', 44, 54, 28), E('leafy-green', 60, 48, 28)]),
      step('lunch is ready! Yum!', [E('sandwich', 50, 54, 58)]),
    ],
  },
  {
    id: 'pizza',
    zh: '做披薩',
    bg: 'kitchen',
    steps: [
      step('roll out the dough.', [D('dough', 50, 58, 64)]),
      step('spread the red sauce.', [D('dough', 50, 58, 64), D('sauce', 50, 58, 50)]),
      step('sprinkle on the cheese.', [D('dough', 50, 58, 64), D('sauce', 50, 58, 50), D('bits', 50, 58, 44, YEL)]),
      step('bake it. Pizza time!', [E('pizza', 50, 54, 58), E('sparkles', 80, 22, 20)]),
    ],
  },
  {
    id: 'carwash',
    zh: '洗車',
    bg: 'grass',
    steps: [
      step('the car is all muddy.', [E('automobile', 50, 62, 62), D('mud', 50, 62, 50)]),
      step('soap it all up!', [E('automobile', 50, 62, 62), D('mud', 50, 62, 50), D('bubbles', 50, 44, 50)]),
      step('rinse with water.', [E('automobile', 50, 62, 62), E('droplet', 30, 24, 12), E('droplet', 50, 18, 12), E('droplet', 70, 26, 12)]),
      step('shiny and clean!', [E('automobile', 50, 62, 62), E('sparkles', 76, 28, 24)]),
    ],
  },
  {
    id: 'tower',
    zh: '疊積木',
    bg: 'home',
    steps: [
      step('put down one block.', [D('block', 50, 74, 20, RED)]),
      step('add another block.', [D('block', 50, 74, 20, RED), D('block', 50, 54, 20, YEL)]),
      step('one more on top!', [D('block', 50, 74, 20, RED), D('block', 50, 54, 20, YEL), D('block', 50, 34, 20, BLU)]),
      step('a tall, tall tower!', [D('block', 50, 74, 20, RED), D('block', 50, 54, 20, YEL), D('block', 50, 34, 20, BLU), E('glowing-star', 50, 14, 18)]),
    ],
  },
  {
    id: 'morning',
    zh: '早上起床',
    bg: 'sky',
    steps: [
      step('the sun comes up.', [E('sunrise', 50, 50, 70)], 'dusk'),
      step('wake up and stretch!', [E('person-in-bed', 50, 60, 64), E('sun', 84, 16, 18)], 'home'),
      step('eat your breakfast.', [E('pancakes', 50, 56, 56)], 'kitchen'),
      step('off to school!', [E('school', 46, 50, 58), E('backpack', 80, 70, 26)], 'school'),
    ],
  },
  {
    id: 'balloon',
    zh: '吹氣球',
    bg: 'sky',
    steps: [
      step('blow up a balloon.', [E('balloon', 50, 62, 18), E('wind-face', 22, 62, 22)]),
      step('it gets bigger.', [E('balloon', 50, 54, 36)]),
      step('bigger and bigger!', [E('balloon', 50, 46, 62)]),
      step('pop!', [E('collision', 50, 48, 60)]),
    ],
    drop: 2,
  },
  {
    id: 'growup',
    zh: '長大',
    bg: 'home',
    steps: [
      step('a tiny baby.', [E('baby', 50, 60, 36)]),
      step('a little kid.', [E('child', 50, 56, 48)]),
      step('a big grown-up.', [E('person', 50, 52, 60)]),
      step('a grandma or grandpa.', [E('older-person', 50, 52, 60)]),
    ],
    drop: 3,
  },
]

// ── 3 張的故事 ──

const THREE: Story[] = [
  {
    id: 'butterfly',
    zh: '毛毛蟲變蝴蝶',
    bg: 'grass',
    steps: [
      step('a caterpillar eats a leaf.', [E('leafy-green', 46, 60, 50), E('bug', 64, 52, 28)]),
      step('it takes a long nap.', [E('leafy-green', 46, 60, 50), E('bug', 52, 56, 24), E('zzz', 74, 26, 24)]),
      step('now it is a butterfly!', [E('butterfly', 50, 44, 50), E('leafy-green', 30, 78, 26)]),
    ],
  },
  {
    id: 'rain',
    zh: '下雨出彩虹',
    bg: 'sky',
    steps: [
      step('dark clouds come.', [E('cloud', 36, 34, 44), E('cloud', 66, 44, 40)]),
      step('rain falls down.', [E('cloud-with-rain', 50, 44, 60)]),
      step('a rainbow comes out!', [E('rainbow', 50, 50, 70), E('sun', 82, 18, 22)]),
    ],
  },
  {
    id: 'apple',
    zh: '蘋果長大',
    bg: 'grass',
    steps: [
      step('flowers bloom on the tree.', [E('deciduous-tree', 50, 50, 76), E('cherry-blossom', 36, 34, 16), E('cherry-blossom', 60, 26, 16), E('cherry-blossom', 64, 46, 16)]),
      step('little green apples grow.', [E('deciduous-tree', 50, 50, 76), E('green-apple', 36, 36, 16), E('green-apple', 60, 28, 16), E('green-apple', 64, 46, 16)]),
      step('the apples turn red!', [E('deciduous-tree', 50, 50, 76), E('red-apple', 36, 36, 18), E('red-apple', 60, 28, 18), E('red-apple', 64, 46, 18)]),
    ],
  },
  {
    id: 'bedtime',
    zh: '睡覺',
    bg: 'home',
    steps: [
      step('read a story.', [E('open-book', 50, 56, 56)]),
      step('turn off the light.', [E('light-bulb', 50, 46, 44, { o: 0.55 })], 'night'),
      step('sleep tight!', [E('bed', 48, 66, 56), E('zzz', 72, 30, 26)], 'night'),
    ],
  },
  {
    id: 'cookies',
    zh: '烤餅乾',
    bg: 'kitchen',
    steps: [
      step('mix the dough.', [E('bowl-with-spoon', 50, 58, 54)]),
      step('bake them in the oven.', [D('oven', 50, 56, 66)]),
      step('cookies and milk!', [E('cookie', 38, 62, 34), E('glass-of-milk', 68, 54, 38)]),
    ],
  },
  {
    id: 'handwash',
    zh: '洗手',
    bg: 'bath',
    steps: [
      step('get your hands wet.', [E('palms-up-together', 50, 64, 50), E('droplet', 40, 26, 12), E('droplet', 56, 20, 12), E('droplet', 50, 38, 12)]),
      step('rub with soap.', [E('palms-up-together', 50, 64, 50), E('soap', 50, 34, 26), D('bubbles', 26, 40, 22), D('bubbles', 74, 40, 22)]),
      step('dry them off.', [E('palms-up-together', 50, 64, 50), E('roll-of-paper', 78, 30, 26), E('sparkles', 24, 26, 20)]),
    ],
  },
  {
    id: 'fishing',
    zh: '釣魚',
    bg: 'pond',
    steps: [
      step('throw in the line.', [E('fishing-pole', 34, 40, 50), D('line', 60, 56, 40), D('water', 50, 82, 100)]),
      step('a fish bites!', [E('fishing-pole', 34, 40, 50), D('line', 60, 56, 40), D('water', 50, 82, 100), E('fish', 64, 76, 22)]),
      step('a big fish! Hooray!', [E('tropical-fish', 50, 50, 54), E('sparkles', 80, 22, 20)]),
    ],
  },
  {
    id: 'painting',
    zh: '畫畫',
    bg: 'home',
    steps: [
      step('get out the paints.', [E('artist-palette', 50, 56, 56)]),
      step('paint a picture.', [D('canvas', 46, 52, 54), E('paintbrush', 74, 48, 30, { r: 20 })]),
      step('hang it on the wall.', [E('framed-picture', 50, 46, 56)]),
    ],
  },
  {
    id: 'mail',
    zh: '寄信',
    bg: 'home',
    steps: [
      step('write a letter.', [E('memo', 46, 54, 50), E('pencil', 72, 40, 26)]),
      step('put it in an envelope.', [E('envelope', 50, 54, 54)]),
      step('drop it in the mailbox.', [E('postbox', 50, 52, 60), E('envelope', 76, 30, 20, { r: -20 })], 'grass'),
    ],
  },
  {
    id: 'gift',
    zh: '拆禮物',
    bg: 'home',
    steps: [
      step('here is a present.', [E('wrapped-gift', 50, 56, 54)]),
      step('rip open the paper!', [E('wrapped-gift', 50, 60, 46, { r: 12 }), E('collision', 66, 30, 30)]),
      step('a teddy bear inside!', [E('teddy-bear', 50, 54, 54), E('sparkles', 78, 22, 20)]),
    ],
  },
  {
    id: 'juice',
    zh: '榨果汁',
    bg: 'kitchen',
    steps: [
      step('pick some oranges.', [E('tangerine', 34, 60, 30), E('tangerine', 62, 62, 30), E('tangerine', 48, 40, 28)]),
      step('squeeze, squeeze, squeeze!', [D('half', 38, 60, 32), D('half', 64, 60, 32), E('droplet', 50, 34, 14)]),
      step('a cup of orange juice!', [E('beverage-box', 50, 54, 52)]),
    ],
  },
  {
    id: 'popcorn',
    zh: '爆米花',
    bg: 'kitchen',
    steps: [
      step('put corn in the pot.', [D('pot', 50, 64, 54), E('ear-of-corn', 50, 30, 32, { r: 30 })]),
      step('heat it up.', [D('pot', 50, 56, 54), E('fire', 50, 84, 26)]),
      step('pop, pop, popcorn!', [E('popcorn', 50, 54, 56)]),
    ],
  },
  {
    id: 'daynight',
    zh: '白天到晚上',
    bg: 'sky',
    steps: [
      step('the sun is up high.', [E('sun', 50, 30, 40)], 'sky'),
      step('the sun goes down.', [E('sunset', 50, 50, 70)], 'dusk'),
      step('the moon comes out.', [E('crescent-moon', 44, 36, 36), E('star', 72, 22, 14), E('star', 24, 62, 12)], 'night'),
    ],
  },
  {
    id: 'ice',
    zh: '冰塊融化',
    bg: 'kitchen',
    steps: [
      step('here is an ice cube.', [E('ice', 50, 56, 44)]),
      step('it starts to melt.', [E('ice', 50, 56, 34), D('puddle', 50, 76, 40)]),
      step('now it is just water.', [D('puddle', 50, 72, 64)]),
    ],
  },
  {
    id: 'ouchie',
    zh: '跌倒擦藥',
    bg: 'grass',
    steps: [
      step('oops, a fall!', [E('leg', 48, 56, 56, { r: 20 }), E('collision', 66, 66, 26), E('rock', 28, 78, 18)]),
      step('put on a bandage.', [E('leg', 48, 56, 56, { r: 20 }), E('adhesive-bandage', 56, 50, 22, { r: 30 })]),
      step('all better now!', [E('person-running', 46, 56, 52, { flip: true }), E('sparkles', 78, 24, 22)]),
    ],
  },
  {
    id: 'picnic',
    zh: '野餐',
    bg: 'grass',
    steps: [
      step('pack the basket.', [E('basket', 50, 62, 50), E('sandwich', 40, 36, 22), E('red-apple', 62, 34, 18)]),
      step('spread out the blanket.', [D('blanket', 50, 76, 76), E('basket', 72, 62, 24)]),
      step('eat lunch in the sun!', [D('blanket', 50, 76, 76), E('sandwich', 40, 66, 24), E('red-apple', 62, 66, 16), E('sun', 80, 18, 24)]),
    ],
  },
  {
    id: 'pancake',
    zh: '煎鬆餅',
    bg: 'kitchen',
    steps: [
      step('mix the batter.', [E('bowl-with-spoon', 50, 58, 54)]),
      step('cook it in a pan.', [D('pan', 50, 60, 60)]),
      step('stack them up. Yum!', [E('pancakes', 50, 54, 58)]),
    ],
  },
  {
    id: 'nest',
    zh: '小鳥的窩',
    bg: 'sky',
    steps: [
      step('a bird builds a nest.', [E('bird', 66, 36, 30), E('empty-nest', 44, 66, 50)]),
      step('eggs in the nest.', [E('nest-with-eggs', 50, 62, 56)]),
      step('baby birds hatch!', [E('empty-nest', 50, 70, 56), E('baby-chick', 40, 52, 24), E('baby-chick', 60, 52, 24)]),
    ],
  },
  {
    id: 'bus',
    zh: '坐公車上學',
    bg: 'grass',
    steps: [
      step('wait at the bus stop.', [E('bus-stop', 50, 50, 60)]),
      step('here comes the bus!', [E('bus', 50, 58, 66)]),
      step('hello, school!', [E('school', 50, 50, 64)], 'school'),
    ],
  },
  {
    id: 'cleanup',
    zh: '收玩具',
    bg: 'home',
    steps: [
      step('toys all over the floor.', [E('teddy-bear', 24, 66, 26, { r: -20 }), E('soccer-ball', 54, 78, 18), E('racing-car', 76, 62, 24), E('kite', 50, 40, 22, { r: 30 })]),
      step('put them in the basket.', [E('basket', 50, 66, 50), E('teddy-bear', 44, 42, 22), E('soccer-ball', 78, 80, 16)]),
      step('all tidy now!', [E('basket', 50, 62, 50), E('sparkles', 78, 24, 22)]),
    ],
  },
  {
    id: 'cocoa',
    zh: '熱可可',
    bg: 'kitchen',
    steps: [
      step('pour the milk.', [E('glass-of-milk', 50, 54, 54)]),
      step('warm it up.', [D('pot', 50, 56, 54), E('fire', 50, 84, 26)]),
      step('hot cocoa! Blow, blow.', [E('hot-beverage', 50, 56, 54)]),
    ],
  },
  {
    id: 'kite',
    zh: '放風箏',
    bg: 'grass',
    steps: [
      step('hold up the kite.', [E('person-standing', 40, 58, 50), E('kite', 62, 56, 26)]),
      step('run, run, run!', [E('person-running', 36, 60, 48, { flip: true }), E('kite', 70, 34, 26)]),
      step('up in the sky!', [E('kite', 66, 18, 28), E('cloud', 30, 24, 30), E('person-standing', 30, 70, 30)]),
    ],
  },
  {
    id: 'rocket',
    zh: '火箭',
    bg: 'sky',
    steps: [
      step('three, two, one…', [D('pad', 50, 86, 50), E('rocket', 50, 56, 50, { r: -45 })]),
      step('blast off!', [E('rocket', 50, 40, 46, { r: -45 }), E('fire', 50, 74, 26, { r: 180 })]),
      step('up to the moon!', [E('crescent-moon', 62, 34, 40), E('rocket', 28, 58, 28, { r: -10 }), E('star', 84, 74, 12)], 'night'),
    ],
  },
  {
    id: 'bread',
    zh: '麵包',
    bg: 'grass',
    steps: [
      step('the wheat grows tall.', [E('sheaf-of-rice', 50, 52, 60)]),
      step('bake it in the oven.', [D('oven', 50, 56, 66)], 'kitchen'),
      step('fresh bread! Yum!', [E('bread', 50, 56, 56)], 'kitchen'),
    ],
  },
  {
    id: 'carrot',
    zh: '種紅蘿蔔',
    bg: 'grass',
    steps: [
      step('plant a little seed.', [D('mound', 50, 80, 60), E('chestnut', 50, 66, 14)]),
      step('green leaves grow.', [D('mound', 50, 80, 60), E('herb', 50, 56, 32)]),
      step('pull up a big carrot!', [E('carrot', 50, 48, 58, { r: -30 }), D('mound', 50, 86, 40)]),
    ],
  },
  {
    id: 'puppy',
    zh: '幫小狗洗澡',
    bg: 'grass',
    steps: [
      step('the puppy is muddy.', [D('puddle', 50, 84, 60, '#8A5A36'), E('dog', 50, 58, 56), D('mud', 50, 62, 56)]),
      step('bubble bath time!', [E('dog', 50, 58, 56), D('mud', 50, 62, 56), D('bubbles', 50, 36, 46)]),
      step('a clean, happy puppy!', [E('dog', 50, 58, 56), E('sparkles', 78, 24, 22)]),
    ],
  },
  {
    id: 'icecream',
    zh: '冰淇淋融化',
    bg: 'grass',
    steps: [
      step('a cold ice cream.', [E('soft-ice-cream', 50, 52, 56)]),
      step('the sun is so hot!', [E('soft-ice-cream', 46, 56, 50), E('sun', 78, 20, 30), E('droplet', 34, 50, 10)]),
      step('oops, it melted!', [D('puddle', 50, 76, 60, '#F5D9E4'), E('soft-ice-cream', 50, 62, 30, { r: 120 })]),
    ],
  },
]

export const STORIES: Story[] = [...FOUR, ...THREE]
export const storyOf = (id: string) => STORIES.find((s) => s.id === id) ?? null

/** 這個故事排 n 張時的那幾張（原本的第幾張） */
export function stepsFor(s: Story, n: 3 | 4): number[] {
  const all = s.steps.map((_, i) => i)
  if (n === 4) return s.steps.length >= 4 ? all.slice(0, 4) : []
  if (s.steps.length === 3) return all
  const drop = s.drop ?? 1
  return all.filter((i) => i !== drop).slice(0, 3)
}

/** 所有用得到的 emoji（scripts/build-lang-emoji.ts） */
export const ORDER_EMOJI = [...new Set(STORIES.flatMap((s) => s.steps.flatMap((p) => p.pic.map((b) => ('e' in b ? b.e : null)).filter((e): e is string => !!e))))]
