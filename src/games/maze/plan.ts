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

export type MazeLevel = 1 | 2 | 3 | 4 | 5
export const MAZE_MAX: MazeLevel = 5
/**
 * 每一級：幾欄幾列、路上最多幾個岔路（走錯也走得進去的路口數）、從起點到終點至少經過幾格。
 * 橫的平板：欄 ≥ 列。最大 5×5（家長：「最多約 5×5」）。
 */
export const MAZE_LEVELS: Record<MazeLevel, { cols: number; rows: number; choices: number; minLen: number }> = {
  1: { cols: 3, rows: 3, choices: 1, minLen: 5 },
  2: { cols: 4, rows: 3, choices: 1, minLen: 6 },
  3: { cols: 4, rows: 4, choices: 2, minLen: 7 },
  4: { cols: 5, rows: 4, choices: 2, minLen: 8 },
  5: { cols: 5, rows: 5, choices: 3, minLen: 9 },
}
export const MAZE_GAME = 'logic-maze'
/** 作答紀錄的技能：maze:3x3、maze:4x3… */
export const mazeSkill = (level: MazeLevel) => `maze:${MAZE_LEVELS[level].cols}x${MAZE_LEVELS[level].rows}`
/**
 * 走完一個算「第一次就對」：沒有靠發呆提示、走的步數 ≤ 最短的 ＋ DETOUR（走進岔路一格再回來可以）。撞牆不算錯、不計時。
 * 升降級照邏輯遊戲同一套（sort-plan 的 stepLevel）。
 */
export const DETOUR = 2
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

/** 深度優先挖洞：從隨機一格出發，每一格都走得到、任兩格之間剛好一條路 */
export function carve(cols: number, rows: number, rnd: Rnd = Math.random): number[] {
  const links = Array<number>(cols * rows).fill(0)
  const seen = Array<boolean>(cols * rows).fill(false)
  const first = ri(cols * rows, rnd)
  const stack = [first]
  seen[first] = true
  while (stack.length) {
    const c = stack[stack.length - 1]
    const opts = [0, 1, 2, 3].filter((d) => {
      const nb = step(cols, rows, c, d)
      return nb >= 0 && !seen[nb]
    })
    if (!opts.length) {
      stack.pop()
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

/**
 * 出一個迷宮：大小照級數，路夠長、岔路不超過這一級的上限，不跟最近幾個一樣；起點、終點、主題、終點的東西、恐龍都隨機
 * （主題、終點的東西不跟上一次一樣）。找不到完全符合的（極少見）：用岔路最少、路夠長的那一個。
 */
export function makeMaze(level: MazeLevel, recent: { sigs?: readonly string[]; theme?: string; goal?: string } = {}, rnd: Rnd = Math.random): Maze {
  const { cols, rows, choices, minLen } = MAZE_LEVELS[level]
  const avoid = new Set((recent.sigs ?? []).slice(-RECENT_MAZES))
  let best: { links: number[]; start: number; goal: number; path: number[]; score: number } | null = null
  for (let k = 0; k < 400; k++) {
    const links = carve(cols, rows, rnd)
    const start = ri(cols * rows, rnd)
    const dist = distances({ cols, rows, links }, start)
    const far = dist.map((d, c) => [d, c] as const).filter(([d]) => d + 1 >= minLen)
    if (!far.length) continue
    const goal = pick(far, rnd)[1]
    const path = shortest({ cols, rows, links }, start, goal)
    const ch = choicesOf(links, path)
    const sig = sigOf(cols, rows, links, start, goal)
    if (avoid.has(sig)) continue
    if (ch <= choices) {
      best = { links, start, goal, path, score: 0 }
      break
    }
    if (!best || ch < best.score) best = { links, start, goal, path, score: ch }
  }
  // 理論上一定找得到（400 次）；保險：一條直直的蛇形路
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
    best = { links, start: 0, goal, path: shortest({ cols, rows, links }, 0, goal), score: 0 }
  }
  const theme = pick(THEME_IDS.filter((t) => t !== recent.theme), rnd)
  const goalId = pick(GOAL_IDS.filter((g) => g !== recent.goal), rnd)
  return { level, cols, rows, links: best.links, start: best.start, goal: best.goal, path: best.path, theme, goalId, dino: pick(DINOS, rnd), sig: sigOf(cols, rows, best.links, best.start, best.goal) }
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

/** 走完一個：記住這個迷宮、照結果升降級 */
export function afterMaze(s: MazeState, m: Pick<Maze, 'sig' | 'theme' | 'goalId'>, r: { date: string; ok: boolean; counted: boolean }): MazeState {
  const sigs = [...s.sigs.filter((x) => x !== m.sig), m.sig].slice(-RECENT_MAZES)
  const lv = stepLevel(s, { date: r.date, first: r.ok, counted: r.counted }, MAZE_MAX)
  return { ...s, ...lv, sigs, theme: m.theme, goal: m.goalId }
}

/** 這一個算不算「第一次就對」 */
export const mazeOk = (r: { steps: number; shortest: number; led: boolean }) => !r.led && r.steps <= r.shortest + DETOUR
