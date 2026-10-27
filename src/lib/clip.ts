import { fnv1a } from './hash'
import type { Line, Segment } from '../content/lines'
import { VOICES, emphasis, type VoiceSpec } from '../content/voices'

export function segmentVoice(l: Line, s: Segment): VoiceSpec {
  const v = VOICES[l.speaker]
  return s.emph ? emphasis(v) : v
}

/** 音檔檔名同時包含聲線設定，調整語速或音高後會自動重新產生 */
export function clipName(l: Line, s: Segment): string {
  const v = segmentVoice(l, s)
  return fnv1a(`${v.voice}|${v.rate}|${v.pitch}|${v.volume}|${s.text}`)
}
