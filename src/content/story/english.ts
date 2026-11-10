// 故事時間的英文版課文（T-129，家長選 A）：中文課那 180 篇的英文版，一篇 4 句、一句一頁。
// 這裡只放資料和台詞 key（跟著台詞表一起載入，所以不 import 中文課文 texts.json）；畫面和進度在 screens/story/EnBook.tsx、en-book.ts。
// english.json 每一篇：
// - en：4 句英文（3 歲聽得懂的短句，一句最多 6 個字）。第 i 句對中文課文第 i 行，那一頁放第 i 行的圖。
// - words：每個紅字詞的英文（兔子 → rabbit）。
// - sw：第 i 句念完要念三明治的紅字詞（Rabbit. → 兔子 → Rabbit.）：第 i 行的紅字、英文出現在第 i 句、這一篇第一次出現。null 是不念。
//   一個字的紅字（樹、貓）不念：中文音檔（BreezyVoice）至少要兩個字。
// - q：念完 4 句的故事題（Who runs fast?）和答案的紅字詞：照中文課「聊一聊」的問題（talk.json）寫的英文；答案的紅字沒有圖就是 null。
// - which：認角色那一題（Which one is the | rabbit?）和找一樣的英文字要找的紅字詞：畫在頁上、有英文的紅字，
//   先挑家長定的選圖題答案（中文課的 quiz.answer），跟故事題的答案一樣的話換這一篇畫出來的別的紅字；null 是不問。
// sw、q、which 是照中文課文算好的（scripts/test-story-en.ts 會照 texts.json 重算比對），台詞表才不用載入 180 篇中文課文。
import EN from './english.json'

export interface EnText {
  day: number
  en: string[]
  words: Record<string, string>
  sw: (string | null)[]
  q: { en: string; ans: string } | null
  which: string | null
}

export const EN_TEXTS = EN as unknown as EnText[]
/** 一篇幾句（一句一頁） */
export const EN_PAGES = 4

const byDay = new Map(EN_TEXTS.map((t) => [t.day, t]))
export const enText = (day: number): EnText | undefined => byDay.get(day)

/** 紅字詞的英文（同一個中文在每一篇都一樣，scripts/test-story-en.ts 檢查） */
const enOfZh = new Map<string, string>()
for (const t of EN_TEXTS) for (const [zh, en] of Object.entries(t.words)) if (!enOfZh.has(zh)) enOfZh.set(zh, en)
export const enWordOf = (zh: string) => enOfZh.get(zh) ?? ''

/** 紅字詞的 id（台詞 key 用）：英文轉成小寫加連字號；不同中文剛好同一個英文的（小狗、狗），後面的加中文的編號 */
const ids = new Map<string, string>()
{
  const used = new Map<string, string>()
  for (const [zh, en] of enOfZh) {
    const base = en.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'word'
    let id = base
    for (let k = 2; used.has(id) && used.get(id) !== zh; k++) id = `${base}-${k}`
    used.set(id, zh)
    ids.set(zh, id)
  }
}
export const enWordId = (zh: string) => ids.get(zh) ?? ''

/** 台詞 key：全部以 storyen. 開頭（產生語音：python scripts/gen_audio.py --only storyen. zh.momo.storyen.） */
export const EN_AUDIO_PREFIXES = ['storyen.', 'zh.momo.storyen.']
/** 第 day 篇第 i 句 */
export const enLineKey = (day: number, i: number) => `storyen.${day}.${i}`
/** 三明治前面那一次英文（Rabbit.） */
export const enWordKey = (zh: string) => `storyen.word.${enWordId(zh)}`
/** 三明治的中文那一段：content/zh-words.ts 的 ZH_WORDS key（台詞 key 是 bridgeKey(這個, 'momo')） */
export const enNounKey = (zh: string) => `storyen.${enWordId(zh)}`
/** 念完 4 句的故事題（Who runs fast?） */
export const enQKey = (day: number) => `storyen.q.${day}`
/** 認角色（Which one is the | rabbit?） */
export const enWhichKey = (zh: string) => `storyen.which.${enWordId(zh)}`
/** 找一樣的英文字的題目 */
export const EN_SAME_KEY = 'storyen.same'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
/** 三明治前後那一次英文：Rabbit. */
export const enNounEn = (zh: string) => `${cap(enWordOf(zh))}.`
/** 念三明治的紅字詞（每一篇的 sw，不重複） */
export const enSandwichWords = () => [...new Set(EN_TEXTS.flatMap((t) => t.sw.filter((x): x is string => !!x)))]
/** 要念出單字（Rabbit.）的紅字詞：三明治、找一樣的英文字（找對了念一次） */
export const enSpokenWords = () => [...new Set([...enSandwichWords(), ...EN_TEXTS.flatMap((t) => (t.which ? [t.which] : []))])]
