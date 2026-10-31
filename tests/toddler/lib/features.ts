// 孩子端的功能開關（src/lib/features.ts，2026-10-31 簡化成學校的樣子）：藏起來的畫面，相關的測試跟著跳過（不刪）。
// 開關改回 true，這些測試就自動回來。
import { FEATURES } from '../../../src/lib/features'
import type { GameDef } from '../catalog'

export { FEATURES }

/** 孩子點得到的遊戲：地圖藏起來時只剩首頁「畫畫」那一扇門進去的自由畫畫 */
export const HOME_GAMES: Record<string, string> = { 'd-free': 'draw' }
export const reachable = (g: Pick<GameDef, 'id'>) => FEATURES.map || g.id in HOME_GAMES

/** 遊戲的上一層（返回、玩完回到哪裡）：站點；地圖藏起來時是首頁 */
export const upOf = (g: Pick<GameDef, 'station'>) => (FEATURES.map ? `st-${g.station}` : 'home')

/** 藏起來的功能：test.skip 的理由 */
export const hidden = (f: keyof typeof FEATURES) => `${f} 藏起來了（src/lib/features.ts）`
