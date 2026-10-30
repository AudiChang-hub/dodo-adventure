import { useEffect, useRef, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { onSpeakLevel } from '../lib/audio'
import type { Speaker } from '../content/lines'
import './dino.css'

export type Mood = 'idle' | 'happy' | 'cheer' | 'sleep' | 'peek'

const INK = '#2E2A25'
const CHEEK = '#F2A9A0'
const MOUTH = '#7A3E3A'
const TONGUE = '#E9908C'

const PAL = {
  dodo: { body: '#8FCBAA', deep: '#5FA883', belly: '#D5EEDF', accent: '#6DB591' },
  bobo: { body: '#F0B088', deep: '#D38A5E', belly: '#F9DCC6', accent: '#F7D0AF', horn: '#FFF4E2', dot: '#E8A47C' },
  momo: { body: '#A3C4E4', deep: '#6F9CC8', belly: '#D8E7F5', accent: '#C6DCF0' },
}

/** 嘴巴：說話時依音量張開，平常是微笑 */
function Mouth({ who, x, y, w }: { who: Speaker; x: number; y: number; w: number }) {
  const smile = useRef<SVGPathElement>(null)
  const open = useRef<SVGGElement>(null)
  useEffect(
    () =>
      onSpeakLevel((s, level) => {
        const lv = s === who ? level : 0
        if (open.current) open.current.style.transform = `scaleY(${Math.max(0.001, lv)})`
        if (smile.current) smile.current.style.opacity = lv > 0.06 ? '0' : '1'
      }),
    [who],
  )
  return (
    <g>
      <path ref={smile} d={`M${x - w} ${y - 3} Q${x} ${y + w * 0.75} ${x + w} ${y - 4}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <g ref={open} style={{ transformOrigin: `${x}px ${y - 2}px`, transformBox: 'view-box', transform: 'scaleY(0.001)' }}>
        <ellipse cx={x} cy={y + 4} rx={w * 0.85} ry={w * 0.75} fill={MOUTH} />
        <ellipse cx={x + 1} cy={y + w * 0.55 + 4} rx={w * 0.5} ry={w * 0.28} fill={TONGUE} />
      </g>
    </g>
  )
}

function Eye({ x, y, r, mood }: { x: number; y: number; r: number; mood: Mood }) {
  if (mood === 'sleep')
    return <path d={`M${x - r} ${y} Q${x} ${y + r} ${x + r} ${y}`} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
  if (mood === 'cheer')
    return <path d={`M${x - r} ${y + 2} Q${x} ${y - r * 1.3} ${x + r} ${y + 2}`} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
  return (
    <g className="dino-blink" style={{ transformOrigin: `${x}px ${y}px` }}>
      <ellipse cx={x} cy={y} rx={r * 0.82} ry={r} fill={INK} />
      <circle cx={x + r * 0.3} cy={y - r * 0.38} r={r * 0.32} fill="#fff" />
    </g>
  )
}

export function DodoArt({ mood }: { mood: Mood }) {
  const p = PAL.dodo
  const s = { stroke: p.deep, strokeWidth: 3.5, strokeLinejoin: 'round' as const }
  return (
    <g>
      {[[58, 120], [76, 106], [96, 98], [116, 46], [134, 36]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y + 6} l9 -17 l11 15 Z`} fill={p.accent} {...s} />
      ))}
      <path d="M80 150 C52 152 24 140 6 116 C30 128 54 130 82 126 Z" fill={p.body} {...s} />
      <ellipse cx={92} cy={190} rx={20} ry={15} fill={p.deep} />
      <ellipse cx={138} cy={192} rx={19} ry={14} fill={p.body} {...s} />
      <g>
        <ellipse cx={114} cy={148} rx={56} ry={46} fill={p.body} {...s} />
        <ellipse cx={132} cy={158} rx={29} ry={31} fill={p.belly} />
      </g>
      <motion.g
        style={{ originX: '150px', originY: '140px' }}
        animate={{ rotate: mood === 'cheer' ? -70 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 12 }}
      >
        <ellipse cx={156} cy={140} rx={11} ry={6.5} fill={p.body} {...s} />
      </motion.g>
      <ellipse cx={152} cy={82} rx={60} ry={48} fill={p.body} {...s} />
      <circle cx={204} cy={72} r={2.4} fill={p.deep} />
      <circle cx={196} cy={69} r={2.4} fill={p.deep} />
      <Eye x={168} y={70} r={10} mood={mood} />
      <ellipse cx={184} cy={98} rx={10} ry={6} fill={CHEEK} opacity={0.85} />
      <Mouth who="dodo" x={188} y={104} w={13} />
    </g>
  )
}

export function BoboArt({ mood }: { mood: Mood }) {
  const p = PAL.bobo
  const s = { stroke: p.deep, strokeWidth: 3.5, strokeLinejoin: 'round' as const }
  const dots = [-150, -120, -90, -60, -30, 0, 30].map((a) => {
    const r = (a * Math.PI) / 180
    return [160 + Math.cos(r) * 42, 88 + Math.sin(r) * 42]
  })
  return (
    <g>
      <path d="M70 150 C44 152 22 142 8 124 C28 134 50 136 72 132 Z" fill={p.body} {...s} />
      <ellipse cx={84} cy={190} rx={15} ry={13} fill={p.deep} />
      <ellipse cx={158} cy={192} rx={15} ry={13} fill={p.deep} />
      <ellipse cx={108} cy={192} rx={16} ry={14} fill={p.body} {...s} />
      <ellipse cx={184} cy={190} rx={16} ry={14} fill={p.body} {...s} />
      <g>
        <ellipse cx={126} cy={150} rx={72} ry={44} fill={p.body} {...s} />
        <ellipse cx={138} cy={166} rx={40} ry={19} fill={p.belly} />
      </g>
      <circle cx={160} cy={88} r={54} fill={p.accent} {...s} />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={6} fill={p.dot} />
      ))}
      <path d="M176 76 L168 30 L192 72 Z" fill={p.horn} {...s} />
      <path d="M200 78 L210 34 L218 82 Z" fill={p.horn} {...s} />
      <ellipse cx={192} cy={108} rx={48} ry={38} fill={p.body} {...s} />
      <path d="M228 98 L250 84 L236 112 Z" fill={p.horn} {...s} />
      <Eye x={200} y={100} r={9.5} mood={mood} />
      <ellipse cx={216} cy={124} rx={10} ry={6} fill={CHEEK} opacity={0.85} />
      <Mouth who="bobo" x={214} y={130} w={12} />
    </g>
  )
}

export function MomoArt({ mood }: { mood: Mood }) {
  const p = PAL.momo
  const s = { stroke: p.deep, strokeWidth: 3.5, strokeLinejoin: 'round' as const }
  const neck = 'M146 170 C164 132 166 92 178 60'
  return (
    <g>
      <path d="M60 190 C36 194 16 186 4 172 C22 178 42 178 62 174 Z" fill={p.body} {...s} />
      <ellipse cx={80} cy={222} rx={14} ry={12} fill={p.deep} />
      <ellipse cx={140} cy={224} rx={14} ry={12} fill={p.deep} />
      <ellipse cx={100} cy={224} rx={15} ry={13} fill={p.body} {...s} />
      <ellipse cx={162} cy={222} rx={15} ry={13} fill={p.body} {...s} />
      <g>
        <ellipse cx={114} cy={188} rx={62} ry={38} fill={p.body} {...s} />
        <ellipse cx={124} cy={202} rx={36} ry={16} fill={p.belly} />
        <circle cx={90} cy={176} r={8} fill={p.accent} />
        <circle cx={112} cy={166} r={6} fill={p.accent} />
        <circle cx={72} cy={192} r={5} fill={p.accent} />
      </g>
      <motion.g
        style={{ originX: '146px', originY: '170px' }}
        animate={{ rotate: mood === 'peek' ? [0, -4, 0] : mood === 'cheer' ? [0, 5, -3, 0] : 0 }}
        // 探頭：歪一下頭就停（不一直晃）
        transition={{ duration: mood === 'peek' ? 3 : 0.8, ease: 'easeInOut' }}
      >
        <path d={neck} fill="none" stroke={p.deep} strokeWidth={41} strokeLinecap="round" />
        <path d={neck} fill="none" stroke={p.body} strokeWidth={34} strokeLinecap="round" />
        <circle cx={162} cy={124} r={5} fill={p.accent} />
        <circle cx={170} cy={96} r={4} fill={p.accent} />
        <ellipse cx={190} cy={52} rx={36} ry={25} fill={p.body} {...s} />
        <ellipse cx={180} cy={28} rx={5} ry={8} fill={p.body} {...s} />
        <Eye x={196} y={44} r={8} mood={mood} />
        <ellipse cx={210} cy={60} rx={8} ry={5} fill={CHEEK} opacity={0.85} />
        <Mouth who="momo" x={208} y={64} w={9} />
      </motion.g>
    </g>
  )
}

export const DINO_BOX: Record<Speaker, { w: number; h: number }> = {
  dodo: { w: 230, h: 210 },
  bobo: { w: 258, h: 210 },
  momo: { w: 236, h: 240 },
}

export const DINO_NAME: Record<Speaker, string> = { dodo: '豆豆', bobo: '波波', momo: '莫莫' }

export function DinoArt({ who, mood }: { who: Speaker; mood: Mood }) {
  if (who === 'bobo') return <BoboArt mood={mood} />
  if (who === 'momo') return <MomoArt mood={mood} />
  return <DodoArt mood={mood} />
}

interface DinoProps {
  who: Speaker
  mood?: Mood
  size?: number | string
  flip?: boolean
  onTap?: () => void
  style?: CSSProperties
  className?: string
}

/** 單獨一隻恐龍：出現時眨一次眼、說話時嘴巴會動；開心時跳兩下就停（不一直動） */
export function Dino({ who, mood = 'idle', size = 220, flip, onTap, style, className }: DinoProps) {
  const box = DINO_BOX[who]
  return (
    <motion.svg
      className={className}
      viewBox={`0 0 ${box.w} ${box.h}`}
      width={size}
      style={{ display: 'block', overflow: 'visible', ...style }}
      animate={
        mood === 'cheer'
          ? { y: [0, -34, 0, -16, 0], transition: { duration: 0.9, ease: 'easeOut' } }
          : mood === 'happy'
            ? { y: [0, -10, 0], transition: { duration: 1.4, repeat: 1, ease: 'easeInOut' } }
            : { y: 0 }
      }
      onPointerDown={onTap}
      role={onTap ? 'button' : 'img'}
      aria-label={DINO_NAME[who]}
    >
      <g transform={flip ? `translate(${box.w} 0) scale(-1 1)` : undefined}>
        <DinoArt who={who} mood={mood} />
      </g>
    </motion.svg>
  )
}
