// 迷宮的台詞（T-156）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔，npm run audio 才會產生音檔（只產這個檔的：python scripts/gen_audio.py --only mz.）。
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import { GOALS } from './plan'

def('mz.ask', 'dodo', 'Which way?')
/** 示範、發呆提示：手指著下一格 */
def('mz.way', 'dodo', 'This way!')
def('mz.again', 'dodo', 'Another maze?')

/** 開始：Find the apple!；走到了：Yum! An apple! */
export const findKey = (goal: string) => `mz.find.${goal}`
export const gotKey = (goal: string) => `mz.got.${goal}`
for (const [id, g] of Object.entries(GOALS)) {
  def(findKey(id), 'dodo', g.find)
  def(gotKey(id), 'dodo', g.got)
}
