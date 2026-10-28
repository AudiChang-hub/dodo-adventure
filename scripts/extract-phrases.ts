// 把所有台詞拆成要產生的音檔清單（感嘆詞、鋪陳段、加重的目標字各自一段），交給 gen_audio.py
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const row of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = row.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2]
  }
}

const { allLines, segments } = await import('../src/content/lines')
const { clipName, segmentVoice, segmentFx } = await import('../src/lib/clip')

const rows = new Map<string, object>()
for (const [key, l] of allLines())
  for (const s of segments(l)) {
    const file = clipName(l, s)
    if (!rows.has(file)) rows.set(file, { key, file, text: s.text, speaker: l.speaker, role: s.role, ...segmentVoice(l, s), fx: segmentFx(l) })
  }
mkdirSync('scripts/.cache', { recursive: true })
writeFileSync('scripts/.cache/lines.json', JSON.stringify([...rows.values()], null, 1))
console.log(`${allLines().length} lines, ${rows.size} clips`)
