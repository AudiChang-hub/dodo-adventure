// 拼圖自己的構圖（./free.ts）畫出來：960×600，跟故事插畫同一套畫風（淡色平塗、同色系深一階的粗外框、不用漸層，準則 DISPLAY-1、2）。
// 角色、東西用故事插畫的角色庫（drawItem），角色庫沒有的畫 Fluent Emoji。整張靜止（MOTION-2）。
import { memo, type ReactElement } from 'react'
import { EMOJI } from '../../art/emoji.generated'
import { drawItem } from '../../art/storybook/library'
import { Blob, line } from '../../art/storybook/kit'
import { Cloud } from '../../art/storybook/things'
import { FH, FW, itemBox, type Deco, type FreeArt, type FreeItem, type Ground, type Sky } from './free'

const SKY: Record<Sky, string> = { day: '#E3EEF2', dusk: '#F6E0CC', night: '#46507F', water: '#BCDCEA' }

function Item({ it }: { it: FreeItem }) {
  const b = itemBox(it)
  const art: ReactElement | null = b.id ? drawItem(b.id, it.pose ?? '') : null
  const e = art ? null : EMOJI[it.who]
  const body = art ?? (e ? <svg width={200} height={200} viewBox={`0 0 ${e.w} ${e.h}`} dangerouslySetInnerHTML={{ __html: e.b }} /> : null)
  const bw = b.w / b.k
  return (
    <g transform={`${it.rot ? `rotate(${it.rot} ${it.x} ${it.y}) ` : ''}translate(${b.x} ${b.y}) scale(${b.k})${it.flip ? ` translate(${bw} 0) scale(-1 1)` : ''}`}>{body}</g>
  )
}

function Star({ x, y, r }: { x: number; y: number; r: number }) {
  const p = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    return `${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`
  })
  return <path d={`M${p.join(' L')} Z`} fill="#F6DE96" {...line('#E2BE5E', 3)} />
}

function DecoView({ d }: { d: Deco }) {
  switch (d.t) {
    case 'cloud':
      return <Cloud x={d.x} y={d.y} k={d.k} />
    case 'mountain':
      return (
        <g>
          <path d={`M${d.x - d.w / 2} ${d.base} L${d.x - 14} ${d.base - d.h + 8} Q${d.x} ${d.base - d.h - 6} ${d.x + 14} ${d.base - d.h + 8} L${d.x + d.w / 2} ${d.base} Z`} fill={d.fill ?? '#B9C7DA'} {...line('#8EA0B9')} />
          {d.snow && <path d={`M${d.x - d.w * 0.14} ${d.base - d.h * 0.7} L${d.x - 14} ${d.base - d.h + 8} Q${d.x} ${d.base - d.h - 6} ${d.x + 14} ${d.base - d.h + 8} L${d.x + d.w * 0.14} ${d.base - d.h * 0.7} L${d.x + d.w * 0.05} ${d.base - d.h * 0.62} L${d.x - d.w * 0.04} ${d.base - d.h * 0.72} Z`} fill="#FBF8F2" {...line('#8EA0B9', 4)} />}
        </g>
      )
    case 'hill':
      return <path d={`M${d.x - d.w / 2} ${d.base} Q${d.x} ${d.base - d.h * 2} ${d.x + d.w / 2} ${d.base} Z`} fill={d.fill} {...line('#8FB27A')} />
    case 'star':
      return <Star x={d.x} y={d.y} r={d.r} />
    case 'building': {
      const rows = Math.floor((d.base - d.top - 30) / 66)
      return (
        <g>
          <rect x={d.x - d.w / 2} y={d.top} width={d.w} height={d.base - d.top} rx={10} fill={d.fill} {...line('#A59AAE')} />
          {Array.from({ length: rows }, (_, r) => (
            <g key={r} fill="#FBF8F2">
              <rect x={d.x - d.w / 2 + 16} y={d.top + 22 + r * 66} width={26} height={32} rx={6} />
              <rect x={d.x + d.w / 2 - 42} y={d.top + 22 + r * 66} width={26} height={32} rx={6} />
            </g>
          ))}
        </g>
      )
    }
    case 'window':
      return (
        <g>
          <rect x={d.x - d.w / 2} y={d.y} width={d.w} height={d.h} rx={14} fill={d.view === 'night' ? '#5B63A0' : '#D8E7F5'} {...line('#C9A57E', 10)} />
          {d.view === 'night' ? <Star x={d.x - d.w * 0.22} y={d.y + d.h * 0.3} r={13} /> : <Cloud x={d.x - d.w * 0.3} y={d.y + d.h * 0.32} k={0.55} />}
          {d.view === 'night' ? <circle cx={d.x + d.w * 0.22} cy={d.y + d.h * 0.62} r={20} fill="#F6DE96" /> : <circle cx={d.x + d.w * 0.24} cy={d.y + d.h * 0.66} r={20} fill="#F6D26A" />}
          <path d={`M${d.x} ${d.y} V${d.y + d.h} M${d.x - d.w / 2} ${d.y + d.h / 2} H${d.x + d.w / 2}`} stroke="#C9A57E" strokeWidth={8} />
        </g>
      )
    case 'shelf': {
      const cs = ['#E8907E', '#8DB8D8', '#EED37E', '#9FCB9A', '#B79BCB', '#E8907E']
      const n = Math.floor((d.w - 30) / 32)
      return (
        <g>
          {Array.from({ length: n }, (_, i) => (
            <rect key={i} x={d.x - d.w / 2 + 16 + i * 32} y={d.y - 58 + (i % 3) * 6} width={26} height={58 - (i % 3) * 6} rx={4} fill={cs[i % cs.length]} {...line('#8F6E4B', 3)} />
          ))}
          <rect x={d.x - d.w / 2} y={d.y} width={d.w} height={16} rx={5} fill="#D9B98E" {...line('#8F6E4B', 4)} />
        </g>
      )
    }
    case 'frame':
      return (
        <g>
          <rect x={d.x - d.w / 2} y={d.y} width={d.w} height={d.h} rx={8} fill="#FBF8F2" {...line('#C9A57E', 8)} />
          <path d={`M${d.x - d.w * 0.32} ${d.y + d.h * 0.8} l${d.w * 0.22} ${-d.h * 0.42} l${d.w * 0.16} ${d.h * 0.24} l${d.w * 0.1} ${-d.h * 0.12} l${d.w * 0.16} ${d.h * 0.3} Z`} fill="#9FCB9A" />
          <circle cx={d.x + d.w * 0.22} cy={d.y + d.h * 0.28} r={d.h * 0.1} fill="#F6DE96" />
        </g>
      )
    case 'rug':
      return <ellipse cx={d.x} cy={d.y} rx={d.w / 2} ry={24} fill={d.fill} {...line('#C9A6B4', 4)} />
    case 'lamp':
      return (
        <g>
          <path d={`M${d.x} ${d.base} V${d.base - 230}`} {...line('#8F6E4B', 8)} />
          <ellipse cx={d.x} cy={d.base} rx={36} ry={10} fill="#C9A57E" />
          <path d={`M${d.x - 46} ${d.base - 220} L${d.x - 28} ${d.base - 296} H${d.x + 28} L${d.x + 46} ${d.base - 220} Z`} fill="#F4D58A" {...line('#C9A257')} />
        </g>
      )
    case 'fence':
      return (
        <g {...line('#C9A57E', 10)}>
          <path d={`M${d.x0} ${d.base - 48} H${d.x1} M${d.x0} ${d.base - 20} H${d.x1}`} />
          {Array.from({ length: Math.floor((d.x1 - d.x0) / 70) + 1 }, (_, i) => (
            <path key={i} d={`M${d.x0 + i * 70} ${d.base - 70} V${d.base}`} />
          ))}
        </g>
      )
    case 'seaweed':
      return <path d={`M${d.x} ${d.base} q-26 ${-d.h * 0.25} 0 ${-d.h * 0.5} q26 ${-d.h * 0.25} 0 ${-d.h * 0.5}`} fill="none" {...line('#6FA77A', 16)} />
    case 'bubble':
      return <circle cx={d.x} cy={d.y} r={d.r} fill="#E6F3F8" {...line('#8CB9D0', 4)} />
    case 'flower':
      return (
        <g>
          <path d={`M${d.x} ${d.base} V${d.base - 46}`} {...line('#6E9E58', 6)} />
          <Blob c={[[d.x - 13, d.base - 52, 11], [d.x + 13, d.base - 52, 11], [d.x, d.base - 64, 11], [d.x, d.base - 40, 11]]} fill={d.fill} stroke="#B9806E" w={3} />
          <circle cx={d.x} cy={d.base - 52} r={7} fill="#F6DE96" />
        </g>
      )
    case 'path':
      return <path d={`M${d.x0} ${d.y + 22} Q${(d.x0 + d.x1) / 2} ${d.y - 30} ${d.x1} ${d.y + 22} L${d.x1} ${d.y + 34} Q${(d.x0 + d.x1) / 2} ${d.y - 14} ${d.x0} ${d.y + 34} Z`} fill="#EBDDBB" {...line('#CDB98C', 4)} />
  }
}

/** 先畫在地面後面的（遠的山、樓、雲、星星、牆上的東西），地面，再畫地上的（小路、地毯、柵欄、花、海草） */
const BACK = new Set(['cloud', 'mountain', 'hill', 'star', 'building', 'window', 'shelf', 'frame', 'lamp'])

function GroundView({ g, sky }: { g: Ground; sky: Sky }) {
  switch (g.t) {
    case 'flat':
      return <path d={`M0 ${g.y + 4} Q240 ${g.y - 24} 480 ${g.y - 4} T960 ${g.y - 10} V600 H0 Z`} fill={g.fill} {...line(g.stroke)} />
    case 'slope':
      return <path d={`M-10 ${g.y0} L970 ${g.y1} V610 H-10 Z`} fill={g.fill} {...line(g.stroke)} />
    case 'lake':
      return (
        <g>
          <path d={`M0 ${g.y - 70} Q480 ${g.y - 96} 960 ${g.y - 70} V${g.y} H0 Z`} fill="#CFE3B5" {...line('#9FBF86')} />
          <rect y={g.y} width={960} height={600 - g.y} fill="#BFDDEB" />
          <path d={`M0 ${g.y} H960`} {...line('#7FA9C9', 6)} />
        </g>
      )
    case 'floor':
      return (
        <g>
          <rect y={g.y} width={960} height={600 - g.y} fill={g.floor} />
          <rect y={g.y - 10} width={960} height={16} fill="#D2B98C" />
        </g>
      )
    case 'seabed':
      return <path d={`M0 ${g.y} Q160 ${g.y - 26} 320 ${g.y} T640 ${g.y} T960 ${g.y} V600 H0 Z`} fill="#EEDDB0" {...line('#CDB98C')} />
    case 'snow':
      return <path d={`M0 ${g.y + 4} Q240 ${g.y - 24} 480 ${g.y - 4} T960 ${g.y - 10} V600 H0 Z`} fill="#FBF8F2" {...line(sky === 'night' ? '#9DA6C8' : '#B9C9D3')} />
  }
}

export const FreeArtView = memo(function FreeArtView({ art }: { art: FreeArt }) {
  const g = art.ground
  const wall = g.t === 'floor' ? g.wall : SKY[art.sky]
  // 遠的先畫（腳底比較高的在後面）
  const items = art.items.map((it, i) => ({ it, i })).sort((a, b) => a.it.y - b.it.y)
  const lakeY = g.t === 'lake' ? g.y : 0
  return (
    <svg className="sb-page" viewBox={`0 0 ${FW} ${FH}`} width="100%" style={{ display: 'block' }} aria-hidden="true">
      <rect width={FW} height={FH} fill={wall} />
      {art.deco.filter((d) => BACK.has(d.t)).map((d, i) => (
        <DecoView key={`b${i}`} d={d} />
      ))}
      <GroundView g={g} sky={art.sky} />
      {g.t === 'lake' && (
        <g opacity={0.38}>
          {art.items.map((it, i) =>
            art.mirror?.includes(i) ? (
              <g key={`m${i}`} transform={`translate(0 ${2 * it.y}) scale(1 -1)`}>
                <Item it={it} />
              </g>
            ) : null,
          )}
        </g>
      )}
      {g.t === 'lake' && <path d={`M80 ${lakeY + 60} q30 -12 60 0 M560 ${lakeY + 110} q30 -12 60 0 M300 ${lakeY + 170} q30 -12 60 0`} fill="none" stroke="#9CC4DA" strokeWidth={6} strokeLinecap="round" />}
      {art.deco.filter((d) => !BACK.has(d.t)).map((d, i) => (
        <DecoView key={`f${i}`} d={d} />
      ))}
      {items.map(({ it, i }) => (
        <Item key={i} it={it} />
      ))}
    </svg>
  )
})
