import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink } from './Ink'
import { PenArt, easeInOut, tween } from '../Demo'
import { Sparkles } from '../../ui/Sparkles'
import { EMOJI } from '../../art/emoji.generated'
import { game as gameDef } from '../../content/games'
import { DOTS_PICS, type DotsPic } from '../../content/dots'
import { DOTS_PRAISE } from '../../content/lines-dots'
import { level, markPlayed, plays, reportLevel, unlockedNumbers } from '../../lib/adaptive'
import { themeNow } from '../../lib/theme-play'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../lines'
import { useIdle } from '../idle'
import { planDots, roundState } from '../pick'
import { PACE, nextPause } from '../pace'

const ROUNDS = 2
/** 筆或手指離點多近算碰到（viewBox 1000×600 的單位） */
const HIT = 62
const HOME_R = 44
const INK = '#2E2A25'
const GREEN = '#6FAE86'
const BUTTER = '#F1D27C'
const PAPER = '#FBF8F2'

// 示範的動畫長度（毫秒）。停頓（示範結束停留、換孩子前）用 pace.ts 的 PACE
/** 筆從畫面下方飄到家 */
const PEN_IN = 700
/** 前三段：慢慢走、邊走邊數 */
const DEMO_SLOW = 1150
const DEMO_SLOW_STEPS = 3
/** 之後的每一段：加快一點 */
const DEMO_FAST = 640
/** 最後一段回家：再放慢，讓孩子看清楚「回到起點」 */
const DEMO_HOME = 1100
/** 慢的那幾段，數完一個數字後再停一下 */
const DEMO_COUNT_GAP = 220
/** 示範的線和顏色淡出 */
const ERASE = 560
/** 連錯點、或手指提起來：拉出去的線縮回上一個點 */
const RETRACT = 300

type P = { x: number; y: number }
const lerp = (a: [number, number], b: [number, number], f: number): P => ({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f })
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function centroid(p: DotsPic): P {
  const n = p.pts.length
  return { x: p.pts.reduce((s, q) => s + q[0], 0) / n, y: p.pts.reduce((s, q) => s + q[1], 0) / n }
}

function inside(pts: [number, number][], x: number, y: number) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * 數字放在點的外側：沿著這個角的角平分線往形狀外面放，凹進去的角（魚尾巴接身體的地方）也不會壓在線上。
 * 太靠下面放不下就改放在旁邊。
 */
function labelAt(p: DotsPic, i: number): P {
  const pts = p.pts
  const [x, y] = pts[i]
  const [ax, ay] = pts[(i - 1 + pts.length) % pts.length]
  const [bx, by] = pts[(i + 1) % pts.length]
  const la = Math.hypot(ax - x, ay - y) || 1
  const lb = Math.hypot(bx - x, by - y) || 1
  let dx = (ax - x) / la + (bx - x) / lb
  let dy = (ay - y) / la + (by - y) / lb
  const d = Math.hypot(dx, dy)
  // 三點一直線：改用垂直方向
  if (d < 1e-3) [dx, dy] = [-(by - y) / lb, (bx - x) / lb]
  else [dx, dy] = [dx / d, dy / d]
  if (inside(pts, x + dx * 10, y + dy * 10)) [dx, dy] = [-dx, -dy]
  const ly = y + dy * 58
  if (ly > 568) return { x: x + (dx >= 0 ? 60 : -60), y: Math.min(y + 18, 568) }
  return { x: Math.min(960, Math.max(40, x + dx * 58)), y: Math.max(34, ly) }
}

/** SVG 裡的 Fluent Emoji（Emoji 元件是 HTML 用的，這裡要放在 viewBox 座標上） */
function EmojiAt({ name, x, y, size }: { name: string; x: number; y: number; size: number }) {
  const e = EMOJI[name]
  if (!e) return null
  return <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox={`0 0 ${e.w} ${e.h}`} dangerouslySetInnerHTML={{ __html: e.b }} />
}

/**
 * 連點成圖（2026-10-28 家長回饋改版）：
 * - 起點是「家」，不是 1：1、2、3… 是出門後的第幾站，最後一筆連回家，形狀閉合、變成彩色。不會出現「回到 1」。
 * - 新的圖先完整示範：筆從家出發，前三段慢慢走、邊走邊數，之後加快，最後回家、變彩色、小慶祝，線擦掉才換孩子。
 * - 孩子連的時候：下一個點輕輕呼吸發光；連過的點變小、數字變淡；最後一個數字連完，家亮起來提示回家。
 *   手指拉出去的線會跟著走；碰到不對的點不算錯、不出聲，線自己縮回上一個點，下一個點再亮一下。
 * - 出什麼圖、要不要示範：games/pick.ts 的 planDots（數字不超過已解鎖的範圍，scripts/sim-teach.ts 會檢查）。
 */
export function DotsGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [pic, setPic] = useState<DotsPic>(DOTS_PICS[0])
  /** 已經連好幾段（0 = 還在家；pts.length = 回到家、閉合） */
  const [step, setStep] = useState(0)
  /** 正在拉的那條線的尾巴（手指、示範的筆尖） */
  const [band, setBandState] = useState<P | null>(null)
  /** 示範的筆；null 表示沒有在示範 */
  const [pen, setPen] = useState<P | null>(null)
  const [reveal, setReveal] = useState(false)
  const [erasing, setErasing] = useState(false)
  /** 連錯點時，下一個點「再亮一下」 */
  const [flash, setFlash] = useState<{ i: number; k: number } | null>(null)
  /** 剛連上的點輕輕彈一下 */
  const [pop, setPop] = useState<{ i: number; k: number } | null>(null)
  /** 家跳一下（筆到家、最後一個數字連完、閉合） */
  const [hop, setHop] = useState(0)
  /** 閒置第二段提示：下一個點慢慢亮起來，淡淡的虛線指過去 */
  const [nudge, setNudge] = useState(false)

  const stepRef = useRef(0)
  const picRef = useRef(pic)
  const bandRef = useRef<P | null>(null)
  const retracting = useRef(false)
  /** 碰到不對的點之後，手指離開那個點以前先不理它（不會一直縮回去） */
  const wrongHold = useRef<number | null>(null)
  /** 這一段碰過哪些不對的點（同一個點只記一次） */
  const wrongSeen = useRef(new Set<number>())
  const wrongTouches = useRef(0)
  const rRef = useRef(0)
  const t0 = useRef(0)
  const lv = useRef(1)
  const live = useRef(true)
  const first = useRef(0)
  const busy = useRef(true)
  /** 這一張圖剛示範過（答完多停一下，見 pace.ts 的 nextPause） */
  const shown = useRef(false)
  /** 必須在 markPlayed 之前讀：第一次玩，第一張一定示範 */
  const st = useRef(roundState(plays(def.id) === 0))
  const idle = useIdle()

  const setBand = (b: P | null) => {
    bandRef.current = b
    setBandState(b)
  }
  const goStep = (n: number) => {
    stepRef.current = n
    setStep(n)
  }

  const showMe = async (p: DotsPic) => {
    const s0 = performance.now()
    const alive = () => live.current
    const L = p.pts.length
    const from = { x: 500, y: 560 }
    setPen(from)
    await say('teach.watch.dodo')
    if (!alive()) return
    // 筆飄到家，家跳一下：「We start at home.」
    await tween(PEN_IN, (f) => setPen({ x: from.x + (p.pts[0][0] - from.x) * f, y: from.y + (p.pts[0][1] - from.y) * f }), alive, easeInOut)
    if (!alive()) return
    setHop((h) => h + 1)
    await say('d.dots.demo.home')
    if (!alive()) return
    for (let k = 1; k <= L; k++) {
      const closing = k === L
      // 最後一個數字連完、家亮起來之後：「Now, back home!」再出發
      if (closing) await say('d.dots.gohome')
      if (!alive()) return
      const a = p.pts[k - 1]
      const b = p.pts[k % L]
      const ms = closing ? DEMO_HOME : k <= DEMO_SLOW_STEPS ? DEMO_SLOW : DEMO_FAST
      await tween(
        ms,
        (f) => {
          const q = lerp(a, b, f)
          setPen(q)
          setBand(q)
        },
        alive,
        easeInOut,
      )
      if (!alive()) return
      setBand(null)
      goStep(k)
      if (closing) break
      sfx.count(k)
      setPop({ i: k, k: performance.now() })
      if (k === L - 1) setHop((h) => h + 1)
      await say(`dodo.num.${k}`)
      if (!alive()) return
      if (k <= DEMO_SLOW_STEPS) await wait(DEMO_COUNT_GAP)
    }
    if (!alive()) return
    // 回到家：閉合、變彩色、小慶祝
    sfx.hatch()
    setReveal(true)
    setHop((h) => h + 1)
    await say('d.dots.demo.back', `d.dots.is.${p.id}`)
    if (!alive()) return
    await wait(PACE.DEMO_HOLD)
    if (!alive()) return
    // 擦掉，換孩子從家開始
    setErasing(true)
    setPen(null)
    await wait(ERASE)
    if (!alive()) return
    goStep(0)
    setReveal(false)
    setErasing(false)
    void logTeach({ station: 'draw', game: def.id, itemId: p.id, skill: `dots:${p.id}`, level: lv.current, ms: Math.round(performance.now() - s0) })
    await wait(PACE.TEACH_SETTLE)
    if (!alive()) return
    await say('teach.turn.dodo', 'd.dots.start')
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    const { pic: p, show } = planDots(def.id, lv.current, unlockedNumbers(), st.current, i, themeNow()?.dots ?? [])
    picRef.current = p
    setPic(p)
    goStep(0)
    setBand(null)
    setReveal(false)
    setErasing(false)
    setPop(null)
    setFlash(null)
    wrongTouches.current = 0
    wrongSeen.current.clear()
    wrongHold.current = null
    shown.current = show
    // 要示範的話，示範完才換孩子連；不示範就邊聽邊可以開始
    busy.current = show
    idle.stop()
    setNudge(false)
    t0.current = performance.now()
    if (i === 0) await say(def.intro)
    if (!live.current) return
    if (show) {
      await showMe(p)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
    } else if (i > 0 && stepRef.current === 0) await say('d.dots.start')
    if (!live.current) return
    // 閒置：15 秒再提醒一次（還沒出發：開場那句；連到一半：「Where is three?」；數字連完：「Now, back home!」）
    // → 再 15 秒下一個點慢慢亮起來、淡淡的虛線指過去 → 之後安靜
    const remind = () => {
      const s = stepRef.current
      return s === 0 ? def.intro : s === p.pts.length - 1 ? 'd.dots.gohome' : `d.dots.find.${s + 1}`
    }
    if (picRef.current === p && stepRef.current < p.pts.length) idle.start({ repeat: () => void say(remind()), hint: () => setNudge(true) })
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      start(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = async () => {
    const p = picRef.current
    idle.stop()
    setBand(null)
    sfx.hatch()
    setReveal(true)
    setHop((h) => h + 1)
    // 不算錯、不扣分：孩子不會聽到任何「錯」；難度調整沿用原本的標準（不對的點碰到兩個以上，這張圖先不算熟）
    const good = wrongTouches.current <= 1
    if (good) first.current++
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: p.id,
      skill: `dots:${p.id}`,
      phase: 'quiz',
      level: lv.current,
      options: [],
      answer: '',
      taps: [],
      firstTryCorrect: good,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { dots: p.pts.length, wrongTouches: wrongTouches.current },
    })
    reportLevel(def.id, good, def.maxLevel)
    await say('d.dots.home', `d.dots.is.${p.id}`, `d.dots.praise.${Math.floor(Math.random() * DOTS_PRAISE)}`)
    if (!live.current) return
    await wait(nextPause(shown.current))
    if (!live.current) return
    const r = rRef.current
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    rRef.current = r + 1
    setR(r + 1)
    start(r + 1)
  }

  /** 拉出去的線縮回上一個點 */
  const retract = async () => {
    const b = bandRef.current
    if (!b || retracting.current) return
    retracting.current = true
    const p = picRef.current
    const [ax, ay] = p.pts[stepRef.current % p.pts.length]
    await tween(RETRACT, (f) => setBand({ x: b.x + (ax - b.x) * f, y: b.y + (ay - b.y) * f }), () => live.current, easeOut)
    setBand(null)
    retracting.current = false
  }

  const connect = (n: number) => {
    const L = picRef.current.pts.length
    goStep(n)
    setNudge(false)
    wrongSeen.current.clear()
    if (n === L) return void finish()
    sfx.count(n)
    setPop({ i: n, k: performance.now() })
    if (n === L - 1) {
      // 數字連完了：家亮起來、跳一下，「Now, back home!」
      setHop((h) => h + 1)
      void say(`dodo.num.${n}`, 'd.dots.gohome')
    } else void say(`dodo.num.${n}`)
  }

  const touch = (pt: { x: number; y: number }) => {
    if (busy.current) return
    const p = picRef.current
    const L = p.pts.length
    const s = stepRef.current
    if (s >= L) return
    // 有畫線就重新計時
    idle.poke()
    if (wrongHold.current !== null) {
      const [wx, wy] = p.pts[wrongHold.current]
      if (Math.hypot(pt.x - wx, pt.y - wy) < HIT * 1.4) return
      wrongHold.current = null
    }
    if (retracting.current) return
    setBand({ x: pt.x, y: pt.y })
    let hit = -1
    let best = HIT
    p.pts.forEach(([x, y], i) => {
      const d = Math.hypot(pt.x - x, pt.y - y)
      if (d <= best) {
        best = d
        hit = i
      }
    })
    if (hit < 0) return
    const target = (s + 1) % L
    if (hit === target) return connect(s + 1)
    // 還沒輪到的點（家和連過的點不算）：不算錯、不出聲，線縮回去，下一個點再亮一下
    if (hit > s) {
      wrongHold.current = hit
      if (!wrongSeen.current.has(hit)) {
        wrongSeen.current.add(hit)
        wrongTouches.current++
      }
      setFlash({ i: target, k: performance.now() })
      void retract()
    }
  }

  const release = () => {
    wrongHold.current = null
    if (!busy.current) void retract()
  }

  const pts = pic.pts
  const L = pts.length
  const c = centroid(pic)
  const target = step < L ? (step + 1) % L : -1
  const shut = step >= L
  const lines = pts
    .slice(0, Math.min(step, L - 1) + 1)
    .concat(shut ? [pts[0]] : [])
    .map(([x, y]) => `${x},${y}`)
    .join(' ')
  const from = pts[Math.min(step, L - 1)]
  const nextPt = target >= 0 ? pts[target] : null
  const home = pts[0]
  const homeNext = target === 0 && !reveal
  const breathe = { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } as const

  return (
    <Shell station="draw" mood="idle" progress={{ total: ROUNDS, done: r }} onExit={onExit} hideHost>
      <div key={r} style={{ position: 'absolute', inset: '0 4% 4%' }}>
        <svg viewBox="0 0 1000 600" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
          {/* 閉合後變成彩色 */}
          <motion.polygon
            points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
            fill={pic.fill}
            initial={false}
            animate={{ opacity: reveal && !erasing ? 1 : 0, scale: reveal && !erasing ? 1 : 0.94 }}
            transition={{ duration: reveal && !erasing ? 0.75 : ERASE / 1000, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: `${c.x}px ${c.y}px` }}
          />
          {pic.deco && (
            <motion.g initial={false} animate={{ opacity: reveal && !erasing ? 1 : 0 }} transition={{ duration: 0.6, delay: reveal && !erasing ? 0.35 : 0 }}>
              {pic.deco.map((d, k) => (
                <path key={k} d={d.d} fill={d.fill ?? 'none'} stroke={d.stroke ?? 'none'} strokeWidth={d.width} strokeLinecap="round" strokeLinejoin="round" opacity={d.opacity} />
              ))}
            </motion.g>
          )}

          {/* 閒置第二段提示：從上一個點淡淡的虛線指到下一個點 */}
          {nudge && !pen && nextPt && !shut && (
            <line className="nudge-path" x1={from[0]} y1={from[1]} x2={nextPt[0]} y2={nextPt[1]} stroke={BUTTER} strokeWidth={9} strokeDasharray="2 24" strokeLinecap="round" fill="none" />
          )}

          {/* 連好的線、正在拉的線 */}
          <motion.g initial={false} animate={{ opacity: erasing ? 0 : 1 }} transition={{ duration: ERASE / 1000 }}>
            {/* 閉合後畫成一個封閉的形狀：起點（家）那個角也是圓角，看不出接縫 */}
            {shut ? (
              <polygon points={lines} fill="none" stroke={INK} strokeWidth={10} strokeLinejoin="round" />
            ) : (
              step > 0 && <polyline points={lines} fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {band && !shut && <line x1={from[0]} y1={from[1]} x2={band.x} y2={band.y} stroke={INK} strokeOpacity={pen ? 1 : 0.55} strokeWidth={10} strokeLinecap="round" />}
          </motion.g>

          {/* 1、2、3… 的點 */}
          <motion.g initial={false} animate={{ opacity: reveal ? 0 : 1 }} transition={{ duration: reveal ? 0.5 : 0.4, delay: reveal ? 0.25 : 0 }}>
            {pts.map(([x, y], i) => {
              if (i === 0) return null
              const isDone = i <= step
              const isNext = i === target && !reveal
              const lb = labelAt(pic, i)
              return (
                <g key={i}>
                  {isNext && nudge && !pen && <circle className="nudge-path" cx={x} cy={y} r={78} fill={BUTTER} />}
                  {isNext && <motion.circle cx={x} cy={y} fill={GREEN} initial={{ r: 32, opacity: 0.4 }} animate={{ r: [32, 48, 32], opacity: [0.4, 0.14, 0.4] }} transition={breathe} />}
                  {isNext && flash?.i === i && (
                    <motion.circle key={`f${flash.k}`} cx={x} cy={y} fill="none" stroke={GREEN} strokeWidth={8} initial={{ r: 28, opacity: 0.9 }} animate={{ r: 74, opacity: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                  )}
                  {pop?.i === i && (
                    <motion.circle key={`p${pop.k}`} cx={x} cy={y} fill="none" stroke={INK} strokeWidth={5} initial={{ r: 16, opacity: 0.5 }} animate={{ r: 46, opacity: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                  )}
                  <motion.circle
                    cx={x}
                    cy={y}
                    initial={false}
                    animate={{ r: isDone ? 13 : isNext ? 25 : 19 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                    fill={isDone ? INK : isNext ? GREEN : PAPER}
                    stroke={INK}
                    strokeWidth={5}
                  />
                  <motion.text
                    x={lb.x}
                    y={lb.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="Fredoka"
                    fontWeight={600}
                    initial={false}
                    animate={{ opacity: isDone ? 0.32 : 1 }}
                    transition={{ duration: 0.4 }}
                    fontSize={isNext ? 54 : 46}
                    fill={INK}
                  >
                    {i}
                  </motion.text>
                </g>
              )
            })}
          </motion.g>

          {/* 家：起點也是終點。數字連完了它就亮起來，提示要回家 */}
          <motion.g initial={false} animate={{ opacity: reveal ? 0 : 1 }} transition={{ duration: 0.5, delay: reveal ? 1.1 : 0 }}>
            {homeNext && <motion.circle cx={home[0]} cy={home[1]} fill={BUTTER} initial={{ r: HOME_R + 6, opacity: 0.55 }} animate={{ r: [HOME_R + 6, HOME_R + 24, HOME_R + 6], opacity: [0.55, 0.2, 0.55] }} transition={breathe} />}
            {homeNext && flash?.i === 0 && (
              <motion.circle key={`hf${flash.k}`} cx={home[0]} cy={home[1]} fill="none" stroke={BUTTER} strokeWidth={9} initial={{ r: HOME_R, opacity: 0.95 }} animate={{ r: HOME_R + 44, opacity: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
            )}
            {homeNext && nudge && !pen && <circle className="nudge-path" cx={home[0]} cy={home[1]} r={HOME_R + 40} fill={BUTTER} />}
            <g transform={`translate(${home[0]} ${home[1]})`}>
              <motion.g key={hop} initial={{ y: 0, scale: 1 }} animate={hop ? { y: [0, -16, 0, -5, 0], scale: [1, 1.08, 0.97, 1.02, 1] } : {}} transition={{ duration: 0.75, ease: 'easeOut' }}>
                <circle r={HOME_R} fill={homeNext ? '#FFF3D2' : PAPER} stroke={INK} strokeWidth={5} />
                <EmojiAt name="house" x={0} y={-2} size={60} />
              </motion.g>
            </g>
          </motion.g>

          {pen && (
            <g transform={`translate(${pen.x} ${pen.y})`}>
              <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}>
                <PenArt scale={1.6} />
              </motion.g>
            </g>
          )}
        </svg>
        {reveal && !erasing && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10 }}>
            <Sparkles count={16} />
          </div>
        )}
        <Ink w={1000} h={600} ink={false} onDown={touch} onMove={touch} onUp={release} />
      </div>
    </Shell>
  )
}
