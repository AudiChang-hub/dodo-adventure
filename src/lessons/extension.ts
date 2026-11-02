// 下課後的「現在去做」（全球幼教指引 HOW-12、PH-1，現況對照 A13）：上完一堂，給大人一句跟今天內容有關、離開螢幕去做的事。
// 4 歲以下很難把平板上學的搬到真的東西上，所以每一堂都把今天的內容帶回生活，順便動一動。
// 只讀各課記下的今天的進度（不改各課的程式）；讀不到就回傳通用的一句。
import { getKV } from '../lib/db'
import { WORD_INFO } from '../content/lexicon-info'
import { loadProgress } from './english/plan'
import { ORDER, lessonLetter } from './english/data'
import type { Subject } from './types'

const GENERIC = '現在去做：離開平板，跟他一起站起來伸伸懶腰、跳 3 下。'

async function english(): Promise<string> {
  const p = await loadProgress()
  if (!p) return GENERIC
  const x = lessonLetter(p.idx, p.seq ?? ORDER)
  const words = x.starts
    .slice(0, 3)
    .map((w) => {
      const zh = WORD_INFO[w.w.toLowerCase()]?.[0]
      return zh ? `${w.w}（${zh}）` : w.w
    })
    .join('、')
  return `現在去做：跟他在家裡找 ${x.L} 開頭的東西${words ? `，像 ${words}` : ''}，找到就一起說「${x.L}！」；再用手指在空中寫一個大大的 ${x.L}。`
}

async function math(): Promise<string> {
  const p = await getKV<{ n?: number } | null>('lesson:math', null)
  const n = p?.n
  if (!n) return GENERIC
  return `現在去做：請他拿 ${n} 個真的東西給你（積木、湯匙、襪子都可以），一個一個數；再一起跳 ${n} 下。`
}

async function chinese(): Promise<string> {
  // 中文課文是點中文課的門才下載（180 篇）：這裡也用到才載入，首頁不會變大
  const { todays } = await import('./chinese/progress')
  const t = await todays()
  const reds = t.redWords.slice(0, 2).map((w) => `「${w}」`).join('、')
  return `現在去做：請他說說《${t.title}》裡的${reds}；再一起學故事裡的動物或東西動一動。`
}

/** 今天這一堂的「現在去做」 */
export async function extensionFor(subject: Subject): Promise<string> {
  try {
    return await (subject === 'english' ? english() : subject === 'math' ? math() : chinese())
  } catch {
    return GENERIC
  }
}
