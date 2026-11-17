// 躲起來了幾隻（家長 2026-11-17）的台詞：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔；只產這個檔的音檔：python scripts/gen_audio.py --only hd.
// 「Watch me!」「Your turn!」沿用 teach.watch.dodo、teach.turn.dodo。
import { def } from '../../content/registry'
import { MAX_TOTAL } from './plan'

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five']
const Cap = (s: string) => s[0].toUpperCase() + s.slice(1)

def('hd.intro', 'dodo', "Let's count the friends!")
def('hd.hide', 'dodo', 'Some are hiding!')
def('hd.ask', 'dodo', 'How many are hiding?')
/** 答錯第 1 次：一起數外面的（不說錯） */
def('hd.out', 'dodo', 'Count the ones outside!')
/** 答錯第 2 次：上面卡片的空心圈亮起來 */
def('hd.dots', 'dodo', 'Count the empty circles!')
def('hd.peek', 'dodo', "Let's peek!")
/** 過程讚美（FB-3）：說他做了什麼 */
def('hd.done', 'dodo', 'You found the hiding friends!')
def('hd.again', 'dodo', 'Hide and count again?')

/** 一隻一隻數：One! … Five! */
export const numKey = (n: number) => `hd.n.${n}`
/** 全部幾隻：Three friends! */
export const allKey = (n: number) => `hd.all.${n}`
/** 打開來：Two were hiding! */
export const hidKey = (k: number) => `hd.hid.${k}`
/** 分與合：Two and one make three!（外面的 and 躲起來的） */
export const sumKey = (out: number, hid: number) => `hd.sum.${out}.${hid}`

for (let n = 1; n <= MAX_TOTAL; n++) def(numKey(n), 'dodo', `${Cap(NUM[n])}!`)
for (let n = 3; n <= MAX_TOTAL; n++) def(allKey(n), 'dodo', `${Cap(NUM[n])} friends!`)
for (let k = 1; k < MAX_TOTAL; k++) def(hidKey(k), 'dodo', `${Cap(NUM[k])} ${k === 1 ? 'was' : 'were'} hiding!`)
for (let t = 3; t <= MAX_TOTAL; t++) for (let k = 1; k < t; k++) def(sumKey(t - k, k), 'dodo', `${Cap(NUM[t - k])} and ${NUM[k]} make ${NUM[t]}!`)
