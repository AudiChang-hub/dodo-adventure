// 中文課文的資料：180 篇課文（texts.json，家長審過，從 docs/中文課文/課文.json 複製進來）、選圖題、聊一聊的問題。
// 只放資料和規則，畫面在 ./Lesson.tsx。2026-11-03 起中文課是親子共讀：App 不出聲，沒有任何中文音檔。
import TEXTS from './texts.json'
import TALK from './talk.json'

export interface ZhText {
  day: number
  /** 上這一篇的日期（YYYY-MM-DD）：2026-11-02 起一天一篇 */
  date: string
  title: string
  category: string
  source: string
  /** 課文一行一行，紅字（重點字詞）用【】包起來 */
  lines: string[]
  redWords: string[]
  /** 家長定的選圖題：哪個是 answer？（三選一） */
  quiz: { answer: string; distractors: string[] }
  /** 每個字詞的圖（Fluent Emoji 的名字）；null 是還沒有圖（要另外畫，先不出題） */
  emoji: Record<string, string | null>
  /** 給大人看的一句：小字放在角落 */
  parentTip: string
}

export const ZH_TEXTS = TEXTS as unknown as ZhText[]

// ── 課文的一行 ────────────────────────────────────────────────
export interface Piece {
  text: string
  /** 紅字：可以點、單獨再聽一次 */
  red: boolean
}

/** 「三隻【小豬】蓋【房子】，」→ [三隻][小豬*][蓋][房子*][，] */
export function pieces(line: string): Piece[] {
  return line
    .split(/(【[^】]+】)/)
    .filter(Boolean)
    .map((t) => (t.startsWith('【') ? { text: t.slice(1, -1), red: true } : { text: t, red: false }))
}

/** 念的文字（去掉【】） */
export const plain = (line: string) => line.replace(/[【】]/g, '')

/** 一行旁邊的一張圖：word 是哪個紅字詞；echo 是這一行自己沒有紅字、借前後行的主角來的 */
export interface LinePic {
  word: string
  echo: boolean
}

/**
 * 每一行旁邊放哪幾張圖（孩子在大人念這一行時可以點的東西）。
 * 有紅字（而且有圖）的行：就是那幾個紅字的圖。
 * 沒有紅字的行（180 篇裡一半以上的行，T-111：盲測 a35cd5e 三次都在念「跑到樹下睡大覺。」「爬呀爬，先到了！」這種行的時候，
 * 孩子沒有東西可以點，只好去點莫莫、覺得好久，最後離開）：借上一行最後一個紅字的圖（通常就是這一行在講的主角：
 * 「兔子跑得快快快，／跑到樹下睡大覺。」→ 兔子）；前面都沒有，就借後面第一個。
 */
export function linePics(t: ZhText): LinePic[][] {
  const own = t.lines.map((l) => [...new Set(pieces(l).filter((p) => p.red && t.emoji[p.text]).map((p) => p.text))])
  return own.map((ws, i) => {
    if (ws.length) return ws.map((word) => ({ word, echo: false }))
    for (let j = i - 1; j >= 0; j--) if (own[j].length) return [{ word: own[j][own[j].length - 1], echo: true }]
    for (let j = i + 1; j < own.length; j++) if (own[j].length) return [{ word: own[j][0], echo: true }]
    return []
  })
}

// ── 選圖題 ────────────────────────────────────────────────────
export interface ZhQuestion {
  /** 要找的字詞（課文裡的紅字：先聽過、看過才考） */
  word: string
  /** 三張圖：[字詞, 圖名]，答案在第一個（出題時再洗牌） */
  options: { word: string; icon: string }[]
  /** 故事題（第 STORY_RUN 次）：課文的一句，答案的地方挖空（「＿＿跑得快快快」→ 誰？）；沒有就是一般的「哪個是〇〇？」 */
  story?: ZhStory
}

/** 故事題挖空的那一句：line 第幾行；before、after 是空格前後的字（去掉【】）；who：答案是會動的（問「誰」），不然問「什麼」 */
export interface ZhStory {
  line: number
  before: string
  after: string
  who: boolean
}

const iconOf = (t: ZhText, w: string) => t.emoji[w] ?? null

/**
 * 會動、會說話的（動物、人、雪人、泰迪熊）：故事題問「誰」；其他的（東西、吃的）問「什麼」。
 * 用圖的名字判斷（同一個詞在每一篇都是同一張圖）；新的課文用了新的動物圖要加進來，scripts/test-zh-course.ts 會列出沒分到的圖。
 */
export const WHO_ICONS: ReadonlySet<string> = new Set(
  (
    'rabbit turtle pig lion mouse dog cat bird ant fish baby-chick shrimp blackbird butterfly turkey fox elephant goose bear tiger ' +
    'parrot frog cow honeybee chicken snowman deer horse donkey santa-claus ewe spouting-whale duck swan giraffe monkey rooster baby ' +
    'teddy-bear dove snake dolphin snail goat dragon crab spider panda bug peacock old-man eagle mosquito cricket bat tropical-fish wolf'
  ).split(' '),
)
export const isWho = (t: ZhText, w: string) => WHO_ICONS.has(iconOf(t, w) ?? '')

/** 這一篇和上過的篇（最近上的先）：教過的字詞 → 圖（這一篇的圖優先） */
function taughtOf(t: ZhText, done: ReadonlySet<number>) {
  const earlier = ZH_TEXTS.filter((x) => x.day !== t.day && done.has(x.day)).sort((a, b) => b.day - a.day)
  const taught = new Map<string, string>()
  for (const x of [t, ...earlier]) for (const w of x.redWords) if (!taught.has(w) && iconOf(x, w)) taught.set(w, iconOf(x, w)!)
  return { earlier, taught }
}

/** w 的陪襯（最多 2 張）：照 order 的順序挑教過的、圖不一樣的 */
function distractors(t: ZhText, w: string, order: readonly string[], taught: ReadonlyMap<string, string>): string[] {
  const used = new Set([iconOf(t, w)!])
  const ds: string[] = []
  for (const x of order) {
    const ic = taught.get(x)
    if (ds.length < 2 && x !== w && ic && !used.has(ic)) used.add(ic), ds.push(x)
  }
  return ds
}

/**
 * 一篇要考哪些字詞：
 * 家長定的那一題（quiz）先考，其他紅字詞各一題；還沒有圖的字詞先不考（總表「需要新畫的圖」）。
 * 這一篇自己的字詞裡找不到兩張不一樣的圖可以當陪襯的（一把筷子：全是筷子）也不考。
 */
export function quizWords(t: ZhText): string[] {
  const words = [t.quiz.answer, ...t.redWords.filter((w) => w !== t.quiz.answer)]
  return words.filter((w) => {
    const icon = iconOf(t, w)
    if (!icon || !t.redWords.includes(w)) return false
    const icons = new Set([icon])
    for (const x of [...t.quiz.distractors, ...t.redWords, ...Object.keys(t.emoji)]) {
      const ic = iconOf(t, x)
      if (x !== w && ic) icons.add(ic)
    }
    return icons.size >= 3
  })
}

/**
 * 一篇的選圖題（三選一，教過的不夠就二選一）。不教不考（家長 2026-11-02）：答案和干擾圖都只能是教過的字詞——
 * 這一篇的紅字（念課文時聽過、看過圖），或之前上過的篇（done，progress.ts 的 doneDays）的紅字。
 * - 干擾圖的順序：家長定的干擾（教過的才用）→ 這一篇其他紅字 → 上過的篇的紅字（最近上的先）；同一張圖不出現兩次。
 * - 連一張教過的陪襯都沒有的題目不出。
 */
export function questionsOf(t: ZhText, done: ReadonlySet<number> = new Set()): ZhQuestion[] {
  const { earlier, taught } = taughtOf(t, done)
  const out: ZhQuestion[] = []
  for (const w of quizWords(t)) {
    const icon = iconOf(t, w)!
    const pref = w === t.quiz.answer ? t.quiz.distractors : []
    const ds = distractors(t, w, [...pref, ...t.redWords, ...earlier.flatMap((e) => e.redWords)], taught)
    if (!ds.length) continue
    out.push({ word: w, options: [{ word: w, icon }, ...ds.map((x) => ({ word: x, icon: taught.get(x)! }))] })
  }
  return out
}

/** 同一篇上到第幾次才問故事題（現況對照 A8：第一次聽的那天不考理解） */
export const STORY_RUN = 3

/** 標點（挖空的句子至少要有兩個不是標點的字，才看得出在問哪一句） */
const PUNCT = /[，。！？、：；「」『』—…,.!?:;"'\s]/g

/** 故事題的候選：課文裡每個有圖的紅字（第幾行、在那一行的第幾段） */
function storySpots(t: ZhText) {
  const out: { line: number; word: string; story: ZhStory }[] = []
  t.lines.forEach((l, line) => {
    const ps = pieces(l)
    ps.forEach((p, k) => {
      if (!p.red || !iconOf(t, p.text)) return
      const before = ps.slice(0, k).map((x) => x.text).join('')
      const after = ps.slice(k + 1).map((x) => x.text).join('')
      if ((before + after).replace(PUNCT, '').length < 2) return
      out.push({ line, word: p.text, story: { line, before, after, who: isWho(t, p.text) } })
    })
  })
  return out
}

/**
 * 故事題（現況對照 A8、T-127 B 案的第 3 次）：大人念課文的一句，念到挖空的地方停下來問「誰？」（動物、人）或「什麼？」，孩子點圖回答。
 * 題目從課文產生，每篇都有，不用家長另外寫，也不出聲（中文課是親子共讀，App 不念）：
 * - 挖空的是一個有圖的紅字；那一句除了空格還要有兩個字以上（看得出問哪一句）。
 * - 先挑問「誰」的（3 歲理解看角色，幼教指引 ZH-1），再挑不是「聊一聊」主角、不是家長定的選圖答案的（同一堂不問一樣的），再挑後面的句子（要記得故事）。
 * - 陪襯：教過的字詞（不教不考），問「誰」的先用會動的當陪襯；連一張陪襯都沒有就不出這一題。
 * - n：最多幾題（排順序出不來的篇多出一題，Lesson.tsx 的退路；每題答案不一樣）。
 */
export function storyQuestionsOf(t: ZhText, done: ReadonlySet<number> = new Set(), n = 1): ZhQuestion[] {
  const { earlier, taught } = taughtOf(t, done)
  const talk = talkFor(t)?.pic ?? null
  const score = (s: { word: string; story: ZhStory }) => (s.story.who ? 4 : 0) + (s.word !== talk ? 2 : 0) + (s.word !== t.quiz.answer ? 1 : 0)
  const spots = storySpots(t)
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => score(b) - score(a) || b.line - a.line || a.i - b.i)
  const pool = [...t.redWords, ...earlier.flatMap((e) => e.redWords)]
  const out: ZhQuestion[] = []
  for (const s of spots) {
    if (out.length >= n || out.some((q) => q.word === s.word)) continue
    // 那一句裡說到的其他字詞不當陪襯（「＿＿和牛都來看他」的牛：他會以為也對）
    const said = s.story.before + s.story.after
    const ok = pool.filter((w) => !said.includes(w))
    const whoFirst = s.story.who ? [...ok.filter((w) => taught.has(w) && WHO_ICONS.has(taught.get(w)!)), ...ok] : ok
    const ds = distractors(t, s.word, whoFirst, taught)
    if (!ds.length) continue
    out.push({ word: s.word, story: s.story, options: [{ word: s.word, icon: iconOf(t, s.word)! }, ...ds.map((x) => ({ word: x, icon: taught.get(x)! }))] })
  }
  return out
}

/** 排順序的一張圖：哪個紅字、第幾行說到的 */
export interface ZhOrderCard {
  word: string
  icon: string
  line: number
}

/** 排兩張圖的順序（T-127 B 案的第 3 次）：故事裡先說到 first、後說到 then */
export interface ZhOrder {
  first: ZhOrderCard
  then: ZhOrderCard
}

/**
 * 排順序的題目：課文裡最先說到的有圖紅字當「先」，後面說到的另一張圖當「後」（從課文產生，每篇都有；不出聲）。
 * - 「後」先挑不同行的（最後面那一行說到的：先後差最遠，最好分），整篇只有一行有圖的，挑同一行後面說到的；
 * - 兩張圖要不一樣；整篇有圖的紅字不到兩張不一樣的，回傳 null（Lesson.tsx 改成多一題故事題）。
 */
export function orderOf(t: ZhText): ZhOrder | null {
  const seen = new Map<string, ZhOrderCard & { at: number }>()
  let at = 0
  t.lines.forEach((l, line) => {
    for (const p of pieces(l)) {
      at++
      const icon = iconOf(t, p.text)
      if (p.red && icon && !seen.has(p.text)) seen.set(p.text, { word: p.text, icon, line, at })
    }
  })
  const cards = [...seen.values()]
  const first = cards[0]
  if (!first) return null
  const rest = cards.filter((c) => c.icon !== first.icon && c.at > first.at)
  const then = rest.filter((c) => c.line > first.line).sort((a, b) => b.line - a.line || a.at - b.at)[0] ?? rest[0]
  if (!then) return null
  const card = ({ word, icon, line }: ZhOrderCard) => ({ word, icon, line })
  return { first: card(first), then: card(then) }
}

/** 第 STORY_RUN 次多的題目：故事題一題＋排順序；排順序出不來的篇，改成故事題兩題（退路：不出壞題） */
export function storyRunOf(t: ZhText, done: ReadonlySet<number> = new Set()): { story: ZhQuestion[]; order: ZhOrder | null } {
  const order = orderOf(t)
  return { story: storyQuestionsOf(t, done, order ? 1 : 2), order }
}

/** 選圖題念的那一句 */
export const questionText = (w: string) => `哪個是${w}？`

/**
 * 聊一聊的題目（T-102，第三次盲測：「為什麼烏龜先到？」3 歲答不出來）：照全球幼教指引 ZH-1、ZH-3，3 歲問「誰、什麼、哪裡、在做什麼」，
 * 答案直接在課文裡（說得出或指得出誰做了什麼）；「為什麼」是 4 歲的目標。每篇一題（./talk.json，照課文寫，scripts/test-zh-course.ts 檢查）：
 * - q：大人問的那一句；a：他答不出來時，大人示範的完整回答（3 歲大人的角色是示範者）；
 * - pic：問題的主角有圖的話是那個紅字詞，卡片上放那張圖，孩子可以用指的回答。
 */
export interface ZhTalk {
  q: string
  a: string
  pic: string | null
}
const TALKS = TALK as unknown as Record<string, ZhTalk>
export const talkFor = (t: ZhText): ZhTalk => TALKS[String(t.day)]

/**
 * 舊的陪讀小字（parentTip）裡「」括起來的問句（多半是「為什麼」，3 歲太難，T-102 換成 talkFor）；rest 是其他的（動一動、生活延伸），
 * 聊一聊卡片下面當「還可以」的小字。沒有問句的篇（例如「一起找家裡哪裡紅紅的」）整句是 rest。
 */
export function talkOf(tip: string): { questions: string[]; rest: string } {
  const questions = [...tip.matchAll(/「([^」]*[？?])」/g)].map((m) => m[1])
  const rest = questions.length
    ? tip
        .replace(/(問(孩子)?[：:]?)?「[^」]*[？?]」[；;，,。]?/g, '')
        .replace(/^[；;，,。\s]+|[；;，,\s]+$/g, '')
        .trim()
    : tip
  return { questions, rest }
}
