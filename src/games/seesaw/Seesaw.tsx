import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, localPoint, useNotYet } from '../NotYet'
import { useFlow } from '../barge'
import { useIdle } from '../idle'
import { wait } from '../lines'
import { PACE } from '../pace'
import { DoneChoices } from '../draw/DoneChoices'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { ANSWER_TAP, useTaps } from '../../ui/tap'
import { pointIn, useLive } from '../logic/kit'
import { GROUND, PIVOT, Park, Pivot, Plank, Prop, SCENE_H, SCENE_W, SEAT, SeesawPickArt, Thing, ThingBox } from './art'
import { seesawCoplay } from './coplay'
import { heavyKey } from './lines'
import { loadSeesaw, saveSeesaw } from './progress'
import { SEESAW_GAME, SIZE_PX, afterSeesaw, heavyOf, seesawRound, seesawSkill, type OrderQ, type PairQ, type SeesawQ, type SeesawState } from './plan'
import '../draw/tools.css'
import './seesaw.css'

/** 新的一題剛出來這麼久內點不算（上一題連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 板子歪多少度、歪下去要多久 */
const TILT = 13
const TIP_MS = 900
/** 東西放在板子上的位置（板子的上緣） */
const TOP = -22

type Side = 'left' | 'right'
type Prog = { current: SeesawState | null }
type RoundProps = { prog: Prog; onDone: () => void; onAgain: () => void; resting: boolean }

/**
 * 蹺蹺板比輕重（家長 2026-11-17，給 4 歲左右玩中學）：
 * - 1、2、4 級：蹺蹺板兩邊各放一樣東西，兩根木頭撐著板子。豆豆問 Which side goes down?，孩子點他猜會往下的那一邊，
 *   木頭掉下去、板子往重的那邊歪，豆豆說 Yes! / Look! ＋ The rock is heavier.（只猜一次，猜錯也是看結果學，不說錯）。
 *   4 級有「大的不一定比較重」：氣球畫得很大、石頭畫得很小，說完再加一句 Little, but heavy!。
 * - 3、5 級：三樣東西從輕排到重。點最輕的，它飛到架子最左邊的格子，再點下一個，最後一個自己過去。
 *   點錯：那一個輕輕跳一下，豆豆說 That one is heavier.；第 2 次對的那一個亮起來；第 3 次手帶著點。
 * 第一次到這一級：先示範一題（手點），下一題手在答案旁邊等（一起做）。發呆：15 秒再說一次、30 秒手指答案。
 * 一局 4 題（排輕重 3 題），玩完停在「再一局／回首頁」。
 */
export function Seesaw() {
  const prog = useRef<SeesawState | null>(null)
  const [qs, setQs] = useState<SeesawQ[] | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  const deal = (p: SeesawState) => {
    const mem = { date: p.date, used: p.used, recent: p.recent }
    const r = seesawRound(p.level, mem, Math.random, p.level === 4 && !p.taught.includes(4))
    prog.current = { ...p, ...mem }
    void saveSeesaw(prog.current)
    return r
  }
  useEffect(() => {
    let on = true
    void loadSeesaw().then((p) => {
      if (!on || prog.current) return
      setQs(deal(p))
    })
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setQs(deal(p))
    setN((k) => k + 1)
  }
  const hint = seesawCoplay(qs?.[0].level ?? 1)
  const props: RoundProps = { prog, onDone: () => setResting(true), onAgain: again, resting }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? hint.now : hint.play}>
      {qs && prog.current && (qs[0].kind === 'pair' ? <PairView key={n} qs={qs as PairQ[]} {...props} /> : <OrderView key={n} qs={qs as OrderQ[]} {...props} />)}
    </Shell>
  )
}

/** 一局共用的：第一次示範、一起做、記分、玩完 */
function useRound(qs: SeesawQ[], prog: Prog) {
  const level = qs[0].level
  const [firstTime] = useState(() => !(prog.current?.taught.includes(level) ?? true))
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')
  const tally = useRef({ counted: 0, misses: 0 })
  /** 一局開始先說的：Seesaw time!（4、5 級再說 Big is not always heavy!） */
  const intro = (i: number) => (i === 0 ? ['ss.intro', ...(level >= 4 ? ['ss.trick'] : [])] : [])
  const log = (i: number, r: { guided: boolean; first: boolean; taps: { pick: string; ms: number }[]; t0: number; hint: boolean; led: boolean; shown: boolean; options: string[]; answer: string }) => {
    const q = qs[i]
    const phase = r.guided || r.led || r.shown || phaseOf(i) === 'teach' ? 'guided' : 'quiz'
    void logAttempt({
      station: 'logic',
      game: SEESAW_GAME,
      itemId: q.itemId,
      skill: seesawSkill(q.level),
      phase,
      level: q.level,
      options: r.options,
      answer: r.answer,
      taps: r.taps,
      firstTryCorrect: r.first,
      attempts: r.taps.length,
      responseMs: Math.round(performance.now() - r.t0),
      hintUsed: r.hint,
      heard: true,
      metrics: { ...(r.led ? { led: 1 } : {}), ...(r.shown ? { shown: 1 } : {}), ...(q.trick ? { trick: 1 } : {}) },
    })
    if (phase === 'quiz') {
      tally.current.counted++
      if (!r.first) tally.current.misses++
    }
  }
  const taught = (i: number, t0: number) => {
    const q = qs[i]
    void logTeach({ station: 'logic', game: SEESAW_GAME, itemId: q.itemId, skill: seesawSkill(q.level), level: q.level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveSeesaw(prog.current)
    }
  }
  /** 一局玩完：算升降級 */
  const settle = () => {
    const p = prog.current
    if (p) {
      prog.current = afterSeesaw(p, tally.current)
      void saveSeesaw(prog.current)
    }
  }
  return { level, phaseOf, intro, log, taught, settle }
}

// ── 猜哪一邊往下 ─────────────────────────────────────────────

function PairView({ qs, prog, onDone, onAgain, resting }: RoundProps & { qs: PairQ[] }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<Side, SVGGElement | null>())
  const { level, phaseOf, intro, log, taught, settle } = useRound(qs, prog)

  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState<Side | null>(null)
  const [tilt, setTilt] = useState(0)
  const [drop, setDrop] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [hand, setHand] = useState<{ at: Side; tap: number; beckon: boolean } | null>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  const st = useRef({ qi: 0, busy: true, demo: false, asking: false, armed: false, led: false, guided: false, taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)

  const q = qs[qi]
  const showHand = (at: Side, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))

  /** 放手：木頭掉下去、板子往重的那邊歪，說哪一個比較重。by：孩子猜的（對了說 Yes!、錯了說 Look!）或示範的手 */
  const reveal = async (i: number, side: Side, by: 'kid' | 'hand', ok: () => boolean) => {
    const x = qs[i]
    setPicked(side)
    await wait(350)
    if (!ok()) return false
    setDrop(true)
    sfx.whoosh()
    await wait(220)
    if (!ok()) return false
    setTilt(x.heavy === 'left' ? -1 : 1)
    await wait(TIP_MS)
    if (!ok()) return false
    const right = side === x.heavy
    if (by === 'kid' && right) sfx.correct()
    else sfx.pop()
    await say(...(by === 'kid' ? [right ? 'praise.dodo.0' : 'ss.look'] : []), heavyKey(heavyOf(x)), ...(x.trick ? ['ss.little'] : []))
    return ok()
  }

  const finish = async () => {
    const ok = flow.begin(live)
    setAllDone(true)
    sfx.done()
    settle()
    await say('ss.done')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 下一題：板子回到平的、東西拿走，再放新的 */
  const next = async (i: number, ok: () => boolean) => {
    await wait(PACE.NEXT_REVIEW)
    if (!ok()) return
    if (i + 1 >= qs.length) return void finish()
    setLeaving(true)
    setTilt(0)
    await wait(650)
    if (!ok()) return
    present(i + 1)
  }

  const runDemo = async (i: number) => {
    const s = st.current
    const x = qs[i]
    const ok = flow.begin(live)
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say(...intro(i), 'teach.watch.dodo', 'ss.ask')
    if (!ok()) return
    showHand(x.heavy, false)
    await wait(700)
    if (!ok()) return
    showHand(x.heavy, true)
    await wait(300)
    if (!ok()) return
    setHand(null)
    // 示範的手點的：不呼叫 flow.cut()（T-163：cut 會讓示範自己作廢、卡住）
    if (!(await reveal(i, x.heavy, 'hand', ok))) return
    await say('ss.rule')
    if (!ok()) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    taught(i, t0)
    s.demo = false
    setDemo(false)
    void next(i, ok)
  }

  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { qi: i, busy: false, demo: false, asking: false, armed: false, led: false, guided: phaseOf(i) === 'guided', taps: [], t0: performance.now() })
    setQi(i)
    setPicked(null)
    setTilt(0)
    setDrop(false)
    setLeaving(false)
    setHand(null)
    setTurn(false)
    idle.stop()
    setHold(true)
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      if (!st.current.demo) setHold(false)
      st.current.armed = true
    }, ARM_MS)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    const x = qs[i]
    const ok = flow.begin(live)
    s.asking = true
    await say(...intro(i), 'ss.ask')
    s.asking = false
    if (!ok()) return
    if (s.guided) setHand({ at: x.heavy, tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say('ss.ask'),
      hint: () => {
        st.current.led = true
        showHand(x.heavy, true)
      },
    })
  }

  useEffect(() => {
    const t = window.setTimeout(() => void present(0), 0)
    return () => {
      clearTimeout(t)
      clearTimeout(armTimer.current)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pingAt = (el: Element | null | undefined) => {
    if (!layer.current || !el) return
    const r = el.getBoundingClientRect()
    const p = localPoint(layer.current, r.left + r.width / 2, r.top + r.height / 2)
    notYet.ping(p.x, p.y)
  }

  /** 孩子猜一邊 */
  const choose = async (side: Side) => {
    const s = st.current
    if (s.busy || s.demo || resting || allDone) return
    if (!s.armed) return pingAt(els.current.get(side))
    const i = s.qi
    const x = qs[i]
    // 念題目的時候點到輕的那一邊：不算（TOUCH-7），只有「看這裡」的圈圈
    if (side !== x.heavy && s.asking) return pingAt(els.current.get(side))
    setTurn(false)
    s.taps.push({ pick: side === 'left' ? x.left.id : x.right.id, ms: Math.round(performance.now() - s.t0) })
    s.busy = true
    idle.stop()
    setHand(null)
    flow.cut()
    log(i, { guided: s.guided, first: side === x.heavy, taps: s.taps, t0: s.t0, hint: s.led, led: s.led, shown: false, options: [x.left.id, x.right.id], answer: heavyOf(x) })
    const ok = flow.begin(live)
    if (!(await reveal(i, side, 'kid', ok))) return
    void next(i, ok)
  }

  const handAt = hand ? pointIn(els.current.get(hand.at), layer.current, 0.5, 0.55) : null
  /** 一邊的東西和可以點的範圍（跟著板子歪） */
  const seat = (side: Side) => {
    const p = side === 'left' ? q.left : q.right
    const size = SIZE_PX(p.size)
    const x = (side === 'left' ? -1 : 1) * SEAT
    const isPicked = picked === side
    return (
      <motion.g
        key={`${qi}-${side}`}
        ref={(el: SVGGElement | null) => {
          els.current.set(side, el)
        }}
        className="ss-seat"
        data-side={side}
        data-thing={p.id}
        data-heavy={q.heavy === side ? '1' : undefined}
        role="button"
        aria-label={`${side === 'left' ? '左邊' : '右邊'}：${p.id}`}
        initial={{ opacity: 0, y: -80 }}
        animate={leaving ? { opacity: 0, y: -40 } : { opacity: 1, y: isPicked ? [0, -16, 0] : 0 }}
        transition={leaving ? { duration: 0.3 } : isPicked ? { duration: 0.35 } : { type: 'spring', stiffness: 260, damping: 20 }}
        {...tap(`s${qi}-${side}`, () => void choose(side), ANSWER_TAP)}
      >
        {/* 可以點的範圍：板子這一半的上面整塊（平板上 > 3 cm，TOUCH-1） */}
        <rect x={x - 180} y={TOP - 300} width={360} height={316} rx={28} className="ss-hit" />
        {isPicked && <rect x={x - size / 2 - 18} y={TOP - size - 18} width={size + 36} height={size + 26} rx={24} className="ss-picked" />}
        <Thing id={p.id} x={x} bottom={TOP + 2} size={size} />
      </motion.g>
    )
  }
  return (
    <div
      className={`ss${resting ? ' is-resting' : ''}`}
      ref={layer}
      data-logic-game="seesaw"
      data-level={level}
      data-item={qi}
      data-mode="pair"
      data-heavy={q.heavy}
      data-tilt={tilt}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="ss-play">
        <svg className="ss-scene" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio="xMidYMid meet">
          <Park />
          <ellipse cx={PIVOT.x} cy={GROUND + 6} rx={430} ry={16} fill="#2E2A25" opacity={0.08} />
          <g className={`ss-props${drop ? ' is-down' : ''}`} pointerEvents="none">
            <Prop side="left" />
            <Prop side="right" />
          </g>
          <Pivot />
          <g className="ss-tilt" style={{ transform: `rotate(${tilt * TILT}deg)` } as CSSProperties}>
            <g transform={`translate(${PIVOT.x} ${PIVOT.y})`}>
              <Plank />
              {seat('left')}
              {seat('right')}
            </g>
          </g>
        </svg>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !allDone} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<SeesawPickArt />} againLabel="再一局" line="ss.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}

// ── 三樣東西從輕排到重 ───────────────────────────────────────

function OrderView({ qs, prog, onDone, onAgain, resting }: RoundProps & { qs: OrderQ[] }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<string, HTMLElement | null>())
  const { level, phaseOf, intro, log, taught, settle } = useRound(qs, prog)

  const [qi, setQi] = useState(0)
  const [placed, setPlaced] = useState<string[]>([])
  const [nudge, setNudge] = useState<{ id: string; k: number } | null>(null)
  const [glow, setGlow] = useState<string | null>(null)
  const [hand, setHand] = useState<{ at: string; tap: number; beckon: boolean } | null>(null)
  const [cheer, setCheer] = useState(false)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  const st = useRef({ qi: 0, busy: true, demo: false, asking: false, armed: false, wrongs: 0, led: false, shown: false, guided: false, placed: [] as string[], taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)

  const q = qs[qi]
  const target = () => qs[st.current.qi].answer[st.current.placed.length]
  const showHand = (at: string, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const put = (id: string) => {
    const s = st.current
    s.placed = [...s.placed, id]
    setPlaced(s.placed)
    setGlow(null)
    setNudge(null)
    sfx.pop()
  }

  const finish = async () => {
    const ok = flow.begin(live)
    setAllDone(true)
    sfx.done()
    settle()
    await say('ss.order.all')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 排了兩個：最後一個自己過去，從輕到重念一次，記一筆，下一題 */
  const complete = async (i: number, by: 'kid' | 'hand', ok: () => boolean) => {
    const s = st.current
    const x = qs[i]
    await wait(450)
    if (!ok()) return false
    await say('ss.last')
    if (!ok()) return false
    put(x.answer[2])
    await wait(500)
    if (!ok()) return false
    if (by === 'kid') {
      log(i, { guided: s.guided, first: s.wrongs === 0 && !s.shown, taps: s.taps, t0: s.t0, hint: s.wrongs >= 2 || s.led || s.shown, led: s.led, shown: s.shown, options: x.items.map((it) => it.id), answer: x.answer.join('>') })
      sfx.correct()
    }
    setCheer(true)
    await say('ss.order.done')
    return ok()
  }

  const next = async (i: number, ok: () => boolean) => {
    await wait(PACE.NEXT_REVIEW)
    if (!ok()) return
    if (i + 1 >= qs.length) return void finish()
    present(i + 1)
  }

  const runDemo = async (i: number) => {
    const s = st.current
    const x = qs[i]
    const ok = flow.begin(live)
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say(...intro(i), 'ss.order', 'teach.watch.dodo', 'ss.first')
    if (!ok()) return
    // 示範的手點的：不呼叫 flow.cut()（T-163）
    for (const k of [0, 1]) {
      if (k === 1) {
        await say('ss.next')
        if (!ok()) return
      }
      showHand(x.answer[k], false)
      await wait(700)
      if (!ok()) return
      showHand(x.answer[k], true)
      await wait(300)
      if (!ok()) return
      setHand(null)
      put(x.answer[k])
      await wait(500)
      if (!ok()) return
    }
    if (!(await complete(i, 'hand', ok))) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    taught(i, t0)
    s.demo = false
    setDemo(false)
    void next(i, ok)
  }

  /** 輪到他點（第 k 個） */
  const ask = async (keys: string[]) => {
    const s = st.current
    const ok = flow.begin(live)
    s.asking = true
    await say(...keys)
    s.asking = false
    if (!ok()) return
    const t = target()
    if (s.guided) setHand({ at: t, tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say(st.current.placed.length ? 'ss.next' : 'ss.first'),
      hint: () => {
        st.current.led = true
        showHand(t, true)
      },
    })
  }

  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { qi: i, busy: false, demo: false, asking: false, armed: false, wrongs: 0, led: false, shown: false, guided: phaseOf(i) === 'guided', placed: [], taps: [], t0: performance.now() })
    setQi(i)
    setPlaced([])
    setNudge(null)
    setGlow(null)
    setHand(null)
    setCheer(false)
    setTurn(false)
    idle.stop()
    setHold(true)
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      if (!st.current.demo) setHold(false)
      st.current.armed = true
    }, ARM_MS)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    await ask([...intro(i), ...(i === 0 ? ['ss.order'] : []), 'ss.first'])
  }

  useEffect(() => {
    const t = window.setTimeout(() => void present(0), 0)
    return () => {
      clearTimeout(t)
      clearTimeout(armTimer.current)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pingAt = (el: Element | null | undefined) => {
    if (!layer.current || !el) return
    const r = el.getBoundingClientRect()
    const p = localPoint(layer.current, r.left + r.width / 2, r.top + r.height / 2)
    notYet.ping(p.x, p.y)
  }

  /** 點桌上的一個 */
  const choose = async (id: string) => {
    const s = st.current
    if (s.busy || s.demo || resting || allDone || s.placed.includes(id)) return
    if (!s.armed) return pingAt(els.current.get(id))
    const i = s.qi
    const t = target()
    if (id !== t && s.asking) return pingAt(els.current.get(id))
    setTurn(false)
    s.taps.push({ pick: id, ms: Math.round(performance.now() - s.t0) })
    idle.stop()
    s.busy = true
    flow.cut()
    setHand(null)
    const ok = flow.begin(live)
    if (id === t) {
      put(id)
      if (s.placed.length >= 2) {
        if (!(await complete(i, 'kid', ok))) return
        return void next(i, ok)
      }
      await wait(450)
      if (!ok()) return
      s.busy = false
      return ask(['ss.next'])
    }
    // 點錯：那一個輕輕跳一下，說它比較重，再問一次（不說錯）
    s.wrongs++
    setNudge({ id, k: performance.now() })
    sfx.boing()
    if (s.wrongs >= 3) {
      // 第 3 次：手帶著點對的那一個（記一起做）
      await wait(400)
      if (!ok()) return
      s.shown = true
      showHand(t, false)
      await wait(600)
      if (!ok()) return
      showHand(t, true)
      await wait(300)
      if (!ok()) return
      setHand(null)
      put(t)
      if (s.placed.length >= 2) {
        if (!(await complete(i, 'kid', ok))) return
        return void next(i, ok)
      }
      await wait(450)
      if (!ok()) return
      s.busy = false
      return ask(['ss.next'])
    }
    s.busy = false
    if (s.wrongs === 2) setGlow(t)
    await ask(['ss.heavier', s.placed.length ? 'ss.next' : 'ss.first'])
  }

  const handAt = hand ? pointIn(els.current.get(hand.at), layer.current, 0.55, 0.5) : null
  const cell = (id: string, size: number, where: 'table' | 'shelf') => (
    <motion.div layoutId={`${qi}-${id}`} className="ss-thing" style={{ '--k': SIZE_PX(size) / SIZE_PX(5) } as CSSProperties} transition={{ type: 'spring', stiffness: 260, damping: 24 }} data-where={where}>
      <ThingBox id={id} />
    </motion.div>
  )
  return (
    <div
      className={`ss${resting ? ' is-resting' : ''}`}
      ref={layer}
      data-logic-game="seesaw"
      data-level={level}
      data-item={qi}
      data-mode="order"
      data-answer={q.answer.join('>')}
      data-placed={placed.join('>')}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="ss-play ss-order">
        <div className="ss-table" key={qi}>
          {q.items.map((it) => {
            const done = placed.includes(it.id)
            return (
              <motion.button
                key={it.id}
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  els.current.set(it.id, el)
                }}
                className={`ss-pick${glow === it.id ? ' is-glow' : ''}`}
                data-thing={it.id}
                aria-label={`東西：${it.id}`}
                disabled={done}
                animate={nudge?.id === it.id ? { y: [0, -22, 0] } : { y: 0 }}
                transition={{ duration: 0.4 }}
                {...tap(`o${qi}-${it.id}`, () => void choose(it.id), ANSWER_TAP)}
              >
                {!done && cell(it.id, it.size, 'table')}
              </motion.button>
            )
          })}
        </div>
        <div className="ss-shelf">
          <div className="ss-slots">
            {[0, 1, 2].map((k) => {
              const id = placed[k]
              const it = id ? q.items.find((x) => x.id === id)! : null
              return (
                <div key={k} className={`ss-slot${cheer ? ' is-cheer' : ''}`} style={{ '--d': `${k * 0.15}s` } as CSSProperties} data-slot={k}>
                  {it && cell(it.id, it.size, 'shelf')}
                </div>
              )
            })}
          </div>
          {/* 從細到粗的木頭：左邊輕（羽毛）、右邊重（鐵錨） */}
          <div className="ss-wedge" aria-hidden="true">
            <span className="ss-end is-light">
              <ThingBox id="feather" />
            </span>
            <svg className="ss-bar" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path d="M1 14 L99 1 V19 H1 Z" fill="#E3B98A" stroke="#2E2A25" strokeWidth={4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="ss-end is-heavy">
              <ThingBox id="anchor" />
            </span>
          </div>
        </div>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !allDone} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<SeesawPickArt />} againLabel="再一局" line="ss.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
