import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { getStroke } from 'perfect-freehand'
import { Shell, type GameProps } from '../Shell'
import { Ink, type Pt } from './Ink'
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
import { Swap } from '../../ui/Scenes'
import { EASE, FADE_OUT, FADE_OUT_S, ms } from '../../ui/motion'

const ROUNDS = 2
/** 手指走過的路離點多近算碰到（viewBox 1000×600 的單位）：給 3 歲孩子，判定放寬 */
const HIT = 70
/** 從上一個到達的點出發：按下去、或畫的時候經過離它這麼近，這一筆才開始算 */
const ARM = 86
const HOME_R = 44
const INK = '#2E2A25'
const GREEN = '#6FAE86'
const BUTTER = '#F1D27C'
const PAPER = '#FBF8F2'
/** 墨跡的粗細（viewBox 單位；平板上約 19px）：紙感螢幕上要粗、要深才看得清楚 */
const INK_W = 17

// 示範的動畫長度（毫秒）。停頓（示範結束停留、換孩子前）用 pace.ts 的 PACE
/** 筆從畫面下方飄到家 */
const PEN_IN = 700
/** 前三段：慢慢畫、邊畫邊數 */
const DEMO_SLOW = 1150
const DEMO_SLOW_STEPS = 3
/** 之後的每一段：加快一點 */
const DEMO_FAST = 640
/** 最後一段回家：再放慢，讓孩子看清楚「回到起點」 */
const DEMO_HOME = 1100
/** 慢的那幾段，數完一個數字後再停一下 */
const DEMO_COUNT_GAP = 220
/** 示範的墨跡和顏色淡出 */
const ERASE = 560

type P = { x: number; y: number }
/** 一筆墨跡的點：[x, y, 壓力] */
type Pts = [number, number, number][]
/** 孩子畫的一段墨跡。fade：這一段沒連到下一個點，正在淡掉 */
interface Seg {
  id: number
  pts: Pts
  pen: boolean
  fade?: boolean
}

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

/** 點到線段的距離：手指移動很快時，兩次事件之間跨過的點也算碰到 */
function segDist(x: number, y: number, a: P, b: P) {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const l2 = vx * vx + vy * vy
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2)) : 0
  return Math.hypot(a.x + vx * t - x, a.y + vy * t - y)
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

/** perfect-freehand 的外框 → SVG path */
function svgPath(o: number[][]): string {
  if (!o.length) return ''
  const f = (n: number) => n.toFixed(1)
  let d = `M${f(o[0][0])} ${f(o[0][1])} Q`
  for (let i = 0; i < o.length; i++) {
    const [x0, y0] = o[i]
    const [x1, y1] = o[(i + 1) % o.length]
    d += `${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)} `
  }
  return d + 'Z'
}

/** 一筆墨跡的形狀（已經畫好的那幾段不會再變，算過就記住） */
const inkCache = new WeakMap<Pts, string>()
function inkPath(pts: Pts, pen: boolean): string {
  let d = inkCache.get(pts)
  if (d === undefined) {
    d = svgPath(getStroke(pts, { size: INK_W, thinning: pen ? 0.35 : 0.2, smoothing: 0.6, streamline: 0.35, simulatePressure: !pen, last: true }))
    inkCache.set(pts, d)
  }
  return d
}

/** 筆的壓力：太輕的筆也要畫得出看得見的線 */
const pressureOf = (pt: Pt, pen: boolean) => (pen ? 0.3 + 0.7 * Math.min(1, pt.p) : 0.5)

/**
 * 示範用的手繪路徑：沿著兩點之間走，帶一點點自然的歪（兩端不歪，所以會準準地碰到點），壓力也輕輕起伏。
 * 不是尺畫的直線，看起來像一隻手畫的，孩子學的就是同一件事。
 */
function handPath(a: [number, number], b: [number, number], seed: number): Pts {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const n = Math.max(10, Math.round(len / 6))
  const nx = -dy / len
  const ny = dx / len
  const amp = Math.min(10, len * 0.028)
  const p1 = seed * 1.7
  const p2 = seed * 2.9 + 1
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const w = amp * Math.sin(Math.PI * t) * (0.65 * Math.sin(2 * Math.PI * 1.1 * t + p1) + 0.35 * Math.sin(2 * Math.PI * 2.3 * t + p2))
    return [a[0] + dx * t + nx * w, a[1] + dy * t + ny * w, 0.55 + 0.08 * Math.sin(t * 9 + seed)] as [number, number, number]
  })
}

/** SVG 裡的 Fluent Emoji（Emoji 元件是 HTML 用的，這裡要放在 viewBox 座標上） */
function EmojiAt({ name, x, y, size }: { name: string; x: number; y: number; size: number }) {
  const e = EMOJI[name]
  if (!e) return null
  return <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox={`0 0 ${e.w} ${e.h}`} dangerouslySetInnerHTML={{ __html: e.b }} />
}

/**
 * 連點成圖：手寫運筆練習（2026-10-28 家長回饋改版兩次）：
 * - 起點是「家」，不是 1：1、2、3… 是出門後的第幾站，最後一筆連回家，形狀閉合、變成彩色。不會出現「回到 1」。
 * - 孩子自己畫：從家（或最後到達的點）按下去拖，墨跡就是手指或筆實際走過的路，歪歪的也照樣留著，程式不會拉直線。
 *   手指的路碰到下一個點（判定放寬），那個點亮起來，這一段就留下來；可以一筆畫完很多點，也可以一次畫一段。
 *   還沒到下一個點就放開、或碰到還沒輪到的點：這一段墨跡慢慢淡掉（ui/motion.ts 的 FADE_OUT），不算錯、不出聲，從最後到達的點接著畫。
 * - 新的圖先完整示範：筆從家出發，用同樣的手繪墨跡一段段畫出來，前三段慢慢畫、邊畫邊數，最後回家、變彩色、小慶祝；
 *   示範的墨跡整個淡掉、點點以「還沒連」的樣子淡回來，才換孩子。
 * - 閉合後孩子畫的墨跡留在圖上（那是他自己畫的），底下變成彩色。
 * - 出什麼圖、要不要示範：games/pick.ts 的 planDots（數字不超過已解鎖的範圍，scripts/sim-teach.ts 會檢查）。
 */
export function DotsGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [pic, setPic] = useState<DotsPic>(DOTS_PICS[0])
  /** 已經連好幾段（0 = 還在家；pts.length = 回到家、閉合） */
  const [step, setStep] = useState(0)
  /** 孩子畫的墨跡 */
  const [ink, setInk] = useState<Seg[]>([])
  /** 示範畫出來的墨跡（每一段一筆，邊畫邊長出來） */
  const [demoInk, setDemoInk] = useState<Pts[]>([])
  /** 示範的筆；null 表示沒有在示範 */
  const [pen, setPen] = useState<P | null>(null)
  const [reveal, setReveal] = useState(false)
  const [erasing, setErasing] = useState(false)
  /** 連錯點時，下一個點「再亮一下」 */
  const [flash, setFlash] = useState<{ i: number; k: number } | null>(null)
  /** 沒從最後到達的點出發：那個點輕輕亮一圈，告訴孩子從這裡開始 */
  const [startPulse, setStartPulse] = useState(0)
  /** 剛連上的點輕輕彈一下 */
  const [pop, setPop] = useState<{ i: number; k: number } | null>(null)
  /** 家跳一下（筆到家、最後一個數字連完、閉合） */
  const [hop, setHop] = useState(0)
  /** 閒置第二段提示：下一個點慢慢亮起來 */
  const [nudge, setNudge] = useState(false)

  const stepRef = useRef(0)
  const picRef = useRef(pic)
  const inkRef = useRef<Seg[]>([])
  const segId = useRef(0)
  /** 手指或筆現在是不是按著（示範中按下去的也記著，換孩子時一動就開始畫） */
  const pressed = useRef<{ pen: boolean } | null>(null)
  /** 正在畫的這一筆。armed：從最後到達的點出發了（碰到下一個點才算數） */
  const stroke = useRef<{ id: number; armed: boolean; last: P; pen: boolean } | null>(null)
  /** 碰到不對的點之後，手指離開那個點以前先不理它（不會一直重算） */
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

  const putInk = (f: (s: Seg[]) => Seg[]) => {
    inkRef.current = f(inkRef.current)
    setInk(inkRef.current)
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
      const path = handPath(p.pts[k - 1], p.pts[k % L], k)
      const dur = closing ? DEMO_HOME : k <= DEMO_SLOW_STEPS ? DEMO_SLOW : DEMO_FAST
      // 筆尖走到哪，墨跡就長到哪（和孩子自己畫的時候一樣）
      await tween(
        dur,
        (f) => {
          const n = Math.max(1, Math.round(f * (path.length - 1)))
          setPen({ x: path[n][0], y: path[n][1] })
          setDemoInk((d) => {
            const c = d.slice()
            c[k - 1] = path.slice(0, n + 1)
            return c
          })
        },
        alive,
        easeInOut,
      )
      if (!alive()) return
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
    // 示範的墨跡和顏色一起淡掉，點點同時以「還沒連」的樣子淡回來；淡完才拿掉墨跡（已經看不到），換孩子從家開始
    setErasing(true)
    setPen(null)
    await wait(ERASE)
    if (!alive()) return
    goStep(0)
    setReveal(false)
    setErasing(false)
    setDemoInk([])
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
    putInk(() => [])
    setDemoInk([])
    setReveal(false)
    setErasing(false)
    setPop(null)
    setFlash(null)
    // 上一回合還按著的手不算：放開再按下去才畫（舊的那一層淡出時也收不到點擊）
    pressed.current = null
    stroke.current = null
    wrongTouches.current = 0
    wrongSeen.current.clear()
    wrongHold.current = null
    shown.current = show
    // 要示範的話，示範完才換孩子畫；不示範就邊聽邊可以開始
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
    // → 再 15 秒下一個點慢慢亮起來 → 之後安靜
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

  /** 開始一筆新的墨跡（armed：從最後到達的點附近出發） */
  const begin = (pt: Pt, isPen: boolean) => {
    const p = picRef.current
    const [fx, fy] = p.pts[stepRef.current % p.pts.length]
    const id = ++segId.current
    stroke.current = { id, armed: Math.hypot(pt.x - fx, pt.y - fy) <= ARM, last: { x: pt.x, y: pt.y }, pen: isPen }
    putInk((list) => [...list, { id, pts: [[pt.x, pt.y, pressureOf(pt, isPen)]], pen: isPen }])
  }

  /** 正在畫的這一筆沒連到下一個點：慢慢淡掉（只往 0 走一次），淡完再拿掉 */
  const fadeStroke = () => {
    const s = stroke.current
    stroke.current = null
    if (!s) return
    putInk((list) => list.map((g) => (g.id === s.id ? { ...g, fade: true } : g)))
    window.setTimeout(() => putInk((list) => list.filter((g) => g.id !== s.id)), ms(FADE_OUT_S) + 80)
  }

  const connect = (n: number, pt: Pt) => {
    const L = picRef.current.pts.length
    // 這一段的墨跡留下來（就是孩子畫的樣子，不拉直）；手指還按著的話，從這裡接著畫下一段
    const s = stroke.current
    stroke.current = null
    goStep(n)
    setNudge(false)
    wrongSeen.current.clear()
    wrongHold.current = null
    if (n === L) return void finish()
    if (s) begin(pt, s.pen)
    sfx.count(n)
    setPop({ i: n, k: performance.now() })
    if (n === L - 1) {
      // 數字連完了：家亮起來、跳一下，「Now, back home!」
      setHop((h) => h + 1)
      void say(`dodo.num.${n}`, 'd.dots.gohome')
    } else void say(`dodo.num.${n}`)
  }

  const down = (pt: Pt, type: string) => {
    pressed.current = { pen: type === 'pen' }
    if (busy.current || stepRef.current >= picRef.current.pts.length) return
    idle.poke()
    begin(pt, type === 'pen')
  }

  const move = (pt: Pt) => {
    if (!pressed.current || busy.current) return
    const p = picRef.current
    const L = p.pts.length
    const s = stepRef.current
    if (s >= L) return
    // 有畫線就重新計時
    idle.poke()
    // 示範時就按著的手：換孩子之後一動就開始畫
    if (!stroke.current) return begin(pt, pressed.current.pen)
    const cur = stroke.current
    const prev = cur.last
    cur.last = { x: pt.x, y: pt.y }
    const q: [number, number, number] = [pt.x, pt.y, pressureOf(pt, cur.pen)]
    putInk((list) => list.map((g) => (g.id === cur.id ? { ...g, pts: [...g.pts, q] } : g)))
    const near = (i: number, r: number) => segDist(p.pts[i][0], p.pts[i][1], prev, pt) <= r
    if (!cur.armed) {
      if (!near(s % L, ARM)) return
      cur.armed = true
    }
    const target = (s + 1) % L
    if (near(target, HIT)) return connect(s + 1, pt)
    if (wrongHold.current !== null) {
      if (near(wrongHold.current, HIT * 1.4)) return
      wrongHold.current = null
    }
    // 還沒輪到的點（家和連過的點不算）：不算錯、不出聲，這一段墨跡慢慢淡掉，下一個點再亮一下
    let hit = -1
    let best = HIT
    p.pts.forEach(([x, y], i) => {
      const d = segDist(x, y, prev, pt)
      if (i > s && i !== target && d <= best) {
        best = d
        hit = i
      }
    })
    if (hit < 0) return
    wrongHold.current = hit
    if (!wrongSeen.current.has(hit)) {
      wrongSeen.current.add(hit)
      wrongTouches.current++
    }
    setFlash({ i: target, k: performance.now() })
    fadeStroke()
    // 手還按著：墨跡繼續跟著手，回到最後到達的點就又算數
    begin(pt, cur.pen)
  }

  const up = () => {
    pressed.current = null
    wrongHold.current = null
    const s = stroke.current
    if (!s) return
    // 不是從最後到達的點出發的一筆：那個點亮一圈，告訴孩子從這裡開始
    if (!s.armed && (inkRef.current.find((g) => g.id === s.id)?.pts.length ?? 0) > 4) setStartPulse(performance.now())
    fadeStroke()
  }

  const pts = pic.pts
  const L = pts.length
  const c = centroid(pic)
  const target = step < L ? (step + 1) % L : -1
  const home = pts[0]
  const homeNext = target === 0 && !reveal
  const startPt = pts[step % L]
  // 示範的圖擦掉時（erasing），點點和家同時淡回來、而且已經是「還沒連」的樣子：圖 → 點點只換一次，中間不會露出空白
  const back = reveal && !erasing
  const dotStep = erasing ? 0 : step
  const breathe = { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } as const

  return (
    <Shell station="draw" mood="idle" progress={{ total: ROUNDS, done: r }} onExit={onExit} hideHost demo={demoInk.length > 0}>
      {/* 換一回合：新的一回合蓋在舊的上面淡入，舊的（孩子畫好、變彩色的樣子）等一下才淡掉，不會一下子變空（ui/Scenes.tsx 的 Swap） */}
      <Swap id={r} style={{ inset: '0 4% 4%' }}>
        <>
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

          {/* 示範畫出來的墨跡：示範完整個淡掉，淡完才拿掉 */}
          {demoInk.length > 0 && (
            <motion.g data-ink="demo" initial={false} animate={{ opacity: erasing ? 0 : 1 }} transition={{ duration: ERASE / 1000, ease: EASE.in }}>
              {demoInk.map((d, k) => d && <path key={k} d={inkPath(d, true)} fill={INK} />)}
            </motion.g>
          )}

          {/* 孩子畫的墨跡：連到點的留下來，沒連到的慢慢淡掉 */}
          <g data-ink="child">
            {ink.map((g) => (
              <motion.path key={g.id} data-seg={g.fade ? 'fade' : 'keep'} d={inkPath(g.pts, g.pen)} fill={INK} initial={false} animate={{ opacity: g.fade ? 0 : 1 }} transition={FADE_OUT} />
            ))}
          </g>

          {/* 1、2、3… 的點 */}
          <motion.g data-dots="" initial={false} animate={{ opacity: back ? 0 : 1 }} transition={{ duration: back ? 0.5 : ERASE / 1000, delay: back ? 0.25 : 0 }}>
            {pts.map(([x, y], i) => {
              if (i === 0) return null
              const isDone = i <= dotStep
              const isNext = i === target && !reveal
              const lb = labelAt(pic, i)
              return (
                <g key={i} data-dot={i}>
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
          <motion.g data-home="" initial={false} animate={{ opacity: back ? 0 : 1 }} transition={{ duration: back ? 0.5 : ERASE / 1000, delay: back ? 1.1 : 0 }}>
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

          {/* 從這裡開始：沒從最後到達的點出發時，那個點亮一圈 */}
          {startPulse > 0 && !reveal && (
            <motion.circle key={`s${startPulse}`} cx={startPt[0]} cy={startPt[1]} fill="none" stroke={BUTTER} strokeWidth={9} initial={{ r: 30, opacity: 0.95 }} animate={{ r: 96, opacity: 0 }} transition={{ duration: 0.9, ease: easeOut }} />
          )}

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
        <Ink w={1000} h={600} ink={false} onDown={down} onMove={move} onUp={up} />
        </>
      </Swap>
    </Shell>
  )
}
