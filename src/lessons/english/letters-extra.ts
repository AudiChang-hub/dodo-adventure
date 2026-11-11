// 字母森林沒教的 5 個字母（i、u、q、x、z，理由見 content/letters.ts 的【教學順序】第 5 點）：學校照 A→Z 教，英文課要用，在這裡補。
// 寫法和 content/letters.ts 的 PHONICS 一樣；念法的組合方式（gen_audio.py）見 content/phonics-cue.ts。
// 字母音做得出來才念，做不出來的寫 none（跟 v 一樣只念字母名稱和單字）：
// - i、u：短母音，跟 a、e 一樣從代表字的開頭剪 0.15 秒、念兩次（iguana 的 /ɪ/、umbrella 的 /ʌ/）。
// - z：zuh 跟 buh、nuh 一樣是 edge-tts 念得出來的停頓音寫法，念三次。
// - q（/kw/）、x（/ks/，只出現在字尾）：TTS 單獨念會拼成字母，學校也是先教名稱，先不念字母音。
import { ALL_PHONICS as BASE, type PhonicsWord, type SoundUnit } from '../../content/letters'
// 寫寫看二選一的台詞（T-127）：英文課 lines.ts 另一個工作階段在改，從這裡接上 import 鏈（content/lines.ts → 英文課 lines.ts → 這裡）
import './lines-write'

export type { PhonicsWord, SoundUnit }

const W = (w: string, icon: string): PhonicsWord => ({ w, icon })

export const EXTRA_PHONICS: SoundUnit[] = [
  { letter: 'i', phoneme: 'ɪ', ipa: '/ɪ/', sound: { kind: 'cut', ms: 150, times: 2 }, keys: [W('iguana', 'lizard'), W('insect', 'lady-beetle'), W('ice cream', 'soft-ice-cream')], review: [] },
  { letter: 'u', phoneme: 'ʌ', ipa: '/ʌ/', sound: { kind: 'cut', ms: 150, times: 2 }, keys: [W('umbrella', 'umbrella'), W('up', 'up-arrow'), W('unicorn', 'unicorn')], review: [] },
  { letter: 'q', phoneme: 'kw', ipa: '/kw/', sound: { kind: 'none' }, keys: [W('queen', 'crown'), W('question', 'red-question-mark'), W('quiet', 'shushing-face')], review: [] },
  { letter: 'x', phoneme: 'ks', ipa: '/ks/', sound: { kind: 'none' }, keys: [W('x-ray', 'x-ray'), W('fox', 'fox'), W('box', 'package')], review: [] },
  { letter: 'z', phoneme: 'z', ipa: '/z/', sound: { kind: 'say', say: 'zuh', times: 3 }, keys: [W('zebra', 'zebra'), W('zero', 'keycap-0'), W('zipper', 'zipper-mouth-face')], review: [] },
]

/** 26 個字母都找得到念法：字母森林的（含延後的 o、j、v、y）＋上面補的 */
export const ALL_PHONICS: SoundUnit[] = [...BASE, ...EXTRA_PHONICS]
