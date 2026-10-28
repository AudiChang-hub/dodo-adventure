// 挑選式貼紙的圖庫（2026-10-28 家長：「貼紙的樣式可以讓他選…歸戶到貼紙本上」）。
// 星星集滿一張卡，就挑一張自己喜歡的貼紙。這裡是貼紙的「主角」（Fluent Emoji）；
// 外框、背景色、花紋、亮面等外觀由 sticker-look.ts 依種子隨機畫，同一個主角換了外觀就是新的一張。
//
// cat 只用來留一點點偏好權重（sticker-pick.ts），孩子端看不到任何分類或系列，也不分頁放。
// 同一個主角可以一再選（家長：Sam 喜歡恐龍，就可以一直選恐龍）。
// 新增主角：加一行就好（en 是點貼紙時念的英文名字，lines-stickers.ts 會自動產生台詞；記得 npm run emoji、npm run audio）。
// 只能往後加，不要刪除或改 id：孩子貼過的貼紙是用 id 存的。

export type ArtCat = 'dino' | 'car' | 'animal' | 'sea' | 'bug' | 'fruit' | 'treat' | 'sky' | 'toy'

export interface ArtDef {
  /** 圖庫 id，也是 Fluent Emoji 的圖示名稱 */
  id: string
  cat: ArtCat
  /** 點貼紙時念的英文名字 */
  en: string
  /** 家長區用的中文名字 */
  zh: string
}

const A = (cat: ArtCat, rows: [string, string, string][]): ArtDef[] => rows.map(([id, en, zh]) => ({ id, cat, en, zh }))

export const STICKER_ART: ArtDef[] = [
  ...A('dino', [
    ['t-rex', 'T. rex!', '暴龍'],
    ['sauropod', 'Long-neck dinosaur!', '長頸龍'],
    ['dragon', 'Dragon!', '龍'],
    ['dragon-face', 'Baby dragon!', '小龍'],
    ['mammoth', 'Mammoth!', '長毛象'],
    ['crocodile', 'Crocodile!', '鱷魚'],
    ['lizard', 'Lizard!', '蜥蜴'],
    ['turtle', 'Turtle!', '烏龜'],
    ['snake', 'Snake!', '蛇'],
  ]),
  ...A('car', [
    ['fire-engine', 'Fire truck!', '消防車'],
    ['police-car', 'Police car!', '警車'],
    ['ambulance', 'Ambulance!', '救護車'],
    ['bus', 'Bus!', '公車'],
    ['racing-car', 'Race car!', '賽車'],
    ['taxi', 'Taxi!', '計程車'],
    ['delivery-truck', 'Truck!', '貨車'],
    ['articulated-lorry', 'Big truck!', '大卡車'],
    ['tractor', 'Tractor!', '拖拉機'],
    ['locomotive', 'Train!', '火車'],
    ['airplane', 'Airplane!', '飛機'],
    ['helicopter', 'Helicopter!', '直升機'],
    ['rocket', 'Rocket!', '火箭'],
    ['sailboat', 'Sailboat!', '帆船'],
    ['bicycle', 'Bike!', '腳踏車'],
    ['motorcycle', 'Motorcycle!', '摩托車'],
  ]),
  ...A('animal', [
    ['lion', 'Lion!', '獅子'],
    ['tiger-face', 'Tiger!', '老虎'],
    ['elephant', 'Elephant!', '大象'],
    ['giraffe', 'Giraffe!', '長頸鹿'],
    ['zebra', 'Zebra!', '斑馬'],
    ['monkey-face', 'Monkey!', '猴子'],
    ['panda', 'Panda!', '熊貓'],
    ['koala', 'Koala!', '無尾熊'],
    ['penguin', 'Penguin!', '企鵝'],
    ['unicorn', 'Unicorn!', '獨角獸'],
    ['rabbit-face', 'Bunny!', '兔子'],
    ['dog-face', 'Puppy!', '小狗'],
    ['fox', 'Fox!', '狐狸'],
    ['owl', 'Owl!', '貓頭鷹'],
  ]),
  ...A('sea', [
    ['tropical-fish', 'Fish!', '熱帶魚'],
    ['spouting-whale', 'Whale!', '鯨魚'],
    ['dolphin', 'Dolphin!', '海豚'],
    ['octopus', 'Octopus!', '章魚'],
    ['crab', 'Crab!', '螃蟹'],
  ]),
  ...A('bug', [
    ['butterfly', 'Butterfly!', '蝴蝶'],
    ['lady-beetle', 'Ladybug!', '瓢蟲'],
    ['snail', 'Snail!', '蝸牛'],
    ['honeybee', 'Bee!', '蜜蜂'],
  ]),
  ...A('fruit', [
    ['red-apple', 'Apple!', '蘋果'],
    ['banana', 'Banana!', '香蕉'],
    ['strawberry', 'Strawberry!', '草莓'],
    ['watermelon', 'Watermelon!', '西瓜'],
    ['grapes', 'Grapes!', '葡萄'],
    ['cherries', 'Cherries!', '櫻桃'],
  ]),
  ...A('treat', [
    ['ice-cream', 'Ice cream!', '冰淇淋'],
    ['doughnut', 'Donut!', '甜甜圈'],
    ['cupcake', 'Cupcake!', '杯子蛋糕'],
    ['lollipop', 'Lollipop!', '棒棒糖'],
  ]),
  ...A('sky', [
    ['sun-with-face', 'Sun!', '太陽'],
    ['rainbow', 'Rainbow!', '彩虹'],
    ['umbrella-with-rain-drops', 'Rainy day!', '下雨天'],
    ['snowflake', 'Snowflake!', '雪花'],
    ['snowman', 'Snowman!', '雪人'],
    ['crescent-moon', 'Moon!', '月亮'],
    ['glowing-star', 'Star!', '星星'],
    ['shooting-star', 'Shooting star!', '流星'],
    ['ringed-planet', 'Planet!', '行星'],
    ['flying-saucer', 'Flying saucer!', '飛碟'],
  ]),
  ...A('toy', [
    ['balloon', 'Balloon!', '氣球'],
    ['teddy-bear', 'Teddy bear!', '泰迪熊'],
    ['kite', 'Kite!', '風箏'],
    ['soccer-ball', 'Soccer ball!', '足球'],
  ]),
]

const BY_ID = new Map(STICKER_ART.map((a) => [a.id, a]))
export const artOf = (id: string): ArtDef | undefined => BY_ID.get(id)

/**
 * 各類型的起始偏好（Sam 喜歡恐龍、交通工具、動物）。sticker-pick.ts 只取它的一小部分當權重（約 1.2 倍），
 * 挑選的 6 張還是以隨機為主。
 */
export const CAT_SEED: Record<ArtCat, number> = { dino: 1.6, car: 1.6, animal: 1, sea: 0.4, sky: 0.4, bug: 0.3, fruit: 0.3, treat: 0.3, toy: 0.3 }

/** 給 scripts/build-emoji.ts：圖庫用到的圖示，加上挑選畫面的按鈕圖示 */
export const STICKER_ART_ICONS = [...STICKER_ART.map((a) => a.id), 'counterclockwise-arrows-button']
