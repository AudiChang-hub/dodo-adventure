import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
import { Scene } from '../../art/storybook/scenes'
import { useLive } from '../logic/kit'
import { MatchIcon, useMatchIcons } from '../match/Icon'
import { nameKey } from '../match/lines'
import { ShadowPickArt } from './art'
import { SHADOW_COPLAY } from './coplay'
import { FLIP_FROM, OK_WRONGS, SHADOW_GAME, afterShadow, shadowRound, shadowSkill, type ShadowLevel, type ShadowRound, type ShadowState } from './plan'
import { loadShadow, saveShadow } from './progress'
import '../draw/tools.css'
import './shadow.css'

/** 新的一局剛出來這麼久內點不算（上一個連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 拖過這麼遠才算在拖（不然是點一下） */
const DRAG_PX = 14
/** 放在對的影子附近多近就吸過去（影子大小的比例；三歲手指放不準） */
const SNAP = 0.62
/** 放在別的影子上多近算放錯（再遠就是放在空地上：回托盤、不算錯） */
const WRONG = 0.48

/**
 * 影子配對（T-160）：背景一個場景，上面一排黑影（稍微高低錯開），下面托盤放彩色的東西（每一樣都不在自己影子的正下方）。
 * 拖過去放對了會吸附，也能點一下（拿起來）再點影子（TOUCH-2）。拖到空地放手：回托盤，不算錯（TOUCH-7）。
 * 放對：東西蓋住影子、念它的名字。放好第 2 個說「You matched the shadow!」（FB-3）。
 * 放錯：回托盤。第 1 次「Look at the shape.」；同一樣第 2 次對的影子亮起來「It goes here.」；第 3 次手帶著放進去（記一起做）。
 * 第一次玩、第一次到影子翻過來的那一級：手先示範放一個。發呆：15 秒再說一次、30 秒手點一個、它的影子亮起來。
 * 全部放好：念「All the shadows match!」，停在「再一局／回首頁」（HOW-9）。
 */
export function Shadow() {
  const ready = useMatchIcons()
  const [round, setRound] = useState<ShadowRound | null>(null)
  const prog = useRef<ShadowState | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  useEffect(() => {
    if (!ready) return
    let on = true
    void loadShadow().then((p) => {
      if (!on || prog.current) return
      prog.current = p
      setRound(shadowRound(p.level as ShadowLevel, p))
    })
    return () => {
      on = false
    }
  }, [ready])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setRound(shadowRound(p.level as ShadowLevel, p))
    setN((k) => k + 1)
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? SHADOW_COPLAY.now : SHADOW_COPLAY.play}>
      {round && prog.current && <ShadowView key={n} round={round} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { x: number; y: number; tap: number } | null

/** 版面：影子、托盤的位置和大小（作答區的像素） */
function layout(w: number, h: number, n: number, bob: readonly number[]) {
  if (!w || !h) return null
  const s = Math.max(60, Math.min((w * 0.86) / n - 18, h * 0.34, 230))
  const xs = Array.from({ length: n }, (_, i) => w * 0.07 + ((i + 0.5) * w * 0.86) / n)
  const shadows = xs.map((x, i) => ({ x, y: h * 0.32 + (bob[i] ?? 0) * h * 0.04 }))
  const traySize = s * 0.86
  const trayY = h - traySize / 2 - Math.max(14, h * 0.035)
  const tray = xs.map((x) => ({ x, y: trayY }))
  const board = { x: w * 0.04, y: trayY - traySize / 2 - 16, w: w * 0.92, h: traySize + 32 }
  return { w, h, s, traySize, shadows, tray, board }
}

function ShadowView({ round, prog, onDone, onAgain, resting }: { round: ShadowRound; prog: { current: ShadowState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level, items, tray, flip, bob, scene } = round
  const n = items.length
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const area = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const geo = layout(size.w, size.h, n, bob)
  const geoRef = useRef(geo)
  geoRef.current = geo

  const [placed, setPlaced] = useState<boolean[]>(() => Array(n).fill(false))
  const [lifted, setLifted] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null)
  const [glow, setGlow] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)

  const st = useRef({
    busy: true,
    demo: false,
    armed: false,
    ended: false,
    placed: Array<boolean>(n).fill(false),
    lifted: null as number | null,
    wrongs: 0,
    per: Array<number>(n).fill(0),
    drops: 0,
    led: false,
    shown: false,
    demoed: false,
    taps: [] as { pick: string; ms: number }[],
    t0: 0,
  })
  const dragRef = useRef<{ pid: number; id: number; sx: number; sy: number; moved: boolean } | null>(null)

  const [firstTime] = useState(() => {
    const t = prog.current?.taught ?? [1, FLIP_FROM]
    return (level === 1 && !t.includes(1)) || (level === FLIP_FROM && !t.includes(FLIP_FROM))
  })

  const shadowAt = (i: number) => geoRef.current?.shadows[i] ?? { x: 0, y: 0 }
  const trayAt = (i: number) => geoRef.current?.tray[tray.indexOf(i)] ?? { x: 0, y: 0 }
  const pct = (p: { x: number; y: number }) => {
    const g = geoRef.current
    return g ? { x: (p.x / g.w) * 100, y: (p.y / g.h) * 100 } : { x: 50, y: 50 }
  }
  const showHand = (p: { x: number; y: number }, tapIt: boolean) => setHand((h) => ({ ...pct(p), tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0) }))
  const setLift = (i: number | null) => {
    st.current.lifted = i
    setLifted(i)
  }
  const markPlaced = (i: number) => {
    st.current.placed = st.current.placed.map((v, k) => v || k === i)
    setPlaced(st.current.placed)
  }
  /** 下一個要提示的：拿起來的那一個，不然托盤裡第一個還沒放的 */
  const nextItem = () => {
    const s = st.current
    if (s.lifted != null && !s.placed[s.lifted]) return s.lifted
    return tray.find((i) => !s.placed[i]) ?? null
  }

  const startIdle = () => {
    setTurn(true)
    idle.start({
      repeat: () => void say('sh.ask'),
      hint: () => {
        const i = nextItem()
        if (i == null) return
        st.current.led = true
        showHand(trayAt(i), true)
        setGlow(i)
      },
    })
  }

  const record = () => {
    const s = st.current
    const phase = s.demoed || s.led || s.shown ? 'guided' : 'quiz'
    const first = s.wrongs <= OK_WRONGS && !s.shown
    void logAttempt({
      station: 'logic',
      game: SHADOW_GAME,
      itemId: `shadow:${scene}`,
      skill: shadowSkill(level),
      phase,
      level,
      options: items,
      answer: items.join(','),
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.drops,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led || s.shown,
      heard: true,
      metrics: { shadows: n, wrongs: s.wrongs, ...(flip ? { flip: 1 } : {}), ...(s.led ? { led: 1 } : {}), ...(s.shown ? { shown: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = afterShadow(p, { round, date: today(), wrongs: s.wrongs, shown: s.shown, counted: phase === 'quiz' })
      void saveShadow(prog.current)
    }
  }

  const finish = async () => {
    const s = st.current
    s.ended = true
    s.busy = true
    idle.stop()
    setTurn(false)
    setHand(null)
    setGlow(null)
    setDone(true)
    sfx.done()
    record()
    const ok = flow.begin(live)
    await wait(600)
    if (!ok()) return
    await say('sh.done')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 放對了：蓋住影子、念名字 */
  const settle = async (i: number) => {
    const s = st.current
    markPlaced(i)
    setDrag(null)
    setLift(null)
    setGlow(null)
    setHand(null)
    sfx.pop()
    const count = s.placed.filter(Boolean).length
    flow.cut()
    if (count >= n) {
      void say(nameKey(items[i]))
      await wait(900)
      if (!live.current) return
      return finish()
    }
    const ok = flow.begin(live)
    // 過程讚美（FB-3）：放好第 2 個時說一次他做了什麼
    if (count === 2 && !s.demoed) void say(nameKey(items[i]), 'sh.praise').then(() => ok() && idle.poke())
    else void say(nameKey(items[i]))
    startIdle()
  }

  /** 第 3 次放錯（或示範）：手把東西拿到對的影子上 */
  const handCarry = async (i: number, ok: () => boolean) => {
    showHand(trayAt(i), false)
    await wait(650)
    if (!ok()) return false
    showHand(trayAt(i), true)
    await wait(350)
    if (!ok()) return false
    markPlaced(i)
    setLift(null)
    showHand(shadowAt(i), false)
    sfx.pop()
    await wait(600)
    return ok()
  }

  /** 選了一個影子（拖過去放手、點一個再點影子） */
  const tryPlace = async (i: number, slot: number) => {
    const s = st.current
    if (s.busy || s.demo || s.ended || s.placed[i]) return
    s.drops++
    s.taps.push({ pick: `${items[i]}>${items[slot]}`, ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    if (slot === i) return settle(i)
    // 放錯：回托盤（不搖、不打叉、不出紅色）
    s.wrongs++
    s.per[i]++
    setDrag(null)
    setLift(null)
    sfx.boing()
    flow.cut()
    const ok = flow.begin(live)
    if (s.per[i] >= 3) {
      s.busy = true
      s.shown = true
      idle.stop()
      setTurn(false)
      setGlow(i)
      await wait(450)
      if (!ok()) return
      if (!(await handCarry(i, ok))) return
      await say(nameKey(items[i]), 'sh.here')
      if (!ok()) return
      setHand(null)
      setGlow(null)
      s.busy = false
      if (s.placed.filter(Boolean).length >= n) return finish()
      startIdle()
      return
    }
    if (s.per[i] === 2) {
      setGlow(i)
      await say('sh.here')
    } else await say('sh.look')
    if (!ok()) return
    startIdle()
  }

  /** 第一次：手示範放一個 */
  const runDemo = async () => {
    const s = st.current
    const ok = flow.begin(live)
    s.demo = true
    s.demoed = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say('teach.watch.dodo')
    if (!ok()) return
    const i = tray[0]
    setGlow(i)
    if (!(await handCarry(i, ok))) return
    setGlow(null)
    await say(nameKey(items[i]), 'sh.here')
    if (!ok()) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    setHand(null)
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: SHADOW_GAME, itemId: `shadow:${scene}`, skill: shadowSkill(level), level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveShadow(prog.current)
    }
    s.demo = false
    s.busy = false
    s.armed = true
    setDemo(false)
    setHold(false)
    startIdle()
  }

  useEffect(() => {
    let arm = 0
    const t = window.setTimeout(() => {
      const s = st.current
      s.t0 = performance.now()
      if (firstTime) return void runDemo()
      arm = window.setTimeout(() => {
        s.armed = true
        s.busy = false
        setHold(false)
      }, ARM_MS)
      void (async () => {
        const ok = flow.begin(live)
        await say('sh.intro')
        if (!ok() || s.ended) return
        startIdle()
      })()
    }, 0)
    return () => {
      clearTimeout(t)
      clearTimeout(arm)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const at = (e: { clientX: number; clientY: number }) => (area.current ? localPoint(area.current, e.clientX, e.clientY) : { x: 0, y: 0 })
  const ping = (e: { clientX: number; clientY: number }) => {
    const p = at(e)
    notYet.ping(p.x, p.y)
  }

  /** 這一點在哪個還空著的影子上（距離 ≤ 影子大小 × r；沒有：null） */
  const shadowNear = (p: { x: number; y: number }, r: number) => {
    const g = geoRef.current
    if (!g) return null
    let best: number | null = null
    let d0 = Infinity
    g.shadows.forEach((c, j) => {
      if (st.current.placed[j]) return
      const d = Math.hypot(p.x - c.x, p.y - c.y)
      if (d <= g.s * r && d < d0) {
        d0 = d
        best = j
      }
    })
    return best
  }

  /** 拖著放手：靠近對的影子就吸進去；在別的影子上算放錯；其他地方回托盤、不算 */
  const dropAt = (i: number, p: { x: number; y: number }) => {
    const g = geoRef.current
    if (!g) return setDrag(null)
    const c = shadowAt(i)
    if (Math.hypot(p.x - c.x, p.y - c.y) <= g.s * SNAP) return void tryPlace(i, i)
    const j = shadowNear(p, WRONG)
    if (j != null) return void tryPlace(i, j)
    setDrag(null)
  }

  // ── 托盤裡的東西：點一下拿起來、拖到影子上 ──
  const downItem = (e: ReactPointerEvent<HTMLDivElement>, i: number) => {
    const s = st.current
    if (!firstFinger(e.nativeEvent)) return
    if (s.demo || !s.armed || (s.busy && !s.ended)) return ping(e)
    if (s.ended || s.placed[i]) return
    dragRef.current = { pid: e.pointerId, id: i, sx: e.clientX, sy: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 有些瀏覽器拿不到 */
    }
  }
  const moveItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pid !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_PX) return
    if (st.current.busy || st.current.ended) {
      dragRef.current = null
      setDrag(null)
      return
    }
    d.moved = true
    idle.poke()
    const p = at(e)
    setDrag({ id: d.id, x: p.x, y: p.y })
  }
  const upItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pid !== e.pointerId) return
    dragRef.current = null
    if (!d.moved) {
      // 點一下：拿起來（再點影子就放上去），念它的名字；再點一次放下
      sfx.tap()
      idle.poke()
      const up = st.current.lifted === d.id ? null : d.id
      setLift(up)
      if (up != null) {
        flow.cut()
        void say(nameKey(items[up]))
      }
      return
    }
    dropAt(d.id, at(e))
  }
  const cancelItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pid !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
  }

  // ── 影子：手上拿著一個時點影子＝放上去 ──
  const downShadow = (e: ReactPointerEvent<HTMLDivElement>, j: number) => {
    const s = st.current
    if (!firstFinger(e.nativeEvent)) return
    if (s.demo || !s.armed || s.busy || s.ended || s.placed[j]) return ping(e)
    // 手上沒有：「先拿一個」（看這裡的圈圈，不算錯）
    if (s.lifted == null) return ping(e)
    void tryPlace(s.lifted, j)
  }

  const g = geo
  const handSize = g ? `${Math.round(Math.min(110, Math.max(70, g.h * 0.14)))}px` : '90px'
  return (
    <div
      className={`sh${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}`}
      data-logic-game="shadow"
      data-level={level}
      data-scene={scene}
      data-items={items.join(',')}
      data-placed={placed.filter(Boolean).length}
      data-flip={flip ? '1' : undefined}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-done={done ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <svg className="sh-scene" viewBox="0 0 960 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <Scene id={scene} />
      </svg>
      <div className="sh-play" ref={area}>
        {g && (
          <>
            <div className="sh-tray" style={{ left: g.board.x, top: g.board.y, width: g.board.w, height: g.board.h }} aria-hidden="true" />
            {items.map((id, j) => {
              const c = g.shadows[j]
              return (
                <div
                  key={`s${j}`}
                  className={`sh-shadow${glow === j && !placed[j] ? ' is-glow' : ''}${placed[j] ? ' is-filled' : ''}`}
                  data-shadow={j}
                  data-pic={id}
                  role="button"
                  aria-label={`第 ${j + 1} 個影子`}
                  style={{ left: c.x - g.s / 2, top: c.y - g.s / 2, width: g.s, height: g.s }}
                  onPointerDown={(e) => downShadow(e, j)}
                >
                  <div className="sh-spot" />
                  <MatchIcon id={id} shadow flip={flip} />
                </div>
              )
            })}
            {items.map((id, i) => {
              const isDrag = drag?.id === i
              const c = placed[i] ? g.shadows[i] : isDrag ? { x: drag.x, y: drag.y } : g.tray[tray.indexOf(i)]
              const scale = placed[i] || isDrag ? 1 : (g.traySize / g.s) * (lifted === i ? 1.08 : 1)
              return (
                <motion.div
                  key={`i${i}`}
                  className={`sh-item${placed[i] ? ' is-placed' : ''}${lifted === i ? ' is-lifted' : ''}${isDrag ? ' is-drag' : ''}`}
                  data-item={i}
                  data-pic={id}
                  data-home={placed[i] ? 'shadow' : 'tray'}
                  data-tray={tray.indexOf(i)}
                  role="button"
                  aria-label={id}
                  style={{ width: g.s, height: g.s }}
                  initial={false}
                  animate={{ x: c.x - g.s / 2, y: c.y - g.s / 2, scale }}
                  transition={isDrag ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
                  onPointerDown={(e) => downItem(e, i)}
                  onPointerMove={moveItem}
                  onPointerUp={upItem}
                  onPointerCancel={cancelItem}
                >
                  <MatchIcon id={id} flip={placed[i] && flip} />
                </motion.div>
              )
            })}
          </>
        )}
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size={handSize} cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<ShadowPickArt />} againLabel="再一局" line="sh.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
