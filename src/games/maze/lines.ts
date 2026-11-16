// 迷宮的台詞（T-156）：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// content/lines.ts import 這個檔，npm run audio 才會產生音檔（只產這個檔的：python scripts/gen_audio.py --only mz.）。
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import { GOALS } from './plan'

def('mz.ask', 'dodo', 'Which way?')
/** 示範、發呆提示：手指著下一格 */
def('mz.way', 'dodo', 'This way!')
def('mz.again', 'dodo', 'Another maze?')
/** T-158：「再一個」那裡多一個「難一點」（大一點的迷宮） */
def('mz.harder', 'dodo', 'A bigger maze?')
/** T-158 第 9 級：先拿鑰匙才打得開終點 */
def('mz.key.first', 'dodo', 'Get the key first!')
def('mz.key.got', 'dodo', 'You got the key!')
/** T-158 第 10 級：收集 3 顆星星才到得了終點 */
def('mz.stars.first', 'dodo', 'Get the stars first!')
def('mz.stars.got', 'dodo', 'All the stars!')

/** 開始：Find the apple!；走到了：Yum! An apple! */
export const findKey = (goal: string) => `mz.find.${goal}`
export const gotKey = (goal: string) => `mz.got.${goal}`
for (const [id, g] of Object.entries(GOALS)) {
  def(findKey(id), 'dodo', g.find)
  def(gotKey(id), 'dodo', g.got)
}
