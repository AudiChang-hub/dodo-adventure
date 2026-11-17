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
import { LangEmoji } from '../LangEmoji'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useTaps } from '../../ui/tap'
import { pointIn, useLive } from '../logic/kit'
import { ListenPickArt, ThingArt } from './art'
import { listenCoplay } from './coplay'
import { isKey, praiseKey, thenKey, touchKey } from './lines'
import { loadListen, saveListen } from './progress'
import { LISTEN_GAME, afterListen, listenRound, stepsOf, type ListenQ, type ListenState } from './plan'
import { thingId, thingZh } from './data'
import '../draw/tools.css'
import './listen.css'

/** 念完指令到收點中間停一下（念的時候點的手指不算，TOUCH-4） */
const ARM_MS = 250

/**
 * 聽兩步驟指令（T-164，英文 EN-1、工作記憶）：一排 3～4 樣東西，豆豆說「Touch the red ball. Then the star.」，孩子照順序點。
 * 念指令的時候不收點（聽完才動，點了只有「看這裡」的圈圈）；念完才可以點。左上角的耳朵可以再聽一次（不算錯）。
 * 點對了：那一樣亮一圈、旁邊出現 1 個（第二步是 2 個）小點；兩步都對了一起跳一下、稱讚。
 * 點錯了不扣分：輕輕晃一下，豆豆說「That's the cat.」再說一次還沒做的步驟；同一步點錯兩次，手指出對的。
 * 第一次到這一級先示範一句（示範的手直接點，不呼叫會 flow.cut() 的 choose，T-163 翻牌卡住的教訓），下一句手在對的東西旁邊等。
 */
export function Listen() {
  const prog = useRef<ListenState | null>(null)
  const [qs, setQs] = useState<ListenQ[] | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  const deal = (p: ListenState) => {
    const mem = { day: p.day, today: p.today }
    const r = listenRound(p.level, mem, today())
    prog.current = { ...p, ...mem }
    void saveListen(prog.current)
    return r
  }
  useEffect(() => {
    let on = true
    void loadListen().then((p) => {
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
  const hint = listenCoplay(!!qs && stepsOf(qs[0].level) === 2)
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? hint.now : hint.play}>
      {qs && prog.current && <ListenRoundView key={n} qs={qs} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { at: number; tap: number; beckon: boolean } | null

function ListenRoundView({ qs, prog, onDone, onAgain, resting }: { qs: ListenQ[]; prog: { current: ListenState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<number, HTMLElement | null>())

  const [qi, setQi] = useState(0)
  /** 已經點對的（things 的第幾個），照步驟的順序 */
  const [done, setDone] = useState<number[]>([])
  const [shake, setShake] = useState<{ at: number; k: number } | null>(null)
  const [cheer, setCheer] = useState(false)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  const st = useRef({ qi: 0, busy: true, demo: false, armed: false, led: false, guided: false, missed: false, stepMiss: 0, step: 0, replays: 0, taps: [] as { pick: string; ms: number }[], t0: 0 })
  const tally = useRef({ counted: 0, misses: 0 })

  const level = qs[0].level
  const [firstTime] = useState(() => !(prog.current?.taught.includes(level) ?? true))
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')
  const showHand = (at: number, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const q = qs[qi]

  /** 還沒做的步驟要念的：第一步 Touch the …（兩步驟接 Then the …）；第二步只念 Then the … */
  const rest = (x: ListenQ, from: number) => x.targets.slice(from).map((k, s) => (from + s === 0 ? touchKey(x.things[k]) : thenKey(x.things[k])))

  const record = (i: number) => {
    const s = st.current
    const x = qs[i]
    const phase = s.guided || s.led || phaseOf(i) === 'teach' ? 'guided' : 'quiz'
    const first = !s.missed
    void logAttempt({
      station: 'logic',
      game: LISTEN_GAME,
      itemId: x.itemId,
      skill: x.skill,
      phase,
      level: x.level,
      options: x.things.map(thingId),
      answer: x.targets.map((k) => thingId(x.things[k])).join('>'),
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.led,
      heard: true,
      metrics: { ...(s.led ? { led: 1 } : {}), ...(s.replays ? { replays: s.replays } : {}), steps: x.targets.length, things: x.things.length },
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
      prog.current = afterListen(p, tally.current)
      void saveListen(prog.current)
    }
    await say('ls.done')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  const next = async (i: number) => {
    if (i + 1 < qs.length) present(i + 1)
    else await finish()
  }

  /** 每一步都做對了：一起跳一下、稱讚、下一句（不能搶：擋板擋著） */
  const success = async (i: number) => {
    const s = st.current
    s.busy = true
    idle.stop()
    setHand(null)
    setTurn(false)
    setHold(true)
    const ok = flow.begin(live)
    sfx.correct()
    setCheer(true)
    if (phaseOf(i) !== 'teach') record(i)
    await wait(300)
    if (!ok()) return
    await say(praiseKey(Math.floor(Math.random() * 4)))
    if (!ok()) return
    await wait(phaseOf(i) === 'quiz' ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
    if (!ok()) return
    void next(i)
  }

  /** 等孩子點：一起做的那一句手在對的東西旁邊；發呆 15 秒再念一次還沒做的、30 秒手點 */
  const waitTurn = (i: number) => {
    const s = st.current
    const x = qs[i]
    const target = x.targets[s.step]
    if (s.guided) setHand({ at: target, tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say(...rest(x, st.current.step)),
      hint: () => {
        st.current.led = true
        showHand(x.targets[st.current.step], true)
      },
    })
  }

  const runDemo = async (i: number) => {
    const s = st.current
    const x = qs[i]
    const ok = flow.begin(live)
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say(...(i === 0 ? [stepsOf(level) === 2 ? 'ls.intro2' : 'ls.intro'] : []), ...rest(x, 0))
    if (!ok()) return
    await say('teach.watch.dodo')
    if (!ok()) return
    // 示範的手照順序點（直接標成點對，不走 choose）
    for (const k of x.targets) {
      showHand(k, false)
      await wait(800)
      if (!ok()) return
      showHand(k, true)
      await wait(250)
      if (!ok()) return
      sfx.pop()
      s.step++
      setDone((d) => [...d, k])
      await wait(500)
      if (!ok()) return
    }
    setHand(null)
    sfx.correct()
    setCheer(true)
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: LISTEN_GAME, itemId: x.itemId, skill: x.skill, level: x.level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveListen(prog.current)
    }
    s.demo = false
    setDemo(false)
    void next(i)
  }

  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { qi: i, busy: true, demo: false, armed: false, led: false, guided: phaseOf(i) === 'guided', missed: false, stepMiss: 0, step: 0, replays: 0, taps: [], t0: performance.now() })
    setQi(i)
    setDone([])
    setShake(null)
    setCheer(false)
    setHand(null)
    setTurn(false)
    idle.stop()
    setHold(true)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    const x = qs[i]
    const ok = flow.begin(live)
    // 聽完才動：念指令的時候擋著（點了只有「看這裡」的圈圈），念完才收點
    await say(...(i === 0 ? [stepsOf(level) === 2 ? 'ls.intro2' : 'ls.intro'] : []), ...rest(x, 0))
    if (!ok()) return
    await wait(ARM_MS)
    if (!ok()) return
    s.armed = true
    s.busy = false
    s.t0 = performance.now()
    setHold(false)
    waitTurn(i)
  }

  useEffect(() => {
    const t = window.setTimeout(() => void present(0), 0)
    return () => {
      clearTimeout(t)
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

  /** 再聽一次（左上角的耳朵）：念還沒做的步驟，不算錯 */
  const replay = async () => {
    const s = st.current
    if (s.demo || resting || allDone || !s.armed || s.busy) return
    s.replays++
    idle.stop()
    flow.cut()
    const ok = flow.begin(live)
    await say(...rest(qs[s.qi], s.step))
    if (!ok()) return
    waitTurn(s.qi)
  }

  /** 孩子點了第 k 樣（示範的手不走這裡） */
  const choose = async (k: number) => {
    const s = st.current
    if (s.demo || resting || allDone) return
    if (!s.armed || s.busy) return pingAt(els.current.get(k))
    const i = s.qi
    const x = qs[i]
    if (x.targets.slice(0, s.step).includes(k)) return
    s.taps.push({ pick: thingId(x.things[k]), ms: Math.round(performance.now() - s.t0) })
    idle.stop()
    flow.cut()
    setHand(null)
    setTurn(false)
    const ok = flow.begin(live)
    if (k === x.targets[s.step]) {
      sfx.pop()
      s.step++
      s.stepMiss = 0
      setDone((d) => [...d, k])
      if (s.step >= x.targets.length) return void success(i)
      // 兩步驟的第一步：不說話（第二步還記在腦子裡），等他點第二個
      waitTurn(i)
      return
    }
    // 點錯了：不扣分。輕輕晃一下，說他點的是什麼，再念一次還沒做的；同一步點錯兩次，手指出對的
    s.missed = true
    s.stepMiss++
    sfx.gentle()
    setShake((v) => ({ at: k, k: (v?.k ?? 0) + 1 }))
    if (s.stepMiss >= 2) {
      s.led = true
      showHand(x.targets[s.step], true)
    }
    await say(isKey(x.things[k]), ...rest(x, s.step))
    if (!ok()) return
    waitTurn(i)
  }

  const handAt = hand ? pointIn(els.current.get(hand.at), layer.current, 0.62, 0.55) : null
  return (
    <div
      className={`ls${resting ? ' is-resting' : ''}`}
      ref={layer}
      style={{ '--n': q.things.length } as CSSProperties}
      data-logic-game="listen"
      data-level={level}
      data-item={qi}
      data-targets={q.targets.join(',')}
      data-step={done.length}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="ls-play">
        <button type="button" className="ls-ear" aria-label="再聽一次" data-ear="" {...tap('ear', () => void replay())}>
          <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
            <LangEmoji name="ear" x={14} y={12} size={72} />
          </svg>
        </button>
        <div className="ls-things" key={`t${qi}`} data-things="">
          {q.things.map((t, k) => {
            const step = done.indexOf(k)
            const isShake = shake?.at === k
            return (
              <motion.button
                key={`${qi}-${k}`}
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  els.current.set(k, el)
                }}
                className={`ls-thing${step >= 0 ? ' is-done' : ''}`}
                data-thing={thingId(t)}
                data-k={k}
                aria-label={thingZh(t)}
                initial={{ opacity: 0, y: 18 }}
                animate={
                  cheer && step >= 0
                    ? { opacity: 1, x: 0, y: [0, -18, 0] }
                    : isShake
                      ? { opacity: 1, y: 0, x: shake.k % 2 ? [0, -12, 12, -8, 8, 0] : [0, 12, -12, 8, -8, 0] }
                      : { opacity: 1, y: 0, x: 0, transition: { duration: 0.35, delay: 0.05 + k * 0.07 } }
                }
                transition={{ duration: 0.4 }}
                {...tap(`l${qi}-${k}`, () => void choose(k))}
              >
                <ThingArt t={t} />
                {step >= 0 && (
                  <span className="ls-badge" aria-hidden="true">
                    {Array.from({ length: step + 1 }, (_, d) => (
                      <i key={d} />
                    ))}
                  </span>
                )}
              </motion.button>
            )
          })}
        </div>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !allDone} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<ListenPickArt />} againLabel="再一局" line="ls.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
