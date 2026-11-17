// 鼓聲停的台詞（T-160）：全部英文、豆豆的聲音，每句 ≤ 6 個字。不唱歌、不念中文（鼓聲是 ./beat.ts 合成的，不是唱的）。
// content/lines.ts import 這個檔；只產這個檔的音檔：python scripts/gen_audio.py --only dr.
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'

/** 規則（前幾首、第 1 級每次都說） */
def('dr.rule', 'dodo', 'When the drum stops, freeze!')
def('dr.tap', 'dodo', 'Tap me to dance!')
/** 第 1 級：鼓又響了 */
def('dr.dance', 'dodo', 'Dance!')
/** 第 1 級：鼓停的那一刻（熟練了不說，只聽鼓） */
def('dr.freeze', 'dodo', 'Freeze!')
/** 鼓停了還在點：角色搖搖晃晃（一次停只說一次） */
def('dr.whoa', 'dodo', 'Whoa! Freeze!')
/** 過程讚美（FB-3）：說他做了什麼 */
def('dr.praise', 'dodo', 'You stopped with the drum!')
/** 一次都沒停住（或沒跳）：不說錯，說跳得很開心 */
def('dr.end', 'dodo', 'What a dance!')
def('dr.again', 'dodo', 'Dance again?')
