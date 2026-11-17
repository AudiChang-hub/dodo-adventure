// 躲在哪裡、心情臉（T-160）用的 emoji：先找主程式那一套（art/emoji.generated.ts），沒有的在 ./play-emoji.generated.ts。
// 畫在 SVG 裡面（巢狀的 <svg>），x、y、size 是外面那個 SVG 的座標。
import { memo } from 'react'
import { EMOJI } from '../art/emoji.generated'
import { PLAY_EMOJI } from './play-emoji.generated'

export const emojiOf = (name: string) => EMOJI[name] ?? PLAY_EMOJI[name] ?? null

export const SvgEmoji = memo(function SvgEmoji({ name, x, y, size, flip }: { name: string; x: number; y: number; size: number; flip?: boolean }) {
  const e = emojiOf(name)
  if (!e) return null
  const svg = <svg x={x} y={y} width={size} height={size} viewBox={`0 0 ${e.w} ${e.h}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: e.b }} />
  if (!flip) return svg
  return <g transform={`translate(${2 * x + size} 0) scale(-1 1)`}>{svg}</g>
})
