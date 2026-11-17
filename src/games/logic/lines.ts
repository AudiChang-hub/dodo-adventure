// 邏輯遊戲的台詞（T-152）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔，npm run audio 才會產生音檔。
// 「Watch me!」「Your turn!」「Yes!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、praise.dodo.0、d.next.home。
import { def } from '../../content/registry'
import { COLOR_IDS, SCENE_IDS, SHAPE_IDS, TOY_IDS, type ColorId, type KindId, type SceneId, type ShapeId, type ToyId } from './sort-plan'
import { SWITCH_LINE, bothKey, byKey, nowKey } from './sort-switch'
import { OBJ_IDS, THEME_IDS, type PatThemeId } from './pattern-plan'

// 進門
def('lg.pick.intro', 'dodo', 'Pick a game!')
def('lg.again', 'dodo', 'Play again?')

// ── 豆豆收拾 ──
def('lg.sort.ask', 'dodo', 'Where does it go?')
def('lg.sort.done', 'dodo', 'All tidy!')

/** 一局開始：這一局收拾什麼（T-157，情境見 ./sort-plan 的 SCENES） */
export const sortSceneKey = (scene: SceneId) => `lg.sort.scene.${scene}`
const SCENE_EN: Record<SceneId, string> = {
  toys: "Let's tidy the toys!",
  fruit: "Let's fill the baskets!",
  farm: 'Back to the farm!',
  clothes: "Let's put the clothes away!",
  kitchen: "Let's tidy the kitchen!",
  garage: 'Time to park!',
}
for (const id of SCENE_IDS) def(sortSceneKey(id), 'dodo', SCENE_EN[id])

const COLOR_EN: Record<ColorId, string> = { red: 'Red', blue: 'Blue', yellow: 'Yellow', green: 'Green' }
// 答錯時說「那一個是放什麼的」：容器跟著情境換（箱子、籃子、抽屜、農場…），所以不說 basket（T-157）
const KIND_EN: Record<KindId, { many: string; one: string; basket: string }> = {
  animal: { many: 'Animals go here.', one: 'This is an animal.', basket: 'That one is for animals.' },
  food: { many: 'Food goes here.', one: 'This is food.', basket: 'That one is for food.' },
  vehicle: { many: 'Vehicles go here.', one: 'This is a vehicle.', basket: 'That one is for vehicles.' },
  clothes: { many: 'Clothes go here.', one: 'We wear this.', basket: 'That one is for clothes.' },
  toy: { many: 'Toys go here.', one: 'This is a toy.', basket: 'That one is for toys.' },
}
const SHAPE_EN: Record<ShapeId, string> = { circle: 'circle', triangle: 'triangle', square: 'square' }

/** 示範：「Red goes here.」；答錯：「That one is for blue.」再提示「This is red.」 */
export const goesKey = (basket: string) => `lg.sort.goes.${basket}`
export const thatKey = (basket: string) => `lg.sort.that.${basket}`
export const thisKey = (basket: string) => `lg.sort.this.${basket}`
for (const c of COLOR_IDS) {
  def(goesKey(c), 'dodo', `${COLOR_EN[c]} goes here.`)
  def(thatKey(c), 'dodo', `That one is for ${c}.`)
  def(thisKey(c), 'dodo', `This is ${c}.`)
}
for (const [k, t] of Object.entries(KIND_EN)) {
  def(goesKey(k), 'dodo', t.many)
  def(thatKey(k), 'dodo', t.basket)
  def(thisKey(k), 'dodo', t.one)
}
for (const s of SHAPE_IDS) {
  def(goesKey(s), 'dodo', `${SHAPE_EN[s][0].toUpperCase()}${SHAPE_EN[s].slice(1)}s go here.`)
  def(thatKey(s), 'dodo', `That one is for ${SHAPE_EN[s]}s.`)
  def(thisKey(s), 'dodo', `This is a ${SHAPE_EN[s]}.`)
}
def(goesKey('big'), 'dodo', 'Big ones go here.')
def(thatKey('big'), 'dodo', 'That one is for big ones.')
def(thisKey('big'), 'dodo', 'This one is big.')
def(goesKey('small'), 'dodo', 'Little ones go here.')
def(thatKey('small'), 'dodo', 'That one is for little ones.')
def(thisKey('small'), 'dodo', 'This one is little.')

/** 過程讚美（FB-1）：說他看了什麼，不說 Smart! */
export const sortPraiseKey = (dim: string) => `lg.sort.praise.${dim}`
def(sortPraiseKey('color'), 'dodo', 'Same color, same basket!')
def(sortPraiseKey('kind'), 'dodo', 'You looked at what it is!')
def(sortPraiseKey('shape'), 'dodo', 'You looked at the shape!')
def(sortPraiseKey('size'), 'dodo', 'You looked at the size!')

// ── 豆豆收拾的 4 歲玩法（第 6 級換規則、第 7 級兩個一起看，./sort-switch.ts）──
const TOY_EN: Record<ToyId, [string, string]> = {
  ball: ['ball', 'balls'],
  block: ['block', 'blocks'],
  balloon: ['balloon', 'balloons'],
  car: ['car', 'cars'],
  sock: ['sock', 'socks'],
  shirt: ['shirt', 'shirts'],
  hat: ['hat', 'hats'],
  mitten: ['mitten', 'mittens'],
  cup: ['cup', 'cups'],
  bowl: ['bowl', 'bowls'],
  plate: ['plate', 'plates'],
  spoon: ['spoon', 'spoons'],
}
const Cap = (x: string) => `${x[0].toUpperCase()}${x.slice(1)}`
// 第 6 級照是什麼東西分：「Cars go here.」「That one is for balls.」「This is a car.」
for (const t of TOY_IDS) {
  def(goesKey(t), 'dodo', `${Cap(TOY_EN[t][1])} go here.`)
  def(thatKey(t), 'dodo', `That one is for ${TOY_EN[t][1]}.`)
  def(thisKey(t), 'dodo', `This is a ${TOY_EN[t][0]}.`)
}
// 第 7 級兩個一起看：「Red circles go here.」「That one is for blue cars.」「This is a red car.」
const BOTH_EN: Record<string, [string, string]> = { ...Object.fromEntries(SHAPE_IDS.map((x) => [x, [SHAPE_EN[x], `${SHAPE_EN[x]}s`]])), ...TOY_EN }
for (const c of COLOR_IDS)
  for (const [v, [one, many]] of Object.entries(BOTH_EN)) {
    def(goesKey(`${c}-${v}`), 'dodo', `${COLOR_EN[c]} ${many} go here.`)
    def(thatKey(`${c}-${v}`), 'dodo', `That one is for ${c} ${many}.`)
    def(thisKey(`${c}-${v}`), 'dodo', `This is a ${c} ${one}.`)
  }
// 一局開始說規則；換規則的時候（New rule! Now sort by shape!）
def(byKey('color'), 'dodo', 'Sort by color!')
def(byKey('shape'), 'dodo', 'Sort by shape!')
def(byKey('thing'), 'dodo', 'Sort by what it is!')
def(SWITCH_LINE, 'dodo', 'New rule!')
def(nowKey('color'), 'dodo', 'Now sort by color!')
def(nowKey('shape'), 'dodo', 'Now sort by shape!')
def(nowKey('thing'), 'dodo', 'Now sort by what it is!')
def(bothKey('shape'), 'dodo', 'Same color, same shape!')
def(bothKey('thing'), 'dodo', 'Same color, same toy!')
def(sortPraiseKey('thing'), 'dodo', 'You looked at what it is!')
def(sortPraiseKey('both'), 'dodo', 'You looked at both!')
/** 第 6 級一局收完（過程讚美 FB-1：說他做到了什麼） */
export const SWITCH_PRAISE = 'lg.sort.praise.switch'
def(SWITCH_PRAISE, 'dodo', 'You changed the rule!')

// ── 串珠珠 ──
def('lg.pat.ask', 'dodo', 'What comes next?')
def('lg.pat.mid', 'dodo', 'What goes here?')
def('lg.pat.done', 'dodo', 'A necklace for me!')

/** 一局開始、串完（T-157，串的東西見 ./pattern-plan 的 THEMES）：項鍊串完沿用 lg.pat.done */
export const patThemeKey = (t: PatThemeId) => `lg.pat.theme.${t}`
export const patDoneKey = (t: PatThemeId) => (t === 'necklace' ? 'lg.pat.done' : `lg.pat.done.${t}`)
const THEME_EN: Record<PatThemeId, { intro: string; done: string }> = {
  necklace: { intro: "Let's make a necklace!", done: 'A necklace for me!' },
  train: { intro: "Let's build a train!", done: 'Choo choo! All aboard!' },
  flags: { intro: "Let's hang up flags!", done: 'Party flags! Hooray!' },
  cookies: { intro: "Let's line up cookies!", done: 'Yummy, yummy cookies!' },
  garden: { intro: "Let's plant a garden!", done: 'What a pretty garden!' },
  animals: { intro: 'Animals, line up!', done: 'Everyone is in line!' },
}
for (const t of THEME_IDS) {
  def(patThemeKey(t), 'dodo', THEME_EN[t].intro)
  if (t !== 'necklace') def(patDoneKey(t), 'dodo', THEME_EN[t].done)
}

/** 念規律的一個字：珠子念顏色、東西念名字（Red, blue, red, blue…） */
export const wordKey = (id: string) => `lg.w.${id}`
for (const c of COLOR_IDS) def(wordKey(c), 'dodo', `${COLOR_EN[c]}.`)
const OBJ_EN: Record<string, string> = {
  'red-apple': 'Apple.',
  banana: 'Banana.',
  cat: 'Cat.',
  duck: 'Duck.',
  star: 'Star.',
  fish: 'Fish.',
  car: 'Car.',
  sun: 'Sun.',
  moon: 'Moon.',
  strawberry: 'Strawberry.',
  cloud: 'Cloud.',
  rainbow: 'Rainbow.',
  snowflake: 'Snowflake.',
  umbrella: 'Umbrella.',
  teddy: 'Teddy bear.',
  ball: 'Ball.',
  box: 'Box.',
  carrot: 'Carrot.',
  watermelon: 'Watermelon.',
  cookie: 'Cookie.',
  donut: 'Donut.',
  cupcake: 'Cupcake.',
  lollipop: 'Lollipop.',
  'ice-cream': 'Ice cream.',
  tulip: 'Tulip.',
  sunflower: 'Sunflower.',
  flower: 'Flower.',
  mushroom: 'Mushroom.',
  snail: 'Snail.',
  butterfly: 'Butterfly.',
  ladybug: 'Ladybug.',
  bee: 'Bee.',
  cow: 'Cow.',
  pig: 'Pig.',
  rabbit: 'Rabbit.',
  frog: 'Frog.',
  penguin: 'Penguin.',
  monkey: 'Monkey.',
  horse: 'Horse.',
  chicken: 'Chicken.',
  elephant: 'Elephant.',
  turtle: 'Turtle.',
}
for (const o of OBJ_IDS) def(wordKey(o), 'dodo', OBJ_EN[o])
