// 英文課的選擇題怎麼出（純資料，不碰畫面；畫面在 ./Quiz.tsx，自動檢查在 scripts/check-lessons-teach.ts）。
// 不教不考（家長 2026-11-02）：答案和干擾選項都只能是今天這一課，或之前上過的字母、單字。
import { pick, shuffle } from '../../lib/random'
import { LOOKALIKE, LOOKALIKE_LOWER } from '../../content/letters'
import { LESSON_LETTERS, ORDER, wordId, type LessonLetter } from './data'

export interface Opt {
  id: string
  /** 字母選項：顯示的字 */
  text?: string
  /** 圖的選項 */
  icon?: string
}

export interface Question {
  kind: 'big' | 'little' | 'word'
  /** 這一題問的字母（複習題是以前學的字母） */
  L: string
  prompt: string
  answer: string
  options: Opt[]
  skill: string
  /** 答對之後念的那一句 */
  yes: string
  /**
   * 小寫題的退一級（T-100，準則 LOAD-5「答錯自動變簡單」、指引 EN-4「3 歲認大寫，小寫是 4 歲」）：
   * 這一堂大寫題第一次沒答對、或中途離開又回來，小寫題改問同一個字母的大寫
   */
  easy?: Question
}

/** 跟 x 長得像、或念起來容易混的，不放在同一題（三歲還在認形狀，先不考 b／d） */
const like = (a: string, b: string) => {
  const A = a.toUpperCase()
  const B = b.toUpperCase()
  return (LOOKALIKE[A] ?? '').includes(B) || (LOOKALIKE[B] ?? '').includes(A) || (LOOKALIKE_LOWER[a.toLowerCase()] ?? '').includes(b.toLowerCase()) || (LOOKALIKE_LOWER[b.toLowerCase()] ?? '').includes(a.toLowerCase())
}

/** 大小寫只差大小的字母：放在一起分不出來，不拿另一種寫法當陪襯 */
const SAME_SHAPE = 'CKOPSUVWXZ'

/** 選項 id：大寫字母本身；陪襯用的「另一種寫法」加上 :big／:little，跟答案分開 */
export const flipId = (X: string, big: boolean) => `${X}:${big ? 'little' : 'big'}`

/**
 * 字母題的干擾選項：只用教過的字母（之前的字母和今天的字母），不夠時用今天這個字母的另一種寫法
 * （問大寫 A 就放小寫 a），再不夠就少一個選項。
 * 大小寫只差大小的字母（S、s）平常不拿另一種寫法當陪襯；但一個陪襯都沒有的時候（名字的字母先上，第一天就是 S，A12）
 * 還是放：問的是「大的」還是「小的」，畫面上大小看得出來，總比只有一個選項好。
 */
function letterOptions(X: string, big: boolean, taught: string[], learned: string[], n: number): Opt[] {
  const show = (c: string) => (big ? c : c.toLowerCase())
  // X 看起來像「打叉」，不拿來當陪襯
  const ok = (c: string) => c !== X && !like(c, X) && (c !== 'X' || learned.includes('X'))
  const others = shuffle(taught.filter(ok)).slice(0, n).map((c) => ({ id: c, text: show(c) }))
  if (others.length < n && (!SAME_SHAPE.includes(X) || !others.length)) others.push({ id: flipId(X, big), text: big ? X.toLowerCase() : X })
  return shuffle([{ id: X, text: show(X) }, ...others])
}

/**
 * 出今天的選擇題（4 題）。問的都是今天剛教過的字母、單字，或以前上過的字母（複習）；干擾選項也一樣只用教過的。
 * seq：這一輪的字母順序（plan.ts；名字的字母先上時不是 A→Z），「以前上過」照它算。
 * 1. Where is big A?（大寫）  2. Where is little a?（小寫）  3. Which one starts with A?（圖）
 * 4. 以前學過的字母複習一題（第一天沒有以前的字母，就再問一題今天的單字）。
 * 圖的題目要有以前學過的字當陪襯：第一天沒有，就改問字母。
 * 選項數：前三個字母 2 選 1，之後 3 選 1（教過的不夠就少一個）。
 * bigOnly：小寫題一開始就換成大寫題（同一天中途離開又回來，T-100）。
 */
export function makeQuiz(letter: LessonLetter, idx: number, seq = ORDER, bigOnly = false): Question[] {
  const learned = [...seq.slice(0, idx)]
  const taught = [...seq.slice(0, idx + 1)]
  const n = idx < 3 ? 1 : 2
  const { L, l } = letter
  const qs: Question[] = []
  const letterQ = (X: string, big: boolean): Question => ({
    kind: big ? 'big' : 'little',
    L: X,
    prompt: big ? `en.where.big.${X}` : `en.where.little.${X.toLowerCase()}`,
    answer: X,
    options: letterOptions(X, big, taught, learned, n),
    skill: `letter:${big ? X : X.toLowerCase()}`,
    yes: `ph.${X.toLowerCase()}.sound`,
  })
  const wordQ = (ans: string): Question | null => {
    // 干擾的圖：以前學過的字母的字，不是今天字母開頭、圖也不一樣
    const prefer = LESSON_LETTERS.filter((x) => x.L !== L && learned.includes(x.L))
    const cands = prefer.flatMap((x) => x.starts).filter((w) => w.w[0].toLowerCase() !== l && w.alt !== l)
    const others = shuffle(cands)
      .filter((w, i, a) => a.findIndex((v) => v.icon === w.icon) === i)
      .slice(0, n)
    if (!others.length) return null
    const a = letter.words.find((w) => w.w === ans)!
    return {
      kind: 'word',
      L,
      prompt: `ph.${l}.q.word`,
      answer: wordId(ans),
      options: shuffle([a, ...others]).map((w) => ({ id: wordId(w.w), icon: w.icon })),
      skill: `phonics:${l}`,
      yes: `ph.word.${wordId(ans)}`,
    }
  }
  const little = (X: string): Question => ({ ...letterQ(X, false), easy: letterQ(X, true) })
  qs.push(letterQ(L, true), little(L))
  const starts = shuffle(letter.starts.map((w) => w.w))
  qs.push((starts.length && wordQ(starts[0])) || letterQ(L, true))
  if (learned.length) qs.push(letterQ(pick(learned.slice(-3)), true))
  else qs.push((starts.length > 1 && wordQ(starts[1])) || little(L))
  return bigOnly ? qs.map((q) => q.easy ?? q) : qs
}

/**
 * 答錯時說明（A16）：說出孩子點的是什麼、要找的是什麼（That's big B. Find big A!／That's a banana. Find the apple!）。
 * 字母選項的 id 是大寫字母；「同一個字母的另一種寫法」是 A:little／A:big（flipId），照畫面上看到的大小寫念。台詞在 lines.ts。
 */
export function wrongKeys(q: Question, o: Opt): string[] {
  if (q.kind === 'word') return [`en.that.word.${o.id}`, `en.find.word.${q.answer}`]
  const [c, shown] = o.id.split(':')
  const big = shown ? shown === 'big' : q.kind === 'big'
  return [big ? `en.that.big.${c}` : `en.that.little.${c.toLowerCase()}`, q.kind === 'big' ? `en.find.big.${q.answer}` : `en.find.little.${q.answer.toLowerCase()}`]
}
