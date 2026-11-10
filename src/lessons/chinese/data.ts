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
}

const iconOf = (t: ZhText, w: string) => t.emoji[w] ?? null

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
  const earlier = ZH_TEXTS.filter((x) => x.day !== t.day && done.has(x.day)).sort((a, b) => b.day - a.day)
  // 教過的字詞 → 圖（這一篇的圖優先）
  const taught = new Map<string, string>()
  for (const x of [t, ...earlier]) for (const w of x.redWords) if (!taught.has(w) && iconOf(x, w)) taught.set(w, iconOf(x, w)!)
  const out: ZhQuestion[] = []
  for (const w of quizWords(t)) {
    const icon = iconOf(t, w)!
    const pref = w === t.quiz.answer ? t.quiz.distractors : []
    const used = new Set([icon])
    const ds: string[] = []
    for (const x of [...pref, ...t.redWords, ...earlier.flatMap((e) => e.redWords)]) {
      const ic = taught.get(x)
      if (ds.length < 2 && x !== w && ic && !used.has(ic)) used.add(ic), ds.push(x)
    }
    if (!ds.length) continue
    out.push({ word: w, options: [{ word: w, icon }, ...ds.map((x) => ({ word: x, icon: taught.get(x)! }))] })
  }
  return out
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
