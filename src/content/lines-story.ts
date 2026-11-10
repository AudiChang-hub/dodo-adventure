// 會動的繪本的台詞（T-127 B 案）：單字三明治（Rabbit. → 兔子 → Rabbit.）、第 1 天最後的問題（Where is the egg?）、
// 第 3 天每一頁的問題（What happens next?）。第 2 天換他做的時候用現有的 Your turn!（teach.turn.*）。
// 只定義故事真的會念到的：照每一章（小班段）念的那一版算出哪一句要念三明治、誰念（content/story/flow.ts）。
import { def, defBridge, type Speaker } from './registry'
import { allChapters, chapterLines, chapterLook, scriptOf } from './story'
import { flowOf } from './story/flow'
import { STORY_NOUNS, storyNounEn, storyNounKey } from './story/words'
import { bridgeKey } from './zh-words'

const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']

/** 單字三明治前面那一次英文（Rabbit.）：story.word.<說話者>.<角色庫 id> */
export const storyWordKey = (speaker: Speaker, id: string) => `story.word.${speaker}.${id}`
/** 第 1 天最後的問題：story.where.<說話者>.<角色庫 id> */
export const storyWhereKey = (speaker: Speaker, id: string) => `story.where.${speaker}.${id}`
/** 第 3 天每一頁的問題 */
export const storyNextKey = (speaker: Speaker) => `story.next.${speaker}`

const word = (id: string) => STORY_NOUNS[id]?.en ?? id

function sandwich(speaker: Speaker, id: string) {
  const n = STORY_NOUNS[id]
  if (!n) return
  def(storyWordKey(speaker, id), speaker, storyNounEn(id))
  defBridge(bridgeKey(storyNounKey(id), speaker), speaker, n.zh, storyNounEn(id))
}

for (const ch of allChapters()) {
  if (ch.band !== 'small') continue
  const look = chapterLook(ch, ch.door ?? 'bus')
  const s = scriptOf(ch, { tracks: [], friend: null, door: ch.door ?? 'bus' })
  if (!s || !look) continue
  const said = [...s.title, ...s.intro, ...s.stops.flat(), ...s.finale, ...s.end]
  const text = new Map(chapterLines(ch).map(([k, , en]) => [k, en]))
  const f = flowOf(
    ch,
    said.map((x) => ({ k: x.key, pic: x.pic })),
    said.map((x) => text.get(x.key) ?? ''),
    look.scene,
    look.icon,
  )
  for (const [i, id] of f.sandwiches) sandwich(said[i].speaker, id)
  if (f.ask) {
    const w = word(f.ask.noun)
    def(storyWhereKey(look.host, f.ask.noun), look.host, /s$/.test(w) ? `Where are the | ${w}?` : `Where is the | ${w}?`)
  }
}

for (const s of SPEAKERS) def(storyNextKey(s), s, 'What happens next?')
