// 成就感強化的台詞：自己改正的稱讚、每局結束的一句話、里程碑、貼紙本、給爸爸看。
// 稱讚的是「努力、方法、自己改正」，不說「你好聰明」；每個時刻都有幾種說法輪流，聽久了不膩。
// 全部是給 3 歲聽的美式英文短句；`|` 之後是加重的目標字。
import { CHILD_EN } from '../lib/env'
import { def, type Speaker } from './registry'
import { FIX_STEPS } from './stickers'

const N = CHILD_EN
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const BIG: Record<number, string> = { 30: 'thirty', 50: 'fifty' }
const word = (n: number) => NUM[n] ?? BIG[n] ?? String(n)
const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']

/** 每一類各有幾種說法（遊戲端用 rand 挑） */
export const ACH_COUNT = { fix: 4, code: 3, round: 2, done: 3, master: 3 } as const

// ── 每一題：自己改正（錯了一次、自己再試就對了）──────────────────
// 取代那一題原本的稱讚，所以不會變長
const fix: Record<Speaker, string[]> = {
  dodo: ['You fixed it yourself!', 'You tried again, and you got it!', 'You kept trying. Yes!', 'Oops, then yes! You found it!'],
  bobo: ['You fixed it yourself!', 'You tried again, and you did it!', 'You kept going. Super!', 'You found it yourself!'],
  momo: ['You fixed it yourself.', 'You tried again, and you got it.', 'You kept trying. Well done.', 'You found it yourself.'],
}
// 程式車庫：開錯了，自己改卡片再開一次就到了
const code = ['You fixed the code!', 'You found the bug, and fixed it!', 'Fixed it! Great thinking!']

// ── 每局結束：一句講得出「這一局做了什麼」的話 ─────────────────
type RoundKind = 'fix' | 'new' | 'tricky' | 'all'
const round: Record<Speaker, Record<RoundKind, string[]>> = {
  dodo: {
    fix: ['When it was hard, you tried again!', 'You fixed it all by yourself!'],
    new: ['You learned something new!', 'A new one! You learned it!'],
    tricky: ['You did the tricky one!', 'Even the tricky one! Wow!'],
    all: ['You did every one by yourself!', 'You listened so carefully!'],
  },
  bobo: {
    fix: ['When it was hard, you kept going!', 'You fixed it all by yourself!'],
    new: ['You learned something new!', 'A new one! You learned it!'],
    tricky: ['You did the tricky one!', 'Even the tricky one! Wow!'],
    all: ['You did every one by yourself!', 'You looked so carefully!'],
  },
  momo: {
    fix: ['When it was hard, you tried again.', 'You fixed it all by yourself.'],
    new: ['You learned something new.', 'A new one. You learned it.'],
    tricky: ['You did the tricky one.', 'Even the tricky one. Wonderful.'],
    all: ['You did every one by yourself.', 'You listened so carefully.'],
  },
}
const done: Record<Speaker, string[]> = {
  dodo: ['Look at all your stars!', 'You worked so hard!', `Great playing, ${N}!`],
  bobo: ['Look at all your stars!', 'You worked so hard!', `Great playing, ${N}!`],
  momo: ['Look at all your stars.', 'You worked so hard.', `Well played, ${N}.`],
}
const roundCode = ['You fixed your code, and the car made it!', 'You found the bug, and fixed it!']

// ── 里程碑：學會一個東西、升一級、修好好幾個程式 ────────────────
// 很短的一句，接著念學會的東西的名字（S, like Ssssnake!）：整段慶祝控制在 3 秒多一點。
// 學會的東西不再直接變成貼紙（2026-10-28 改成集星星挑貼紙），所以不說 A new sticker!
const master: Record<Speaker, string[]> = {
  dodo: ['All by yourself!', 'You learned it!', 'Now you know it!'],
  bobo: ['All by yourself!', 'You learned it!', 'Now you know it!'],
  momo: ['All by yourself.', 'You learned it.', 'Now you know it.'],
}

for (const s of SPEAKERS) {
  fix[s].forEach((t, i) => def(`ach.fix.${s}.${i}`, s, t))
  for (const [k, ts] of Object.entries(round[s])) ts.forEach((t, i) => def(`ach.round.${k}.${s}.${i}`, s, t))
  done[s].forEach((t, i) => def(`ach.round.done.${s}.${i}`, s, t))
  master[s].forEach((t, i) => def(`ach.master.${s}.${i}`, s, t))
  // 難度用星星表示（站點的遊戲卡也是星星）：升到第 n 級就是 n 顆星
  for (let n = 2; n <= 6; n++) def(`ach.level.${s}.${n}`, s, s === 'momo' ? `Level up. Now you have | ${NUM[n]} stars.` : `Level up! Now you have | ${NUM[n]} stars!`)
}
code.forEach((t, i) => def(`ach.code.${i}`, 'bobo', t))
roundCode.forEach((t, i) => def(`ach.round.code.bobo.${i}`, 'bobo', t))
for (const n of FIX_STEPS) def(`ach.fixes.${n}`, 'bobo', n === 1 ? 'You fixed your | first program!' : `You fixed | ${word(n)} programs!`)

// ── 貼紙本：點 v1 舊貼紙時說它是什麼（其餘沿用教學卡的句子；挑選式貼紙的台詞在 lines-stickers.ts）────────────
def('ach.book.hi', 'dodo', 'These are your stickers! Tap one!')
for (let n = 1; n <= 20; n++) {
  def(`stk.num.${n}`, 'bobo', `Number | ${NUM[n]}!`)
  def(`stk.count.${n}`, 'bobo', `You counted | ${NUM[n]}!`)
}
for (let n = 2; n <= 10; n++) def(`stk.order.${n}`, 'bobo', `One to | ${NUM[n]}, in order!`)
for (let n = 2; n <= 3; n++) def(`stk.route.${n}`, 'bobo', `You can use | ${NUM[n]} cards!`)
def('stk.pattern', 'bobo', 'You found the | pattern!')
def('stk.seq', 'bobo', 'You put it in | order!')
def('stk.trace', 'dodo', 'You drove the road with your | pen!')
for (let n = 2; n <= 6; n++) def(`stk.stars.${n}`, 'dodo', `Wow, | ${NUM[n]} stars!`)

// ── 今日冒險的結尾：給爸爸看 ─────────────────────────────────
def('ach.showdad', 'dodo', "Let's show Daddy what you did!")
def('ach.recap.hi', 'dodo', 'Daddy, look! We did so much today!')
def('ach.recap.friend', 'dodo', 'And a new friend!')
def('ach.recap.end', 'dodo', 'High five!')
