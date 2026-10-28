// 四條能力主線的模擬（PRD §5.10）：假造幾週的作答，印出每天排的冒險、每週新概念額度、負擔控制的啟動與恢復。
// 用的是 App 真正的純函式（lib/tracks.ts、lib/engine.ts），孩子的作答是依各線「能力」隨機產生的。
// 執行：npx tsx scripts/sim-tracks.ts
import type { Attempt, StationId } from '../src/lib/db'
import { loadCheck, MASTERED_BOX } from '../src/lib/engine'
import { budgetOf, noteIntro, planDay, radarScores, shiftDate, trackNeeds, type Intros } from '../src/lib/tracks'
import { conceptLabel, conceptOf, levelConcepts, trackOf, TRACKS, type TrackId } from '../src/content/tracks'
import { GAMES } from '../src/content/games'
import { PHONICS, phonicsSkill } from '../src/content/letters'
import { VOCAB } from '../src/content/vocab'
import { COLORS, SHAPES } from '../src/content/park'
import { STORIES, seqSkill } from '../src/content/code'

// ── 固定亂數：每次跑結果一樣 ─────────────────────────────────
let seed = 20261102
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

// ── 每個遊戲的內容（依出現順序） ─────────────────────────────
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
  'm-quick': range(1, 10, (n) => `num:${n}`),
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
const MAX_LEVEL: Record<string, number> = { 'd-trace': 6, 'd-dots': 4, 'd-glyph': 4, 'c-drive': 4, 'c-seq': 4, 'c-pattern': 4 }

// ── 模擬的孩子：數學強、語言弱；第 3 週有三天很累 ─────────────
const ABILITY: Record<TrackId, number> = { lang: 0.6, num: 0.95, think: 0.8, hand: 0.85 }
const TIRED = new Set(['2026-11-17', '2026-11-18', '2026-11-19'])

// ── 模擬狀態 ────────────────────────────────────────────────
const attempts: Attempt[] = []
const box = new Map<string, number>()
const seen = new Map<string, number>()
const levels = new Map<string, number>()
const plays = new Map<string, number>()
const last = new Map<string, number>()
const intros: Intros = new Map()
let ts = Date.parse('2026-11-02T08:00:00')

function log(date: string, game: string, skill: string, phase: Attempt['phase'], ok: boolean) {
  const a: Attempt = {
    id: String(attempts.length), ts: ts++, date, sessionId: date, station: GAMES.find((g) => g.id === game)!.station as StationId, game, itemId: skill, skill,
    phase, level: levels.get(game) ?? 1, options: [], answer: '', taps: [], firstTryCorrect: ok, attempts: 1, responseMs: 2000, hintUsed: false, synced: 1,
  }
  attempts.push(a)
  noteIntro(intros, a)
  if (phase === 'quiz') {
    seen.set(skill, (seen.get(skill) ?? 0) + 1)
    box.set(skill, ok ? Math.min(5, (box.get(skill) ?? 0) + 1) : Math.max(0, (box.get(skill) ?? 0) - 1))
  }
}

/** 和 adaptive.canIntroduce 同一套規則 */
function canIntroduce(game: string, skill: string, date: string, paused: boolean) {
  if (paused) return false
  const c = conceptOf(game, skill)
  if (!c || intros.has(c)) return true
  return budgetOf(trackOf(game)!, intros, date).left > 0
}

const budgetLog: string[] = []

function playGame(game: string, date: string, paused: boolean) {
  const t = trackOf(game)!
  const lv = levels.get(game) ?? 1
  // 難度就是內容的遊戲：只出到目前這一級的內容
  const pool = MAX_LEVEL[game] && game.startsWith('d-') ? CONTENT[game].slice(0, Math.ceil((CONTENT[game].length * lv) / MAX_LEVEL[game])) : CONTENT[game]
  const known = pool.filter((k) => seen.get(k))
  let taught = 0
  let okRun = 0
  for (let i = 0; i < 6; i++) {
    const fresh = pool.find((k) => !seen.get(k) && taught < 2 && canIntroduce(game, k, date, paused))
    // 一局最多教 2 個；其餘出學過的（遊戲裡什麼都沒學過時，照常教一個）
    const k = fresh && (i % 2 === 1 || !known.length) ? fresh : known.length ? known[Math.floor(rnd() * known.length)] : pool[0]
    if (!seen.get(k)) {
      const c = conceptOf(game, k)
      if (c && !intros.has(c)) budgetLog.push(`${date} ${t.padEnd(5)} 教新概念「${conceptLabel(c)}」（${game}）`)
      log(date, game, k, 'teach', true)
      taught++
      known.push(k)
    }
    const p = ABILITY[t] * ((box.get(k) ?? 0) >= MASTERED_BOX ? 1.05 : 0.9) * (TIRED.has(date) ? 0.5 : 1)
    const ok = rnd() < p
    log(date, game, k, 'quiz', ok)
    okRun = ok ? okRun + 1 : 0
    // 連續 3 題答對升一級；升到全新內容的一級要看額度（adaptive.holdLevelUp）
    if (okRun >= 3 && (MAX_LEVEL[game] ?? 4) > (levels.get(game) ?? 1)) {
      okRun = 0
      const next = (levels.get(game) ?? 1) + 1
      const cs = levelConcepts(game, next)
      const hold = !!cs && !cs.some((c) => intros.has(c)) && (paused || budgetOf(t, intros, date).left <= 0)
      if (hold) budgetLog.push(`${date} ${t.padEnd(5)} 額度用完，${game} 先不升到 ${next} 級`)
      else levels.set(game, next)
    }
  }
  plays.set(game, (plays.get(game) ?? 0) + 1)
  last.set(game, ts)
}

// ── 跑 4 週（週日不玩） ───────────────────────────────────────
const start = '2026-11-02'
const fmtTrack = (t: TrackId) => TRACKS.find((x) => x.id === t)!.name
console.log('模擬的孩子：', Object.entries(ABILITY).map(([t, p]) => `${fmtTrack(t as TrackId)} ${Math.round(p * 100)}%`).join('、'), `；很累的日子：${[...TIRED].join('、')}\n`)
let dropped = false
for (let i = 0; i < 28; i++) {
  const date = shiftDate(start, i)
  if (new Date(date + 'T00:00').getDay() === 0) continue
  const load = loadCheck(attempts, date)
  if (load.overloaded) {
    // 和 adaptive.applyLoadDrop 一樣：每個遊戲降一級
    for (const [g, l] of levels) if (l > 1) levels.set(g, l - 1)
    if (!dropped) console.log(`  >>> ${date} 負擔控制啟動：前 3 個有玩的日子第一次答對 ${load.days.map((d) => `${Math.round((d.ok / d.n) * 100)}%`).join('、')}，降一級、暫停新概念`)
    dropped = true
  } else if (dropped) {
    console.log(`  <<< ${date} 負擔控制恢復：最近一天第一次答對 ${Math.round((load.days.at(-1)!.ok / load.days.at(-1)!.n) * 100)}%`)
    dropped = false
  }
  const needs = trackNeeds({ attempts, date, boxOf: (k) => box.get(k) ?? 0, intros })
  const games = GAMES.filter((g) => g.kind !== 'free' && CONTENT[g.id] && (g.id !== 'm-quick' || [...box].filter(([k, b]) => k.startsWith('num:') && b >= 3).length >= 3))
  const plan = planDay({ date, n: 4, needs, games, lastPlayed: (g) => last.get(g) ?? 0, plays: (g) => plays.get(g) ?? 0, overloaded: load.overloaded })
  const before = attempts.length
  for (const s of plan) playGame(s.game, date, load.overloaded)
  const today = attempts.slice(before).filter((a) => a.phase === 'quiz')
  const rate = Math.round((today.filter((a) => a.firstTryCorrect).length / today.length) * 100)
  const needStr = needs.map((n) => `${fmtTrack(n.track)} ${n.need.toFixed(2)}${n.mustPlay ? '*' : ''}`).join(' ')
  console.log(`${date}  ${plan.map((s) => `${s.game}(${fmtTrack(s.track)})`).join(' → ').padEnd(70)} 答對 ${rate}%  需要：${needStr}`)
  if (new Date(date + 'T00:00').getDay() === 6) {
    const r = radarScores(attempts, date)
    const b = TRACKS.map((t) => {
      const x = budgetOf(t.id, intros, date)
      return `${t.name} ${x.used.length}/${x.limit}`
    })
    console.log(`  ── 週末  雷達：${r.map((x) => `${fmtTrack(x.track)} ${x.score}`).join('、')}  ｜ 近 7 天新概念：${b.join('、')}\n`)
  }
}
console.log('\n新概念與升級的決定：')
for (const l of budgetLog) console.log('  ' + l)
const counts = new Map<string, number>()
for (const a of attempts) if (a.phase === 'quiz') counts.set(trackOf(a.game)!, (counts.get(trackOf(a.game)!) ?? 0) + 1)
console.log('\n4 週各線的自己答題數：', [...counts].map(([t, n]) => `${fmtTrack(t as TrackId)} ${n}`).join('、'))
