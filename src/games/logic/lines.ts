// 邏輯遊戲的台詞（T-152）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔，npm run audio 才會產生音檔。
// 「Watch me!」「Your turn!」「Yes!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、praise.dodo.0、d.next.home。
import { def } from '../../content/registry'
import { COLOR_IDS, SHAPE_IDS, type ColorId, type KindId, type ShapeId } from './sort-plan'
import { OBJ_IDS } from './pattern-plan'

// 進門
def('lg.pick.intro', 'dodo', 'Pick a game!')
def('lg.again', 'dodo', 'Play again?')

// ── 豆豆收拾 ──
def('lg.sort.ask', 'dodo', 'Where does it go?')
def('lg.sort.done', 'dodo', 'All tidy!')

const COLOR_EN: Record<ColorId, string> = { red: 'Red', blue: 'Blue', yellow: 'Yellow', green: 'Green' }
const KIND_EN: Record<KindId, { many: string; one: string; basket: string }> = {
  animal: { many: 'Animals go here.', one: 'This is an animal.', basket: 'That is the animal basket.' },
  food: { many: 'Food goes here.', one: 'This is food.', basket: 'That is the food basket.' },
  vehicle: { many: 'Vehicles go here.', one: 'This is a vehicle.', basket: 'That is the vehicle basket.' },
}
const SHAPE_EN: Record<ShapeId, string> = { circle: 'circle', triangle: 'triangle', square: 'square' }

/** 示範：「Red goes here.」；答錯：「That is the blue basket.」再提示「This is red.」 */
export const goesKey = (basket: string) => `lg.sort.goes.${basket}`
export const thatKey = (basket: string) => `lg.sort.that.${basket}`
export const thisKey = (basket: string) => `lg.sort.this.${basket}`
for (const c of COLOR_IDS) {
  def(goesKey(c), 'dodo', `${COLOR_EN[c]} goes here.`)
  def(thatKey(c), 'dodo', `That is the ${c} basket.`)
  def(thisKey(c), 'dodo', `This is ${c}.`)
}
for (const [k, t] of Object.entries(KIND_EN)) {
  def(goesKey(k), 'dodo', t.many)
  def(thatKey(k), 'dodo', t.basket)
  def(thisKey(k), 'dodo', t.one)
}
for (const s of SHAPE_IDS) {
  def(goesKey(s), 'dodo', `${SHAPE_EN[s][0].toUpperCase()}${SHAPE_EN[s].slice(1)}s go here.`)
  def(thatKey(s), 'dodo', `That is the ${SHAPE_EN[s]} basket.`)
  def(thisKey(s), 'dodo', `This is a ${SHAPE_EN[s]}.`)
}
def(goesKey('big'), 'dodo', 'Big ones go here.')
def(thatKey('big'), 'dodo', 'That is the big basket.')
def(thisKey('big'), 'dodo', 'This one is big.')
def(goesKey('small'), 'dodo', 'Little ones go here.')
def(thatKey('small'), 'dodo', 'That is the little basket.')
def(thisKey('small'), 'dodo', 'This one is little.')

/** 過程讚美（FB-1）：說他看了什麼，不說 Smart! */
export const sortPraiseKey = (dim: string) => `lg.sort.praise.${dim}`
def(sortPraiseKey('color'), 'dodo', 'Same color, same basket!')
def(sortPraiseKey('kind'), 'dodo', 'You looked at what it is!')
def(sortPraiseKey('shape'), 'dodo', 'You looked at the shape!')
def(sortPraiseKey('size'), 'dodo', 'You looked at the size!')

// ── 串珠珠 ──
def('lg.pat.ask', 'dodo', 'What comes next?')
def('lg.pat.mid', 'dodo', 'What goes here?')
def('lg.pat.done', 'dodo', 'A necklace for me!')

/** 念規律的一個字：珠子念顏色、東西念名字（Red, blue, red, blue…） */
export const wordKey = (id: string) => `lg.w.${id}`
for (const c of COLOR_IDS) def(wordKey(c), 'dodo', `${COLOR_EN[c]}.`)
const OBJ_EN: Record<string, string> = { 'red-apple': 'Apple.', banana: 'Banana.', cat: 'Cat.', duck: 'Duck.', star: 'Star.', fish: 'Fish.', car: 'Car.', sun: 'Sun.' }
for (const o of OBJ_IDS) def(wordKey(o), 'dodo', OBJ_EN[o])
