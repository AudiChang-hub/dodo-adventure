import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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
import { Critter, CritterHead } from './critter'
import { SceneView } from './scene'
import { FeelPickArt } from './art'
import { askKey, faceKey, isKey, respKey, sitKey, whyKey } from './lines'
import { saveFeel } from './progress'
import { FEEL_GAME, type FeelState } from './plan'
import { afterWhy, type WhyQ } from './why-plan'
import { MOOD_ZH, sitLength, type Mood } from './data'
import '../draw/tools.css'
import './feel.css'

/** 新的一題剛出來這麼久內點不算（上一題連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 情境的畫框（跟原本的心情臉一樣，只看主角、道具附近） */
const FEEL_VIEW = '120 90 820 520'

type HandState = { at: number; tap: number; beckon: boolean } | null

/**
 * 心情臉「為什麼」那一層（T-164，4 歲：說出情緒的原因）。原本的心情臉玩熟練了才會出現（./Feel.tsx 判斷）。
 * 看情境選心情（face）：情境照常演，主角的臉一直不變，問 How does Bunny feel?；選完主角才換成那個心情。
 * 看臉選情境（cause）：左邊主角已經是那個心情；右邊幾張情境的小圖（主角的臉都還沒變）一張一張演一次、念發生什麼事，
 * 再問 Why is Bunny sad? 選一張。小圖停在事情剛發生的那一刻（data.ts 的 snap）。
 * 選了別的也不說錯：對的那一張亮起來，再說發生什麼事、主角是什麼心情。第一次到這一級先示範一題，下一題手在答案旁邊等。
 * 示範是一段流程，手點的時候直接放答案，不呼叫會 flow.cut() 的 choose（T-163 翻牌卡住的教訓）。
 */
export function WhyRoundView({ qs, prog, onQ, onDone, onAgain, resting }: { qs: WhyQ[]; prog: { current: FeelState | null }; onQ: (m: Mood) => void; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<number, HTMLElement | null>())

  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [shown, setShown] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  /** 看臉選情境：出題時一張一張演給他看（演的那一張會動、框亮起來），演完停在事情剛發生的那一刻 */
  const [playing, setPlaying] = useState<number | null>(null)
  const st = useRef({ qi: 0, busy: true, demo: false, armed: false, led: false, guided: false, taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)
  const tally = useRef({ counted: 0, misses: 0 })

  const level = qs[0].level
  const [firstTime] = useState(() => !(prog.current?.why.taught.includes(level) ?? true))
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')
  const showHand = (at: number, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const q = qs[qi]
  const n = q.mode === 'face' ? q.moods.length : q.sits.length
  /** 第幾個選項是答案 */
  const answerAt = (x: WhyQ) => (x.mode === 'face' ? x.moods.indexOf(x.answer) : x.sits.findIndex((s) => s.id === x.sit.id))
  const ask = (x: WhyQ) => (x.mode === 'face' ? askKey(x.hero) : whyKey(x.hero, x.answer))
  const optLabel = (x: WhyQ, k: number) => (x.mode === 'face' ? x.moods[k] : x.sits[k].id)

  /** 出題：看情境選心情要先看情境演完（主角的臉不變）；看臉選情境把每一張小圖演一次、念發生什麼事，再問 */
  const intro = async (i: number, ok: () => boolean) => {
    const x = qs[i]
    const head = i === 0 ? ['fl.why.intro'] : []
    if (x.mode === 'cause') {
      if (head.length) await say(...head)
      if (!ok()) return false
      for (let k = 0; k < x.sits.length; k++) {
        const t0 = performance.now()
        setPlaying(k)
        await say(sitKey(x.sits[k].id))
        if (!ok()) return false
        const left = sitLength(x.sits[k]) + 200 - (performance.now() - t0)
        if (left > 0) await wait(left)
        if (!ok()) return false
        setPlaying(null)
        await wait(250)
        if (!ok()) return false
      }
      return ok()
    }
    const t0 = performance.now()
    await say(...head, sitKey(x.sit.id))
    if (!ok()) return false
    const left = sitLength(x.sit) + 300 - (performance.now() - t0)
    if (left > 0) await wait(left)
    return ok()
  }

  /** 說答案：看情境選心情 → 主角換成那個心情＋「Bunny is sad.」＋一句回應；看臉選情境 → 「Oh no, the ice cream fell!」＋「Bunny is sad.」 */
  const tell = async (x: WhyQ, ok: () => boolean) => {
    if (x.mode === 'face') {
      setRevealed(true)
      await say(isKey(x.hero, x.answer), respKey(x.answer, Math.floor(Math.random() * 3)))
      return ok()
    }
    await say(sitKey(x.sit.id), isKey(x.hero, x.answer))
    return ok()
  }

  const record = (i: number, pickAt: number, how: { handPlaced?: boolean }) => {
    const s = st.current
    const x = qs[i]
    const phase = s.guided || s.led || how.handPlaced || phaseOf(i) === 'teach' ? 'guided' : 'quiz'
    const first = pickAt === answerAt(x) && !how.handPlaced
    void logAttempt({
      station: 'logic',
      game: FEEL_GAME,
      itemId: x.itemId,
      skill: x.skill,
      phase,
      level: 10 + x.level,
      options: x.mode === 'face' ? x.moods : x.sits.map((t) => t.id),
      answer: x.mode === 'face' ? x.answer : x.sit.id,
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.led || !!how.handPlaced,
      heard: true,
      metrics: { ...(s.led ? { led: 1 } : {}), ...(how.handPlaced ? { shown: 1 } : {}), options: x.mode === 'face' ? x.moods.length : x.sits.length, why: 1 },
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
      prog.current = { ...p, why: afterWhy(p.why, tally.current) }
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
    if (!(await intro(i, ok))) return
    await say('teach.watch.dodo', ask(x))
    if (!ok()) return
    const at = answerAt(x)
    showHand(at, false)
    await wait(700)
    if (!ok()) return
    // 手點答案：直接放答案（不走 choose，choose 會 flow.cut() 把示範自己作廢）
    showHand(at, true)
    setPicked(at)
    sfx.correct()
    await wait(300)
    if (!ok()) return
    if (!(await tell(x, ok))) return
    setHand(null)
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: FEEL_GAME, itemId: x.itemId, skill: x.skill, level: 10 + x.level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.why.taught.includes(level)) {
      prog.current = { ...p, why: { ...p.why, taught: [...p.why.taught, level] } }
      void saveFeel(prog.current)
    }
    s.demo = false
    setDemo(false)
    void next(i)
  }

  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { qi: i, busy: true, demo: false, armed: false, led: false, guided: phaseOf(i) === 'guided', taps: [], t0: performance.now() })
    setQi(i)
    setPicked(null)
    setShown(null)
    setRevealed(false)
    setPlaying(null)
    setHand(null)
    setTurn(false)
    onQ(qs[i].answer)
    idle.stop()
    setHold(true)
    clearTimeout(armTimer.current)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    const x = qs[i]
    const ok = flow.begin(live)
    // 看情境選心情：情境演到一半才收點（還沒看到發生什麼事，點了不算）；看臉選情境：一出來就收
    armTimer.current = window.setTimeout(
      () => {
        if (!live.current) return
        s.armed = true
        s.busy = false
        setHold(false)
      },
      x.mode === 'face' ? Math.max(ARM_MS, (x.sit.turn ?? 1500) + 200) : ARM_MS + 400,
    )
    if (!(await intro(i, ok))) return
    await say(ask(x))
    if (!ok()) return
    if (s.guided) setHand({ at: answerAt(x), tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say(ask(x)),
      hint: () => {
        st.current.led = true
        showHand(answerAt(x), true)
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

  /** 孩子點了一個選項（示範的手不走這裡） */
  const choose = async (k: number) => {
    const s = st.current
    if (s.demo || resting || allDone) return
    if (!s.armed || s.busy) return pingAt(els.current.get(k))
    const i = s.qi
    const x = qs[i]
    setTurn(false)
    s.taps.push({ pick: optLabel(x, k), ms: Math.round(performance.now() - s.t0) })
    idle.stop()
    s.busy = true
    flow.cut()
    setHand(null)
    setPlaying(null)
    setPicked(k)
    record(i, k, {})
    const ok = flow.begin(live)
    const right = k === answerAt(x)
    if (right) {
      sfx.correct()
      await wait(250)
      if (!ok()) return
    } else {
      // 選了別的：不說錯。看情境選心情先說他選的是什麼臉；對的那一張亮起來，再說答案
      sfx.gentle()
      if (x.mode === 'face') {
        await say(faceKey(x.moods[k]))
        if (!ok()) return
      } else {
        await wait(300)
        if (!ok()) return
      }
      setShown(answerAt(x))
    }
    if (!(await tell(x, ok))) return
    await wait(right ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
    if (!ok()) return
    void next(i)
  }

  const handAt = hand ? pointIn(els.current.get(hand.at), layer.current, 0.62, 0.55) : null
  const a = answerAt(q)
  const optClass = (k: number) => {
    const isShown = shown === k || (picked === k && k === a)
    return `${isShown ? ' is-answer' : ''}${picked === k && k !== a ? ' is-picked' : ''}`
  }
  const optAnim = (k: number, delay: number) =>
    picked === k && k !== a ? { opacity: 1, y: [0, -14, 0] } : shown === k || (picked === k && k === a) ? { opacity: 1, y: 0, scale: [1, 1.05, 1] } : { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, delay } }
  return (
    <div
      className={`fl fl-why is-${q.mode}${resting ? ' is-resting' : ''}`}
      ref={layer}
      data-logic-game="feel"
      data-why={level}
      data-mode={q.mode}
      data-item={qi}
      data-sit={q.sit.id}
      data-answer={a}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      {q.mode === 'face' ? (
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
                aria-label="情境：他覺得怎樣？"
              >
                <SceneView sit={q.sit} hero={q.hero} friend={q.friend} face={revealed ? q.answer : 'neutral'} />
              </motion.svg>
            </AnimatePresence>
          </div>
          <div className={`fl-faces n${n}`} key={`o${qi}`} data-faces="">
            {q.moods.map((m, k) => (
              <motion.button
                key={m}
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  els.current.set(k, el)
                }}
                className={`fl-face${optClass(k)}`}
                data-face={m}
                data-opt={k}
                aria-label={`${MOOD_ZH[m]}的臉`}
                initial={{ opacity: 0, y: 16 }}
                animate={optAnim(k, 0.1 + k * 0.08)}
                transition={{ duration: 0.4 }}
                {...tap(`w${qi}-${k}`, () => void choose(k))}
              >
                <svg viewBox="0 -24 240 214" width="100%" height="100%" aria-hidden="true">
                  <CritterHead sp={q.hero} face={m} />
                </svg>
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <div className="fl-play fl-cause">
          <motion.div className="fl-hero" key={`h${qi}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} aria-label={`${MOOD_ZH[q.answer]}的主角`}>
            <svg viewBox="-10 -40 260 330" width="100%" height="100%" aria-hidden="true">
              <Critter sp={q.hero} face={q.answer} />
            </svg>
            <span className="fl-ask" aria-hidden="true">
              ?
            </span>
          </motion.div>
          <div className={`fl-sits n${n}`} key={`s${qi}`} data-sits="">
            {q.sits.map((s, k) => (
              <motion.button
                key={s.id}
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  els.current.set(k, el)
                }}
                className={`fl-sit${optClass(k)}${playing === k ? ' is-playing' : ''}`}
                data-opt={k}
                data-sit={s.id}
                aria-label={`情境 ${k + 1}`}
                initial={{ opacity: 0, y: 16 }}
                animate={optAnim(k, 0.15 + k * 0.1)}
                transition={{ duration: 0.4 }}
                {...tap(`c${qi}-${k}`, () => void choose(k))}
              >
                <svg viewBox={FEEL_VIEW} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
                  <SceneView key={playing === k ? 'play' : 'still'} sit={s} hero={q.hero} friend={q.friend} face="neutral" still={playing !== k} />
                </svg>
              </motion.button>
            ))}
          </div>
        </div>
      )}
      <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
      <WaitShield on={hold && !resting && !allDone} />
      {notYet.view}
      {resting && <DoneChoices again={onAgain} againArt={<FeelPickArt />} againLabel="再一局" line="fl.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
