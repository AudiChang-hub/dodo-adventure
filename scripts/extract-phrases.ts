// 把所有台詞列成清單，交給 gen_audio.py 產生音檔
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const row of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = row.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2]
  }
}

const { allLines } = await import('../src/content/lines')
const { VOICES } = await import('../src/content/voices')
const { clipName } = await import('../src/lib/clip')

const rows = allLines().map(([key, l]) => ({ key, file: clipName(l), text: l.text, ...VOICES[l.speaker][l.lang] }))
mkdirSync('scripts/.cache', { recursive: true })
writeFileSync('scripts/.cache/lines.json', JSON.stringify(rows, null, 1))
console.log(`${rows.length} lines`)
