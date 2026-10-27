import type { Speaker } from './lines'

export interface VoiceSpec {
  voice: string
  rate: string
  pitch: string
  volume: string
}

// 三隻恐龍都用北美童聲 Ana，只微調音高與語速來區分角色；整體只放慢約 10%
export const VOICES: Record<Speaker, VoiceSpec> = {
  dodo: { voice: 'en-US-AnaNeural', rate: '-10%', pitch: '+0Hz', volume: '+0%' },
  bobo: { voice: 'en-US-AnaNeural', rate: '-8%', pitch: '-8Hz', volume: '+0%' },
  momo: { voice: 'en-US-AnaNeural', rate: '-14%', pitch: '+4Hz', volume: '+0%' },
}

/** 加重的目標字：再放慢、音量加大 */
export function emphasis(v: VoiceSpec): VoiceSpec {
  const rate = parseInt(v.rate, 10) - 15
  return { ...v, rate: `${rate}%`, volume: '+30%' }
}

/** 兩段之間的停頓（毫秒） */
export const SEGMENT_GAP_MS = 100
