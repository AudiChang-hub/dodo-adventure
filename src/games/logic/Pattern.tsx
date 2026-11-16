import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, localPoint, useNotYet } from '../NotYet'
import { useFlow } from '../barge'
import { useIdle } from '../idle'
import { wait } from '../lines'
import { PACE } from '../pace'
import { DoneChoices } from '../draw/DoneChoices'
import { Dino } from '../../art/Dino'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useTaps } from '../../ui/tap'
import { BeadArt, PatternPickArt } from './art'
import { LOGIC_COPLAY } from './coplay'
import { wordKey } from './lines'
import { offsetTo, pointIn, useLive } from './kit'
import { loadLogic, saveLogic, type LogicProgress } from './progress'
import { PATTERN_GAME, PATTERN_MAX, patternRound, type Bead, type PatLevel, type PatQ } from './pattern-plan'
import { SORT_MAX, stepLevel } from './sort-plan'
import '../draw/tools.css'
import './logic.css'

const INK = '#2E2A25'
/** 新的一題剛出來這麼久內點珠子不算（上一題連點的手指，TOUCH-7） */
const ARM_MS = 300
/** 珠子飛上繩子要多久 */
const FLY_MS = 480

/**
 * 串珠珠（T-152 設計稿第三節案 A②）：繩子上串好 紅、藍、紅、藍，接著一個虛線圈；下面 2 顆（第 4 級 3 顆）大珠子讓他挑。
 * 點一顆，它飛上繩子；對了，豆豆沿著珠子點一遍念出規律（Red, blue, red, blue, red!）。
 * 放錯：珠子回原位，豆豆念前面幾顆、停在空位，讓他自己聽出下一個；第 2 次錯對的那顆亮起來；第 3 次手帶著放。
 * 一局 3 題，串完一條項鍊掛到豆豆脖子上（只是這一局的畫面，不收藏、不計數，FB-6），停在「再一局／回首頁」。
 */
export function Pattern() {
  const [prog, setProg] = useState<LogicProgress | null>(null)
  const progRef = useRef<LogicProgress | null>(null)
  const [qs, setQs] = useState<PatQ[] | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  useEffect(() => {
    let on = true
    void loadLogic({ sort: SORT_MAX, pattern: PATTERN_MAX }).then((p) => on && setProg(p))
    return () => {
      on = false
    }
  }, [])
  useEffect(() => {
    if (!prog || progRef.current) return
    progRef.current = prog
    setQs(patternRound(prog.pattern.level as PatLevel))
  }, [prog])
  const again = () => {
    const p = progRef.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setQs(patternRound(p.pattern.level as PatLevel))
    setN((k) => k + 1)
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? LOGIC_COPLAY.pattern.now : LOGIC_COPLAY.pattern.play}>
      {qs && progRef.current && <PatternRoundView key={n} qs={qs} prog={progRef} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { opt: string; tap: number; beckon: boolean } | null

function PatternRoundView({ qs, prog, onDone, onAgain, resting }: { qs: PatQ[]; prog: { current: LogicProgress | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const blankEl = useRef<HTMLDivElement | null>(null)
  const optEls = useRef(new Map<string, HTMLElement | null>())

  const [qi, setQi] = useState(0)
  const [filled, setFilled] = useState(false)
  const [fly, setFly] = useState<{ opt: string; x: number; y: number } | null>(null)
  const [nudge, setNudge] = useState<{ opt: string; k: number } | null>(null)
  const [lit, setLit] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [glow, setGlow] = useState<string | null>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [necklace, setNecklace] = useState<Bead[][] | null>(null)
  const [poke, setPoke] = useState(0)
  /** 輪到他了（題目、答錯的提示說完，等他點）：只輸出成 data-turn 給三歲測試看，不影響行為 */
  const [turn, setTurn] = useState(false)
  const st = useRef({ qi: 0, busy: true, demo: false, asking: false, armed: false, wrongs: 0, led: false, guided: false, taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)
  const done = useRef<Bead[][]>([])

  const level = qs[0].level
  const [firstTime] = useState(() => !(prog.current?.pattern.taught.includes(level) ?? true))
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')
  const showHand = (opt: string, tapIt: boolean) => setHand((h) => ({ opt, tap: tapIt ? (h?.tap ?? 0) + 1 : h?.tap ?? 0, beckon: !tapIt && !!h?.beckon }))

  /** 沿著珠子念：到第 upto 顆（不含）為止，每一顆亮一下、配一聲（A 高、B 低，聽不懂英文也聽得出規律） */
  const read = async (q: PatQ, upto: number, ok: () => boolean) => {
    for (let k = 0; k < upto; k++) {
      if (!ok()) return
      setLit(k)
      sfx.beat(q.seq[k].id === q.seq[0].id ? 0 : 1)
      await say(wordKey(q.seq[k].id))
    }
    if (ok()) setLit(null)
  }

  /** 珠子飛上空位 */
  const flyUp = async (opt: string) => {
    const off = offsetTo(optEls.current.get(opt), blankEl.current)
    setFly({ opt, x: off.x, y: off.y })
    await wait(FLY_MS)
    if (!live.current) return
    sfx.clack()
    setFilled(true)
  }

  const record = (i: number, how: { handPlaced?: boolean }) => {
    const s = st.current
    const q = qs[i]
    const phase = s.guided || s.led || how.handPlaced ? 'guided' : 'quiz'
    void logAttempt({
      station: 'logic',
      game: PATTERN_GAME,
      itemId: q.itemId,
      skill: q.skill,
      phase,
      level: q.level,
      options: q.options.map((o) => o.id),
      answer: q.answer,
      taps: s.taps,
      firstTryCorrect: s.wrongs === 0 && !how.handPlaced,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led || !!how.handPlaced,
      heard: true,
      metrics: { ...(s.led ? { led: 1 } : {}), ...(how.handPlaced ? { shown: 1 } : {}), blank: q.blank },
    })
    const p = prog.current
    if (p) {
      p.pattern = stepLevel(p.pattern, { date: today(), first: s.wrongs === 0 && !how.handPlaced, counted: phase === 'quiz' }, PATTERN_MAX)
      void saveLogic(p)
    }
  }

  const finish = async () => {
    const ok = flow.begin(live)
    setNecklace(done.current)
    sfx.done()
    await say('lg.pat.done')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  const next = async (i: number) => {
    done.current = [...done.current, qs[i].seq]
    if (i + 1 < qs.length) present(i + 1)
    else await finish()
  }

  const runDemo = async (i: number) => {
    const s = st.current
    const q = qs[i]
    const ok = flow.begin(live)
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say('teach.watch.dodo')
    if (!ok()) return
    showHand(q.answer, false)
    await wait(800)
    if (!ok()) return
    showHand(q.answer, true)
    await flyUp(q.answer)
    if (!ok()) return
    setHand(null)
    await read(q, q.seq.length, ok)
    if (!ok()) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: PATTERN_GAME, itemId: q.itemId, skill: q.skill, level: q.level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.pattern.taught.includes(level)) {
      p.pattern = { ...p.pattern, taught: [...p.pattern.taught, level] }
      void saveLogic(p)
    }
    s.demo = false
    setDemo(false)
    void next(i)
  }

  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { qi: i, busy: false, demo: false, asking: false, armed: false, wrongs: 0, led: false, guided: phaseOf(i) === 'guided', taps: [], t0: performance.now() })
    setQi(i)
    setFilled(false)
    setFly(null)
    setNudge(null)
    setLit(null)
    setGlow(null)
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
    const q = qs[i]
    const ask = q.blank === q.seq.length - 1 ? 'lg.pat.ask' : 'lg.pat.mid'
    const ok = flow.begin(live)
    s.asking = true
    await say(ask)
    s.asking = false
    if (!ok()) return
    if (s.guided) setHand({ opt: q.answer, tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say(ask),
      hint: () => {
        st.current.led = true
        showHand(q.answer, true)
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

  const choose = async (opt: string) => {
    const s = st.current
    if (s.busy || s.demo || resting || necklace) return
    if (!s.armed) return pingAt(optEls.current.get(opt))
    const i = s.qi
    const q = qs[i]
    // 念題目的時候點錯：不算錯（TOUCH-7）
    if (opt !== q.answer && s.asking) return pingAt(optEls.current.get(opt))
    setTurn(false)
    s.taps.push({ pick: opt, ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    s.busy = true
    flow.cut()
    if (opt === q.answer) {
      idle.stop()
      setHand(null)
      setGlow(null)
      await flyUp(opt)
      if (!live.current) return
      record(i, {})
      const ok = flow.begin(live)
      await read(q, q.seq.length, ok)
      if (!ok()) return
      await wait(s.wrongs === 0 ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    // 放錯：珠子往上跳一下、回原位（不搖、不打叉）
    s.wrongs++
    setNudge({ opt, k: performance.now() })
    sfx.boing()
    await wait(450)
    if (!live.current) return
    const ok = flow.begin(live)
    if (s.wrongs >= 3) {
      idle.stop()
      showHand(q.answer, false)
      await wait(600)
      if (!ok()) return
      showHand(q.answer, true)
      await flyUp(q.answer)
      if (!ok()) return
      record(i, { handPlaced: true })
      setHand(null)
      await read(q, q.seq.length, ok)
      if (!ok()) return
      await wait(PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    s.busy = false
    if (s.wrongs === 2) setGlow(q.answer)
    // 念前面的幾顆，停在空位：讓他自己聽出下一個
    await read(q, q.blank, ok)
    if (!ok()) return
    setTurn(true)
    idle.start({
      repeat: () => void read(q, q.blank, flow.begin(live)),
      hint: () => {
        st.current.led = true
        showHand(q.answer, true)
      },
    })
  }

  const q = qs[qi]
  const handAt = hand ? pointIn(optEls.current.get(hand.opt), layer.current, 0.55, 0.4) : null
  return (
    <div
      className={`lg-pattern${resting ? ' is-resting' : ''}`}
      ref={layer}
      data-logic-game="pattern"
      data-level={level}
      data-item={qi}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-answer={q.answer}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="lg-pattern-play">
        {necklace ? (
          <Necklace strands={necklace} />
        ) : (
          <>
            <div className="lg-strand" key={qi} data-strand="">
              {q.seq.map((b, k) => (
                <div
                  key={k}
                  ref={k === q.blank ? blankEl : undefined}
                  className={`lg-slot${k === q.blank ? (filled ? ' is-filled' : ' is-blank') : ''}${lit === k ? ' is-lit' : ''}`}
                  data-slot={k === q.blank ? 'blank' : b.id}
                >
                  {(k !== q.blank || filled) && <BeadArt thing={b.thing} />}
                </div>
              ))}
            </div>
            <div className={`lg-options n${q.options.length}`} key={`o${qi}`}>
              {q.options.map((o) => {
                const flying = fly?.opt === o.id
                return (
                  <motion.button
                    key={o.id}
                    type="button"
                    ref={(el: HTMLButtonElement | null) => {
                      optEls.current.set(o.id, el)
                    }}
                    className={`lg-option${glow === o.id ? ' is-glow' : ''}`}
                    data-option={o.id}
                    aria-label={`珠子：${o.id}`}
                    initial={{ y: 30, opacity: 0 }}
                    animate={
                      flying
                        ? { x: fly.x, y: fly.y, scale: 0.72, opacity: filled ? 0 : 1 }
                        : nudge?.opt === o.id
                          ? { x: 0, y: [0, -40, 0], scale: 1, opacity: 1 }
                          : { x: 0, y: 0, scale: 1, opacity: 1 }
                    }
                    transition={flying ? { duration: filled ? 0 : FLY_MS / 1000, ease: [0.4, 0, 0.6, 1] } : nudge?.opt === o.id ? { duration: 0.45 } : { type: 'spring', stiffness: 260, damping: 22 }}
                    {...tap(`opt-${o.id}`, () => void choose(o.id))}
                  >
                    <BeadArt thing={o.thing} />
                  </motion.button>
                )
              })}
            </div>
          </>
        )}
        <AnimatePresence>{handAt && !necklace && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !necklace} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<PatternPickArt />} againLabel="再一局" line="lg.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}

/** 一局串完：豆豆脖子上掛一條項鍊（這一局串的珠子），只是這一局的畫面 */
function Necklace({ strands }: { strands: Bead[][] }) {
  const beads = strands.flat()
  // 豆豆（art/Dino 的 viewBox 230×210）的脖子：頭和身體之間
  const pts = beads.map((_, i) => {
    // 沿著繩子（下面那條二次曲線）平均排開
    const t = beads.length > 1 ? 0.06 + (0.88 * i) / (beads.length - 1) : 0.5
    const u = 1 - t
    return { x: u * u * 98 + 2 * u * t * 134 + t * t * 168, y: u * u * 114 + 2 * u * t * 160 + t * t * 126 }
  })
  return (
    <div className="lg-necklace" data-necklace="">
      <div className="lg-necklace-dino">
        <Dino who="dodo" mood="happy" size="100%" />
        <svg viewBox="0 0 230 210" width="100%" height="100%" className="lg-necklace-beads" aria-hidden="true">
          <path d="M98 114 Q134 160 168 126" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          {beads.map((b, i) => (
            <motion.svg
              key={i}
              x={pts[i].x - 6}
              y={pts[i].y - 6}
              width={12}
              height={12}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.05 }}
            >
              <BeadArt thing={b.thing} />
            </motion.svg>
          ))}
        </svg>
      </div>
    </div>
  )
}
