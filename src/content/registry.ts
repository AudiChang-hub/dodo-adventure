// 台詞登記處：所有 lines*.ts 都透過這裡的 def() 新增台詞，
// 這樣不同功能可以各自放在自己的檔案，平行開發時不會改到同一個檔案

export type Speaker = 'dodo' | 'bobo' | 'momo'

/**
 * 台詞全部是英文。`|` 之後是要加重的目標字：
 * 會另外產生一段放慢、加大音量的音檔，播放時兩段之間停 0.1 秒，
 * 例如 'Where is | B?' 念成「Where is …B?」。
 */
export interface Line {
  speaker: Speaker
  text: string
}

export interface Segment {
  text: string
  emph: boolean
}

export function segments(l: Line): Segment[] {
  return l.text.split('|').map((t, i) => ({ text: t.trim(), emph: i > 0 }))
}

const REG = new Map<string, Line>()

export function def(key: string, speaker: Speaker, text: string) {
  if (REG.has(key) && REG.get(key)!.text !== text) throw new Error(`Line defined twice with different text: ${key}`)
  REG.set(key, { speaker, text })
}

export function line(key: string): Line {
  const l = REG.get(key)
  if (!l) throw new Error(`Unknown line: ${key}`)
  return l
}

export const hasLine = (key: string) => REG.has(key)
export const allLines = () => [...REG.entries()]
