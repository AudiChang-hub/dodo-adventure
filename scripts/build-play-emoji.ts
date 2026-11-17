// 從 Fluent Emoji Flat（MIT）只取出「躲在哪裡」「心情臉」（T-160）用到、主程式那一套（src/art/emoji.generated.ts）沒有的圖示，
// 產生 src/games/play-emoji.generated.ts。分開一個檔：不動共用的 emoji.generated.ts（別的分支同時在加圖，合併不會衝突）。
// 執行：npx tsx scripts/build-play-emoji.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { EMOJI } from '../src/art/emoji.generated'
import { WHERE_EMOJI } from '../src/games/where/data'
import { FEEL_EMOJI } from '../src/games/feel/data'

const set = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/fluent-emoji-flat/icons.json'), 'utf8'))
const names = [...new Set([...WHERE_EMOJI, ...FEEL_EMOJI])].filter((n) => !EMOJI[n]).sort()
const out: Record<string, { b: string; w: number; h: number }> = {}
const missing: string[] = []
for (const n of names) {
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
  'src/games/play-emoji.generated.ts',
  `// 由 scripts/build-play-emoji.ts 產生，請勿手動修改。圖示來源：Microsoft Fluent Emoji（MIT）。躲在哪裡、心情臉用、主程式那一套沒有的圖
export const PLAY_EMOJI: Record<string, { b: string; w: number; h: number }> = ${JSON.stringify(out)}
`,
)
console.log(`${names.length} icons`)
