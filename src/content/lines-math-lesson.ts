// 學校的數學課（src/lessons/math/）：波波帶。數字的念法、比多少、找數字、有幾個沿用 lines.ts 的 m.*、teach.*，這裡只放課裡多的句子。
import { def } from './registry'

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
for (const [icon, noun] of Object.entries(COUNT_NOUNS)) def(`ma.count.${icon}`, 'bobo', `Let's count the ${noun}!`)
// 只有一個的時候（今天的數字是 1）不說複數
def('ma.count', 'bobo', "Let's count!")

// 寫數字
def('ma.pen', 'bobo', 'Use the pen!')
def('ma.write.go', 'bobo', 'Start at the green dot!')
def('ma.write.next', 'bobo', 'Now the next line!')
def('ma.write.again', 'bobo', 'One more time!')
def('ma.write.done', 'bobo', 'Great writing!')

// 同一天再進來（複習）、1～10 都上完之後的混合複習、下課
def('ma.again', 'bobo', "Let's practice again!")
def('ma.mix', 'bobo', "Let's play with numbers!")
def('ma.bye', 'bobo', 'Great job today!')
