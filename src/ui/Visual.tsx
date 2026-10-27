import { Emoji } from '../art/Emoji'
import type { Visual } from '../content/games'
import type { ShapeId } from '../content/park'

export function ShapeSvg({ shape, hex, size = '100%' }: { shape: ShapeId; hex: string; size?: number | string }) {
  const s = { fill: hex, stroke: 'rgba(46,42,37,0.28)', strokeWidth: 4, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      {shape === 'circle' && <circle cx={50} cy={50} r={40} {...s} />}
      {shape === 'square' && <rect x={12} y={12} width={76} height={76} rx={8} {...s} />}
      {shape === 'rect' && <rect x={4} y={26} width={92} height={48} rx={8} {...s} />}
      {shape === 'triangle' && <path d="M50 10 L92 86 L8 86 Z" {...s} />}
      {shape === 'star' && <path d="M50 6 L62 37 L95 38 L69 58 L78 91 L50 72 L22 91 L31 58 L5 38 L38 37 Z" {...s} />}
      {shape === 'heart' && <path d="M50 88 C20 66 6 50 6 32 C6 18 17 8 30 8 C40 8 47 14 50 22 C53 14 60 8 70 8 C83 8 94 18 94 32 C94 50 80 66 50 88 Z" {...s} />}
    </svg>
  )
}

/** 一組數量：圖示排成整齊的格子，方便孩子一個一個數 */
function Group({ icon, count }: { icon: string; count: number }) {
  const cols = count <= 3 ? count : count <= 4 ? 2 : count <= 6 ? 3 : count <= 8 ? 4 : 5
  const rows = Math.ceil(count / cols)
  const size = `min(${Math.floor(84 / rows)}cqh, ${Math.floor(88 / cols)}cqw)`
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, auto)`, gap: '2cqmin', width: '100cqw', height: '100cqh', alignContent: 'center', justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ width: size, height: size }}>
          <Emoji name={icon} />
        </div>
      ))}
    </div>
  )
}

export function VisualView({ v }: { v: Visual }) {
  switch (v.t) {
    case 'emoji':
      return (
        <div style={{ width: `${(v.scale ?? 1) * 100}cqmin`, height: `${(v.scale ?? 1) * 100}cqmin` }}>
          <Emoji name={v.icon} />
        </div>
      )
    case 'letter':
      return <span className="glyph">{v.ch}</span>
    case 'number':
      return <span className="glyph num">{v.n}</span>
    case 'group':
      return <Group icon={v.icon} count={v.count} />
    case 'color':
      return (
        <svg viewBox="0 0 100 100" style={{ width: '92cqmin', height: '92cqmin' }} aria-hidden="true">
          <path d="M50 8 C74 8 92 24 92 48 C92 74 74 92 50 92 C24 92 8 76 8 52 C8 26 26 8 50 8 Z" fill={v.hex} stroke="rgba(46,42,37,0.22)" strokeWidth={3} />
          <ellipse cx={36} cy={32} rx={12} ry={7} fill="#fff" opacity={0.35} />
        </svg>
      )
    case 'shape':
      return (
        <div style={{ width: '90cqmin', height: '90cqmin' }}>
          <ShapeSvg shape={v.shape} hex={v.hex} />
        </div>
      )
  }
}
