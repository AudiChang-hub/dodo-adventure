import type { GameProps } from './Shell'
import { SheetGame } from './sheet/SheetGame'

/**
 * 找出全部（多選）：畫面上 4–6 個東西、2–3 個符合，全部點到才算完成。
 * 分類依據：類別（蘋果、小雞）、顏色（同色不同形）、形狀、立體形狀、功能（動物村）。
 */
export function FindAllGame(props: GameProps) {
  return <SheetGame {...props} mode="tap" />
}
