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

/** 答案補上後保留多久（毫秒），之後才換成正在唸的句子 */
export const REVEAL_HOLD_MS = 1500

/** 一般句子唸完後停留多久才淡出（毫秒）；問題句會一直留著等孩子作答 */
export const LINGER_MS = 1600
