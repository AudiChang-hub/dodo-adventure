// 迷宮（T-156，家長 2026-11-16 要求「每次打開都不一樣」）：產生迷宮、級數、進度。只有純函式，scripts/test-puzzle-maze.ts 直接測；畫面在 ./Maze.tsx。
// 每次用程式隨機產生（深度優先挖洞的「完美迷宮」：任兩格之間剛好一條路，一定走得到終點），不照任何現成 App 的關卡。
// T-152 設計稿原本因為「規劃路線是 4 歲目標」不做迷宮；家長這次明確要求，難度從 3 歲做得到的開始：3×3、走道很寬、岔路最多 1 個。
import { stepLevel, type LevelState } from '../logic/sort-plan'
import type { Speaker } from '../../content/registry'

/** 上、右、下、左 */
export const DX = [0, 1, 0, -1]
export const DY = [-1, 0, 1, 0]
const BIT = [1, 2, 4, 8]
const OPP = [2, 3, 0, 1]

export type MazeLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export const MAZE_MAX: MazeLevel = 10
/** 4～5 歲的玩法（只在最高 2 級）：key 先拿鑰匙才打得開終點、stars 沿路收集星星才到得了終點 */
export type MazeExtra = 'key' | 'stars'
export interface MazeLevelSpec {
  cols: number
  rows: number
  /** 路上岔路（走錯也走得進去的路口數）最多幾個 */
  choices: number
  /** 路上岔路至少幾個（第 6 級以上：越高死路越多） */
  minChoices?: number
  /** 從起點到終點至少經過幾格（含頭尾） */
  minLen: number
  /** 路上至少轉幾個彎 */
  minTurns?: number
  /** 挖洞時多常跳回之前的格子另外開一條路（0 = 一路挖到底，長走廊；越大岔路、死路越多） */
  branchy?: number
  /** 走完算「第一次就對」可以多走幾步（走進岔路再回來） */
  detour: number
  extra?: MazeExtra
}
/** 第一次就對可以多走幾步（第 1～5 級） */
export const DETOUR = 2
/**
 * 每一級：幾欄幾列、岔路幾個、路至少多長、至少幾個彎。橫的平板：欄 ≥ 列。
 * 1～5 級（T-156，3 歲）：最大 5×5、岔路最多 3 個。
 * 6～10 級（T-158，家長 2026-11-16：「迷宮太簡單了，大概可以玩到 4 歲或 5 歲的」）：長方形排滿橫的平板，最大 10×7（平板上一格約 75px）；
 * 岔路、死路、轉彎越來越多，路越來越長；第 9 級先拿鑰匙、第 10 級收集 3 顆星星。
 */
export const MAZE_LEVELS: Record<MazeLevel, MazeLevelSpec> = {
  1: { cols: 3, rows: 3, choices: 1, minLen: 5, detour: DETOUR },
  2: { cols: 4, rows: 3, choices: 1, minLen: 6, detour: DETOUR },
  3: { cols: 4, rows: 4, choices: 2, minLen: 7, detour: DETOUR },
  4: { cols: 5, rows: 4, choices: 2, minLen: 8, detour: DETOUR },
  5: { cols: 5, rows: 5, choices: 3, minLen: 9, detour: DETOUR },
  6: { cols: 6, rows: 5, minChoices: 2, choices: 5, minLen: 12, minTurns: 6, branchy: 0.25, detour: 4 },
  7: { cols: 7, rows: 5, minChoices: 3, choices: 6, minLen: 15, minTurns: 8, branchy: 0.25, detour: 4 },
  8: { cols: 8, rows: 5, minChoices: 4, choices: 7, minLen: 17, minTurns: 9, branchy: 0.25, detour: 6 },
  9: { cols: 9, rows: 6, minChoices: 4, choices: 8, minLen: 18, minTurns: 10, branchy: 0.25, detour: 6, extra: 'key' },
  10: { cols: 10, rows: 7, minChoices: 5, choices: 10, minLen: 20, minTurns: 11, branchy: 0.25, detour: 8, extra: 'stars' },
}
/** 收集幾顆星星（第 10 級） */
export const STAR_COUNT = 3
/** 鑰匙、星星離主要的路至少幾格（要繞進岔路才拿得到） */
export const ITEM_OFF = 2
export const MAZE_GAME = 'logic-maze'
/** 作答紀錄的技能：maze:3x3、maze:4x3… */
export const mazeSkill = (level: MazeLevel) => `maze:${MAZE_LEVELS[level].cols}x${MAZE_LEVELS[level].rows}`
/**
 * 走完一個算「第一次就對」：沒有靠發呆提示、走的步數 ≤ 最短的 ＋ 這一級的 detour（走進岔路一格再回來可以）。撞牆不算錯、畫面上不計時。
 * 升降級（T-158）：「順利」走完（第一次就對、而且沒有走很久，mazeSmooth）直接升一級；其他照邏輯遊戲同一套（sort-plan 的 stepLevel）。
 */
/** 記住最近幾個迷宮：新的不跟這幾個一樣 */
export const RECENT_MAZES = 5

/** 主題：背景、裝飾（Fluent Emoji，App 已經有的那一套），畫面在 ./Maze.tsx 的 THEME_LOOK */
export type ThemeId = 'forest' | 'sea' | 'snow' | 'garden'
export const THEME_IDS: ThemeId[] = ['forest', 'sea', 'snow', 'garden']
export const THEME_DECO: Record<ThemeId, string[]> = {
  forest: ['deciduous-tree', 'evergreen-tree', 'mushroom', 'herb'],
  sea: ['tropical-fish', 'octopus', 'crab', 'dolphin'],
  snow: ['snowman', 'snowflake', 'evergreen-tree', 'penguin'],
  garden: ['tulip', 'sunflower', 'blossom', 'seedling'],
}
/** 終點：恐龍要去拿的東西（Fluent Emoji） */
export type GoalId = 'apple' | 'strawberry' | 'banana' | 'watermelon' | 'cookie' | 'cupcake' | 'eggs' | 'carrot'
export const GOALS: Record<GoalId, { icon: string; find: string; got: string }> = {
  apple: { icon: 'red-apple', find: 'Find the apple!', got: 'Yum! An apple!' },
  strawberry: { icon: 'strawberry', find: 'Find the strawberry!', got: 'Yum! A strawberry!' },
  banana: { icon: 'banana', find: 'Find the banana!', got: 'Yum! A banana!' },
  watermelon: { icon: 'watermelon', find: 'Find the watermelon!', got: 'Yum! Watermelon!' },
  cookie: { icon: 'cookie', find: 'Find the cookie!', got: 'Yum! A cookie!' },
  cupcake: { icon: 'cupcake', find: 'Find the cupcake!', got: 'Yum! A cupcake!' },
  eggs: { icon: 'nest-with-eggs', find: 'Find the eggs!', got: 'The eggs! Hooray!' },
  carrot: { icon: 'carrot', find: 'Find the carrot!', got: 'Yum! A carrot!' },
}
export const GOAL_IDS = Object.keys(GOALS) as GoalId[]
export const DINOS: Speaker[] = ['dodo', 'bobo', 'momo']

export interface Maze {
  level: MazeLevel
  cols: number
  rows: number
  /** 每一格往哪幾個方向是通的（位元：1 上、2 右、4 下、8 左）；格子編號 = 列 × cols + 欄 */
  links: number[]
  start: number
  goal: number
  /** 最短的路（起點到終點，含頭尾） */
  path: number[]
  /** 第 9、10 級：鑰匙 key、星星 stars */
  extra?: MazeExtra
  /** 要先拿到的東西在哪幾格（鑰匙 1 格、星星 STAR_COUNT 格；沒有：空陣列） */
  items: number[]
  /** 拿完全部 items 再到終點最少要走幾步（沒有 items：path.length − 1） */
  tour: number
  theme: ThemeId
  goalId: GoalId
  dino: Speaker
  /** 同一個迷宮（大小、牆、起點、終點都一樣）才一樣 */
  sig: string
}

type Rnd = () => number
const ri = (n: number, rnd: Rnd) => Math.floor(rnd() * n) % n
const pick = <T,>(a: readonly T[], rnd: Rnd): T => a[ri(a.length, rnd)]

/** 往 d 走一步到哪一格（出界：-1） */
export function step(cols: number, rows: number, cell: number, d: number): number {
  const x = (cell % cols) + DX[d]
  const y = Math.floor(cell / cols) + DY[d]
  return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : y * cols + x
}

/** a、b 相鄰而且中間沒有牆 */
export function linked(m: Pick<Maze, 'cols' | 'rows' | 'links'>, a: number, b: number): boolean {
  for (let d = 0; d < 4; d++) if (step(m.cols, m.rows, a, d) === b) return (m.links[a] & BIT[d]) !== 0
  return false
}

/** a 到 b 是哪個方向（不相鄰：-1） */
export function dirOf(cols: number, rows: number, a: number, b: number): number {
  for (let d = 0; d < 4; d++) if (step(cols, rows, a, d) === b) return d
  return -1
}

export const degree = (links: number[], c: number) => BIT.filter((b) => links[c] & b).length

/**
 * 挖洞：從隨機一格出發，每一格都走得到、任兩格之間剛好一條路。
 * branchy = 0：深度優先（一路挖到底，長走廊、岔路少）；branchy > 0（T-158）：有這個機率改從之前挖過的任一格再開一條路，岔路、死路比較多。
 */
export function carve(cols: number, rows: number, rnd: Rnd = Math.random, branchy = 0): number[] {
  const links = Array<number>(cols * rows).fill(0)
  const seen = Array<boolean>(cols * rows).fill(false)
  const first = ri(cols * rows, rnd)
  const stack = [first]
  seen[first] = true
  while (stack.length) {
    const at = branchy > 0 && rnd() < branchy ? ri(stack.length, rnd) : stack.length - 1
    const c = stack[at]
    const opts = [0, 1, 2, 3].filter((d) => {
      const nb = step(cols, rows, c, d)
      return nb >= 0 && !seen[nb]
    })
    if (!opts.length) {
      stack.splice(at, 1)
      continue
    }
    const d = pick(opts, rnd)
    const nb = step(cols, rows, c, d)
    links[c] |= BIT[d]
    links[nb] |= BIT[OPP[d]]
    seen[nb] = true
    stack.push(nb)
  }
  return links
}

/** 從 from 出發每一格要走幾步（走不到：-1） */
export function distances(m: Pick<Maze, 'cols' | 'rows' | 'links'>, from: number): number[] {
  const dist = Array<number>(m.cols * m.rows).fill(-1)
  dist[from] = 0
  const q = [from]
  while (q.length) {
    const c = q.shift()!
    for (let d = 0; d < 4; d++) {
      if (!(m.links[c] & BIT[d])) continue
      const nb = step(m.cols, m.rows, c, d)
      if (nb >= 0 && dist[nb] < 0) {
        dist[nb] = dist[c] + 1
        q.push(nb)
      }
    }
  }
  return dist
}

/** 最短的路（含頭尾）；走不到是空陣列 */
export function shortest(m: Pick<Maze, 'cols' | 'rows' | 'links'>, a: number, b: number): number[] {
  const dist = distances(m, b)
  if (dist[a] < 0) return []
  const out = [a]
  let c = a
  while (c !== b) {
    let nx = -1
    for (let d = 0; d < 4; d++) {
      const nb = step(m.cols, m.rows, c, d)
      if (nb >= 0 && m.links[c] & BIT[d] && dist[nb] === dist[c] - 1) nx = nb
    }
    if (nx < 0) return []
    out.push(nx)
    c = nx
  }
  return out
}

/** 現在在 from，往終點的下一格（發呆提示「往這裡走」）；已經在終點：-1 */
export function nextToward(m: Pick<Maze, 'cols' | 'rows' | 'links' | 'goal'>, from: number): number {
  const p = shortest(m, from, m.goal)
  return p.length > 1 ? p[1] : -1
}

/** 路上有幾個岔路：路上每一格（終點除外）除了來的路、往前的路，還多幾個開口 */
export function choicesOf(links: number[], path: number[]): number {
  let n = 0
  for (let i = 0; i < path.length - 1; i++) n += Math.max(0, degree(links, path[i]) - (i === 0 ? 1 : 2))
  return n
}

export const sigOf = (cols: number, rows: number, links: number[], start: number, goal: number) => `${cols}x${rows}:${links.map((x) => x.toString(16)).join('')}:${start}>${goal}`

/** 路上轉幾個彎 */
export function turnsOf(cols: number, rows: number, path: number[]): number {
  let n = 0
  for (let i = 1; i < path.length - 1; i++) if (dirOf(cols, rows, path[i - 1], path[i]) !== dirOf(cols, rows, path[i], path[i + 1])) n++
  return n
}

/** 每一格離 path 幾格、從 path 上哪一格岔出去（完美迷宮是一棵樹：每一格都走得到） */
export function offPath(m: Pick<Maze, 'cols' | 'rows' | 'links'>, path: number[]): { off: number[]; root: number[] } {
  const n = m.cols * m.rows
  const off = Array<number>(n).fill(-1)
  const root = Array<number>(n).fill(-1)
  const q = [...path]
  for (const c of path) {
    off[c] = 0
    root[c] = c
  }
  while (q.length) {
    const c = q.shift()!
    for (let d = 0; d < 4; d++) {
      if (!(m.links[c] & BIT[d])) continue
      const nb = step(m.cols, m.rows, c, d)
      if (nb >= 0 && off[nb] < 0) {
        off[nb] = off[c] + 1
        root[nb] = root[c]
        q.push(nb)
      }
    }
  }
  return { off, root }
}

/** 所有排列（items 最多 3 個） */
function perms<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a]
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]))
}

/** 從 from 出發，拿完 items（順序不拘）再到 goal 最少幾步，和最好的順序 */
export function bestTour(m: Pick<Maze, 'cols' | 'rows' | 'links'>, from: number, items: number[], goal: number): { len: number; order: number[] } {
  const dist = new Map<number, number[]>()
  const d = (a: number, b: number) => {
    if (!dist.has(a)) dist.set(a, distances(m, a))
    return dist.get(a)![b]
  }
  let best = { len: Infinity, order: [] as number[] }
  for (const order of perms(items)) {
    let len = 0
    let c = from
    for (const x of [...order, goal]) {
      len += d(c, x)
      c = x
    }
    if (len < best.len) best = { len, order }
  }
  return best
}

/** 還沒拿的東西（got：已經拿到的格子） */
export const leftItems = (m: Pick<Maze, 'items'>, got: readonly number[]) => m.items.filter((c) => !got.includes(c))
/** 東西都拿到了：走到終點就算走完 */
export const readyFor = (m: Pick<Maze, 'items'>, got: readonly number[]) => leftItems(m, got).length === 0

/** 現在要去哪一格：還有東西沒拿就去最順路的那一個，拿完了去終點 */
export function targetOf(m: Pick<Maze, 'cols' | 'rows' | 'links' | 'goal' | 'items'>, at: number, got: readonly number[]): number {
  const left = leftItems(m, got)
  return left.length ? bestTour(m, at, left, m.goal).order[0] : m.goal
}

/** 發呆提示、示範「往這裡走」：往現在要去的那一格走的下一格；已經在終點而且東西都拿了：-1 */
export function nextStep(m: Pick<Maze, 'cols' | 'rows' | 'links' | 'goal' | 'items'>, at: number, got: readonly number[]): number {
  const p = shortest(m, at, targetOf(m, at, got))
  return p.length > 1 ? p[1] : -1
}

/**
 * 第 9、10 級要先拿的東西放哪：不在主要的路上（離路 ≥ ITEM_OFF 格，要轉進岔路才拿得到），從路上起點、終點以外的地方岔出去；
 * 盡量放在死路的盡頭。星星彼此至少隔 3 格。放不下：null（換一個迷宮）。
 */
export function placeItems(m: Pick<Maze, 'cols' | 'rows' | 'links'>, path: number[], extra: MazeExtra, rnd: Rnd): number[] | null {
  const { off, root } = offPath(m, path)
  const start = path[0]
  const goal = path[path.length - 1]
  const cells = Array.from({ length: m.cols * m.rows }, (_, c) => c).filter((c) => off[c] >= ITEM_OFF && root[c] !== start && root[c] !== goal)
  const ends = cells.filter((c) => degree(m.links, c) === 1)
  const need = extra === 'key' ? 1 : STAR_COUNT
  const pool = ends.length >= need ? ends : cells
  if (extra === 'key') return pool.length ? [pick(pool, rnd)] : null
  const out: number[] = []
  const left = [...pool]
  while (out.length < need && left.length) {
    const c = left.splice(ri(left.length, rnd), 1)[0]
    if (out.every((x) => distances(m, x)[c] >= 3)) out.push(c)
  }
  return out.length === need ? out : null
}

/** 這一個符不符合這一級的設定：路夠長、岔路和轉彎在範圍內 */
export function fitsLevel(level: MazeLevel, m: Pick<Maze, 'cols' | 'rows' | 'links' | 'path'>): boolean {
  const L = MAZE_LEVELS[level]
  const ch = choicesOf(m.links, m.path)
  return m.path.length >= L.minLen && ch <= L.choices && ch >= (L.minChoices ?? 0) && turnsOf(m.cols, m.rows, m.path) >= (L.minTurns ?? 0)
}

/**
 * 出一個迷宮：大小照級數，路夠長、岔路和轉彎在這一級的範圍內，不跟最近幾個一樣；起點、終點、主題、終點的東西、恐龍都隨機
 * （主題、終點的東西不跟上一次一樣）。第 9、10 級另外放鑰匙／星星。找不到完全符合的（極少見）：用最接近的那一個。
 */
export function makeMaze(level: MazeLevel, recent: { sigs?: readonly string[]; theme?: string; goal?: string } = {}, rnd: Rnd = Math.random): Maze {
  const L = MAZE_LEVELS[level]
  const { cols, rows, choices, minLen } = L
  // 第 9、10 級的 sig 後面多了鑰匙、星星的位置：比的時候只比迷宮本身
  const avoid = new Set((recent.sigs ?? []).slice(-RECENT_MAZES).map((x) => x.split(':').slice(0, 3).join(':')))
  /** 差多少才符合（0 = 符合；路長在挑終點時就保證了） */
  const miss = (links: number[], path: number[]) => {
    const ch = choicesOf(links, path)
    return Math.max(0, ch - choices) + Math.max(0, (L.minChoices ?? 0) - ch) + Math.max(0, (L.minTurns ?? 0) - turnsOf(cols, rows, path))
  }
  let best: { links: number[]; start: number; goal: number; path: number[]; items: number[]; score: number } | null = null
  const tries = level > 5 ? 1500 : 400
  for (let k = 0; k < tries; k++) {
    const links = carve(cols, rows, rnd, L.branchy ?? 0)
    const start = ri(cols * rows, rnd)
    const dist = distances({ cols, rows, links }, start)
    const far = dist.map((d, c) => [d, c] as const).filter(([d]) => d + 1 >= minLen)
    if (!far.length) continue
    const goal = pick(far, rnd)[1]
    const path = shortest({ cols, rows, links }, start, goal)
    const sig = sigOf(cols, rows, links, start, goal)
    if (avoid.has(sig)) continue
    const score = miss(links, path)
    if (best && score >= best.score) continue
    let items: number[] = []
    if (L.extra) {
      const placed = placeItems({ cols, rows, links }, path, L.extra, rnd)
      if (!placed) continue
      items = placed
    }
    best = { links, start, goal, path, items, score }
    if (score === 0) break
  }
  // 理論上一定找得到；保險：一條直直的蛇形路（沒有岔路，第 9、10 級就不放鑰匙、星星）
  if (!best) {
    const links = Array<number>(cols * rows).fill(0)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const c = y * cols + x
        if (x < cols - 1) (links[c] |= 2), (links[c + 1] |= 8)
      }
    for (let y = 0; y < rows - 1; y++) {
      const x = y % 2 ? 0 : cols - 1
      links[y * cols + x] |= 4
      links[(y + 1) * cols + x] |= 1
    }
    const goal = (rows - 1) * cols + (rows % 2 ? cols - 1 : 0)
    best = { links, start: 0, goal, path: shortest({ cols, rows, links }, 0, goal), items: [], score: 0 }
  }
  const theme = pick(THEME_IDS.filter((t) => t !== recent.theme), rnd)
  const goalId = pick(GOAL_IDS.filter((g) => g !== recent.goal), rnd)
  const { links, start, goal, path, items } = best
  const tour = items.length ? bestTour({ cols, rows, links }, start, items, goal).len : path.length - 1
  return {
    level,
    cols,
    rows,
    links,
    start,
    goal,
    path,
    ...(items.length && L.extra ? { extra: L.extra } : {}),
    items,
    tour,
    theme,
    goalId,
    dino: pick(DINOS, rnd),
    sig: sigOf(cols, rows, links, start, goal) + (items.length ? `:${items.join('.')}` : ''),
  }
}

/**
 * 手指（或點的那一格）在 target：從 at 沿著通的路走過去要經過哪幾格（不含 at）。走不過去（隔著牆、不在同一條直路上）：空陣列。
 * - 相鄰而且通：走一步。
 * - 同一列／同一欄、中間每一格都通：一路走過去（手指拖得快、一下跨過兩格）。
 * - 斜對角：先橫再直或先直再橫，有一條通就走（手指在轉角切過去）。
 */
export function walkTo(m: Pick<Maze, 'cols' | 'rows' | 'links'>, at: number, target: number): number[] {
  if (at === target || target < 0) return []
  const ax = at % m.cols
  const ay = Math.floor(at / m.cols)
  const tx = target % m.cols
  const ty = Math.floor(target / m.cols)
  const line = (from: number, fx: number, fy: number, gx: number, gy: number): number[] | null => {
    const out: number[] = []
    let c = from
    let x = fx
    let y = fy
    while (x !== gx || y !== gy) {
      const nx = x + Math.sign(gx - x)
      const ny = y + (nx === x ? Math.sign(gy - y) : 0)
      const nb = ny * m.cols + nx
      if (!linked(m, c, nb)) return null
      out.push(nb)
      c = nb
      x = nx
      y = ny
    }
    return out
  }
  if (ax === tx || ay === ty) return line(at, ax, ay, tx, ty) ?? []
  if (Math.abs(ax - tx) === 1 && Math.abs(ay - ty) === 1) {
    for (const [cx, cy] of [
      [tx, ay],
      [ax, ty],
    ]) {
      const corner = cy * m.cols + cx
      if (linked(m, at, corner) && linked(m, corner, target)) return [corner, target]
    }
  }
  return []
}

// ── 進度 ─────────────────────────────────────────────────────

export interface MazeState extends LevelState {
  /** 最近走過的迷宮（sigOf） */
  sigs: string[]
  theme?: string
  goal?: string
}

export function normalizeMaze(raw: unknown): MazeState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<MazeState>
  const level = Number.isInteger(o.level) ? Math.min(MAZE_MAX, Math.max(1, o.level as number)) : 1
  const recent = Array.isArray(o.recent) ? o.recent.filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date, ok: !!x.ok })) : []
  const taught = Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : []
  const sigs = Array.isArray(o.sigs) ? o.sigs.filter((x) => typeof x === 'string').slice(-RECENT_MAZES) : []
  return { level, recent, taught, sigs, ...(typeof o.theme === 'string' ? { theme: o.theme } : {}), ...(typeof o.goal === 'string' ? { goal: o.goal } : {}) }
}

/**
 * 走完一個：記住這個迷宮、照結果升降級。
 * T-158（家長 2026-11-16：孩子覺得太簡單）：自己走、順利走完（smooth：第一次就對、而且沒有走很久）直接升一級；
 * 其他照邏輯遊戲同一套（最近 8 個 7 個對、分 3 天升一級；最近 6 個 ≤ 3 個對退一級）。已經有的進度照用，不重設。
 */
export function afterMaze(s: MazeState, m: Pick<Maze, 'sig' | 'theme' | 'goalId'>, r: { date: string; ok: boolean; counted: boolean; smooth?: boolean }): MazeState {
  const sigs = [...s.sigs.filter((x) => x !== m.sig), m.sig].slice(-RECENT_MAZES)
  const lv = r.counted && r.ok && r.smooth && s.level < MAZE_MAX ? { ...s, level: s.level + 1, recent: [] } : stepLevel(s, { date: r.date, first: r.ok, counted: r.counted }, MAZE_MAX)
  return { ...s, ...lv, sigs, theme: m.theme, goal: m.goalId }
}

/** 孩子在「再一個」那裡自己選「難一點」：往上跳一級（最高 MAZE_MAX），這一級的紀錄重新算 */
export function harderMaze(s: MazeState): MazeState {
  return s.level >= MAZE_MAX ? s : { ...s, level: s.level + 1, recent: [] }
}

/** 這一個算不算「第一次就對」：沒靠提示、走的步數 ≤ 最短的 ＋ detour（第 1～5 級是 DETOUR） */
export const mazeOk = (r: { steps: number; shortest: number; led: boolean; detour?: number }) => !r.led && r.steps <= r.shortest + (r.detour ?? DETOUR)

/** 順利走完不算「走很久」：15 秒 ＋ 最短的每一步 2.5 秒（3×3 約 25 秒、10×7 拿星星約 1.5 分鐘）。畫面上不計時，只拿來決定要不要直接升級 */
export const SMOOTH_BASE_MS = 15_000
export const SMOOTH_STEP_MS = 2_500
export const mazeSmooth = (r: { ok: boolean; ms: number; shortest: number }) => r.ok && r.ms <= SMOOTH_BASE_MS + SMOOTH_STEP_MS * r.shortest

/**
 * 示範（手帶著恐龍走一步）只在新的玩法第一次出現時做：一般的迷宮教過一次就好（T-158 以前每一級都示範一次，示範的那一個不算升級），
 * 第 9 級的鑰匙、第 10 級的星星第一次各示範一次。
 */
export const demoKind = (level: MazeLevel) => MAZE_LEVELS[level].extra ?? 'plain'
export const needsDemo = (taught: readonly number[], level: MazeLevel) => !taught.some((l) => l >= 1 && l <= MAZE_MAX && demoKind(l as MazeLevel) === demoKind(level))
