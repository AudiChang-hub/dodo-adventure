// 拼圖組合圖的版型（T-159 第二版）：給 scripts/gen-puzzle-pics.mjs 用，產生一堆候選圖，再用像素比對挑出每一片都看得出東西、而且彼此不一樣的。
// 12 種版型輪流：大主角、兩個一起玩、近大遠小、斜坡滾下來、湖邊倒影、室內、夜空、水底、雪地、花園、街上、海邊。
// 每一種版型的背景零件（山、樓、雲、星星、窗戶、家具…）、天空、地面都跟著亂數變，同一個版型的兩張也不會長一樣。
import type { Deco, FreeArt, FreeItem, Sky } from '../src/games/puzzle/free'
import { slopeY } from '../src/games/puzzle/free'

export interface Cand {
  id: string
  zh: string
  en: string
  free: FreeArt
}

/** 角色、東西：who|英文|中文；* 開頭是動物（有臉的角色，一張最多 3 個）。Fluent Emoji 只有頭的（熊、無尾熊、熊貓、狐狸、狼、獨角獸）不用：大大一張臉不像一隻動物 */
type P = { who: string; en: string; zh: string; char: boolean }
const P = (s: string): P => {
  const char = s.startsWith('*')
  const [who, en, zh] = (char ? s.slice(1) : s).split('|')
  return { who, en, zh, char }
}
const L = (...s: string[]) => s.map(P)

const DINO = L('*dodo|Dodo|豆豆', '*momo|Momo|莫莫', '*bobo|Bobo|波波')
const LAND = L('*lion|lion|獅子', '*zebra|zebra|斑馬', '*giraffe|giraffe|長頸鹿', '*elephant|elephant|大象', '*monkey|monkey|猴子', '*cow|cow|牛', '*sheep|sheep|綿羊', '*pig|pig|豬', '*chicken|chicken|公雞', '*cat|cat|貓', '*frog|frog|青蛙', '*rabbit|rabbit|兔子', '*kangaroo|kangaroo|袋鼠', '*duck|duck|鴨子', '*deer|deer|鹿', '*hedgehog|hedgehog|刺蝟', '*horse|horse|馬', '*goat|goat|山羊', '*hippopotamus|hippo|河馬', '*gorilla|gorilla|大猩猩', '*teddy|teddy|泰迪熊', '*sauropod|dinosaur|長脖子恐龍', '*trex|T-rex|暴龍')
const SMALL = L('*snail|snail|蝸牛', '*hedgehog|hedgehog|刺蝟', '*frog|frog|青蛙', '*duck|duck|鴨子', '*rabbit|rabbit|兔子', '*cat|cat|貓', '*chicken|chicken|公雞', '*front-facing-baby-chick|chick|小雞', '*lady-beetle|ladybug|瓢蟲', '*turtle|turtle|烏龜')
const NIGHT = L('*owl|owl|貓頭鷹', '*cat|cat|貓', '*teddy|teddy|泰迪熊', '*rabbit|rabbit|兔子', '*hedgehog|hedgehog|刺蝟')
const SEA = L('*fish|fish|魚', '*octopus|octopus|章魚', '*whale|whale|鯨魚', '*dolphin|dolphin|海豚', '*jellyfish|jellyfish|水母', '*crab|crab|螃蟹', '*turtle|turtle|烏龜', '*tropical-fish|fish|熱帶魚')
const COLD = L('*penguin|penguin|企鵝', '*deer|deer|鹿', '*rabbit|rabbit|兔子', '*goat|goat|山羊')
const BALLS = L('soccer-ball|ball|足球', 'basketball|ball|籃球')
const FOOD = L('apples|apples|蘋果', 'banana|banana|香蕉', 'grapes|grapes|葡萄', 'watermelon|watermelon|西瓜', 'strawberry|strawberries|草莓', 'cherries|cherries|櫻桃', 'pear|pears|西洋梨', 'peach|peaches|桃子', 'carrot|carrots|紅蘿蔔', 'cake|cake|蛋糕', 'cupcake|cupcakes|杯子蛋糕', 'pizza|pizza|披薩', 'doughnut|donuts|甜甜圈', 'cookie|cookies|餅乾', 'bread|bread|麵包', 'sandwich|sandwich|三明治')
const ROLL = L('soccer-ball|ball|足球', 'basketball|ball|籃球', 'apples|apple|蘋果', 'watermelon|watermelon|西瓜', 'tangerine|orange|橘子', 'yarn|yarn|毛線球', 'wheel|wheel|輪子')
const TOYS = L('blocks|blocks|積木', 'drum|drum|鼓', 'robot|robot|機器人', 'yo-yo|yo-yo|溜溜球', 'soccer-ball|ball|足球', 'puzzle-piece|puzzle|拼圖', 'book-open|book|書', 'violin|violin|小提琴', 'game-die|dice|骰子', 'teddy|teddy|泰迪熊', 'crayon|crayon|蠟筆', 'abacus|abacus|算盤')
const CARS = L('bus|bus|公車', 'fire-truck|fire truck|消防車', 'police-car|police car|警車', 'truck|truck|卡車', 'taxi|taxi|計程車', 'automobile|car|汽車', 'ambulance|ambulance|救護車', 'racing-car|race car|賽車', 'tractor|tractor|拖拉機', 'motor-scooter|scooter|機車', 'bicycle|bike|腳踏車', 'minibus|van|小巴士')
const FLOWERS = L('tulip|tulip|鬱金香', 'sunflower|sunflower|向日葵', 'blossom|flower|花', 'mushroom|mushroom|香菇')
const BEACHY = L('ice-cream|ice cream|冰淇淋', 'watermelon|watermelon|西瓜', 'beach-umbrella|umbrella|陽傘', 'soccer-ball|ball|足球', '*crab|crab|螃蟹', 'sailboat|boat|帆船')

type Rnd = () => number
const pick = <T,>(r: Rnd, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length]
const between = (r: Rnd, a: number, b: number) => a + (b - a) * r()
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1)
/** 「豆豆」「牛」：句子裡的名字（恐龍是名字，動物前面加 the） */
const nm = (p: P) => (/^[A-Z]/.test(p.en) && p.char ? p.en : `the ${p.en}`)
const it = (p: P, x: number, y: number, h: number, o: Partial<FreeItem> = {}): FreeItem => ({ who: p.who, x, y, h, ...o })
const words = (s: string) => s.split(/\s+/).length

function clouds(r: Rnd, xs: number[], y0 = 60, y1 = 140): Deco[] {
  return xs.map((x) => ({ t: 'cloud', x: x + between(r, -30, 30), y: between(r, y0, y1), k: between(r, 0.8, 1.25) }))
}
function stars(r: Rnd, n: number, x0: number, x1: number, y0: number, y1: number): Deco[] {
  return Array.from({ length: n }, (_, i) => ({ t: 'star', x: x0 + ((x1 - x0) * (i + between(r, 0.15, 0.85))) / n, y: between(r, y0, y1), r: between(r, 12, 22) }))
}
const HILL = ['#BFD7A2', '#C9DDB0', '#B5D2A0']
const GRASS = { fill: '#CFE3B5', stroke: '#9FBF86' }
const BLD = ['#E6D6E8', '#D8E7F5', '#F4E0C4', '#DCEBD6', '#F2D4CC']
const WALL = ['#F3EAD8', '#E7E3F2', '#E3EEE4', '#F7E8D8', '#E8EEF6']
const FLOOR = ['#E3CFA8', '#E8D3A8', '#D9C3A0']
const RUG = ['#EBC9B8', '#D8CCE6', '#CFE3D6', '#F2DDB0']

/** 天上的東西（y 是最上緣附近，從上面往下畫）：太陽、鳥、彩虹、蝴蝶、風箏、飛機、直升機、氣球、鴿子輪流，不固定 */
const SKIES = ['sun', 'bird', 'rainbow', 'butterfly', 'kite', 'airplane', 'helicopter', 'balloons', 'dove'] as const
function skyOne(r: Rnd, x: number, y: number, name: (typeof SKIES)[number]): FreeItem {
  switch (name) {
    case 'sun':
      return { who: 'sun', x, y: y + 175, h: 150, pose: r() < 0.5 ? 'face' : undefined }
    case 'bird':
      return { who: 'bird', x, y: y + 150, h: 120, flip: r() < 0.5 }
    case 'rainbow':
      return { who: 'rainbow', x, y: y + 175, h: 150 }
    case 'butterfly':
      return { who: 'butterfly', x, y: y + 160, h: 130 }
    case 'kite':
      return { who: 'kite', x, y: y + 220, h: 200 }
    case 'airplane':
      return { who: 'airplane', x, y: y + 170, h: 140, flip: r() < 0.5 }
    case 'helicopter':
      return { who: 'helicopter', x, y: y + 170, h: 140, flip: r() < 0.5 }
    case 'balloons':
      return { who: 'balloons', x, y: y + 230, h: 210 }
    case 'dove':
      return { who: 'dove', x, y: y + 150, h: 120, pose: 'fly', flip: r() < 0.5 }
  }
}
/** 一個天上的東西 */
function skyThing(r: Rnd, x: number, y: number): { items: FreeItem[]; deco: Deco[]; name: string } {
  const name = pick(r, SKIES)
  return { items: [skyOne(r, x, y, name)], deco: [], name }
}
/** 幾個位置各放一樣天上的東西，彼此不一樣 */
function skies(r: Rnd, xs: number[]): FreeItem[] {
  const left = [...SKIES]
  return xs.map((x) => {
    const name = left.splice(Math.floor(r() * left.length) % left.length, 1)[0]
    return skyOne(r, x, 0, name)
  })
}

export type Tpl = (r: Rnd) => Cand | null

/** 1 大主角：一隻大大的佔畫面 2/3，另一邊遠遠的山或樓，和一隻小的 */
const big: Tpl = (r) => {
  const A = pick(r, [...LAND, ...DINO])
  const B = pick(r, SMALL)
  if (A.who === B.who) return null
  const left = r() < 0.5
  const ax = left ? 420 : 540
  const ox = left ? 800 : 160
  const v = Math.floor(r() * 3)
  const deco: Deco[] =
    v === 0
      ? [{ t: 'mountain', x: ox, w: 360, h: 300, base: 420, snow: r() < 0.5 }, { t: 'mountain', x: ox + (left ? -130 : 130), w: 260, h: 190, base: 420 }]
      : v === 1
        ? [{ t: 'building', x: ox - 70, w: 120, top: between(r, 90, 150), base: 430, fill: pick(r, BLD) }, { t: 'building', x: ox + 70, w: 120, top: between(r, 160, 220), base: 430, fill: pick(r, BLD) }]
        : [{ t: 'hill', x: ox, w: 420, h: 150, base: 430, fill: pick(r, HILL) }]
  const s = { items: skies(r, [ox, left ? 90 : 870]), deco: [] as Deco[] }
  const items: FreeItem[] = [it(A, ax, 590, 490, { flip: !left }), it(B, ox, 560, 150, { flip: left }), ...s.items]
  if (v === 2) items.push({ who: 'tree', x: ox, y: 430, h: 230 })
  const en = `Big ${A.char && /^[A-Z]/.test(A.en) ? A.en : A.en}, little ${B.en}!`
  return { id: `big-${slug(A.en)}-${slug(B.en)}`, zh: `大大的${A.zh}、小小的${B.zh}`, en: cap1(en), free: { kind: 'big', sky: r() < 0.25 ? 'dusk' : 'day', ground: { t: 'flat', y: 430, ...GRASS }, deco: [...deco, ...s.deco], items } }
}

/** 2 兩個一起玩：面對面，中間丟一顆球（或一起分吃的東西）。背景四種：公園、山邊、城市、家裡 */
const play: Tpl = (r) => {
  const A = pick(r, [...DINO, ...LAND])
  const B = pick(r, [...LAND, ...DINO])
  if (A.who === B.who) return null
  const ball = r() < 0.55
  const T = ball ? pick(r, BALLS) : pick(r, FOOD)
  const v = Math.floor(r() * 4)
  const items: FreeItem[] = [it(A, 200, 560, 300), it(B, 760, 560, 300, { flip: true })]
  if (ball) items.push(it(T, 480, between(r, 300, 360), 120))
  else items.push(it(T, 480, 540, 150))
  let deco: Deco[] = []
  let ground: FreeArt['ground'] = { t: 'flat', y: 440, ...GRASS }
  let sky: Sky = 'day'
  if (v === 0) {
    deco = [{ t: 'cloud', x: between(r, 200, 260), y: 70, k: 0.9 }, { t: 'fence', x0: 20, x1: 940, base: 440 }]
    items.push({ who: 'tree', x: 70, y: 440, h: 280 }, { who: 'sun', x: 860, y: 180, h: 150, pose: r() < 0.5 ? 'face' : undefined })
  } else if (v === 1) {
    deco = [{ t: 'mountain', x: 130, w: 380, h: 330, base: 440, snow: true }, { t: 'mountain', x: 840, w: 340, h: 260, base: 440 }, { t: 'flower', x: 330, base: 470, fill: '#F2A9C0' }, { t: 'flower', x: 640, base: 480, fill: '#F6DE96' }]
    sky = r() < 0.5 ? 'dusk' : 'day'
  } else if (v === 2) {
    deco = [{ t: 'building', x: 80, w: 150, top: between(r, 50, 100), base: 450, fill: pick(r, BLD) }, { t: 'building', x: 880, w: 150, top: between(r, 50, 100), base: 450, fill: pick(r, BLD) }, { t: 'building', x: 300, w: 140, top: between(r, 250, 290), base: 450, fill: pick(r, BLD) }, { t: 'building', x: 660, w: 140, top: between(r, 250, 290), base: 450, fill: pick(r, BLD) }]
    ground = { t: 'flat', y: 450, fill: '#D9D2C6', stroke: '#C2BAAE' }
  } else {
    deco = [{ t: 'window', x: 150, y: 60, w: 220, h: 170, view: r() < 0.3 ? 'night' : 'day' }, { t: 'frame', x: 480, y: 50, w: 170, h: 120 }, { t: 'shelf', x: 810, y: 200, w: 240 }, { t: 'rug', x: 480, y: 540, w: 520, fill: pick(r, RUG) }]
    ground = { t: 'floor', y: 470, wall: pick(r, WALL), floor: pick(r, FLOOR) }
  }
  if (!ball && v !== 3) deco.push({ t: 'rug', x: 480, y: 530, w: 360, fill: pick(r, RUG) })
  if (v !== 3) {
    const s = skyThing(r, 480, 0)
    if (s.name === 'sun' && v === 0) return null
    items.push(...s.items)
    deco.push(...s.deco)
  }
  const en = ball ? `${cap1(nm(A))} and ${nm(B)} play ball!` : `${cap1(nm(A))} and ${nm(B)} share ${T.en}!`
  if (words(en) > 6) return null
  return { id: `play-${slug(A.en)}-${slug(B.en)}-${slug(T.en)}`, zh: `${A.zh}和${B.zh}${ball ? '玩球' : `一起吃${T.zh}`}`, en, free: { kind: 'play', sky, ground, deco, items } }
}

/** 3 近大遠小：近的大大一隻在前面，遠的小小的在山坡上。遠方三種：雪山、城市、樹林 */
const far: Tpl = (r) => {
  const A = pick(r, [...LAND, ...DINO])
  const C = pick(r, [...LAND, ...SMALL])
  if (A.who === C.who) return null
  const left = r() < 0.5
  const ax = left ? 240 : 720
  const cx = left ? 760 : 200
  const v = Math.floor(r() * 3)
  const deco: Deco[] = [{ t: 'hill', x: cx, w: 460, h: 70, base: 330, fill: pick(r, HILL) }, { t: 'path', x0: left ? 380 : 140, x1: left ? 820 : 580, y: 420 }]
  const items: FreeItem[] = [it(A, ax, 590, 380, { flip: !left }), it(C, cx, 330, 110, { flip: left })]
  if (v === 0) {
    deco.unshift({ t: 'mountain', x: cx + (left ? 60 : -60), w: 380, h: 300, base: 300, snow: r() < 0.5 })
    items.push({ who: 'tree', x: 480 + (left ? 30 : -30), y: 370, h: 150 })
  } else if (v === 1) {
    for (let i = 0; i < 4; i++) deco.unshift({ t: 'building', x: (left ? 560 : 70) + i * 105, w: 90, top: between(r, 120, 220), base: 320, fill: pick(r, BLD) })
    items.push({ who: 'bus', x: 480, y: 380, h: 90, flip: left })
  } else {
    for (let i = 0; i < 4; i++) items.push({ who: pick(r, ['tree', 'evergreen-tree']), x: (left ? 560 : 90) + i * 100, y: 310 + (i % 2) * 14, h: between(r, 150, 220) })
  }
  const sk = skies(r, [480, left ? 90 : 870, cx])
  items.push(...(v === 0 ? sk : sk.slice(0, 2)))
  items.push({ who: pick(r, ['rock', 'mushroom', 'sunflower', 'tulip']), x: left ? 840 : 120, y: 600, h: 170 })
  const en = `${cap1(A.en)} is near, ${C.en} is far!`
  if (words(en) > 6) return null
  return { id: `far-${slug(A.en)}-${slug(C.en)}`, zh: `近的${A.zh}、遠的${C.zh}`, en, free: { kind: 'far', sky: r() < 0.3 ? 'dusk' : 'day', ground: { t: 'flat', y: 320, ...GRASS }, deco, items } }
}

/** 4 斜坡：左高右低，一樣圓圓的東西滾下來，上面一隻、下面一隻 */
const hill: Tpl = (r) => {
  const A = pick(r, [...DINO, ...SMALL])
  const B = pick(r, [...LAND, ...DINO])
  const X = pick(r, ROLL)
  if (A.who === B.who) return null
  const g = { y0: between(r, 210, 250), y1: between(r, 520, 560) }
  const v = Math.floor(r() * 3)
  const fill = ['#C9DFAE', '#FBF8F2', '#EAD9A6'][v]
  const stroke = ['#9FBF86', '#B9C9D3', '#C9AE6E'][v]
  const deco: Deco[] = [
    { t: 'flower', x: 360, base: slopeY(g, 360) + 6, fill: '#F2A9C0' },
    { t: 'flower', x: 600, base: slopeY(g, 600) + 6, fill: '#F6DE96' },
    ...clouds(r, [560, 820], 50, 110),
  ]
  const items: FreeItem[] = [
    it(A, 170, slopeY(g, 170) + 6, 210),
    { who: v === 1 ? 'evergreen-tree' : 'tree', x: 330, y: slopeY(g, 330) + 4, h: 200 },
    it(X, 520, slopeY(g, 520) + 4, 120, { rot: 20 }),
    it(B, 800, slopeY(g, 800) + 30, 250, { flip: true }),
    ...skyThing(r, 800, 20).items,
    it(pick(r, FLOWERS), 110, 600, 190),
    { who: pick(r, ['rock', 'mushroom', 'seedling']), x: 420, y: 600, h: 140 },
  ]
  const en = `The ${X.en} rolls down the hill!`
  if (words(en) > 6) return null
  return { id: `hill-${slug(X.en)}-${slug(A.en)}-${slug(B.en)}`, zh: `${X.zh}滾下山坡`, en, free: { kind: 'hill', sky: v === 2 ? 'dusk' : 'day', ground: { t: 'slope', ...g, fill, stroke }, deco, items } }
}

/** 5 湖邊倒影：岸上的動物和大樹，水裡有倒影，湖上一隻鴨子或小船 */
const lake: Tpl = (r) => {
  const A = pick(r, [...LAND, ...DINO])
  const W = pick(r, L('*duck|duck|鴨子', 'sailboat|boat|帆船', '*frog|frog|青蛙'))
  if (A.who === W.who) return null
  const left = r() < 0.5
  const y = 370
  const deco: Deco[] = [
    { t: 'mountain', x: left ? 700 : 260, w: 420, h: 230, base: 300, snow: r() < 0.6 },
    { t: 'mountain', x: left ? 470 : 490, w: 260, h: 150, base: 300 },
  ]
  const s = { items: skies(r, [480, left ? 120 : 840]), deco: [] as Deco[] }
  const items: FreeItem[] = [
    it(A, left ? 230 : 730, y, 250, { flip: !left }),
    { who: 'tree', x: left ? 760 : 200, y: y - 4, h: 250 },
    it(W, left ? 520 : 440, 500, 120, { flip: !left }),
    ...s.items,
  ]
  deco.push(...s.deco)
  const en = `${cap1(nm(A))} looks in the lake!`
  if (words(en) > 6) return null
  return { id: `lake-${slug(A.en)}-${slug(W.en)}`, zh: `${A.zh}在湖邊看倒影`, en, free: { kind: 'lake', sky: r() < 0.3 ? 'dusk' : 'day', ground: { t: 'lake', y }, deco, items, mirror: [0, 1] } }
}

/** 6 室內：窗戶、書架、檯燈、畫、地毯，一隻在玩一樣玩具 */
const room: Tpl = (r) => {
  const A = pick(r, [...DINO, ...L('*cat|cat|貓', '*monkey|monkey|猴子', '*rabbit|rabbit|兔子')])
  const T = pick(r, TOYS)
  const B = pick(r, L('*teddy|teddy|泰迪熊', '*cat|cat|貓', '*duck|duck|鴨子', 'yarn|yarn|毛線球', 'gift|present|禮物', 'balloons|balloons|氣球'))
  if (A.who === B.who || T.who === B.who) return null
  const left = r() < 0.5
  const night = r() < 0.35
  const deco: Deco[] = [
    { t: 'window', x: left ? 170 : 790, y: 70, w: 230, h: 190, view: night ? 'night' : 'day' },
    { t: 'frame', x: 480, y: 60, w: 170, h: 120 },
    r() < 0.5 ? { t: 'shelf', x: left ? 790 : 170, y: 190, w: 240 } : { t: 'window', x: left ? 790 : 170, y: 70, w: 190, h: 160, view: night ? 'night' : 'day' },
    { t: 'lamp', x: left ? 900 : 60, base: 470 },
    { t: 'rug', x: 480, y: 540, w: 520, fill: pick(r, RUG) },
  ]
  const items: FreeItem[] = [it(A, left ? 300 : 660, 545, 290, { flip: !left }), it(T, 480, 560, 150), it(B, left ? 720 : 240, 545, 200, { flip: left })]
  const en = `${cap1(nm(A))} plays with the ${T.en}!`
  if (words(en) > 6) return null
  return { id: `room-${slug(A.en)}-${slug(T.en)}-${slug(B.en)}`, zh: `${A.zh}在家玩${T.zh}`, en, free: { kind: 'room', sky: 'day', ground: { t: 'floor', y: 470, wall: pick(r, WALL), floor: pick(r, FLOOR) }, deco, items } }
}

/** 7 夜空：星星、月亮（有時候一顆行星），兩隻在草地上看星星 */
const night: Tpl = (r) => {
  const A = pick(r, [...NIGHT, ...DINO])
  const B = pick(r, NIGHT)
  if (A.who === B.who) return null
  const left = r() < 0.5
  const deco: Deco[] = [...stars(r, 4, 0, 960, 30, 90), ...stars(r, 2, left ? 420 : 40, left ? 920 : 540, 220, 290), { t: 'hill', x: left ? 760 : 200, w: 520, h: 110, base: 440, fill: '#6F8C70' }]
  const items: FreeItem[] = [
    it(A, left ? 250 : 710, 560, 290, { flip: !left }),
    it(B, left ? 720 : 240, 470, 190, { flip: left }),
    { who: 'moon', x: 480 + between(r, -40, 40), y: 210, h: 160 },
    { who: pick(r, ['glowing-star', 'shooting-star']), x: left ? 120 : 840, y: 190, h: 130 },
    { who: pick(r, ['ringed-planet', 'glowing-star', 'rocket']), x: left ? 840 : 120, y: 190, h: 130 },
  ]
  const en = r() < 0.5 ? `${cap1(nm(A))} and ${nm(B)} see stars!` : `Good night, ${A.char && /^[A-Z]/.test(A.en) ? A.en : `little ${A.en}`}!`
  if (words(en) > 6) return null
  return { id: `night-${slug(A.en)}-${slug(B.en)}`, zh: `${A.zh}和${B.zh}看星星`, en, free: { kind: 'night', sky: 'night', ground: { t: 'flat', y: 460, fill: '#7E9C7E', stroke: '#5C7A5E' }, deco, items } }
}

/** 8 水底：海草、泡泡、沙，魚在不同的高度游 */
const under: Tpl = (r) => {
  const A = pick(r, SEA)
  const B = pick(r, SEA)
  const C = pick(r, L('*crab|crab|螃蟹', '*octopus|octopus|章魚', '*turtle|turtle|烏龜'))
  if (A.who === B.who || A.who === C.who || B.who === C.who || A.en === B.en) return null
  const deco: Deco[] = [
    { t: 'seaweed', x: 70, base: 560, h: between(r, 200, 300) },
    { t: 'seaweed', x: 170, base: 560, h: between(r, 130, 190) },
    { t: 'seaweed', x: 640, base: 560, h: between(r, 140, 220) },
    { t: 'bubble', x: between(r, 420, 520), y: 70, r: 22 },
    { t: 'bubble', x: between(r, 460, 540), y: 140, r: 14 },
    { t: 'bubble', x: between(r, 820, 900), y: 60, r: 18 },
  ]
  const items: FreeItem[] = [it(A, 250, between(r, 300, 360), 230), it(B, 700, between(r, 260, 320), 200, { flip: true }), it(C, 470, 580, 150), { who: 'rock', x: 850, y: 580, h: 150 }]
  const en = `${cap1(nm(A))} swims with ${nm(B)}!`
  if (words(en) > 6) return null
  return { id: `under-${slug(A.who)}-${slug(B.who)}-${slug(C.en)}`, zh: `${A.zh}和${B.zh}在水裡游`, en, free: { kind: 'under', sky: 'water', ground: { t: 'seabed', y: 520 }, deco, items } }
}

/** 9 雪地：雪山、松樹，兩個在雪人旁邊玩 */
const snow: Tpl = (r) => {
  const A = pick(r, [...COLD, ...DINO])
  const B = pick(r, COLD)
  if (A.who === B.who) return null
  const left = r() < 0.5
  const deco: Deco[] = [
    { t: 'mountain', x: left ? 720 : 240, w: 440, h: 300, base: 420, snow: true, fill: '#C9D4E3' },
    { t: 'mountain', x: 480, w: 300, h: 190, base: 420, snow: true, fill: '#D3DCE8' },
  ]
  const s = skyThing(r, 480, 0)
  const items: FreeItem[] = [
    ...s.items,
    { who: 'snowflake', x: left ? 140 : 820, y: 180, h: 120 },
    it(A, left ? 230 : 730, 570, 300, { flip: !left }),
    { who: 'snowman', x: 480, y: 560, h: 210 },
    it(B, left ? 770 : 190, 560, 200, { flip: left }),
    { who: 'evergreen-tree', x: left ? 900 : 60, y: 440, h: 230 },
  ]
  deco.push(...s.deco)
  const en = `${cap1(A.en)} and ${B.en} love snow!`
  if (words(en) > 6) return null
  return { id: `snow-${slug(A.en)}-${slug(B.en)}`, zh: `${A.zh}和${B.zh}在雪地玩`, en, free: { kind: 'snow', sky: r() < 0.3 ? 'dusk' : 'day', ground: { t: 'snow', y: 430 }, deco, items } }
}

/** 10 花園：前面大大的花，蜜蜂、蝴蝶在飛，一隻在中間聞花 */
const garden: Tpl = (r) => {
  const A = pick(r, [...DINO, ...SMALL, ...L('*deer|deer|鹿', '*goat|goat|山羊')])
  const F1 = pick(r, FLOWERS)
  const F2 = pick(r, FLOWERS)
  const left = r() < 0.5
  const v = Math.floor(r() * 3)
  const deco: Deco[] = [
    v === 0 ? { t: 'fence', x0: 0, x1: 960, base: 400 } : { t: 'hill', x: left ? 300 : 660, w: 700, h: 60, base: 410, fill: '#A9D3A4' },
    ...clouds(r, [left ? 780 : 180], 50, 90),
    { t: 'flower', x: 400, base: 470, fill: '#F2A9C0' },
    { t: 'flower', x: 560, base: 480, fill: '#B79BCB' },
  ]
  const items: FreeItem[] = [
    it(F1, left ? 120 : 840, 600, 330),
    it(A, 480, 540, 270, { flip: left }),
    it(F2, left ? 830 : 130, 580, 230),
    { who: 'honeybee', x: left ? 300 : 660, y: 200, h: 130, flip: left },
    { who: 'butterfly', x: left ? 720 : 240, y: 170, h: 110 },
    { who: pick(r, ['sun', 'rainbow', 'kite']), x: 480, y: 190, h: 160 },
  ]
  if (v === 2) items.push({ who: 'house', x: left ? 700 : 260, y: 410, h: 200 })
  const en = `${cap1(nm(A))} smells the flowers!`
  if (words(en) > 6) return null
  return { id: `garden-${slug(A.en)}-${slug(F1.en)}-${slug(F2.en)}`, zh: `${A.zh}在花園聞花`, en, free: { kind: 'garden', sky: 'day', ground: { t: 'flat', y: 410, ...GRASS }, deco, items } }
}

/** 11 街上：高高低低的樓，一台車開過來，路邊一隻在等 */
const street: Tpl = (r) => {
  const V = pick(r, CARS)
  const A = pick(r, [...DINO, ...L('*cat|cat|貓', '*duck|duck|鴨子', '*rabbit|rabbit|兔子')])
  const left = r() < 0.5
  const tops = [between(r, 50, 110), between(r, 240, 280), between(r, 230, 270), between(r, 50, 110)]
  const deco: Deco[] = [
    { t: 'building', x: 110, w: 170, top: tops[0], base: 440, fill: pick(r, BLD) },
    { t: 'building', x: 340, w: 170, top: tops[1], base: 440, fill: pick(r, BLD) },
    { t: 'building', x: 600, w: 170, top: tops[2], base: 440, fill: pick(r, BLD) },
    { t: 'building', x: 850, w: 170, top: tops[3], base: 440, fill: pick(r, BLD) },
  ]
  const s = skyThing(r, 480, 0)
  deco.push(...s.deco)
  if (s.name === 'bird') return null
  const items: FreeItem[] = [it(V, left ? 320 : 640, 560, 220, { flip: !left }), it(A, left ? 820 : 140, 540, 220, { flip: left }), ...s.items, { who: 'bird', x: left ? 110 : 850, y: tops[left ? 0 : 3] + 4, h: 90, flip: !left }]
  if (r() < 0.6) items.push({ who: 'traffic-light', x: left ? 640 : 320, y: 470, h: 260 })
  const en = `Here comes the ${V.en}!`
  return { id: `street-${slug(V.en)}-${slug(A.en)}`, zh: `街上的${V.zh}`, en, free: { kind: 'street', sky: r() < 0.25 ? 'dusk' : 'day', ground: { t: 'flat', y: 450, fill: '#D9D2C6', stroke: '#C2BAAE' }, deco, items } }
}

/** 12 海邊：遠遠的海和帆船，沙灘上一隻，旁邊有好吃的、陽傘 */
const beach: Tpl = (r) => {
  const A = pick(r, [...DINO, ...L('*crab|crab|螃蟹', '*turtle|turtle|烏龜', '*penguin|penguin|企鵝', '*monkey|monkey|猴子', '*duck|duck|鴨子')])
  const T = pick(r, BEACHY)
  if (A.who === T.who) return null
  const left = r() < 0.5
  const deco: Deco[] = [{ t: 'hill', x: left ? 860 : 100, w: 300, h: 120, base: 330, fill: '#B5D2A0' }]
  const items: FreeItem[] = [
    it(A, left ? 240 : 720, 560, 280, { flip: !left }),
    it(T, 480, 560, 170),
    { who: 'beach-umbrella', x: left ? 780 : 180, y: 560, h: 330 },
    { who: 'sailboat', x: left ? 560 : 400, y: 380, h: 180 },
    { who: 'bird', x: left ? 850 : 110, y: 170, h: 130, flip: left },
  ]
  items.push(...skies(r, [480, left ? 90 : 870]))
  const en = `${cap1(A.en)} has fun at the beach!`
  if (words(en) > 6) return null
  return { id: `beach-${slug(A.en)}-${slug(T.en)}`, zh: `${A.zh}在海邊玩`, en, free: { kind: 'beach', sky: 'day', ground: { t: 'lake', y: 380 }, deco, items } }
}

export const TEMPLATES: Record<string, { make: Tpl; n: number }> = {
  big: { make: big, n: 14 },
  play: { make: play, n: 16 },
  far: { make: far, n: 14 },
  hill: { make: hill, n: 14 },
  lake: { make: lake, n: 14 },
  room: { make: room, n: 16 },
  night: { make: night, n: 14 },
  under: { make: under, n: 14 },
  snow: { make: snow, n: 10 },
  garden: { make: garden, n: 14 },
  street: { make: street, n: 14 },
  beach: { make: beach, n: 10 },
}

/** 固定的亂數（每次產生的結果一樣） */
export function rng(seed: number): Rnd {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}
