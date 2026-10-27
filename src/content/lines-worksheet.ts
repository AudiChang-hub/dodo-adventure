// 工作線 B：學習單題型的台詞（找出全部、用筆圈起來、立體形狀、功能分類、塗格子、給波波蛋、一眼看出幾個）
// 全部英文短句；`|` 之後是加重的目標字。前綴一律是 ws.（字幕不挖空）或 teach.ws.（教學句）
import { def } from './registry'
import { VOCAB, USE_TAGS } from './vocab'
import { COLORS, SHAPES, SOLIDS, SOLID_LIKE } from './park'
import { CATEGORIES, SHEET_NAMES, PLURAL_NAMES, USE_QUESTION, USE_TEACH, type CategoryId } from './worksheet-data'

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
const SHAPE_PLURAL: Record<string, string> = { circle: 'circles', triangle: 'triangles', square: 'squares', star: 'stars', heart: 'hearts', rect: 'rectangles' }
const SOLID_PLURAL: Record<string, string> = { cube: 'cubes', sphere: 'spheres', cylinder: 'cylinders', cone: 'cones', prism: 'prisms' }

// ── 開場 ───────────────────────────────────────────────────
def('ws.intro.findall', 'bobo', 'Find them all! Tap every one!')
def('ws.intro.lasso', 'bobo', 'Get your pen! Draw a circle around them!')
def('ws.intro.solid', 'bobo', "Let's look at blocks!")
def('ws.intro.use', 'momo', "Let's think. What do we use?")
def('ws.intro.fill', 'bobo', 'Count them, then fill the circles!')
def('ws.intro.give', 'bobo', "I'm hungry! Can I have some eggs?")
def('ws.intro.flash', 'bobo', 'Look fast! How many dots?')

// ── 找出全部：通用回饋 ─────────────────────────────────────
const voice: Record<'bobo' | 'momo', { here: string; done: string; left: string[] }> = {
  bobo: { here: 'Here they are! Tap them all!', done: 'You found them all!', left: ['One more!', 'Two more!', 'Three more!'] },
  momo: { here: 'Here they are. Tap them all.', done: 'You found them all.', left: ['One more.', 'Two more.', 'Three more.'] },
}
for (const s of ['bobo', 'momo'] as const) {
  def(`ws.here.${s}`, s, voice[s].here)
  def(`ws.done.${s}`, s, voice[s].done)
  voice[s].left.forEach((t, i) => def(`ws.left.${s}.${i + 1}`, s, t))
}
// 莫莫找到一個就數一個（波波沿用 m.num.*）
for (let n = 1; n <= 6; n++) def(`ws.num.momo.${n}`, 'momo', `${cap(NUM[n])}.`)
def('ws.lasso.here', 'bobo', 'Draw a circle around each one!')
def('ws.lasso.close', 'bobo', 'Go all the way around!')
def('ws.lasso.around', 'bobo', 'Draw a circle around it!')

// ── 找出全部：類別 ─────────────────────────────────────────
for (const [id, c] of Object.entries(CATEGORIES) as [CategoryId, (typeof CATEGORIES)[CategoryId]][]) {
  def(`ws.all.${id}`, 'bobo', `Find all the | ${c.plural}!`)
  def(`ws.circle.${id}`, 'bobo', `Circle all the | ${c.plural}!`)
  c.teach.forEach((t, i) => def(`teach.ws.${id}.${i}`, 'bobo', t))
}

/** 點錯時說出那是什麼：That's a | ball. */
const nameOf = (icon: string) => VOCAB.find((v) => v.icon === icon)?.en ?? SHEET_NAMES[icon]
const named = new Set<string>()
for (const c of Object.values(CATEGORIES))
  for (const icon of [...c.easy, ...c.hard, ...c.targets]) {
    const n = nameOf(icon)
    if (!n || named.has(icon)) continue
    named.add(icon)
    def(`ws.isa.${icon}`, 'bobo', PLURAL_NAMES.has(n) ? `Those are | ${n}.` : `That's ${an(n)} | ${n}.`)
  }

// ── 找出全部：顏色（同色、不同形）──────────────────────────
for (const c of COLORS) {
  def(`ws.all.${c.id}`, 'bobo', `Find all the | ${c.en} ones!`)
  def(`ws.circle.${c.id}`, 'bobo', `Circle all the | ${c.en} ones!`)
  def(`teach.ws.${c.id}.0`, 'bobo', `This balloon is | ${c.en}.`)
  def(`teach.ws.${c.id}.1`, 'bobo', `This bear is ${c.en}, | too!`)
}

// ── 找出全部：平面形狀 ─────────────────────────────────────
for (const s of SHAPES) {
  if (s.id === 'rect') continue
  def(`ws.all.${s.id}`, 'bobo', `Find all the | ${SHAPE_PLURAL[s.id]}!`)
  def(`ws.circle.${s.id}`, 'bobo', `Circle all the | ${SHAPE_PLURAL[s.id]}!`)
  def(`teach.ws.${s.id}.0`, 'bobo', `This is a | ${s.en}.`)
  def(`teach.ws.${s.id}.1`, 'bobo', `This is a ${s.en}, | too!`)
}

// ── 立體形狀 ───────────────────────────────────────────────
for (const s of SOLIDS) {
  def(`ws.all.${s.id}`, 'bobo', `Find all the | ${SOLID_PLURAL[s.id]}!`)
  def(`ws.circle.${s.id}`, 'bobo', `Circle all the | ${SOLID_PLURAL[s.id]}!`)
  def(`ws.where.${s.id}`, 'bobo', `Where is the | ${s.en}?`)
  def(`ws.thisis.${s.id}`, 'bobo', `This is a | ${s.en}.`)
  def(`teach.ws.${s.id}.0`, 'bobo', `This is a | ${s.en}.`)
  def(`teach.ws.${s.id}.1`, 'bobo', SOLID_LIKE[s.id])
}

// ── 功能分類（動物村）──────────────────────────────────────
for (const u of USE_TAGS) {
  def(`ws.all.${u}`, 'momo', USE_QUESTION[u])
  USE_TEACH[u].forEach((t, i) => def(`teach.ws.${u}.${i}`, 'momo', t))
}

// ── 塗格子表示數量 ─────────────────────────────────────────
def('ws.fill.ask', 'bobo', 'Fill one circle for each!')
def('ws.fill.more', 'bobo', 'Not yet! Fill one for each.')
def('ws.fill.toomany', 'bobo', 'Oops, too many! Take one away.')
def('ws.check', 'bobo', 'All done? Tap the check!')
def('ws.count', 'bobo', "Let's count!")

// ── 給波波 N 顆蛋（數量感）─────────────────────────────────
for (let n = 1; n <= 10; n++) {
  def(`ws.give.${n}`, 'bobo', n === 1 ? 'Give me | one egg!' : `Give me | ${NUM[n]} eggs!`)
  def(`ws.want.${n}`, 'bobo', n === 1 ? 'I want | one egg.' : `I want | ${NUM[n]} eggs.`)
}
def('ws.give.more', 'bobo', 'More, please!')
def('ws.give.toomany', 'bobo', 'Oops, too many!')
def('ws.give.takeout', 'bobo', 'Take one out!')
def('ws.give.thanks', 'bobo', 'Yum! Thank you!')

// ── 一眼看出幾個（subitizing）──────────────────────────────
def('ws.flash.ask', 'bobo', 'How many dots?')
def('ws.flash.look', 'bobo', 'Look!')
def('ws.flash.peek', 'bobo', 'Tap the leaves to peek!')
