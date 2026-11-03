// 全站的「單字」：孩子在動物村、字母森林、彩虹公園的學習單上會看到、會被考到的圖卡字（2026-10-28 單字盤點）。
// 每個字一個 key（英文名字的 wordId：fire truck → fire-truck），一張圖只用一個名字：
// 動物村的 VOCAB、字母森林的 PHONICS、學習單的圖示名稱都對到同一個 key，「教過沒」「家長勾了不認得」才能全站共用（lib/words.ts）。
//
// 這個檔案只放資料（沒有執行期相依）。顏色、形狀、數字是「概念」，用技能代碼記錄（color:red…），不在這張表裡。
//
// 單字的中文三明治（教學卡教一個字時唸「Apple — 蘋果 — Apple」）：zh 就是要唸的中文（content/zh-words.ts、lib/words.ts 的 bridgeLines）。
import { VOCAB } from './vocab'
import { PHONICS, wordId } from './letters'
import { CATEGORIES, SHEET_NAMES, PLURAL_NAMES } from './worksheet-data'
import { WORD_INFO } from './lexicon-info'

export type Tier = 1 | 2 | 3

export interface Word {
  key: string
  en: string
  zh: string
  icon: string
  tier: Tier
  /** 出現在哪裡（家長區顯示） */
  where: string[]
}

export const wordKey = (en: string) => wordId(en)

const words = new Map<string, Word>()
const byIcon = new Map<string, string>()

function add(en: string, icon: string, where: string, zh?: string) {
  const key = wordKey(en)
  if (!byIcon.has(icon)) byIcon.set(icon, key)
  const w = words.get(key)
  if (w) {
    if (!w.where.includes(where)) w.where.push(where)
    return
  }
  const [z, tier] = WORD_INFO[key] ?? [zh ?? '', 2]
  words.set(key, { key, en, zh: z || zh || '', icon, tier, where: [where] })
}

for (const v of VOCAB) add(v.en, v.icon, '動物村', v.zh)
for (const u of PHONICS) for (const w of [...u.keys, ...u.review]) add(w.w, w.icon, '字母森林')
for (const c of Object.values(CATEGORIES))
  for (const icon of [...c.targets, ...c.easy, ...c.hard]) {
    const v = VOCAB.find((x) => x.icon === icon)
    const n = v?.en ?? SHEET_NAMES[icon]
    if (n) add(n, icon, '彩虹公園', v?.zh)
  }

/** 全部的單字（家長區「單字清單」依層級列出） */
export const LEXICON: Word[] = [...words.values()]

export const lexWord = (key: string): Word | undefined => words.get(key)

/** 圖示 → 單字 key（學習單上的圖）；沒有名字的圖（例如橘子）回傳 null */
export const keyOfIcon = (icon: string): string | null => byIcon.get(icon) ?? null

/** 動物村詞彙的 id（plane、firetruck…）→ 單字 key */
const vocabKey = new Map(VOCAB.map((v) => [v.id, wordKey(v.en)]))
export const keyOfVocab = (id: string): string => vocabKey.get(id) ?? id

const PLURAL = new Set([...PLURAL_NAMES].map(wordKey))
export const isPlural = (key: string) => PLURAL.has(key)

/** 冠詞：an apple、an umbrella */
export const articleOf = (en: string) => (/^[aeiou]/i.test(en) ? 'an' : 'a')

/** 「這是 ___」：全站只用這一種說法（This is a | dog. ／ These are | grapes.），台詞在 lines.ts 的 lex.this.* */
export const thisIs = (key: string) => `lex.this.${key}`

export function thisIsText(w: Pick<Word, 'key' | 'en'>): string {
  return isPlural(w.key) ? `These are | ${w.en}.` : `This is ${articleOf(w.en)} | ${w.en}.`
}

// 教一個字的台詞順序（中文三明治）在 lib/words.ts 的 bridgeLines：要看孩子學會了沒、家長的設定。
