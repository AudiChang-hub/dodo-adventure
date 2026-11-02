// 要測的遊戲：孩子點得到的只有首頁「畫畫」那一扇門進去的自由畫畫（舊的站點遊戲 T-75 拿掉了）。
// PlayGame 再加遊戲時在這裡加一行。
import { reachable } from './lib/features'

export const STATIONS = {
  english: '字母森林',
  math: '數字工地',
  mandarin: '動物村',
  draw: '畫畫小屋',
  park: '彩虹公園',
  code: '程式車庫',
} as const

export type StationId = keyof typeof STATIONS

export interface GameDef {
  id: string
  station: StationId
  kind: string
  title: string
}

export const GAMES: GameDef[] = [
  { id: 'd-free', station: 'draw', kind: 'free', title: '自由畫畫' },
]

/** 畫畫類：要檢查墨跡 */
export const DRAWING = new Set(['trace', 'dots', 'coloring', 'free', 'glyph', 'lasso'])

/** TODDLER_GAMES=m-count,d-color 只跑這幾個（也可以寫站點 id 或種類） */
export function selected(): GameDef[] {
  const want = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const all = GAMES.filter(reachable)
  if (!want.length) return all
  return all.filter((g) => want.includes(g.id) || want.includes(g.station) || want.includes(g.kind))
}
