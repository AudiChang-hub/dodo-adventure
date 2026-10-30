// 學習快照（G-9）：每週產生故事時，寫作簡報要知道孩子學過哪些字、各支線在第幾階、有哪些朋友、故事講到哪裡。
// 家長在家長區「故事審稿」按「下載學習快照」，存成 scripts/.cache/learner.json 給 scripts/story-brief.ts、check-story.ts 讀。
//
// 只放學習的狀態，不放名字、生日、作答紀錄（快照不進 repo，放在 gitignored 的 scripts/.cache/）。
import { db, today } from './db'
import { getGrowth } from './growth'
import { ladderNow, mastered, skill } from './adaptive'
import { usable, isUnknown } from './words'
import { storyState } from './story'
import { LEXICON, keyOfVocab } from '../content/lexicon'
import type { Band } from '../content/growth'

export interface LearnerSnapshot {
  kind: 'learner'
  v: 1
  /** 哪一天匯出的 */
  date: string
  band: Band
  /** 教過、家長沒勾「他不認得」的單字（lexicon 的 key）：故事裡加重的字要在這裡面 */
  words: string[]
  /** 最近兩週剛學熟的字：下一篇優先拿來當道具（成長系統 §3.4） */
  recent: string[]
  /** 家長勾「他不認得」的字：故事裡不要用 */
  unknown: string[]
  /** 已熟的概念（顏色、形狀、數字、大小…，技能代碼 color:red、count:5） */
  concepts: string[]
  /** 各支線現在練到哪裡（階的編號） */
  strands: { id: string; name: string; track: string; done: string[]; current: string[] }[]
  /** 孵出來的朋友 */
  friends: string[]
  /** 故事講到哪裡 */
  story: { part: number; arc: string; next: number; classicsDone: string[] }
}

const CONCEPT = /^(color|shape|count|num|give|size|compare|pattern|all|cat|arrow|order):/

export async function learnerSnapshot(): Promise<LearnerSnapshot> {
  const skills = await db.skills.toArray()
  const twoWeeks = Date.now() - 14 * 86400_000
  const st = await storyState()
  const view = ladderNow()
  return {
    kind: 'learner',
    v: 1,
    date: today(),
    band: getGrowth().band,
    words: LEXICON.filter((w) => usable(w.key)).map((w) => w.key),
    recent: [
      ...new Set(
        skills
          .filter((s) => s.key.startsWith('vocab:') && mastered(s.key) && s.lastTs >= twoWeeks)
          .map((s) => keyOfVocab(s.key.slice(6)))
          .filter((k) => usable(k)),
      ),
    ],
    unknown: LEXICON.filter((w) => isUnknown(w.key)).map((w) => w.key),
    concepts: skills.filter((s) => CONCEPT.test(s.key) && skill(s.key).box > 0 && mastered(s.key)).map((s) => s.key),
    strands: view.strands.map((s) => ({ id: s.id, name: s.name, track: s.track, done: s.done, current: s.current })),
    friends: (await db.friends.toArray()).map((f) => f.id),
    story: { part: st.part, arc: st.arc, next: st.next, classicsDone: st.classicsDone },
  }
}
