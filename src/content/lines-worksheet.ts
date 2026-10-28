// 工作線 B：學習單題型的台詞（找出全部、用筆圈起來、立體形狀、功能分類、塗格子、給波波蛋、一眼看出幾個）
// 全部英文短句；`|` 之後是加重的目標字。前綴一律是 ws.（字幕不挖空）或 teach.ws.（教學句）
import { def } from './registry'
import { USE_TAGS, USE_EXAMPLES, useLine, vocab } from './vocab'
import { COLORS, SHAPES, SOLIDS, ACTIVE_SOLIDS, SOLID_LIKE } from './park'
import { CATEGORIES, USE_QUESTION, USE_TEACH, USE_TEACH_DEFAULT, type CategoryId } from './worksheet-data'

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
const SHAPE_PLURAL: Record<string, string> = { circle: 'circles', triangle: 'triangles', square: 'squares', star: 'stars', heart: 'hearts', rect: 'rectangles' }
const SOLID_PLURAL: Record<string, string> = { cube: 'blocks', sphere: 'balls', cylinder: 'cylinders', cone: 'cones', prism: 'prisms' }

// ── 開場 ───────────────────────────────────────────────────
def('ws.intro.findall', 'bobo', 'Find them all! Tap every one!')
// 圈圈看不用 circle 當動詞（circle 也是形狀的名字）：Use your pen! Go around them!
def('ws.intro.lasso', 'bobo', 'Use your pen! Go around them!')
def('ws.intro.solid', 'bobo', "Let's look at blocks!")
def('ws.intro.use', 'momo', "Let's think together.")
def('ws.intro.fill', 'bobo', 'Count them! Color one for each!')
def('ws.intro.give', 'bobo', "I'm hungry! Can I have some eggs?")
def('ws.intro.flash', 'bobo', 'Look fast! How many?')

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
def('ws.lasso.here', 'bobo', 'Go around each one!')
def('ws.lasso.close', 'bobo', 'Go all the way around!')
def('ws.lasso.around', 'bobo', 'Go around it!')

// ── 找出全部：類別 ─────────────────────────────────────────
// 找出全部、圈圈看用同一句（Find all the | apples!）；點錯時唸名字用 lex.this.*（This is a | ball.，lines.ts），只唸教過的字
for (const [id, c] of Object.entries(CATEGORIES) as [CategoryId, (typeof CATEGORIES)[CategoryId]][]) {
  def(`ws.all.${id}`, 'bobo', `Find all the | ${c.plural}!`)
  def(`ws.circle.${id}`, 'bobo', `Find all the | ${c.plural}!`)
  c.teach.forEach((t, i) => def(`teach.ws.${id}.${i}`, 'bobo', t))
}

// ── 找出全部：顏色（同色、不同形）──────────────────────────
for (const c of COLORS) {
  def(`ws.all.${c.id}`, 'bobo', `Find all the | ${c.en} ones!`)
  def(`ws.circle.${c.id}`, 'bobo', `Find all the | ${c.en} ones!`)
  def(`teach.ws.${c.id}.0`, 'bobo', `This balloon is | ${c.en}.`)
  // 第二個例子是熊形氣球：不說 bear（bear 是字母森林 b 的真的熊）
  def(`teach.ws.${c.id}.1`, 'bobo', `This balloon is ${c.en}, | too!`)
}

// ── 找出全部：平面形狀 ─────────────────────────────────────
for (const s of SHAPES) {
  if (s.id === 'rect') continue
  def(`ws.all.${s.id}`, 'bobo', `Find all the | ${SHAPE_PLURAL[s.id]}!`)
  def(`ws.circle.${s.id}`, 'bobo', `Find all the | ${SHAPE_PLURAL[s.id]}!`)
  def(`teach.ws.${s.id}.0`, 'bobo', `This is a | ${s.en}.`)
  def(`teach.ws.${s.id}.1`, 'bobo', `This is a ${s.en}, | too!`)
}

// ── 立體形狀（只有 block、ball；圓柱、圓錐、三角柱延後，不產生台詞）──────────
for (const s of SOLIDS.filter((x) => ACTIVE_SOLIDS.includes(x.id))) {
  def(`ws.all.${s.id}`, 'bobo', `Find all the | ${SOLID_PLURAL[s.id]}!`)
  def(`ws.circle.${s.id}`, 'bobo', `Find all the | ${SOLID_PLURAL[s.id]}!`)
  def(`ws.where.${s.id}`, 'bobo', `Where is the | ${s.en}?`)
  def(`ws.thisis.${s.id}`, 'bobo', `This is a | ${s.en}.`)
  def(`teach.ws.${s.id}.0`, 'bobo', `This is a | ${s.en}.`)
  def(`teach.ws.${s.id}.1`, 'bobo', SOLID_LIKE[s.id])
}

// ── 功能分類（動物村）──────────────────────────────────────
// 教學句：每個候選例子（vocab.ts 的 USE_EXAMPLES）在兩個位置各一句；預設的字用 teach.ws.<分類>.<位置>
for (const u of USE_TAGS) {
  def(`ws.all.${u}`, 'momo', USE_QUESTION[u])
  for (const id of USE_EXAMPLES[u])
    for (const pos of [0, 1]) {
      const key = useLine(u, id, pos)
      const v = vocab(id)
      const text = key === `teach.ws.${u}.${pos}` && USE_TEACH_DEFAULT[u]?.[id] ? USE_TEACH_DEFAULT[u][id] : USE_TEACH[u][pos].replace('{a}', an(v.en)).replace('{w}', v.en)
      def(key, 'momo', text)
    }
}

// ── 塗格子表示數量 ─────────────────────────────────────────
// 塗格子不用 circle、fill（circle 是形狀的名字）：Color one for each!
def('ws.fill.ask', 'bobo', 'Color one for each!')
def('ws.fill.more', 'bobo', 'Not yet! Color one for each.')
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
def('ws.flash.ask', 'bobo', 'How many?')
def('ws.flash.look', 'bobo', 'Look!')
def('ws.flash.peek', 'bobo', 'Tap the leaves!')
