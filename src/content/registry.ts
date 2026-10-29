// 台詞登記處：所有 lines*.ts 都透過這裡的 def() 新增台詞，
// 這樣不同功能可以各自放在自己的檔案，平行開發時不會改到同一個檔案

import { isPronunciationDemo, withInterjection } from './interjections'
import { stretchOf } from './stretch'

export type Speaker = 'dodo' | 'bobo' | 'momo'

/**
 * 台詞全部是英文。
 * - `|` 之後是要加重的目標字：另外產生一段放慢、加大音量的音檔，例如 'Where is | B?' 念成「Where is …B?」。
 * - `||` 之前是感嘆詞段（語調 E4）：'Hooray! || Great job!'。情緒句由 interjections.ts 的規則在這裡自動加上。
 */
export interface Line {
  speaker: Speaker
  text: string
  /** 發音示範（自然發音）：維持原本的合成參數與音檔，不加感嘆詞、不做語調放大 */
  demo: boolean
  /**
   * 單字的中文三明治（defBridge）：先唸這個中文（BreezyVoice 預先產生的音檔），停一下再用英文把字唸一次。
   * 前面那一次英文是教學卡上一句台詞本身（This is an | apple.），所以字幕顯示成「Apple — 蘋果 — Apple.」。
   */
  zh?: string
  /** 中文三明治字幕最前面那個英文字（上一句已經唸過，只顯示） */
  lead?: string
}

/** interj：感嘆詞段；body：一般段（有感嘆詞或目標字時是「鋪陳段」）；emph：加重的目標字；zh：中文三明治的中文 */
export type SegmentRole = 'interj' | 'body' | 'emph' | 'zh'

export interface Segment {
  text: string
  emph: boolean
  role: SegmentRole
}

export function segments(l: Line): Segment[] {
  if (l.zh != null) return [{ text: l.zh, emph: false, role: 'zh' }, { text: l.text, emph: true, role: 'emph' }]
  const cut = l.text.indexOf('||')
  const out: Segment[] = cut >= 0 ? [{ text: l.text.slice(0, cut).trim(), emph: false, role: 'interj' }] : []
  const rest = cut >= 0 ? l.text.slice(cut + 2) : l.text
  rest.split('|').forEach((t, i) => out.push({ text: t.trim(), emph: i > 0, role: i > 0 ? 'emph' : 'body' }))
  return out
}

/** 去掉 `|`、`||` 的整句文字（平板內建語音備援用；英文語音唸不了中文，中文三明治只留英文；拉長音 Sss… 會被拼成字母，只留單字） */
export const plainText = (l: Line) =>
  segments(l)
    .filter((s) => s.role !== 'zh')
    .map((s) => stretchOf(s.text)?.word ?? s.text)
    .filter(Boolean)
    .join(' ')

const REG = new Map<string, Line>()

export function def(key: string, speaker: Speaker, text: string) {
  const demo = isPronunciationDemo(key)
  const full = demo ? text : withInterjection(key, speaker, text)
  if (REG.has(key) && REG.get(key)!.text !== full) throw new Error(`Line defined twice with different text: ${key}`)
  REG.set(key, { speaker, text: full, demo })
}

/**
 * 單字的中文三明治：key 一律是 zh.<說話者>.<單字>（content/zh-words.ts 的 bridgeKey）。
 * zh 是要唸的中文，en 是之後再唸一次的英文（Apple.，用目標字的加重聲線）。
 */
export function defBridge(key: string, speaker: Speaker, zh: string, en: string) {
  const lead = en.replace(/[^\p{L}\p{N}\s'-]+$/u, '')
  if (REG.has(key) && (REG.get(key)!.text !== en || REG.get(key)!.zh !== zh)) throw new Error(`Line defined twice with different text: ${key}`)
  REG.set(key, { speaker, text: en, demo: false, zh, lead })
}

/** 這句是不是中文三明治（教學卡在它前面只停一下，接著上一句的英文） */
export const isBridge = (key: string) => REG.get(key)?.zh != null

export function line(key: string): Line {
  const l = REG.get(key)
  if (!l) throw new Error(`Unknown line: ${key}`)
  return l
}

export const hasLine = (key: string) => REG.has(key)
export const allLines = () => [...REG.entries()]
