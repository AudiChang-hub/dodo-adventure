// 程式車庫（PRD §10）的台詞：箭頭卡開車、找規律、排順序。主持是波波。
// 全部是給 3 歲聽的美式英文短句，一句盡量不超過 6 個字；`|` 之後是加重的目標字。
// 問題句（What comes next? / What comes first?）句中沒有答案，所以字幕不挖空，不用加進 subtitles.ts
import { def } from './registry'
import { ALL_STORIES, DIRS, DRIVE_TARGETS, PATTERN_TOKS } from './code'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

// ── 站點 ───────────────────────────────────────────────────
def('station.code', 'bobo', 'Next stop, | Code Garage!')
def('welcome.code', 'bobo', 'Welcome to Code Garage!')

// ── 箭頭卡開車 ─────────────────────────────────────────────
def('c.intro.drive', 'bobo', 'Help Dodo drive! Use the arrow cards!')
for (const t of DRIVE_TARGETS) def(`c.drive.to.${t.id}`, 'bobo', `Drive to the | ${t.en}!`)
def('c.drive.cards.2', 'bobo', 'Use | two cards!')
def('c.drive.cards.3', 'bobo', 'Use | three cards!')
def('c.drive.need', 'bobo', 'Put a card here!')
def('c.drive.go', 'bobo', 'Now tap Go!')
def('c.drive.made', 'bobo', 'We made it!')
def('c.drive.bump', 'bobo', 'Bump! Oops!')
def('c.drive.oops', 'bobo', 'Oops! Not there yet.')
// 早期的除錯：車子退回起點，程式還在，只要改一張卡
def('c.drive.fix', 'bobo', "Let's fix this card!")
for (const d of DIRS) {
  // 放卡、車子每走一步都念一次方向：方向的英文就這樣聽熟
  def(`c.dir.${d}`, 'bobo', `${cap(d)}!`)
  def(`c.teach.dir.${d}`, 'bobo', `This arrow says | ${d}!`)
  def(`c.teach.go.${d}`, 'bobo', `The car goes | ${d}!`)
  def(`c.teach.first.${d}`, 'bobo', `First, | ${d}!`)
  def(`c.teach.then.${d}`, 'bobo', `Then, | ${d}!`)
}

// ── 找規律 ─────────────────────────────────────────────────
def('c.intro.pattern', 'bobo', "Let's find the pattern!")
def('c.pat.what', 'bobo', 'What comes next?')
for (const t of PATTERN_TOKS) {
  // 一個字一句：教學卡指一個念一個，聽起來就是「Car! Dino! Car! Dino!」的節奏
  def(`c.name.${t.id}`, 'bobo', `${cap(t.en)}!`)
  def(`c.pat.next.${t.id}`, 'bobo', `Next is | ${t.en}!`)
}

// ── 排順序 ─────────────────────────────────────────────────
def('c.intro.seq', 'bobo', "Let's put the pictures in order!")
def('c.seq.first', 'bobo', 'What comes first?')
def('c.seq.next', 'bobo', 'What comes next?')
// 1、2 級（兩步的故事）不問問句，只說這一句（SequenceGame.tsx 的 question）
def('c.seq.help', 'bobo', 'Help Dodo!')
for (const s of ALL_STORIES) s.lines.forEach((t, i) => def(`c.seq.${s.id}.${i}`, 'bobo', t))
