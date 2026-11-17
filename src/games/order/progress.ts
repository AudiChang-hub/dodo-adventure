// 故事排順序（T-164）的進度：kv `order.progress = { level, streak, taught[], day, today[], recent[] }`。
// 跟別的遊戲分開存；只存在這台裝置；家長區重置學習進度會清掉（不在 lib/reset.ts 的 KEEP_KV）。
import { getKV, setKV } from '../../lib/db'
import { normalizeOrder, type OrderState } from './plan'

export const ORDER_KEY = 'order.progress'

export async function loadOrder(): Promise<OrderState> {
  return normalizeOrder(await getKV<unknown>(ORDER_KEY, null))
}

export function saveOrder(p: OrderState) {
  return setKV(ORDER_KEY, p)
}
