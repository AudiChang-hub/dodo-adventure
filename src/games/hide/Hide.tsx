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
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { ANSWER_TAP, useTaps } from '../../ui/tap'
import { missLocked } from '../miss-lock'
import { pointIn, useLive } from '../logic/kit'
import { Backdrop } from './scene'
import { Emo } from './emoji'
import { Dots, HidePickArt, PlaceArt } from './art'
import { SCENES } from './data'
import { HIDE_COPLAY } from './coplay'
import { allKey, hidKey, numKey, sumKey } from './lines'
import { HIDE_GAME, HIDE_LEVELS, hideSkill, makeHide, stepHide, type HideQ, type HideRound, type HideState } from './plan'
import { loadHide, saveHide } from './progress'
import '../draw/tools.css'
import './hide.css'

/** 新的一題剛問完這麼久內點不算（上一題連點的手指，TOUCH-4） */
const ARM_MS = 300

// 場景座標（SVG 1100 × 560，置中、等比例）：平板橫向的作答區約 1200 × 558，差不多 1:1，選項 132 px（≥ 2.5 cm，TOUCH-1）
const W = 1100
const H = 560
/** 動物站的那一排（腳的高度）、大小 */
const FEET = 374
const ANI = 100
/** 躲藏處：中心 x、底部 y、大小 */
const PLACE = { x: 812, bottom: 394, s: 270 }
/** 出來以後站在躲藏處前面 */
const OUT_FEET = 474
const OUT_ANI = 86
/** 選項：一排，中心 x、上緣 y、大小 */
const OPT = { cx: 330, y: 418, w: 132, h: 120, gap: 30 }
/** 上面「全部幾隻」的卡片 */
const CARD = { x: 380, y: 12, w: 340, h: 94 }

/** c 隻排成一排，置中在 330 */
const rowX = (c: number, j: number) => 330 + (j - (c - 1) / 2) * 118
/** 出來的 k 隻排在躲藏處前面 */
const outX = (k: number, j: number) => PLACE.x + (j - (k - 1) / 2) * 94

/**
 * 躲起來了幾隻（家長 2026-11-17，指引 MA-10 5 以內的分與合）：
 * 1. N 隻一樣的小動物一隻一隻走出來，豆豆數 One! Two! Three!，說「Three friends!」，上面的卡片寫著 3 和三個圈圈。
 * 2. 其中幾隻走到山洞（箱子、樹叢…）後面不見了，外面的靠在一起；豆豆說「Some are hiding! How many are hiding?」。
 * 3. 他點點數圈圈（或數字）的選項。對了：躲起來的那幾隻走出來（頭上一圈光），一起數，說「Two were hiding!」「One and two make three!」。
 * 點錯（不說錯）：第 1 次一起數外面的；第 2 次卡片上空心的圈圈亮起來（躲起來的那幾個），說「Count the empty circles!」；第 3 次手帶著點。
 * 第一次到這一級：先示範一題（手點答案），下一題手在答案旁邊等（一起做）。發呆：15 秒再問一次、30 秒手點答案。
 * 一局 4 題，數完停在「再一局／回首頁」。
 */
export function Hide() {
  const prog = useRef<HideState | null>(null)
  const [round, setRound] = useState<HideRound | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  const start = (p: HideState) => {
    const r = makeHide(p, today())
    prog.current = r.state
    void saveHide(r.state)
    setRound(r.round)
  }
  useEffect(() => {
    let on = true
    void loadHide().then((p) => {
      if (!on || prog.current) return
      start(p)
    })
    return () => {
      on = false
    }
  }, [])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    start(p)
    setN((k) => k + 1)
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? HIDE_COPLAY.now : HIDE_COPLAY.play}>
      {round && <HideView key={n} round={round} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type Stage = 'arrive' | 'hiding' | 'hidden' | 'open'
type HandState = { at: number; tap: number; beckon: boolean } | null

function HideView({ round, prog, onDone, onAgain, resting }: { round: HideRound; prog: { current: HideState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level, qs } = round
  const spec = HIDE_LEVELS[level]
  const scene = SCENES.find((s) => s.id === round.scene) ?? SCENES[0]
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const optEls = useRef(new Map<number, SVGGElement | null>())

  const [qi, setQi] = useState(0)
  const [arrived, setArrived] = useState(0)
  const [stage, setStage] = useState<Stage>('arrive')
  const [card, setCard] = useState(false)
  const [frame, setFrame] = useState(false)
  const [frameGlow, setFrameGlow] = useState(false)
  const [opts, setOpts] = useState(false)
  /** 正在數第幾隻（外面的：'o'、出來的：'h'） */
  const [counting, setCounting] = useState<{ side: 'o' | 'h'; j: number } | null>(null)
  const [nudge, setNudge] = useState<{ v: number; k: number } | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  const st = useRef({ qi: 0, busy: true, demo: false, asking: false, armed: false, wrongs: 0, missAt: -Infinity, led: false, guided: false, taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)

  const q: HideQ = qs[qi]
  const out = q.total - q.hidden
  const isDemoQ = (i: number) => round.demo && i === 0
  const isGuidedQ = (i: number) => round.demo && i === 1
  const showHand = (at: number, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))

  const record = (i: number, how: { handPlaced?: boolean }) => {
    const s = st.current
    const x = qs[i]
    const phase = s.guided || s.led || how.handPlaced || isDemoQ(i) ? 'guided' : 'quiz'
    const first = s.wrongs === 0 && !how.handPlaced && !s.led
    void logAttempt({
      station: 'logic',
      game: HIDE_GAME,
      itemId: x.itemId,
      skill: hideSkill(level),
      phase,
      level,
      options: x.options.map(String),
      answer: String(x.hidden),
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led || !!how.handPlaced,
      heard: true,
      metrics: { total: x.total, hidden: x.hidden, ...(s.led ? { led: 1 } : {}), ...(how.handPlaced ? { shown: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = stepHide(p, { first, counted: phase === 'quiz' })
      void saveHide(prog.current)
    }
  }

  const finish = async () => {
    const ok = flow.begin(live)
    setAllDone(true)
    setTurn(false)
    sfx.done()
    await say('hd.done')
    if (!ok()) return
    // 時間到了：數完這一局才去睡覺（TIME-2）
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 打開來：躲起來的那幾隻走出來，一起數，說分與合 */
  const reveal = async (i: number, ok: () => boolean) => {
    const x = qs[i]
    setHold(true)
    setTurn(false)
    setHand(null)
    setFrameGlow(false)
    sfx.correct()
    await say('hd.peek')
    if (!ok()) return false
    setStage('open')
    sfx.whoosh()
    await wait(650)
    if (!ok()) return false
    for (let j = 0; j < x.hidden; j++) {
      setCounting({ side: 'h', j })
      await say(numKey(j + 1))
      if (!ok()) return false
    }
    setCounting(null)
    await say(hidKey(x.hidden), sumKey(x.total - x.hidden, x.hidden))
    return ok()
  }

  const next = async (i: number) => {
    if (i + 1 < qs.length) return present(i + 1)
    return finish()
  }

  const ask = () => say('hd.ask')

  const startIdle = (i: number) => {
    const x = qs[i]
    idle.start({
      repeat: () => void ask(),
      hint: () => {
        st.current.led = true
        showHand(x.options.indexOf(x.hidden), true)
      },
    })
  }

  /** 示範：手點答案，打開來一起數 */
  const runDemo = async (i: number, ok: () => boolean) => {
    const s = st.current
    const x = qs[i]
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say('teach.watch.dodo')
    if (!ok()) return
    const at = x.options.indexOf(x.hidden)
    showHand(at, false)
    await wait(700)
    if (!ok()) return
    showHand(at, true)
    setPicked(x.hidden)
    await wait(320)
    if (!ok()) return
    if (!(await reveal(i, ok))) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    void logTeach({ station: 'logic', game: HIDE_GAME, itemId: x.itemId, skill: hideSkill(level), level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveHide(prog.current)
    }
    await say('teach.turn.dodo')
    if (!ok()) return
    s.demo = false
    setDemo(false)
    void next(i)
  }

  /** 一題：走出來、數、躲起來、問 */
  const present = async (i: number) => {
    const s = st.current
    const x = qs[i]
    Object.assign(s, { qi: i, busy: true, demo: false, asking: false, armed: false, wrongs: 0, missAt: -Infinity, led: false, guided: isGuidedQ(i), taps: [], t0: 0 })
    setQi(i)
    setArrived(0)
    setStage('arrive')
    setCard(false)
    setFrame(false)
    setFrameGlow(false)
    setOpts(false)
    setCounting(null)
    setNudge(null)
    setPicked(null)
    setHand(null)
    setTurn(false)
    setHold(true)
    idle.stop()
    const ok = flow.begin(live)
    await wait(450)
    if (!ok()) return
    if (i === 0) {
      await say('hd.intro')
      if (!ok()) return
    }
    // 一隻一隻走出來，豆豆數
    for (let j = 0; j < x.total; j++) {
      setArrived(j + 1)
      sfx.pop()
      await say(numKey(j + 1))
      if (!ok()) return
    }
    setCard(true)
    await say(allKey(x.total))
    if (!ok()) return
    await wait(300)
    if (!ok()) return
    // 幾隻走到後面躲起來
    setStage('hiding')
    sfx.whoosh()
    await wait(800)
    if (!ok()) return
    setStage('hidden')
    if (spec.frame) setFrame(true)
    await say('hd.hide')
    if (!ok()) return
    setOpts(true)
    if (isDemoQ(i)) return runDemo(i, ok)
    s.busy = false
    s.t0 = performance.now()
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      st.current.armed = true
      if (!st.current.demo) setHold(false)
    }, ARM_MS)
    s.asking = true
    await ask()
    s.asking = false
    if (!ok()) return
    if (s.guided) setHand({ at: x.options.indexOf(x.hidden), tap: 0, beckon: true })
    setTurn(true)
    startIdle(i)
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

  const choose = async (v: number) => {
    const s = st.current
    const el = optEls.current.get(v)
    if (s.busy || s.demo || resting || allDone) return pingAt(el)
    if (!s.armed) return pingAt(el)
    if (missLocked(s.missAt, performance.now())) return
    const i = s.qi
    const x = qs[i]
    // 念題目的時候點錯：不算錯（TOUCH-7），只有「看這裡」的圈圈
    if (v !== x.hidden && s.asking) return pingAt(el)
    setTurn(false)
    s.taps.push({ pick: String(v), ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    flow.cut()
    setCounting(null)
    if (v === x.hidden) {
      s.busy = true
      idle.stop()
      setPicked(v)
      record(i, {})
      const ok = flow.begin(live)
      if (!(await reveal(i, ok))) return
      await wait(s.wrongs === 0 ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    // 點錯：那一張輕輕跳一下（不搖、不打叉），一起想
    s.wrongs++
    s.missAt = performance.now()
    setNudge({ v, k: performance.now() })
    sfx.boing()
    const ok = flow.begin(live)
    if (s.wrongs >= 3) {
      s.busy = true
      idle.stop()
      const at = x.options.indexOf(x.hidden)
      await wait(350)
      if (!ok()) return
      showHand(at, false)
      await wait(600)
      if (!ok()) return
      showHand(at, true)
      setPicked(x.hidden)
      await wait(300)
      if (!ok()) return
      record(i, { handPlaced: true })
      if (!(await reveal(i, ok))) return
      await wait(PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    if (s.wrongs === 1) {
      // 第 1 次：一起數外面的
      await say('hd.out')
      if (!ok()) return
      for (let j = 0; j < x.total - x.hidden; j++) {
        setCounting({ side: 'o', j })
        await say(numKey(j + 1))
        if (!ok()) return
      }
      setCounting(null)
    } else {
      // 第 2 次：卡片上躲起來的那幾個變成空心圈，亮起來
      setFrame(true)
      setFrameGlow(true)
      await say('hd.dots')
      if (!ok()) return
    }
    await ask()
    if (!ok()) return
    setTurn(true)
    startIdle(i)
  }

  const handAt = hand ? pointIn(optEls.current.get(q.options[hand.at]), layer.current, 0.55, 0.55) : null
  const optW = q.options.length * OPT.w + (q.options.length - 1) * OPT.gap
  const optX = (k: number) => OPT.cx - optW / 2 + k * (OPT.w + OPT.gap)

  /** 一隻小動物（j 是第幾隻；後面 hidden 隻是會躲起來的） */
  const animal = (j: number) => {
    const isHider = j >= out
    const visible = j < arrived
    let x = rowX(q.total, j)
    let y = FEET
    let size = ANI
    let opacity = visible ? 1 : 0
    if (stage !== 'arrive') {
      if (!isHider) x = rowX(out, j)
      else if (stage === 'open') {
        x = outX(q.hidden, j - out)
        y = OUT_FEET
        size = OUT_ANI
      } else {
        // 走到躲藏處後面，不見了
        x = PLACE.x + (j - out - (q.hidden - 1) / 2) * 30
        opacity = 0
      }
    }
    const lit = counting && ((counting.side === 'o' && !isHider && counting.j === j) || (counting.side === 'h' && isHider && counting.j === j - out))
    const behind = isHider && stage !== 'open'
    return (
      <motion.g
        key={`${qi}-${j}`}
        data-animal={j}
        data-hider={isHider ? '1' : undefined}
        initial={{ x: -120, y, opacity: 0 }}
        animate={{ x, y, opacity }}
        transition={{ duration: stage === 'hiding' ? 0.75 : 0.45, ease: 'easeInOut', opacity: { duration: behind && stage !== 'arrive' ? 0.75 : 0.3 } }}
      >
        {isHider && stage === 'open' && <circle cx={0} cy={-size / 2} r={size * 0.52} fill="#FFF3C4" opacity={0.9} />}
        <motion.g key={lit ? `c${counting!.j}` : 'n'} animate={lit ? { y: [0, -22, 0] } : {}} transition={{ duration: 0.35 }}>
          <Emo name={q.animal} x={-size / 2} y={-size} size={size} />
        </motion.g>
      </motion.g>
    )
  }
  const ids = Array.from({ length: q.total }, (_, j) => j)
  return (
    <div
      className={`hd${resting ? ' is-resting' : ''}`}
      data-logic-game="hide"
      data-level={level}
      data-item={qi}
      data-scene={round.scene}
      data-animal={q.animal}
      data-place={q.place}
      data-total={q.total}
      data-hidden={q.hidden}
      data-stage={stage}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="hd-play" ref={layer}>
        <AnimatePresence mode="wait">
          <motion.svg key={qi} className="hd-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <g pointerEvents="none">
              <Backdrop def={scene} w={W} h={H} />
              <ellipse cx={PLACE.x} cy={PLACE.bottom - 4} rx={150} ry={18} fill="#2E2A25" opacity={0.12} />
              {/* 躲起來的在躲藏處後面（先畫），外面的、出來的在前面 */}
              {ids.filter((j) => j >= out && stage !== 'open').map(animal)}
              <PlaceArt id={q.place} x={PLACE.x - PLACE.s / 2} y={PLACE.bottom - PLACE.s} s={PLACE.s} />
              {ids.filter((j) => j < out || stage === 'open').map(animal)}
              {/* 全部幾隻：數字＋圈圈（躲起來的那幾個在提示時變空心） */}
              <AnimatePresence>
                {card && (
                  <motion.g key="card" data-card={q.total} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={24} fill="#FFFDF8" stroke="#2E2A25" strokeWidth={4} />
                    <Emo name={q.animal} x={CARD.x + 14} y={CARD.y + 18} size={64} />
                    <text x={CARD.x + 112} y={CARD.y + CARD.h / 2 + 2} textAnchor="middle" dominantBaseline="central" fontSize={62} fontWeight={700} fill="#2E2A25" style={{ fontFamily: 'var(--font)' }}>
                      {q.total}
                    </text>
                    {ids.map((j) => {
                      const hollow = frame && j >= out
                      const cxj = CARD.x + 170 + j * 36
                      return (
                        <g key={j} data-ring={hollow ? 'empty' : 'full'}>
                          {hollow && frameGlow && <circle cx={cxj} cy={CARD.y + CARD.h / 2} r={21} fill="rgba(241,210,124,0.3)" stroke="#F1D27C" strokeWidth={5} />}
                          <circle cx={cxj} cy={CARD.y + CARD.h / 2} r={13} fill={hollow ? '#FFFDF8' : '#5C8FC4'} stroke="#2E2A25" strokeWidth={3} strokeDasharray={hollow ? '5 4' : undefined} />
                        </g>
                      )
                    })}
                  </motion.g>
                )}
              </AnimatePresence>
            </g>
            {/* 選項：點數圈圈（或數字） */}
            {opts &&
              q.options.map((v, k) => {
                const nudged = nudge?.v === v
                const isPicked = picked === v
                return (
                  <motion.g
                    key={`${qi}-o${v}`}
                    ref={(el: SVGGElement | null) => {
                      optEls.current.set(v, el)
                    }}
                    className="hd-opt"
                    data-opt={v}
                    data-answer={v === q.hidden ? '1' : undefined}
                    role="button"
                    aria-label={`${v} 隻`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={nudged ? { opacity: 1, y: [0, -18, 0] } : { opacity: 1, y: 0 }}
                    transition={nudged ? { duration: 0.4 } : { duration: 0.3, delay: k * 0.08 }}
                    {...tap(`o${qi}-${v}`, () => void choose(v), ANSWER_TAP)}
                  >
                    <rect x={optX(k) - 10} y={OPT.y - 10} width={OPT.w + 20} height={OPT.h + 20} fill="transparent" />
                    <rect x={optX(k)} y={OPT.y} width={OPT.w} height={OPT.h} rx={24} fill={isPicked ? '#FFF3C4' : '#FFFDF8'} stroke={isPicked ? '#D9A93A' : '#2E2A25'} strokeWidth={isPicked ? 7 : 4} />
                    {spec.show !== 'num' && (
                      <g transform={`translate(${optX(k) + OPT.w / 2} ${OPT.y + (spec.show === 'both' ? OPT.h * 0.66 : OPT.h / 2)})`}>
                        <Dots n={v} s={spec.show === 'both' ? 64 : 92} />
                      </g>
                    )}
                    {spec.show !== 'dots' && (
                      <text x={optX(k) + OPT.w / 2} y={OPT.y + (spec.show === 'both' ? OPT.h * 0.26 : OPT.h / 2) + 2} textAnchor="middle" dominantBaseline="central" fontSize={spec.show === 'both' ? 42 : 70} fontWeight={700} fill="#2E2A25" style={{ fontFamily: 'var(--font)' }}>
                        {v}
                      </text>
                    )}
                  </motion.g>
                )
              })}
          </motion.svg>
        </AnimatePresence>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !allDone} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<HidePickArt />} againLabel="再一局" line="hd.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
