// 英文課的選擇題怎麼出（純資料，不碰畫面；畫面在 ./Quiz.tsx，自動檢查在 scripts/check-lessons-teach.ts）。
// 不教不考（家長 2026-11-02）：答案和干擾選項都只能是今天這一課，或之前上過的字母、單字。
import { pick, shuffle } from '../../lib/random'
import { LOOKALIKE, LOOKALIKE_LOWER } from '../../content/letters'
import { ORDER, wordId, type LessonLetter } from './data'
import { distractors, findable, sandwich } from './abc'

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
  /**
   * 題目（T-109：關鍵字放最前面，Big S!；聽字找圖是 Where's the apple?，整句念完才算聽完）。
   * 第一句就是關鍵字：孩子點下去的時候這一句念完了沒，記成作答紀錄的 heard
   */
  prompt: string[]
  answer: string
  options: Opt[]
  skill: string
  /** 答對之後念的那幾句（找圖：三明治 Apple. A… Apple.） */
  yes: string[]
  /** 找圖：要找的字（英文，陪玩小字用） */
  word?: string
  /** 沒聽完就點、猜對了：稱讚之後把關鍵字和答案再念一次（Yes! Big S!、Yes! Sun. S… s, s…） */
  echo: string[]
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
 * 出今天的選擇題（最多 3 題，T-112）。問的都是今天剛教過的字母、單字，或以前上過的字母（複習）；干擾選項也一樣只用教過的。
 * seq：這一輪的字母順序（plan.ts；名字的字母先上時不是 A→Z），「以前上過」照它算。
 * 1. Big A!（大寫）  2. Little a!（小寫）
 * 3. 單日（第 2、4…天）聽字找圖：Where's the apple?（今天教的代表字，2 選 1，干擾圖是不同類、以前教過的字；答對念三明治 Apple. A… Apple.）；
 *    雙日（第 3、5…天）以前學過的字母複習一題。做不出來就換另一種。
 *    T-147（家長 2026-11-14）：拿掉「Which one starts with A?」——孩子沒記得單字，找開頭音只能用猜的（指引 A6：音素要 4～5 歲才穩）。
 * 第一天：只問大寫、小寫 2 題。
 * 以前是 4 題，第一天做不出來的兩題都退回成同樣的大 S、小 s，一堂問 4 次 S／s（盲測 b637ff7：「好久喔，一直點都不知道要幹嘛」，
 * 準則 LOAD-3 一回合 3～5 題——英文課前面還有認識、描字、單字三段，選擇題這一段再短一點）。
 * 選項數：前三個字母 2 選 1，之後 3 選 1（教過的不夠就少一個）。
 * 大寫、小寫都照問（T-124）：以前 T-100 的退一級（大寫題錯過、或中途離開又回來，小寫題改問大寫）會讓同一個「Big S」連問兩次，
 * 盲測 f255333 英文 4 次離開都在選擇題（「一直點都一樣」）。小寫題點錯時手指著答案、答案亮、跳（T-116），照樣上得完。
 */
export function makeQuiz(letter: LessonLetter, idx: number, seq = ORDER): Question[] {
  const learned = [...seq.slice(0, idx)]
  const taught = [...seq.slice(0, idx + 1)]
  const n = idx < 3 ? 1 : 2
  const { L } = letter
  const qs: Question[] = []
  const letterQ = (X: string, big: boolean): Question => ({
    kind: big ? 'big' : 'little',
    L: X,
    prompt: [big ? `ph.${X.toLowerCase()}.big` : `ph.${X.toLowerCase()}.little`],
    answer: X,
    options: letterOptions(X, big, taught, learned, n),
    skill: `letter:${big ? X : X.toLowerCase()}`,
    yes: [`ph.${X.toLowerCase()}.sound`],
    echo: [big ? `ph.${X.toLowerCase()}.big` : `ph.${X.toLowerCase()}.little`],
  })
  /** 聽字找圖：今天教的代表字（看圖認得出來的），2 選 1；干擾圖是以前（或今天另一個）教過、不同類的字 */
  const wordQ = (): Question | null => {
    for (const a of shuffle(findable(letter))) {
      const others = distractors({ L, w: a }, taught, 1)
      if (!others.length) continue
      const id = wordId(a.w)
      return {
        kind: 'word',
        L,
        prompt: [`en.where.word.${id}`],
        answer: id,
        options: shuffle([a, ...others]).map((w) => ({ id: wordId(w.w), icon: w.icon })),
        skill: `enword:${id}`,
        yes: sandwich(L, a.w),
        echo: sandwich(L, a.w),
        word: a.w,
      }
    }
    return null
  }
  qs.push(letterQ(L, true), letterQ(L, false))
  // 第一天只問大寫、小寫（新帳號第一天 2 回合）
  if (idx === 0) return qs
  const word = wordQ()
  const review = learned.length ? letterQ(pick(learned.slice(-3)), true) : null
  const third = idx % 2 ? (word ?? review) : (review ?? word)
  if (third) qs.push(third)
  return qs
}

/**
 * 答錯時說明（A16）：說出孩子點的是什麼、要找的是什麼（That's big B. Find big A!／That's a banana. Find the apple!）。
 * 字母選項的 id 是大寫字母；「同一個字母的另一種寫法」是 A:little／A:big（flipId），照畫面上看到的大小寫念。台詞在 lines.ts。
 */
export function wrongKeys(q: Question, o: Opt): string[] {
  // 找圖：That's a bus. → Find the apple!
  if (q.kind === 'word') return [`en.that.word.${o.id}`, `en.find.word.${q.answer}`]
  const [c, shown] = o.id.split(':')
  const big = shown ? shown === 'big' : q.kind === 'big'
  return [big ? `en.that.big.${c}` : `en.that.little.${c.toLowerCase()}`, q.kind === 'big' ? `en.find.big.${q.answer}` : `en.find.little.${q.answer.toLowerCase()}`]
}
