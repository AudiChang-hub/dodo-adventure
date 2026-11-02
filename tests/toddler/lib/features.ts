// 孩子端的功能開關（src/lib/features.ts）。舊的地圖、冒險、魔法屋、貼紙本、站點遊戲 T-75 已經從程式拿掉，相關的測試也一起拿掉了。
import { FEATURES } from '../../../src/lib/features'
import type { GameDef } from '../catalog'

export { FEATURES }

/** 孩子點得到的遊戲：只剩首頁「畫畫」那一扇門進去的自由畫畫 */
export const HOME_GAMES: Record<string, string> = { 'd-free': 'draw' }
export const reachable = (g: Pick<GameDef, 'id'>) => g.id in HOME_GAMES

/** 遊戲的上一層（返回、玩完回到哪裡）：首頁 */
export const upOf = (_g: Pick<GameDef, 'station'>) => 'home'

/** 藏起來的功能：test.skip 的理由 */
export const hidden = (f: keyof typeof FEATURES) => `${f} 藏起來了（src/lib/features.ts）`
