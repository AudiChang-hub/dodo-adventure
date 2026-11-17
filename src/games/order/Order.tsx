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
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useTaps } from '../../ui/tap'
import { pointIn, useLive } from '../logic/kit'
import { OrderPickArt, Pic } from './art'
import { orderCoplay } from './coplay'
import { capKey, praiseKey, wordKey } from './lines'
import { loadOrder, saveOrder } from './progress'
import { ORDER_GAME, afterOrder, orderRound, type OrderQ, type OrderState } from './plan'
import '../draw/tools.css'
import './order.css'

/** 新的一題剛出來這麼久內點不算（上一題連點的手指，TOUCH-4） */
const ARM_MS = 500

/**
 * 故事排順序（T-164，順序和因果）：上面一排空格（第一格、第二格…，中間有箭頭），下面一排打亂的圖卡。
 * 點一張圖卡：是下一格的就飛上去，豆豆念「First, put a seed in the dirt.」「Then, …」「Last, …」；
 * 不是的話輕輕晃一下留在原地（不說錯），豆豆問 What comes next?，同一格點錯兩次手指出對的那張。
 * 排好了照順序再念一遍（每念一張那一張跳一下），一局 3 個故事，玩完停在「再一局／回首頁」。
 * 第一次到這一級先示範一個故事（示範的手直接放卡片，不呼叫會 flow.cut() 的 choose，T-163 翻牌卡住的教訓），下一個故事手在對的卡片旁邊等。
 */
export function Order() {
  const prog = useRef<OrderState | null>(null)
  const [qs, setQs] = useState<OrderQ[] | null>(null)
  const [n, setN] = useState(0)
  const [zh, setZh] = useState('')
  const [resting, setResting] = useState(false)
  const deal = (p: OrderState) => {
    const mem = { day: p.day, today: p.today, recent: p.recent }
    const r = orderRound(p.level, mem, today())
    prog.current = { ...p, ...mem }
    void saveOrder(prog.current)
    return r
  }
  useEffect(() => {
    let on = true
    void loadOrder().then((p) => {
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
  const hint = orderCoplay(zh)
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? hint.now : hint.play}>
      {qs && prog.current && <OrderRoundView key={n} qs={qs} prog={prog} onQ={setZh} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { at: number; tap: number; beckon: boolean } | null

function OrderRoundView({ qs, prog, onQ, onDone, onAgain, resting }: { qs: OrderQ[]; prog: { current: OrderState | null }; onQ: (zh: string) => void; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<number, HTMLElement | null>())

  const [qi, setQi] = useState(0)
  /** 已經放好的卡（q.steps 的第幾個），照格子的順序 */
  const [placed, setPlaced] = useState<number[]>([])
  const [shake, setShake] = useState<{ at: number; k: number } | null>(null)
  /** 念到哪一格（那一格跳一下） */
  const [glow, setGlow] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const st = useRef({ qi: 0, busy: true, demo: false, armed: false, led: false, guided: false, missed: false, slotMiss: 0, placed: [] as number[], taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)
  const tally = useRef({ counted: 0, misses: 0 })

  const level = qs[0].level
  const [firstTime] = useState(() => !(prog.current?.taught.includes(level) ?? true))
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')
  const showHand = (at: number, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const q = qs[qi]
  const N = q.steps.length
  const askFor = (slot: number) => (slot === 0 ? 'or.ask.first' : slot === N - 1 ? 'or.ask.last' : 'or.ask.next')

  /** 把第 j 張放到下一格，念那一格（First, … / Then, … / Last, …） */
  const put = (j: number) => {
    const s = st.current
    s.placed = [...s.placed, j]
    s.slotMiss = 0
    setPlaced(s.placed)
  }
  const tellSlot = (x: OrderQ, slot: number) => say(wordKey(slot, x.steps.length), capKey(x.story.id, x.steps[slot]))

  /** 排好了：照順序再念一遍（每念一張那一張跳一下） */
  const retell = async (x: OrderQ, ok: () => boolean) => {
    await wait(500)
    if (!ok()) return false
    await say('or.retell')
    if (!ok()) return false
    for (let k = 0; k < x.steps.length; k++) {
      setGlow(k)
      await tellSlot(x, k)
      if (!ok()) return false
      await wait(250)
      if (!ok()) return false
    }
    setGlow(null)
    return true
  }

  const record = (i: number) => {
    const s = st.current
    const x = qs[i]
    const phase = s.guided || s.led || phaseOf(i) === 'teach' ? 'guided' : 'quiz'
    const first = !s.missed
    void logAttempt({
      station: 'logic',
      game: ORDER_GAME,
      itemId: x.itemId,
      skill: x.skill,
      phase,
      level: x.level,
      options: x.deck.map((j) => String(x.steps[j])),
      answer: x.steps.join('>'),
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.led,
      heard: true,
      metrics: { ...(s.led ? { led: 1 } : {}), cards: x.steps.length, given: x.given },
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
      prog.current = afterOrder(p, tally.current)
      void saveOrder(prog.current)
    }
    await say('or.done')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  const next = async (i: number) => {
    if (i + 1 < qs.length) present(i + 1)
    else await finish()
  }

  /** 一個故事排好了：再念一遍、稱讚、記錄、下一個（不能搶：擋板擋著） */
  const storyDone = async (i: number) => {
    const s = st.current
    s.busy = true
    idle.stop()
    setHand(null)
    setHold(true)
    const ok = flow.begin(live)
    sfx.correct()
    if (!(await retell(qs[i], ok))) return
    if (phaseOf(i) !== 'teach') record(i)
    await say(praiseKey(Math.floor(Math.random() * 3)))
    if (!ok()) return
    await wait(PACE.NEXT_NEW)
    if (!ok()) return
    void next(i)
  }

  /** 等孩子點：手（一起做的那一題）在對的卡片旁邊、發呆的提醒 */
  const waitTurn = () => {
    const s = st.current
    const slot = s.placed.length
    if (s.guided) setHand({ at: slot, tap: 0, beckon: true })
    idle.start({
      repeat: () => void say(askFor(slot)),
      hint: () => {
        st.current.led = true
        showHand(slot, true)
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
    await say(...(i === 0 ? ['or.intro'] : []))
    if (!ok()) return
    if (x.given) {
      setGlow(0)
      await tellSlot(x, 0)
      if (!ok()) return
      setGlow(null)
    }
    await say('teach.watch.dodo')
    if (!ok()) return
    // 示範的手一張一張放（直接放，不走 choose）
    while (s.placed.length < x.steps.length) {
      const slot = s.placed.length
      showHand(slot, false)
      await wait(800)
      if (!ok()) return
      showHand(slot, true)
      await wait(250)
      if (!ok()) return
      sfx.pop()
      put(slot)
      setHand(null)
      await tellSlot(x, slot)
      if (!ok()) return
      await wait(300)
      if (!ok()) return
    }
    if (!(await retell(x, ok))) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: ORDER_GAME, itemId: x.itemId, skill: x.skill, level: x.level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveOrder(prog.current)
    }
    s.demo = false
    setDemo(false)
    void next(i)
  }

  const present = async (i: number) => {
    const s = st.current
    const x = qs[i]
    const given = Array.from({ length: x.given }, (_, k) => k)
    Object.assign(s, { qi: i, busy: true, demo: false, armed: false, led: false, guided: phaseOf(i) === 'guided', missed: false, slotMiss: 0, placed: given, taps: [], t0: performance.now() })
    setQi(i)
    setPlaced(given)
    setShake(null)
    setGlow(null)
    setHand(null)
    onQ(x.story.zh)
    idle.stop()
    setHold(true)
    clearTimeout(armTimer.current)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    const ok = flow.begin(live)
    // 卡片出來一下下才收點（上一題連點的手指）；之後念的話都可以被搶
    armTimer.current = window.setTimeout(() => {
      if (!live.current) return
      s.armed = true
      s.busy = false
      setHold(false)
    }, ARM_MS)
    await say(...(i === 0 ? ['or.intro'] : []))
    if (!ok()) return
    if (x.given) {
      setGlow(0)
      await tellSlot(x, 0)
      if (!ok()) return
      setGlow(null)
    }
    await say(askFor(s.placed.length))
    if (!ok()) return
    waitTurn()
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

  /** 孩子點了下面的第 j 張（示範的手不走這裡） */
  const choose = async (j: number) => {
    const s = st.current
    if (s.demo || resting || allDone) return
    if (s.placed.includes(j)) return
    if (!s.armed || s.busy) return pingAt(els.current.get(j))
    const i = s.qi
    const x = qs[i]
    const slot = s.placed.length
    s.taps.push({ pick: String(x.steps[j]), ms: Math.round(performance.now() - s.t0) })
    idle.stop()
    flow.cut()
    setHand(null)
    setGlow(null)
    const ok = flow.begin(live)
    if (j === slot) {
      sfx.pop()
      put(j)
      if (s.placed.length === x.steps.length) {
        // 最後一張：念完這一格再整個念一遍
        s.busy = true
        setHold(true)
        await tellSlot(x, slot)
        if (!ok()) return
        return void storyDone(i)
      }
      await tellSlot(x, slot)
      if (!ok()) return
      waitTurn()
      return
    }
    // 不是這一格的：輕輕晃一下留在原地，不說錯；同一格點錯兩次，手指出對的那張
    s.missed = true
    s.slotMiss++
    sfx.gentle()
    setShake((v) => ({ at: j, k: (v?.k ?? 0) + 1 }))
    if (s.slotMiss >= 2) {
      s.led = true
      showHand(slot, true)
    }
    await say(askFor(slot))
    if (!ok()) return
    idle.start({
      repeat: () => void say(askFor(slot)),
      hint: () => {
        st.current.led = true
        showHand(slot, true)
      },
    })
  }

  const handAt = hand ? pointIn(els.current.get(hand.at), layer.current, 0.62, 0.55) : null
  const nextSlot = placed.length
  return (
    <div
      className={`or${resting ? ' is-resting' : ''}`}
      ref={layer}
      style={{ '--n': N } as CSSProperties}
      data-logic-game="order"
      data-level={level}
      data-item={qi}
      data-story={q.story.id}
      data-placed={placed.length}
      data-demo={demo ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="or-play">
        <div className="or-slots" data-slots="">
          {q.steps.map((step, k) => {
            const j = placed[k]
            return (
              <div key={`${qi}-${k}`} className={`or-slot${j == null && k === nextSlot && !allDone ? ' is-next' : ''}`} data-slot={k}>
                {j == null ? (
                  <span className="or-dots" aria-hidden="true">
                    {Array.from({ length: k + 1 }, (_, d) => (
                      <i key={d} />
                    ))}
                  </span>
                ) : (
                  <motion.div layoutId={`or-${qi}-${j}`} className="or-card is-placed" animate={glow === k ? { y: [0, -12, 0] } : { y: 0 }} transition={{ duration: 0.45 }} data-card={step}>
                    <Pic story={q.story} step={step} />
                  </motion.div>
                )}
                {k < N - 1 && <span className="or-arrow" aria-hidden="true" />}
              </div>
            )
          })}
        </div>
        <div className="or-deck" data-deck="">
          {q.deck.map((j) =>
            placed.includes(j) ? (
              <div key={`${qi}-${j}`} className="or-card is-gone" aria-hidden="true" />
            ) : (
              <motion.button
                key={`${qi}-${j}`}
                layoutId={`or-${qi}-${j}`}
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  els.current.set(j, el)
                }}
                className="or-card"
                data-card={q.steps[j]}
                aria-label={`圖卡：${q.story.zh}`}
                initial={{ opacity: 0, y: 20 }}
                animate={shake?.at === j ? { opacity: 1, y: 0, x: shake.k % 2 ? [0, -12, 12, -8, 8, 0] : [0, 12, -12, 8, -8, 0] } : { opacity: 1, y: 0, x: 0 }}
                transition={{ duration: 0.4 }}
                {...tap(`o${qi}-${j}`, () => void choose(j))}
              >
                <Pic story={q.story} step={q.steps[j]} />
              </motion.button>
            ),
          )}
        </div>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !allDone} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<OrderPickArt />} againLabel="再一局" line="or.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
