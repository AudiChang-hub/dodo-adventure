// 英文字母課的台詞（豆豆）。content/lines.ts import 這個檔，npm run audio 才會產生音檔。
// 字母和例字的念法（A, A, A… a, a… apple!）沿用字母森林的 ph.<字母>.says（lines-phonics.ts）；字母森林沒有的字母在這裡補。
// key 用 ph. 開頭的字幕會把今天的字母上色、念法分三種樣子（content/subtitles.ts）；問「哪一個是 A」的用 en.where. 開頭，字幕會挖空答案。
import { def, defBridge, hasLine, line } from '../../content/registry'
import { cueText } from '../../content/phonics-cue'
import { keyword } from '../../content/keywords'
import { lexWord, wordKey } from '../../content/lexicon'
import { bridgeKey } from '../../content/zh-words'
import { LESSON_LETTERS, wordId } from './data'
import { EXTRA_PHONICS } from './letters-extra'
import { onsetOf } from './stage4'

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
// 上完只說 You did it!（T-141：以前接著說 See you tomorrow!，孩子聽了以為結束了，先按返回；道別留給下課畫面的 Good night）
def('le.en.done', 'dodo', 'You did it!')

// T-147 英文門案 A：泡泡派對（上完一堂的慶祝）、字母遊戲時間（字母牆、放進籃子、翻翻卡）
def('en.party', 'dodo', 'Pop the bubbles!')
def('en.abc.go', 'dodo', "Let's play ABC!")
def('en.abc.flip', 'dodo', 'Find a match!')

for (const x of LESSON_LETTERS) {
  const { L, l } = x
  // 泡泡派對點破一顆、翻翻卡翻到字母卡：只念字母名（A…），跟認字母同一種念法。
  // 沒有字母音的字母（q、v、x）ph.<x>.sound 已經是同一句 Q…：照它的寫法登記（cueText 同一句只能有一種寫法）
  def(`en.pop.${l}`, 'dodo', cueText({ unit: x.unit, names: 1, sound: x.unit.sound.kind === 'none' }))
  // 聽字找圖（家長 2026-11-14：拿掉「哪個是 A 開頭」）：Where's the apple?，只用教過的 2 個代表字。
  // 冠詞照 findWord：沒有冠詞的字（up、zero…）不加 the
  // T-150 E 更多單字：新朋友教過的第 3 個字也會出現在聽字找圖（quiet 不當新朋友教，abc.ts 的 NOT_NEW）
  for (const { w } of x.words) if (w !== 'quiet') def(`en.where.word.${wordId(w)}`, 'dodo', BARE.has(w) && w !== 'ice cream' ? `Where is | ${w}?` : `Where's the | ${w}?`)
  // 答對時念的「A… a, a…」：字母森林延後的 o、j、v、y 沒有這一句
  if (!hasLine(`ph.${l}.sound`)) def(`ph.${l}.sound`, 'dodo', cueText({ unit: x.unit, names: 1, sound: true }))
  def(`ph.${l}.today`, 'dodo', `Today's letter is | ${L}!`)
  def(`ph.${l}.again`, 'dodo', `Let's practice | ${L} again!`)
  // 隔天重上同一個字母（T-127）：開場換一句，不要跟第一天一字不差
  def(`ph.${l}.back`, 'dodo', `Look! | ${L} is back!`)
  def(`ph.${l}.big`, 'dodo', `Big | ${L}!`)
  def(`ph.${l}.little`, 'dodo', `Little | ${l}!`)
  def(`ph.${l}.words`, 'dodo', x.starts.length === 3 ? `These words start with | ${L}!` : `Find ${L} in these words!`)
  def(`ph.${l}.q.word`, 'dodo', `Which one starts with | ${L}?`)
  // 找開頭音的圖（T-109；T-147 家長 2026-11-14 拿掉了這種題目，台詞先留著、下一版再刪）：先念字母和它的音（S… s, s…，跟答對時那一句同一段音檔），再問 Which one starts with S?。
  // 另外取一個名字，免得答對後念的那一句也被當成「題目念完了」
  def(`ph.${l}.ask`, 'dodo', line(`ph.${l}.sound`).text)
  // 關鍵字是字母名和第一個音（S… s,），不用等 s, s… 全部念完（content/keywords.ts）
  keyword(`ph.${l}.ask`, 2)
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

// T-150 E 4 歲內容：字母遊戲時間的新朋友（第 3 個字），和第三種遊戲「聽開頭」（abc.ts 的 makeOnsets）。
def('en.abc.new', 'dodo', 'A new friend!')
const unitOf = (l: string) => LESSON_LETTERS.find((x) => x.l === l)?.unit
for (const x of LESSON_LETTERS) {
  // 聽開頭的問題只念音、不念字母名：Find the one that starts with | a, a…（字母森林教過的字母已經有這一句，沒有的在這裡補；沒有字母音的 q、v、x 不問）
  if (x.unit.sound.kind !== 'none' && !hasLine(`ph.${x.l}.q.start`)) def(`ph.${x.l}.q.start`, 'dodo', `Find the one that starts with | ${cueText({ unit: x.unit, names: 0, sound: true })}`)
  // 答對時念的：A… a, a… apple!（開頭音 + 字；fox 雖然是 X 教的，開頭音是 f，key 用 ph.f.echo.fox）
  for (const { w } of x.words) {
    const o = onsetOf(wordId(w))
    const u = o ? unitOf(o) : undefined
    if (o && u && u.sound.kind !== 'none' && !hasLine(`ph.${o}.echo.${wordId(w)}`)) def(`ph.${o}.echo.${wordId(w)}`, 'dodo', cueText({ unit: u, names: 1, sound: true, word: w }))
  }
}
