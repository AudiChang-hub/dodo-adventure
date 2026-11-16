// 拼圖（T-156，家長 2026-11-16 要求）的圖庫、出題、升降級。只有純函式，scripts/test-puzzle-maze.ts 直接測；畫面在 ./Puzzle.tsx。
// 圖全部是 App 自己的故事插畫（src/art/storybook：場景＋角色庫），用 StoryPage 畫，不照任何現成 App 的關卡或圖。
// 片數從 3 歲做得到的開始（指引 MA-6「積木、拼圖」）：2×2 四片 → 熟練了 3×2 六片。片不旋轉、底下有淡淡的原圖。
import type { PageArt } from '../../art/storybook/layout'
import { stepLevel, type LevelState } from '../logic/sort-plan'

export interface PuzzlePic {
  id: string
  /** 中文名字（家長區、報告看的） */
  zh: string
  art: PageArt
  /** 拼完念的那一句（./lines.ts 用 picLineKey 登記） */
  en: string
}

/**
 * 圖庫：每張都是一個場景＋2～3 個角色或東西，分散在左、右（2×2 切開每一片都有看得出來的東西）。
 * 新增一張：加在這裡、跑 npm run audio（只產新的那一句）；scripts/test-puzzle-maze.ts 會用 problemsOf 檢查擺法。
 */
export const PUZZLE_PICS: PuzzlePic[] = [
  { id: 'park', zh: '豆豆在公園', en: 'Dodo is at the park!', art: { scene: 'park', cast: [{ who: 'dodo', at: 'L', size: 'L' }, { who: 'sun', at: 'RC' }], back: [{ who: 'tree', at: 'R', size: 'L' }] } },
  { id: 'farm', zh: '農場的牛和豬', en: 'Moo! Oink! Hello, farm!', art: { scene: 'farm', cast: [{ who: 'cow', at: 'L', size: 'L' }, { who: 'pig', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'sea', zh: '海上的鯨魚', en: 'A big whale in the sea!', art: { scene: 'sea', cast: [{ who: 'whale', at: 'L', size: 'L' }, { who: 'sailboat', at: 'R', size: 'L' }, { who: 'sun', at: 'LC' }] } },
  { id: 'beach', zh: '莫莫在海邊', en: 'Momo is at the beach!', art: { scene: 'beach', cast: [{ who: 'momo', at: 'L', size: 'L' }, { who: 'beach-umbrella', at: 'R', size: 'L' }, { who: 'sun', at: 'C' }] } },
  { id: 'valley', zh: '恐龍谷', en: 'Two big dinosaurs!', art: { scene: 'valley', cast: [{ who: 'sauropod', at: 'L', size: 'L' }, { who: 'trex', at: 'R', size: 'L', flip: true }] } },
  { id: 'zoo', zh: '動物園的長頸鹿和大象', en: 'Hello, giraffe and elephant!', art: { scene: 'zoo', cast: [{ who: 'giraffe', at: 'L', size: 'L' }, { who: 'elephant', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'party', zh: '生日派對', en: 'Happy birthday, Bobo!', art: { scene: 'party', cast: [{ who: 'bobo', at: 'L', size: 'L' }, { who: 'cake', at: 'C' }, { who: 'balloons', at: 'R', size: 'L' }] } },
  { id: 'rain', zh: '下雨天的青蛙', en: 'Frog loves the rain!', art: { scene: 'rain', cast: [{ who: 'frog', at: 'L', size: 'L' }, { who: 'umbrella', at: 'R', size: 'L' }, { who: 'raincloud', at: 'C' }] } },
  { id: 'city', zh: '城市的公車', en: 'Beep beep! A big bus!', art: { scene: 'city', cast: [{ who: 'bus', at: 'LC', size: 'L' }, { who: 'traffic-light', at: 'R', size: 'L' }] } },
  { id: 'site', zh: '工地的卡車', en: 'Bobo and the big truck!', art: { scene: 'site', cast: [{ who: 'truck', at: 'L', size: 'L' }, { who: 'bobo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'meadow', zh: '兔子和烏龜', en: 'Rabbit and turtle!', art: { scene: 'meadow', cast: [{ who: 'rabbit', at: 'L', size: 'L' }, { who: 'turtle', at: 'R', size: 'L', pose: 'walk', flip: true }, { who: 'rainbow', at: 'C' }] } },
  { id: 'market', zh: '水果市場的猴子', en: 'Monkey loves fruit!', art: { scene: 'market', cast: [{ who: 'monkey', at: 'L', size: 'L' }, { who: 'banana', at: 'C' }, { who: 'watermelon', at: 'R', size: 'L' }] } },
  { id: 'night', zh: '晚安泰迪熊', en: 'Good night, teddy!', art: { scene: 'bedroom', cast: [{ who: 'bed', at: 'LC', size: 'L', with: 'teddy' }, { who: 'moon', at: 'R' }] } },
  { id: 'nest', zh: '莫莫找到蛋', en: 'Momo found the eggs!', art: { scene: 'meadow', cast: [{ who: 'momo', at: 'L', size: 'L' }, { who: 'dino-nest', at: 'R', size: 'L' }, { who: 'sun', at: 'C' }] } },
  { id: 'fire', zh: '消防車', en: 'Wee-oo! A fire truck!', art: { scene: 'city', cast: [{ who: 'fire-truck', at: 'LC', size: 'L' }, { who: 'cat', at: 'R', size: 'L', flip: true }] } },
  { id: 'kite', zh: '豆豆放風箏', en: 'Dodo flies a kite!', art: { scene: 'meadow', cast: [{ who: 'dodo', at: 'L', size: 'L' }, { who: 'kite', at: 'RC' }, { who: 'sheep', at: 'R', size: 'L', flip: true }] } },
]

export const picOf = (id: string) => PUZZLE_PICS.find((p) => p.id === id) ?? null

// ── 級數 ─────────────────────────────────────────────────────

export type PuzzleLevel = 1 | 2
export const PUZZLE_MAX: PuzzleLevel = 2
/** 每一級切幾片：1 → 2×2、2 → 3×2（橫的圖，多切一欄） */
export const GRID: Record<PuzzleLevel, { cols: number; rows: number }> = { 1: { cols: 2, rows: 2 }, 2: { cols: 3, rows: 2 } }
/** 作答紀錄的技能：puzzle:4、puzzle:6 */
export const puzzleSkill = (level: PuzzleLevel) => `puzzle:${GRID[level].cols * GRID[level].rows}`
export const PUZZLE_GAME = 'logic-puzzle'
/**
 * 一張拼完算「第一次就對」：放錯 ≤ 1 次、沒有手帶著放（3 歲試一個位置不對是正常的探索，FB-5 不扣分）。
 * 升降級照邏輯遊戲同一套（sort-plan 的 stepLevel：最近 8 張 ≥ 7 張、分布 ≥ 3 天升級；最近 6 張 ≤ 3 張退級）。
 */
export const OK_WRONGS = 1
/** 記住最近幾張：新的一張不跟這幾張一樣 */
export const RECENT_PICS = 5

type Rnd = () => number

/** 挑一張圖：不在最近幾張裡（圖庫比最近幾張多，一定挑得到；萬一都用過了，至少不跟上一張一樣） */
export function pickPic(recent: readonly string[], rnd: Rnd = Math.random): PuzzlePic {
  const last = recent.slice(-RECENT_PICS)
  let pool = PUZZLE_PICS.filter((p) => !last.includes(p.id))
  if (!pool.length) pool = PUZZLE_PICS.filter((p) => p.id !== recent[recent.length - 1])
  return pool[Math.floor(rnd() * pool.length) % pool.length]
}

/** 托盤裡片的順序：洗牌，而且不跟板子上的順序一樣（不然照順序放就好，不用看圖） */
export function trayOrder(n: number, rnd: Rnd = Math.random): number[] {
  const ids = Array.from({ length: n }, (_, i) => i)
  for (let k = 0; k < 20; k++) {
    const o = [...ids]
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1)) % (i + 1)
      ;[o[i], o[j]] = [o[j], o[i]]
    }
    if (o.some((x, i) => x !== i)) return o
  }
  return [...ids].reverse()
}

export interface PuzzleRound {
  level: PuzzleLevel
  pic: PuzzlePic
  cols: number
  rows: number
  /** 托盤的第 i 格放第 tray[i] 片（片的編號＝板子上的位置，左上 0，往右、往下數） */
  tray: number[]
}

export function puzzleRound(level: PuzzleLevel, recent: readonly string[], rnd: Rnd = Math.random): PuzzleRound {
  const { cols, rows } = GRID[level]
  return { level, pic: pickPic(recent, rnd), cols, rows, tray: trayOrder(cols * rows, rnd) }
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
  const lv = stepLevel(s, { date: r.date, first: r.wrongs <= OK_WRONGS && !r.shown, counted: r.counted }, PUZZLE_MAX)
  return { ...s, ...lv, pics }
}
