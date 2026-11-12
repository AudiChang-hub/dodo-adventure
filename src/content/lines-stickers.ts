// 貼紙卡與挑貼紙的台詞（2026-10-28 家長：「貼紙的獲得途徑不夠明確」「樣式可以讓他選」）。
// 孩子不識字，獲得途徑全部靠畫面和這幾句話：每一關結束告訴他「再幾顆星就有貼紙」，集滿了請他自己挑一張。
// 感嘆詞只用溫和的（Hooray!、Ooh!、Look!），不用 Yay!、Wow!。
import { def, defBridge, type Speaker } from './registry'
import { STICKER_ART, artOf, type ArtCat } from './sticker-art'
import { ZH_WORDS } from './zh-words'

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five']
const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']

// ── 每一關結束：卡片上的星星（主持這一站的恐龍說）──────────────────
for (const s of SPEAKERS) {
  const calm = s === 'momo'
  for (let n = 1; n <= 5; n++) {
    const star = n === 1 ? 'star' : 'stars'
    def(`stk.card.left.${s}.${n}`, s, `${NUM[n][0].toUpperCase()}${NUM[n].slice(1)} more ${star}, and you get a sticker${calm ? '.' : '!'}`)
  }
  def(`stk.card.full.${s}`, s, calm ? 'Ooh. || Five stars. You get a sticker.' : 'Hooray! || Five stars! You get a sticker!')
}

// ── 挑貼紙（豆豆陪他挑，貼紙本也是豆豆在介紹）────────────────────
def('stk.pick.hi', 'dodo', 'Ooh! || Pick a sticker you like!')
// 3 歲聽得懂的短句（PHASE-6 ≤ 6 字；T-90：「Tap it again to keep it」聽不懂），說的同時手在那張貼紙上再點一下
def('stk.pick.again', 'dodo', 'Tap it again!')
def('stk.pick.more', 'dodo', 'Look! || New stickers!')
def('stk.pick.keep', 'dodo', 'Hooray! || Into your sticker book!')
def('stk.pick.another', 'dodo', 'Ooh! || One more sticker for you!')
// 很久沒選：溫和地鼓勵，不替他選
def('stk.pick.idle.0', 'dodo', 'Take your time. Which one do you like?')
def('stk.pick.idle.1', 'dodo', 'You can pick one now, or later!')
def('stk.pick.later', 'dodo', 'Okay! Your sticker will wait for you!')

// ── 貼紙本（T-132，首頁牆上的貼紙板點進去；只看不改）──────────────────
// 還沒有貼紙時不說「上完課就有」：貼紙是不定時出現的，事先不說（T-87）
def('stk.book.hi', 'dodo', 'Look! || Your stickers! Tap one!')
def('stk.book.empty', 'dodo', 'Your stickers will go here!')
// 空的貼紙本：帶他回去玩（T-135，AI 小男生盲測：點灰貼紙沒回應就走了）。只說「去玩」，不說哪一堂、什麼時候會有
def('stk.book.go', 'dodo', "Let's go play! Stickers come when you play!")
// 點灰貼紙、點空白處、點豆豆：輪流說，本子上的三扇門跳一下（T-141：以前是「Tap the house!」叫他點返回鍵，
// 盲測 c9bb003 看到的是按返回離開、回首頁還要再找門；改成本子上就有門，一步進課）
def('stk.book.poke.0', 'dodo', "Hmm... || Not yet! Let's go play!")
def('stk.book.poke.1', 'dodo', "Look! || Pick one! Let's go play!")
// 貼紙本裡每一張都點過一次（T-141：點了好多次都一樣）：大家一起跳一下
def('stk.book.all', 'dodo', 'Hooray! || So many stickers!')

// ── 點貼紙念它的英文名字（順便學詞彙）──────────────────────────────
// 「這是 ___」全站只用一種說法（2026-10-28 單字盤點第 4 章）：This is a | dog! ／ These are | grapes!
const PLURAL = new Set(['grapes', 'cherries'])
const PROPER = new Set(['T-rex'])
for (const a of STICKER_ART) {
  const raw = a.en.replace(/!$/, '')
  const name = PROPER.has(raw) ? raw : raw.toLowerCase()
  def(`stk.art.${a.id}`, 'dodo', PLURAL.has(name) ? `These are | ${name}!` : `This is ${/^[aeiou]/i.test(name) ? 'an' : 'a'} | ${name}!`)
}

// ── 貼紙本：名字的單字三明治（T-139：This is a | lion! → 獅子 → Lion.）──────────────
// 只用已經有中文音檔的詞：中文跟課程教同一個英文字時用的一樣（同一個音檔，content/zh-words.ts），不然用貼紙的中文名。
// 貼紙不放進 ZH_WORDS（gen_zh_words.py 的清單），所以不會因為貼紙去產生新的中文語音；
// 播的時候再看 public/audio/zh/index.json 有沒有這個中文（lib/words.ts 的 zhClipReady），沒有就只念英文。
const ZH_BY_EN = new Map<string, string>()
for (const w of ZH_WORDS) {
  const en = w.en.replace(/[.!]+$/, '').toLowerCase()
  if (!ZH_BY_EN.has(en)) ZH_BY_EN.set(en, w.zh)
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
/** 貼紙名字的中文（三明治用）；不是圖庫貼紙（v1 的舊貼紙）回傳 undefined */
export function stickerZh(art: string | undefined): string | undefined {
  const a = art ? artOf(art) : undefined
  return a && (ZH_BY_EN.get(a.en.replace(/!$/, '').toLowerCase()) ?? a.zh)
}
/** 貼紙名字三明治的台詞 key（中文 → 停一下 → 英文再唸一次） */
export const stickerBridge = (art: string) => `zh.dodo.sticker.${art}`
for (const a of STICKER_ART) {
  const raw = a.en.replace(/!$/, '')
  defBridge(stickerBridge(a.id), 'dodo', stickerZh(a.id)!, `${PROPER.has(raw) ? raw : cap(raw.toLowerCase())}.`)
}

// ── 貼紙本：同一張再點一下的狀聲詞（T-139：點久了「一直點都一樣」）──────────────
// 跟著那一類的動作（screens/sticker-book.ts 的 CAT_MOVE）：恐龍踩踩、車子開走、動物跳跳、海裡游游……
export const ACT_LINE: Record<ArtCat, string> = {
  dino: 'Stomp, stomp! Roar!',
  car: 'Vroom, vroom!',
  animal: 'Hop, hop, hop!',
  sea: 'Splish, splash!',
  bug: 'Buzz, buzz!',
  fruit: 'Yum, yum, yum!',
  treat: 'Yummy!',
  sky: 'Up, up, up!',
  toy: 'Bounce, bounce!',
}
for (const [cat, text] of Object.entries(ACT_LINE)) def(`stk.act.${cat}`, 'dodo', text)
