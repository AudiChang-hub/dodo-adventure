// 檢查故事資料（G-8）：
// 1. 12 個主題轉成通用章節之後，冒險實際會念的台詞和轉換前一模一樣：key、說話的人、字幕文字、音檔檔名、每一站的圖。
//    轉換前的樣子存在 scripts/fixtures/theme-lines.base.json（轉換前在 main 上用 Adventure.tsx 的 key 匯出）。
// 2. 每一章故事：台詞都登記了、圖示都打包了、每句不超過年段的字數上限、每一段不超過 3 句（FRAME-11）、
//    依主線的版本排到哪條線就用哪一版、站比段落少時沒講到的段落在終點補講。
// 執行：npx tsx scripts/check-story-themes.ts
import { readFileSync } from 'node:fs'
import { THEMES } from '../src/content/themes'
import { line, segments, hasLine } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { EMOJI } from '../src/art/emoji.generated'
import { FRAMES } from '../src/content/growth'
import { ARCS, CLASSICS, STORY_ICONS, allChapters, evergreenOf, scriptOf, stopPic, type Said, type Script } from '../src/content/story'
import { STORY_ART } from '../src/content/story/art'

const problems: string[] = []
const need = (ok: unknown, msg: string) => ok || problems.push(msg)

// ── 1. 通用章節＝轉換前的主題 ─────────────────────────────────
interface Row {
  slot: string
  key: string
  speaker: string
  text: string
  pic: string | null
  clips: string[]
}
const base: Record<string, Row[]> = JSON.parse(readFileSync('scripts/fixtures/theme-lines.base.json', 'utf8'))
const row = (slot: string, s: Said, pic: string | null): Row => {
  const l = line(s.key)
  return { slot, key: s.key, speaker: l.speaker, text: l.text, pic, clips: segments(l).map((x) => clipName(l, x)) }
}
const TRACK_SETS = [
  ['lang', 'num', 'think', 'hand', 'lang'],
  ['hand', 'hand', 'num', 'think', 'num'],
  [undefined, undefined, undefined, undefined, undefined],
] as const
let same = 0
for (const t of THEMES) {
  for (const tracks of TRACK_SETS) {
    const s = scriptOf(evergreenOf(t.id), { tracks: [...tracks] })!
    // 主題的開場在路線圖上：標題、開場；每站一句；終點念結尾。魔法屋那兩段（intro 在屋裡、end）是空的
    const got: Row[] = [
      ...s.title.map((x) => row('title', x, null)),
      ...s.intro.map((x) => row('intro', x, null)),
      ...s.stops.flatMap((xs, i) => xs.map((x) => row(`stop.${i}`, x, stopPic(s, i)))),
      ...s.finale.map((x) => row('end', x, null)),
    ]
    need(s.end.length === 0, `${t.id}: 通用章節不該有魔法屋的結尾`)
    const a = JSON.stringify(base[t.id])
    const b = JSON.stringify(got)
    if (a === b) same++
    else problems.push(`${t.id}（主線 ${tracks.join(',')}）：轉換後和轉換前不一樣\n    前 ${a}\n    後 ${b}`)
  }
}
const clipCount = Object.values(base).flat().reduce((n, r) => n + r.clips.length, 0)
console.log(`通用章節：${THEMES.length} 個主題 × ${TRACK_SETS.length} 種排課，${same} 組和轉換前完全相同（每個主題 ${base.bus.length} 句、共 ${clipCount} 個音檔）`)

// ── 2. 故事的章節 ─────────────────────────────────────────────
const words = (k: string) =>
  line(k)
    .text.replace(/\|\|?/g, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w)).length
const picOk = (p: string) => p.split('+').every((x) => (x.startsWith('@') ? x in STORY_ART : !!EMOJI[x]))
for (const ic of STORY_ICONS) need(EMOJI[ic], `圖示 ${ic} 沒有打包（npm run emoji）`)

const stories = allChapters().filter((c) => c.kind !== 'evergreen')
for (const ch of stories) {
  const max = FRAMES[ch.band].maxWords
  const check = (where: string, xs: Said[]) => {
    need(xs.length <= 3, `${ch.id} ${where}：一段 ${xs.length} 句，超過 3 句（FRAME-11）`)
    for (const x of xs) {
      need(hasLine(x.key), `${ch.id} ${where}：沒有台詞 ${x.key}`)
      if (hasLine(x.key) && !x.key.startsWith('theme.')) need(words(x.key) <= max, `${ch.id} ${where}：「${line(x.key).text}」${words(x.key)} 個字，超過 ${max}`)
      if (x.pic) need(picOk(x.pic), `${ch.id} ${where}：圖 ${x.pic} 不存在`)
      need(!/[一-鿿]/.test(hasLine(x.key) ? line(x.key).text : ''), `${ch.id} ${where}：故事裡不出現中文`)
    }
  }
  for (const tracks of TRACK_SETS) {
    const s: Script = scriptOf(ch, { tracks: [...tracks], door: 'park' as never })!
    need(s, `${ch.id}：展不開`)
    if (!s) continue
    check('開場', s.intro)
    s.stops.forEach((xs, i) => check(`第 ${i + 1} 站`, xs))
    check('結尾', s.end)
  }
}

// 依主線：第 1 章第 2 站排到數數就念「Count for the egg!」，對不上（沒有主線）就念故事本來那一句
const c1 = ARCS[0].chapters[0]
const pickAt = (tracks: (string | undefined)[]) => scriptOf(c1, { tracks: tracks as never })!.stops[1].map((x) => line(x.key).text).join(' ')
need(pickAt(['lang', 'num', 'lang', 'lang']).startsWith('Count for the egg'), `依主線：數與規律的站應該念 Count for the egg（實際 ${pickAt(['lang', 'num', 'lang', 'lang'])}）`)
need(pickAt(['lang', undefined, 'lang', 'lang']).includes('rides the'), '依主線：對不上主線時應該念通用版')
// 站比段落少：龜兔賽跑 5 段、只排 3 站，第 4、5 段在終點講完
const rt = scriptOf(CLASSICS[0].chapter, { tracks: ['lang', 'num', 'hand'], door: 'park' as never })!
need(rt.stops.length === 3 && rt.finale.length === 3, `站比段落少：終點應補講 3 句（實際 ${rt.finale.length}）`)
// 朋友：有朋友念朋友自己的台詞，沒有就念通用句
const fr = { ...c1, intro: [{ who: 'friend' as const, en: 'A friend comes, too!' }] }
need(scriptOf(fr, { tracks: [], friend: 'fox' })!.intro[0].key === 'friend.name.fox', '朋友：有朋友時應念 friend.name.<id>')
need(scriptOf(fr, { tracks: [], friend: null })!.intro[0].key.startsWith('story.'), '朋友：沒有朋友時應念通用句')

console.log(`故事：${ARCS.length} 篇長篇（${ARCS.reduce((n, a) => n + a.chapters.length, 0)} 章）、${CLASSICS.length} 章故事時間`)
if (problems.length) {
  console.log(`\n✗ ${problems.length} 個問題`)
  for (const p of problems) console.log('  ✗ ' + p)
  process.exit(1)
}
console.log('✓ 全部通過')
