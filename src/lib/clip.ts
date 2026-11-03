import { fnv1a } from './hash'
import { segments, type Line, type Segment } from '../content/lines'
import { E4, SEGMENT_GAP_MS, VOICES, adjust, emphasis, type VoiceSpec } from '../content/voices'
import { INTERJ } from '../content/interjections'
import { zhClip } from '../content/zh-words'
import { CUE, cueOf, cueParts } from '../content/phonics-cue'

/** 中文三明治：英文和中文之間的停頓（毫秒），前後一樣 */
export const BRIDGE_GAP_MS = 400

export function segmentVoice(l: Line, s: Segment): VoiceSpec {
  const v = VOICES[l.speaker]
  // 字母音台詞（S, S, S… s, s, s… snake!）不管在 | 前後都用加重的聲線
  if (l.demo) return s.emph || cueOf(s.text) ? emphasis(v) : v
  if (s.role === 'interj') {
    const j = INTERJ[s.text]
    if (!j) throw new Error(`Unknown interjection: ${s.text}（要先加進 interjections.ts 的 INTERJ）`)
    return adjust(v, { rate: j.rate, volume: j.volume })
  }
  if (s.role === 'emph') return adjust(v, E4.emph)
  // 句中有感嘆詞或目標字時，一般段就是「鋪陳段」：降一點音高，讓重點相對浮出來
  const roles = segments(l).map((x) => x.role)
  if (roles.includes('emph')) return adjust(v, { pitch: E4.bodyPitch })
  // 只有感嘆詞、沒有目標字（Hooray! || Great job!）：感嘆詞後面那句也稍微放慢
  if (roles.includes('interj')) return adjust(v, { pitch: E4.bodyPitch, rate: E4.replyRate })
  return v
}

/** gen_audio.py 合成後的後製：修剪頭尾靜音＋Praat 不對稱放大。發音示範回傳 null（原檔不動） */
export interface ClipFx {
  tag: string
  center: number
  kUp: number
  kDown: number
  cap: number
  knee: number
  keep: number
  floorSoft: number
  floorHard: number
  floorKeep: number
  lead: number
  tail: number
}

export function segmentFx(l: Line): ClipFx | null {
  if (l.demo) return null
  const p = E4.psola
  const cap = E4.cap[l.speaker]
  const center = E4.center[l.speaker]
  const { lead, tail } = E4.trim
  const tag = `e4|psola-m${center}u${p.kUp}d${p.kDown}c${cap}k${p.knee}r${p.keep}f${p.floorSoft}-${p.floorHard}r${p.floorKeep}|trim${lead}-${tail}`
  return { tag, center, ...p, cap, lead, tail }
}

/** 音檔檔名同時包含聲線設定與後製版本，調整語速、音高或放大參數後會自動重新產生 */
export function clipName(l: Line, s: Segment): string {
  // 中文三明治的中文：BreezyVoice 預先產生（scripts/gen_zh_words.py），不經過 edge-tts
  if (s.role === 'zh') return zhClip(s.text)
  const v = segmentVoice(l, s)
  const fx = segmentFx(l)
  // 字母音台詞（S, S, S… s, s, s… snake!）是一段一段組出來的，組合方式也要算進檔名
  const c = cueOf(s.text)
  const st = c ? `|cue-v${CUE.version}-${CUE.holdMs}-${CUE.gapMs}-${CUE.repeatGapMs}|${JSON.stringify(cueParts(c))}` : ''
  const base = `${v.voice}|${v.rate}|${v.pitch}|${v.volume}|${s.text}${st}`
  // 發音示範的檔名公式維持原樣：原本實測過的音檔原封不動沿用
  return fnv1a(fx ? `${base}|${fx.tag}` : base)
}

/** 第 i 段（i ≥ 1）開始前的停頓（毫秒）。E4 的音檔頭尾靜音已修剪，停頓就是實際聽到的長度 */
export function segmentGap(l: Line, i: number): number {
  if (l.demo) return SEGMENT_GAP_MS
  const segs = segments(l)
  const prev = segs[i - 1]
  if (prev.role === 'zh') return BRIDGE_GAP_MS
  if (prev.role === 'interj') return INTERJ[prev.text]?.gap ?? 240
  const cur = segs[i]
  if (cur.role === 'emph') return /\?\s*$/.test(cur.text) ? E4.gapEmphQuestion : E4.gapEmph
  return SEGMENT_GAP_MS
}
