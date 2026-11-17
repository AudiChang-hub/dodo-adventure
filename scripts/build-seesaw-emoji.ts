// 蹺蹺板比輕重（家長 2026-11-17）用到的圖示：主程式那一套（src/art/emoji.generated.ts）沒有的，另外產生 src/games/seesaw/emoji.generated.ts。
// 跟小熊野餐的 food.generated.ts 一樣分開放：只有蹺蹺板用，不動共用的大檔，也不跟別的分支改同一個檔。
// 執行：npx tsx scripts/build-seesaw-emoji.ts（圖示來源：Microsoft Fluent Emoji Flat，MIT）
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { EMOJI } from '../src/art/emoji.generated'
import { SEESAW_ICONS } from '../src/games/seesaw/data'

const set = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/fluent-emoji-flat/icons.json'), 'utf8'))
const out: Record<string, { b: string; w: number; h: number }> = {}
const missing: string[] = []
for (const n of [...new Set(SEESAW_ICONS)].filter((n) => !EMOJI[n]).sort()) {
  const real = set.icons[n] ? n : set.aliases?.[n]?.parent
  const icon = real && set.icons[real]
  if (!icon) {
    missing.push(n)
    continue
  }
  out[n] = { b: icon.body, w: icon.width ?? set.width ?? 32, h: icon.height ?? set.height ?? 32 }
}
if (missing.length) throw new Error('Missing icons: ' + missing.join(', '))
writeFileSync(
  'src/games/seesaw/emoji.generated.ts',
  `// 由 scripts/build-seesaw-emoji.ts 產生，請勿手動修改。圖示來源：Microsoft Fluent Emoji（MIT）。蹺蹺板用、主程式那一套沒有的圖
export const SEESAW_EMOJI: Record<string, { b: string; w: number; h: number }> = ${JSON.stringify(out)}
`,
)
console.log(`${Object.keys(out).length} icons（蹺蹺板）`)
