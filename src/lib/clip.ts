import { fnv1a } from './hash'
import type { Line } from '../content/lines'
import { VOICES } from '../content/voices'

/** 音檔檔名同時包含聲線設定，調整語速或音高後會自動重新產生 */
export function clipName(l: Line): string {
  const v = VOICES[l.speaker][l.lang]
  return fnv1a(`${v.voice}|${v.rate}|${v.pitch}|${l.text}`)
}
