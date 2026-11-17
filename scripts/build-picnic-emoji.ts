// 小熊野餐（T-160）多用到的食物圖示：主程式那一套（src/art/emoji.generated.ts）沒有的，另外產生 src/games/picnic/food.generated.ts。
// 跟中文課文的 pics.generated.ts 一樣分開放：只有野餐用，不加大首頁要下載的量，也不跟別的分支改同一個大檔。
// 執行：npx tsx scripts/build-picnic-emoji.ts（圖示來源：Microsoft Fluent Emoji Flat，MIT）
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { EMOJI } from '../src/art/emoji.generated'
import { FOODS } from '../src/games/picnic/foods'

const set = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/fluent-emoji-flat/icons.json'), 'utf8'))
const out: Record<string, { b: string; w: number; h: number }> = {}
const missing: string[] = []
for (const n of [...new Set(FOODS.map((f) => f.icon))].filter((n) => !EMOJI[n]).sort()) {
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
  'src/games/picnic/food.generated.ts',
  `// 由 scripts/build-picnic-emoji.ts 產生，請勿手動修改。圖示來源：Microsoft Fluent Emoji（MIT）。小熊野餐用、主程式那一套沒有的食物
export const PICNIC_FOOD_ART: Record<string, { b: string; w: number; h: number }> = ${JSON.stringify(out)}
`,
)
console.log(`${Object.keys(out).length} icons（野餐的食物）`)
