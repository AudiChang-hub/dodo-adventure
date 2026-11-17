// 蹺蹺板比輕重（家長 2026-11-17）的台詞：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// 回應用拆句拼接：「Yes!」或「Look!」＋「The rock is heavier.」（大而輕對小而重再加「Little, but heavy!」）。
// content/lines.ts import 這個檔；只產這個檔的音檔：python scripts/gen_audio.py --only ss.
// 「Watch me!」「Your turn!」「Yes!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、praise.dodo.0、d.next.home。
import { def } from '../../content/registry'
import { ITEMS } from './data'

def('ss.intro', 'dodo', 'Seesaw time!')
def('ss.ask', 'dodo', 'Which side goes down?')
/** 示範時說規則：重的那一邊會往下 */
def('ss.rule', 'dodo', 'The heavy side goes down.')
/** 4、5 級一局開始 */
def('ss.trick', 'dodo', 'Big is not always heavy!')
/** 猜錯了：先看蹺蹺板，再說哪個重（不說錯） */
def('ss.look', 'dodo', 'Look!')
/** 大而輕對小而重：說完哪個重再說一句 */
def('ss.little', 'dodo', 'Little, but heavy!')
/** 一局猜完（過程讚美 FB-3：說他做了什麼） */
def('ss.done', 'dodo', 'You found the heavy ones!')
def('ss.again', 'dodo', 'Seesaw again?')

// 排輕重
def('ss.order', 'dodo', 'Light to heavy!')
def('ss.first', 'dodo', 'Which is the lightest?')
def('ss.next', 'dodo', 'Which one is next?')
def('ss.last', 'dodo', 'And the heaviest!')
/** 點錯：點到的那一個比較重（剩下的裡面最輕的才對，點錯的一定比較重） */
def('ss.heavier', 'dodo', 'That one is heavier.')
def('ss.order.done', 'dodo', 'Light, heavier, heaviest!')
def('ss.order.all', 'dodo', 'All lined up!')

/** 「The rock is heavier.」 */
export const heavyKey = (id: string) => `ss.heavy.${id}`
for (const x of ITEMS) def(heavyKey(x.id), 'dodo', `The ${x.en} is heavier.`)
