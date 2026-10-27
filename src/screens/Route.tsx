import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { Egg } from '../art/Egg'
import { Ride } from '../art/Ride'
import { station as stationDef } from '../content/games'
import { samplePath } from '../games/draw/track'
import type { Plan } from '../lib/plan'
import './route.css'

const INK = '#2E2A25'
/** 從左下開到右上的小路；終點是恐龍蛋 */
const ROAD = 'M60 650 C230 660 240 500 400 500 S 600 640 780 560 S 930 330 1140 300'
const EASE = [0.22, 1, 0.36, 1] as const

/** 一面小旗：完成的站旗子塗滿並打勾，還沒到的只有外框（不能只靠顏色區分） */
function Flag({ done, color, scale = 1 }: { done: boolean; color: string; scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <path d="M0 0 V-74" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M2 -74 L50 -60 L2 -45 Z" fill={done ? color : '#FBF8F2'} stroke={done ? color : '#B9AE9C'} strokeWidth={3.5} strokeLinejoin="round" />
      {done && <path d="M13 -61 L19 -55 L30 -66" fill="none" stroke="#FBF8F2" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />}
      <circle cx={0} cy={-76} r={4.5} fill={INK} />
    </g>
  )
}

/**
 * 開局的今日路線（benchmark 手法 8，Plan & Play 的「先計畫」）：
 * 今天要去的每一站插著一面小旗，終點是恐龍蛋；豆豆的車停在現在要去的那一站前面。
 */
export function RouteMap({ plan }: { plan: Plan }) {
  const n = plan.items.length
  const cur = plan.items.findIndex((i) => !i.done)
  const pts = useMemo(() => samplePath(ROAD, 4), [])
  const at = (f: number) => pts[Math.round(f * (pts.length - 1))]
  const stops = plan.items.map((it, i) => ({ ...it, p: at((i + 0.8) / (n + 0.6)), st: stationDef(it.station) }))
  const egg = at(1)
  // 車子停在下一站前面一點點（第一站之前就是起點）
  const car = at(cur <= 0 ? 0.035 : (cur - 0.25 + 0.8) / (n + 0.6))
  const doneCount = plan.items.filter((i) => i.done).length

  return (
    <svg className="route-map" viewBox="0 70 1200 786" preserveAspectRatio="xMidYMid meet" aria-label={`今天有 ${n} 站`}>
      {/* 給爸爸看的小標：跟首頁標題同一種淡墨字 */}
      <text x={34} y={112} className="route-title">
        今天的路線 · {n} 站
      </text>
      {/* 路：先畫底色，再畫中間的虛線 */}
      <motion.path d={ROAD} fill="none" stroke="#E2D8C6" strokeWidth={70} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
      <motion.path d={ROAD} fill="none" stroke="#EFE8DA" strokeWidth={56} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
      <motion.path d={ROAD} fill="none" stroke="#FBF8F2" strokeWidth={5} strokeDasharray="18 20" strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.4 }} />

      {stops.map((s, i) => {
        const now = i === cur
        return (
          <g key={i} transform={`translate(${s.p.x} ${s.p.y})`}>
            <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.45 + i * 0.16 }}>
              {now && (
                <motion.circle r={66} fill="none" stroke={s.st.deep} strokeWidth={5} animate={{ r: [62, 74, 62], opacity: [0.8, 0.15, 0.8] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
              )}
              <circle r={56} fill={s.st.tint} stroke={s.done ? s.st.deep : '#FBF8F2'} strokeWidth={7} />
              <g transform="translate(-34 -34)" opacity={s.done ? 0.55 : 1}>
                <Emoji name={s.st.icon} size={68} />
              </g>
              <text y={92} textAnchor="middle" className="route-name">
                {s.st.name}
              </text>
            </motion.g>
            {/* 旗子插在站牌右上角，晚一點升起來 */}
            <g transform="translate(38 -40)">
              <motion.g style={{ originX: 0, originY: 1 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.75 + i * 0.16 }}>
                <motion.g animate={now ? { rotate: [0, -5, 0, 4, 0] } : {}} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}>
                  <Flag done={s.done} color={s.st.deep} scale={0.9} />
                </motion.g>
              </motion.g>
            </g>
          </g>
        )
      })}

      {/* 終點：今天的恐龍蛋，裂痕就是今天已經走完的站數 */}
      <motion.g initial={{ y: -120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.5 + n * 0.16 }}>
        {/* Egg 只給寬度，放在 foreignObject 裡讓高度照比例 */}
        <foreignObject x={egg.x - 62} y={egg.y - 150} width={124} height={156} style={{ overflow: 'visible' }}>
          <Egg cracks={doneCount} size={124} wobble />
        </foreignObject>
      </motion.g>

      <g transform={`translate(${car.x} ${car.y})`}>
        <motion.g initial={{ x: -260, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 60, damping: 13, delay: 0.3 }}>
          <g transform="translate(-95 -128)">
            <Ride who="dodo" width={190} moving mood="happy" />
          </g>
        </motion.g>
      </g>
    </svg>
  )
}

/** 轉場畫面上方的小路線：每完成一站，一面旗子亮起；最後是恐龍蛋 */
export function RouteStrip({ plan }: { plan: Plan }) {
  const cur = plan.items.findIndex((i) => !i.done)
  return (
    <div className="route-strip" aria-hidden="true">
      {plan.items.map((it, i) => {
        const st = stationDef(it.station)
        return (
          <div key={i} className={`route-chip${it.done ? ' is-done' : ''}${i === cur ? ' is-now' : ''}`}>
            <svg viewBox="-6 -84 62 92" width={30}>
              <Flag done={it.done} color={st.deep} />
            </svg>
          </div>
        )
      })}
      <div className="route-chip egg">
        <Egg cracks={plan.items.filter((i) => i.done).length} size={30} />
      </div>
    </div>
  )
}
