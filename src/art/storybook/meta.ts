// 故事插畫的角色庫清單（T-119）：每個角色、東西的大小、姿勢、念到哪些字會跳一下。只有資料，不畫圖（畫在 ./library.tsx），
// 所以 scripts/check-story.ts 在 node 裡也讀得到。新增一個角色：這裡登記一筆，./library.tsx 畫一個。

/** 角色（有臉、會跳一下，一頁最多 3 個）或東西（道具、車子、房子） */
export type Kind = 'char' | 'thing'
/** 站在哪裡：地上、水裡（海的場景）、天上 */
export type Zone = 'ground' | 'water' | 'sky'

export interface Item {
  kind: Kind
  /** 中文名字（審稿頁、設定稿看的） */
  zh: string
  /** 姿勢 → 這個姿勢畫的大小（自己的 viewBox，腳底在下緣中間） */
  poses: Record<string, { w: number; h: number }>
  /** 念到這些字（小寫、去掉複數 s）時跳一下 */
  words: string[]
  zone?: Zone
  /** 可以放一個小東西在上面的位置（蛋坐公車、蛋在籃子裡）：自己座標裡的 x、y（那個小東西的腳底） */
  seat?: [number, number]
  /** 對應的 Fluent Emoji 名字（舊劇本的 pic 寫這些名字時，自動換成這個角色） */
  emoji?: string[]
}

const one = (w: number, h: number) => ({ stand: { w, h } })

export const ITEMS: Record<string, Item> = {
  // ── 三隻恐龍（art/Dino.tsx 同一份圖）和彩虹蛋 ──
  dodo: { kind: 'char', zh: '豆豆', poses: { stand: { w: 230, h: 210 }, cheer: { w: 230, h: 210 }, sleep: { w: 230, h: 210 } }, words: ['dodo'] },
  bobo: { kind: 'char', zh: '波波', poses: { stand: { w: 258, h: 210 }, cheer: { w: 258, h: 210 }, sleep: { w: 258, h: 210 } }, words: ['bobo'] },
  momo: { kind: 'char', zh: '莫莫', poses: { stand: { w: 236, h: 240 }, cheer: { w: 236, h: 240 }, sleep: { w: 236, h: 240 } }, words: ['momo'] },
  egg: { kind: 'char', zh: '彩虹蛋', poses: { stand: { w: 200, h: 240 }, sleep: { w: 260, h: 240 } }, words: ['egg'], emoji: ['@rainbow-egg'] },
  // ── 故事裡的動物 ──
  rabbit: { kind: 'char', zh: '兔子', poses: { stand: { w: 200, h: 250 }, run: { w: 280, h: 200 }, sleep: { w: 260, h: 170 } }, words: ['rabbit'], emoji: ['rabbit', 'rabbit-face'] },
  turtle: { kind: 'char', zh: '烏龜', poses: { walk: { w: 300, h: 190 }, cheer: { w: 300, h: 200 } }, words: ['turtle'], emoji: ['turtle'] },
  elephant: { kind: 'char', zh: '大象', poses: one(270, 220), words: ['elephant'], emoji: ['elephant'] },
  giraffe: { kind: 'char', zh: '長頸鹿', poses: one(230, 330), words: ['giraffe'], emoji: ['giraffe'] },
  zebra: { kind: 'char', zh: '斑馬', poses: one(260, 220), words: ['zebra', 'stripe'], emoji: ['zebra'] },
  lion: { kind: 'char', zh: '獅子', poses: one(260, 220), words: ['lion', 'roar'], emoji: ['lion'] },
  monkey: { kind: 'char', zh: '猴子', poses: one(200, 230), words: ['monkey'], emoji: ['monkey'] },
  cow: { kind: 'char', zh: '牛', poses: one(270, 220), words: ['cow', 'moo'], emoji: ['cow', 'cow-face'] },
  sheep: { kind: 'char', zh: '綿羊', poses: one(250, 200), words: ['sheep', 'baa', 'wool'], emoji: ['ewe', 'sheep'] },
  pig: { kind: 'char', zh: '豬', poses: one(250, 190), words: ['pig', 'oink'], emoji: ['pig', 'pig-face'] },
  chicken: { kind: 'char', zh: '公雞', poses: one(200, 220), words: ['chicken', 'cock-a-doodle-doo'], emoji: ['chicken', 'rooster'] },
  cat: { kind: 'char', zh: '貓', poses: one(200, 210), words: ['cat', 'meow'], emoji: ['cat', 'cat-face'] },
  frog: { kind: 'char', zh: '青蛙', poses: one(210, 170), words: ['frog', 'ribbit'], emoji: ['frog'] },
  snail: { kind: 'char', zh: '蝸牛', poses: one(240, 170), words: ['snail'], emoji: ['snail'] },
  fish: { kind: 'char', zh: '魚', poses: one(220, 150), words: ['fish'], zone: 'water', emoji: ['tropical-fish', 'fish'] },
  octopus: { kind: 'char', zh: '章魚', poses: one(220, 220), words: ['octopus'], zone: 'water', emoji: ['octopus'] },
  whale: { kind: 'char', zh: '鯨魚', poses: one(330, 230), words: ['whale', 'splash'], zone: 'water', emoji: ['spouting-whale', 'whale'] },
  butterfly: { kind: 'char', zh: '蝴蝶', poses: one(180, 150), words: ['butterfly'], zone: 'sky', emoji: ['butterfly'] },
  bird: { kind: 'char', zh: '小鳥', poses: one(160, 140), words: ['bird'], emoji: ['bird'] },
  dove: { kind: 'char', zh: '鴿子', poses: { fly: { w: 240, h: 170 }, leaf: { w: 240, h: 170 } }, words: ['dove'], zone: 'sky', emoji: ['dove'] },
  sauropod: { kind: 'char', zh: '長脖子恐龍', poses: one(300, 300), words: ['dinosaur'], emoji: ['sauropod'] },
  trex: { kind: 'char', zh: '暴龍', poses: one(260, 260), words: ['t-rex', 'rawr'], emoji: ['t-rex'] },
  teddy: { kind: 'char', zh: '泰迪熊', poses: one(190, 210), words: ['teddy', 'bear'], emoji: ['teddy-bear'] },
  // ── 東西 ──
  tree: { kind: 'thing', zh: '大樹', poses: one(330, 300), words: ['tree'], emoji: ['deciduous-tree'] },
  seedling: { kind: 'thing', zh: '小樹苗', poses: one(150, 150), words: ['tree', 'growing'], emoji: ['seedling'] },
  banner: { kind: 'thing', zh: '起點終點的拱門', poses: one(300, 290), words: [], emoji: ['chequered-flag'] },
  trophy: { kind: 'thing', zh: '獎盃', poses: one(150, 180), words: ['win'], emoji: ['trophy'] },
  ark: { kind: 'thing', zh: '方舟', poses: { stand: { w: 420, h: 290 }, full: { w: 420, h: 330 } }, words: ['boat', 'ark'], emoji: ['@ark', '@ark-full'] },
  hammer: { kind: 'thing', zh: '槌子', poses: one(180, 160), words: ['hammer', 'bang'], emoji: ['hammer'] },
  planks: { kind: 'thing', zh: '木板', poses: one(240, 120), words: ['wood'], emoji: ['wood'] },
  apples: { kind: 'thing', zh: '蘋果', poses: one(210, 140), words: ['apple'], emoji: ['red-apple', 'green-apple'] },
  'book-open': { kind: 'thing', zh: '打開的書', poses: one(300, 200), words: ['book', 'story'], emoji: ['open-book'] },
  'book-closed': { kind: 'thing', zh: '闔上的書', poses: one(220, 200), words: ['book', 'end'], emoji: ['closed-book'] },
  door: { kind: 'thing', zh: '魔法門', poses: one(200, 300), words: ['door', 'open'], emoji: ['door'] },
  house: { kind: 'thing', zh: '魔法屋', poses: one(340, 320), words: ['house', 'home'], emoji: ['house-with-garden'] },
  bed: { kind: 'thing', zh: '床', poses: one(300, 190), words: ['bed', 'yawn'], seat: [150, 92], emoji: ['bed'] },
  yarn: { kind: 'thing', zh: '毛線球', poses: one(150, 130), words: ['wool'], emoji: ['yarn'] },
  blanket: { kind: 'thing', zh: '毯子', poses: one(280, 150), words: ['blanket', 'wrap'], seat: [140, 120], emoji: ['@blanket'] },
  basket: { kind: 'thing', zh: '籃子', poses: { stand: { w: 240, h: 170 }, full: { w: 240, h: 190 } }, words: ['basket', 'full'], seat: [120, 96], emoji: ['basket'] },
  nest: { kind: 'thing', zh: '蛋窩', poses: one(320, 260), words: ['bed', 'nest'], emoji: ['@egg-nest'] },
  'dino-nest': { kind: 'thing', zh: '恐龍蛋窩', poses: one(280, 170), words: ['egg', 'nest'], emoji: ['nest-with-eggs'] },
  bus: { kind: 'thing', zh: '公車', poses: one(380, 230), words: ['bus'], seat: [118, 110], emoji: ['bus', 'oncoming-bus'] },
  'bus-stop': { kind: 'thing', zh: '公車站牌', poses: one(130, 300), words: ['stop'], emoji: ['bus-stop'] },
  'traffic-light': { kind: 'thing', zh: '紅綠燈', poses: one(120, 320), words: ['light', 'go', 'wait'], emoji: ['vertical-traffic-light'] },
  bridge: { kind: 'thing', zh: '大橋', poses: one(620, 260), words: ['bridge'], emoji: ['bridge-at-night'] },
  footprints: { kind: 'thing', zh: '大腳印', poses: one(320, 120), words: ['feet', 'stomp'], emoji: ['footprints'] },
  volcano: { kind: 'thing', zh: '火山', poses: one(380, 300), words: ['volcano', 'puff'], emoji: ['volcano'] },
  tractor: { kind: 'thing', zh: '拖拉機', poses: one(320, 240), words: ['tractor'], emoji: ['tractor'] },
  'fire-truck': { kind: 'thing', zh: '消防車', poses: one(400, 230), words: ['fire', 'truck', 'wee-oo'], emoji: ['fire-engine'] },
  'police-car': { kind: 'thing', zh: '警車', poses: one(320, 180), words: ['police', 'car'], emoji: ['police-car'] },
  ladder: { kind: 'thing', zh: '梯子', poses: one(140, 330), words: ['ladder', 'up'], emoji: ['ladder'] },
  water: { kind: 'thing', zh: '噴水', poses: one(240, 200), words: ['water', 'splash'], emoji: ['droplet'] },
  sailboat: { kind: 'thing', zh: '小帆船', poses: one(300, 300), words: ['boat', 'sail', 'bob'], emoji: ['sailboat'] },
  'beach-umbrella': { kind: 'thing', zh: '海灘陽傘', poses: one(260, 300), words: ['beach'], emoji: ['beach-with-umbrella'] },
  umbrella: { kind: 'thing', zh: '雨傘', poses: one(240, 280), words: ['umbrella'], emoji: ['umbrella', 'umbrella-with-rain-drops'] },
  banana: { kind: 'thing', zh: '香蕉', poses: one(200, 150), words: ['banana'], emoji: ['banana'] },
  grapes: { kind: 'thing', zh: '葡萄', poses: one(150, 200), words: ['grape'], emoji: ['grapes'] },
  watermelon: { kind: 'thing', zh: '西瓜', poses: one(260, 190), words: ['watermelon'], emoji: ['watermelon'] },
  blocks: { kind: 'thing', zh: '積木磚塊', poses: one(240, 170), words: ['block'], emoji: ['brick'] },
  truck: { kind: 'thing', zh: '大卡車', poses: one(380, 230), words: ['truck', 'beep'], emoji: ['delivery-truck'] },
  cone: { kind: 'thing', zh: '三角錐', poses: one(130, 160), words: ['go'], emoji: ['construction'] },
  frame: { kind: 'thing', zh: '蓋到一半的房子', poses: one(320, 300), words: ['done', 'almost'], emoji: ['house'] },
  'new-house': { kind: 'thing', zh: '蓋好的房子', poses: one(320, 300), words: ['house'], emoji: [] },
  bathtub: { kind: 'thing', zh: '浴缸', poses: one(320, 200), words: ['bath', 'splash'], emoji: ['bathtub'] },
  toothbrush: { kind: 'thing', zh: '牙刷', poses: one(260, 140), words: ['brush'], emoji: ['toothbrush'] },
  gift: { kind: 'thing', zh: '禮物', poses: one(200, 210), words: ['present', 'gift'], emoji: ['wrapped-gift'] },
  balloons: { kind: 'thing', zh: '氣球', poses: one(220, 330), words: ['balloon'], emoji: ['balloon'] },
  cake: { kind: 'thing', zh: '蛋糕', poses: one(240, 220), words: ['cake'], emoji: ['birthday-cake'] },
  confetti: { kind: 'thing', zh: '拉炮', poses: one(240, 240), words: ['pop', 'party'], emoji: ['party-popper'] },
  kite: { kind: 'thing', zh: '風箏', poses: one(200, 240), words: ['kite', 'up'], zone: 'sky', emoji: ['kite'] },
  sandwich: { kind: 'thing', zh: '三明治', poses: one(220, 150), words: ['sandwich'], emoji: ['sandwich'] },
  'picnic-blanket': { kind: 'thing', zh: '野餐墊', poses: one(360, 130), words: ['picnic'], emoji: [] },
  // 天上的東西（zone: sky，不佔地上的位置）
  sun: { kind: 'thing', zh: '太陽', poses: { stand: { w: 150, h: 150 }, face: { w: 170, h: 170 } }, words: ['sun', 'warm'], zone: 'sky', emoji: ['sun', 'sun-with-face'] },
  moon: { kind: 'thing', zh: '月亮', poses: one(150, 150), words: ['moon'], zone: 'sky', emoji: ['crescent-moon', 'full-moon'] },
  rainbow: { kind: 'thing', zh: '彩虹', poses: one(520, 270), words: ['rainbow'], zone: 'sky', emoji: ['rainbow'] },
  raincloud: { kind: 'thing', zh: '雨雲', poses: one(300, 210), words: ['cloud', 'rain', 'drip'], zone: 'sky', emoji: ['cloud-with-rain', 'cloud'] },
}

export const itemOf = (id: string): Item | null => ITEMS[id] ?? null
export const poseOf = (id: string, pose?: string) => {
  const it = ITEMS[id]
  if (!it) return null
  const name = pose && it.poses[pose] ? pose : Object.keys(it.poses)[0]
  return { name, box: it.poses[name] }
}

/** Fluent Emoji 名字（含 @ 自己畫的）→ 角色庫的 id：舊劇本只寫 pic 時用 */
export const BY_EMOJI: Record<string, string> = Object.fromEntries(Object.entries(ITEMS).flatMap(([id, it]) => [[id, id], ...(it.emoji ?? []).map((e) => [e, id])]))
