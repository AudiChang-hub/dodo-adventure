// 單字的中文三明治（2026-10-29）：教學卡第一次教一個字時唸「Apple — 蘋果 — Apple」，其他語音維持全英文。
// 這裡只放資料：每個字要唸的中文、音檔檔名、三明治台詞的 key。什麼時候唸在 lib/words.ts 的 bridgeLines。
//
// 範圍：教學卡上教的單字（lexicon.ts 的全部單字：動物村、字母森林的關鍵字和複習字、學習單）、顏色、形狀。
// 數字、字母不加；說明句、讚美、故事、情緒詞一律不加中文。
//
// 中文聲音：BreezyVoice（台灣華語 TTS，Apache-2.0），在電腦上預先產生（scripts/gen_zh_words.py），
// 音檔在 public/audio/zh/<檔名>.mp3，產生好的詞列在 public/audio/zh/index.json；還沒產生的詞自動只唸英文。
import { fnv1a } from '../lib/hash'
import { LEXICON } from './lexicon'
import { COLORS, SHAPES } from './park'
import type { Speaker } from './registry'

export interface ZhWord {
  /** 單字 key（lexicon 的 key）；顏色是 color.red、形狀是 shape.circle */
  key: string
  /** 要唸的中文（數字要寫國字：BreezyVoice 在 Windows 上沒有數字轉中文） */
  zh: string
  /** 三明治後面那一次英文（Apple.） */
  en: string
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export const colorKey = (id: string) => `color.${id}`
export const shapeKey = (id: string) => `shape.${id}`

export const ZH_WORDS: ZhWord[] = [
  ...LEXICON.filter((w) => w.zh).map((w) => ({ key: w.key, zh: w.zh.replace(/\s+/g, ''), en: `${cap(w.en)}.` })),
  // park.ts 的顏色中文是「紅」「粉紅」：單獨唸的時候說「紅色」「粉紅色」
  ...COLORS.map((c) => ({ key: colorKey(c.id), zh: `${c.zh}色`, en: `${cap(c.en)}.` })),
  ...SHAPES.map((s) => ({ key: shapeKey(s.id), zh: s.zh, en: `${cap(s.en)}.` })),
]

const byKey = new Map(ZH_WORDS.map((w) => [w.key, w]))
export const zhWord = (key: string): ZhWord | undefined => byKey.get(key)

/**
 * 中文音檔的檔名（不含 .mp3，相對於 public/audio）：由「聲音＋中文」決定，同一個中文（飛機：airplane、plane）共用一個檔。
 * 換參考語音或產生方式時改 ZH_VOICE，全部會重新產生。
 */
export const ZH_VOICE = 'breezy|example9s|v1'
export const zhClip = (zh: string) => `zh/${fnv1a(`${ZH_VOICE}|${zh}`)}`

/** 三明治台詞的 key：同一個字由不同恐龍教（動物村莫莫、字母森林豆豆、學習單波波）時，後面那一次英文用那隻恐龍的聲音 */
export const bridgeKey = (key: string, speaker: Speaker) => `zh.${speaker}.${key}`
