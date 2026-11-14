// 學校的數學課（src/lessons/math/）：波波帶。數字的念法、比多少、找數字、有幾個沿用 lines.ts 的 m.*、teach.*，這裡只放課裡多的句子。
import { def } from './registry'
import { THING_NOUNS } from '../lib/today-world'
import { FIND_THINGS } from '../lessons/math/warmup'

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

for (let n = 1; n <= 10; n++) {
  // 開場：今天的數字（目標字前停一下、加重）
  def(`ma.today.${n}`, 'bobo', `Today's number is | ${NUM[n]}!`)
  // 寫數字那一段的開頭
  def(`ma.write.${n}`, 'bobo', `Let's write | ${NUM[n]}!`)
}

/** 數數那一段數的東西：恐龍、車子、動物、食物（課裡的 COUNT_SETS 用這幾個） */
export const COUNT_NOUNS: Record<string, string> = {
  't-rex': 'dinosaurs',
  sauropod: 'dinosaurs',
  automobile: 'cars',
  'racing-car': 'cars',
  bus: 'buses',
  'fire-engine': 'fire trucks',
  'dog-face': 'dogs',
  'cat-face': 'cats',
  'rabbit-face': 'bunnies',
  'baby-chick': 'chicks',
  turtle: 'turtles',
  'red-apple': 'apples',
  strawberry: 'strawberries',
  banana: 'bananas',
  cookie: 'cookies',
}
// 今天的世界（T-127）的東西也都要有一句（數數那一段用世界的東西）；原本的那幾個念法不變
for (const [icon, noun] of Object.entries(THING_NOUNS)) if (!(icon in COUNT_NOUNS)) COUNT_NOUNS[icon] = noun
for (const [icon, noun] of Object.entries(COUNT_NOUNS)) def(`ma.count.${icon}`, 'bobo', `Let's count the ${noun}!`)
// 只有一個的時候（今天的數字是 1）不說複數
def('ma.count', 'bobo', "Let's count!")

// 拿給波波（Give-N）：「Give me three!」、答錯時「There are two. More, please! I want three.」
for (let n = 1; n <= 5; n++) {
  def(`ma.give.${n}`, 'bobo', `Give me | ${NUM[n]}!`)
  def(`ma.want.${n}`, 'bobo', `I want | ${NUM[n]}.`)
}
def('ma.give.more', 'bobo', 'More, please!')
def('ma.give.toomany', 'bobo', 'Too many!')
def('ma.give.thanks', 'bobo', 'Yum! Thank you!')

// 拿給波波的另外兩種玩法（T-127，math/Train.tsx、math/Plant.tsx）：關鍵字（Three!）照舊先念，接著說要做什麼
for (let n = 1; n <= 5; n++) {
  def(`ma.train.${n}`, 'bobo', `Put ${NUM[n]} on the train!`)
  def(`ma.plant.${n}`, 'bobo', n === 1 ? 'Plant | one flower!' : `Plant | ${NUM[n]} flowers!`)
}
def('ma.train.go', 'bobo', 'Choo choo! Bye-bye!')
def('ma.plant.grow', 'bobo', 'Look! They grow!')
def('ma.plant.grow1', 'bobo', 'Look! It grows!')

// 寫數字
def('ma.pen', 'bobo', 'Use the pen!')
def('ma.write.go', 'bobo', 'Start at the green dot!')
def('ma.write.next', 'bobo', 'Now the next line!')
def('ma.write.done', 'bobo', 'Great writing!')

// 同一天再進來（複習）、1～10 都上完之後的混合複習、下課
def('ma.again', 'bobo', "Let's practice again!")
def('ma.mix', 'bobo', "Let's play with numbers!")
def('ma.bye', 'bobo', 'Great job today!')

// ── 開場「玩著數數」（T-147，家長 2026-11-14 選定，取代童謠；math/warmup.ts、math/Warm.tsx）──────────
// 每點一下念一個數用 lines.ts 的 m.num.N（One! Two!），這裡是題目和最後強調的總數（M1～M3：數完停住、說總數）
const Cap = (s: string) => s[0].toUpperCase() + s.slice(1)
for (let n = 1; n <= 10; n++) {
  // 動作數數（M2）：點青蛙，跳一下數一下
  def(`ma.hop.go.${n}`, 'bobo', n === 1 ? 'Jump | one time!' : `Jump | ${NUM[n]} times!`)
  def(`ma.hop.total.${n}`, 'bobo', n === 1 ? 'One jump!' : `${Cap(NUM[n])} jumps!`)
  // 手指數數（M1）：Show me three! … Three fingers!
  def(`ma.fingers.show.${n}`, 'bobo', `Show me | ${NUM[n]}!`)
  def(`ma.fingers.total.${n}`, 'bobo', n === 1 ? 'One finger!' : `${Cap(NUM[n])} fingers!`)
}
// 找找看（M3）：要找的 ≤ 5 個
for (const t of FIND_THINGS)
  for (let n = 1; n <= 5; n++) {
    const noun = n === 1 ? t.one : t.many
    def(`ma.find.${t.icon}.${n}`, 'bobo', `Find | ${NUM[n]} ${noun}!`)
    def(`ma.found.${t.icon}.${n}`, 'bobo', `${Cap(NUM[n])} ${noun}!`)
  }

// 小遊戲（T-147）：找數字包成氣球，「Three! Pop the three!」（關鍵字先念，T-109）
for (let n = 1; n <= 10; n++) def(`ma.pop.${n}`, 'bobo', `Pop the ${NUM[n]}!`)
