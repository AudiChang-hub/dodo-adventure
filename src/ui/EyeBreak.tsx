import { useEffect, useRef, useState } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { onSpeakLevel, say, sfx } from '../lib/audio'
import { getKV, today } from '../lib/db'
import { currentRoute } from '../lib/nav'
import { finishBreak } from '../lib/session'
import type { ThemeId } from '../content/themes'
import { EYE_FIND, EYE_FIND_ROTATION, EYE_FIND_THEME, EYE_KEEP, EYE_MOVES, type EyeFind, type EyeMove } from '../content/lines-eyebreak'
import '../art/dino.css'
import '../games/coplay.css'
import './eyebreak.css'

/** 看遠方的秒數（20-20-20 原則）；時間到之後豆豆再說一句鼓勵才結束，不算在 20 秒裡 */
const SECONDS = 20

/**
 * 護眼休息。目的是讓孩子的視線「離開」螢幕，所以畫面只負責示範和指方向，不負責好看到讓人盯著：
 * - 豆豆把手搭在額頭上、望向右上方；一道淡淡的虛線和三隻小鳥沿著牠的視線飛出畫面外。
 * - 豆豆想的東西（樹、小鳥、藍色…）放在一個小泡泡裡，說完就沿著視線越飛越小、飛出去：「它在外面」。
 * - 之後整個畫面慢慢蒙上一層紙色，變得很淡，沒有東西可看；只剩語音帶著他做。
 * - 中間穿插一個身體小任務（眨眼／伸懶腰／揮手），豆豆做同一個動作；之後再請他看遠方。
 * 每次休息輪替不同的任務；今日冒險有主題時，找東西的任務跟故事呼應。
 * 中文只給爸爸看（角落小字，跟遊戲裡的陪玩提示同一種樣式），倒數是角落的一排小點。
 */

type Phase = 'intro' | 'find' | 'look' | 'move' | 'again' | 'done'
type Pose = 'rest' | 'visor' | 'stretch' | 'wave' | 'cheer'

// ── 輪替：每次休息換一個任務 ─────────────────────────────────
const TURN_KEY = 'dodo.eyebreak.turn'
const LAST_KEY = 'dodo.eyebreak.last'

function nextTurn(): { n: number; last: string | null } {
  try {
    const n = Number(localStorage.getItem(TURN_KEY)) || 0
    const last = localStorage.getItem(LAST_KEY)
    localStorage.setItem(TURN_KEY, String(n + 1))
    return { n, last }
  } catch {
    return { n: Math.floor(Math.random() * 21), last: null }
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id)
  } catch {
    /* 私密視窗等情況存不了，沒關係 */
  }
}

const findById = (id: string) => EYE_FIND.find((f) => f.id === id)!

/** 今日冒險途中有主題，就問跟主題有關的東西（同一個任務不連著出兩次） */
async function pickFind(n: number, last: string | null): Promise<EyeFind> {
  const plain = findById(EYE_FIND_ROTATION[n % EYE_FIND_ROTATION.length])
  if (currentRoute().name !== 'adventure') return plain
  try {
    const plan = await getKV<{ theme?: ThemeId } | null>(`plan:${today()}`, null)
    const id = plan?.theme ? EYE_FIND_THEME[plan.theme] : undefined
    return id && id !== last ? findById(id) : plain
  } catch {
    return plain
  }
}

// ── 視線：從豆豆的眼睛往右上方、一路延伸到畫面外的一條弧線 ──────────
// 座標是舞台（.eb-stage，600×500）的；終點遠在畫面外，橫向、直向都一定出得去
const P0 = [262, 330]
const P1 = [880, 280]
const P2 = [1700, -700]
const GAZE = `M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`

function onGaze(t: number): [number, number] {
  const a = (1 - t) * (1 - t)
  const b = 2 * t * (1 - t)
  const c = t * t
  return [a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1]]
}

/** 沿著視線取樣（給 motion 的關鍵影格），off 是往弧線法線方向的偏移 */
function along(t0: number, t1: number, steps: number, off = 0) {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps
    const [x, y] = onGaze(t)
    const [x2, y2] = onGaze(Math.min(1, t + 0.01))
    const len = Math.hypot(x2 - x, y2 - y) || 1
    xs.push(x + (-(y2 - y) / len) * off)
    ys.push(y + ((x2 - x) / len) * off)
  }
  return { xs, ys }
}

const BUBBLE_T = 0.18
const BUBBLE = onGaze(BUBBLE_T)

// ── 豆豆（DodoArt 的造型，加上會動的手）──────────────────────
const INK = '#2E2A25'
const BODY = '#8FCBAA'
const DEEP = '#5FA883'
const BELLY = '#D5EEDF'
const ACCENT = '#6DB591'
/** 後面那隻手：比身體暗一點，看得出在後面 */
const BODY_FAR = '#7DBB99'
const CHEEK = '#F2A9A0'
const stroke = { stroke: DEEP, strokeWidth: 3.5, strokeLinejoin: 'round' as const }

/** 手：一段二次曲線（肩膀 → 手肘 → 手掌）＋手掌。各姿勢的指令結構相同，motion 才能補間 */
const NEAR: Record<Pose, { d: string; paw: [number, number, number, number] }> = {
  rest: { d: 'M158 136 Q168 142 176 142', paw: [176, 142, 9, 6.5] },
  // 手掌橫搭在眉毛上方，像遮陽一樣望遠
  visor: { d: 'M158 134 Q236 116 188 58', paw: [180, 54, 16, 7.5] },
  stretch: { d: 'M158 132 Q236 108 222 18', paw: [222, 14, 10, 9] },
  wave: { d: 'M158 134 Q238 124 238 66', paw: [238, 62, 10, 9] },
  cheer: { d: 'M158 132 Q232 102 230 32', paw: [230, 28, 10, 9] },
}
const WAVE_ALT = { d: 'M158 134 Q242 126 254 76', paw: [254, 72, 10, 9] as [number, number, number, number] }
/** 另一隻手在身體後面：平常藏起來，伸懶腰、歡呼時從頭的後面舉高 */
const FAR: Record<'tucked' | 'up', { d: string; paw: [number, number, number, number] }> = {
  tucked: { d: 'M128 134 Q122 140 118 142', paw: [118, 142, 8, 6] },
  up: { d: 'M128 122 Q104 84 80 34', paw: [78, 30, 10, 9] },
}

const ARM_EASE = [0.22, 1, 0.36, 1] as const

function Arm({ d, paw, fill, wave }: { d: string; paw: [number, number, number, number]; fill: string; wave?: boolean }) {
  const t = wave
    ? { duration: 2.6, repeat: 2, ease: 'easeInOut' as const }
    : { duration: 1.1, ease: ARM_EASE }
  const ds = wave ? [d, WAVE_ALT.d, d] : d
  const cx = wave ? [paw[0], WAVE_ALT.paw[0], paw[0]] : paw[0]
  const cy = wave ? [paw[1], WAVE_ALT.paw[1], paw[1]] : paw[1]
  return (
    <g>
      <motion.path initial={false} animate={{ d: ds }} transition={t} fill="none" stroke={DEEP} strokeWidth={17} strokeLinecap="round" />
      <motion.path initial={false} animate={{ d: ds }} transition={t} fill="none" stroke={fill} strokeWidth={10} strokeLinecap="round" />
      <motion.ellipse initial={false} animate={{ cx, cy, rx: paw[2], ry: paw[3] }} transition={t} fill={fill} {...stroke} />
    </g>
  )
}

function Mouth() {
  const smile = useRef<SVGPathElement>(null)
  const open = useRef<SVGGElement>(null)
  useEffect(
    () =>
      onSpeakLevel((s, level) => {
        const lv = s === 'dodo' ? level : 0
        if (open.current) open.current.style.transform = `scaleY(${Math.max(0.001, lv)})`
        if (smile.current) smile.current.style.opacity = lv > 0.06 ? '0' : '1'
      }),
    [],
  )
  return (
    <g>
      <path ref={smile} d="M175 101 Q188 113.75 201 100" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <g ref={open} style={{ transformOrigin: '188px 102px', transformBox: 'view-box', transform: 'scaleY(0.001)' }}>
        <ellipse cx={188} cy={108} rx={11} ry={9.75} fill="#7A3E3A" />
        <ellipse cx={189} cy={115} rx={6.5} ry={3.6} fill="#E9908C" />
      </g>
    </g>
  )
}

function LookoutDodo({ pose, blink3, happy }: { pose: Pose; blink3: boolean; happy: boolean }) {
  const near = NEAR[pose]
  const far = pose === 'stretch' || pose === 'cheer' ? FAR.up : FAR.tucked
  return (
    <g className={`eb-dodo pose-${pose}`}>
      <Arm d={far.d} paw={far.paw} fill={BODY_FAR} />
      {[[58, 120], [76, 106], [96, 98], [116, 46], [134, 36]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y + 6} l9 -17 l11 15 Z`} fill={ACCENT} {...stroke} />
      ))}
      <path d="M80 150 C52 152 24 140 6 116 C30 128 54 130 82 126 Z" fill={BODY} {...stroke} />
      <ellipse cx={92} cy={190} rx={20} ry={15} fill={DEEP} />
      <ellipse cx={138} cy={192} rx={19} ry={14} fill={BODY} {...stroke} />
      <g className="dino-breathe">
        <ellipse cx={114} cy={148} rx={56} ry={46} fill={BODY} {...stroke} />
        <ellipse cx={132} cy={158} rx={29} ry={31} fill={BELLY} />
      </g>
      <ellipse cx={152} cy={82} rx={60} ry={48} fill={BODY} {...stroke} />
      <circle cx={204} cy={72} r={2.4} fill={DEEP} />
      <circle cx={196} cy={69} r={2.4} fill={DEEP} />
      {happy ? (
        <path d="M158 72 Q168 57 178 72" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
      ) : (
        <g className={blink3 ? 'eb-eye three' : 'eb-eye'}>
          <ellipse cx={168} cy={70} rx={8.2} ry={10} fill={INK} />
          <circle cx={171} cy={66.2} r={3.2} fill="#fff" />
        </g>
      )}
      <ellipse cx={184} cy={98} rx={10} ry={6} fill={CHEEK} opacity={0.85} />
      <Mouth />
      <Arm d={near.d} paw={near.paw} fill={BODY} wave={pose === 'wave'} />
    </g>
  )
}

// ── 沿著視線飛走的小鳥：簡單的兩筆，慢慢拍翅膀、越飛越小 ─────────
function Bird({ delay, off, dur = 6.5 }: { delay: number; off: number; dur?: number }) {
  const { xs, ys } = along(0.06, 0.82, 16, off)
  const n = xs.length
  return (
    <motion.g
      initial={{ x: xs[0], y: ys[0], opacity: 0, scale: 1 }}
      animate={{ x: xs, y: ys, opacity: [0, 1, 1, 1, 0], scale: [1, 0.4] }}
      transition={{
        delay,
        duration: dur,
        ease: 'linear',
        x: { delay, duration: dur, ease: 'linear', times: xs.map((_, i) => easeIn(i / (n - 1))) },
        y: { delay, duration: dur, ease: 'linear', times: ys.map((_, i) => easeIn(i / (n - 1))) },
      }}
    >
      <path className="eb-wing" d="M-15 0 Q-7.5 -9 0 0 Q7.5 -9 15 0" fill="none" stroke={INK} strokeOpacity={0.5} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${-off * 0.05}s` }} />
    </motion.g>
  )
}

/** 起飛慢、之後穩定：times 用 sqrt 讓前段走得慢一點 */
const easeIn = (u: number) => Math.sqrt(u)

// ── 豆豆想的東西：小泡泡，說完就沿著視線飛出去 ─────────────────
function Thought({ find, state }: { find: EyeFind; state: 'hidden' | 'show' | 'fly' }) {
  const { xs, ys } = along(BUBBLE_T, 0.8, 14)
  const dx = xs.map((x) => x - BUBBLE[0])
  const dy = ys.map((y) => y - BUBBLE[1])
  const fly = state === 'fly'
  return (
    <>
      {/* 泡泡的小尾巴：表示這是豆豆在想的東西 */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: state === 'show' ? 1 : 0 }} transition={{ duration: 0.8 }}>
        <circle cx={345} cy={316} r={6} fill="#FBF8F2" />
        <circle cx={393} cy={300} r={10} fill="#FBF8F2" />
      </motion.g>
      <g transform={`translate(${BUBBLE[0]} ${BUBBLE[1]})`}>
        <motion.g
          initial={{ opacity: 0, scale: 0.85, x: 0, y: 0 }}
          animate={
            fly
              ? { opacity: [1, 1, 1, 0], scale: [1, 0.3], x: dx, y: dy }
              : { opacity: state === 'show' ? 1 : 0, scale: state === 'show' ? 1 : 0.85, x: 0, y: 0 }
          }
          transition={fly ? { duration: 3.4, ease: [0.42, 0, 0.7, 0.7] } : { duration: 0.9, ease: ARM_EASE }}
        >
          <ellipse cx={0} cy={9} rx={62} ry={58} fill="rgba(46,42,37,.06)" />
          <circle r={62} fill="#FBF8F2" stroke="rgba(46,42,37,.07)" strokeWidth={3} />
          {find.icon ? (
            <g transform="translate(-38 -38)" className="eb-icon">
              <Emoji name={find.icon} size={76} />
            </g>
          ) : (
            <g>
              <path d="M-30 -6 C-30 -26 -10 -34 6 -31 C24 -28 34 -14 32 4 C30 22 14 33 -4 31 C-22 29 -30 14 -30 -6 Z" fill={find.color} />
              <path d="M-16 -16 C-10 -21 -2 -22 4 -20" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" />
            </g>
          )}
        </motion.g>
      </g>
    </>
  )
}

// ── 背景：一層比一層淡的遠山，越遠越淡（只是「遠方」的感覺，沒有會動的東西）────
function Distance() {
  return (
    <svg className="eb-land" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path d="M0 470 L120 380 L230 430 L380 300 L520 410 L640 330 L800 420 L940 310 L1080 390 L1200 350 V800 H0 Z" fill="#D6E2DA" />
      <g fill="#C3D4C9">
        {[[300, 452], [330, 446], [690, 438], [720, 444], [1010, 430], [1040, 436]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} l7 -20 l7 20 Z`} />
        ))}
      </g>
      <path d="M0 520 L180 400 L330 490 L520 330 L740 500 L900 400 L1200 540 V800 H0 Z" fill="#C9D9D0" />
      <path d="M0 600 Q300 540 620 590 T1200 570 V800 H0 Z" fill="#B7CFBF" />
      <path d="M0 690 Q400 650 800 690 T1200 680 V800 H0 Z" fill="#A9C6B3" />
      <g fill="#F4F6F1" opacity={0.7}>
        <ellipse cx={240} cy={170} rx={70} ry={16} />
        <ellipse cx={290} cy={158} rx={44} ry={18} />
        <ellipse cx={860} cy={120} rx={60} ry={13} />
        <ellipse cx={900} cy={110} rx={36} ry={15} />
      </g>
    </svg>
  )
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function EyeBreak({ onDone }: { onDone?: () => void }) {
  const [turn] = useState(nextTurn)
  const [find, setFind] = useState<EyeFind | null>(null)
  const move: EyeMove = EYE_MOVES[turn.n % EYE_MOVES.length].id
  const moveZh = EYE_MOVES[turn.n % EYE_MOVES.length].zh
  const [phase, setPhase] = useState<Phase>('intro')
  const [pose, setPose] = useState<Pose>('rest')
  const [bubble, setBubble] = useState<'hidden' | 'show' | 'fly'>('hidden')
  const [left, setLeft] = useState(SECONDS)
  const done = useRef(onDone)
  done.current = onDone

  // 倒數：只管 20 秒；時間到之後的鼓勵另外算
  useEffect(() => {
    const t0 = performance.now()
    const t = setInterval(() => setLeft(Math.max(0, SECONDS - Math.floor((performance.now() - t0) / 1000))), 250)
    return () => clearInterval(t)
  }, [])

  // 腳本：每一段用「從開始算起的時間」對齊，語音比預期長也不會把後面擠亂
  useEffect(() => {
    let alive = true
    const t0 = performance.now()
    const at = async (sec: number) => {
      const ms = sec * 1000 - (performance.now() - t0)
      if (ms > 0) await wait(ms)
      return alive
    }
    const findP = pickFind(turn.n, turn.last).then((f) => {
      if (alive) setFind(f)
      return f
    })
    ;(async () => {
      // 0–4 秒：豆豆把手搭到額頭上望向遠方，小鳥沿著牠的視線飛出畫面
      await wait(400)
      if (!alive) return
      void say('eye.break')
      if (!(await at(1))) return
      setPose('visor')
      // 4–8 秒：豆豆想的東西出現在小泡泡裡，說完就沿著視線飛出去
      const f = await findP
      if (!(await at(4.2))) return
      remember(f.id)
      setPhase('find')
      setBubble('show')
      void say(`eye.find.${f.id}`)
      if (!(await at(7.3))) return
      setBubble('fly')
      // 8–13 秒：畫面蒙上一層紙色，沒有東西可看；中間提醒一次「繼續看」
      if (!(await at(8.4))) return
      setPhase('look')
      if (!(await at(10))) return
      void say(`eye.keep.${turn.n % EYE_KEEP.length}`)
      // 13–16 秒：身體小任務，豆豆示範同一個動作
      if (!(await at(13))) return
      setPhase('move')
      setPose(move === 'blink' ? 'visor' : move)
      void say(`eye.move.${move}`)
      // 16–20 秒：再看一次遠方，最後一隻小鳥飛出去
      if (!(await at(16.2))) return
      setPhase('again')
      setPose('visor')
      void say('eye.again')
      // 20 秒：時間到，畫面亮回來、豆豆歡呼，說完才回到遊戲
      if (!(await at(SECONDS))) return
      setPhase('done')
      setPose('cheer')
      sfx.star()
      await Promise.race([say('eye.done'), wait(5000)])
      await wait(350)
      if (!alive) return
      finishBreak()
      done.current?.()
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const veil = phase === 'look' || phase === 'again' ? 0.52 : phase === 'move' ? 0.34 : 0
  const gaze = phase === 'intro' || phase === 'find' || phase === 'again'
  const hint = find ? `帶他看窗外 6 公尺以外的地方，${find.zh}。${moveZh}，20 秒後回來。` : ''

  return (
    <MotionConfig reducedMotion="user">
      <div className="screen eyebreak" style={{ zIndex: 120 }}>
        <Distance />
        <svg className="eb-stage" viewBox="0 0 600 500" aria-hidden="true">
          <defs>
            <linearGradient id="eb-gaze-fade" gradientUnits="userSpaceOnUse" x1={P0[0]} y1={P0[1]} x2={1150} y2={-180}>
              <stop offset="0" stopColor={INK} stopOpacity={0.34} />
              <stop offset="1" stopColor={INK} stopOpacity={0} />
            </linearGradient>
            <mask id="eb-gaze-reveal" maskUnits="userSpaceOnUse" x={-200} y={-1200} width={2400} height={2000}>
              <motion.path
                key={phase === 'again' ? 'again' : 'first'}
                d={GAZE}
                fill="none"
                stroke="#fff"
                strokeWidth={24}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: phase === 'again' ? 0.2 : 1.4, duration: 3.2, ease: [0.4, 0, 0.2, 1] }}
              />
            </mask>
          </defs>
          {/* 視線：一串慢慢往外走的小點，畫出去之後就淡掉 */}
          <motion.path
            className="eb-gaze"
            d={GAZE}
            fill="none"
            stroke="url(#eb-gaze-fade)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray="0.1 22"
            mask="url(#eb-gaze-reveal)"
            initial={{ opacity: 0 }}
            animate={{ opacity: gaze ? 1 : 0 }}
            transition={{ duration: gaze ? 0.6 : 2.4 }}
          />
          {phase === 'intro' || phase === 'find' ? (
            <g key="birds">
              <Bird delay={1.8} off={-26} />
              <Bird delay={2.4} off={8} />
              <Bird delay={3.1} off={-4} dur={7} />
            </g>
          ) : phase === 'again' ? (
            <g key="bird-again">
              <Bird delay={0.6} off={-10} />
            </g>
          ) : null}
          {find && <Thought find={find} state={bubble} />}
          <g transform="translate(60 290)">
            <LookoutDodo pose={pose} blink3={phase === 'move' && move === 'blink'} happy={phase === 'done'} />
          </g>
        </svg>

        {/* 蒙上一層紙色：看遠方的時候畫面很淡，沒什麼可看 */}
        <motion.div className="eb-veil" initial={{ opacity: 0 }} animate={{ opacity: veil }} transition={{ duration: veil === 0 ? 1.2 : 2.4, ease: 'easeInOut' }} />

        {/* 給爸爸的小字＋低調的倒數 */}
        <motion.div className="eb-corner" initial={{ opacity: 0 }} animate={{ opacity: hint ? 1 : 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
          <p className="coplay-hint" aria-hidden="true">
            <span className="coplay-tag">護眼</span>
            {hint}
          </p>
          <div className="eb-count" role="timer" aria-label={`還有 ${left} 秒`}>
            {Array.from({ length: SECONDS / 2 }, (_, i) => (
              <i key={i} className={i < Math.ceil(left / 2) ? 'on' : undefined} />
            ))}
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  )
}
