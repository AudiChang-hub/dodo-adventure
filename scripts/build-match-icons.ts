// 翻翻牌、影子配對（T-160）的圖示：從 Fluent Emoji Flat（MIT）只取出 src/games/match/catalog.ts 用到的，產生 src/games/match/icons.generated.ts。
// 執行：npx tsx scripts/build-match-icons.ts（改了 catalog.ts 的圖才要跑）
// 跟主程式那一套（src/art/emoji.generated.ts）分開：只有這兩個遊戲用，遊戲打開時才載入，不加大首頁要下載的量。
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { MATCH_PICS } from '../src/games/match/catalog'

const set = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/fluent-emoji-flat/icons.json'), 'utf8'))
const out: Record<string, { b: string; w: number; h: number }> = {}
const missing: string[] = []
for (const n of [...new Set(MATCH_PICS.map((p) => p.id))].sort()) {
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
  'src/games/match/icons.generated.ts',
  `// 由 scripts/build-match-icons.ts 產生，請勿手動修改。圖示來源：Microsoft Fluent Emoji Flat（MIT）。翻翻牌、影子配對用\nexport const MATCH_ICONS: Record<string, { b: string; w: number; h: number }> = ${JSON.stringify(out)}\n`,
)
console.log(`${Object.keys(out).length} icons`)
