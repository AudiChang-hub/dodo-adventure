import type { Lang, Speaker } from './lines'

export interface VoiceSpec {
  voice: string
  rate: string
  pitch: string
}

// 每隻恐龍各有中英文聲線；語速一律放慢，讓 3 歲孩子聽得清楚
export const VOICES: Record<Speaker, Record<Lang, VoiceSpec>> = {
  dodo: {
    zh: { voice: 'zh-TW-HsiaoYuNeural', rate: '-8%', pitch: '+14Hz' },
    en: { voice: 'en-US-AnaNeural', rate: '-18%', pitch: '+0Hz' },
  },
  bobo: {
    zh: { voice: 'zh-TW-YunJheNeural', rate: '-6%', pitch: '+10Hz' },
    en: { voice: 'en-US-GuyNeural', rate: '-15%', pitch: '+0Hz' },
  },
  momo: {
    zh: { voice: 'zh-TW-HsiaoChenNeural', rate: '-16%', pitch: '-2Hz' },
    en: { voice: 'en-US-JennyNeural', rate: '-18%', pitch: '+0Hz' },
  },
}
