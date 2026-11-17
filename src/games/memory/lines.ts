// 翻翻牌的台詞（T-160）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。翻開時念的名字在 ../match/lines.ts。
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import '../match/lines'

def('mm.intro', 'dodo', 'Find two the same!')
/** 過程讚美（FB-3）：第一次配成一對時說他做了什麼 */
def('mm.pair', 'dodo', 'You found a pair!')
/** 同一對第 2 次記錯：另一半亮起來 */
def('mm.here', 'dodo', 'It was here!')
def('mm.done', 'dodo', 'You found them all!')
def('mm.again', 'dodo', 'Play again?')
