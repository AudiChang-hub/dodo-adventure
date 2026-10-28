import { useMemo, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { Egg } from '../art/Egg'
import { Ride } from '../art/Ride'
import { station as stationDef } from '../content/games'
import { theme as themeDef, type ThemeDef } from '../content/themes'
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
  const th = themeDef(plan.theme)
  if (th) return <ThemeRouteMap plan={plan} th={th} />
  return <StationRouteMap plan={plan} />
}

function StationRouteMap({ plan }: { plan: Plan }) {
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
  const th = themeDef(plan.theme)
  if (th) return <ThemeStrip plan={plan} th={th} cur={cur} />
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

// ── 主題式冒險（content/themes.ts）──────────────────────────────
// 路線上不再是「字母森林、數字工地」這些站名與站點圖示，而是故事的一格一格：公車站牌 → 公車 → 紅綠燈 → 大橋 → 動物園。
// 給孩子看的只有圖和英文標題；給大人看的只有一行淡淡的中文小字。

/** 主題路線上第 i 站的故事圖 */
export const stopIcon = (th: ThemeDef, i: number) => th.stops[Math.min(i, th.stops.length - 1)]

/** 站在路上的位置（0–1）：最後一段留給故事的終點 */
const stopAt = (i: number, n: number) => (i + 0.75) / (n + 0.9)

function ThemeRouteMap({ plan, th }: { plan: Plan; th: ThemeDef }) {
  const n = plan.items.length
  const cur = plan.items.findIndex((i) => !i.done)
  const pts = useMemo(() => samplePath(ROAD, 4), [])
  const at = (f: number) => pts[Math.round(Math.min(1, Math.max(0, f)) * (pts.length - 1))]
  const stops = plan.items.map((it, i) => ({ ...it, p: at(stopAt(i, n)), icon: stopIcon(th, i) }))
  const end = at(0.985)
  // 車子停在下一站前面一點點（第一站之前就是起點）；走過的路塗上主題的淡色
  const carF = cur <= 0 ? 0.035 : stopAt(cur - 0.28, n)
  const car = at(carF)
  const doneCount = plan.items.filter((i) => i.done).length
  const cardW = Math.max(400, 150 + th.title.length * 20)

  return (
    <svg className="route-map" viewBox="0 70 1200 786" preserveAspectRatio="xMidYMid meet" aria-label={th.title}>
      {/* 標題卡：故事的名字（英文，讓孩子看到「字」），下面一行是給爸爸看的中文 */}
      <motion.g initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}>
        <g transform="translate(40 172)">
          <rect width={cardW} height={108} rx={54} fill="#FBF8F2" />
          <rect width={cardW} height={108} rx={54} fill="none" stroke={th.deep} strokeOpacity={0.2} strokeWidth={3} />
          <circle cx={54} cy={54} r={40} fill={th.tint} />
          <g transform="translate(24 24)">
            <Emoji name={th.icon} size={60} />
          </g>
          <text x={112} y={60} className="route-theme-title">
            {th.title}
          </text>
          <text x={114} y={88} className="route-theme-sub">
            今天的故事：{th.zh} · {n} 站
          </text>
        </g>
      </motion.g>

      <motion.path d={ROAD} fill="none" stroke="#E2D8C6" strokeWidth={70} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
      <motion.path d={ROAD} fill="none" stroke="#EFE8DA" strokeWidth={56} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
      {doneCount > 0 && (
        <motion.path d={ROAD} fill="none" stroke={th.tint} strokeWidth={56} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: cur < 0 ? 1 : carF }} transition={{ duration: 0.9, ease: EASE, delay: 0.5 }} />
      )}
      <motion.path d={ROAD} fill="none" stroke="#FBF8F2" strokeWidth={5} strokeDasharray="18 20" strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.4 }} />

      {stops.map((s, i) => {
        const now = i === cur
        return (
          <g key={i} transform={`translate(${s.p.x} ${s.p.y})`}>
            <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.45 + i * 0.16 }}>
              {now && <motion.circle r={66} fill="none" stroke={th.deep} strokeWidth={5} animate={{ r: [62, 74, 62], opacity: [0.7, 0.12, 0.7] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />}
              <circle r={56} fill="#FBF8F2" stroke={s.done ? th.deep : th.tint} strokeWidth={7} />
              <g transform="translate(-36 -36)" opacity={s.done ? 0.5 : 1}>
                <Emoji name={s.icon} size={72} />
              </g>
              {/* 走過的站：右下角一個打勾的小圓（不能只靠顏色區分） */}
              {s.done && (
                <g transform="translate(40 40)">
                  <circle r={17} fill={th.deep} stroke="#FBF8F2" strokeWidth={4} />
                  <path d="M-7 0 L-2 5 L7 -5" fill="none" stroke="#FBF8F2" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
            </motion.g>
          </g>
        )
      })}

      {/* 故事的終點：大大的目的地，恐龍蛋在旁邊（裂痕＝今天走完的站數） */}
      <g transform={`translate(${end.x} ${end.y})`}>
        <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.55 + n * 0.16 }}>
          <circle r={80} fill={th.tint} stroke="#FBF8F2" strokeWidth={8} />
          {th.finale.length > 1 ? (
            <>
              <g transform="translate(-84 -26)">
                <Emoji name={th.finale[1]} size={62} />
              </g>
              <g transform="translate(-32 -56)">
                <Emoji name={th.finale[0]} size={90} />
              </g>
            </>
          ) : (
            <g transform="translate(-48 -48)">
              <Emoji name={th.finale[0]} size={96} />
            </g>
          )}
        </motion.g>
      </g>
      <motion.g initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.75 + n * 0.16 }}>
        <foreignObject x={end.x - 40} y={end.y + 74} width={84} height={106} style={{ overflow: 'visible' }}>
          <Egg cracks={doneCount} size={84} wobble />
        </foreignObject>
      </motion.g>

      <g transform={`translate(${car.x} ${car.y})`}>
        <motion.g initial={{ x: -260, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 60, damping: 13, delay: 0.3 }}>
          <g transform="translate(-95 -128)">
            <Ride who={th.host} width={190} moving mood="happy" />
          </g>
        </motion.g>
      </g>
    </svg>
  )
}

/** 轉場畫面上方的故事小路線：每一格是那一站的故事圖，走過的打勾；最後是恐龍蛋 */
function ThemeStrip({ plan, th, cur }: { plan: Plan; th: ThemeDef; cur: number }) {
  return (
    <div className="route-strip" aria-hidden="true">
      {plan.items.map((it, i) => (
        <div key={i} className={`route-chip theme${it.done ? ' is-done' : ''}${i === cur ? ' is-now' : ''}`} style={{ '--deep': th.deep } as CSSProperties}>
          <Emoji name={stopIcon(th, i)} size={28} className="route-chip-pic" />
          {it.done && (
            <svg className="route-chip-tick" viewBox="-10 -10 20 20" aria-hidden="true">
              <circle r={9} fill={th.deep} />
              <path d="M-4 0 L-1 3 L4 -3" fill="none" stroke="#FBF8F2" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      ))}
      <div className="route-chip egg">
        <Egg cracks={plan.items.filter((i) => i.done).length} size={30} />
      </div>
    </div>
  )
}
