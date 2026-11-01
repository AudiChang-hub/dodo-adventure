// 中文課文的資料：180 篇課文（texts.json，家長審過，從 docs/中文課文/課文.json 複製進來）、今天上哪一篇、聲音檔名、上過哪幾篇。
// 只放資料和規則，畫面在 ./Lesson.tsx。scripts/extract-phrases.ts 也讀這裡，產生聲音的清單（scripts/.cache/zh-lessons.json）。
import { fnv1a } from '../../lib/hash'
import TEXTS from './texts.json'

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

// ── 選圖題 ────────────────────────────────────────────────────
export interface ZhQuestion {
  /** 要找的字詞（課文裡的紅字：先聽過、看過才考） */
  word: string
  /** 三張圖：[字詞, 圖名]，答案在第一個（出題時再洗牌） */
  options: { word: string; icon: string }[]
}

const iconOf = (t: ZhText, w: string) => t.emoji[w] ?? null

/**
 * 一篇的選圖題：先考家長定的那一題（quiz），其他紅字詞各一題。
 * - 答案一定是這一篇的紅字（念課文時聽過、看過圖）；還沒有圖的字詞先不考（總表「需要新畫的圖」）。
 * - 干擾圖：家長定的那一題用 quiz.distractors；其他題從同一篇的字詞（家長定的干擾、其他紅字）挑兩張，沒有圖的跳過。
 */
export function questionsOf(t: ZhText): ZhQuestion[] {
  const words = [t.quiz.answer, ...t.redWords.filter((w) => w !== t.quiz.answer)]
  const out: ZhQuestion[] = []
  for (const w of words) {
    const icon = iconOf(t, w)
    if (!icon || !t.redWords.includes(w)) continue
    const pref = w === t.quiz.answer ? t.quiz.distractors : []
    // 同一張圖不出現兩次（彩蛋、雞蛋都是 egg）
    const used = new Set([icon])
    const ds: string[] = []
    for (const x of [...pref, ...t.quiz.distractors, ...t.redWords, ...Object.keys(t.emoji)]) {
      const ic = iconOf(t, x)
      if (ds.length < 2 && x !== w && ic && !used.has(ic)) used.add(ic), ds.push(x)
    }
    if (ds.length < 2) continue
    out.push({ word: w, options: [{ word: w, icon }, ...ds.map((x) => ({ word: x, icon: iconOf(t, x)! }))] })
  }
  return out
}

/** 選圖題念的那一句 */
export const questionText = (w: string) => `哪個是${w}？`

// ── 聲音（BreezyVoice D 組，scripts/gen_zh_breezy.py 預先產生）────────────
/** 檔名的算法和 gen_zh_breezy.py 的 clip_name 一樣：同一句話在不同篇只產生一次 */
const VOICE = 'breezy|example2nd|v1'
export type ClipKind = 'text' | 'word' | 'question'
export const zhClip = (kind: ClipKind, text: string) => `zh-lesson/${fnv1a(`${VOICE}|${kind}|${text}`)}`

let ready: Promise<Set<string>> | null = null

/**
 * 通過檢查的聲音（public/audio/zh-lesson/index.json 的檔名）。不在裡面的句子不出聲（課文照樣顯示），
 * 絕不退回平板內建語音（家長很討厭機器聲）。
 */
export function zhReady(): Promise<Set<string>> {
  ready ??= fetch(`${import.meta.env.BASE_URL}audio/zh-lesson/index.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((j: Record<string, string>) => new Set(Object.keys(j)))
    .catch(() => new Set<string>())
  return ready
}

/** 這一句有沒有可以播的聲音（ready 是 zhReady 的結果） */
export const hasClip = (ready: Set<string>, kind: ClipKind, text: string) => ready.has(zhClip(kind, text).slice('zh-lesson/'.length))

/** 一篇要產生的所有句子（scripts/extract-phrases.ts 寫成 scripts/.cache/zh-lessons.json 給 gen_zh_breezy.py） */
export function clipRows(t: ZhText) {
  const d = String(t.day).padStart(3, '0')
  const lesson = `${d}${t.title}`
  return [
    ...t.lines.map((l, i) => ({ key: `d${d}.text.${i + 1}`, lesson, day: t.day, kind: 'text' as const, text: plain(l) })),
    ...t.redWords.map((w) => ({ key: `d${d}.word.${w}`, lesson, day: t.day, kind: 'word' as const, text: w })),
    ...questionsOf(t).map((q) => ({ key: `d${d}.q.${q.word}`, lesson, day: t.day, kind: 'question' as const, text: questionText(q.word) })),
  ]
}
