// 影子配對的台詞（T-160）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。放對時念的名字在 ../match/lines.ts。
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import '../match/lines'

def('sh.intro', 'dodo', 'Match the shadows!')
/** 發呆：再說一次要做什麼 */
def('sh.ask', 'dodo', 'Find its shadow!')
/** 放錯第 1 次：看形狀 */
def('sh.look', 'dodo', 'Look at the shape.')
/** 放錯第 2 次（對的影子亮起來）、示範、手帶著放 */
def('sh.here', 'dodo', 'It goes here.')
/** 過程讚美（FB-3）：放好第 2 個時說他做了什麼 */
def('sh.praise', 'dodo', 'You matched the shadow!')
def('sh.done', 'dodo', 'All the shadows match!')
def('sh.again', 'dodo', 'More shadows?')
