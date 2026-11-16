// 拼圖（T-156，家長 2026-11-16 要求）的圖庫、出題、升降級。只有純函式，scripts/test-puzzle-maze.ts 直接測；畫面在 ./Puzzle.tsx。
// 圖全部是 App 自己的故事插畫（src/art/storybook：場景＋角色庫），用 StoryPage 畫，不照任何現成 App 的關卡或圖。
// 片數從 3 歲做得到的開始（指引 MA-6「積木、拼圖」）：2×2 四片 → 3×2 六片 → 3×3 九片（T-159，家長 2026-11-16）。片不旋轉。
// 拼盤只有空的虛線格子（家長 2026-11-16：底下有原圖等於只是對照位置），旁邊一張小的完整圖當參考（像拼圖盒上的圖）；
// 托盤跟拼盤一樣排成 cols×rows，但每一片都不在它自己的位置（右上那片不會放在托盤右上），稍微散開、不轉。
import { stepLevel, type LevelState } from '../logic/sort-plan'
import { PUZZLE_PICS, themeOf, type PuzzlePic } from './pics'

// 圖庫在 ./pics.ts（T-159 加到 200 張以上）
export { PUZZLE_PICS, themeOf, type PuzzlePic } from './pics'

export const picOf = (id: string) => PUZZLE_PICS.find((p) => p.id === id) ?? null

// ── 級數 ─────────────────────────────────────────────────────

export type PuzzleLevel = 1 | 2 | 3
export const PUZZLE_MAX: PuzzleLevel = 3
/** 每一級切幾片：1 → 2×2、2 → 3×2（橫的圖，多切一欄）、3 → 3×3（T-159） */
export const GRID: Record<PuzzleLevel, { cols: number; rows: number }> = { 1: { cols: 2, rows: 2 }, 2: { cols: 3, rows: 2 }, 3: { cols: 3, rows: 3 } }
/** 作答紀錄的技能：puzzle:4、puzzle:6、puzzle:9 */
export const puzzleSkill = (level: PuzzleLevel) => `puzzle:${GRID[level].cols * GRID[level].rows}`
export const PUZZLE_GAME = 'logic-puzzle'
/**
 * 一張拼完算「第一次就對」：放錯 ≤ 1 次、沒有手帶著放（3 歲試一個位置不對是正常的探索，FB-5 不扣分）。
 * 升級（T-159，家長 2026-11-16 要加快）：一張順利拼完（第一次就對、自己拼的，不是示範或發呆時手帶著的）就直接升一級。
 * 退級照邏輯遊戲同一套（sort-plan 的 stepLevel：最近 6 張 ≤ 3 張退級）。
 */
export const OK_WRONGS = 1
/** 記住最近幾張：新的一張不跟這幾張一樣（T-159 圖庫 200 張以上，從 5 張改成 10 張） */
export const RECENT_PICS = 10

type Rnd = () => number

/**
 * 挑一張圖：不在最近幾張裡，也不跟上一張同一個主題（場景）。
 * 圖庫比最近幾張多得多，一定挑得到；萬一都用過了，至少不跟上一張一樣。
 */
export function pickPic(recent: readonly string[], rnd: Rnd = Math.random): PuzzlePic {
  const last = recent.slice(-RECENT_PICS)
  const prev = picOf(recent[recent.length - 1] ?? '')
  let pool = PUZZLE_PICS.filter((p) => !last.includes(p.id) && (!prev || themeOf(p) !== themeOf(prev)))
  if (!pool.length) pool = PUZZLE_PICS.filter((p) => !last.includes(p.id))
  if (!pool.length) pool = PUZZLE_PICS.filter((p) => p.id !== recent[recent.length - 1])
  return pool[Math.floor(rnd() * pool.length) % pool.length]
}

/**
 * 托盤裡片的順序（托盤的第 k 格放第 o[k] 片）：洗牌，而且每一片都不在跟拼盤一樣的位置（o[k] ≠ k）。
 * 托盤排得跟拼盤一樣（cols×rows），所以「右上那片放在托盤右上」照搬過去就好、不用看圖，要避開。
 */
export function trayOrder(n: number, rnd: Rnd = Math.random): number[] {
  const ids = Array.from({ length: n }, (_, i) => i)
  for (let k = 0; k < 200; k++) {
    const o = [...ids]
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1)) % (i + 1)
      ;[o[i], o[j]] = [o[j], o[i]]
    }
    if (o.every((x, i) => x !== i)) return o
  }
  // 保險（幾乎不會用到）：整排轉一格，也是每一片都不在原位
  return ids.map((i) => (i + 1) % n)
}

/** 托盤每一格稍微散開一點（-1～1，畫面再乘上可以挪的距離）：看起來是倒在桌上的，不是排好的；片不轉 */
export function scatter(n: number, rnd: Rnd = Math.random): { dx: number; dy: number }[] {
  return Array.from({ length: n }, () => ({ dx: rnd() * 2 - 1, dy: rnd() * 2 - 1 }))
}

export interface PuzzleRound {
  level: PuzzleLevel
  pic: PuzzlePic
  cols: number
  rows: number
  /** 托盤的第 i 格放第 tray[i] 片（片的編號＝板子上的位置，左上 0，往右、往下數）；托盤也排成 cols×rows */
  tray: number[]
  /** 托盤第 i 格散開多少 */
  spread: { dx: number; dy: number }[]
}

export function puzzleRound(level: PuzzleLevel, recent: readonly string[], rnd: Rnd = Math.random): PuzzleRound {
  const { cols, rows } = GRID[level]
  return { level, pic: pickPic(recent, rnd), cols, rows, tray: trayOrder(cols * rows, rnd), spread: scatter(cols * rows, rnd) }
}

// ── 進度 ─────────────────────────────────────────────────────

export interface PuzzleState extends LevelState {
  /** 最近拼過的圖（新的在後面，最多留 RECENT_PICS 張） */
  pics: string[]
}

/** 讀進來的東西不一定完整（壞掉、舊格式）：缺的補預設，級數夾在 1～max */
export function normalizePuzzle(raw: unknown): PuzzleState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<PuzzleState>
  const level = Number.isInteger(o.level) ? Math.min(PUZZLE_MAX, Math.max(1, o.level as number)) : 1
  const recent = Array.isArray(o.recent) ? o.recent.filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date, ok: !!x.ok })) : []
  const taught = Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : []
  const pics = Array.isArray(o.pics) ? o.pics.filter((x) => typeof x === 'string').slice(-RECENT_PICS) : []
  return { level, recent, taught, pics }
}

/** 拼完一張：記住這張圖、照結果升降級 */
export function afterPuzzle(s: PuzzleState, r: { pic: string; date: string; wrongs: number; shown: boolean; counted: boolean }): PuzzleState {
  const pics = [...s.pics.filter((p) => p !== r.pic), r.pic].slice(-RECENT_PICS)
  const first = r.wrongs <= OK_WRONGS && !r.shown
  // 順利拼完一張就升一級（已經是最難的就照原本的規則記下來）
  if (r.counted && first && s.level < PUZZLE_MAX) return { ...s, level: s.level + 1, recent: [], pics }
  const lv = stepLevel(s, { date: r.date, first, counted: r.counted }, PUZZLE_MAX)
  return { ...s, ...lv, pics }
}
