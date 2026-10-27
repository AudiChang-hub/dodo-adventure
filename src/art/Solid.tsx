import { memo, useId } from 'react'
import type { SolidId } from '../content/park'

/** 把顏色往白（t > 0）或往墨色（t < 0）推：亮面、暗面都從同一個底色算出來，紙感螢幕上不會跳色 */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const to = t > 0 ? [255, 252, 246] : [46, 42, 37]
  const k = Math.abs(t)
  return '#' + c.map((v, i) => Math.round(v + (to[i] - v) * k).toString(16).padStart(2, '0')).join('')
}

const LINE = 'rgba(46,42,37,0.42)'

/**
 * 立體形狀：正方體、球體、圓柱、圓錐、三角柱。
 * 光從左上方來：上面最亮、正面是底色、側面最暗，再加一道柔和的反光；底下有一圈淡淡的影子。
 * 明暗差只用同色系的明度，切到墨水模式（黑白）時也看得出是立體的。
 */
export const Solid = memo(function Solid({ solid, hex, size = '100%' }: { solid: SolidId; hex: string; size?: number | string }) {
  const uid = useId().replace(/:/g, '')
  const top = shade(hex, 0.42)
  const front = hex
  const side = shade(hex, -0.24)
  const s = { stroke: LINE, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  const g = `g${uid}`
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        {/* 曲面（圓柱、圓錐）：由左到右亮 → 底色 → 暗 */}
        <linearGradient id={`${g}h`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={shade(hex, 0.3)} />
          <stop offset="0.38" stopColor={front} />
          <stop offset="1" stopColor={side} />
        </linearGradient>
        <radialGradient id={`${g}r`} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor={shade(hex, 0.55)} />
          <stop offset="0.45" stopColor={front} />
          <stop offset="1" stopColor={side} />
        </radialGradient>
      </defs>
      <ellipse cx={52} cy={90} rx={solid === 'sphere' ? 28 : 36} ry={5.5} fill="rgba(46,42,37,0.12)" />

      {solid === 'cube' && (
        <g {...s}>
          <path d="M20 38 L36 24 H82 L66 38 Z" fill={top} />
          <path d="M66 38 L82 24 V72 L66 86 Z" fill={side} />
          <rect x={20} y={38} width={46} height={48} fill={front} />
          <path d="M26 44 V58" stroke="#fff" strokeOpacity={0.45} strokeWidth={3} />
        </g>
      )}

      {solid === 'sphere' && (
        <g>
          <circle cx={50} cy={54} r={33} fill={`url(#${g}r)`} {...s} />
          <ellipse cx={39} cy={41} rx={9} ry={6} fill="#fff" opacity={0.5} transform="rotate(-28 39 41)" />
        </g>
      )}

      {solid === 'cylinder' && (
        <g {...s}>
          <path d="M24 26 V78 A26 9 0 0 0 76 78 V26 Z" fill={`url(#${g}h)`} />
          <ellipse cx={50} cy={26} rx={26} ry={9} fill={top} />
          <path d="M31 38 V66" stroke="#fff" strokeOpacity={0.4} strokeWidth={3} />
        </g>
      )}

      {solid === 'cone' && (
        <g {...s}>
          <path d="M50 12 L20 78 A30 9 0 0 0 80 78 Z" fill={`url(#${g}h)`} />
          <path d="M44 30 L32 62" stroke="#fff" strokeOpacity={0.4} strokeWidth={3} />
        </g>
      )}

      {solid === 'prism' && (
        <g {...s}>
          {/* 像帳篷一樣躺著的三角柱：正面三角形＋右側斜面 */}
          <path d="M34 44 L64 28 L86 70 L56 86 Z" fill={side} />
          <path d="M12 86 L34 44 L56 86 Z" fill={front} />
          <path d="M30 54 L22 72" stroke="#fff" strokeOpacity={0.45} strokeWidth={3} />
        </g>
      )}
    </svg>
  )
})
