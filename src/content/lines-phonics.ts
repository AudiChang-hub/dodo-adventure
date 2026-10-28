// 字母森林：自然發音的台詞（PRD §6.1b）。全部用 ph. 開頭，字幕會把字表裡的字的開頭字母上色（見 subtitles.ts）。
// 「這個音」的寫法都實測過，理由寫在 letters.ts 的【語音】。
import { def } from './registry'
import { DEFERRED_PHONICS, PHONICS, PHONICS_WORDS, cueText, cueWord, upper, wordId, type SoundUnit } from './letters'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

def('ph.intro.start', 'dodo', "Let's listen to how words start!")
def('ph.intro.same', 'dodo', 'Find the words that start the same!')
def('ph.intro.letter', 'dodo', 'Listen, and find the letter!')

// 點名選項、教學卡上的每個字：Bus.
for (const { w } of PHONICS_WORDS) def(`ph.word.${wordId(w)}`, 'dodo', `${cap(w)}.`)

/** 一個字配上這個音：Ball! | buh, buh, ball! ／ Sun starts like | Ssssnake! */
export function echoText(u: SoundUnit, w: string): string {
  const c = u.cue
  if (c.kind === 'sound') return `${cap(w)}! | ${c.repeat === 2 ? `${c.say}, ${c.say}` : c.say}, ${w}!`
  if (w === cueWord(u)) return `${cap(w)}! | ${cap(cueText(u))}!`
  return `${cap(w)} starts like | ${cueText(u)}!`
}

for (const u of PHONICS) {
  const l = u.letter
  const U = upper(l)
  const cue = cueText(u)
  const isSound = u.cue.kind === 'sound'
  // 發現共同的開頭音（三個字剛唸完）
  def(`ph.${l}.discover`, 'dodo', isSound ? `They all start with | ${cue}!` : `They all start like | ${cue}!`)
  // 字母從單字裡飛出來：先學字母音，字母名稱（B）自然帶入
  def(`ph.${l}.says`, 'dodo', isSound ? `${U} says | ${cue}!` : `${U}, like | ${cue}!`)
  // 用祈使句、以「!」結尾：實測「Vvvvan?」「eh?」這種問句語調會把拉長的開頭音吃掉，「!」版本才唸得對
  def(`ph.${l}.q.start`, 'dodo', isSound ? `Find the one that starts with | ${cue}!` : `Find the one that starts like | ${cue}!`)
  // 聽音找字母：字幕若顯示 buh、apple，孩子看字幕的第一個字母就能找到答案，所以這句要挖空。
  // 沿用既有的挖空前綴 en.where.（舊版「Where is | B?」也是這一類找字母的問題），不改挖空規則：
  // 題目時顯示「Find the letter that says ＿＿!」，答對或重教時才補上 buh!
  def(`en.where.sound.${l}`, 'dodo', isSound ? `Find the letter that says | ${cue}!` : `Find the letter at the start of | ${cue}!`)
  for (const { w } of [...u.keys, ...u.review]) def(`ph.${l}.echo.${wordId(w)}`, 'dodo', echoText(u, w))
}

// 延後的音（o、j、v、y）：字母森林不教，只留貼紙本點舊貼紙時唸的那一句
for (const u of DEFERRED_PHONICS) def(`ph.${u.letter}.says`, 'dodo', u.cue.kind === 'sound' ? `${upper(u.letter)} says | ${cueText(u)}!` : `${upper(u.letter)}, like | ${cueText(u)}!`)

// 哪個跟 bus 開頭一樣？
for (const { w } of PHONICS_WORDS) def(`ph.same.${wordId(w)}`, 'dodo', `Which one starts like | ${w}?`)
