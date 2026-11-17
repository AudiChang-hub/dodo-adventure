// 鼓聲停就不動（T-160，指引 CG-3 自我控制：「聽到停會停（音樂停就不動的遊戲、快慢跳舞）」）：角色、舞台、鼓、出題、升降級。
// 只有純函式，scripts/test-picnic-drum.ts 直接測；畫面在 ./Drum.tsx，鼓聲在 ./beat.ts（Web Audio 即時合成，不唱歌、不用 TTS）。
// 一首＝幾段「鼓響 → 鼓停」：鼓響的時候點角色讓牠跳舞，鼓一停就要停手；停的時候還在點，角色搖搖晃晃差點跌倒（好笑、不懲罰）。
// 熟練了：鼓聲變快變慢、停得更突然（不在一小節結束的地方、不先說 Freeze）、停的時間更短。
// 角色、舞台都是 App 自己的圖（故事繪本的角色、自己畫的舞台），鼓的節奏、音色是程式產生的，不照任何現成 App 或歌曲。

type Rnd = () => number
const pickOf = <T,>(a: readonly T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length) % a.length]
const between = (lo: number, hi: number, rnd: Rnd) => lo + (hi - lo) * rnd()

// ── 角色、舞台、鼓 ────────────────────────────────────────────

/** 跳舞的角色：三隻恐龍和故事繪本的動物（art/storybook，../picnic/art 的 Critter 畫） */
export const DANCER_IDS = [
  'dodo',
  'bobo',
  'momo',
  'teddy',
  'rabbit',
  'turtle',
  'elephant',
  'giraffe',
  'zebra',
  'lion',
  'monkey',
  'cow',
  'sheep',
  'pig',
  'chicken',
  'cat',
  'frog',
  'sauropod',
  'trex',
  'octopus',
] as const
export type DancerId = (typeof DANCER_IDS)[number]

/** 舞台（./art.tsx 的 Stage） */
export type StageId = 'theater' | 'forest' | 'beach' | 'sea' | 'space' | 'snow' | 'farm' | 'city' | 'desert' | 'jungle' | 'candy' | 'rainbow' | 'moon' | 'garden'
export const STAGE_IDS: StageId[] = ['theater', 'forest', 'beach', 'sea', 'space', 'snow', 'farm', 'city', 'desert', 'jungle', 'candy', 'rainbow', 'moon', 'garden']

/** 鼓的音色（./beat.ts 的 KITS）：每一種一個低音、一個高音、一個重音 */
export type KitId = 'bass' | 'bongo' | 'snare' | 'tom' | 'wood' | 'shaker' | 'taiko' | 'steel'
export const KIT_IDS: KitId[] = ['bass', 'bongo', 'snare', 'tom', 'wood', 'shaker', 'taiko', 'steel']

/** 節奏：一小節的格子（0 不打、1 低音、2 高音、3 重音）。不是任何現成的歌，是常見的打法 */
export type PatternId = 'march' | 'gallop' | 'rock' | 'waltz' | 'boomchick' | 'clave' | 'tumble' | 'heartbeat' | 'skip'
export const PATTERNS: Record<PatternId, number[]> = {
  march: [3, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0],
  gallop: [3, 0, 2, 2, 1, 0, 2, 2, 1, 0, 2, 2, 1, 0, 2, 2],
  rock: [3, 0, 0, 0, 2, 0, 0, 0, 1, 0, 1, 0, 2, 0, 0, 0],
  waltz: [3, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
  boomchick: [3, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0],
  clave: [3, 0, 0, 2, 0, 0, 3, 0, 0, 0, 2, 0, 3, 0, 0, 0],
  tumble: [3, 0, 2, 0, 2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 2],
  heartbeat: [3, 0, 1, 0, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0, 0, 0],
  skip: [3, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2],
}
export const PATTERN_IDS = Object.keys(PATTERNS) as PatternId[]

// ── 級數 ─────────────────────────────────────────────────────

export type DrumLevel = 1 | 2 | 3 | 4
export const DRUM_MAX: DrumLevel = 4
export interface DrumLevelSpec {
  /** 一首停幾次 */
  stops: number
  /** 鼓響幾秒 */
  play: [number, number]
  /** 鼓停幾秒（要不動多久） */
  freeze: [number, number]
  /** 鼓的速度（每分鐘幾拍） */
  bpm: [number, number]
  /** 停在一小節結束的地方（聽得出要停了）；false：停在任何地方（突然） */
  onBar: boolean
  /** 停的時候說「Freeze!」（只有第 1 級：先學規則） */
  sayFreeze: boolean
  /** 最後一下加重（「咚！」再停）：聽得出來要停了 */
  accent: boolean
  /** 同一段鼓裡速度會變（越來越快、突然變慢） */
  tempoShift: boolean
  /** 鼓停之後這麼久內還在點不算（手還沒收回來），之後點才算沒停住 */
  grace: number
}
export const DRUM_LEVELS: Record<DrumLevel, DrumLevelSpec> = {
  1: { stops: 3, play: [5, 8], freeze: [3, 4], bpm: [84, 104], onBar: true, sayFreeze: true, accent: true, tempoShift: false, grace: 1.2 },
  2: { stops: 4, play: [4, 7], freeze: [2.5, 3.5], bpm: [80, 124], onBar: true, sayFreeze: false, accent: true, tempoShift: false, grace: 1.0 },
  3: { stops: 4, play: [3, 6], freeze: [2, 3], bpm: [72, 136], onBar: false, sayFreeze: false, accent: false, tempoShift: true, grace: 0.8 },
  4: { stops: 5, play: [2, 5], freeze: [1.5, 2.5], bpm: [66, 150], onBar: false, sayFreeze: false, accent: false, tempoShift: true, grace: 0.6 },
}
export const DRUM_GAME = 'logic-drum'
/** 作答紀錄的技能：drum:1～drum:4 */
export const drumSkill = (level: DrumLevel) => `drum:${level}`

// ── 一首 ─────────────────────────────────────────────────────

export interface DrumSegment {
  /** 鼓響幾秒（對齊到一拍；onBar 的級對齊到一小節） */
  play: number
  /** 這一段的速度：開始、結束（tempoShift 的級中間會變） */
  bpm: [number, number]
  pattern: PatternId
  /** 接著停幾秒 */
  freeze: number
}

export interface DrumSong {
  level: DrumLevel
  dancer: DancerId
  stage: StageId
  kit: KitId
  segments: DrumSegment[]
}

/** 一段鼓響的長度：onBar 的級整小節（聽得出「一句結束」），其他的級停在任一拍（突然） */
export function segLength(spec: DrumLevelSpec, bpm: number, pattern: PatternId, rnd: Rnd): number {
  const beat = 60 / bpm
  const bar = (PATTERNS[pattern].length / 4) * beat
  const want = between(spec.play[0], spec.play[1], rnd)
  if (spec.onBar) return Math.max(1, Math.round(want / bar)) * bar
  // 突然停：不在小節的頭（避開剛好整小節），停在半拍上
  let half = Math.max(3, Math.round(want / (beat / 2)))
  if (half % (PATTERNS[pattern].length / 2) === 0) half++
  return half * (beat / 2)
}

export function makeSong(s: DrumState, rnd: Rnd = Math.random): DrumSong {
  const level = s.level as DrumLevel
  const spec = DRUM_LEVELS[level]
  const dancer = freshPick(DANCER_IDS, s.dancers, RECENT.dancers, rnd)
  const stage = freshPick(STAGE_IDS, s.stages, RECENT.stages, rnd)
  const kit = freshPick(KIT_IDS, s.kits, RECENT.kits, rnd)
  const segments: DrumSegment[] = []
  let prevBpm = 0
  for (let i = 0; i < spec.stops; i++) {
    // 有快有慢：跟上一段至少差 12 拍
    let a = Math.round(between(spec.bpm[0], spec.bpm[1], rnd))
    for (let k = 0; k < 8 && prevBpm && Math.abs(a - prevBpm) < 12; k++) a = Math.round(between(spec.bpm[0], spec.bpm[1], rnd))
    prevBpm = a
    const b = spec.tempoShift && rnd() < 0.6 ? Math.round(Math.min(spec.bpm[1], Math.max(spec.bpm[0], a * (rnd() < 0.5 ? 0.7 : 1.35)))) : a
    const prev = segments[i - 1]?.pattern
    const pattern = pickOf(PATTERN_IDS.filter((p) => p !== prev), rnd)
    // 長度照開始的速度算；速度會變的級停在哪一拍本來就不整齊
    const play = segLength(spec, a, pattern, rnd)
    segments.push({ play, bpm: [a, b], pattern, freeze: between(spec.freeze[0], spec.freeze[1], rnd) })
  }
  return { level, dancer, stage, kit, segments }
}

/** 一段鼓的每一下：t（從這一段開始算的秒）、role（1 低、2 高、3 重音） */
export function hitsOf(seg: DrumSegment, accentEnd: boolean): { t: number; role: number }[] {
  const pat = PATTERNS[seg.pattern]
  const out: { t: number; role: number }[] = []
  let t = 0
  let i = 0
  // 速度從 bpm[0] 慢慢變到 bpm[1]（照時間線性變）
  while (t < seg.play - 1e-6) {
    const bpm = seg.bpm[0] + (seg.bpm[1] - seg.bpm[0]) * Math.min(1, t / seg.play)
    const role = pat[i % pat.length]
    if (role) out.push({ t, role })
    t += 60 / bpm / 4
    i++
  }
  // 聽得出要停了：最後一下「咚！」加重，打在停的那一刻
  if (accentEnd) out.push({ t: seg.play, role: 3 })
  return out
}

// ── 一次停住了沒 ──────────────────────────────────────────────

/**
 * 一次停：鼓響的時候有跳舞（點過 ≥ 1 下）才算這一次（發呆沒跳的不算停住，也不算沒停住）；
 * 鼓停之後過了 grace 秒，到下一段鼓響之前都沒點，算停住了。taps 是點的時間（秒，跟 playStart 同一個鐘）。
 */
export function judgeStop(taps: readonly number[], playStart: number, stopAt: number, freezeEnd: number, grace: number): 'held' | 'moved' | 'idle' {
  const danced = taps.some((t) => t >= playStart && t < stopAt)
  if (!danced) return 'idle'
  return taps.some((t) => t >= stopAt + grace && t < freezeEnd) ? 'moved' : 'held'
}

/** 一首算「第一次就對」：算數的停 ≥ 2 次，而且停住了 ≥ 3/4（3 次停住 2 次也算，三歲手慢一點是正常的） */
export const OK_RATIO = 0.75
export function songOk(results: readonly ('held' | 'moved' | 'idle')[]): { counted: boolean; ok: boolean; held: number; moved: number } {
  const held = results.filter((r) => r === 'held').length
  const moved = results.filter((r) => r === 'moved').length
  const n = held + moved
  return { counted: n >= 2, ok: n >= 2 && held / n >= OK_RATIO - 0.1, held, moved }
}

// ── 進度、升降級 ──────────────────────────────────────────────

/** 記住最近幾個：角色 5 隻、舞台 4 個、鼓 3 種 */
export const RECENT = { dancers: 5, stages: 4, kits: 3 }

export function freshPick<T>(pool: readonly T[], recent: readonly T[], keep: number, rnd: Rnd = Math.random): T {
  const last = recent.slice(-keep)
  let left = pool.filter((x) => !last.includes(x))
  if (!left.length) left = pool.filter((x) => x !== recent[recent.length - 1])
  if (!left.length) left = [...pool]
  return pickOf(left, rnd)
}

/**
 * 升級：最近 3 首都順利（停住了 ≥ 3/4）就往上；退級：最近 3 首有 2 首沒停住（ADAPT-4）。發呆沒跳的一首不算。
 */
export const UP_OF = 3
export const DOWN_OF = 3
export const DOWN_BAD = 2

export interface DrumState {
  level: number
  recent: { date: string; ok: boolean }[]
  /** 第一次玩過了（規則說明只在前幾次說完整的） */
  plays: number
  dancers: DancerId[]
  stages: StageId[]
  kits: KitId[]
}

export const DRUM_START: DrumState = { level: 1, recent: [], plays: 0, dancers: [], stages: [], kits: [] }

export function stepDrum(s: DrumState, r: { date: string; ok: boolean; counted: boolean }): DrumState {
  if (!r.counted) return s
  const recent = [...s.recent, { date: r.date, ok: r.ok }].slice(-Math.max(UP_OF, DOWN_OF))
  const lastDown = recent.slice(-DOWN_OF)
  if (s.level > 1 && lastDown.length >= DOWN_OF && lastDown.filter((x) => !x.ok).length >= DOWN_BAD) return { ...s, level: s.level - 1, recent: [] }
  const lastUp = recent.slice(-UP_OF)
  if (s.level < DRUM_MAX && lastUp.length >= UP_OF && lastUp.every((x) => x.ok)) return { ...s, level: s.level + 1, recent: [] }
  return { ...s, recent }
}

const push = <T,>(a: readonly T[], x: T, keep: number) => [...a, x].slice(-keep)

/** 一首開始：記住角色、舞台、鼓（下次換別的） */
export function rememberSong(s: DrumState, song: DrumSong): DrumState {
  return { ...s, plays: s.plays + 1, dancers: push(s.dancers, song.dancer, RECENT.dancers), stages: push(s.stages, song.stage, RECENT.stages), kits: push(s.kits, song.kit, RECENT.kits) }
}

const strs = <T extends string>(x: unknown, ok: readonly T[], keep: number): T[] => (Array.isArray(x) ? (x.filter((v) => ok.includes(v)) as T[]).slice(-keep) : [])

export function normalizeDrum(raw: unknown): DrumState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const level = Number.isInteger(o.level) ? Math.min(DRUM_MAX, Math.max(1, o.level as number)) : 1
  const recent = Array.isArray(o.recent) ? (o.recent as { date?: unknown; ok?: unknown }[]).filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date as string, ok: !!x.ok })) : []
  return {
    level,
    recent: recent.slice(-Math.max(UP_OF, DOWN_OF)),
    plays: Number.isInteger(o.plays) && (o.plays as number) >= 0 ? (o.plays as number) : 0,
    dancers: strs(o.dancers, DANCER_IDS, RECENT.dancers),
    stages: strs(o.stages, STAGE_IDS, RECENT.stages),
    kits: strs(o.kits, KIT_IDS, RECENT.kits),
  }
}

/** 一首會用到的組合數（角色 × 舞台 × 鼓的音色 × 節奏）：回報、測試用 */
export const DRUM_COMBOS = DANCER_IDS.length * STAGE_IDS.length * KIT_IDS.length * PATTERN_IDS.length
