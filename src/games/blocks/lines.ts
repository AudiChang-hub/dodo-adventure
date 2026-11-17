// 積木蓋蓋看的台詞（T-162）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔；只產這個遊戲的音檔：python scripts/gen_audio.py --only bk.
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import { MODELS } from './models'

/** 選照圖蓋還是自由蓋 */
def('bk.pick', 'dodo', 'Pick how to build!')
// ── 照圖蓋 ──
def('bk.intro', 'dodo', "Let's build this!")
def('bk.ask', 'dodo', 'Which block is next?')
/** 放錯第 1 次：看參考圖 */
def('bk.look', 'dodo', 'Look at the picture.')
/** 放錯第 2 次（對的位置亮起來）、示範、手帶著放 */
def('bk.here', 'dodo', 'It goes here.')
/** 位置對了，可是下面還沒有撐住它的積木 */
def('bk.bottom', 'dodo', 'Start at the bottom.')
/** 過程讚美（FB-3）：說他做了什麼 */
def('bk.praise', 'dodo', 'You stacked them up!')
/** 第 4 級：這一步蓋好了，看下一張步驟圖 */
def('bk.step', 'dodo', 'Next step!')
def('bk.again', 'dodo', 'Build another one?')
// ── 自由蓋 ──
def('bk.free.intro', 'dodo', 'Build anything you like!')
def('bk.free.done', 'dodo', 'Wow, look what you built!')
def('bk.free.empty', 'dodo', 'Add a block first!')
def('bk.free.again', 'dodo', 'Build something new?')

/** 蓋好念的那一句（每個模型一句） */
export const modelLineKey = (id: string) => `bk.m.${id}`
for (const m of MODELS) def(modelLineKey(m.id), 'dodo', m.en)
