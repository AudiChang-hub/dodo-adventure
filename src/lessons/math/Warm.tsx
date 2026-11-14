import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../../games/NotYet'
import { useFlow } from '../../games/barge'
import { wait } from '../../games/lines'
import { PACE } from '../../games/pace'
import { say, sfx } from '../../lib/audio'
import { logTeach } from '../../lib/record'
import { Sparkles } from '../../ui/Sparkles'
import { EASE } from '../../ui/motion'
import { FIRM } from './plan'
import { COUNT_GAP_MS, FINGERS, fingersUp, findScene, warmFor, type Finger, type FindSpot, type WarmPlay } from './warmup'
import { pointIn, useLive, type PartCtx } from './kit'

/** 輪到他、這麼久沒點：手出來指要點的地方，再說一次題目（只說一次，之後手留著） */
const IDLE_MS = 7000

/**
 * 開場「玩著數數」（T-147，warmup.ts）：動作數數（青蛙跳荷葉）、手指數數（一隻大手）、找找看（草地上找東西）三種輪流，都數到今天的數字。
 * - 波波先說題目（Jump three times!／Show me three!／Find three ducks!）；說的時候點了就停掉語音、直接算第一下（三歲等不及）。
 * - 每點一下念一個數（One! Two!），兩下之間至少隔 COUNT_GAP_MS（節奏慢而穩；連點、多指壓下去只算一下）。
 * - 到今天的數字就停：念總數（Three jumps!）、放煙火，記一筆 logTeach（warm:<玩法>，不記作答），出「下一步」大箭頭。
 * - 7 秒沒點：手出來指要點的地方、再說一次題目。
 */
export function WarmPart({ ctx, play }: { ctx: PartCtx; play: WarmPlay }) {
  const n = ctx.lesson.n
  const [kind] = useState(() => warmFor(play, n))
  const [scene] = useState(() => (kind === 'find' ? findScene(n) : null))
  const goal = scene ? scene.spots.filter((s) => s.target).length : n
  const [count, setCount] = useState(0)
  /** 找找看：點到的是第幾個位置（照點的順序） */
  const [found, setFound] = useState<number[]>([])
  const [done, setDone] = useState(false)
  const [hand, setHand] = useState(false)
  const [press, setPress] = useState(0)
  const [hold, setHold] = useState(true)
  /** 點了但還不能算（剛數過一下）、或點到已經數過的：那個東西輕輕晃一下 */
  const [wiggle, setWiggle] = useState<{ at: number; k: number } | null>(null)
  const live = useLive()
  const flow = useFlow()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  /** 手要指的地方（青蛙、大手、下一個還沒找到的） */
  const aim = useRef<HTMLElement | null>(null)
  const spotEls = useRef<(HTMLElement | null)[]>([])
  const countRef = useRef(0)
  const foundRef = useRef<number[]>([])
  const last = useRef(0)
  const over = useRef(false)
  const idleT = useRef(0)
  const nudged = useRef(false)
  const t0 = useRef(performance.now())

  const prompt = kind === 'hop' ? `ma.hop.go.${n}` : kind === 'fingers' ? `ma.fingers.show.${n}` : `ma.find.${scene!.thing.icon}.${goal}`
  const total = kind === 'hop' ? `ma.hop.total.${n}` : kind === 'fingers' ? `ma.fingers.total.${n}` : `ma.found.${scene!.thing.icon}.${goal}`

  const idle = () => {
    clearTimeout(idleT.current)
    idleT.current = window.setTimeout(() => {
      if (!live.current || over.current) return
      setHand(true)
      setPress((p) => p + 1)
      if (!nudged.current) {
        nudged.current = true
        void say(prompt)
      }
    }, IDLE_MS)
  }

  useEffect(() => {
    ctx.host.current = () => {
      if (!over.current) void say(prompt)
    }
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時在念
    const boot = window.setTimeout(async () => {
      const ok = flow.begin(live)
      await say(prompt)
      if (!ok() || countRef.current > 0) return
      setHand(true)
      setPress((p) => p + 1)
      idle()
    }, 0)
    const arm = window.setTimeout(() => setHold(false), PACE.BARGE_ARM)
    return () => {
      clearTimeout(boot)
      clearTimeout(arm)
      clearTimeout(idleT.current)
      ctx.host.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 數一下（spot：找找看點到的位置）。回傳有沒有算 */
  const bump = (spot?: number) => {
    if (over.current) return false
    const now = performance.now()
    if (now - last.current < COUNT_GAP_MS) return false
    last.current = now
    // 搶點：停掉正在說的題目（或上一個數字），直接算這一下
    flow.cut()
    setHand(false)
    const k = ++countRef.current
    setCount(k)
    if (spot != null) {
      foundRef.current = [...foundRef.current, spot]
      setFound(foundRef.current)
    }
    if (kind === 'hop') sfx.pop()
    const ok = flow.begin(live)
    if (k < goal) {
      void say(`m.num.${k}`)
      idle()
      return true
    }
    // 數到今天的數字：停住、說總數、放煙火
    over.current = true
    clearTimeout(idleT.current)
    void (async () => {
      await say(`m.num.${k}`)
      if (!ok()) return
      await wait(250)
      if (!ok()) return
      setDone(true)
      sfx.correct()
      ctx.ping()
      await say(total)
      if (!live.current) return
      void logTeach({ station: 'math', game: `m-warm-${kind}`, itemId: String(goal), skill: `warm:${kind}`, level: 1, ms: Math.round(performance.now() - t0.current) })
      await wait(400)
      if (live.current) ctx.done(0, 0)
    })()
    return true
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!layer.current || over.current) return
    if (kind === 'find') {
      if (!firstFinger(e.nativeEvent)) return
      const el = (e.target as Element).closest<HTMLElement>('[data-spot]')
      const i = el ? Number(el.dataset.spot) : -1
      const s = scene!.spots[i]
      if (s?.target && !foundRef.current.includes(i)) {
        if (!bump(i)) setWiggle({ at: i, k: performance.now() })
        return
      }
      if (s) {
        // 已經數過的、不是要找的：晃一下，不算（M3：點過的不會被算兩次）
        setWiggle({ at: i, k: performance.now() })
        if (!s.target) sfx.notYet()
        return
      }
      const p = localPoint(layer.current, e.clientX, e.clientY)
      notYet.ping(p.x, p.y)
      return
    }
    // 青蛙、大手：點哪裡都算一下（多指一起壓只算一下）
    if (!bump()) setWiggle({ at: -1, k: performance.now() })
  }

  // 手指著的地方：找找看指下一個還沒找到的；其他指青蛙、大手
  const nextSpot = scene ? scene.spots.findIndex((s, i) => s.target && !found.includes(i)) : -1
  const target = kind === 'find' ? spotEls.current[nextSpot] : aim.current
  const at = hand && !done ? pointIn(target, layer.current, 0.5, 0.55) : null

  return (
    <div className={`ma-warm ma-warm-${kind}`} ref={layer} onPointerDown={down} data-warm={kind} data-warm-count={count} data-warm-goal={goal} data-warm-done={done ? '1' : undefined}>
      {kind === 'hop' && <Hop n={n} count={count} done={done} wiggle={wiggle} aim={aim} />}
      {kind === 'fingers' && <Fingers n={n} count={count} done={done} wiggle={wiggle} aim={aim} />}
      {kind === 'find' && <Find spots={scene!.spots} found={found} done={done} wiggle={wiggle} els={spotEls} />}
      {done && (
        <div className="ma-warm-burst" aria-hidden="true">
          <Sparkles count={22} />
        </div>
      )}
      <AnimatePresence>{at && <Hand key="warm" x={at.x} y={at.y} tap={press} size="10cqmin" cuff="#F0B088" />}</AnimatePresence>
      {notYet.view}
      <WaitShield on={hold} />
    </div>
  )
}

type Wiggle = { at: number; k: number } | null

// ── 動作數數（M2）：青蛙一下跳一片荷葉，跳過的荷葉亮著、寫著數字 ─────────────

/** 荷葉的位置（百分比）：5 片以內一排；6 片以上第一排 5 片、第二排是多出來的（「5 和 1」） */
function pads(n: number) {
  if (n <= FIRM) {
    const gap = Math.min(14, 56 / Math.max(1, n - 1))
    const x0 = 60 - (gap * (n - 1)) / 2
    return Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 60 : x0 + i * gap, y: 62 }))
  }
  return Array.from({ length: n }, (_, i) => ({ x: 32 + (i % FIRM) * 13.5, y: i < FIRM ? 46 : 74 }))
}

function Hop({ n, count, done, wiggle, aim }: { n: number; count: number; done: boolean; wiggle: Wiggle; aim: React.MutableRefObject<HTMLElement | null> }) {
  const ps = pads(n)
  const start = { x: Math.max(20, ps[0].x - 13), y: ps[0].y + 4 }
  const pos = count > 0 ? ps[count - 1] : start
  return (
    <div className="ma-fill" aria-hidden="true">
      <div className="ma-pond" />
      {ps.map((p, i) => (
        <div key={i} className={`ma-pad${i < count ? ' on' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          {i < count && <span className="ma-pad-num">{i + 1}</span>}
        </div>
      ))}
      <motion.div
        ref={(el: HTMLDivElement | null) => {
          aim.current = el
        }}
        className="ma-frog"
        initial={false}
        animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        transition={{ duration: 0.42, ease: EASE.out }}
      >
        <motion.div
          key={`${count}-${wiggle?.k ?? 0}-${done}`}
          className="ma-frog-in"
          animate={done ? { y: ['0%', '-30%', '0%', '-18%', '0%'] } : count ? { y: ['0%', '-55%', '0%'] } : wiggle ? { rotate: [0, -8, 8, 0] } : {}}
          transition={{ duration: done ? 0.9 : 0.42, ease: EASE.out }}
        >
          <Emoji name="frog" />
        </motion.div>
      </motion.div>
    </div>
  )
}

// ── 手指數數（M1）：一隻大手照固定的比法伸手指，旁邊同時出現同樣數量的東西 ──────────

/** 每根手指在手的圖（viewBox 0 0 200 250）裡的位置：根部 x、伸出來的長度、角度 */
const FINGER_ART: Record<Finger, { x: number; y: number; w: number; len: number; rot: number }> = {
  thumb: { x: 44, y: 150, w: 30, len: 62, rot: -52 },
  index: { x: 66, y: 112, w: 28, len: 78, rot: -8 },
  middle: { x: 98, y: 106, w: 29, len: 88, rot: 0 },
  ring: { x: 130, y: 110, w: 28, len: 80, rot: 7 },
  pinky: { x: 158, y: 124, w: 24, len: 60, rot: 16 },
}

function HandArt({ up }: { up: Finger[] }) {
  return (
    <svg className="ma-hand" viewBox="0 0 200 250" aria-hidden="true">
      {FINGERS.map((f) => {
        const a = FINGER_ART[f]
        const on = up.includes(f)
        // 收起來的手指只露出一小截（握拳的樣子）
        const h = on ? a.len : 20
        return (
          <g key={f} transform={`rotate(${a.rot} ${a.x} ${a.y})`}>
            <rect
              className={`ma-finger${on ? ' up' : ''}`}
              x={a.x - a.w / 2}
              y={a.y - h}
              width={a.w}
              height={h + 26}
              rx={a.w / 2}
              style={{ transition: 'y 0.3s var(--ease-out), height 0.3s var(--ease-out)' }}
            />
            {on && <rect className="ma-nail" x={a.x - a.w * 0.28} y={a.y - h + 6} width={a.w * 0.56} height={Math.min(18, a.w * 0.6)} rx={6} />}
          </g>
        )
      })}
      <rect className="ma-palm" x="40" y="104" width="134" height="120" rx="46" />
      {/* 收起來的手指壓在手掌上的那一排指節 */}
      {FINGERS.filter((f) => f !== 'thumb' && !up.includes(f)).map((f) => (
        <rect key={f} className="ma-knuckle" x={FINGER_ART[f].x - 13} y={112} width={26} height={24} rx={12} />
      ))}
    </svg>
  )
}

function Fingers({ n, count, done, wiggle, aim }: { n: number; count: number; done: boolean; wiggle: Wiggle; aim: React.MutableRefObject<HTMLElement | null> }) {
  const [a, b] = fingersUp(count)
  const two = n > 5
  return (
    <div className="ma-fill" aria-hidden="true">
      <motion.div
        ref={(el: HTMLDivElement | null) => {
          aim.current = el
        }}
        key={`${wiggle?.k ?? 0}-${done}`}
        className={`ma-hands${two ? ' two' : ''}`}
        animate={done ? { y: [0, -12, 0] } : wiggle ? { rotate: [0, -3, 3, 0] } : {}}
        transition={{ duration: 0.4, ease: EASE.out }}
      >
        <HandArt up={a} />
        {two && <HandArt up={b} />}
      </motion.div>
      <div className={`ma-finger-things${n > 5 ? ' two' : ''}`}>
        {Array.from({ length: count }, (_, i) => (
          <motion.span key={i} className="ma-finger-thing" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3, ease: EASE.out }}>
            <Emoji name="red-apple" />
          </motion.span>
        ))}
      </div>
      <AnimatePresence>
        {count > 0 && (
          <motion.span key={count} className="ma-finger-num" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25, ease: EASE.out }}>
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── 找找看（M3）：草地上點要找的東西，點到的亮一圈、寫上數字 ──────────────

function Find({ spots, found, done, wiggle, els }: { spots: FindSpot[]; found: number[]; done: boolean; wiggle: Wiggle; els: React.MutableRefObject<(HTMLElement | null)[]> }) {
  return (
    <div className="ma-fill">
      <div className="ma-meadow" aria-hidden="true" />
      {spots.map((s, i) => {
        const k = found.indexOf(i)
        return (
          <motion.button
            key={i}
            type="button"
            ref={(el: HTMLButtonElement | null) => {
              els.current[i] = el
            }}
            className={`ma-spot${s.target ? ' is-target' : ''}${k >= 0 ? ' on' : ''}`}
            data-spot={i}
            data-target={s.target ? '1' : undefined}
            aria-label={s.target ? '要找的' : '別的東西'}
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
            animate={wiggle?.at === i ? { rotate: [0, -10, 10, 0] } : done && k >= 0 ? { y: [0, -10, 0] } : {}}
            transition={{ duration: 0.4, ease: EASE.out }}
          >
            <Emoji name={s.icon} />
            {k >= 0 && <span className="ma-badge">{k + 1}</span>}
          </motion.button>
        )
      })}
    </div>
  )
}
