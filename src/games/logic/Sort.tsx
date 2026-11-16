import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../NotYet'
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
import { BinArt, SortPickArt, ThingArt } from './art'
import { sortCoplay } from './coplay'
import { goesKey, sortPraiseKey, sortSceneKey, thatKey, thisKey } from './lines'
import { offsetTo, pointIn, useLive } from './kit'
import { loadLogic, noteScene, saveLogic, type LogicProgress } from './progress'
import { SORT_GAME, SORT_MAX, sortRound, sortThree, stepLevel, type SortLevel, type SortRound, type Thing } from './sort-plan'
import { PATTERN_MAX } from './pattern-plan'
import '../draw/tools.css'
import './logic.css'

/** 新的東西剛出來這麼久內點籃子不算（上一個連點的手指，TOUCH-7） */
const ARM_MS = 300
/** 拖過這麼遠才算在拖（不然是點一下） */
const DRAG_PX = 14
/** 飛進籃子要多久 */
const FLY_MS = 520

/**
 * 豆豆收拾（T-152 設計稿第三節案 A①）：下面 2～3 個籃子，籃子前面的牌子是樣品；中間一次出現一個東西，點對的籃子它就滑進去。
 * 點籃子、先點東西再點籃子、拖過去都可以（TOUCH-2）；拖到籃子外放手，東西回中間，不算錯。
 * 第一次到這一級：第 1 個手示範（示範中點了只有「看這裡」的圈圈，不算作答）、第 2 個手停在對的籃子上一起做、之後自己做。
 * 放錯：東西回中間，說出差在哪（That is the blue basket. This is red.）；第 2 次錯對的籃子亮起來；第 3 次手帶著放進去（記一起做）。
 * 一局 4 個，收完蓋上蓋子、說 All tidy!，停在「再一局／回首頁」，不自己接下一局（HOW-9）。
 * T-157：每一局換一個收拾的情境（容器、背景、開頭那一句跟著換），不跟最近兩局一樣；第 3 級以上偶爾複習學過的特徵（不算升降級）。
 */
export function Sort() {
  const [prog, setProg] = useState<LogicProgress | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let on = true
    void loadLogic({ sort: SORT_MAX, pattern: PATTERN_MAX }).then((p) => on && setProg(p))
    return () => {
      on = false
    }
  }, [])
  const [round, setRound] = useState<SortRound | null>(null)
  const progRef = useRef<LogicProgress | null>(null)
  /** 出一局：避開最近用過的情境，記下這一局的 */
  const deal = (p: LogicProgress) => {
    const level = p.sort.level as SortLevel
    const r = sortRound(level, Math.random, sortThree(p.sort), { recent: p.scenes.sort, review: p.sort.taught.includes(level) })
    noteScene(p, 'sort', r.scene)
    void saveLogic(p)
    return r
  }
  useEffect(() => {
    if (!prog || progRef.current) return
    progRef.current = prog
    setRound(deal(prog))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prog])
  const [resting, setResting] = useState(false)
  const again = () => {
    const p = progRef.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setRound(deal(p))
    setN((k) => k + 1)
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={round ? sortCoplay(round.scene, round.dim)[resting ? 'now' : 'play'] : undefined}>
      {round && progRef.current && <SortRoundView key={n} round={round} prog={progRef} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { basket: string; tap: number; beckon: boolean } | null

function SortRoundView({ round, prog, onDone, onAgain, resting }: { round: SortRound; prog: { current: LogicProgress | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level, dim, skill, review, scene, baskets, items } = round
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const itemEl = useRef<HTMLDivElement | null>(null)
  const basketEls = useRef(new Map<string, HTMLElement | null>())

  const [idx, setIdx] = useState(0)
  const [placed, setPlaced] = useState<Record<string, Thing[]>>({})
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [nudge, setNudge] = useState<{ x: number; y: number; k: number } | null>(null)
  const [lifted, setLifted] = useState(false)
  const [hand, setHand] = useState<HandState>(null)
  const [glow, setGlow] = useState<string | null>(null)
  const [bump, setBump] = useState<Record<string, number>>({})
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [closed, setClosed] = useState(false)
  const [poke, setPoke] = useState(0)
  /** 輪到他了（題目、答錯的提示說完，等他點）：只輸出成 data-turn 給三歲測試看，不影響行為 */
  const [turn, setTurn] = useState(false)

  /** 這一題的狀態（流程裡讀，不等重畫） */
  const st = useRef({ idx: 0, busy: true, demo: false, asking: false, armed: false, wrongs: 0, led: false, guided: false, taps: [] as { pick: string; ms: number }[], t0: 0, ended: false })
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const armTimer = useRef(0)

  const taughtLevel = () => prog.current?.sort.taught.includes(level) ?? true
  /** 這一局第 i 個是示範、一起做，還是自己做 */
  const [firstTime] = useState(() => !taughtLevel())
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')

  const basketOf = (id: string) => basketEls.current.get(id)
  const showHand = (basket: string, tapIt: boolean) => setHand((h) => ({ basket, tap: tapIt ? (h?.tap ?? 0) + 1 : h?.tap ?? 0, beckon: !tapIt && !!h?.beckon }))

  /** 東西飛進籃子（從現在的位置，含拖到一半的位置） */
  const flyInto = async (basket: string) => {
    const off = offsetTo(itemEl.current, basketOf(basket), 0.3)
    // 拖過去放手：從手指放開的位置飛過去（offsetTo 量到的是含拖曳位移的位置，motion 的 x、y 從原位算，所以要加回拖曳的位移）
    const cur = drag ?? { x: 0, y: 0 }
    setDrag(null)
    setLifted(false)
    setFly({ x: off.x + cur.x, y: off.y + cur.y })
    await wait(FLY_MS)
    if (!live.current) return
    const thing = items[st.current.idx].thing
    setPlaced((p) => ({ ...p, [basket]: [...(p[basket] ?? []), thing] }))
    setBump((b) => ({ ...b, [basket]: (b[basket] ?? 0) + 1 }))
  }

  const record = (i: number, how: { handPlaced?: boolean }) => {
    const s = st.current
    const item = items[i]
    const phase = s.guided || s.led || how.handPlaced ? 'guided' : 'quiz'
    void logAttempt({
      station: 'logic',
      game: SORT_GAME,
      itemId: item.id,
      skill,
      phase,
      level,
      options: baskets.map((b) => b.id),
      answer: item.answer,
      taps: s.taps,
      firstTryCorrect: s.wrongs === 0 && !how.handPlaced,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led || !!how.handPlaced,
      heard: true,
      metrics: { ...(s.led ? { led: 1 } : {}), ...(how.handPlaced ? { shown: 1 } : {}), ...(review ? { review: 1 } : {}), baskets: baskets.length },
    })
    const p = prog.current
    if (p) {
      // 複習學過的特徵那一局不算進這一級的升降級
      p.sort = stepLevel(p.sort, { date: today(), first: s.wrongs === 0 && !how.handPlaced, counted: phase === 'quiz' && !review }, SORT_MAX)
      void saveLogic(p)
    }
  }

  const finish = async () => {
    setClosed(true)
    sfx.done()
    const ok = flow.begin(live)
    await say('lg.sort.done')
    if (!ok()) return
    // 時間到了：玩完這一局才去睡覺（TIME-2）
    if (bedtimeIfDue()) return
    onDone()
  }

  const next = async (i: number) => {
    if (i + 1 < items.length) present(i + 1)
    else await finish()
  }

  /** 第 1 個東西：手示範一次（Watch me! → 手點籃子、東西滑進去 → Red goes here. → Your turn!） */
  const runDemo = async (i: number) => {
    const s = st.current
    const ok = flow.begin(live)
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    // 一局的第一個：先說這一局收拾什麼（Let's tidy the toys!）
    await say(...(i === 0 ? [sortSceneKey(scene)] : []), 'teach.watch.dodo')
    if (!ok()) return
    const ans = items[i].answer
    showHand(ans, false)
    await wait(800)
    if (!ok()) return
    showHand(ans, true)
    sfx.pop()
    await flyInto(ans)
    if (!ok()) return
    await say(goesKey(ans))
    if (!ok()) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    setHand(null)
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: SORT_GAME, itemId: items[i].id, skill, level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.sort.taught.includes(level)) {
      p.sort = { ...p.sort, taught: [...p.sort.taught, level] }
      void saveLogic(p)
    }
    s.demo = false
    setDemo(false)
    void next(i)
  }

  /** 換到第 i 個東西 */
  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { idx: i, busy: false, demo: false, asking: false, armed: false, wrongs: 0, led: false, guided: phaseOf(i) === 'guided', taps: [], t0: performance.now() })
    setIdx(i)
    setFly(null)
    setDrag(null)
    setNudge(null)
    setLifted(false)
    setGlow(null)
    setHand(null)
    setTurn(false)
    idle.stop()
    // 剛出來的 0.3 秒：上一個連點的手指只給圈圈
    setHold(true)
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      if (!st.current.demo) setHold(false)
      st.current.armed = true
    }, ARM_MS)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    const ok = flow.begin(live)
    s.asking = true
    await say(...(i === 0 ? [sortSceneKey(scene)] : []), 'lg.sort.ask')
    s.asking = false
    if (!ok()) return
    const ans = items[i].answer
    // 一起做：手停在對的籃子上，輕輕地點，等他點
    if (s.guided) setHand({ basket: ans, tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say('lg.sort.ask'),
      hint: () => {
        // 發呆：手點一下對的籃子（不說話）；之後才點對的記成一起做
        st.current.led = true
        showHand(ans, true)
      },
    })
  }

  useEffect(() => {
    // 延到下一輪才開始：StrictMode 開發模式會掛載兩次
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

  /** 選了一個籃子（點、拖過去放手都走這裡） */
  const choose = async (basket: string) => {
    const s = st.current
    if (s.busy || s.demo || s.ended || resting || closed) return
    if (!s.armed) return pingAt(basketOf(basket))
    const i = s.idx
    const ans = items[i].answer
    // 念題目的時候點錯：不算錯（TOUCH-7），只有「看這裡」
    if (basket !== ans && s.asking) return pingAt(basketOf(basket))
    setTurn(false)
    s.taps.push({ pick: basket, ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    s.busy = true
    flow.cut()
    if (basket === ans) {
      idle.stop()
      setHand(null)
      setGlow(null)
      sfx.pop()
      await flyInto(basket)
      if (!live.current) return
      record(i, {})
      const ok = flow.begin(live)
      // 過程讚美（FB-1）：第 2、4 個說看了什麼，其他說 Yes!
      await say(i % 2 ? sortPraiseKey(dim) : 'praise.dodo.0')
      if (!ok()) return
      await wait(s.wrongs === 0 ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    // 放錯：東西往那個籃子去一點點、回到中間（不搖、不打叉、不出紅色）
    s.wrongs++
    const off = offsetTo(itemEl.current, basketOf(basket), 0.3)
    setDrag(null)
    setLifted(false)
    setNudge({ x: off.x * 0.25, y: off.y * 0.25, k: performance.now() })
    sfx.boing()
    await wait(450)
    if (!live.current) return
    const ok = flow.begin(live)
    if (s.wrongs >= 3) {
      // 第 3 次：手帶著放進去，記一起做，不算熟練
      idle.stop()
      showHand(ans, false)
      await wait(600)
      if (!ok()) return
      showHand(ans, true)
      sfx.pop()
      await flyInto(ans)
      if (!ok()) return
      record(i, { handPlaced: true })
      await say(goesKey(ans))
      if (!ok()) return
      setHand(null)
      await wait(PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    s.busy = false
    if (s.wrongs === 2) setGlow(ans)
    if (s.wrongs === 1) await say(thatKey(basket), thisKey(ans))
    else await say(thisKey(ans))
    if (!ok()) return
    setTurn(true)
    idle.start({
      repeat: () => void say(thisKey(ans)),
      hint: () => {
        st.current.led = true
        showHand(ans, true)
      },
    })
  }

  // ── 東西：點一下拿起來、拖到籃子 ──
  const downItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current
    if (!firstFinger(e.nativeEvent)) return
    if (s.demo || !s.armed) {
      if (layer.current) {
        const p = localPoint(layer.current, e.clientX, e.clientY)
        notYet.ping(p.x, p.y)
      }
      return
    }
    if (s.busy || resting || closed) return
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 有些瀏覽器拿不到 */
    }
  }
  const moveItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return
    if (st.current.busy) {
      dragRef.current = null
      setDrag(null)
      return
    }
    d.moved = true
    idle.poke()
    setDrag({ x: dx, y: dy })
  }
  const upItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    if (!d.moved) {
      // 點一下：拿起來（再點籃子就放進去）
      sfx.tap()
      setLifted((v) => !v)
      return
    }
    // 拖到哪個籃子上放手：放進那個籃子；不在籃子上：回中間，不算錯
    const hit = baskets.find((b) => {
      const r = basketOf(b.id)?.getBoundingClientRect()
      return r && e.clientX >= r.left - 16 && e.clientX <= r.right + 16 && e.clientY >= r.top - 40 && e.clientY <= r.bottom + 16
    })
    if (hit) void choose(hit.id)
    else setDrag(null)
  }
  const cancelItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
  }

  const item = items[idx]
  const handAt = hand ? pointIn(basketOf(hand.basket), layer.current, 0.55, 0.35) : null
  const anim = fly
    ? { x: fly.x, y: fly.y, scale: 0.35, opacity: 0 }
    : drag
      ? { x: drag.x, y: drag.y, scale: 1.08, opacity: 1 }
      : nudge
        ? { x: [0, nudge.x, 0], y: [0, nudge.y, 0], scale: 1, opacity: 1 }
        : { x: 0, y: 0, scale: lifted ? 1.08 : 1, opacity: 1 }
  const trans = fly ? { duration: FLY_MS / 1000, ease: [0.4, 0, 0.7, 1] as const } : drag ? { duration: 0 } : nudge ? { duration: 0.45 } : { type: 'spring' as const, stiffness: 300, damping: 24 }

  return (
    <div
      className={`lg-sort${resting ? ' is-resting' : ''}`}
      ref={layer}
      data-logic-game="sort"
      data-scene={scene}
      data-dim={dim}
      data-review={review ? '1' : undefined}
      data-level={level}
      data-item={idx}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-answer={item.answer}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="lg-scene-bg" aria-hidden="true" />
      <div className="lg-sort-play">
        <div className="lg-sort-table">
          {!closed && (
            <motion.div
              key={idx}
              ref={itemEl}
              className={`lg-item${lifted ? ' is-lifted' : ''}`}
              data-thing={item.id}
              role="button"
              aria-label="要收的東西"
              initial={{ y: -30, opacity: 0, scale: 0.8 }}
              animate={anim}
              transition={trans}
              onPointerDown={downItem}
              onPointerMove={moveItem}
              onPointerUp={upItem}
              onPointerCancel={cancelItem}
            >
              <ThingArt thing={item.thing} />
            </motion.div>
          )}
        </div>
        <div className={`lg-baskets n${baskets.length}`}>
          {baskets.map((b) => (
            <button
              key={b.id}
              type="button"
              ref={(el) => {
                basketEls.current.set(b.id, el)
              }}
              className={`lg-basket${glow === b.id ? ' is-glow' : ''}`}
              data-basket={b.id}
              aria-label={`籃子：${b.id}`}
              {...tap(`basket-${b.id}`, () => void choose(b.id))}
            >
              <span key={bump[b.id] ?? 0} className={`lg-basket-in${bump[b.id] ? ' is-bump' : ''}`}>
                <BinArt bin={b.bin} sample={b.sample} inside={placed[b.id] ?? []} closed={closed} />
              </span>
            </button>
          ))}
        </div>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<SortPickArt />} againLabel="再一局" line="lg.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
