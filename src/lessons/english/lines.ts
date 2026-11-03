// 英文字母課的台詞（豆豆）。content/lines.ts import 這個檔，npm run audio 才會產生音檔。
// 字母和例字的念法（A, A, A… a, a… apple!）沿用字母森林的 ph.<字母>.says（lines-phonics.ts）；字母森林沒有的字母在這裡補。
// key 用 ph. 開頭的字幕會把今天的字母上色、念法分三種樣子（content/subtitles.ts）；問「哪一個是 A」的用 en.where. 開頭，字幕會挖空答案。
import { def, defBridge, hasLine } from '../../content/registry'
import { cueText } from '../../content/phonics-cue'
import { lexWord, wordKey } from '../../content/lexicon'
import { bridgeKey } from '../../content/zh-words'
import { LESSON_LETTERS, wordId } from './data'
import { EXTRA_PHONICS } from './letters-extra'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

// 字母森林沒教的 i、u、q、x、z：念法和答對時的那一句
for (const u of EXTRA_PHONICS) {
  def(`ph.${u.letter}.says`, 'dodo', cueText({ unit: u, names: 3, sound: true, word: u.keys[0].w }))
  def(`ph.${u.letter}.sound`, 'dodo', cueText({ unit: u, names: 1, sound: true }))
}

/**
 * 答錯時的說明（A16）：說出孩子選的是什麼、要找的是什麼，例如 That's big B. → Find big A!（Quiz.tsx 的 wrongKeys）。
 * 單字題：That's a banana. → Find the apple!。冠詞照字決定（複數、the sun／the moon、沒有冠詞的字）。
 */
const PLURAL = new Set(['grapes', 'jeans', 'noodles', 'socks'])
const THE = new Set(['sun', 'moon'])
const BARE = new Set(['up', 'quiet', 'yarn', 'ice cream', 'zero'])
const thatWord = (w: string) =>
  PLURAL.has(w) ? `Those are | ${w}.` : THE.has(w) || BARE.has(w) ? `That's ${THE.has(w) ? 'the ' : ''}| ${w}.` : `That's ${/^(a|e|i|o|u(?!ni)|x-)/.test(w) ? 'an' : 'a'} | ${w}.`
const findWord = (w: string) => (BARE.has(w) && w !== 'ice cream' && w !== 'zero' ? `Find | ${w}!` : `Find the | ${w}!`)

def('le.en.write', 'dodo', "Let's write it!")
def('le.en.play', 'dodo', "Let's play!")
def('le.en.done', 'dodo', 'You did it! See you tomorrow!')

for (const x of LESSON_LETTERS) {
  const { L, l } = x
  // 答對時念的「A… a, a…」：字母森林延後的 o、j、v、y 沒有這一句
  if (!hasLine(`ph.${l}.sound`)) def(`ph.${l}.sound`, 'dodo', cueText({ unit: x.unit, names: 1, sound: true }))
  def(`ph.${l}.today`, 'dodo', `Today's letter is | ${L}!`)
  def(`ph.${l}.again`, 'dodo', `Let's practice | ${L} again!`)
  def(`ph.${l}.big`, 'dodo', `Big | ${L}!`)
  def(`ph.${l}.little`, 'dodo', `Little | ${l}!`)
  def(`ph.${l}.words`, 'dodo', x.starts.length === 3 ? `These words start with | ${L}!` : `Find ${L} in these words!`)
  def(`ph.${l}.q.word`, 'dodo', `Which one starts with | ${L}?`)
  def(`en.where.big.${L}`, 'dodo', `Where is big | ${L}?`)
  def(`en.where.little.${l}`, 'dodo', `Where is little | ${l}?`)
  def(`en.that.big.${L}`, 'dodo', `That's big | ${L}.`)
  def(`en.that.little.${l}`, 'dodo', `That's little | ${l}.`)
  def(`en.find.big.${L}`, 'dodo', `Find big | ${L}!`)
  def(`en.find.little.${l}`, 'dodo', `Find little | ${l}!`)
  for (const { w } of x.starts) {
    def(`en.that.word.${wordId(w)}`, 'dodo', thatWord(w))
    def(`en.find.word.${wordId(w)}`, 'dodo', findWord(w))
  }
  for (const { w } of x.words) {
    // 點名一個字：Apple.（字母森林有的就沿用同一句、同一個音檔）
    if (!hasLine(`ph.word.${wordId(w)}`)) def(`ph.word.${wordId(w)}`, 'dodo', `${cap(w)}.`)
    // 中文三明治：蘋果 → Apple.。單字表有中文、豆豆還沒有這一句的才補（中文音檔沒產生就自動只念英文）
    const key = wordKey(w)
    const zh = lexWord(key)?.zh?.replace(/\s+/g, '')
    if (zh && !hasLine(bridgeKey(key, 'dodo'))) defBridge(bridgeKey(key, 'dodo'), 'dodo', zh, `${cap(w)}.`)
  }
}
