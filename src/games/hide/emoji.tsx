// 躲起來了幾隻、恐龍賽跑棋（家長 2026-11-17）用的 emoji：先找主程式那一套（art/emoji.generated.ts），再找躲在哪裡那一套（../play-emoji.generated.ts），
// 都沒有的在 ./emoji.generated.ts（scripts/build-race-hide-emoji.ts 產生）。分開一個檔：不動別的遊戲的 generated 檔，合併不會衝突。
import { memo } from 'react'
import { EMOJI } from '../../art/emoji.generated'
import { PLAY_EMOJI } from '../play-emoji.generated'
import { COUNT_EMOJI } from './emoji.generated'

export const emoOf = (name: string) => EMOJI[name] ?? PLAY_EMOJI[name] ?? COUNT_EMOJI[name] ?? null

/** 畫在 SVG 裡面（巢狀的 <svg>）：x、y 是左上角，size 是邊長（外面那個 SVG 的座標） */
export const Emo = memo(function Emo({ name, x, y, size, flip, opacity }: { name: string; x: number; y: number; size: number; flip?: boolean; opacity?: number }) {
  const e = emoOf(name)
  if (!e) return null
  const svg = <svg x={x} y={y} width={size} height={size} viewBox={`0 0 ${e.w} ${e.h}`} aria-hidden="true" opacity={opacity} dangerouslySetInnerHTML={{ __html: e.b }} />
  if (!flip) return svg
  return <g transform={`translate(${2 * x + size} 0) scale(-1 1)`}>{svg}</g>
})
