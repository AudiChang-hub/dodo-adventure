// 故事時間的英文版課文（T-129）：今天講哪一篇、書架上聽過哪幾篇、講到第幾句、找一樣的英文字示範過沒。
// 跟著 ./EnBook.tsx 分開載入（會載入中文課文 180 篇）。台詞和英文句子在 content/story/english.ts，每一頁的圖、念完的三題在 ./en-pages.ts。
// 進度存在這台平板的 kv（storyEn），家長重置學習進度時跟著清掉。
import { getKV, setKV, today } from '../../lib/db'
import { ZH_TEXTS, type ZhText } from '../../lessons/chinese/data'
import { lessonToday } from '../../lessons/chinese/progress'
import { enText } from '../../content/story/english'
import { heardTimes, pagePics } from './en-pages'

export interface EnState {
  /** 每一篇聽完的日期（{ [篇]: 日期[] }，一天最多一筆） */
  heard: Record<string, string[]>
  /** 講到一半離開：哪一天、哪一篇、下一次從第幾句接著講 */
  at?: { date: string; day: number; at: number }
  /** 找一樣的英文字做過幾次（前 MATCH_DEMOS 次手先示範） */
  matched?: number
}
const KV = 'storyEn'
const START: EnState = { heard: {} }
const load = () => getKV<EnState>(KV, START)

/** 找一樣的英文字：前幾次手先示範一次 */
export const MATCH_DEMOS = 2

/**
 * 今天講哪一篇（換篇規則只在這裡）：跟今天中文課的新篇同一篇（lessons/chinese/progress 的 lessonToday；T-136 起中文課一天兩篇、一舊一新，每上一次換新的一篇，英文版跟新篇走）。
 * 家長要改成別的換法（例如每天新的一篇）時只改這個函式。
 */
async function todaysDay(): Promise<ZhText> {
  return (await lessonToday()).t
}

/** 一本英文版課文（書架上的一本書） */
export interface EnBookRow {
  day: number
  title: string
  /** 封面的圖（Fluent Emoji 的名字） */
  pic: string
  /** 今天這一篇還沒聽完（講完才算一次） */
  isNew: boolean
  /** 聽完幾天（書上一圈三格） */
  heard: number
}

const textOf = (day: number) => ZH_TEXTS.find((t) => t.day === day)

const rowOf = (t: ZhText, st: EnState, isNew: boolean): EnBookRow => ({
  day: t.day,
  title: t.title,
  pic: pagePics(t, 0)[0] ?? 'open-book',
  isNew,
  heard: heardTimes(st.heard, t.day),
})

/** 今天的英文版和書架上聽過的其他篇（最近聽的在前面）；from 是今天這一篇中途離開時講到第幾句 */
export async function enShelf(): Promise<{ today: EnBookRow | null; heard: EnBookRow[]; from: number }> {
  const date = today()
  const [t, st] = await Promise.all([todaysDay(), load()])
  const todayRow = enText(t.day) ? rowOf(t, st, !(st.heard[t.day] ?? []).includes(date)) : null
  const last = (d: string) => Math.max(...(st.heard[d] ?? []).map((x) => Date.parse(x) || 0))
  const heard = Object.keys(st.heard)
    .filter((d) => Number(d) !== t.day && (st.heard[d] ?? []).length)
    .sort((a, b) => last(b) - last(a))
    .flatMap((d) => {
      const x = textOf(Number(d))
      return x && enText(x.day) ? [rowOf(x, st, false)] : []
    })
  const from = todayRow?.isNew && st.at?.date === date && st.at.day === t.day ? st.at.at : 0
  return { today: todayRow, heard, from }
}

/** 講到第幾句（中途離開，下次從這一句接著講） */
export async function saveEnAt(day: number, at: number) {
  await setKV(KV, { ...(await load()), at: { date: today(), day, at } })
}

/** 找一樣的英文字這一次要不要手先示範 */
export const matchDemo = async () => ((await load()).matched ?? 0) < MATCH_DEMOS

/** 找一樣的英文字做完一次 */
export async function saveMatched() {
  const st = await load()
  await setKV(KV, { ...st, matched: (st.matched ?? 0) + 1 })
}

/** 講完一篇：今天聽了一次（同一天再聽不多算） */
export async function finishEn(day: number) {
  const date = today()
  const { at: _at, ...st } = await load()
  const ds = st.heard[day] ?? []
  await setKV(KV, { ...st, heard: { ...st.heard, [day]: ds.includes(date) ? ds : [...ds, date] } })
}

export const zhTextOf = (day: number) => textOf(day)
