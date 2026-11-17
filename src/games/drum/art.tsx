// 鼓聲停的圖（T-160）：舞台背景、鼓、選玩法的小圖示，都是自己畫的 SVG（遠景的小東西是 Fluent Emoji）；跳舞的角色是故事繪本的角色（../picnic/art 的 Critter）。
// 背景全部靜止（MOTION-2）：畫面上會動的只有鼓（鼓在響的提示）和孩子點的那個角色。
import { memo, useId } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Critter } from '../picnic/art'
import type { StageId } from './plan'

const INK = '#2E2A25'

interface StageDef {
  wall: [string, string]
  floor: string
  /** 舞台的木地板（橢圓）顏色 */
  deck: string
  deco: [string, number, number, number][]
  extra?: 'curtain' | 'bubbles' | 'stars' | 'city' | 'dunes' | 'stripes'
}

const STAGES: Record<StageId, StageDef> = {
  theater: { wall: ['#7A2E3A', '#A8475A'], floor: '#6B4A33', deck: '#C99A62', extra: 'curtain', deco: [['glowing-star', 0.5, 0.06, 0.1]] },
  forest: { wall: ['#CFE6D0', '#E8F2E2'], floor: '#8FBF7A', deck: '#B98E4D', deco: [['evergreen-tree', 0.04, 0.12, 0.34], ['evergreen-tree', 0.84, 0.1, 0.36], ['mushroom', 0.2, 0.42, 0.1]] },
  beach: { wall: ['#BFE3F2', '#E6F4F8'], floor: '#F1DDA8', deck: '#D9B26F', deco: [['sun', 0.08, 0.05, 0.14], ['beach-with-umbrella', 0.82, 0.32, 0.16], ['sailboat', 0.62, 0.2, 0.1]] },
  sea: { wall: ['#5FA8CF', '#9ACDE4'], floor: '#E8D7A6', deck: '#F2C7A3', extra: 'bubbles', deco: [['tropical-fish', 0.1, 0.2, 0.1], ['fish', 0.82, 0.12, 0.1], ['spouting-whale', 0.62, 0.06, 0.12], ['crab', 0.88, 0.44, 0.09]] },
  space: { wall: ['#1F2547', '#3B4478'], floor: '#5B5F7E', deck: '#8D90AE', extra: 'stars', deco: [['ringed-planet', 0.08, 0.08, 0.16], ['rocket', 0.84, 0.12, 0.14], ['shooting-star', 0.6, 0.04, 0.09]] },
  snow: { wall: ['#DDE8F2', '#F2F6FA'], floor: '#F4F6F8', deck: '#B5CBE0', deco: [['snowman', 0.06, 0.24, 0.22], ['snowflake', 0.4, 0.06, 0.07], ['evergreen-tree', 0.86, 0.14, 0.3]] },
  farm: { wall: ['#D9ECF5', '#F0F6F2'], floor: '#B9D88F', deck: '#C99A62', deco: [['house-with-garden', 0.04, 0.2, 0.22], ['tractor', 0.84, 0.3, 0.14], ['sunflower', 0.7, 0.26, 0.12]] },
  city: { wall: ['#F2D9C2', '#F8EBDD'], floor: '#9D9A94', deck: '#C9C3B8', extra: 'city', deco: [['vertical-traffic-light', 0.9, 0.24, 0.16], ['bus', 0.04, 0.38, 0.12]] },
  desert: { wall: ['#F7DDB0', '#FBEBD0'], floor: '#E6C285', deck: '#C99A62', extra: 'dunes', deco: [['sun-with-face', 0.82, 0.05, 0.14], ['rock', 0.1, 0.42, 0.1]] },
  jungle: { wall: ['#BFE0B4', '#DCEDCF'], floor: '#78AE62', deck: '#A6814F', deco: [['deciduous-tree', 0.02, 0.06, 0.36], ['herb', 0.24, 0.4, 0.1], ['deciduous-tree', 0.84, 0.08, 0.34], ['butterfly', 0.62, 0.1, 0.08]] },
  candy: { wall: ['#F9D5E3', '#FCE9F0'], floor: '#F2B8CC', deck: '#FFFFFF', extra: 'stripes', deco: [['lollipop', 0.06, 0.18, 0.18], ['cupcake', 0.86, 0.32, 0.14], ['doughnut', 0.7, 0.08, 0.1]] },
  rainbow: { wall: ['#DDEFF7', '#F1F8FA'], floor: '#A9D49A', deck: '#F1D27C', deco: [['rainbow', 0.28, 0.0, 0.32], ['cloud', 0.04, 0.12, 0.12], ['cloud', 0.86, 0.1, 0.1]] },
  moon: { wall: ['#2F3E66', '#56679A'], floor: '#4E6E58', deck: '#8C96A0', extra: 'stars', deco: [['crescent-moon', 0.82, 0.05, 0.16], ['star', 0.12, 0.08, 0.07], ['owl', 0.06, 0.32, 0.12]] },
  garden: { wall: ['#E4F1F6', '#F4F8F1'], floor: '#B5D99A', deck: '#C99A62', deco: [['tulip', 0.06, 0.36, 0.12], ['sunflower', 0.14, 0.22, 0.2], ['blossom', 0.86, 0.38, 0.08], ['honeybee', 0.7, 0.12, 0.07]] },
}

export const STAGE_COUNT = Object.keys(STAGES).length

/** 舞台：背景牆、地面、中間一個木頭（或其他顏色的）圓舞台，角色站在上面 */
export const Stage = memo(function Stage({ id }: { id: StageId }) {
  const p = STAGES[id]
  const uid = useId().replace(/:/g, '')
  const W = 1200
  const H = 800
  const hy = H * 0.56
  return (
    <svg className="dr-stage" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id={`w${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.wall[0]} />
          <stop offset="1" stopColor={p.wall[1]} />
        </linearGradient>
      </defs>
      <rect width={W} height={hy + 2} fill={`url(#w${uid})`} />
      {p.extra === 'stars' && [70, 230, 380, 520, 700, 860, 1010, 1140].map((x, i) => <circle key={x} cx={x} cy={30 + ((i * 89) % 280)} r={3 + (i % 3)} fill="#F8EFC8" />)}
      {p.extra === 'bubbles' && [120, 300, 860, 1040].map((x, i) => <circle key={x} cx={x} cy={80 + i * 70} r={10 + (i % 3) * 5} fill="none" stroke="#FFFFFF" strokeWidth={4} opacity={0.7} />)}
      {p.extra === 'city' && (
        <g fill="#D7BFA6" stroke={INK} strokeWidth={4} opacity={0.75}>
          <rect x={40} y={150} width={140} height={hy - 150} />
          <rect x={200} y={90} width={110} height={hy - 90} />
          <rect x={880} y={120} width={130} height={hy - 120} />
          <rect x={1030} y={190} width={140} height={hy - 190} />
        </g>
      )}
      {p.extra === 'dunes' && (
        <>
          <ellipse cx={220} cy={hy + 20} rx={380} ry={120} fill="#EFCF96" />
          <ellipse cx={1000} cy={hy + 30} rx={420} ry={110} fill="#EFCF96" />
        </>
      )}
      {p.extra === 'stripes' && Array.from({ length: 12 }, (_, i) => <rect key={i} x={i * 100} y={0} width={50} height={hy} fill="#FFFFFF" opacity={0.35} />)}
      <rect y={hy} width={W} height={H - hy} fill={p.floor} />
      {p.extra === 'curtain' && (
        <g stroke={INK} strokeWidth={5}>
          <path d={`M0 0 H260 Q200 ${hy * 0.5} 150 ${hy + 60} H0 Z`} fill="#C0394A" />
          <path d={`M${W} 0 H${W - 260} Q${W - 200} ${hy * 0.5} ${W - 150} ${hy + 60} H${W} Z`} fill="#C0394A" />
          <path d={`M0 0 H${W} V60 Q${W / 2} 110 0 60 Z`} fill="#D9566A" />
        </g>
      )}
      {/* 圓舞台（角色站在上面） */}
      <ellipse cx={W / 2} cy={H * 0.8} rx={W * 0.3} ry={H * 0.09} fill={p.deck} stroke={INK} strokeWidth={5} />
      <ellipse cx={W / 2} cy={H * 0.79} rx={W * 0.26} ry={H * 0.06} fill="#FFFFFF" opacity={0.18} />
      {p.deco.map(([icon, x, y, s], i) => (
        <svg key={i} x={x * W} y={y * H} width={s * H} height={s * H}>
          <Emoji name={icon} />
        </svg>
      ))}
    </svg>
  )
})

/** 一個鼓（側面）：hit 每變一次鼓皮震一下、鼓棒敲下去；playing false：鼓棒交叉放在鼓上、旁邊沒有音符（鼓停了，靜音也看得出來，LANG-3） */
export function DrumArt({ hit, playing }: { hit: number; playing: boolean }) {
  return (
    <svg viewBox="0 0 220 220" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <g stroke={INK} strokeWidth={6} strokeLinejoin="round">
        <path d="M30 92 V170 Q110 206 190 170 V92" fill="#E0604E" />
        <path d="M30 108 L70 182 M190 108 L150 182 M70 98 L110 190 L150 98" fill="none" stroke="#F1D27C" strokeWidth={6} />
        <path d="M30 170 Q110 206 190 170" fill="none" />
        <motion.ellipse key={hit} cx={110} cy={92} rx={80} ry={24} fill="#FBF3E2" initial={false} animate={playing && hit ? { ry: [24, 18, 24] } : { ry: 24 }} transition={{ duration: 0.16 }} />
      </g>
      {playing ? (
        <motion.g key={`s${hit}`} style={{ transformOrigin: '150px 40px' }} initial={false} animate={hit ? { rotate: [0, 16, 0] } : {}} transition={{ duration: 0.16 }}>
          <path d="M196 10 L132 78" stroke="#8A5A34" strokeWidth={10} strokeLinecap="round" />
          <circle cx={132} cy={78} r={10} fill="#C99A62" stroke={INK} strokeWidth={4} />
        </motion.g>
      ) : (
        <g>
          <path d="M48 66 L172 104" stroke="#8A5A34" strokeWidth={10} strokeLinecap="round" />
          <path d="M48 104 L172 66" stroke="#8A5A34" strokeWidth={10} strokeLinecap="round" />
        </g>
      )}
      {playing && (
        <g fill={INK}>
          <path d="M20 40 V8 L40 4 V34" stroke={INK} strokeWidth={5} fill="none" />
          <ellipse cx={15} cy={42} rx={8} ry={6} />
          <ellipse cx={35} cy={36} rx={8} ry={6} />
        </g>
      )}
    </svg>
  )
}

/** 選玩法的小圖示：一個鼓、旁邊一隻恐龍舉手跳舞 */
export function DrumPickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <ellipse cx={150} cy={178} rx={78} ry={14} fill="#C99A62" stroke={INK} strokeWidth={5} />
      <svg x={96} y={36} width={112} height={144}>
        <g transform="rotate(-8 56 140)">
          <Critter who="dodo" />
        </g>
      </svg>
      <svg x={14} y={84} width={92} height={92}>
        <DrumArt hit={0} playing />
      </svg>
    </svg>
  )
}
