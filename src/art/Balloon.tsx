import { memo } from 'react'
import type { BalloonKind } from '../content/park'
import { shade } from './Solid'

const LINE = 'rgba(46,42,37,0.36)'

/** 氣球本體（viewBox 0 0 100 100，繩結在 (50, 74)） */
const BODY: Record<BalloonKind, string> = {
  round: 'M50 8 C68 8 80 22 80 40 C80 58 66 72 50 74 C34 72 20 58 20 40 C20 22 32 8 50 8 Z',
  heart: 'M50 74 C30 60 16 48 16 32 C16 20 25 12 35 12 C42 12 47 16 50 22 C53 16 58 12 65 12 C75 12 84 20 84 32 C84 48 70 60 50 74 Z',
  star: 'M50 6 L60 30 L86 32 L66 49 L73 74 L50 60 L27 74 L34 49 L14 32 L40 30 Z',
  // 熊形氣球：頭＋兩個耳朵（學習單原題：圈出所有藍色氣球，包含熊形的藍氣球）
  bear: 'M28 12 C36 8 42 14 42 18 C47 17 53 17 58 18 C58 14 64 8 72 12 C79 16 78 24 74 28 C79 34 82 42 80 50 C78 64 66 74 50 74 C34 74 22 64 20 50 C18 42 21 34 26 28 C22 24 21 16 28 12 Z',
}

/** 同色、不同造型的氣球：亮面與繩子顏色都由底色算出 */
export const Balloon = memo(function Balloon({ kind, hex, size = '100%' }: { kind: BalloonKind; hex: string; size?: number | string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d="M50 76 C46 84 56 88 50 98" fill="none" stroke="rgba(46,42,37,0.4)" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M46 80 L50 73 L54 80 Z" fill={shade(hex, -0.18)} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
      <path d={BODY[kind]} fill={hex} stroke={LINE} strokeWidth={2.6} strokeLinejoin="round" />
      {kind === 'bear' && (
        <g fill={shade(hex, -0.16)}>
          <circle cx={31} cy={20} r={4.5} />
          <circle cx={69} cy={20} r={4.5} />
          <ellipse cx={50} cy={54} rx={10} ry={7.5} fill={shade(hex, 0.3)} />
          <circle cx={41} cy={42} r={2.6} fill="rgba(46,42,37,0.55)" />
          <circle cx={59} cy={42} r={2.6} fill="rgba(46,42,37,0.55)" />
          <ellipse cx={50} cy={51} rx={3.4} ry={2.4} fill="rgba(46,42,37,0.55)" />
        </g>
      )}
      <ellipse cx={kind === 'star' ? 44 : 36} cy={kind === 'star' ? 34 : 28} rx={6.5} ry={4} fill="#fff" opacity={0.5} transform={`rotate(-35 ${kind === 'star' ? 44 : 36} ${kind === 'star' ? 34 : 28})`} />
    </svg>
  )
})
