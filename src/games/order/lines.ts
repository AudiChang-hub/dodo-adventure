// 故事排順序（T-164）的台詞：全部英文、豆豆說。不唱歌、不念中文。
// 拼接：「First,」「Then,」「Last,」各一句，後面接那一張的旁白（每個故事每一張一句，≤ 6 個字）。
// 只產這個檔的音檔：python scripts/gen_audio.py --only or.
import { def } from '../../content/registry'
import { STORIES } from './data'

def('or.intro', 'dodo', "Let's put the story in order!")
def('or.ask.first', 'dodo', 'What happens first?')
def('or.ask.next', 'dodo', 'What comes next?')
def('or.ask.last', 'dodo', 'What happens last?')
def('or.again', 'dodo', 'One more story?')
def('or.done', 'dodo', 'You told every story!')
def('or.retell', 'dodo', "Let's tell it again!")
export const PRAISE_N = 3
export const praiseKey = (i: number) => `or.praise.${i % PRAISE_N}`
;['You put it in order!', 'What a good story!', 'You told the whole story!'].forEach((t, i) => def(praiseKey(i), 'dodo', t))

/** 第幾格念什麼：第一格 First、最後一格 Last、中間 Then */
export const wordKey = (slot: number, n: number) => (slot === 0 ? 'or.w.first' : slot === n - 1 ? 'or.w.last' : 'or.w.then')
def('or.w.first', 'dodo', 'First,')
def('or.w.then', 'dodo', 'Then,')
def('or.w.last', 'dodo', 'Last,')

export const capKey = (story: string, step: number) => `or.cap.${story}.${step}`
/** 旁白單獨念的時候第一個字大寫（First, 後面接的時候是同一段音檔） */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
for (const s of STORIES) s.steps.forEach((p, i) => def(capKey(s.id, i), 'dodo', cap(p.say)))
