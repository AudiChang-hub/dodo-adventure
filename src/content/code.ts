// 程式車庫（PRD §10）：3–4 歲的運算思維入門，不需要識字。
// 三個遊戲各練一條：箭頭卡開車（方向、順序、除錯）、找規律（ABAB）、排順序（先後）。
// 題目資料與產生器都在這裡；台詞在 lines-code.ts，畫面在 src/games/code/。
import type { ChoiceItem, TeachSpec, Visual } from './games'
import { pickPreferred, pickTarget } from '../lib/adaptive'
import { themeNow } from '../lib/theme-play'
import { pick, sample, shuffle } from '../lib/random'
import { THEME_GOALS, THEME_STORIES } from './themes'

// ── 方向 ───────────────────────────────────────────────────
// 3 歲用「絕對方向」（上下左右，跟畫面一致），不用「左轉、右轉」：
// 相對方向要先站在車子的角度想，4–5 歲才開始，見 PRD §10 的年齡表
export type Dir = 'up' | 'down' | 'left' | 'right'
export const DIRS: Dir[] = ['up', 'down', 'left', 'right']
export const DIR_ZH: Record<Dir, string> = { up: '上', down: '下', left: '左', right: '右' }
const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export interface Cell {
  x: number
  y: number
}
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y
export const stepOf = (c: Cell, d: Dir): Cell => ({ x: c.x + STEP[d][0], y: c.y + STEP[d][1] })

// ── 箭頭卡開車 ─────────────────────────────────────────────
/** 豆豆要開去的地方：一局裡輪流出現，每個都有一句「Drive to the | house!」 */
export const TARGETS = [
  { id: 'house', icon: 'house', en: 'house' },
  { id: 'teddy', icon: 'teddy-bear', en: 'teddy bear' },
  { id: 'apple', icon: 'red-apple', en: 'apple' },
  { id: 'balloon', icon: 'balloon', en: 'balloon' },
  { id: 'gas', icon: 'fuel-pump', en: 'gas pump' },
] as const
export type TargetId = (typeof TARGETS)[number]['id']

/** 全部的目的地：原本的五個，加上主題式冒險的（公車站牌、恐龍巢…，在 themes.ts） */
export const DRIVE_TARGETS: { id: string; icon: string; en: string }[] = [...TARGETS, ...THEME_GOALS]
export const driveTarget = (id: string) => DRIVE_TARGETS.find((t) => t.id === id) ?? TARGETS[0]

/** 擋路的樹：最高難度才出現，要繞過去 */
export const BLOCK_ICON = 'evergreen-tree'

export interface DrivePuzzle {
  itemId: string
  /** arrow:up（一張卡）或 route:2、route:3（幾張卡排成一條路） */
  skill: string
  cols: number
  rows: number
  start: Cell
  goal: Cell
  blocks: Cell[]
  /** 目的地（DRIVE_TARGETS 的 id） */
  target: string
  /** 一組正確的卡：教學卡、一起練照這組發光（轉彎最少的那一條） */
  solution: Dir[]
  /** 卡盒裡有哪些箭頭：第 1 級只有一直排的路，所以只有上下 */
  palette: Dir[]
}

/**
 * 第 1 級的方向：上、下（T-49 LOAD-4、成長系統 T10：先教上下，左右等上下穩了才開，看的是能力不是年齡）。
 * 之後加「前後」這類題型也加在這一層，左右一樣排在後面。
 */
export const FIRST_DIRS: Dir[] = ['up', 'down']

/**
 * 每一級出哪幾種題目：1 級一直排的路只有上下、2 級才加上左右（1 級連對才升得上來，成長系統 T12）、
 * 3 級兩張卡、4 級三張卡（可能有樹擋路）。
 * 題目一律是「開到 ○○」，沒有「聽 left 選卡」：left、right 只是放卡、開車時念的標籤。
 */
export function driveSkills(level: number): string[] {
  if (level <= 1) return FIRST_DIRS.map((d) => `arrow:${d}`)
  if (level === 2) return DIRS.map((d) => `arrow:${d}`)
  if (level === 3) return ['route:2']
  return ['route:3']
}

const inside = (p: Pick<DrivePuzzle, 'cols' | 'rows'>, c: Cell) => c.x >= 0 && c.y >= 0 && c.x < p.cols && c.y < p.rows
const blocked = (p: Pick<DrivePuzzle, 'blocks'>, c: Cell) => p.blocks.some((b) => same(b, c))

/** 每一格到目的地要走幾步（BFS）；走不到的是 Infinity */
export function distMap(p: Pick<DrivePuzzle, 'cols' | 'rows' | 'blocks' | 'goal'>): number[][] {
  const d = Array.from({ length: p.rows }, () => Array<number>(p.cols).fill(Infinity))
  d[p.goal.y][p.goal.x] = 0
  const q: Cell[] = [p.goal]
  while (q.length) {
    const c = q.shift()!
    for (const dir of DIRS) {
      const n = stepOf(c, dir)
      if (!inside(p, n) || blocked(p, n) || d[n.y][n.x] !== Infinity) continue
      d[n.y][n.x] = d[c.y][c.x] + 1
      q.push(n)
    }
  }
  return d
}

/** 最短路線中轉彎最少的一條：先一直走同一個方向，走不下去才轉 */
function solve(p: Omit<DrivePuzzle, 'solution' | 'itemId'>): Dir[] {
  const d = distMap(p)
  const out: Dir[] = []
  let c = p.start
  let last: Dir | null = null
  while (!same(c, p.goal)) {
    const ok = DIRS.filter((dir) => {
      const n = stepOf(c, dir)
      return inside(p, n) && d[n.y][n.x] === d[c.y][c.x] - 1
    })
    const dir: Dir = last && ok.includes(last) ? last : ok[0]
    out.push(dir)
    last = dir
    c = stepOf(c, dir)
  }
  return out
}

export interface RunResult {
  /** 車子實際經過的格子（含起點） */
  path: Cell[]
  /** 第幾張卡撞到（開出路外或撞到樹）；沒撞到是 null */
  bump: number | null
  /** 第一張「沒有更靠近目的地」的卡：除錯時要孩子改的那一張 */
  bug: number | null
  ok: boolean
}

/** 照著卡片開一次：撞到就停下來 */
export function runProgram(p: DrivePuzzle, prog: Dir[]): RunResult {
  const d = distMap(p)
  const path = [p.start]
  let c = p.start
  let bump: number | null = null
  let bug: number | null = null
  for (let i = 0; i < prog.length; i++) {
    const n = stepOf(c, prog[i])
    if (!inside(p, n) || blocked(p, n)) {
      bump = i
      bug ??= i
      break
    }
    if (bug === null && d[n.y][n.x] !== d[c.y][c.x] - 1) bug = i
    c = n
    path.push(c)
  }
  const ok = bump === null && same(c, p.goal)
  return { path, bump, bug: ok ? null : (bug ?? prog.length - 1), ok }
}

const cellsOf = (cols: number, rows: number) => Array.from({ length: cols * rows }, (_, i) => ({ x: i % cols, y: Math.floor(i / cols) }))

/**
 * 依技能出一題：起點、目的地、（4 級）擋路的樹。
 * 主題式冒險：目的地優先用主題的（把公車開到公車站牌），剛去過就換一個原本的，一局裡不會四題都一樣。
 */
export function drivePuzzle(level: number, skill: string, avoidTarget: string[] = []): DrivePuzzle {
  const goal = themeNow()?.goal
  const target = goal && !avoidTarget.includes(goal.id) ? goal.id : pick(TARGETS.filter((t) => !avoidTarget.includes(t.id)).map((t) => t.id))
  const [kind, v] = skill.split(':')
  if (kind === 'arrow') {
    const dir = v as Dir
    // 1 級：一直排三格、車子在中間，上下都開得動，才是真的在選方向
    const one = level <= 1 && FIRST_DIRS.includes(dir)
    const cols = one ? 1 : 3
    const rows = 3
    const start = { x: one ? 0 : 1, y: 1 }
    const base = { skill, cols, rows, start, goal: stepOf(start, dir), blocks: [], target, palette: one ? FIRST_DIRS : DIRS }
    return { ...base, itemId: `${dir}@${cols}x${rows}`, solution: [dir] }
  }
  // 路線題：隨機起點，目的地剛好在 n 步外；4 級常常放一棵樹擋在其中一條最短路線上，
  // 要選另一條（樹不會讓路變長，卡片張數不變）
  const n = Number(v)
  const cols = n >= 3 ? 4 : 3
  const rows = 3
  const cells = cellsOf(cols, rows)
  const far = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  for (let tries = 0; tries < 200; tries++) {
    const start = pick(cells)
    const goals = cells.filter((g) => far(start, g) === n)
    if (!goals.length) continue
    const goal = pick(goals)
    let blocks: Cell[] = []
    if (n >= 3 && Math.random() < 0.6) {
      // 在某一條最短路線上、而且擋住之後還有一樣短的路可以走
      const on = cells.filter((c) => !same(c, start) && !same(c, goal) && far(start, c) + far(c, goal) === n && distMap({ cols, rows, blocks: [c], goal })[start.y][start.x] === n)
      if (on.length) blocks = [pick(on)]
    }
    const base = { skill, cols, rows, start, goal, blocks, target, palette: DIRS }
    const solution = solve(base)
    if (solution.length !== n) continue
    return { ...base, itemId: `${solution.join('-')}@${start.x},${start.y}${blocks.length ? `#${blocks[0].x},${blocks[0].y}` : ''}`, solution }
  }
  // 理論上走不到這裡：退回一張卡的題目
  return drivePuzzle(2, 'arrow:right')
}

/**
 * 箭頭卡開車的教學卡：
 * - 一張卡：大大的箭頭，「This arrow says | up!」→ 車子貼紙出現，「The car goes | up!」
 * - 幾張卡：把這題的正確卡片排出來，一張一張指著念「First, | right!」「Then, | up!」
 */
export function driveTeach(p: DrivePuzzle): TeachSpec {
  if (p.solution.length === 1) {
    const d = p.solution[0]
    return { visual: { t: 'arrow', dir: d }, side: { t: 'emoji', icon: 'automobile' }, sideAt: 1, lines: [`c.teach.dir.${d}`, `c.teach.go.${d}`] }
  }
  const lines = p.solution.map((d, i) => (i === 0 ? `c.teach.first.${d}` : `c.teach.then.${d}`))
  return { visual: p.solution.map((d): Visual => ({ t: 'arrow', dir: d })), focus: p.solution.map((_, i) => i), lines, short: lines }
}

/** 挑這一題的技能：越不熟越常出，並避開剛剛出過的 */
export function pickDriveSkill(level: number, recent: string[]): string {
  const pool = driveSkills(level)
  return pickTarget(pool, (k) => k, pool.length > 1 ? pool.filter((k) => recent.includes(k)) : [])
}

// ── 找規律 ─────────────────────────────────────────────────
// 2026-10-28 重做（docs/玩法看得懂盤點.md 第 0 節）：豆豆的小火車拉著一節節車廂，最後一節是空位，接上對的車廂火車才開走。
// 畫面在 games/code/PatternGame.tsx。由簡到難：
//   1 級：形狀和顏色都不同的積木（紅圓、藍方），AB，2 選 1
//   2 級：換成實物（水果、動物，只用第 1 層的字），AB，3 選 1（多一個和答案同一類的干擾，不能只看「是不是水果」）
//   3 級：加入 AABB；4 級：加入 ABC。每一種規律第一次出現都重新示範（技能是 pattern:AB、pattern:AABB…）
// 箭頭規律拿掉了（和開車的箭頭卡長得一樣、意思不同）；AAB、ABB 停在一組的中間，3 歲太難，也拿掉
export type PatternKind = 'AB' | 'AABB' | 'ABC'
export const PATTERN_ZH: Record<PatternKind, string> = { AB: 'ABAB', AABB: 'AABB', ABC: 'ABC' }

/** thing：主題式冒險補的生活用品（雨傘、氣球），只在主題裡優先出，一般的規律題不會特別挑它們；block：1 級的積木 */
type Theme = 'vehicle' | 'animal' | 'food' | 'arrow' | 'shape' | 'thing' | 'block'
export interface PatternTok {
  id: string
  en: string
  theme: Theme
  v: Visual
}

const emojiTok = (id: string, en: string, theme: Theme, icon: string): PatternTok => ({ id, en, theme, v: { t: 'emoji', icon } })

/** 規律用的圖：名字要短，念起來才有節奏（Car! Dino! Car! Dino!） */
export const PATTERN_TOKS: PatternTok[] = [
  emojiTok('car', 'car', 'vehicle', 'automobile'),
  emojiTok('bus', 'bus', 'vehicle', 'bus'),
  emojiTok('firetruck', 'fire truck', 'vehicle', 'fire-engine'),
  emojiTok('tractor', 'tractor', 'vehicle', 'tractor'),
  // 一張圖一個名字（2026-10-28 單字盤點）：airplane、dinosaur 和動物村同名
  emojiTok('plane', 'airplane', 'vehicle', 'airplane'),
  emojiTok('boat', 'boat', 'vehicle', 'sailboat'),
  emojiTok('trex', 'T-rex', 'animal', 't-rex'),
  emojiTok('dino', 'dinosaur', 'animal', 'sauropod'),
  emojiTok('fish', 'fish', 'animal', 'fish'),
  emojiTok('frog', 'frog', 'animal', 'frog'),
  emojiTok('duck', 'duck', 'animal', 'duck'),
  // 主題式冒險補的（農場、海洋、動物園、下雨天、生日派對）
  emojiTok('cow', 'cow', 'animal', 'cow'),
  emojiTok('pig', 'pig', 'animal', 'pig'),
  emojiTok('crab', 'crab', 'animal', 'crab'),
  emojiTok('lion', 'lion', 'animal', 'lion'),
  emojiTok('umbrella', 'umbrella', 'thing', 'umbrella'),
  emojiTok('balloon', 'balloon', 'thing', 'balloon'),
  emojiTok('apple', 'apple', 'food', 'red-apple'),
  emojiTok('banana', 'banana', 'food', 'banana'),
  emojiTok('strawberry', 'strawberry', 'food', 'strawberry'),
  emojiTok('grapes', 'grapes', 'food', 'grapes'),
  // 箭頭也可以排規律：跟箭頭卡開車連在一起（上、下、上、下）
  ...DIRS.map((d): PatternTok => ({ id: d, en: d, theme: 'arrow', v: { t: 'arrow', dir: d } })),
  // 形狀（同一個顏色）：不用顏色排規律，因為 PRD §3 規定不能只靠顏色區分（墨水模式也要能玩）
  ...(['circle', 'triangle', 'square', 'star', 'heart'] as const).map((sh): PatternTok => ({ id: sh, en: sh, theme: 'shape', v: { t: 'shape', shape: sh, hex: '#F0B088' } })),
  // 第 1 層的動物（docs/vocab-audit.json）：實物的規律只用孩子天天看到的東西
  emojiTok('dog', 'dog', 'animal', 'dog-face'),
  emojiTok('cat', 'cat', 'animal', 'cat-face'),
  // 1 級的積木：形狀和顏色同時不同（PRD §3 不能只靠顏色；墨水模式看形狀也分得出來）。名字念形狀（Circle! Square!）
  { id: 'redcircle', en: 'circle', theme: 'block', v: { t: 'shape', shape: 'circle', hex: '#DE6B5A' } },
  { id: 'bluesquare', en: 'square', theme: 'block', v: { t: 'shape', shape: 'square', hex: '#5E93D1' } },
  { id: 'yellowtriangle', en: 'triangle', theme: 'block', v: { t: 'shape', shape: 'triangle', hex: '#F2C84B' } },
]

export const patternTok = (id: string) => PATTERN_TOKS.find((t) => t.id === id)

/** 實物規律用的字：只用第 1 層（docs/vocab-audit.json 的 tier 1），水果、動物、兩種車 */
const PATTERN_TIER1 = ['apple', 'banana', 'strawberry', 'grapes', 'duck', 'fish', 'dog', 'cat', 'car', 'bus']
const OBJECT_TOKS = PATTERN_TOKS.filter((t) => PATTERN_TIER1.includes(t.id))
const BLOCK_TOKS = PATTERN_TOKS.filter((t) => t.theme === 'block')

/** 每一級會出哪些規律（tracks.ts 的 levelConcepts 也用這一份） */
export function patternKinds(level: number): PatternKind[] {
  if (level <= 2) return ['AB']
  if (level === 3) return ['AB', 'AABB']
  return ['AB', 'AABB', 'ABC']
}

/**
 * 一局幾題：第一次玩 4 題（盤點 8-4：第一次玩縮短），之後和其他選擇題一樣 6 題（pick.ts 的挑戰題在第 6 題）。
 * PatternGame 和 scripts/sim-teach.ts 用同一份。
 */
export const patternRounds = (firstPlay: boolean) => (firstPlay ? 4 : 6)

/** 選項有幾個：1 級 2 選 1，2 級起 3 選 1 */
export const patternOptions = (level: number) => (level <= 1 ? 2 : 3)

/**
 * 題目先排出幾個（後面再接一個空位）：低難度停在一組剛好結束的地方（ABAB→A、AABBAA→B、ABCAB→C），
 * 3 級起 AB 偶爾多排一個（ABABA→B），答案不會永遠是第一個。最長 6 節，加空位 7 節，車廂才夠大（至少 120px）。
 */
function shownCount(kind: PatternKind, level: number): number {
  if (kind === 'AB') return level >= 3 && Math.random() < 0.4 ? 5 : 4
  if (kind === 'AABB') return 6
  return 5
}

/**
 * 挑這一題的圖：1 級是積木；2 級起是實物，每一個來自不同類（水果 vs 動物），一眼就分得出來。
 * 主題式冒險：主題的圖（只要是第 1 層的字）先放，一樣守「每一個不同類」。
 */
function pickMembers(kind: PatternKind, level: number): PatternTok[] {
  const k = new Set(kind).size
  if (level <= 1) return sample(BLOCK_TOKS, k)
  const fav = shuffle(OBJECT_TOKS.filter((t) => themeNow()?.pattern.includes(t.id)))
  const out: PatternTok[] = []
  for (const t of fav) if (out.length < k && !out.some((o) => o.theme === t.theme)) out.push(t)
  const themes = [...new Set(OBJECT_TOKS.map((t) => t.theme))]
  for (const th of shuffle(themes.filter((x) => !out.some((o) => o.theme === x)))) if (out.length < k) out.push(pick(OBJECT_TOKS.filter((t) => t.theme === th)))
  return out
}

/** 規律的一列（用來畫題目和教學卡） */
export function patternRow(kind: PatternKind, members: PatternTok[], n: number): PatternTok[] {
  const idx = (ch: string) => ch.charCodeAt(0) - 65
  return Array.from({ length: n }, (_, i) => members[idx(kind[i % kind.length])])
}

/**
 * 找規律：排出一列車廂，最後一節是空位，問「下一節是什麼？」。
 * 選項：規律裡的每一個，2 級起再加一個「和答案同一類」的干擾（答案是蘋果，干擾就是另一種水果），
 * 孩子要看出「是哪一個」，不能只靠「水果那一個」或排除法猜。ABC 本身就有三個，不另外加。
 * itemId 是「規律:圖-圖-圖…」，PatternGame 從這裡還原每一節是 A、B 還是 C（決定音高）。
 */
export function cPattern(level: number, recent: string[]): ChoiceItem {
  const kinds = patternKinds(level)
  const kind = pickTarget(kinds, (k) => `pattern:${k}`, kinds.length > 1 ? kinds.filter((k) => recent.some((r) => r.startsWith(`${k}:`))) : [])
  const members = pickMembers(kind, level)
  const n = shownCount(kind, level)
  const row = patternRow(kind, members, n)
  const ans = patternRow(kind, members, n + 1)[n]
  const nOpts = patternOptions(level)
  const others = members.filter((m) => m.id !== ans.id)
  const pool = level <= 1 ? BLOCK_TOKS : OBJECT_TOKS
  const near = pool.filter((t) => !members.includes(t) && t.theme === ans.theme)
  const foreign = near.length ? near : pool.filter((t) => !members.includes(t))
  const opts = [ans, ...others, ...sample(foreign, nOpts)].slice(0, nOpts)
  // 給 pick.ts 判斷「新內容要先教」用（找規律的示範是 PatternGame 在畫面上做，不用教學卡）
  const basic = kind === 'AB' ? 4 : kind === 'AABB' ? 6 : 5
  const teachRow = patternRow(kind, members, basic + 1)
  return {
    itemId: `${kind}:${row.map((t) => t.id).join('-')}`,
    skill: `pattern:${kind}`,
    stimulus: { t: 'seq', items: row.map((t) => t.v) },
    // 先跟著節奏念一次，再問：念出來的節奏本身就是規律（聽覺也是一種線索）
    prompt: [...row.map((t) => `c.name.${t.id}`), 'c.pat.what'],
    options: shuffle(opts).map((t) => ({ id: t.id, v: t.v })),
    answer: ans.id,
    correction: [`c.pat.next.${ans.id}`],
    after: [...row, ans].map((t) => `c.name.${t.id}`),
    teach: {
      visual: teachRow.map((t) => t.v),
      focus: teachRow.map((_, i) => i),
      lines: [...teachRow.slice(0, -1).map((t) => `c.name.${t.id}`), `c.pat.next.${teachRow[basic].id}`],
      short: [...teachRow.slice(0, -1).map((t) => `c.name.${t.id}`), `c.pat.next.${teachRow[basic].id}`],
    },
  }
}

// ── 排順序 ─────────────────────────────────────────────────
// 每個小故事 2–4 張圖，只挑順序不會因家庭習慣而不同的（先穿襪子再穿鞋、蛋先孵出小雞）。
// 洗澡和刷牙誰先、早餐吃什麼這類每家不一樣的，不放進來。
//
// 2026-10-29 重做（家長在平板上看了說「這我看不懂要玩啥」）：依 3 歲 3 個月能理解的「先後」重排難度。
// 3 歲懂的先後是「自己天天做的事」和「看得到的變化」（蛋裂開跑出小雞、打哈欠然後睡著），
// 原因看不到、要等很久、或很少親眼看過的（雨停了才有彩虹、毛毛蟲變蝴蝶）延到 2 級。
//   1 級：兩步、看得到變化或自己天天做（蛋→小雞、蛋→恐龍、襪子→鞋子、下雨→撐傘、洗手→吃飯、打哈欠→睡著）
//   2 級：兩步、原因看不到或要等很久（hard：雨→彩虹、毛毛蟲→蝴蝶、冰→水、芽→花）
//   3 級：三步；4 級：四步
// 刷牙→睡覺拿掉了：早上起床後也刷牙，「先睡覺再刷牙」也說得通，不是唯一的順序。
export interface Story {
  id: string
  zh: string
  icons: string[]
  /** 每一張圖的旁白（英文，一張一句） */
  lines: string[]
  /** 兩步故事裡比較難的（原因看不到、要等很久）：2 級才出 */
  hard?: boolean
}

export const STORIES: Story[] = [
  // 1 級
  { id: 'hatch', zh: '蛋孵出小雞', icons: ['egg', 'hatching-chick'], lines: ['First, an | egg.', 'Crack! A baby | chick!'] },
  { id: 'dino', zh: '恐龍蛋孵出恐龍', icons: ['egg', 'sauropod'], lines: ['First, an | egg.', 'Then, a baby | dinosaur!'] },
  { id: 'shoes', zh: '先穿襪子再穿鞋', icons: ['socks', 'running-shoe'], lines: ['First, | socks.', 'Then, | shoes!'] },
  { id: 'umbrella', zh: '下雨了、撐傘', icons: ['cloud-with-rain', 'umbrella-with-rain-drops'], lines: ['Oh, | rain!', 'Open the | umbrella!'] },
  { id: 'wash', zh: '先洗手再吃飯', icons: ['soap', 'cooked-rice'], lines: ['First, wash your | hands.', 'Then, | eat!'] },
  { id: 'nap', zh: '打哈欠、睡著了', icons: ['yawning-face', 'sleeping-face'], lines: ['A big | yawn.', 'Now, | sleep!'] },
  // 2 級
  { id: 'rain', zh: '下雨後出彩虹', icons: ['cloud-with-rain', 'rainbow'], lines: ['First, | rain.', 'Then, a | rainbow!'], hard: true },
  { id: 'bug', zh: '毛毛蟲變蝴蝶', icons: ['bug', 'butterfly'], lines: ['First, a | caterpillar.', 'Then, a | butterfly!'], hard: true },
  { id: 'melt', zh: '冰塊融化成水', icons: ['ice', 'droplet'], lines: ['First, | ice.', 'Then, | water!'], hard: true },
  { id: 'grow', zh: '小芽長成花', icons: ['seedling', 'sunflower'], lines: ['First, a tiny | sprout.', 'Then, a big | flower!'], hard: true },
  // 3 級
  { id: 'chick', zh: '蛋孵出小雞（三步）', icons: ['egg', 'hatching-chick', 'baby-chick'], lines: ['First, an | egg.', 'Crack, | crack!', 'Hello, baby | chick!'] },
  { id: 'clouds', zh: '雲到彩虹（三步）', icons: ['cloud', 'cloud-with-rain', 'rainbow'], lines: ['Clouds | come.', 'Rain | falls.', 'A | rainbow!'] },
  { id: 'flower', zh: '發芽到開花', icons: ['seedling', 'herb', 'sunflower'], lines: ['A tiny | sprout.', 'It grows | bigger.', 'A big | flower!'] },
  { id: 'sleep', zh: '打哈欠到睡著', icons: ['yawning-face', 'bed', 'sleeping-face'], lines: ['A big | yawn!', 'Into | bed.', 'Zzz... | sleeping!'] },
  { id: 'day', zh: '早上到晚上', icons: ['sunrise', 'sun', 'crescent-moon'], lines: ['Good | morning!', 'It is | day.', 'Good | night!'] },
  // 4 級
  { id: 'chicken', zh: '蛋到大雞（四步）', icons: ['egg', 'hatching-chick', 'baby-chick', 'chicken'], lines: ['An | egg.', 'Crack, | crack!', 'A baby | chick.', 'A big | chicken!'] },
  { id: 'weather', zh: '晴天到彩虹（四步）', icons: ['sun', 'cloud', 'cloud-with-rain', 'rainbow'], lines: ['A sunny | day.', 'Clouds | come.', 'Rain | falls.', 'A | rainbow!'] },
  { id: 'plant', zh: '發芽到花束（四步）', icons: ['seedling', 'herb', 'tulip', 'bouquet'], lines: ['A tiny | sprout.', 'It grows | bigger.', 'A | flower!', 'Lots of | flowers!'] },
]

/** 原本的故事加上主題的故事（themes.ts）：台詞、家長區的名稱、概念都要對得到 */
export const ALL_STORIES: Story[] = [...STORIES, ...THEME_STORIES]

/** 不再出題的故事：家長區的舊紀錄還叫得出名字（不產生台詞、不算進熟練度） */
const RETIRED_STORIES: Story[] = [{ id: 'bed', zh: '刷牙再睡覺（已拿掉）', icons: ['toothbrush', 'bed'], lines: [] }]

/**
 * 每一級出哪些故事：1 級簡單的兩步、2 級比較難的兩步、3 級三步、4 級四步。
 * 主題的故事只在那個主題的冒險裡出現（extra 是主題的故事 id），自由探索的題目和以前一樣。
 */
export function storiesFor(level: number, extra: readonly string[] = []): Story[] {
  const pool = ALL_STORIES.filter((s) => STORIES.includes(s) || extra.includes(s.id))
  if (level <= 1) return pool.filter((s) => s.icons.length === 2 && !s.hard)
  if (level === 2) return pool.filter((s) => s.icons.length === 2 && s.hard)
  if (level === 3) return pool.filter((s) => s.icons.length === 3)
  return pool.filter((s) => s.icons.length === 4)
}

/** 排順序挑故事：主題式冒險先挑主題的故事（這一級有的話），其餘照 pickTarget */
export function pickStory(level: number, recent: Story[]): Story {
  const extra = themeNow()?.stories ?? []
  const pool = storiesFor(level, extra)
  return pickPreferred(pool.filter((s) => extra.includes(s.id)), pool, seqSkill, recent)
}

export const seqSkill = (s: Story) => `seq:${s.id}`
export const story = (id: string) => ALL_STORIES.find((s) => s.id === id) ?? RETIRED_STORIES.find((s) => s.id === id)

// ── 圖示 ───────────────────────────────────────────────────
/** 程式車庫用到的 Fluent Emoji（scripts/build-emoji.ts 會一起打包） */
export const CODE_ICONS = [
  'vertical-traffic-light', 'automobile', 'puzzle-piece', 'hatching-chick', BLOCK_ICON,
  ...TARGETS.map((t) => t.icon),
  ...PATTERN_TOKS.flatMap((t) => (t.v.t === 'emoji' ? [t.v.icon] : [])),
  ...ALL_STORIES.flatMap((s) => s.icons),
]
