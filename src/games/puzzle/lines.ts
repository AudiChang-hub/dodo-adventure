// 拼圖的台詞（T-156）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔，npm run audio 才會產生音檔（只產這個檔的：python scripts/gen_audio.py --only pz.）。
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import { PUZZLE_PICS } from './plan'

def('pz.intro', 'dodo', "Let's make a picture!")
def('pz.ask', 'dodo', 'Where does it go?')
/** 放錯第 1 次：看底下淡淡的圖 */
def('pz.look', 'dodo', 'Look at the picture.')
/** 放錯第 2 次（對的位置亮起來）、示範、手帶著放 */
def('pz.here', 'dodo', 'It goes here.')
/** 過程讚美（FB-3）：說他做了什麼 */
def('pz.praise', 'dodo', 'You matched the picture!')
def('pz.again', 'dodo', 'Another puzzle?')

/** 拼完念的那一句（每張圖一句） */
export const picLineKey = (id: string) => `pz.pic.${id}`
for (const p of PUZZLE_PICS) def(picLineKey(p.id), 'dodo', p.en)
