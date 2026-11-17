import type { useFlow } from '../barge'

type Flow = Pick<ReturnType<typeof useFlow>, 'begin' | 'cut'>

/**
 * 翻開一張牌時的流程（搶點見 games/barge）：回傳「這一張後面的話還算數嗎」。
 * - 孩子點的：搶掉之前的流程（正在說的話停下、上一張的稱讚作廢），這一張開一段新的。
 * - 示範的手點的：不碰流程。示範本身就是一段流程，手翻牌時 cut／begin 會讓示範自己作廢，
 *   示範停在第一張、一直擋著牌（正式站回報：第一次玩翻完第一張就卡住、牌都不能點）。
 */
export function flipFlow(flow: Flow, live: { current: boolean }, by: 'kid' | 'hand'): () => boolean {
  if (by === 'hand') return () => live.current
  flow.cut()
  return flow.begin(live)
}
