// 小熊野餐的台詞（T-160）：全部英文、豆豆的聲音，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔；只產這個檔的音檔：python scripts/gen_audio.py --only pn.
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import { FOODS, MAX_TRAY, PICNIC_LEVELS, type PicnicLevel } from './plan'

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
const Cap = (s: string) => s[0].toUpperCase() + s.slice(1)
/** 要的數量最多到幾（各級的 wants） */
const MAX_WANT = Math.max(...Object.values(PICNIC_LEVELS as Record<PicnicLevel, { wants: number[] }>).flatMap((l) => l.wants))

def('pn.intro', 'dodo', 'Picnic time!')
/** 盤子上有東西、發呆的時候：按鈴鐺給牠 */
def('pn.bell', 'dodo', 'Ring the bell!')
/** 第 2 次給太多：多的那幾個亮起來 */
def('pn.back', 'dodo', 'Take some back.')
/** 過程讚美（FB-3）：說他做了什麼（一次野餐說一次） */
def('pn.praise', 'dodo', 'You counted them all!')
def('pn.again', 'dodo', 'Another picnic?')

/** 牠點著盤子上的一個一個數：One! Two! … */
export const numKey = (n: number) => `pn.n.${n}`
for (let n = 1; n <= MAX_TRAY; n++) def(numKey(n), 'dodo', `${Cap(NUM[n])}!`)

for (let n = 1; n <= MAX_WANT; n++) {
  /** 剛好：最後數到的數就是有幾個（Three! Thank you!） */
  def(`pn.got.${n}`, 'dodo', `${Cap(NUM[n])}! Thank you!`)
  /** 太多：一起數完以後說要的是幾個（不說錯） */
  def(`pn.over.${n}`, 'dodo', `Too many! I want | ${NUM[n]}.`)
  /** 太少 */
  def(`pn.under.${n}`, 'dodo', `More, please! I want | ${NUM[n]}.`)
}

/** 客人要東西：I want three apples! */
export const askKey = (icon: string, n: number) => `pn.ask.${icon}.${n}`
for (const f of FOODS) for (let n = 1; n <= MAX_WANT; n++) def(askKey(f.icon, n), 'dodo', `I want ${NUM[n]} ${n === 1 ? f.one : f.many}!`)
