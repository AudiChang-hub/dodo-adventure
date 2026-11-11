// 故事時間的英文版課文（T-129）的純函式：每一頁放什麼圖、念完 4 句之後的三題（故事題、認角色、找一樣的英文字）。
// 不碰資料庫（scripts/test-story-en.ts 直接測）；進度存取在 ./en-book.ts，畫面在 ./EnBook.tsx。
import { linePics, type ZhText } from '../../lessons/chinese/data'
import { EN_PAGES, enWordOf, type EnText } from '../../content/story/english'

/** 書架上的書一圈三格：聽了幾天（最多 3） */
export const EN_RING = 3

/** 每一篇聽完的日期（{ [篇]: 日期[] }，一天最多一筆） */
export type Heard = Record<string, string[]>

/** 聽完幾天（書上那一圈亮幾格） */
export const heardTimes = (heard: Heard, day: number) => Math.min(EN_RING, (heard[day] ?? []).length)

/** 第 i 頁的圖：中文課文第 i 行旁邊的圖（沒有紅字的行借前後行的主角，data.ts 的 linePics）；一張都沒有就放這一篇第一個有圖的紅字 */
export function pagePics(t: ZhText, i: number): string[] {
  const row = linePics(t)[Math.min(i, t.lines.length - 1)] ?? []
  const pics = [...new Set(row.map((p) => t.emoji[p.word]).filter((x): x is string => !!x))]
  if (pics.length) return pics
  const any = t.redWords.map((w) => t.emoji[w]).find((x): x is string => !!x)
  return any ? [any] : []
}

/** 這一篇畫在頁上的紅字詞（有圖、有英文），照課文出現的順序 */
export function pictured(t: ZhText, e: EnText): string[] {
  const shown = new Set(Array.from({ length: EN_PAGES }, (_, i) => pagePics(t, i)).flat())
  return t.redWords.filter((w) => t.emoji[w] && shown.has(t.emoji[w]!) && e.words[w])
}

/** 兩張圖選一張：answer 是對的那一張的位置 */
export interface PicPick {
  word: string
  icons: [string, string]
  answer: 0 | 1
}

const pickOf = (word: string, icon: string, other: string, answer: 0 | 1): PicPick => ({ word, icons: answer === 0 ? [icon, other] : [other, icon], answer })

/** 選項的另一張圖：先挑這一篇畫出來的別的紅字，再挑家長選圖題的另一個選項（都要跟答案的圖不一樣） */
function otherIcon(t: ZhText, e: EnText, word: string, storyFirst: boolean): string | null {
  const icon = t.emoji[word]
  const story = pictured(t, e)
    .filter((w) => w !== word)
    .map((w) => t.emoji[w]!)
  const quiz = t.quiz.distractors.map((w) => t.emoji[w]).filter((x): x is string => !!x)
  return [...(storyFirst ? [...story, ...quiz] : [...quiz, ...story])].find((x) => x !== icon) ?? null
}

/** 念完 4 句的第 1 題：故事題（Who runs fast?，對的是故事裡的那一個，另一張是故事裡別的角色或東西） */
export function storyAskOf(t: ZhText, e: EnText): PicPick | null {
  if (!e.q) return null
  const icon = t.emoji[e.q.ans]
  const other = icon ? otherIcon(t, e, e.q.ans, true) : null
  return icon && other ? pickOf(e.q.ans, icon, other, (t.day % 2) as 0 | 1) : null
}

/** 第 2 題：認角色（Which one is the rabbit?，另一張先挑選圖題的另一個選項） */
export function whichOf(t: ZhText, e: EnText): PicPick | null {
  if (!e.which) return null
  const icon = t.emoji[e.which]
  const other = icon ? otherIcon(t, e, e.which, false) : null
  return icon && other ? pickOf(e.which, icon, other, ((t.day + 1) % 2) as 0 | 1) : null
}

/** 第 3 題：找一樣的英文字（上面 rabbit，下面 rabbit、turtle 兩張，點長得一樣的那張） */
export interface WordMatch {
  /** 要找的紅字詞（中文，台詞 key 用） */
  zh: string
  word: string
  options: [string, string]
  answer: 0 | 1
}

/**
 * 字是認角色那一題的那一個（剛認過圖，再認字）；另一張是這一篇畫在頁上的別的紅字的英文（不一樣的字），先挑開頭字母不一樣的。
 * 這一篇只畫了一種東西：不出這一題。
 */
export function matchOf(t: ZhText, e: EnText): WordMatch | null {
  if (!e.which) return null
  const word = enWordOf(e.which)
  const others = pictured(t, e)
    .map((w) => enWordOf(w))
    .filter((w) => w && w !== word)
  const other = others.find((w) => w[0] !== word[0]) ?? others[0]
  if (!word || !other) return null
  const answer = (Math.floor(t.day / 2) % 2) as 0 | 1
  return { zh: e.which, word, options: answer === 0 ? [word, other] : [other, word], answer }
}

/** 大人今天跳過了哪一篇舊篇 */
export interface EnSkip {
  date: string
  day: number
}

/** 今天故事先講哪一篇：part 是舊篇或新篇；isNew 是今天還沒聽完；review 是新篇講完之後結尾小題的篇 */
export interface EnToday {
  day: number
  part: 'old' | 'new'
  isNew: boolean
  review: number[]
}

/**
 * 今天故事要講的（T-136，家長 2026-11-11：中文課和英文故事並行，一樣一天兩篇、一舊一新）。
 * p 是中文課的排課（lessons/chinese/course.ts 的 planOf：新篇、舊篇、結尾小題的篇，中英文共用這一份，不另外算）：
 * - 舊篇今天還沒聽完、也沒被大人跳過（新篇也還沒聽完）→ 先講舊篇；
 * - 不然講新篇，新篇講完接結尾小題（前 1 次、前 7 次的各一題）。
 */
export function enTodayOf(p: { day: number; old: number | null; review: number[] }, heard: Heard, skip: EnSkip | undefined, date: string): EnToday {
  const on = (d: number) => (heard[d] ?? []).includes(date)
  const fresh = !on(p.day)
  if (p.old != null && fresh && !on(p.old) && !(skip?.date === date && skip.day === p.old)) return { day: p.old, part: 'old', isNew: true, review: [] }
  return { day: p.day, part: 'new', isNew: fresh, review: p.review }
}
