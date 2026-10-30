// 魔法屋（the Magic House，docs/故事世界.md §1）：三隻恐龍和孩子一起住的家。
// 看得見的樣子是一張剖面圖（像娃娃屋拿掉前面那面牆，畫在 ui/MagicHouseArt.tsx）。
// 每完成一篇多一樣東西（篇的 houseAdds）；東西只會變多，不會被拿走（退回、很久沒玩都一樣）。
import type { Pic } from './types'

export type RoomId = 'hall' | 'living' | 'kitchen' | 'bedroom' | 'book' | 'garage' | 'art' | 'yard'

export interface Room {
  id: RoomId
  /** 故事裡的英文 */
  en: string
  /** 家長看的中文 */
  zh: string
}

/** 一開始就有的房間（§1.2） */
export const ROOMS: Room[] = [
  { id: 'hall', en: 'the hall', zh: '門廊' },
  { id: 'living', en: 'the living room', zh: '客廳' },
  { id: 'kitchen', en: 'the kitchen', zh: '廚房' },
  { id: 'bedroom', en: 'the bedroom', zh: '臥室' },
  { id: 'book', en: 'the book room', zh: '書房' },
  { id: 'garage', en: 'the garage', zh: '車庫' },
  { id: 'art', en: 'the art room', zh: '畫室' },
  { id: 'yard', en: 'the yard', zh: '院子' },
]

/** 完成一篇後多出來的東西 */
export interface HouseItem {
  id: string
  zh: string
  room: RoomId
  pic: Pic
  /** 在魔法屋剖面圖上的位置（畫布座標：中心 x、y、寬 w）；手寫的東西位置寫在 ui/MagicHouseArt.tsx 的 ITEM_AT */
  at?: { x: number; y: number; w: number }
}

/** 每一篇講完多的東西（照故事世界 §4 大綱）。G-9 產生新的篇時，在這裡加一筆、畫面上找一個位置 */
export const HOUSE_ITEMS: HouseItem[] = [{ id: 'egg-nest', zh: '客廳角落的蛋窩（軟軟的毯子）', room: 'living', pic: '@egg-nest' }]

export const houseItem = (id: string) => HOUSE_ITEMS.find((h) => h.id === id) ?? null
