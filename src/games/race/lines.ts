// 恐龍賽跑棋（家長 2026-11-17）的台詞：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文、不說輸贏（沒有 You lose、I win）。
// content/lines.ts import 這個檔；只產這個檔的音檔：python scripts/gen_audio.py --only rc.
// 「Watch me!」「Your turn!」沿用 teach.watch.dodo、teach.turn.dodo。
import { def } from '../../content/registry'
import { REWARDS } from './data'
import { GOAL } from './plan'

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const Cap = (s: string) => s[0].toUpperCase() + s.slice(1)

def('rc.intro', 'dodo', "Dino race! Let's go!")
def('rc.roll', 'dodo', 'Roll the dice!')
/** 骰子停了、第一次走：點下一格就跳過去 */
def('rc.tap', 'dodo', 'Tap to hop!')
/** 豆豆擲骰子、走 */
def('rc.my', 'dodo', 'My turn!')
/** 跳過格子：一格一格走（不說錯） */
def('rc.one', 'dodo', 'One hop at a time!')
/** 孩子先到 */
def('rc.you', 'dodo', 'You made it! Wait for me!')
/** 豆豆先到：等他 */
def('rc.me', 'dodo', 'I made it! Come on!')
/** 兩隻都到了 */
def('rc.both', 'dodo', 'We both made it!')
def('rc.open', 'dodo', "Let's open it!")
def('rc.again', 'dodo', 'Race again?')

/** 走到第幾格：One! … Ten! */
export const numKey = (n: number) => `rc.n.${n}`
for (let n = 1; n <= GOAL; n++) def(numKey(n), 'dodo', `${Cap(NUM[n])}!`)
/** 骰子停在幾點：One hop! Two hops! */
export const hopsKey = (n: number) => `rc.hops.${n}`
for (let n = 1; n <= 6; n++) def(hopsKey(n), 'dodo', `${Cap(NUM[n])} ${n === 1 ? 'hop' : 'hops'}!`)
/** 禮物打開：We found a cake! */
export const gotKey = (id: string) => `rc.got.${id}`
for (const r of REWARDS) def(gotKey(r.id), 'dodo', `We found ${r.en}!`)
