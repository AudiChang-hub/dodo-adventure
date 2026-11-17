// 心情臉（T-160）的台詞：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// 拆句拼接：「How does Bunny feel?」（每隻一句）→ 選完「Bunny is sad.」（每隻 × 四種心情）＋ 一句回應（每種心情 3 種說法）。
// 選了別的臉：先說「That's a happy face.」，再說答案（不說錯、不評分）。
// 只產這個檔的音檔：python scripts/gen_audio.py --only fl.
import { def } from '../../content/registry'
import { EMOS, SITUATIONS, SPECIES, type Emo, type SpeciesId } from './data'

def('fl.intro', 'dodo', "Let's look at faces!")
def('fl.done', 'dodo', 'You looked at every face!')
def('fl.again', 'dodo', 'More faces?')

export const askKey = (sp: SpeciesId) => `fl.ask.${sp}`
export const isKey = (sp: SpeciesId, emo: Emo) => `fl.is.${sp}.${emo}`
export const faceKey = (emo: Emo) => `fl.face.${emo}`
export const sitKey = (id: string) => `fl.sit.${id}`
export const RESP_N = 3
export const respKey = (emo: Emo, i: number) => `fl.resp.${emo}.${i % RESP_N}`

/** 選完之後的一句：開心就一起開心，不開心的給一個「怎麼辦」（指引 SE-1：在大人幫忙下冷靜） */
const RESP: Record<Emo, string[]> = {
  happy: ["Let's clap our hands!", "Let's smile together!", "Let's do a happy dance!"],
  sad: ['A hug helps!', "It's okay to cry.", "Let's give a big hug."],
  angry: ["Let's take a big breath.", "Let's count to three.", 'Breathe in, breathe out.'],
  scared: ["You're safe. Hold my hand.", 'A big hug helps!', "It's okay. I'm here."],
}

for (const s of SPECIES) {
  def(askKey(s.id), 'dodo', `How does ${s.en} feel?`)
  for (const e of EMOS) def(isKey(s.id, e), 'dodo', `${s.en} is ${e}.`)
}
for (const e of EMOS) {
  def(faceKey(e), 'dodo', `That's a ${e} face.`)
  RESP[e].forEach((t, i) => def(respKey(e, i), 'dodo', t))
}
for (const s of SITUATIONS) def(sitKey(s.id), 'dodo', s.say)
