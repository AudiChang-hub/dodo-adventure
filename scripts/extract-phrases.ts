// 把所有台詞拆成要產生的音檔清單（感嘆詞、鋪陳段、加重的目標字各自一段），交給 gen_audio.py
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const row of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = row.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) process.env[m[1]] = m[2]
  }
}

const { allLines, segments, line } = await import('../src/content/lines')
const { clipName, segmentVoice, segmentFx, segmentGap, BRIDGE_GAP_MS } = await import('../src/lib/clip')
const { ZH_WORDS, zhClip, bridgeKey } = await import('../src/content/zh-words')
const { lexWord } = await import('../src/content/lexicon')
const { CUE, cueOf, cueParts } = await import('../src/content/phonics-cue')

const rows = new Map<string, object>()
for (const [key, l] of allLines())
  for (const s of segments(l)) {
    // 中文三明治的中文由 gen_zh_words.py（BreezyVoice）產生，不交給 gen_audio.py
    if (s.role === 'zh') continue
    const file = clipName(l, s)
    // 字母音台詞（S, S, S… sss… snake!）：gen_audio.py 分段合成再接起來（phonics-cue.ts）
    const c = cueOf(s.text)
    const cue = c && { parts: cueParts(c), hold: CUE.holdMs, gap: CUE.gapMs, repeatGap: CUE.repeatGapMs }
    if (!rows.has(file)) rows.set(file, { key, file, text: s.text, speaker: l.speaker, role: s.role, ...segmentVoice(l, s), fx: segmentFx(l), ...(cue ? { cue } : {}) })
  }
mkdirSync('scripts/.cache', { recursive: true })
writeFileSync('scripts/.cache/lines.json', JSON.stringify([...rows.values()], null, 1))
console.log(`${allLines().length} lines, ${rows.size} clips`)

// ── 中文三明治的中文（scripts/gen_zh_words.py）──────────────────
// 同一個中文只產生一次（飛機：airplane、plane）；第 1 層的字先做，再來顏色、形狀，最後第 2 層
const rank = (key: string) => (key.includes('.') ? 1 : (lexWord(key)?.tier ?? 2) === 1 ? 0 : 2)
const zh = new Map<string, { file: string; zh: string; keys: string[]; rank: number }>()
for (const w of ZH_WORDS) {
  const r = zh.get(w.zh) ?? { file: zhClip(w.zh), zh: w.zh, keys: [], rank: 9 }
  r.keys.push(w.key)
  r.rank = Math.min(r.rank, rank(w.key))
  zh.set(w.zh, r)
}
const zhRows = [...zh.values()].sort((a, b) => a.rank - b.rank)
// 單一個字 BreezyVoice 唸得不穩（「狗」4 個版本有 1 個整段沒聲音），一律補成兩個字（小狗、皮球）；數字要寫國字；只放一個叫法（「蟲／蚯蚓」會連斜線一起唸）
const bad = zhRows.filter((r) => [...r.zh].length < 2 || /[0-9０-９/／、,，]/.test(r.zh))
if (bad.length) throw new Error(`中文三明治的中文要至少兩個字、數字寫國字、只放一個叫法（lexicon-info.ts、park.ts）：${bad.map((r) => r.zh).join('、')}`)

// 給家長試聽的完整三明治：教學卡實際的順序（第一句英文 → 停 0.4 秒 → 中文 → 停 0.4 秒 → 英文）
const SAMPLES: [string, string, string][] = [
  ['蘋果', 'teach.vocab.apple', bridgeKey('apple', 'momo')],
  ['章魚', 'teach.vocab.octopus', bridgeKey('octopus', 'momo')],
  ['消防車', 'teach.vocab.firetruck', bridgeKey('fire-truck', 'momo')],
  ['紅色', 'teach.color.red', bridgeKey('color.red', 'bobo')],
  ['圓形', 'teach.shape.circle', bridgeKey('shape.circle', 'bobo')],
  ['月亮', 'ph.word.moon', bridgeKey('moon', 'dodo')],
  ['小狗', 'teach.vocab.dog', bridgeKey('dog', 'momo')],
  ['恐龍', 'teach.vocab.sauropod', bridgeKey('dinosaur', 'momo')],
]
const samples = SAMPLES.map(([name, en, br]) => {
  const parts: { file: string; gap: number; text: string; zh?: boolean }[] = []
  for (const k of [en, br]) {
    const l = line(k)
    segments(l).forEach((s, i) => parts.push({ file: clipName(l, s), text: s.text, gap: i ? segmentGap(l, i) : parts.length ? BRIDGE_GAP_MS : 0, ...(s.role === 'zh' ? { zh: true } : {}) }))
  }
  return { name, keys: [en, br], parts }
})
writeFileSync('scripts/.cache/zh-words.json', JSON.stringify({ words: zhRows, samples }, null, 1))
console.log(`${zhRows.length} zh words (${ZH_WORDS.length} keys)`)
