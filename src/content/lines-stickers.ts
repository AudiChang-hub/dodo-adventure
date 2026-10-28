// 貼紙卡與挑貼紙的台詞（2026-10-28 家長：「貼紙的獲得途徑不夠明確」「樣式可以讓他選」）。
// 孩子不識字，獲得途徑全部靠畫面和這幾句話：每一關結束告訴他「再幾顆星就有貼紙」，集滿了請他自己挑一張。
// 感嘆詞只用溫和的（Hooray!、Ooh!、Look!），不用 Yay!、Wow!。
import { def, type Speaker } from './registry'
import { STICKER_ART } from './sticker-art'

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
def('stk.pick.again', 'dodo', 'Tap it again to keep it!')
def('stk.pick.more', 'dodo', 'Look! || New stickers!')
def('stk.pick.keep', 'dodo', 'Hooray! || Into your sticker book!')
def('stk.pick.another', 'dodo', 'Ooh! || One more sticker for you!')
// 很久沒選：溫和地鼓勵，不替他選
def('stk.pick.idle.0', 'dodo', 'Take your time. Which one do you like?')
def('stk.pick.idle.1', 'dodo', 'You can pick one now, or later!')
def('stk.pick.later', 'dodo', 'Okay! Your sticker will wait for you!')
// 還沒挑的貼紙：今日回顧、貼紙本裡那張發光的卡片
def('stk.wait', 'dodo', 'Look! || A sticker is waiting for you!')

// ── 點貼紙念它的英文名字（順便學詞彙）──────────────────────────────
// 「這是 ___」全站只用一種說法（2026-10-28 單字盤點第 4 章）：This is a | dog! ／ These are | grapes!
const PLURAL = new Set(['grapes', 'cherries'])
const PROPER = new Set(['T-rex'])
for (const a of STICKER_ART) {
  const raw = a.en.replace(/!$/, '')
  const name = PROPER.has(raw) ? raw : raw.toLowerCase()
  def(`stk.art.${a.id}`, 'dodo', PLURAL.has(name) ? `These are | ${name}!` : `This is ${/^[aeiou]/i.test(name) ? 'an' : 'a'} | ${name}!`)
}
