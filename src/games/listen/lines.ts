// 聽兩步驟指令（T-164）的台詞：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// 每樣東西三句：Touch the | red ball.（第一步，名字加重）、Then the | red ball.（第二步）、That's the red ball.（點錯了，說他點的是什麼）。
// 兩步驟就是兩句接著念：「Touch the cat. Then the star.」
// 只產這個檔的音檔：python scripts/gen_audio.py --only ls.
import { def } from '../../content/registry'
import { ALL_THINGS, thingEn, thingId, type Thing } from './data'

def('ls.intro', 'dodo', 'Listen and touch!')
def('ls.intro2', 'dodo', 'Listen to two things!')
def('ls.done', 'dodo', 'You listened so well!')
def('ls.again', 'dodo', 'Listen to more?')
export const PRAISE_N = 4
export const praiseKey = (i: number) => `ls.praise.${i % PRAISE_N}`
;['You did it!', 'Great listening!', 'You heard it all!', 'Yes, you got it!'].forEach((t, i) => def(praiseKey(i), 'dodo', t))

export const touchKey = (t: Thing) => `ls.t.${thingId(t)}`
export const thenKey = (t: Thing) => `ls.n.${thingId(t)}`
export const isKey = (t: Thing) => `ls.is.${thingId(t)}`

for (const t of ALL_THINGS) {
  const en = thingEn(t)
  def(touchKey(t), 'dodo', `Touch the | ${en}.`)
  def(thenKey(t), 'dodo', `Then the | ${en}.`)
  def(isKey(t), 'dodo', `That's the ${en}.`)
}
