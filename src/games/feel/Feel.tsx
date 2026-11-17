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
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useTaps } from '../../ui/tap'
import { pointIn, useLive } from '../logic/kit'
import { CritterHead } from './critter'
import { SceneView } from './scene'
import { FeelPickArt } from './art'
import { feelCoplay, whyCoplay } from './coplay'
import { WhyRoundView } from './Why'
import { whyRound, type WhyQ } from './why-plan'
import { askKey, faceKey, isKey, respKey, sitKey } from './lines'
import { loadFeel, saveFeel } from './progress'
import { FEEL_GAME, afterFeel, feelRound, openWhyIfMastered, type FeelQ, type FeelState } from './plan'
import { EMO_ZH, TURN, type Emo, type Mood } from './data'
import '../draw/tools.css'
import './feel.css'

/** 新的一題剛出來這麼久內點不算（上一題連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 情境的畫框：場景（1000×620）放大一點，只看主角、道具附近（天空留一點給彩虹、月亮） */
const FEEL_VIEW = '120 90 820 520'

/**
 * 心情臉（T-160，社會情緒 SE-1）：左邊一段小情境動畫（冰淇淋掉了、收到禮物、積木被推倒、打雷…），右邊幾張臉。
 * 豆豆先說發生什麼事（Oh no, the ice cream fell!），主角的臉和身體換成那個心情，再問「How does Bunny feel?」。
 * 點一張臉：對的話「Bunny is sad.」＋一句回應（A hug helps!）；選了別的也不說錯：「That's a happy face.」，對的那張臉亮起來，再說答案和回應。
 * 不評分、不重來；第一次到這一級先示範一題，下一題手在答案旁邊等。發呆：15 秒再問一次、30 秒手點答案。
 * 一局 4 個情境（四種心情各一個），看完停在「再一局／回首頁」。
 */
export function Feel() {
  const prog = useRef<FeelState | null>(null)
  const [qs, setQs] = useState<FeelQ[] | null>(null)
  // T-164：原本的玩熟練了（plan.ts 的 openWhyIfMastered），之後每一局都是「為什麼」那一層（./Why.tsx）
  const [wq, setWq] = useState<WhyQ[] | null>(null)
  const [n, setN] = useState(0)
  const [emo, setEmo] = useState<Mood>('happy')
  const [resting, setResting] = useState(false)
  const deal = (p: FeelState) => {
    if (p.whyOpen) {
      const mem = { sits: p.why.sits, heroes: p.why.heroes }
      const r = whyRound(p.why.level, mem)
      prog.current = { ...p, why: { ...p.why, ...mem } }
      void saveFeel(prog.current)
      setQs(null)
      setWq(r)
      return
    }
    const mem = { sits: p.sits, heroes: p.heroes }
    const r = feelRound(p.level, mem)
    prog.current = { ...p, ...mem }
    void saveFeel(prog.current)
    setWq(null)
    setQs(r)
  }
  useEffect(() => {
    let on = true
    void loadFeel().then((p) => {
      if (!on || prog.current) return
      deal(p)
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
    deal(p)
    setN((k) => k + 1)
  }
  const hint = wq ? whyCoplay(emo) : feelCoplay(emo as Emo)
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? hint.now : hint.play}>
      {qs && prog.current && <FeelRoundView key={n} qs={qs} prog={prog} onQ={setEmo} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
      {wq && prog.current && <WhyRoundView key={`w${n}`} qs={wq} prog={prog} onQ={setEmo} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { at: Emo; tap: number; beckon: boolean } | null

function FeelRoundView({ qs, prog, onQ, onDone, onAgain, resting }: { qs: FeelQ[]; prog: { current: FeelState | null }; onQ: (e: Emo) => void; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<Emo, HTMLElement | null>())

  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState<Emo | null>(null)
  const [shown, setShown] = useState<Emo | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  const st = useRef({ qi: 0, busy: true, demo: false, armed: false, ready: false, led: false, guided: false, taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)
  const tally = useRef({ counted: 0, misses: 0 })

  const level = qs[0].level
  const [firstTime] = useState(() => !(prog.current?.taught.includes(level) ?? true))
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')
  const showHand = (at: Emo, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const q = qs[qi]

  /** 看情境：旁白和動畫一起開始，等主角換好心情、旁白說完 */
  const watch = async (i: number, ok: () => boolean) => {
    const x = qs[i]
    const t0 = performance.now()
    await say(...(i === 0 ? ['fl.intro'] : []), sitKey(x.sit.id))
    if (!ok()) return false
    const left = (x.sit.turn ?? TURN) + 500 - (performance.now() - t0)
    if (left > 0) await wait(left)
    return ok()
  }

  /** 說答案：主角是什麼心情＋一句回應 */
  const tell = (x: FeelQ) => say(isKey(x.hero, x.answer), respKey(x.answer, Math.floor(Math.random() * 3)))

  const record = (i: number, pick: Emo, how: { handPlaced?: boolean }) => {
    const s = st.current
    const x = qs[i]
    const phase = s.guided || s.led || how.handPlaced || phaseOf(i) === 'teach' ? 'guided' : 'quiz'
    const first = pick === x.answer && !how.handPlaced
    void logAttempt({
      station: 'logic',
      game: FEEL_GAME,
      itemId: x.itemId,
      skill: x.skill,
      phase,
      level: x.level,
      options: x.options,
      answer: x.answer,
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.led || !!how.handPlaced,
      heard: true,
      metrics: { ...(s.led ? { led: 1 } : {}), ...(how.handPlaced ? { shown: 1 } : {}), faces: x.options.length },
    })
    if (phase === 'quiz') {
      tally.current.counted++
      if (!first) tally.current.misses++
    }
  }

  const finish = async () => {
    const ok = flow.begin(live)
    setAllDone(true)
    sfx.done()
    const p = prog.current
    if (p) {
      prog.current = openWhyIfMastered(afterFeel(p, tally.current))
      void saveFeel(prog.current)
    }
    await say('fl.done')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  const next = async (i: number) => {
    if (i + 1 < qs.length) present(i + 1)
    else await finish()
  }

  const runDemo = async (i: number) => {
    const s = st.current
    const x = qs[i]
    const ok = flow.begin(live)
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    if (!(await watch(i, ok))) return
    await say('teach.watch.dodo', askKey(x.hero))
    if (!ok()) return
    showHand(x.answer, false)
    await wait(700)
    if (!ok()) return
    showHand(x.answer, true)
    setPicked(x.answer)
    sfx.correct()
    await wait(300)
    if (!ok()) return
    await tell(x)
    if (!ok()) return
    setHand(null)
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: FEEL_GAME, itemId: x.itemId, skill: x.skill, level: x.level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveFeel(prog.current)
    }
    s.demo = false
    setDemo(false)
    void next(i)
  }

  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { qi: i, busy: true, demo: false, armed: false, ready: false, led: false, guided: phaseOf(i) === 'guided', taps: [], t0: performance.now() })
    setQi(i)
    setPicked(null)
    setShown(null)
    setHand(null)
    setTurn(false)
    onQ(qs[i].answer)
    idle.stop()
    setHold(true)
    clearTimeout(armTimer.current)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    const x = qs[i]
    const ok = flow.begin(live)
    // 主角換好心情以後才收點（還沒看到發生什麼事、臉還沒變，點了不算，只有「看這裡」的圈圈）
    armTimer.current = window.setTimeout(
      () => {
        if (!live.current) return
        s.armed = true
        s.busy = false
        setHold(false)
      },
      Math.max(ARM_MS, (x.sit.turn ?? TURN) + 200),
    )
    if (!(await watch(i, ok))) return
    await say(askKey(x.hero))
    if (!ok()) return
    s.ready = true
    if (s.guided) setHand({ at: x.answer, tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say(askKey(x.hero)),
      hint: () => {
        st.current.led = true
        showHand(x.answer, true)
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

  const choose = async (e: Emo) => {
    const s = st.current
    if (s.demo || resting || allDone) return
    if (!s.armed || s.busy) return pingAt(els.current.get(e))
    const i = s.qi
    const x = qs[i]
    setTurn(false)
    s.taps.push({ pick: e, ms: Math.round(performance.now() - s.t0) })
    idle.stop()
    s.busy = true
    flow.cut()
    setHand(null)
    setPicked(e)
    record(i, e, {})
    const ok = flow.begin(live)
    if (e === x.answer) {
      sfx.correct()
      await wait(250)
      if (!ok()) return
      await tell(x)
    } else {
      // 選了別的：不說錯。說他選的是什麼臉，對的那張亮起來，再說答案
      sfx.gentle()
      await say(faceKey(e))
      if (!ok()) return
      setShown(x.answer)
      await tell(x)
    }
    if (!ok()) return
    await wait(e === x.answer ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
    if (!ok()) return
    void next(i)
  }

  const handAt = hand ? pointIn(els.current.get(hand.at), layer.current, 0.62, 0.55) : null
  return (
    <div
      className={`fl${resting ? ' is-resting' : ''}`}
      ref={layer}
      data-logic-game="feel"
      data-level={level}
      data-item={qi}
      data-sit={q.sit.id}
      data-answer={q.answer}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="fl-play">
        <div className="fl-stage">
          <AnimatePresence mode="wait">
            <motion.svg
              key={qi}
              className="fl-scene"
              viewBox={FEEL_VIEW}
              preserveAspectRatio="xMidYMid meet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              aria-label={`情境：${EMO_ZH[q.answer]}`}
            >
              <SceneView sit={q.sit} hero={q.hero} friend={q.friend} />
            </motion.svg>
          </AnimatePresence>
        </div>
        <div className={`fl-faces n${q.options.length}`} key={`o${qi}`} data-faces="">
          {q.options.map((e, k) => {
            const isPicked = picked === e
            const isShown = shown === e || (picked === e && e === q.answer)
            return (
              <motion.button
                key={e}
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  els.current.set(e, el)
                }}
                className={`fl-face${isShown ? ' is-answer' : ''}${isPicked && e !== q.answer ? ' is-picked' : ''}`}
                data-face={e}
                aria-label={`${EMO_ZH[e]}的臉`}
                initial={{ opacity: 0, y: 16 }}
                animate={isPicked && e !== q.answer ? { opacity: 1, y: [0, -14, 0] } : isShown ? { opacity: 1, y: 0, scale: [1, 1.05, 1] } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, delay: isPicked || isShown ? 0 : 0.1 + k * 0.08 }}
                {...tap(`f${qi}-${e}`, () => void choose(e))}
              >
                <svg viewBox="0 -24 240 214" width="100%" height="100%" aria-hidden="true">
                  <CritterHead sp={q.hero} face={e} />
                </svg>
              </motion.button>
            )
          })}
        </div>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !allDone} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<FeelPickArt />} againLabel="再一局" line="fl.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
