// 心情臉（T-160）的台詞：全部英文、豆豆說，每句 ≤ 6 個字。不唱歌、不念中文。
// 拆句拼接：「How does Bunny feel?」（每隻一句）→ 選完「Bunny is sad.」（每隻 × 四種心情）＋ 一句回應（每種心情 3 種說法）。
// 選了別的臉：先說「That's a happy face.」，再說答案（不說錯、不評分）。
// 只產這個檔的音檔：python scripts/gen_audio.py --only fl.
import { def } from '../../content/registry'
import { MOODS, SPECIES, WHY_SITS, type Mood, type SpeciesId } from './data'

def('fl.intro', 'dodo', "Let's look at faces!")
def('fl.done', 'dodo', 'You looked at every face!')
def('fl.again', 'dodo', 'More faces?')

export const askKey = (sp: SpeciesId) => `fl.ask.${sp}`
export const isKey = (sp: SpeciesId, emo: Mood) => `fl.is.${sp}.${emo}`
export const faceKey = (emo: Mood) => `fl.face.${emo}`
export const sitKey = (id: string) => `fl.sit.${id}`
export const RESP_N = 3
export const respKey = (emo: Mood, i: number) => `fl.resp.${emo}.${i % RESP_N}`

/** 選完之後的一句：開心就一起開心，不開心的給一個「怎麼辦」（指引 SE-1：在大人幫忙下冷靜） */
const RESP: Record<Mood, string[]> = {
  happy: ["Let's clap our hands!", "Let's smile together!", "Let's do a happy dance!"],
  sad: ['A hug helps!', "It's okay to cry.", "Let's give a big hug."],
  angry: ["Let's take a big breath.", "Let's count to three.", 'Breathe in, breathe out.'],
  scared: ["You're safe. Hold my hand.", 'A big hug helps!', "It's okay. I'm here."],
  // T-164「為什麼」那一層才有的驚訝
  surprised: ["Let's say wow together!", 'Big eyes, big mouth!', "Let's make a wow face!"],
}

// T-164「為什麼」那一層：Why is Bunny sad?（每隻 × 五種心情）
def('fl.why.intro', 'dodo', "Let's find out why!")
export const whyKey = (sp: SpeciesId, emo: Mood) => `fl.why.${sp}.${emo}`
for (const s of SPECIES) for (const e of MOODS) def(whyKey(s.id, e), 'dodo', `Why is ${s.en} ${e}?`)

for (const s of SPECIES) {
  def(askKey(s.id), 'dodo', `How does ${s.en} feel?`)
  for (const e of MOODS) def(isKey(s.id, e), 'dodo', `${s.en} is ${e}.`)
}
for (const e of MOODS) {
  def(faceKey(e), 'dodo', `That's a ${e} face.`)
  RESP[e].forEach((t, i) => def(respKey(e, i), 'dodo', t))
}
for (const s of WHY_SITS) def(sitKey(s.id), 'dodo', s.say)
