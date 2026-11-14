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
import { PATH_END, rollDie, stepOnce, stepsFor } from './path-plan'
import { COUNT_GAP_MS } from './warmup'
import { pointIn, useLive, type PartCtx } from './kit'

/** 輪到他、這麼久沒點：手出來指要點的地方（骰子或小恐龍），第一次再說一次要做什麼 */
const IDLE_MS = 7000
/** 骰子轉多久 */
const ROLL_MS = 900
/** 前幾次擲完說「Tap the dino!」，之後只念點數（話少一點） */
const TELL_WALK = 2

/** 骰子的點（viewBox 0 0 100 100） */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
}

function Die({ face }: { face: number }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="6" y="6" width="88" height="88" rx="20" fill="#fffaf2" stroke="#c86b3c" strokeWidth="5" />
      {(PIPS[face] ?? PIPS[1]).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="10" fill="#2e2a25" />
      ))}
    </svg>
  )
}

/**
 * 數字小路（T-150 M，./path-plan.ts）：開場「玩著數數」的第四種，數字小路的門開了才輪得到。
 * 一條水平直線的 10 格（1～10），小恐龍從 1 左邊的起點出發。
 * - 「Let's walk to ten! Roll the dice!」點骰子：骰子轉一下停在 1 或 2，波波念點數（Two!）。
 * - 點小恐龍一下走一格，念那一格的數字（Five! Six!），走過的格子亮著；走完骰子的點數就停（多點的不算），再擲。
 * - 兩下之間至少隔 COUNT_GAP_MS（連點、多指壓下去只算一下）；骰子轉的時候、還沒擲就點小恐龍：晃一下、手指骰子。
 * - 停著的時候點小恐龍、或它站的那一格：再念一次那一格的數字。
 * - 走到 10 就停：煙火、「Ten! You did it!」，記一筆 logTeach（warm:path），出「下一步」大箭頭。
 * - 7 秒沒點：手出來指（要擲就指骰子，要走就指小恐龍）。陪玩小字建議大人也擲、輪流走；App 只有一隻小恐龍，不比輸贏。
 */
export function PathPart({ ctx }: { ctx: PartCtx }) {
  const [pos, setPos] = useState(0)
  const [left, setLeft] = useState(0)
  const [face, setFace] = useState(1)
  const [rolling, setRolling] = useState(false)
  const [done, setDone] = useState(false)
  const [hand, setHand] = useState(false)
  const [press, setPress] = useState(0)
  const [hold, setHold] = useState(true)
  const [wiggle, setWiggle] = useState<{ at: 'dino' | 'die'; k: number } | null>(null)
  const live = useLive()
  const flow = useFlow()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const dieEl = useRef<HTMLButtonElement | null>(null)
  const dinoEl = useRef<HTMLButtonElement | null>(null)
  const posRef = useRef(0)
  const leftRef = useRef(0)
  const rollingRef = useRef(false)
  const over = useRef(false)
  const rolls = useRef(0)
  const last = useRef(0)
  const idleT = useRef(0)
  const nudged = useRef(false)
  const t0 = useRef(performance.now())

  /** 現在要他做的事：還有步數就走，不然擲骰子 */
  const want = () => (leftRef.current > 0 ? 'walk' : 'roll')

  const idle = () => {
    clearTimeout(idleT.current)
    idleT.current = window.setTimeout(() => {
      if (!live.current || over.current || rollingRef.current) return
      setHand(true)
      setPress((p) => p + 1)
      if (!nudged.current) {
        nudged.current = true
        void say(want() === 'walk' ? 'ma.path.walk' : 'ma.path.roll')
      }
    }, IDLE_MS)
  }

  useEffect(() => {
    ctx.host.current = () => {
      if (!over.current) void say(want() === 'walk' ? 'ma.path.walk' : 'ma.path.roll')
    }
    const boot = window.setTimeout(async () => {
      const ok = flow.begin(live)
      await say('ma.path.go', 'ma.path.roll')
      if (!ok() || rolls.current > 0) return
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

  const roll = async () => {
    if (over.current || rollingRef.current || leftRef.current > 0) return false
    // 搶點：停掉正在說的話，直接擲
    flow.cut()
    setHand(false)
    clearTimeout(idleT.current)
    rollingRef.current = true
    setRolling(true)
    sfx.pop()
    const r = rollDie()
    // 轉的時候點數跳來跳去
    const flick = window.setInterval(() => setFace((f) => (f === 1 ? 2 : 1)), 120)
    await wait(ROLL_MS)
    clearInterval(flick)
    if (!live.current) return true
    setFace(r)
    setRolling(false)
    rollingRef.current = false
    rolls.current++
    leftRef.current = stepsFor(posRef.current, r)
    setLeft(leftRef.current)
    last.current = 0
    const ok = flow.begin(live)
    await say(`m.num.${r}`, ...(rolls.current <= TELL_WALK ? ['ma.path.walk'] : []))
    if (!ok()) return true
    if (leftRef.current > 0 && posRef.current === 0) {
      setHand(true)
      setPress((p) => p + 1)
    }
    idle()
    return true
  }

  const step = () => {
    if (over.current) return false
    const now = performance.now()
    if (now - last.current < COUNT_GAP_MS) return false
    const s = stepOnce(posRef.current, leftRef.current)
    if (!s.moved) return false
    last.current = now
    flow.cut()
    setHand(false)
    posRef.current = s.pos
    leftRef.current = s.left
    setPos(s.pos)
    setLeft(s.left)
    sfx.pop()
    const ok = flow.begin(live)
    if (s.pos < PATH_END) {
      void say(`m.num.${s.pos}`)
      idle()
      return true
    }
    // 走到 10：停住、煙火、說「Ten! You did it!」
    over.current = true
    clearTimeout(idleT.current)
    void (async () => {
      await say(`m.num.${PATH_END}`)
      if (!ok()) return
      await wait(250)
      if (!ok()) return
      setDone(true)
      sfx.correct()
      ctx.ping()
      await say('ma.path.done')
      if (!live.current) return
      void logTeach({ station: 'math', game: 'm-warm-path', itemId: String(PATH_END), skill: 'warm:path', level: 1, ms: Math.round(performance.now() - t0.current) })
      await wait(400)
      if (live.current) ctx.done(0, 0)
    })()
    return true
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!layer.current || over.current || !firstFinger(e.nativeEvent)) return
    const el = (e.target as Element).closest<HTMLElement>('[data-path-hit]')
    const hit = el?.dataset.pathHit
    if (hit === 'die') {
      if (rollingRef.current) return
      if (leftRef.current > 0) {
        // 還有步數沒走：骰子晃一下、手指小恐龍
        setWiggle({ at: 'die', k: performance.now() })
        setHand(true)
        setPress((p) => p + 1)
        return
      }
      void roll()
      return
    }
    if (hit === 'dino' || (hit === 'cell' && Number(el?.dataset.cell) === posRef.current && posRef.current > 0)) {
      if (leftRef.current > 0) {
        if (!step()) setWiggle({ at: 'dino', k: performance.now() })
        return
      }
      // 沒有步數：再念一次站的那一格；手指骰子
      setWiggle({ at: 'dino', k: performance.now() })
      if (!rollingRef.current && performance.now() - last.current > COUNT_GAP_MS) {
        last.current = performance.now()
        if (posRef.current > 0) void say(`m.num.${posRef.current}`)
        setHand(true)
        setPress((p) => p + 1)
      }
      return
    }
    const p = localPoint(layer.current, e.clientX, e.clientY)
    notYet.ping(p.x, p.y)
  }

  const target = want() === 'walk' ? dinoEl.current : dieEl.current
  const at = hand && !done && !rolling ? pointIn(target, layer.current, 0.5, 0.6) : null
  /** 格子的中心（百分比）：一條水平直線，10 格一樣大 */
  const cellX = (i: number) => 25 + (i - 0.5) * 7
  const dinoX = pos === 0 ? cellX(0) : cellX(pos)

  return (
    <div className="ma-path" ref={layer} onPointerDown={down} data-path-pos={pos} data-path-left={left} data-path-done={done ? '1' : undefined} data-path-rolling={rolling ? '1' : undefined}>
      <div className="ma-path-start" style={{ left: `${cellX(0)}%` }} aria-hidden="true" />
      {Array.from({ length: PATH_END }, (_, i) => (
        <div key={i} className={`ma-path-cell${i < pos ? ' on' : ''}${i + 1 === pos ? ' here' : ''}`} style={{ left: `${cellX(i + 1)}%` }} data-path-hit="cell" data-cell={i + 1}>
          <span>{i + 1}</span>
        </div>
      ))}
      <motion.button
        type="button"
        ref={dinoEl}
        className="ma-path-dino"
        data-path-hit="dino"
        aria-label="小恐龍"
        initial={false}
        animate={{ left: `${dinoX}%` }}
        transition={{ duration: 0.4, ease: EASE.out }}
      >
        <motion.span
          key={`${pos}-${wiggle?.at === 'dino' ? wiggle.k : 0}-${done}`}
          className="ma-path-dino-in"
          animate={done ? { y: ['0%', '-30%', '0%', '-18%', '0%'] } : pos ? { y: ['0%', '-40%', '0%'] } : wiggle?.at === 'dino' ? { rotate: [0, -8, 8, 0] } : {}}
          transition={{ duration: done ? 0.9 : 0.4, ease: EASE.out }}
        >
          <Emoji name="sauropod" />
        </motion.span>
      </motion.button>
      <motion.button
        type="button"
        ref={dieEl}
        className={`ma-path-die${left > 0 ? ' used' : ''}`}
        data-path-hit="die"
        aria-label="骰子"
        key={`die-${wiggle?.at === 'die' ? wiggle.k : 0}`}
        animate={rolling ? { rotate: [0, 90, 180, 270, 360] } : wiggle?.at === 'die' ? { rotate: [0, -8, 8, 0] } : {}}
        transition={rolling ? { duration: ROLL_MS / 1000, ease: 'linear' } : { duration: 0.35, ease: EASE.out }}
      >
        <Die face={face} />
      </motion.button>
      {done && (
        <div className="ma-path-burst" aria-hidden="true">
          <Sparkles count={22} />
        </div>
      )}
      <AnimatePresence>{at && <Hand key="path" x={at.x} y={at.y} tap={press} size="10cqmin" cuff="#F0B088" />}</AnimatePresence>
      {notYet.view}
      <WaitShield on={hold} />
    </div>
  )
}
