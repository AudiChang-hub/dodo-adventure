import { CHILD_EN, CHILD_ZH } from '../lib/env'
import { LETTERS } from './letters'
import { VOCAB, TAG_QUESTION, type Tag } from './vocab'
import { COLORS, SHAPES } from './park'

export type Speaker = 'dodo' | 'bobo' | 'momo'
export type Lang = 'zh' | 'en'

export interface Line {
  speaker: Speaker
  lang: Lang
  text: string
}

const REG = new Map<string, Line>()

function def(key: string, speaker: Speaker, lang: Lang, text: string) {
  REG.set(key, { speaker, lang, text })
}

export function line(key: string): Line {
  const l = REG.get(key)
  if (!l) throw new Error(`Unknown line: ${key}`)
  return l
}

export const hasLine = (key: string) => REG.has(key)
export const allLines = () => [...REG.entries()]

const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
export function cnNum(n: number): string {
  if (n <= 10) return CN[n]
  if (n < 20) return '十' + CN[n - 10]
  return '二十'
}
/** 量詞前的「二」要說「兩」 */
export const cnQty = (n: number) => (n === 2 ? '兩' : cnNum(n))

const N = CHILD_ZH
const E = CHILD_EN

// ── 通用：稱讚、再試一次、提示 ─────────────────────────────
export const PRAISE_COUNT = 5
const praiseZh: Record<Speaker, string[]> = {
  dodo: ['好棒！', '答對了！', `${N}好厲害！`, '就是這個！', '哇，你好會喔！'],
  bobo: ['答對了！', '太厲害了！', `${N}，你好棒！`, '沒錯沒錯！', '耶！完全正確！'],
  momo: ['答對了喔。', '好棒喔。', `${N}真聰明。`, '就是它。', '你好認真喔。'],
}
for (const s of ['dodo', 'bobo', 'momo'] as Speaker[])
  praiseZh[s].forEach((t, i) => def(`praise.${s}.${i}`, s, 'zh', t))
;['Great job!', 'Yes!', `You got it, ${E}!`, 'Awesome!', 'Super!'].forEach((t, i) => def(`praise.en.${i}`, 'dodo', 'en', t))

export const RETRY_COUNT = 3
const retry: Record<Speaker, string[]> = {
  dodo: ['再找找看！', '嗯…再試一次！', '差一點點喔！'],
  bobo: ['沒關係，再試一次！', '再看一看！', '差一點點！'],
  momo: ['沒關係，慢慢來。', '再找找看喔。', '差一點點喔。'],
}
for (const s of ['dodo', 'bobo', 'momo'] as Speaker[]) {
  retry[s].forEach((t, i) => def(`retry.${s}.${i}`, s, 'zh', t))
  def(`hint.${s}`, s, 'zh', s === 'momo' ? '是這個喔，你點點看。' : '是這個喔！點點看！')
  def(`idle.${s}`, s, 'zh', s === 'momo' ? '要選哪一個呢？' : '要點哪一個呢？')
}
def('retry.en.0', 'dodo', 'en', "Let's try again!")

// ── 首頁、冒險流程 ─────────────────────────────────────────
def('home.hello', 'dodo', 'zh', `${N}你好！今天要跟豆豆一起去冒險嗎？`)
def('home.tapdodo', 'dodo', 'zh', '我是豆豆！我最喜歡開車車了！')
def('home.tapbobo', 'bobo', 'zh', '我是波波！我最喜歡數東西！')
def('home.tapmomo', 'momo', 'zh', '我是莫莫，我的脖子很長喔。')
def('adv.go', 'dodo', 'zh', '出發囉！')
def('adv.done', 'dodo', 'zh', `今天的冒險完成了！${N}好棒！`)
def('adv.again', 'dodo', 'zh', '今天已經冒險過了，我們去地圖上玩吧！')
def('station.english', 'dodo', 'zh', '下一站，字母森林！')
def('station.math', 'bobo', 'zh', '下一站，數字工地！')
def('station.mandarin', 'momo', 'zh', '下一站，動物村。')
def('station.draw', 'dodo', 'zh', '下一站，畫畫小屋！')
def('station.park', 'bobo', 'zh', '下一站，彩虹公園！')
def('welcome.english', 'dodo', 'zh', '歡迎來到字母森林！')
def('welcome.math', 'bobo', 'zh', '我是波波，歡迎來到數字工地！')
def('welcome.mandarin', 'momo', 'zh', '我是莫莫，歡迎來到動物村。')
def('welcome.draw', 'dodo', 'zh', '歡迎來到畫畫小屋！拿起筆來吧！')
def('welcome.park', 'bobo', 'zh', '歡迎來到彩虹公園！')
def('map.where', 'dodo', 'zh', '想去哪裡玩呢？')
def('map.locked', 'dodo', 'zh', '先完成今天的冒險，地圖就會打開喔！')
def('egg.crack', 'dodo', 'zh', '蛋蛋裂開了一點點！')
def('egg.ready', 'dodo', 'zh', '蛋蛋要孵出來了！點一點蛋蛋！')
def('egg.hatch', 'dodo', 'zh', '哇！是新朋友！')
def('collection.hi', 'dodo', 'zh', '這些都是你的好朋友！')
def('collection.empty', 'dodo', 'zh', '去冒險，就可以孵出新朋友喔！')
def('bedtime', 'dodo', 'zh', '豆豆有點睏了…我們明天再一起玩，好不好？晚安！')
def('challenge', 'dodo', 'zh', '最後一題比較難喔！')
def('challenge.bobo', 'bobo', 'zh', '最後一題，挑戰題來囉！')
def('challenge.momo', 'momo', 'zh', '最後一題比較難喔，加油。')
def('levelup', 'dodo', 'zh', '你變得好厲害，我們來玩難一點的！')
def('goodbye', 'dodo', 'zh', `掰掰${N}！`)
def('eye.break', 'dodo', 'zh', '眼睛累了嗎？我們一起看看遠遠的地方，讓眼睛休息一下！')
def('eye.done', 'dodo', 'zh', '眼睛休息好了！我們繼續冒險吧！')

// ── 字母森林（英文）────────────────────────────────────────
def('en.intro.find', 'dodo', 'zh', '我們來找字母！聽豆豆說，點對的字母喔！')
def('en.intro.pic', 'dodo', 'zh', '看看這個字母，幫它找到好朋友！')
def('en.intro.word', 'dodo', 'zh', '聽豆豆說英文，找出對的圖片！')
for (const { letter, word } of LETTERS) {
  const Word = word[0].toUpperCase() + word.slice(1)
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a'
  def(`en.where.${letter}`, 'dodo', 'en', `Where is ${letter}?`)
  def(`en.is.${letter}`, 'dodo', 'en', `${letter}. ${letter} is for ${word}!`)
  def(`en.word.${letter}`, 'dodo', 'en', `${Word}!`)
  def(`en.findword.${letter}`, 'dodo', 'en', `Where is the ${word}?`)
  def(`en.thisis.${letter}`, 'dodo', 'en', `This is ${letter}.`)
  def(`en.itis.${letter}`, 'dodo', 'en', `It's ${article} ${word}!`)
}

// ── 數字工地（數學）────────────────────────────────────────
def('m.intro.count', 'bobo', 'zh', '我們來數一數！一個一個點喔！')
def('m.intro.match', 'bobo', 'zh', '數數看有幾個，再點對的數字！')
def('m.intro.find', 'bobo', 'zh', '聽波波說，找出對的數字！')
def('m.intro.compare', 'bobo', 'zh', '兩邊比一比！')
def('m.intro.order', 'bobo', 'zh', '照順序點數字，從一開始！')
def('m.howmany', 'bobo', 'zh', '總共有幾個呢？')
def('m.more', 'bobo', 'zh', '哪一邊比較多呢？')
def('m.less', 'bobo', 'zh', '哪一邊比較少呢？')
def('m.this.more', 'bobo', 'zh', '這邊比較多！')
def('m.this.less', 'bobo', 'zh', '這邊比較少！')
def('m.order.start', 'bobo', 'zh', '從一開始，照順序點！')
def('m.count.go', 'bobo', 'zh', '點一點，一起數！')
for (let n = 1; n <= 20; n++) {
  def(`m.num.${n}`, 'bobo', 'zh', `${cnNum(n)}！`)
  def(`m.findnum.${n}`, 'bobo', 'zh', `${cnNum(n)}在哪裡？`)
  def(`m.total.${n}`, 'bobo', 'zh', `總共有${cnQty(n)}個！`)
  def(`m.thisis.${n}`, 'bobo', 'zh', `這是${cnNum(n)}。`)
  def(`dodo.num.${n}`, 'dodo', 'zh', `${cnNum(n)}！`)
}

// ── 動物村（國語）──────────────────────────────────────────
def('z.intro.find', 'momo', 'zh', '聽莫莫說，找出對的圖片喔。')
def('z.intro.category', 'momo', 'zh', '莫莫要考考你喔。')
def('z.intro.sound', 'momo', 'zh', '聽聽看，是誰在叫呢？')
for (const v of VOCAB) {
  def(`z.where.${v.id}`, 'momo', 'zh', `${v.zh}在哪裡？`)
  def(`z.itis.${v.id}`, 'momo', 'zh', `是${v.zh}喔。`)
  if (v.sound) def(`z.sound.${v.id}`, 'momo', 'zh', `${v.sound}！猜猜我是誰？`)
}
for (const [tag, q] of Object.entries(TAG_QUESTION) as [Tag, string][]) def(`z.cat.${tag}`, 'momo', 'zh', q)

// ── 彩虹公園（顏色、形狀、大小）────────────────────────────
def('p.intro.color', 'bobo', 'zh', '彩虹公園有好多顏色！')
def('p.intro.shape', 'bobo', 'zh', '我們來找形狀！')
def('p.intro.size', 'bobo', 'zh', '比比看，哪一個大，哪一個小！')
for (const c of COLORS) {
  def(`p.color.${c.id}`, 'bobo', 'zh', `${c.zh}色在哪裡？`)
  def(`p.thisis.color.${c.id}`, 'bobo', 'zh', `這是${c.zh}色。`)
}
for (const s of SHAPES) {
  def(`p.shape.${s.id}`, 'bobo', 'zh', `${s.zh}在哪裡？`)
  def(`p.thisis.shape.${s.id}`, 'bobo', 'zh', `這是${s.zh}。`)
}
def('p.bigger', 'bobo', 'zh', '哪一個比較大？')
def('p.smaller', 'bobo', 'zh', '哪一個比較小？')
def('p.this.bigger', 'bobo', 'zh', '這個比較大！')
def('p.this.smaller', 'bobo', 'zh', '這個比較小！')

// ── 畫畫小屋（運筆）────────────────────────────────────────
def('d.intro.trace', 'dodo', 'zh', '幫豆豆的車車開回家！用筆沿著小路畫過去！')
def('d.intro.dots', 'dodo', 'zh', '從一開始，把點點連起來，看看會變出什麼！')
def('d.intro.color', 'dodo', 'zh', '選一個顏色，點一點，幫它塗上顏色！')
def('d.intro.free', 'dodo', 'zh', '想畫什麼都可以喔！畫好了就點打勾。')
def('d.intro.glyph', 'dodo', 'zh', '從綠色的點開始，跟著箭頭畫！')
def('d.trace.done', 'dodo', 'zh', '到家了！謝謝你！')
def('d.trace.keep', 'dodo', 'zh', '繼續畫，車車還沒到家喔！')
def('d.dots.done', 'dodo', 'zh', '哇！變出來了！')
def('d.color.done', 'dodo', 'zh', '塗得好漂亮！')
def('d.free.done', 'dodo', 'zh', '畫得好棒！我幫你收進作品集了！')
def('d.glyph.done', 'dodo', 'zh', '寫得好棒！')
def('d.glyph.next', 'dodo', 'zh', '再畫下一筆！')
for (const d of ['triangle', 'square', 'house', 'fish', 'star', 'boat', 'heart', 'diamond'])
  def(`d.dots.is.${d}`, 'dodo', 'zh', `是${{ triangle: '三角形', square: '正方形', house: '房子', fish: '小魚', star: '星星', boat: '小船', heart: '愛心', diamond: '鑽石' }[d]}！`)
for (let n = 0; n <= 9; n++) def(`d.glyph.num.${n}`, 'dodo', 'zh', `這是${n === 0 ? '零' : cnNum(n)}。`)
