// 從 Fluent Emoji Flat（MIT）只取出 App 用到的圖示，產生 src/art/emoji.generated.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { LETTERS, PHONICS_WORDS } from '../src/content/letters'
import { ALL_VOCAB } from '../src/content/vocab'
import { COUNT_ICONS, SIZE_ICONS, FRIENDS, SHEET_ICONS } from '../src/content/park'
import { CODE_ICONS } from '../src/content/code'
import { ACHIEVE_ICONS } from '../src/content/stickers'
import { THEME_ICONS } from '../src/content/themes'
import { STORY_ICONS } from '../src/content/story'
import { ENGLISH_ICONS } from '../src/lessons/english/data'
import ZH_TEXTS from '../src/lessons/chinese/texts.json'

const UI = ['egg', 'hatching-chick', 'sparkles', 'star', 'glowing-star', 'house-with-garden', 'deciduous-tree', 'evergreen-tree', 'rainbow', 'artist-palette', 'pencil', 'construction', 'tulip', 'cloud', 'teddy-bear', 'balloon', 'crayon', 'framed-picture', 'trophy']
const set = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/fluent-emoji-flat/icons.json'), 'utf8'))
// 延後的詞（ALL_VOCAB 裡的 goat、dragon…）也打包：之前得到的貼紙、舊紀錄還畫得出來
const names = [...new Set([...LETTERS.map((l) => l.icon), ...PHONICS_WORDS.map((w) => w.icon), ...ALL_VOCAB.map((v) => v.icon), ...COUNT_ICONS, ...SIZE_ICONS, ...FRIENDS, ...SHEET_ICONS, ...CODE_ICONS, ...ACHIEVE_ICONS, ...THEME_ICONS, ...STORY_ICONS, ...ENGLISH_ICONS, ...UI])].sort()

const out: Record<string, { b: string; w: number; h: number }> = {}
const missing: string[] = []
for (const n of names) {
  const real = set.icons[n] ? n : set.aliases?.[n]?.parent
  const icon = real && set.icons[real]
  if (!icon) { missing.push(n); continue }
  out[n] = { b: icon.body, w: icon.width ?? set.width ?? 32, h: icon.height ?? set.height ?? 32 }
}
if (missing.length) throw new Error('Missing icons: ' + missing.join(', '))
writeFileSync('src/art/emoji.generated.ts', `// 由 scripts/build-emoji.ts 產生，請勿手動修改。圖示來源：Microsoft Fluent Emoji（MIT）\nexport const EMOJI: Record<string, { b: string; w: number; h: number }> = ${JSON.stringify(out)}\n`)
console.log(`${names.length} icons`)

// 中文課文的圖（src/lessons/chinese/texts.json，180 篇的字詞）：只有中文課用，另外放一個檔，跟著中文課分開載入，不加大首頁要下載的量。
// 已經在上面那一套裡的不重複放；課文裡沒有圖的字詞（null，要另外畫）跳過
const zh = [...new Set(ZH_TEXTS.flatMap((t) => Object.values(t.emoji as Record<string, string | null>)))].filter((n): n is string => !!n && !out[n]).sort()
const zhOut: Record<string, { b: string; w: number; h: number }> = {}
for (const n of zh) {
  const real = set.icons[n] ? n : set.aliases?.[n]?.parent
  const icon = real && set.icons[real]
  if (!icon) { missing.push(n); continue }
  zhOut[n] = { b: icon.body, w: icon.width ?? set.width ?? 32, h: icon.height ?? set.height ?? 32 }
}
if (missing.length) throw new Error('Missing icons（中文課文）: ' + missing.join(', '))
writeFileSync('src/lessons/chinese/pics.generated.ts', `// 由 scripts/build-emoji.ts 產生，請勿手動修改。圖示來源：Microsoft Fluent Emoji（MIT）。中文課文用、主程式那一套（src/art/emoji.generated.ts）沒有的圖
export const ZH_PICS: Record<string, { b: string; w: number; h: number }> = ${JSON.stringify(zhOut)}
`)
console.log(`${zh.length} icons（中文課文）`)
