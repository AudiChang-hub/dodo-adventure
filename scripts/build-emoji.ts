// 從 Fluent Emoji Flat（MIT）只取出 App 用到的圖示，產生 src/art/emoji.generated.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { LETTERS, PHONICS_WORDS } from '../src/content/letters'
import { VOCAB } from '../src/content/vocab'
import { COUNT_ICONS, SIZE_ICONS, FRIENDS } from '../src/content/park'

const UI = ['egg', 'hatching-chick', 'sparkles', 'star', 'glowing-star', 'house-with-garden', 'deciduous-tree', 'evergreen-tree', 'rainbow', 'artist-palette', 'pencil', 'construction', 'tulip', 'cloud', 'teddy-bear', 'balloon', 'crayon', 'framed-picture', 'trophy']
const set = JSON.parse(readFileSync('node_modules/@iconify-json/fluent-emoji-flat/icons.json', 'utf8'))
const names = [...new Set([...LETTERS.map((l) => l.icon), ...PHONICS_WORDS.map((w) => w.icon), ...VOCAB.map((v) => v.icon), ...COUNT_ICONS, ...SIZE_ICONS, ...FRIENDS, ...UI])].sort()

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
