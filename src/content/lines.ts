import './lines-engine'
import './lines-phonics'
import './lines-code'
import './lines-outing'
import './lines-achieve'
import './lines-themes'
import { CHILD_EN } from '../lib/env'
import { LETTERS } from './letters'
import { VOCAB, TAG_QUESTION, type Tag } from './vocab'
import { COLORS, SHAPES } from './park'

import { def, type Speaker } from './registry'
import './lines-friends'
import './lines-worksheet'

export { def, line, hasLine, allLines, segments, type Speaker, type Line, type Segment } from './registry'

// 新功能的大量台詞請放在自己的 lines-*.ts（用 registry 的 def），再到這裡 import 一行
// （例如 import './lines-phonics'），避免多人同時改這個檔案

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

const N = CHILD_EN
const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']

// ── 通用：稱讚、再試一次、提示 ─────────────────────────────
export const PRAISE_COUNT = 5
const praise: Record<Speaker, string[]> = {
  dodo: ['Great job!', 'Yes! You got it!', `Wow, ${N}!`, "That's right!", 'Awesome!'],
  bobo: ["That's right!", 'Super!', `Good job, ${N}!`, 'Yes, yes, yes!', 'You did it!'],
  momo: ['Very good.', "That's it.", `Well done, ${N}.`, 'Yes, you found it.', 'Wonderful.'],
}
export const RETRY_COUNT = 3
const retry: Record<Speaker, string[]> = {
  dodo: ['Try again!', 'Hmm, look again!', 'Almost!'],
  bobo: ["That's okay, try again!", 'Look again!', 'So close!'],
  momo: ["That's okay. Take your time.", 'Look again.', 'Almost.'],
}
for (const s of SPEAKERS) {
  praise[s].forEach((t, i) => def(`praise.${s}.${i}`, s, t))
  retry[s].forEach((t, i) => def(`retry.${s}.${i}`, s, t))
  def(`hint.${s}`, s, s === 'momo' ? 'It is this one. Tap it.' : "It's this one! Tap it!")
  def(`idle.${s}`, s, 'Which one?')
}
// 舊版遊戲會用到的英文稱讚，沿用豆豆的句子
praise.dodo.forEach((t, i) => def(`praise.en.${i}`, 'dodo', t))

// ── 首頁、冒險流程 ─────────────────────────────────────────
def('home.hello', 'dodo', `Hi, ${N}! Let's go on an adventure!`)
def('home.tapdodo', 'dodo', "I'm Dodo! I love driving my car!")
def('home.tapbobo', 'bobo', "I'm Bobo! I love counting things!")
def('home.tapmomo', 'momo', "I'm Momo. I have a long, long neck.")
def('adv.go', 'dodo', "Let's go!")
def('adv.done', 'dodo', `We did it! Great job today, ${N}!`)
def('adv.again', 'dodo', "We already went today. Let's play on the map!")
def('station.english', 'dodo', 'Next stop, | Letter Forest!')
def('station.math', 'bobo', 'Next stop, | Number Land!')
def('station.mandarin', 'momo', 'Next stop, | Animal Village.')
def('station.draw', 'dodo', 'Next stop, | Drawing House!')
def('station.park', 'bobo', 'Next stop, | Rainbow Park!')
def('welcome.english', 'dodo', 'Welcome to Letter Forest!')
def('welcome.math', 'bobo', "I'm Bobo! Welcome to Number Land!")
def('welcome.mandarin', 'momo', "I'm Momo. Welcome to Animal Village.")
def('welcome.draw', 'dodo', 'Welcome to Drawing House! Get your pen!')
def('welcome.park', 'bobo', 'Welcome to Rainbow Park!')
def('map.where', 'dodo', 'Where do you want to go?')
def('map.locked', 'dodo', 'Finish today’s adventure first, then the map will open!')
def('egg.crack', 'dodo', 'Look! The egg is cracking!')
def('egg.ready', 'dodo', 'The egg is ready! Tap the egg!')
def('egg.hatch', 'dodo', 'Wow! A new friend!')
def('collection.hi', 'dodo', 'These are all your friends!')
def('collection.empty', 'dodo', 'Go on an adventure to hatch new friends!')
def('bedtime', 'dodo', `Dodo is sleepy... Let's play again tomorrow. Good night, ${N}!`)
def('challenge', 'dodo', 'Last one! This one is tricky!')
def('challenge.bobo', 'bobo', 'Last one! Here comes a tricky one!')
def('challenge.momo', 'momo', 'Last one. This one is a little tricky.')
def('levelup', 'dodo', "You're getting so good! Let's try a harder one!")
def('goodbye', 'dodo', `Bye-bye, ${N}!`)
def('eye.break', 'dodo', "Let's rest our eyes. Look far, far away!")
def('eye.done', 'dodo', "All rested! Let's keep going!")

// ── 字母森林 ───────────────────────────────────────────────
// 自然發音的台詞在 lines-phonics.ts。這裡只留描字母（GlyphGame）唸字母名稱用的句子
for (const { letter } of LETTERS) def(`en.thisis.${letter}`, 'dodo', `This is | ${letter}.`)

// ── 數字工地 ───────────────────────────────────────────────
def('m.intro.count', 'bobo', "Let's count! Tap them one by one!")
def('m.intro.match', 'bobo', 'Count them, then tap the number!')
def('m.intro.find', 'bobo', 'Listen, and find the number!')
def('m.intro.compare', 'bobo', "Let's compare!")
def('m.intro.order', 'bobo', 'Tap the numbers in order. Start with one!')
def('m.howmany', 'bobo', 'How many are there?')
def('m.more', 'bobo', 'Which side has | more?')
def('m.less', 'bobo', 'Which side has | fewer?')
def('m.this.more', 'bobo', 'This side has more!')
def('m.this.less', 'bobo', 'This side has fewer!')
def('m.order.start', 'bobo', 'Start with one. Tap in order!')
def('m.count.go', 'bobo', 'Tap and count with me!')
for (let n = 1; n <= 20; n++) {
  def(`m.num.${n}`, 'bobo', `${cap(NUM[n])}!`)
  def(`m.findnum.${n}`, 'bobo', `Where is | ${NUM[n]}?`)
  def(`m.total.${n}`, 'bobo', n === 1 ? 'There is | one!' : `There are | ${NUM[n]}!`)
  def(`m.thisis.${n}`, 'bobo', `This is | ${NUM[n]}.`)
  def(`dodo.num.${n}`, 'dodo', `${cap(NUM[n])}!`)
}

// ── 動物村（英文詞彙）──────────────────────────────────────
def('z.intro.find', 'momo', 'Listen, and find the picture.')
def('z.intro.category', 'momo', "Let's think together.")
def('z.intro.sound', 'momo', 'Listen. Who is making that sound?')
for (const v of VOCAB) {
  def(`z.where.${v.id}`, 'momo', `Where is the | ${v.en}?`)
  def(`z.itis.${v.id}`, 'momo', `It's the | ${v.en}.`)
  if (v.sound) def(`z.sound.${v.id}`, 'momo', `${v.sound} Who am I?`)
}
for (const [tag, q] of Object.entries(TAG_QUESTION) as [Tag, string][]) def(`z.cat.${tag}`, 'momo', q)

// ── 彩虹公園 ───────────────────────────────────────────────
def('p.intro.color', 'bobo', 'So many colors!')
def('p.intro.shape', 'bobo', "Let's find shapes!")
def('p.intro.size', 'bobo', 'Big or small? Let’s look!')
for (const c of COLORS) {
  def(`p.color.${c.id}`, 'bobo', `Where is | ${c.en}?`)
  def(`p.thisis.color.${c.id}`, 'bobo', `This is | ${c.en}.`)
}
for (const s of SHAPES) {
  def(`p.shape.${s.id}`, 'bobo', `Where is the | ${s.en}?`)
  def(`p.thisis.shape.${s.id}`, 'bobo', `This is a | ${s.en}.`)
}
def('p.bigger', 'bobo', 'Which one is | bigger?')
def('p.smaller', 'bobo', 'Which one is | smaller?')
def('p.this.bigger', 'bobo', 'This one is bigger!')
def('p.this.smaller', 'bobo', 'This one is smaller!')

// ── 畫畫小屋 ───────────────────────────────────────────────
def('d.intro.trace', 'dodo', 'Help me drive home! Follow the road with your pen!')
def('d.intro.dots', 'dodo', 'Connect the dots, starting with one!')
def('d.intro.color', 'dodo', 'Pick a color, and tap to paint!')
def('d.intro.free', 'dodo', 'Draw anything you like! Tap the check when you are done.')
def('d.intro.glyph', 'dodo', 'Start at the green dot, and follow the arrow!')
def('d.trace.done', 'dodo', "We're home! Thank you!")
def('d.trace.keep', 'dodo', "Keep going! We're not home yet!")
def('d.dots.done', 'dodo', 'Wow! Look what it is!')
def('d.color.done', 'dodo', 'So pretty!')
def('d.free.done', 'dodo', 'I love it! I put it in your gallery!')
def('d.glyph.done', 'dodo', 'Great writing!')
def('d.glyph.next', 'dodo', 'Now the next line!')
const DOTS: Record<string, string> = { triangle: 'a triangle', square: 'a square', house: 'a house', fish: 'a fish', star: 'a star', boat: 'a boat', heart: 'a heart', diamond: 'a diamond' }
for (const [d, name] of Object.entries(DOTS)) def(`d.dots.is.${d}`, 'dodo', `It's | ${name}!`)
for (let n = 0; n <= 9; n++) def(`d.glyph.num.${n}`, 'dodo', `This is | ${NUM[n]}.`)

// ── 教學：先教 → 一起練 → 自己答（PRD §5.8）────────────────
// 前綴一律是 teach.：字幕不會把教學句挖空（教的時候答案本來就要看得到）
const teachVoice: Record<Speaker, Record<'watch' | 'turn' | 'here' | 'again', string>> = {
  dodo: { watch: 'Watch me!', turn: 'Your turn!', here: 'Here it is! Tap it!', again: "Let's look again!" },
  bobo: { watch: 'Watch me!', turn: 'Your turn!', here: 'Here it is! Tap it!', again: "Let's look again!" },
  momo: { watch: 'Watch me.', turn: 'Your turn.', here: 'Here it is. Tap it.', again: "Let's look again." },
}
for (const s of SPEAKERS) for (const [k, t] of Object.entries(teachVoice[s])) def(`teach.${k}.${s}`, s, t)

/** 冠詞：x-ray 念 ex-ray，要用 an */
const an = (w: string) => (/^([aeiou]|x-)/i.test(w) ? 'an' : 'a')

for (const { letter, word } of LETTERS) {
  def(`teach.letter.${letter}`, 'dodo', `This is | ${letter}.`)
  def(`teach.letterfor.${letter}`, 'dodo', `${letter} is for | ${word}!`)
  def(`teach.word.${letter}`, 'dodo', `This is ${an(word)} | ${word}!`)
}

for (let n = 1; n <= 20; n++) {
  def(`teach.num.${n}`, 'bobo', `This is | ${NUM[n]}.`)
  def(`teach.total.${n}`, 'bobo', n === 1 ? 'There is | one!' : `There are | ${NUM[n]}!`)
  // 邊數邊念，最後一個數字加重：數到的最後一個就是「總共幾個」
  if (n <= 10) def(`teach.count.${n}`, 'bobo', n === 1 ? 'Just | one!' : `${cap(NUM.slice(1, n).join(', '))}, | ${NUM[n]}!`)
}
def('teach.more', 'bobo', 'This side has | more!')
def('teach.fewer', 'bobo', 'This side has | fewer.')
def('teach.bigger', 'bobo', 'This one is | bigger!')
def('teach.smaller', 'bobo', 'This one is | smaller.')

for (const v of VOCAB) {
  const plural = v.id === 'grapes'
  const name = plural ? `These are | ${v.en}.` : `This is ${an(v.en)} | ${v.en}.`
  // 有叫聲的先學叫聲：Woof woof! This is a dog.
  def(`teach.vocab.${v.id}`, 'momo', v.sound ? `${v.sound} ${name}` : name)
  if (v.sound) def(`teach.sound.${v.id}`, 'momo', `${cap(an(v.en))} ${v.en} says, | ${v.sound[0].toLowerCase()}${v.sound.slice(1)}`)
}
const CAT_TEACH: Record<Tag, [string, string]> = {
  fly: ['Birds can | fly.', 'Airplanes can | fly, too!'],
  water: ['Fish swim in the | water.', 'Boats go on the | water, too!'],
  wheels: ['A car has | wheels.', 'A bus has | wheels, too!'],
  legs4: ['A dog has | four legs.', 'A cow has | four legs, too!'],
  eat: ['We can eat | apples.', 'We can eat | bananas, too!'],
}
for (const [tag, pair] of Object.entries(CAT_TEACH) as [Tag, [string, string]][]) pair.forEach((t, i) => def(`teach.cat.${tag}.${i}`, 'momo', t))

const COLOR_LIKE: Record<string, string> = {
  red: 'An apple is | red!',
  yellow: 'A banana is | yellow!',
  blue: 'A whale is | blue!',
  green: 'A frog is | green!',
  orange: 'A carrot is | orange!',
  purple: 'Grapes are | purple!',
  pink: 'A pig is | pink!',
  brown: 'A teddy bear is | brown!',
}
for (const c of COLORS) {
  def(`teach.color.${c.id}`, 'bobo', `This is | ${c.en}.`)
  def(`teach.colorlike.${c.id}`, 'bobo', COLOR_LIKE[c.id])
}
const SHAPE_FUN: Record<string, string> = {
  circle: 'Round and round!',
  triangle: 'One, two, three sides!',
  square: 'Four sides, all the same!',
  star: 'Twinkle, twinkle!',
  heart: 'I love you!',
  rect: 'Long, like a bus!',
}
for (const s of SHAPES) {
  def(`teach.shape.${s.id}`, 'bobo', `This is a | ${s.en}.`)
  def(`teach.shapefun.${s.id}`, 'bobo', SHAPE_FUN[s.id])
}
