// 把所有台詞拆成要產生的音檔清單（感嘆詞、鋪陳段、加重的目標字各自一段），交給 gen_audio.py。
// 台詞全部是英文（2026-11-03 拿掉了全部中文語音：中文三明治、中文課文的朗讀）。
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
const { CUE, cueOf, cueParts } = await import('../src/content/phonics-cue')

const rows = new Map<string, object>()
for (const [key, l] of allLines())
  for (const s of segments(l)) {
    const file = clipName(l, s)
    // 字母音台詞（S, S, S… s, s, s… snake!）：gen_audio.py 分段合成再接起來（phonics-cue.ts）
    const c = cueOf(s.text)
    const cue = c && { parts: cueParts(c), hold: CUE.holdMs, gap: CUE.gapMs, repeatGap: CUE.repeatGapMs }
    if (!rows.has(file)) rows.set(file, { key, file, text: s.text, speaker: l.speaker, role: s.role, ...segmentVoice(l, s), fx: segmentFx(l), ...(cue ? { cue } : {}) })
  }
// --check（npm run verify 用）：不寫任何檔，把清單印到 stdout 交給 gen_audio.py --check --lines -，訊息改印到 stderr
if (process.argv.includes('--check')) {
  process.stdout.write(JSON.stringify([...rows.values()]))
  console.error(`${allLines().length} lines, ${rows.size} clips`)
  process.exit(0)
}
mkdirSync('scripts/.cache', { recursive: true })
writeFileSync('scripts/.cache/lines.json', JSON.stringify([...rows.values()], null, 1))
console.log(`${allLines().length} lines, ${rows.size} clips`)

// 審稿佇列（content/story/weekly/，G-9）的故事台詞：跟著上面一起產生（lines-themes.ts 照 allChapters 登記，含佇列裡還沒通過的章節，
// 家長審稿時才聽得到）。這裡另外列出它們的 key 前綴，scripts/story-weekly.ts 用 gen_audio.py --only 只做這幾章
const { WEEKLY, draftChapters, draftId } = await import('../src/content/story')
const queued = WEEKLY.flatMap((d) => draftChapters(d).map((c) => `story.${c.id}.`))
const queuedClips = [...rows.values()].filter((r) => queued.some((p) => (r as { key: string }).key.startsWith(p))).length
writeFileSync('scripts/.cache/lines.queue.json', JSON.stringify({ drafts: WEEKLY.map(draftId), prefixes: queued }, null, 1))
if (WEEKLY.length) console.log(`審稿佇列：${WEEKLY.length} 份劇本、${queued.length} 章、${queuedClips} 個音檔`)
