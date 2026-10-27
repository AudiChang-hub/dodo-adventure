import { memo, type CSSProperties } from 'react'
import { EMOJI } from './emoji.generated'

interface Props {
  name: string
  size?: number | string
  style?: CSSProperties
  className?: string
}

export const Emoji = memo(function Emoji({ name, size = '100%', style, className }: Props) {
  const e = EMOJI[name]
  if (!e) return null
  return (
    <svg
      className={className}
      viewBox={`0 0 ${e.w} ${e.h}`}
      width={size}
      height={size}
      style={{ display: 'block', ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: e.b }}
    />
  )
})
