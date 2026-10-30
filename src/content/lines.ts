import './lines-engine'
import './lines-phonics'
import './lines-code'
import './lines-outing'
import './lines-achieve'
import './lines-themes'
import './lines-eyebreak'
import './lines-dots'
import './lines-stickers'
import './lines-crayon'
import './lines-pattern'
import './lines-zh'
import { CHILD_EN } from '../lib/env'
import { LETTERS } from './letters'
import { VOCAB, DEFERRED_VOCAB, TAG_QUESTION, CAT_EXAMPLES, catLine, vocab, type Tag } from './vocab'
import { LEXICON, articleOf, keyOfVocab, thisIs, thisIsText } from './lexicon'
import { COLORS, SHAPES } from './park'

import { def, type Speaker } from './registry'
import './lines-friends'
import './lines-worksheet'

export { def, defBridge, isBridge, line, hasLine, allLines, segments, plainText, type Speaker, type Line, type Segment } from './registry'

// 新功能的大量台詞請放在自己的 lines-*.ts（用 registry 的 def），再到這裡 import 一行
// （例如 import './lines-phonics'），避免多人同時改這個檔案

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

const N = CHILD_EN
const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']

// ── 通用：稱讚、再試一次、提示 ─────────────────────────────
// 2026-10-28 單字盤點第 4 章：回饋固定成四句——Yes!／Try again!／Watch me!／Your turn!。
// 同一個意思全站只用一種說法（以前每隻恐龍 5 種稱讚、3 種鼓勵，孩子聽不出是同一個意思）；
// 語氣差異交給恐龍的聲音和感嘆詞（莫莫用句號，比較沉穩），句子不變。key 的數量不變，遊戲端照舊隨機挑。
export const PRAISE_COUNT = 5
const praise: Record<Speaker, string[]> = {
  dodo: Array<string>(PRAISE_COUNT).fill('Yes!'),
  bobo: Array<string>(PRAISE_COUNT).fill('Yes!'),
  momo: Array<string>(PRAISE_COUNT).fill('Yes.'),
}
export const RETRY_COUNT = 3
const retry: Record<Speaker, string[]> = {
  dodo: Array<string>(RETRY_COUNT).fill('Try again!'),
  bobo: Array<string>(RETRY_COUNT).fill('Try again!'),
  momo: Array<string>(RETRY_COUNT).fill('Try again.'),
}
for (const s of SPEAKERS) {
  praise[s].forEach((t, i) => def(`praise.${s}.${i}`, s, t))
  retry[s].forEach((t, i) => def(`retry.${s}.${i}`, s, t))
  // 提示和教學卡後的「答案在這裡」同一句（teach.here.*）
  def(`hint.${s}`, s, s === 'momo' ? 'Here it is. Tap it.' : 'Here it is! Tap it!')
  def(`idle.${s}`, s, 'Which one?')
}
// 舊版遊戲會用到的英文稱讚，沿用豆豆的句子
praise.dodo.forEach((t, i) => def(`praise.en.${i}`, 'dodo', t))

// ── 首頁、冒險流程 ─────────────────────────────────────────
def('home.hello', 'dodo', `Hi, ${N}! Let's go!`)
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
def('map.locked', 'dodo', 'First, let’s finish today!')
def('egg.crack', 'dodo', 'Look! The egg is cracking!')
def('egg.ready', 'dodo', 'The egg is ready! Tap the egg!')
def('egg.hatch', 'dodo', 'Wow! A new friend!')
def('collection.hi', 'dodo', 'These are all your friends!')
def('collection.empty', 'dodo', 'Let’s go! New friends are coming!')
def('bedtime', 'dodo', `Dodo is sleepy... Let's play again tomorrow. Good night, ${N}!`)
// 每局最後一題（比較難）：只說 Last one!，不用 tricky 這種抽象字
def('challenge', 'dodo', 'Last one!')
def('challenge.bobo', 'bobo', 'Last one!')
def('challenge.momo', 'momo', 'Last one.')
def('levelup', 'dodo', "You're getting so good! Let's try a harder one!")
def('goodbye', 'dodo', `Bye-bye, ${N}!`)
// 護眼休息的台詞在 lines-eyebreak.ts

// ── 字母森林 ───────────────────────────────────────────────
// 自然發音的台詞在 lines-phonics.ts。這裡只留描字母（GlyphGame）唸字母名稱用的句子
for (const { letter } of LETTERS) def(`en.thisis.${letter}`, 'dodo', `This is | ${letter}.`)

// ── 數字工地 ───────────────────────────────────────────────
def('m.intro.count', 'bobo', "Let's count! Tap them one by one!")
def('m.intro.match', 'bobo', 'Count them, then tap the number!')
def('m.intro.find', 'bobo', 'Listen, and find the number!')
def('m.intro.compare', 'bobo', 'Look at both sides!')
def('m.intro.order', 'bobo', 'Tap the numbers. Start with one!')
def('m.howmany', 'bobo', 'How many?')
def('m.more', 'bobo', 'Which side has | more?')
def('m.less', 'bobo', 'Which side has | fewer?')
def('m.this.more', 'bobo', 'This side has more!')
def('m.this.less', 'bobo', 'This side has fewer!')
def('m.order.start', 'bobo', 'Start with one!')
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
  // 「這是 ___」全站只用一種說法：和 lex.this.* 同一句（同一段音檔）
  def(`z.itis.${v.id}`, 'momo', thisIsText({ key: keyOfVocab(v.id), en: v.en }))
  if (v.sound) def(`z.sound.${v.id}`, 'momo', `${v.sound} Who am I?`)
}
for (const v of DEFERRED_VOCAB) def(`z.itis.${v.id}`, 'momo', thisIsText({ key: v.id, en: v.en }))
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
def('d.intro.trace', 'dodo', 'Help me drive home! Use your pen!')
def('d.intro.free', 'dodo', 'Draw anything you like!')
def('d.intro.glyph', 'dodo', 'Start at the green dot! Go this way!')
def('d.trace.done', 'dodo', "We're home! Thank you!")
def('d.trace.keep', 'dodo', "Keep going! We're not home yet!")
// 運筆小路：不是從車子出發時（每條路最多兩次）
def('d.trace.start', 'dodo', 'Start at the car!')
def('d.color.done', 'dodo', 'So pretty!')
def('d.free.done', 'dodo', 'I love it!')
def('d.glyph.done', 'dodo', 'Great writing!')
def('d.glyph.next', 'dodo', 'Now the next line!')
// 連點成圖連完：This is a | house!（菱形 diamond 不是小班教的形狀、又是鑽石，改說像風箏 kite）
const DOTS: Record<string, string> = { triangle: 'triangle', square: 'square', house: 'house', fish: 'fish', star: 'star', boat: 'boat', heart: 'heart', diamond: 'kite' }
for (const [d, name] of Object.entries(DOTS)) def(`d.dots.is.${d}`, 'dodo', `This is ${articleOf(name)} | ${name}!`)
for (let n = 0; n <= 9; n++) def(`d.glyph.num.${n}`, 'dodo', `This is | ${NUM[n]}.`)

// ── 教學：先教 → 一起練 → 自己答（PRD §5.8）────────────────
// 前綴一律是 teach.：字幕不會把教學句挖空（教的時候答案本來就要看得到）
const teachVoice: Record<Speaker, Record<'watch' | 'turn' | 'here' | 'again', string>> = {
  dodo: { watch: 'Watch me!', turn: 'Your turn!', here: 'Here it is! Tap it!', again: "Let's look again!" },
  bobo: { watch: 'Watch me!', turn: 'Your turn!', here: 'Here it is! Tap it!', again: "Let's look again!" },
  momo: { watch: 'Watch me.', turn: 'Your turn.', here: 'Here it is. Tap it.', again: "Let's look again." },
}
for (const s of SPEAKERS) for (const [k, t] of Object.entries(teachVoice[s])) def(`teach.${k}.${s}`, s, t)

const an = articleOf

// 舊版字母表（A is for apple…）的 teach.letterfor.*、teach.word.* 沒有遊戲在唸（2026-10-28 單字盤點），已刪掉
for (const { letter } of LETTERS) def(`teach.letter.${letter}`, 'dodo', `This is | ${letter}.`)

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

// 延後的詞（goat、dragon…）不出題，但之前得到的貼紙點了還是會唸
for (const v of [...VOCAB, ...DEFERRED_VOCAB]) {
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
// 家長勾掉預設例子時的替代例子（CAT_EXAMPLES 後面的候選字）：A butterfly can | fly. ／ A butterfly can fly, | too!
const CAT_ANY: Record<Tag, [string, string]> = {
  fly: ['{A} {w} can | fly.', '{A} {w} can fly, | too!'],
  water: ['{A} {w} goes in the | water.', '{A} {w} goes in the water, | too!'],
  wheels: ['{A} {w} has | wheels.', '{A} {w} has wheels, | too!'],
  legs4: ['{A} {w} has | four legs.', '{A} {w} has four legs, | too!'],
  eat: ['We can eat {a} | {w}.', 'We can eat {a} {w}, | too!'],
}
const fillIn = (t: string, en: string) => t.replace('{A}', cap(an(en))).replace('{a}', an(en)).replace('{w}', en)
for (const [tag, ids] of Object.entries(CAT_EXAMPLES) as [Tag, string[]][])
  for (const id of ids)
    for (const pos of [0, 1]) {
      const key = catLine(tag, id, pos)
      if (key !== `teach.cat.${tag}.${pos}`) def(key, 'momo', fillIn(CAT_ANY[tag][pos], vocab(id).en))
    }

// ── 單字：「這是 ___」全站只用這一種說法（教學卡多教一個字、答錯更正、學習單點錯時唸名字）──
// 由這個字最常出現的那一站的主持人唸（動物村的詞是莫莫，和 z.itis.* 同一段音檔；字母森林是豆豆；學習單是波波）
const voiceOf = (where: string): Speaker => (where === '動物村' ? 'momo' : where === '字母森林' ? 'dodo' : 'bobo')
for (const w of LEXICON) def(thisIs(w.key), voiceOf(w.where[0]), thisIsText(w))

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
