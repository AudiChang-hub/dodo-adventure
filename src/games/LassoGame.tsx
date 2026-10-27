import type { GameProps } from './Shell'
import { SheetGame } from './sheet/SheetGame'

/**
 * 用筆圈起來：題型同「找出全部」，但要用觸控筆（或手指）把答案圈起來。
 * 圈住的判斷：東西的中心在封閉路徑內；路徑不必完全封閉，首尾夠近就自動接起來。
 * 這也是運筆練習：每一圈的圓度、缺口、花多久都會記錄下來。
 */
export function LassoGame(props: GameProps) {
  return <SheetGame {...props} mode="lasso" />
}
