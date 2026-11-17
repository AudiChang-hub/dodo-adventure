// 心情臉（T-160）的小情境動畫：場景（沿用躲在哪裡的場景）＋道具照 data.ts 的時間點移動，主角在 turn 的時候換成那個心情。
// 動畫只跑一次就停（準則 MOTION-2、3）；系統「減少動態效果」打開時，直接停在最後的樣子（MOTION-5）。
import { memo, useEffect, useState, type ReactElement } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Backdrop } from '../where/places'
import { SvgEmoji } from '../PlayEmoji'
import { Critter, type Face } from './critter'
import { TURN, sitLength, type Fx, type Key, type Look, type Sit, type SpeciesId } from './data'

const INK = '#2E2A25'
const L = (c: string, w = 5) => ({ stroke: c, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

/** 主角站的位置（240×280 的方框左上角）；朋友的腳也在地面 */
const HERO = { x: 280, y: 280 }
const GROUND = 560
const BACK_FX: Fx[] = ['confetti', 'snow', 'rain', 'bubbles']

/** 把時間點補齊（沒寫的沿用上一個），最後補一個到整段動畫結束 */
function fillKeys(k: Key[], T: number) {
  const out: Required<Key>[] = []
  let cur: Required<Key> = { t: 0, x: 0, y: 0, s: 1, r: 0, o: 1 }
  for (const key of k) {
    cur = { t: key.t, x: key.x ?? cur.x, y: key.y ?? cur.y, s: key.s ?? cur.s, r: key.r ?? cur.r, o: key.o ?? cur.o }
    out.push(cur)
  }
  if (!out.length) out.push(cur)
  if (out[0].t > 0) out.unshift({ ...out[0], t: 0 })
  if (out[out.length - 1].t < T) out.push({ ...out[out.length - 1], t: T })
  return out
}

/** 一個照時間點移動的東西（內容畫在 (0, 0) 為中心） */
function Mover({ k, T, still, children }: { k: Key[]; T: number; still: boolean; children: ReactElement }) {
  const keys = fillKeys(k, T)
  const last = keys[keys.length - 1]
  const first = keys[0]
  const at = (q: Required<Key>) => ({ x: q.x, y: q.y, scale: q.s, rotate: q.r, opacity: q.o })
  if (still) return <motion.g initial={false} animate={at(last)} style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}>{children}</motion.g>
  return (
    <motion.g
      initial={at(first)}
      animate={{ x: keys.map((q) => q.x), y: keys.map((q) => q.y), scale: keys.map((q) => q.s), rotate: keys.map((q) => q.r), opacity: keys.map((q) => q.o) }}
      transition={{ duration: T / 1000, times: keys.map((q) => q.t / T), ease: 'easeInOut' }}
    >
      {children}
    </motion.g>
  )
}

/** 自己畫的小東西（方框 size，中心在 (0, 0)） */
function Drawn({ look, size }: { look: Look; size: number }) {
  const h = size / 2
  if ('e' in look) {
    if ('half' in look) {
      const id = `half-${look.e}-${look.half}`
      return (
        <g>
          <defs>
            <clipPath id={id}>
              <path d={look.half === 'l' ? `M${-h} ${-h} H${-4} L${6} ${-h * 0.3} L${-6} ${h * 0.3} L${4} ${h} H${-h} Z` : `M${h} ${-h} H${-4} L${6} ${-h * 0.3} L${-6} ${h * 0.3} L${4} ${h} H${h} Z`} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id})`}>
            <SvgEmoji name={look.e} x={-h} y={-h} size={size} />
          </g>
        </g>
      )
    }
    return <SvgEmoji name={look.e} x={-h} y={-h} size={size} flip={look.flip} />
  }
  switch (look.d) {
    case 'block':
      return (
        <g>
          <rect x={-h} y={-h} width={size} height={size} rx={10} fill={look.c} {...L(INK, 5)} />
          <rect x={-h + 12} y={-h + 12} width={size - 24} height={size - 24} rx={6} fill="#fff" opacity={0.28} />
        </g>
      )
    case 'picture':
      return (
        <g>
          <rect x={-h} y={-h * 0.75} width={size} height={size * 0.75} rx={6} fill="#fff" {...L('#B9A58E', 5)} />
          <circle cx={-h * 0.4} cy={-h * 0.3} r={h * 0.18} fill="#F2C94C" />
          <path d={`M${-h + 8} ${h * 0.6} Q${-h * 0.2} ${-h * 0.1} ${h * 0.2} ${h * 0.3} Q${h * 0.5} ${0} ${h - 8} ${h * 0.4} V${h * 0.7} H${-h + 8} Z`} fill="#9CCB7E" />
        </g>
      )
    case 'scribble':
      return <path d={`M${-h * 0.8} ${-h * 0.2} L${-h * 0.5} ${h * 0.4} L${-h * 0.2} ${-h * 0.4} L${h * 0.1} ${h * 0.5} L${h * 0.4} ${-h * 0.5} L${h * 0.7} ${h * 0.3}`} fill="none" {...L('#4A4550', 9)} />
    case 'mud':
      return (
        <g fill="#8C6440" {...L('#5E4128', 3)}>
          <path d={`M${-h * 0.5} 0 q${h * 0.2} -${h * 0.5} ${h * 0.5} -${h * 0.2} q${h * 0.4} -${h * 0.3} ${h * 0.4} ${h * 0.2} q${h * 0.2} ${h * 0.4} -${h * 0.3} ${h * 0.3} q-${h * 0.4} ${h * 0.3} -${h * 0.6} -${h * 0.3} Z`} />
          <circle cx={h * 0.7} cy={-h * 0.5} r={h * 0.1} />
          <circle cx={-h * 0.7} cy={h * 0.4} r={h * 0.08} />
        </g>
      )
    case 'puddle':
      return <ellipse cx={0} cy={0} rx={h} ry={h * 0.22} fill="#BFE1F2" {...L('#8FBAD6', 4)} opacity={0.9} />
    case 'castle':
      return (
        <g {...L('#C2A266', 5)} fill="#E8CC8E">
          <rect x={-h * 0.8} y={-h * 0.1} width={size * 0.8} height={h * 0.9} />
          <rect x={-h * 0.45} y={-h * 0.7} width={size * 0.45} height={h * 0.6} />
          <path d={`M0 ${-h * 0.7} V${-h} L${h * 0.3} ${-h * 0.88} L0 ${-h * 0.78}`} fill="#E0604E" />
          <rect x={-h * 0.15} y={h * 0.35} width={h * 0.3} height={h * 0.45} rx={h * 0.15} fill="#C2A266" />
        </g>
      )
    case 'flat-castle':
      return <path d={`M${-h} ${h * 0.6} Q${-h * 0.5} ${-h * 0.1} 0 ${h * 0.1} Q${h * 0.5} ${-h * 0.2} ${h} ${h * 0.6} Z`} fill="#E8CC8E" {...L('#C2A266', 5)} />
    case 'stool':
      return (
        <g>
          <path d={`M${-h * 0.7} ${-h * 0.3} L${-h * 0.8} ${h} M${h * 0.7} ${-h * 0.3} L${h * 0.8} ${h}`} stroke="#A87A4E" strokeWidth={12} strokeLinecap="round" />
          <ellipse cx={0} cy={-h * 0.36} rx={h} ry={h * 0.2} fill="#E3B98A" {...L('#A87A4E', 5)} />
        </g>
      )
    case 'thread':
      return <path d={`M0 ${-h} V${h}`} stroke="#8C8C94" strokeWidth={3} />
    case 'plate':
      return <ellipse cx={0} cy={0} rx={h} ry={h * 0.22} fill="#fff" {...L('#B9A58E', 4)} />
    case 'blanket':
      return (
        <g>
          <path d={`M${-h} ${-h * 0.12} H${h} L${h * 0.9} ${h * 0.14} H${-h * 0.9} Z`} fill="#F2A9A0" {...L('#C9736B', 4)} />
          <path d={`M${-h * 0.5} ${-h * 0.12} L${-h * 0.45} ${h * 0.14} M0 ${-h * 0.12} V${h * 0.14} M${h * 0.5} ${-h * 0.12} L${h * 0.45} ${h * 0.14}`} stroke="#fff" strokeWidth={6} />
        </g>
      )
    case 'firework':
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2
            return <path key={i} d={`M${Math.cos(a) * h * 0.25} ${Math.sin(a) * h * 0.25} L${Math.cos(a) * h * 0.85} ${Math.sin(a) * h * 0.85}`} stroke={look.c} strokeWidth={9} strokeLinecap="round" />
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const a = ((i + 0.5) / 12) * Math.PI * 2
            return <circle key={`d${i}`} cx={Math.cos(a) * h * 0.95} cy={Math.sin(a) * h * 0.95} r={7} fill="#fff" />
          })}
        </g>
      )
    case 'wave':
      return (
        <g>
          <path d={`M${-h} ${h * 0.4} Q${-h * 0.8} ${-h * 0.5} 0 ${-h * 0.6} Q${h * 0.6} ${-h * 0.6} ${h * 0.5} ${-h * 0.1} Q${h * 0.2} ${-h * 0.3} ${h * 0.1} ${0} Q${h * 0.5} ${h * 0.2} ${h} ${h * 0.4} Z`} fill="#7FC1DE" {...L('#4F99BF', 6)} />
          <path d={`M${-h * 0.5} ${-h * 0.35} Q0 ${-h * 0.55} ${h * 0.35} ${-h * 0.35}`} fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
        </g>
      )
  }
}

/** 一次性的效果（不循環） */
function FxView({ kind, x = 500, y = 300, still }: { kind: Fx; x?: number; y?: number; still: boolean }) {
  const once = (delay: number, dur: number) => ({ duration: still ? 0 : dur, delay: still ? 0 : delay, ease: 'easeOut' as const })
  switch (kind) {
    case 'confetti':
      return (
        <g>
          {Array.from({ length: 26 }, (_, i) => {
            const cx = 160 + ((i * 137) % 700)
            const c = ['#E0604E', '#F2C94C', '#5DAE76', '#4F7FC2', '#CFA0C9'][i % 5]
            return (
              <motion.rect
                key={i}
                x={cx}
                y={0}
                width={14}
                height={22}
                rx={3}
                fill={c}
                initial={{ y: -60, opacity: 1, rotate: 0 }}
                animate={{ y: 260 + ((i * 53) % 260), rotate: 200 + i * 20, opacity: 1 }}
                transition={once((i % 6) * 0.06, 1.2)}
              />
            )
          })}
        </g>
      )
    case 'hearts':
      return (
        <g>
          {[-50, 0, 50].map((dx, i) => (
            <motion.g key={i} initial={{ opacity: 0, y: 30 }} animate={{ opacity: [0, 1, 1], y: [30, -10, -30] }} transition={once(i * 0.15, 1.1)}>
              <SvgEmoji name="red-heart" x={x + dx - 26} y={y - 26 - (i % 2) * 30} size={52} />
            </motion.g>
          ))}
        </g>
      )
    case 'rain':
      return (
        <g>
          {Array.from({ length: 22 }, (_, i) => {
            const rx = 360 + ((i * 97) % 440)
            return (
              <motion.path
                key={i}
                d={`M${rx} 0 l-6 22`}
                stroke="#6FA8D2"
                strokeWidth={6}
                strokeLinecap="round"
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: [200, 520], opacity: [0, 1, 0.9] }}
                transition={{ ...once((i % 7) * 0.09, 0.9), repeat: still ? 0 : 1 }}
              />
            )
          })}
        </g>
      )
    case 'flash':
      return (
        <g>
          <motion.rect x={-600} y={-300} width={2200} height={1200} fill="#FFFBE0" initial={{ opacity: 0 }} animate={{ opacity: still ? 0 : [0, 0.85, 0] }} transition={once(0, 0.45)} />
          <motion.path d="M720 180 L690 260 H720 L700 330 L760 240 H728 L750 180 Z" fill="#F5D27A" {...L('#C9A043', 5)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={once(0, 0.15)} />
        </g>
      )
    case 'dark':
      return <motion.rect x={-600} y={-300} width={2200} height={1200} fill="#1E2340" initial={{ opacity: 0 }} animate={{ opacity: 0.78 }} transition={once(0, 0.35)} />
    case 'snow':
      return (
        <g>
          {Array.from({ length: 20 }, (_, i) => {
            const sx = 80 + ((i * 113) % 860)
            return <motion.circle key={i} cx={sx} cy={0} r={8 + (i % 3) * 3} fill="#fff" stroke="#C9D6E2" strokeWidth={2} initial={{ y: -40 }} animate={{ y: 120 + ((i * 71) % 380) }} transition={once((i % 5) * 0.12, 2)} />
          })}
        </g>
      )
    case 'sparkle':
      return (
        <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: still ? 1 : [0, 1, 1], scale: 1 }} transition={once(0, 0.5)} style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}>
          <SvgEmoji name="sparkles" x={x - 40} y={y - 40} size={80} />
        </motion.g>
      )
    case 'burst':
      return (
        <motion.g initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: still ? 0.9 : [0, 1, 0.9], scale: 1.1 }} transition={once(0, 0.3)} style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}>
          <SvgEmoji name="collision" x={x - 55} y={y - 55} size={110} />
        </motion.g>
      )
    case 'notes':
      return (
        <g>
          {[0, 1].map((i) => (
            <motion.g key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: -20 }} transition={once(i * 0.2, 0.8)}>
              <SvgEmoji name="musical-note" x={x - 30 + i * 60} y={y - 30 - i * 30} size={56} />
            </motion.g>
          ))}
        </g>
      )
    case 'splash':
      return (
        <g>
          {[-60, -30, 0, 30, 60].map((dx, i) => (
            <motion.circle key={i} cx={x} cy={y} r={9} fill={y > 530 ? '#8C6440' : '#BFE1F2'} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: dx * 2, y: [-0, -80 - (i % 2) * 30, -10], opacity: [1, 1, 0] }} transition={once(0, 0.7)} />
          ))}
        </g>
      )
    case 'bubbles':
      return (
        <g>
          {Array.from({ length: 9 }, (_, i) => (
            <motion.circle
              key={i}
              cx={x - 90 + (i % 5) * 45}
              cy={y}
              r={14 + (i % 3) * 7}
              fill="#fff"
              stroke="#B6CFE0"
              strokeWidth={3}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: -40 - (i % 4) * 40, opacity: 0.95 }}
              transition={once(i * 0.1, 1.1)}
            />
          ))}
        </g>
      )
    case 'zzz':
      return null
  }
}

/** 晚上、陰天：蓋在背景上（主角和道具不受影響） */
function Mood({ night, gray }: { night?: boolean; gray?: boolean }) {
  if (night)
    return (
      <g>
        <rect x={-600} y={-300} width={2200} height={1200} fill="#1E2A4F" opacity={0.62} />
        {[
          [120, 70],
          [300, 130],
          [520, 50],
          [640, 150],
          [930, 90],
          [-80, 120],
          [1080, 60],
        ].map(([x, y]) => (
          <path key={x} d={`M${x} ${y - 10} L${x + 3} ${y - 3} L${x + 10} ${y} L${x + 3} ${y + 3} L${x} ${y + 10} L${x - 3} ${y + 3} L${x - 10} ${y} L${x - 3} ${y - 3} Z`} fill="#F5E6A0" />
        ))}
      </g>
    )
  if (gray) return <rect x={-600} y={-300} width={2200} height={1200} fill="#7C8796" opacity={0.38} />
  return null
}

/** 朋友（另一隻小動物）：面向主角（往左），在地面上走 */
function Friend({ sp, k, T, still, hug }: { sp: SpeciesId; k: Key[]; T: number; still: boolean; hug: boolean }) {
  const keys = k.map((q) => ({ ...q, y: GROUND - 0 }))
  return (
    <Mover k={keys} T={T} still={still}>
      <g transform="translate(110 -230) scale(-0.82 0.82)">
        <Critter sp={sp} face={hug ? 'happy' : 'neutral'} arm={hug ? 'mood' : 'hold'} />
      </g>
    </Mover>
  )
}

/** 主角：換心情的時候身體動一下（開心跳一下、害怕抖一下、難過往下沉、生氣跺一下），一次就停 */
function Hero({ sp, face, holding, still }: { sp: SpeciesId; face: Face; holding: boolean; still: boolean }) {
  const move =
    face === 'happy' ? { y: [0, -18, 0] } : face === 'scared' ? { x: [0, -7, 7, -5, 5, 0] } : face === 'sad' ? { y: [0, 6] } : face === 'angry' ? { y: [0, -6, 2, 0] } : { y: 0 }
  return (
    <g transform={`translate(${HERO.x} ${HERO.y})`}>
      <motion.g key={face} initial={false} animate={still ? {} : move} transition={{ duration: 0.45 }}>
        <Critter sp={sp} face={face} arm={holding ? 'hold' : 'mood'} />
      </motion.g>
    </g>
  )
}

/**
 * 一個情境：play 從 0 開始跑（換一個情境要換 key）。face 由外面控制（turn 的時候換），讓整個遊戲可以在說話時決定。
 * 預設：turn 毫秒後自己換成 sit.emo。
 */
export const SceneView = memo(function SceneView({ sit, hero, friend, onTurn }: { sit: Sit; hero: SpeciesId; friend: SpeciesId; onTurn?: () => void }) {
  const reduce = useReducedMotion() ?? false
  const T = sitLength(sit)
  const [face, setFace] = useState<Face>(reduce ? sit.emo : 'neutral')
  useEffect(() => {
    if (reduce) {
      onTurn?.()
      return
    }
    const t = window.setTimeout(() => {
      setFace(sit.emo)
      onTurn?.()
    }, sit.turn ?? TURN)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [fxOn, setFxOn] = useState<number[]>(() => (reduce ? (sit.fx ?? []).map((_, i) => i) : []))
  useEffect(() => {
    if (reduce) return
    const ts = (sit.fx ?? []).map((f, i) => window.setTimeout(() => setFxOn((a) => [...a, i]), f.t))
    return () => ts.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const behind = sit.tracks.filter((t) => t.behind)
  const front = sit.tracks.filter((t) => !t.behind)
  const fx = (sit.fx ?? []).map((f, i) => ({ ...f, i })).filter((f) => fxOn.includes(f.i))
  const dark = fx.filter((f) => f.kind === 'dark')
  // 彩帶、雪、雨、泡泡畫在主角後面：不會蓋到臉
  const backFx = fx.filter((f) => BACK_FX.includes(f.kind))
  const rest = fx.filter((f) => f.kind !== 'dark' && !BACK_FX.includes(f.kind))
  return (
    <g data-sit={sit.id}>
      <Backdrop place={sit.place} />
      {/* 背景淡一點：主角、道具比較清楚 */}
      <rect x={-600} y={-300} width={2200} height={1200} fill="#FBF8F2" opacity={0.28} />
      <Mood night={sit.night} gray={sit.gray} />
      {/* 燈關了：暗的是房間，主角還看得到（才看得到臉） */}
      {dark.map((f) => (
        <FxView key={`f${f.i}`} kind={f.kind} x={f.x} y={f.y} still={reduce} />
      ))}
      {behind.map((t, i) => (
        <Mover key={`b${i}`} k={t.k} T={T} still={reduce}>
          <Drawn look={t.look} size={t.size} />
        </Mover>
      ))}
      {backFx.map((f) => (
        <FxView key={`f${f.i}`} kind={f.kind} x={f.x} y={f.y} still={reduce} />
      ))}
      <ellipse cx={HERO.x + 120} cy={GROUND + 2} rx={80} ry={12} fill="#2E2A25" opacity={0.12} />
      <Hero sp={hero} face={face} holding={!!sit.holding} still={reduce} />
      {sit.friend && <Friend sp={friend} k={sit.friend} T={T} still={reduce} hug={!!sit.hug} />}
      {front.map((t, i) => (
        <Mover key={`f${i}`} k={t.k} T={T} still={reduce}>
          <Drawn look={t.look} size={t.size} />
        </Mover>
      ))}
      {rest.map((f) => (
        <FxView key={`f${f.i}`} kind={f.kind} x={f.x} y={f.y} still={reduce} />
      ))}
    </g>
  )
})
