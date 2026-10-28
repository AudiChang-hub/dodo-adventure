import type { Speaker } from './lines'

export interface VoiceSpec {
  voice: string
  rate: string
  pitch: string
  volume: string
}

// 三隻恐龍都用美式（北美）口音的童聲 Ana（en-US），只微調音高與語速來區分角色；整體只放慢約 10%
export const VOICES: Record<Speaker, VoiceSpec> = {
  dodo: { voice: 'en-US-AnaNeural', rate: '-10%', pitch: '+0Hz', volume: '+0%' },
  bobo: { voice: 'en-US-AnaNeural', rate: '-8%', pitch: '-8Hz', volume: '+0%' },
  momo: { voice: 'en-US-AnaNeural', rate: '-14%', pitch: '+4Hz', volume: '+0%' },
}

const num = (s: string) => parseInt(s, 10)
const sign = (n: number, unit: string) => `${n >= 0 ? '+' : ''}${n}${unit}`

/** 相對於角色基準調整：rate、volume 是百分點，pitch 是 Hz */
export function adjust(v: VoiceSpec, d: { rate?: number; pitch?: number; volume?: number }): VoiceSpec {
  return {
    ...v,
    rate: sign(num(v.rate) + (d.rate ?? 0), '%'),
    pitch: sign(num(v.pitch) + (d.pitch ?? 0), 'Hz'),
    volume: sign(num(v.volume) + (d.volume ?? 0), '%'),
  }
}

/** 加重的目標字（舊版，只剩發音示範在用）：再放慢、音量加大 */
export function emphasis(v: VoiceSpec): VoiceSpec {
  const rate = parseInt(v.rate, 10) - 15
  return { ...v, rate: `${rate}%`, volume: '+30%' }
}

/** 兩段之間的停頓（毫秒）：發音示範沿用 */
export const SEGMENT_GAP_MS = 100

/**
 * 語調 E4「溫和版」（2026-10-28 家長選定）。研究在 docs/voice-samples/prosody/README.md。
 * 合成時一律不加音高（加 Hz 會讓 Ana 往幼兒的音色走、變尖），重點改用放慢、停頓、音量凸顯；
 * 鋪陳段反而降一點音高，起伏靠「往下沉」做出來。之後再由 scripts/gen_audio.py 用 Praat 不對稱放大起伏。
 * 數字都是相對於各角色的基準（VOICES），基準不變。
 */
export const E4 = {
  /** 加重的目標字：rate、volume（音高 +0） */
  emph: { rate: -20, volume: 30 },
  /** 鋪陳段（句中有感嘆詞或目標字時的一般段，例如 This is、Where is、Great job!）降的 Hz */
  bodyPitch: -15,
  /** 只有感嘆詞、沒有目標字的句子（稱讚、鼓勵），感嘆詞後面那句的 rate（E4 試聽的 Great job!、try again! 是 −6～−8%） */
  replyRate: -6,
  /** 目標字前的停頓：直述句、問句（毫秒） */
  gapEmph: 320,
  gapEmphQuestion: 360,
  /**
   * Praat PSOLA 不對稱放大（gen_audio.py 的 expand_asym）：以 center 為中心，在半音尺度上往上放大 kUp 倍、往下放大 kDown 倍。
   * 天花板：從 cap − knee 開始超過的部分只保留 keep，硬上限 cap；地板：floorSoft 以下只保留 floorKeep，最低 floorHard。
   */
  psola: { kUp: 1.4, kDown: 1.5, knee: 30, keep: 0.2, floorSoft: 205, floorHard: 190, floorKeep: 0.3 },
  /**
   * 放大的中心（Hz）：各角色現況的中位音高（隨機 300 段實測）。
   * E4 試聽是整句接好再放大（中心＝整句的中位數），段與段之間的高低差（鋪陳段 −15Hz）也一起放大。
   * 正式的音檔是一段一段產生、同一段會被很多句共用，沒有「整句」可用；用每一段自己的中位數會把段間落差抹掉
   * （6 句代表台詞的起伏只剩 11.0 半音，E4 試聽是 12.1），改用角色固定的中心是 12.0，和試聽一致。
   */
  center: { dodo: 300, bobo: 287, momo: 306 } as Record<Speaker, number>,
  /**
   * 各角色的天花板（Hz）。三隻都是 Ana，基準只差 −8Hz／+4Hz，中位音高 300／287／306Hz、現況最高 459／425／415Hz。
   * 從 430 開始壓，分別在各自中位數之上 6.2／7.0／5.9 半音；現況的 95 百分位（371／352／369Hz）放大 1.4 倍後是 403／381／398Hz，
   * 三隻都碰不到壓縮區，只有感嘆詞、句尾上揚這類最高點會進去。所以三隻用同一個天花板：
   * 波波（最低）不會被壓平，莫莫（最高）也只高 0.4 半音，不會被削頂。改成依基準等比例的上限反而會讓波波比試聽時更平。
   */
  cap: { dodo: 460, bobo: 460, momo: 460 } as Record<Speaker, number>,
  /** 修剪頭尾靜音：保留開頭、結尾多少毫秒（段與段之間的停頓才會是上面設定的長度） */
  trim: { lead: 30, tail: 60 },
} as const
