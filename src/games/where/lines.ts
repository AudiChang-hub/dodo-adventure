// 躲在哪裡（T-160）的台詞：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// 題目和回應用拆句拼接（不產「動物 × 位置 × 大東西」上千個音檔）：
//   題目：「Find the cat」＋「under the table.」     回應：「The cat is」＋「under the table.」
//   點錯：「This one is」＋「on the table.」，再念一次題目（不說錯）
// 只產這個檔的音檔：python scripts/gen_audio.py --only wh.
// 「Watch me!」「Your turn!」「Or go home?」沿用 teach.watch.dodo、teach.turn.dodo、d.next.home。
import { def } from '../../content/registry'
import { HIDERS, OBJECT_IDS, OBJECTS, relsOf, type ObjectId, type Rel } from './data'

def('wh.intro', 'dodo', "Let's play hide and seek!")
def('wh.this', 'dodo', 'This one is')
/** 一局找完（過程讚美 FB-3：說他做了什麼） */
def('wh.done', 'dodo', 'You found them all!')
def('wh.again', 'dodo', 'Hide and seek again?')

export const findKey = (hider: string) => `wh.find.${hider}`
export const isKey = (hider: string) => `wh.is.${hider}`
export const atKey = (rel: Rel, obj: ObjectId) => `wh.at.${rel}.${obj}`

for (const h of HIDERS) {
  def(findKey(h.id), 'dodo', `Find the ${h.en}`)
  def(isKey(h.id), 'dodo', `The ${h.en} is`)
}
for (const o of OBJECT_IDS) for (const r of relsOf(o)) def(atKey(r, o), 'dodo', `${r} ${OBJECTS[o].en}.`)
