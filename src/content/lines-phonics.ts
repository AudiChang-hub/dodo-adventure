// 字母森林：自然發音的台詞（PRD §6.1b）。全部用 ph. 開頭，字幕會把字表裡的字的開頭字母上色（見 subtitles.ts）。
// 「這個音」的寫法都實測過，理由寫在 letters.ts 的【語音】；字母和例字一起唸的格式在 phonics-cue.ts。
import { def } from './registry'
import { DEFERRED_PHONICS, PHONICS, PHONICS_WORDS, anchorOf, wordId, type SoundUnit } from './letters'
import { cueText } from './phonics-cue'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

def('ph.intro.start', 'dodo', "Let's listen to how words start!")
def('ph.intro.same', 'dodo', 'Find the words that start the same!')
def('ph.intro.letter', 'dodo', 'Listen, and find the letter!')

// 點名選項、教學卡上的每個字：Bus.
for (const { w } of PHONICS_WORDS) def(`ph.word.${wordId(w)}`, 'dodo', `${cap(w)}.`)

/** 字母名稱 ×3 → 字母音 → 代表字：S, S, S… sss… snake!（學習循環、貼紙本） */
const saysText = (u: SoundUnit) => cueText({ unit: u, names: 3, sound: true, word: anchorOf(u).w })

/**
 * 一個字配上這個音：S… sss… socks!（答對之後、單字卡）。
 * 只提這個字本身：畫面上只有這張圖時，不能再說「像 snake」（2026-10-29 家長回饋：ant 的題目說 like apple，畫面上沒有 apple）。
 * 這裡會一直出現，字母名稱只唸一次（三次太長，學習循環才唸三次）。
 */
export const echoText = (u: SoundUnit, w: string) => cueText({ unit: u, names: 1, sound: true, word: w })

for (const u of PHONICS) {
  const l = u.letter
  // 只有字母音：sss…、b, b, b…（題目、發現共同的開頭音時，只聽音，不說字母名稱）
  const snd = cueText({ unit: u, names: 0, sound: true })
  // 發現共同的開頭音（三個字剛唸完）
  def(`ph.${l}.discover`, 'dodo', `They all start with | ${snd}`)
  // 字母從單字裡飛出來：字母名稱 → 字母音 → 代表字
  def(`ph.${l}.says`, 'dodo', saysText(u))
  // 聽音找字母答對之後：畫面上只有字母卡（不一定有圖），只唸字母和字母音
  def(`ph.${l}.sound`, 'dodo', cueText({ unit: u, names: 1, sound: true }))
  def(`ph.${l}.q.start`, 'dodo', `Find the one that starts with | ${snd}`)
  // 聽音找字母：字幕若顯示 b, b, b…，孩子看字幕的第一個字母就能找到答案，所以這句要挖空。
  // 沿用既有的挖空前綴 en.where.（舊版「Where is | B?」也是這一類找字母的問題），不改挖空規則：
  // 題目時顯示「Find the letter that says ＿＿」，答對或重教時才補上
  def(`en.where.sound.${l}`, 'dodo', `Find the letter that says | ${snd}`)
  for (const { w } of [...u.keys, ...u.review]) def(`ph.${l}.echo.${wordId(w)}`, 'dodo', echoText(u, w))
}

// 延後的音（o、j、v、y）：字母森林不教，只留貼紙本點舊貼紙時唸的那一句（貼紙上的圖就是代表字）
for (const u of DEFERRED_PHONICS) def(`ph.${u.letter}.says`, 'dodo', saysText(u))

// 哪個跟 bus 開頭一樣？
for (const { w } of PHONICS_WORDS) def(`ph.same.${wordId(w)}`, 'dodo', `Which one starts like | ${w}?`)
