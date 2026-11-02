import type { Speaker } from './lines'
import type { StationId } from '../lib/db'
import type { ShapeId } from './park'
import type { Dir } from './code'

export type Visual =
  | { t: 'emoji'; icon: string; scale?: number }
  | { t: 'letter'; ch: string }
  | { t: 'number'; n: number }
  | { t: 'group'; icon: string; count: number }
  | { t: 'color'; hex: string }
  | { t: 'shape'; shape: ShapeId; hex: string }
  // 程式車庫：箭頭卡、規律的一列（最後一格是「？」）
  | { t: 'arrow'; dir: Dir }
  | { t: 'seq'; items: Visual[] }
  // 比多少、比大小的「題目徽章」：一大堆／一點點、變大／變小（ui/Visual.tsx 的 CueArt）
  | { t: 'cue'; cue: Cue; icon: string }

/** 比較題問的是哪一邊：more 一大堆、less 一點點、big 變大、small 變小 */
export type Cue = 'more' | 'less' | 'big' | 'small'

export interface ChoiceItem {
  itemId: string
  skill: string
  stimulus?: Visual
  prompt: string[]
  options: { id: string; v: Visual }[]
  answer: string
  /** 答錯兩次或提示時要說的話 */
  correction: string[]
  /** 答對之後順便複習的一句，例如「B is for bus!」 */
  after?: string[]
  /** 新內容第一次出現時的教學卡（PRD §5.8：先教 → 一起練 → 自己答） */
  teach?: TeachSpec
  /**
   * 比較題的題目徽章（盤點：問「多」還是「少」、「大」還是「小」只能靠英文分辨）：
   * 一起練、自己答時一直掛在選項上方；教學卡會先把同一個徽章貼在答案那一邊，教過才考。
   */
  cue?: Extract<Visual, { t: 'cue' }>
  /** 教學卡上教了哪些單字（lexicon.ts 的 key）：出題規劃決定要跑教學卡時，記成「教過」（lib/words.ts） */
  teachWords?: string[]
  /**
   * 技能學過了、但這一題還是要先跑教學卡：答案的字家長勾了「他不認得」（要先重教），
   * 或教過的干擾選項一個都沒有、教學卡上要多教一個字。
   */
  needTeach?: boolean
}

/**
 * 教學卡：主持的恐龍大大地展示內容、念教學句。
 * visual 是陣列時並排展示（例如數字＋數量、比多少的兩組），focus[i] 是念第 i 句時要指著哪一個。
 */
export interface TeachSpec {
  visual: Visual | Visual[]
  /** 旁邊的小例子貼紙，例如 B 旁邊的公車；在第 sideAt 句時出現 */
  side?: Visual
  sideAt?: number
  focus?: number[]
  lines: string[]
  /** 答錯兩次重教時的精簡版，預設只念第一句 */
  short?: string[]
  /** 題目徽章：念第一句時貼到第一句指的那一個（focus[0]）上，之後一直留著（比多少、比大小） */
  cue?: Visual
}

export type GameKind =
  | 'choice' | 'phonics' | 'count' | 'order' | 'trace' | 'dots' | 'coloring' | 'free' | 'glyph'
  // 工作線 B：學習單題型
  | 'findall' | 'lasso' | 'fill' | 'give' | 'subitize'
  // 程式車庫：箭頭卡開車、排順序、找規律（出題照選擇題的 planChoice，畫面是接火車車廂）
  | 'drive' | 'sequence' | 'pattern'

export interface GameDef {
  id: string
  station: StationId
  kind: GameKind
  title: string
  icon: string
  intro: string
  maxLevel: number
}

export interface StationDef {
  id: StationId
  name: string
  host: Speaker
  icon: string
  tint: string
  deep: string
}

export const STATIONS: StationDef[] = [
  { id: 'english', name: '字母森林', host: 'dodo', icon: 'deciduous-tree', tint: '#CFE8D9', deep: '#5FA883' },
  { id: 'math', name: '數字工地', host: 'bobo', icon: 'construction', tint: '#F8DCC8', deep: '#D38A5E' },
  { id: 'mandarin', name: '動物村', host: 'momo', icon: 'house-with-garden', tint: '#D8E6F4', deep: '#6F9CC8' },
  { id: 'draw', name: '畫畫小屋', host: 'dodo', icon: 'artist-palette', tint: '#E6DFF2', deep: '#8F7CC0' },
  { id: 'park', name: '彩虹公園', host: 'bobo', icon: 'rainbow', tint: '#F6E7B8', deep: '#C9A23E' },
  // 車庫的水泥地：其他站都帶一點色相，這一站用偏冷的淺灰，在地圖上一眼分得出來
  { id: 'code', name: '程式車庫', host: 'bobo', icon: 'vertical-traffic-light', tint: '#DDE2E6', deep: '#6F8499' },
]

export const station = (id: StationId) => STATIONS.find((s) => s.id === id)!

// 舊的站點遊戲（2026-10-31 改成學校的三堂課；站點、冒險 T-75 拿掉，題目產生器 T-76 第 3 層拿掉）：
// 這張表只留名稱和圖示，家長區看舊的作答紀錄、慶祝畫面讀得到遊戲叫什麼。孩子點得到的只剩首頁「畫畫」的自由畫畫（d-free）。

/** 舊的字母遊戲改寫成自然發音：舊紀錄裡的遊戲 id 對到新遊戲 */
export const LEGACY_GAME: Record<string, string> = { 'en-word': 'ph-start', 'en-pic': 'ph-same', 'en-find': 'ph-letter' }

export const GAMES: GameDef[] = [
  { id: 'ph-start', station: 'english', kind: 'phonics', title: '開頭音找圖', icon: 'bus', intro: 'ph.intro.start', maxLevel: 4 },
  { id: 'ph-same', station: 'english', kind: 'phonics', title: '開頭一樣', icon: 'soccer-ball', intro: 'ph.intro.same', maxLevel: 4 },
  { id: 'ph-letter', station: 'english', kind: 'phonics', title: '聽音找字母', icon: 'glowing-star', intro: 'ph.intro.letter', maxLevel: 4 },

  { id: 'm-count', station: 'math', kind: 'count', title: '點點數數', icon: 'egg', intro: 'm.intro.count', maxLevel: 4 },
  { id: 'm-match', station: 'math', kind: 'choice', title: '有幾個', icon: 'automobile', intro: 'm.intro.match', maxLevel: 4 },
  { id: 'm-find', station: 'math', kind: 'choice', title: '找數字', icon: 'star', intro: 'm.intro.find', maxLevel: 4 },
  { id: 'm-compare', station: 'math', kind: 'choice', title: '比多少', icon: 'strawberry', intro: 'm.intro.compare', maxLevel: 4 },
  { id: 'm-order', station: 'math', kind: 'order', title: '照順序', icon: 'construction', intro: 'm.intro.order', maxLevel: 4 },

  { id: 'z-find', station: 'mandarin', kind: 'choice', title: '聽詞找圖', icon: 'dog-face', intro: 'z.intro.find', maxLevel: 4 },
  { id: 'z-category', station: 'mandarin', kind: 'choice', title: '動動腦', icon: 'airplane', intro: 'z.intro.category', maxLevel: 4 },
  { id: 'z-sound', station: 'mandarin', kind: 'choice', title: '聽聲音猜猜看', icon: 'cow-face', intro: 'z.intro.sound', maxLevel: 4 },

  { id: 'd-trace', station: 'draw', kind: 'trace', title: '運筆小路', icon: 'automobile', intro: 'd.intro.trace', maxLevel: 6 },
  { id: 'd-dots', station: 'draw', kind: 'dots', title: '連點成圖', icon: 'star', intro: 'd.dots.intro', maxLevel: 4 },
  { id: 'd-color', station: 'draw', kind: 'coloring', title: '蠟筆著色', icon: 'crayon', intro: 'd.color.intro', maxLevel: 1 },
  { id: 'd-free', station: 'draw', kind: 'free', title: '自由畫畫', icon: 'framed-picture', intro: 'd.intro.free', maxLevel: 1 },
  { id: 'd-glyph', station: 'draw', kind: 'glyph', title: '描數字字母', icon: 'pencil', intro: 'd.intro.glyph', maxLevel: 6 },

  { id: 'p-color', station: 'park', kind: 'choice', title: '找顏色', icon: 'balloon', intro: 'p.intro.color', maxLevel: 4 },
  { id: 'p-shape', station: 'park', kind: 'choice', title: '找形狀', icon: 'glowing-star', intro: 'p.intro.shape', maxLevel: 4 },
  { id: 'p-size', station: 'park', kind: 'choice', title: '比大小', icon: 'elephant', intro: 'p.intro.size', maxLevel: 3 },

  // ── 工作線 A ──
  // 功文式小練習：全是已熟的數字題、一題接一題（由 ChoiceGame 交給 src/games/FluencyGame.tsx）
  { id: 'm-quick', station: 'math', kind: 'choice', title: '數字快答', icon: 'rocket', intro: 'quick.intro', maxLevel: 1 },
  // ── 工作線 A ──
  // ── 工作線 B ── 學習單題型（題目產生器在 games-worksheet.ts）
  { id: 'm-fill', station: 'math', kind: 'fill', title: '塗格子', icon: 'lady-beetle', intro: 'ws.intro.fill', maxLevel: 4 },
  { id: 'm-give', station: 'math', kind: 'give', title: '給波波蛋', icon: 'basket', intro: 'ws.intro.give', maxLevel: 4 },
  { id: 'm-flash', station: 'math', kind: 'subitize', title: '一眼看幾個', icon: 'game-die', intro: 'ws.intro.flash', maxLevel: 4 },
  { id: 'p-findall', station: 'park', kind: 'findall', title: '找出全部', icon: 'red-apple', intro: 'ws.intro.findall', maxLevel: 4 },
  { id: 'p-lasso', station: 'park', kind: 'lasso', title: '圈圈看', icon: 'crayon', intro: 'ws.intro.lasso', maxLevel: 4 },
  { id: 'p-solid', station: 'park', kind: 'findall', title: '立體形狀', icon: 'package', intro: 'ws.intro.solid', maxLevel: 4 },
  { id: 'z-use', station: 'mandarin', kind: 'findall', title: '做什麼用', icon: 'umbrella', intro: 'ws.intro.use', maxLevel: 4 },
  // ── 工作線 B ──
  // ── 程式車庫（PRD §10）── 題目產生器與資料在 code.ts
  { id: 'c-drive', station: 'code', kind: 'drive', title: '箭頭卡開車', icon: 'automobile', intro: 'c.intro.drive', maxLevel: 4 },
  { id: 'c-pattern', station: 'code', kind: 'pattern', title: '找規律', icon: 'puzzle-piece', intro: 'c.intro.pattern', maxLevel: 4 },
  { id: 'c-seq', station: 'code', kind: 'sequence', title: '排順序', icon: 'hatching-chick', intro: 'c.intro.seq', maxLevel: 4 },
  // ── 學校的課（src/lessons/README.md）：哪一課需要新的遊戲設定，就加在自己那一段（id 用 en-／zh-／ma- 開頭），不要動別段 ──
  // ── 英文課 ──
  // ── 中文課 ──
  // ── 數學課 ──
]

export const game = (id: string) => GAMES.find((g) => g.id === (LEGACY_GAME[id] ?? id))!
