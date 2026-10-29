import { PHONICS, PHONICS_WORDS } from './letters'

// 字幕的挖空規則（PRD §5.9）：只有「答案就在句中」的問題句，`|` 後那段顯示成空格。
// 像「Which side has | more?」被加重的是題目條件、不是答案，所以不在這裡。

/** 以台詞 key 的前綴判斷：Where is | B? / Where is the | bus? / Where is | five? / Where is | red? */
const BLANK_PREFIXES = ['en.where.', 'en.findword.', 'm.findnum.', 'z.where.', 'p.color.', 'p.shape.']

export const isBlankQuestion = (key: string) => BLANK_PREFIXES.some((p) => key.startsWith(p))

/** 不算「作答之後」的句子：發呆提醒、再試一次。說完這些，空格繼續等孩子作答 */
const KEEP_BLANK_PREFIXES = ['idle.', 'retry.']

/** 問題句之後唸的下一句，是否該把空格補上答案（答對、看提示或重教） */
export const revealsAnswer = (questionKey: string, nextKey: string) =>
  nextKey !== questionKey && !KEEP_BLANK_PREFIXES.some((p) => nextKey.startsWith(p))

// ── 自然發音的開頭字母上色（PRD §6.1b）─────────────────────────────
// 跟挖空一樣用 key 前綴判斷，只看 ph. 開頭的台詞（lines-phonics.ts）：
// - 每句有一個「目標字母」：ph.b.* 是 b；ph.word.bus（點名）、ph.same.bus（哪個跟 bus 一樣）是那個字的開頭 b。
// - 句中「以目標字母開頭、而且在自然發音字表裡」的字（bus、ball、buh、單獨的字母 B…），開頭字母標成同一個顏色。
//   拉長音和單字分開寫（Sss… snake!）：Sss… 和 snake 的 S 上同一個顏色。
//   They、starts 不在字表裡，所以 They 的 T 不會被當成 /t/；Teddy bear 的 bear 不是 t 開頭，也不會上色。
// 不會影響挖空：ph. 不在 BLANK_PREFIXES 裡；唯一「答案在句中」的自然發音問題句（聽音找字母）用既有的 en.where. 前綴，照常挖空、不上色；
// 就算之後有句子同時符合兩條規則，挖空優先（tintTarget 回傳 null）。
// 畫面上的做法：src/games/phonics/subtitleTint.ts 依這裡的規則在字幕的字上加 data-tint，用 ::first-letter 上色，
// 不改字幕元件本身。
const TINT_PREFIX = 'ph.'

/** 這句台詞要把哪個字母開頭的字上色；不上色的句子回傳 null */
export function tintTarget(key: string): string | null {
  if (!key.startsWith(TINT_PREFIX) || isBlankQuestion(key)) return null
  const [, a, b] = key.split('.')
  if (a.length === 1) return a
  if (a === 'word' || a === 'same') return b?.[0] ?? null
  return null
}

const tintKey = (word: string) => word.toLowerCase().replace(/[^a-z]/g, '')
const TINT_WORDS = new Set<string>([
  // 多個字的詞（teddy bear、T-rex）：第一個字、整個詞都算
  ...PHONICS_WORDS.flatMap(({ w }) => [tintKey(w.split(/\s+/)[0]), tintKey(w)]),
  ...PHONICS.flatMap((u) => (u.cue.kind === 'word' ? [] : [tintKey(u.cue.say)])),
  ...PHONICS.map((u) => u.letter),
])

/** 字幕上的一個字（可能帶標點，例如「Bus,」「buh!」）要不要把開頭字母上色 */
export function tintWord(target: string, word: string): boolean {
  const k = tintKey(word)
  return k[0] === target && TINT_WORDS.has(k)
}

/** 答案補上後保留多久（毫秒），之後才換成正在唸的句子 */
export const REVEAL_HOLD_MS = 1500

/**
 * 還在等孩子作答時，中間插進來的一句（再試一次、發呆提醒）唸完後停留多久，才換回問題句（毫秒）。
 * 其他句子唸完後一直留在畫面上，直到下一句來取代（2026-10-28 家長回饋：句子還沒看完就消失）。
 */
export const BACK_TO_QUESTION_MS = 1600
