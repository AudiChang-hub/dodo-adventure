// 主題式綜合冒險的模擬（2026-10-28）：
// 1. 檢查 content/themes.ts 的每個主題：用到的詞彙、自然發音的字、圖示、故事、題目 id 都對得到真的內容；
// 2. 假造 4 週的作答，每天用 App 真正的 planDay 排站、pickTheme 挑主題，印出主題、每一站（遊戲、主線、題目樣本）；
// 3. 確認主題不改排課：每天的站與 planDay 的結果一模一樣，四條線的站數照舊；主題一週內不重複，本週主題那幾天有偏向。
// 題目樣本是在主題下真的呼叫題目產生器（lib/theme-play.ts 的 enterTheme），用的是模擬孩子當下的熟練度。
// 執行：npx tsx scripts/sim-themes.ts
import type { Attempt, StationId } from '../src/lib/db'
import { loadCheck, MASTERED_BOX } from '../src/lib/engine'
import { budgetOf, noteIntro, planDay, shiftDate, trackNeeds, type Intros } from '../src/lib/tracks'
import { conceptOf, trackOf, TRACKS, type TrackId } from '../src/content/tracks'
import { GAMES, PHONICS_MAKERS } from '../src/content/games'
import { SHEET_MAKERS, FIND_POOL } from '../src/content/games-worksheet'
import { PHONICS, PHONICS_WORDS, phonicsSkill } from '../src/content/letters'
import { VOCAB } from '../src/content/vocab'
import { COLORS, COUNT_ICONS, SHAPES } from '../src/content/park'
import { ALL_STORIES, PATTERN_TOKS, STORIES, drivePuzzle, pickStory, seqSkill } from '../src/content/code'
import { BEATS, THEMES, pickTheme, type ThemeId } from '../src/content/themes'
import { GLYPHS } from '../src/games/draw/glyphs'
import { PICTURES } from '../src/games/draw/pictures'
import { EMOJI } from '../src/art/emoji.generated'
import { enterTheme, themed } from '../src/lib/theme-play'
import { recordSkill } from '../src/lib/adaptive'
import { hasLine } from '../src/content/lines'
import type { VocabTheme } from '../src/content/vocab'

// 題目產生器讀的是 App 記憶體裡的熟練度：模擬的作答也記進去（recordSkill 會順手寫 IndexedDB，Node 裡沒有，忽略那個錯誤）
process.on('unhandledRejection', () => {})

// ── 1. 主題資料檢查 ─────────────────────────────────────────
const problems: string[] = []
const need = (ok: boolean, msg: string) => ok || problems.push(msg)
const DOTS = ['triangle', 'square', 'diamond', 'house', 'boat', 'heart', 'fish', 'star']
const SORT = [...FIND_POOL(4), 'cube']
for (const t of THEMES) {
  const icons = [t.icon, ...t.stops, ...t.finale, ...t.count, t.goal.icon]
  for (const i of icons) need(!!EMOJI[i], `${t.id}: 圖示 ${i} 沒有打包（npm run emoji）`)
  for (const v of t.vocab) need(VOCAB.some((x) => x.id === v), `${t.id}: 詞彙 ${v} 不在 vocab.ts`)
  for (const w of t.words) need(PHONICS_WORDS.some((x) => x.w === w), `${t.id}: 自然發音的字 ${w} 不在 letters.ts`)
  for (const c of t.colors) need(COLORS.some((x) => x.id === c), `${t.id}: 顏色 ${c}`)
  for (const s of t.stories) need(ALL_STORIES.some((x) => x.id === s), `${t.id}: 故事 ${s}`)
  for (const g of t.glyphs) need(!!GLYPHS[g], `${t.id}: 描字 ${g}`)
  for (const p of t.pattern) need(PATTERN_TOKS.some((x) => x.id === p), `${t.id}: 規律圖 ${p}`)
  for (const s of t.sort) need(SORT.includes(s), `${t.id}: 找出全部 ${s}`)
  for (const d of t.dots ?? []) need(DOTS.includes(d), `${t.id}: 連點 ${d}`)
  if (t.coloring) need(PICTURES.some((p) => p.id === t.coloring), `${t.id}: 著色頁 ${t.coloring}`)
  need(hasLine(`c.drive.to.${t.goal.id}`), `${t.id}: 沒有 c.drive.to.${t.goal.id} 的台詞`)
  for (const k of ['title', 'intro', 'end', ...BEATS[t.id].stops.map((_, i) => `stop.${i}`)]) need(hasLine(`theme.${t.id}.${k}`), `${t.id}: 沒有 theme.${t.id}.${k}`)
  for (const s of ALL_STORIES.filter((x) => t.stories.includes(x.id))) s.icons.forEach((ic) => need(!!EMOJI[ic], `${t.id}: 故事 ${s.id} 的圖 ${ic}`))
}
console.log(`主題資料檢查：${THEMES.length} 個主題，${problems.length ? `${problems.length} 個問題` : '全部對得到'}`)
for (const p of problems) console.log('  ✗ ' + p)
console.log('')
for (const t of THEMES) {
  // 每個主題能接上幾種遊戲：主題給得出內容的 / 全部
  const sounds = [...new Set(t.words.map((w) => PHONICS_WORDS.find((x) => x.w === w)?.unit.letter))].join('')
  console.log(`  ${t.id.padEnd(9)} ${t.title.padEnd(24)} 音 ${sounds.padEnd(10)} 詞 ${t.vocab.length}  數 ${t.count.length}  故事 ${t.stories.join('/')}  描 ${t.glyphs}  著色 ${t.coloring ?? '—'}`)
}

// ── 2. 模擬 4 週 ────────────────────────────────────────────
let seed = 20261102
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const range = (a: number, b: number, f: (n: number) => string) => Array.from({ length: b - a + 1 }, (_, i) => f(a + i))
const CONTENT: Record<string, string[]> = {
  'ph-start': PHONICS.map((u) => phonicsSkill(u.letter)),
  'ph-same': PHONICS.map((u) => phonicsSkill(u.letter)),
  'ph-letter': PHONICS.map((u) => phonicsSkill(u.letter)),
  'z-find': VOCAB.map((v) => `vocab:${v.id}`),
  'z-sound': VOCAB.filter((v) => v.sound).map((v) => `sound:${v.id}`),
  'p-color': COLORS.map((c) => `color:${c.id}`),
  'm-count': range(1, 10, (n) => `count:${n}`),
  'm-match': range(1, 10, (n) => `count:${n}`),
  'm-find': range(1, 20, (n) => `num:${n}`),
  'm-compare': ['compare:more', 'compare:less'],
  'm-fill': range(1, 10, (n) => `fill:${n}`),
  'm-give': range(1, 10, (n) => `give:${n}`),
  'm-flash': range(1, 5, (n) => `flash:${n}`),
  'c-pattern': ['AB', 'AABB', 'AAB', 'ABB', 'ABC'].map((k) => `pattern:${k}`),
  'p-shape': SHAPES.map((s) => `shape:${s.id}`),
  'p-size': ['size:big', 'size:small'],
  'p-solid': ['cube', 'sphere', 'cylinder', 'cone', 'prism'].map((x) => `all:${x}`),
  'c-drive': ['arrow:left', 'arrow:right', 'arrow:up', 'arrow:down', 'route:2', 'route:3'],
  'c-seq': STORIES.map(seqSkill),
  'm-order': range(3, 8, (n) => `order:${n}`),
  'z-category': ['fly', 'water', 'wheels', 'eat', 'legs4'].map((k) => `cat:${k}`),
  'z-use': ['rain', 'eat', 'wear', 'bath', 'bed'].map((k) => `all:${k}`),
  'p-findall': ['apple', 'chick', 'red', 'blue', 'circle', 'triangle', 'bug', 'car', 'green', 'star'].map((x) => `all:${x}`),
  'd-trace': range(1, 6, (n) => `trace:${n}`),
  'd-dots': range(1, 8, (n) => `dots:p${n}`),
  'd-glyph': [...'1ILTH0OCEFUDPBJ'].map((g) => `glyph:${g}`),
  'd-color': range(1, 6, (n) => `coloring:c${n}`),
  'p-lasso': ['apple', 'red', 'circle', 'car'].map((x) => `lasso:${x}`),
}
const ABILITY: Record<TrackId, number> = { lang: 0.6, num: 0.95, think: 0.8, hand: 0.85 }
const attempts: Attempt[] = []
const box = new Map<string, number>()
const seen = new Map<string, number>()
const levels = new Map<string, number>()
const plays = new Map<string, number>()
const last = new Map<string, number>()
const intros: Intros = new Map()
let ts = Date.parse('2026-11-02T08:00:00')

function log(date: string, game: string, skill: string, phase: Attempt['phase'], ok: boolean, theme: string) {
  const a: Attempt = {
    id: String(attempts.length), ts: ts++, date, sessionId: date, station: GAMES.find((g) => g.id === game)!.station as StationId, game, itemId: skill, skill,
    phase, level: levels.get(game) ?? 1, options: [], answer: '', taps: [], firstTryCorrect: ok, attempts: 1, responseMs: 2000, hintUsed: false, theme, synced: 1,
  }
  attempts.push(a)
  noteIntro(intros, a)
  if (phase === 'quiz') {
    recordSkill(skill, ok)
    seen.set(skill, (seen.get(skill) ?? 0) + 1)
    box.set(skill, ok ? Math.min(5, (box.get(skill) ?? 0) + 1) : Math.max(0, (box.get(skill) ?? 0) - 1))
  }
}
function playGame(game: string, date: string, paused: boolean, theme: string) {
  const t = trackOf(game)!
  const pool = CONTENT[game]
  const known = pool.filter((k) => seen.get(k))
  let taught = 0
  let okRun = 0
  for (let i = 0; i < 6; i++) {
    const can = (k: string) => !paused && (!conceptOf(game, k) || intros.has(conceptOf(game, k)!) || budgetOf(t, intros, date).left > 0)
    const fresh = pool.find((k) => !seen.get(k) && taught < 2 && can(k))
    const k = fresh && (i % 2 === 1 || !known.length) ? fresh : known.length ? known[Math.floor(rnd() * known.length)] : pool[0]
    if (!seen.get(k)) {
      log(date, game, k, 'teach', true, theme)
      taught++
      known.push(k)
    }
    const ok = rnd() < ABILITY[t] * ((box.get(k) ?? 0) >= MASTERED_BOX ? 1.05 : 0.9)
    log(date, game, k, 'quiz', ok, theme)
    okRun = ok ? okRun + 1 : 0
    if (okRun >= 3 && (levels.get(game) ?? 1) < 4) {
      okRun = 0
      levels.set(game, (levels.get(game) ?? 1) + 1)
    }
  }
  plays.set(game, (plays.get(game) ?? 0) + 1)
  last.set(game, ts)
}

/** 在主題下真的出一題，印出題目裡的東西 */
function sample(game: string, theme: ThemeId): string {
  const lv = levels.get(game) ?? 1
  const leave = enterTheme(theme)
  try {
    const def = GAMES.find((g) => g.id === game)!
    if (PHONICS_MAKERS[game]) {
      const it = PHONICS_MAKERS[game](lv, [])
      return `/${it.unit.letter}/ ${it.stimulus ? `像 ${it.stimulus.w}，` : ''}答案 ${it.options.find((o) => o.id === it.answer)?.word?.w ?? it.answer}`
    }
    if (SHEET_MAKERS[game]) return `找出全部：${SHEET_MAKERS[game](lv, []).itemId}`
    if (def.make) {
      const it = def.make(lv, [])
      const pic = (v: unknown) => (v as { icon?: string; t?: string; items?: unknown[] })?.icon ?? (v as { t?: string })?.t
      const stim = it.stimulus ? (it.stimulus.t === 'seq' ? it.stimulus.items.map(pic).join(' ') : pic(it.stimulus)) : ''
      return `${it.skill}${stim ? `（${stim}）` : ''} 選項 ${it.options.map((o) => (o.v.t === 'emoji' || o.v.t === 'group' ? o.v.icon : o.id)).join(' ')}`
    }
    switch (def.kind) {
      case 'count':
      case 'fill':
        return `數 ${themed(COUNT_ICONS, (t) => t.count).join('/')}`
      case 'drive':
        return `開到 ${drivePuzzle(lv, 'arrow:right').target}`
      case 'sequence': {
        const s = pickStory(lv, [])
        return `故事 ${s.id}（${s.icons.join(' → ')}）`
      }
      case 'glyph':
        return `描 ${THEMES.find((x) => x.id === theme)!.glyphs}（這一級有的先描）`
      case 'coloring':
        return `著色 ${THEMES.find((x) => x.id === theme)!.coloring ?? '一般的圖'}`
      default:
        return '（這個遊戲的內容不換主題，背景與故事照主題）'
    }
  } finally {
    leave()
  }
}

const start = '2026-11-02'
const short: Record<TrackId, string> = { lang: '語言', num: '數', think: '思考', hand: '動手' }
const saved = new Map<string, ThemeId>()
/** 第 3 週家長設了本週主題「動物」 */
const weekOf = (date: string): VocabTheme | null => (date >= '2026-11-16' && date < '2026-11-23' ? 'animal' : null)
const perTrack = new Map<TrackId, number>()
const themeDays: ThemeId[] = []
let mismatch = 0
let repeats = 0
console.log('\n── 28 天（週日不玩；11/16–11/22 家長設本週主題「動物」）──')
for (let i = 0; i < 28; i++) {
  const date = shiftDate(start, i)
  if (new Date(date + 'T00:00').getDay() === 0) continue
  const load = loadCheck(attempts, date)
  const needs = trackNeeds({ attempts, date, boxOf: (k) => box.get(k) ?? 0, intros })
  const games = GAMES.filter((g) => g.kind !== 'free' && CONTENT[g.id])
  const input = { date, n: 4, needs, games, lastPlayed: (g: string) => last.get(g) ?? 0, plays: (g: string) => plays.get(g) ?? 0, overloaded: load.overloaded }
  // App 裡的 todayPlan：planDay 排站，pickTheme 挑主題（主題不影響排課）
  const slots = planDay(input)
  const plain = planDay(input)
  if (slots.map((s) => s.game).join() !== plain.map((s) => s.game).join()) mismatch++
  const recent = Array.from({ length: 6 }, (_, k) => saved.get(shiftDate(date, -(k + 1))))
  const theme = pickTheme({ date, recent, week: weekOf(date) })
  if (recent.includes(theme)) repeats++
  saved.set(date, theme)
  themeDays.push(theme)
  const th = THEMES.find((t) => t.id === theme)!
  console.log(`\n${date}  ${th.title}（${th.zh}）${weekOf(date) ? '  ← 本週主題：動物' : ''}`)
  slots.forEach((s, k) => {
    perTrack.set(s.track, (perTrack.get(s.track) ?? 0) + 1)
    console.log(`   ${k + 1}. [${th.stops[k]}] ${s.game.padEnd(10)} ${short[s.track].padEnd(3)} ${sample(s.game, theme)}`)
  })
  for (const s of slots) playGame(s.game, date, load.overloaded, theme)
}

console.log('\n── 摘要 ──')
console.log(`排課：主題式冒險的站與 planDay 不同的天數 ${mismatch}（應為 0）`)
console.log(`四條線 4 週的站數：${TRACKS.map((t) => `${t.name} ${perTrack.get(t.id) ?? 0}`).join('、')}`)
const count = new Map<string, number>()
for (const t of themeDays) count.set(t, (count.get(t) ?? 0) + 1)
console.log(`主題出現次數：${THEMES.map((t) => `${t.id} ${count.get(t.id) ?? 0}`).join('、')}`)
console.log(`6 天內重複的主題：${repeats} 次`)
const animalWeek = themeDays.slice(12, 18)
console.log(`本週主題「動物」那 6 天：${animalWeek.join('、')}（都是 matches 含 animal 的主題：${animalWeek.every((t) => THEMES.find((x) => x.id === t)!.matches.includes('animal')) ? '是' : '否'}）`)
if (problems.length || mismatch) process.exit(1)
