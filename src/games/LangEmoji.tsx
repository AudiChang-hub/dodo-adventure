// 故事排順序、聽兩步驟指令、心情臉「為什麼」（T-164）用的 emoji：先找主程式那一套、再找遊戲角那一套（./PlayEmoji.tsx），都沒有的在 ./lang-emoji.generated.ts。
// 畫在 SVG 裡面（巢狀的 <svg>），x、y、size 是外面那個 SVG 的座標。
import { memo } from 'react'
import { emojiOf as playEmojiOf } from './PlayEmoji'
import { LANG_EMOJI } from './lang-emoji.generated'

export const langEmojiOf = (name: string) => playEmojiOf(name) ?? LANG_EMOJI[name] ?? null

export const LangEmoji = memo(function LangEmoji({ name, x, y, size, flip, rotate = 0, opacity }: { name: string; x: number; y: number; size: number; flip?: boolean; rotate?: number; opacity?: number }) {
  const e = langEmojiOf(name)
  if (!e) return null
  const svg = <svg x={x} y={y} width={size} height={size} viewBox={`0 0 ${e.w} ${e.h}`} aria-hidden="true" opacity={opacity} dangerouslySetInnerHTML={{ __html: e.b }} />
  const cx = x + size / 2
  const cy = y + size / 2
  const t = [rotate ? `rotate(${rotate} ${cx} ${cy})` : '', flip ? `translate(${2 * cx} 0) scale(-1 1)` : ''].filter(Boolean).join(' ')
  return t ? <g transform={t}>{svg}</g> : svg
})
