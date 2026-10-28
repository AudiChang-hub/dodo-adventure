import { motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { ArrowArt } from '../art/Arrow'
import type { Cue, Visual } from '../content/games'
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

const gridCols = (count: number) => (count <= 3 ? count : count <= 4 ? 2 : count <= 6 ? 3 : count <= 8 ? 4 : 5)

/**
 * 一組數量：圖示排成整齊的格子，方便孩子一個一個數。
 * fit 是同一題裡最大的那組數量：圖示大小以它為準，兩組的單個圖示才會一樣大，
 * 不會出現「數量多的那組反而比較小」的矛盾線索。
 */
function Group({ icon, count, fit = count }: { icon: string; count: number; fit?: number }) {
  const cols = gridCols(count)
  const fitCols = gridCols(Math.max(fit, count))
  const fitRows = Math.ceil(Math.max(fit, count) / fitCols)
  const size = `min(${Math.floor(84 / fitRows)}cqh, ${Math.floor(88 / fitCols)}cqw)`
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

/**
 * 規律的一列（程式車庫・找規律）：圖一格一格排好，最後一格是虛線的「？」。
 * fill 是答對之後補進「？」的圖：輕輕彈進去，整列就完整了。
 */
function SeqRow({ items, fill }: { items: Visual[]; fill?: Visual }) {
  const n = items.length + 1
  const size = `min(76cqh, ${Math.floor(94 / n)}cqw)`
  const cell = { width: size, height: size, containerType: 'size', display: 'grid', placeItems: 'center' } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.2cqw', width: '100cqw', height: '100cqh' }}>
      {items.map((it, i) => (
        <div key={i} style={cell}>
          <VisualView v={it} />
        </div>
      ))}
      <div className={`seq-blank${fill ? ' is-filled' : ''}`} style={cell}>
        {fill ? (
          <motion.div style={{ ...cell, width: '100%', height: '100%' }} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}>
            <VisualView v={fill} />
          </motion.div>
        ) : (
          <span className="glyph">?</span>
        )}
      </div>
    </div>
  )
}

/** 一大堆：三、二、一疊成一座小山（百分比座標，圖示的中心） */
const PILE = [
  { x: 22, y: 74 },
  { x: 50, y: 76 },
  { x: 78, y: 74 },
  { x: 36, y: 52 },
  { x: 64, y: 52 },
  { x: 50, y: 29 },
]
const ARROW_INK = '#C9A23E'

/** 四個角的箭頭：out＝往外（變大），in＝往中間（變小） */
function CornerArrows({ out }: { out: boolean }) {
  // 每條箭頭從 a 指向 b（viewBox 100×100）
  const segs = [
    [16, 16, 4, 4],
    [84, 16, 96, 4],
    [16, 84, 4, 96],
    [84, 84, 96, 96],
  ].map(([x0, y0, x1, y1]) => (out ? [x0, y0, x1, y1] : [x1, y1, x0, y0]))
  return (
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
      {segs.map(([ax, ay, bx, by], i) => {
        const ang = Math.atan2(by - ay, bx - ax)
        const h = 7
        const l = [bx - h * Math.cos(ang - 0.6), by - h * Math.sin(ang - 0.6)]
        const r = [bx - h * Math.cos(ang + 0.6), by - h * Math.sin(ang + 0.6)]
        return <path key={i} d={`M${ax} ${ay} L${bx} ${by} M${l[0]} ${l[1]} L${bx} ${by} L${r[0]} ${r[1]}`} fill="none" stroke={ARROW_INK} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      })}
    </svg>
  )
}

/**
 * 比較題的題目徽章（不靠語言分辨這題問什麼）：
 * - more：同一種東西疊成一大堆，一個一個掉下來疊上去
 * - less：只有孤單的一個（和一大堆裡每一個一樣大，才不會跟「變小」搞混），旁邊空空的
 * - big：東西從小長到很大，四個角的箭頭往外推
 * - small：東西從大縮到很小，四個角的箭頭往裡收
 * play 每變一次就重演一次（波波念題目的時候）。
 */
export function CueArt({ cue, icon, play = 0 }: { cue: Cue; icon: string; play?: number }) {
  const box = { position: 'relative', width: '100cqmin', height: '100cqmin' } as const
  const at = (x: number, y: number, size: number) => ({ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${size}%`, height: `${size}%`, translate: '-50% -50%' }) as const
  if (cue === 'more')
    return (
      <div key={play} style={box}>
        {PILE.map((p, i) => (
          <motion.div key={i} style={at(p.x, p.y, 36)} initial={{ scale: 0, y: '-60%' }} animate={{ scale: 1, y: '0%' }} transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.12 + i * 0.12 }}>
            <Emoji name={icon} />
          </motion.div>
        ))}
      </div>
    )
  if (cue === 'less')
    return (
      <div key={play} style={box}>
        <motion.div style={at(50, 66, 36)} initial={{ scale: 0 }} animate={{ scale: 1, y: ['0%', '-18%', '0%'] }} transition={{ scale: { type: 'spring', stiffness: 380, damping: 18, delay: 0.12 }, y: { duration: 0.5, delay: 0.5 } }}>
          <Emoji name={icon} />
        </motion.div>
      </div>
    )
  const big = cue === 'big'
  return (
    <div key={play} style={box}>
      <CornerArrows out={big} />
      <motion.div style={at(50, 52, big ? 78 : 24)} initial={{ scale: big ? 0.4 : 2.4 }} animate={{ scale: 1 }} transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
        <Emoji name={icon} />
      </motion.div>
    </div>
  )
}

export function VisualView({ v, fit, fill }: { v: Visual; fit?: number; fill?: Visual }) {
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
      return <Group icon={v.icon} count={v.count} fit={fit} />
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
    case 'arrow':
      return (
        <div style={{ width: '86cqmin', height: '86cqmin' }}>
          <ArrowArt dir={v.dir} />
        </div>
      )
    case 'seq':
      return <SeqRow items={v.items} fill={fill} />
    case 'cue':
      return <CueArt cue={v.cue} icon={v.icon} />
  }
}
