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
  /** 卡盒裡有哪些箭頭：第 1 級只有一排路，所以只有左右 */
  palette: Dir[]
}

/** 每一級出哪幾種題目：1 級一排路只有左右、2 級上下左右、3 級兩張卡、4 級三張卡（可能有樹擋路） */
export function driveSkills(level: number): string[] {
  if (level <= 1) return ['arrow:left', 'arrow:right']
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
    // 1 級：一排三格、車子在中間，左右都開得動，才是真的在選方向
    const one = level <= 1 && (dir === 'left' || dir === 'right')
    const cols = 3
    const rows = one ? 1 : 3
    const start = { x: 1, y: one ? 0 : 1 }
    const base = { skill, cols, rows, start, goal: stepOf(start, dir), blocks: [], target, palette: one ? (['left', 'right'] as Dir[]) : DIRS }
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
// 規律的單位：AB → 車、恐龍、車、恐龍…；ABC 是三個一組。前面幾級用差很多的圖，最高級用同一類的圖
export type PatternKind = 'AB' | 'AABB' | 'AAB' | 'ABB' | 'ABC'
export const PATTERN_ZH: Record<PatternKind, string> = { AB: 'ABAB', AABB: 'AABB', AAB: 'AAB', ABB: 'ABB', ABC: 'ABC' }

/** thing：主題式冒險補的生活用品（雨傘、氣球），只在主題裡優先出，一般的規律題不會特別挑它們 */
type Theme = 'vehicle' | 'animal' | 'food' | 'arrow' | 'shape' | 'thing'
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
]

/** 每一級會出哪些規律 */
function patternKinds(level: number): PatternKind[] {
  if (level <= 1) return ['AB']
  if (level === 2) return ['AB', 'AABB']
  return ['AB', 'AABB', 'AAB', 'ABB', 'ABC']
}

/** 題目先排出幾個：一般停在一組剛好結束的地方；4 級停在一組的中間，要看得更仔細 */
const SHOWN: Record<PatternKind, [number, number]> = { AB: [4, 5], AABB: [6, 5], AAB: [5, 4], ABB: [5, 4], ABC: [5, 4] }

/**
 * 挑這一題的圖：低難度兩張圖來自不同類（車 vs 恐龍），4 級同一類（車 vs 公車）。
 * 主題式冒險：主題的圖先放（公車旅行：Bus! Star! Bus! Star!），一樣守「低難度不同類、4 級同一類」的規則。
 */
function pickMembers(kind: PatternKind, level: number): PatternTok[] {
  const k = new Set(kind).size
  const themes: Theme[] = level <= 1 ? ['vehicle', 'animal', 'food'] : level === 2 ? ['vehicle', 'animal', 'food', 'shape'] : ['vehicle', 'animal', 'food', 'shape', 'arrow']
  const fav = shuffle(PATTERN_TOKS.filter((t) => themeNow()?.pattern.includes(t.id)))
  if (level >= 4) {
    const mine = fav.filter((t) => themes.includes(t.theme))
    const th = mine.length ? mine[0].theme : pick(themes)
    const same = PATTERN_TOKS.filter((t) => t.theme === th)
    return [...mine.filter((t) => t.theme === th), ...shuffle(same.filter((t) => !mine.includes(t)))].slice(0, k)
  }
  const out: PatternTok[] = []
  for (const t of fav) if (out.length < k && !out.some((o) => o.theme === t.theme)) out.push(t)
  for (const th of shuffle(themes.filter((x) => !out.some((o) => o.theme === x)))) if (out.length < k) out.push(pick(PATTERN_TOKS.filter((t) => t.theme === th)))
  return out
}

/** 規律的一列（用來畫題目和教學卡） */
export function patternRow(kind: PatternKind, members: PatternTok[], n: number): PatternTok[] {
  const idx = (ch: string) => ch.charCodeAt(0) - 65
  return Array.from({ length: n }, (_, i) => members[idx(kind[i % kind.length])])
}

/** 找規律：排出一列，問「下一個是什麼？」；選項是規律裡的圖，3 選 1 時再加一個沒出現過的 */
export function cPattern(level: number, recent: string[]): ChoiceItem {
  const kinds = patternKinds(level)
  const kind = pickTarget(kinds, (k) => `pattern:${k}`, kinds.length > 1 ? kinds.filter((k) => recent.some((r) => r.startsWith(`${k}:`))) : [])
  const members = pickMembers(kind, level)
  const n = SHOWN[kind][level >= 4 ? 1 : 0]
  const row = patternRow(kind, members, n)
  const ans = patternRow(kind, members, n + 1)[n]
  // 1 級 2 選 1（就是規律裡的兩張），之後 3 選 1
  const nOpts = level <= 1 ? 2 : 3
  const others = members.filter((m) => m.id !== ans.id)
  const foreign = PATTERN_TOKS.filter((t) => !members.includes(t) && (level >= 3 ? t.theme === ans.theme || t.theme === others[0]?.theme : t.theme !== 'arrow'))
  const opts = [ans, ...others, ...sample(foreign.length ? foreign : PATTERN_TOKS.filter((t) => !members.includes(t)), nOpts)].slice(0, nOpts)
  // 一起練的教學卡：用最基本的長度（剛好結束一組）指著念，最後一個就是答案
  const basic = SHOWN[kind][0]
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
// 洗澡和刷牙誰先、早餐吃什麼這類每家不一樣的，不放進來
export interface Story {
  id: string
  zh: string
  icons: string[]
  /** 每一張圖的旁白（英文，一張一句） */
  lines: string[]
  /** 2 級放比較容易的三步故事；3 級才出全部 */
  easy?: boolean
}

export const STORIES: Story[] = [
  { id: 'shoes', zh: '先穿襪子再穿鞋', icons: ['socks', 'running-shoe'], lines: ['First, | socks.', 'Then, | shoes!'] },
  { id: 'rain', zh: '下雨後出彩虹', icons: ['cloud-with-rain', 'rainbow'], lines: ['First, | rain.', 'Then, a | rainbow!'] },
  { id: 'bug', zh: '毛毛蟲變蝴蝶', icons: ['bug', 'butterfly'], lines: ['First, a | caterpillar.', 'Then, a | butterfly!'] },
  { id: 'bed', zh: '刷牙再睡覺', icons: ['toothbrush', 'bed'], lines: ['First, brush your | teeth.', 'Then, go to | bed!'] },
  { id: 'dino', zh: '恐龍蛋孵出恐龍', icons: ['egg', 'sauropod'], lines: ['First, an | egg.', 'Then, a baby | dinosaur!'] },

  { id: 'chick', zh: '蛋孵出小雞', icons: ['egg', 'hatching-chick', 'baby-chick'], lines: ['First, an | egg.', 'Crack, | crack!', 'Hello, baby | chick!'], easy: true },
  { id: 'clouds', zh: '雲到彩虹（三步）', icons: ['cloud', 'cloud-with-rain', 'rainbow'], lines: ['Clouds | come.', 'Rain | falls.', 'A | rainbow!'], easy: true },
  { id: 'flower', zh: '發芽到開花', icons: ['seedling', 'herb', 'sunflower'], lines: ['A tiny | sprout.', 'It grows | bigger.', 'A big | flower!'], easy: true },
  { id: 'sleep', zh: '打哈欠到睡著', icons: ['yawning-face', 'bed', 'sleeping-face'], lines: ['A big | yawn!', 'Into | bed.', 'Zzz... | sleeping!'] },
  { id: 'day', zh: '早上到晚上', icons: ['sunrise', 'sun', 'crescent-moon'], lines: ['Good | morning!', 'It is | day.', 'Good | night!'] },

  { id: 'chicken', zh: '蛋到大雞（四步）', icons: ['egg', 'hatching-chick', 'baby-chick', 'chicken'], lines: ['An | egg.', 'Crack, | crack!', 'A baby | chick.', 'A big | chicken!'] },
  { id: 'weather', zh: '晴天到彩虹（四步）', icons: ['sun', 'cloud', 'cloud-with-rain', 'rainbow'], lines: ['A sunny | day.', 'Clouds | come.', 'Rain | falls.', 'A | rainbow!'] },
  { id: 'plant', zh: '發芽到花束（四步）', icons: ['seedling', 'herb', 'tulip', 'bouquet'], lines: ['A tiny | sprout.', 'It grows | bigger.', 'A | flower!', 'Lots of | flowers!'] },
]

/** 原本的故事加上主題的故事（themes.ts）：台詞、家長區的名稱、概念都要對得到 */
export const ALL_STORIES: Story[] = [...STORIES, ...THEME_STORIES]

/**
 * 每一級出幾步的故事：1 級兩步、2 級簡單的三步、3 級全部三步、4 級四步。
 * 主題的故事只在那個主題的冒險裡出現（extra 是主題的故事 id），自由探索的題目和以前一樣。
 */
export function storiesFor(level: number, extra: readonly string[] = []): Story[] {
  const pool = ALL_STORIES.filter((s) => STORIES.includes(s) || extra.includes(s.id))
  if (level <= 1) return pool.filter((s) => s.icons.length === 2)
  if (level === 2) return pool.filter((s) => s.icons.length === 3 && s.easy)
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
export const story = (id: string) => ALL_STORIES.find((s) => s.id === id)

// ── 圖示 ───────────────────────────────────────────────────
/** 程式車庫用到的 Fluent Emoji（scripts/build-emoji.ts 會一起打包） */
export const CODE_ICONS = [
  'vertical-traffic-light', 'automobile', 'puzzle-piece', 'hatching-chick', BLOCK_ICON,
  ...TARGETS.map((t) => t.icon),
  ...PATTERN_TOKS.flatMap((t) => (t.v.t === 'emoji' ? [t.v.icon] : [])),
  ...ALL_STORIES.flatMap((s) => s.icons),
]
