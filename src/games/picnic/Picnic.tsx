import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../NotYet'
import { useFlow } from '../barge'
import { useIdle } from '../idle'
import { wait } from '../lines'
import { DoneChoices } from '../draw/DoneChoices'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useLive } from '../logic/kit'
import { Basket, Bell, Cloth, Critter, Food, PicnicPickArt, PicnicPlace, Plate } from './art'
import { PICNIC_COPLAY } from './coplay'
import { askKey, numKey } from './lines'
import { PICNIC_GAME, PICNIC_LEVELS, fixMoves, judge, makePicnic, picnicSkill, rememberPicnic, stepPicnic, trayJitter, type Picnic as PicnicRound, type PicnicState } from './plan'
import { loadPicnic, savePicnic } from './progress'
import { onPlate, picnicGeo, plateSpots, type Pt } from './geometry'
import '../draw/tools.css'
import './picnic.css'

/** 新的客人剛坐下這麼久內點不算（上一個連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 拖過這麼遠才算在拖（不然是點一下） */
const DRAG_PX = 14

/**
 * 小熊野餐（T-160，指引 MA-2 照數量拿東西）：小動物坐在盤子後面說「I want three apples!」（對話框裡也畫一個蘋果和 3），
 * 孩子從籃子把食物拖到盤子上，或點一下就放上去（TOUCH-2）；每放一個，牠就數一聲（One! Two! Three!）。盤子上的點一下拿回籃子。
 * 孩子自己決定什麼時候停，按鈴鐺「給你」：牠點著盤子上的一個一個數一遍——
 * - 剛好：「Three! Thank you!」（最後數到的數就是有幾個），吃掉，換下一個客人。
 * - 太多、太少：一起數完以後說「Too many! I want three.」「More, please! I want three.」，讓他補或拿回來。不說錯、不扣分（FB-5）。
 *   第 2 次：多的那幾個（或籃子裡該補的）亮起來；第 3 次：手幫他拿好，再一起數一遍（記成手帶著做）。
 * 第一次到這一級：多一個客人，手先示範（拿 2 個、按鈴）。發呆：15 秒再說一次要什麼、30 秒手指著下一步。
 * 一次野餐 3 個客人，吃完停在「再野餐一次／回首頁」（HOW-9，不自動接下一個）。
 */
export function Picnic() {
  const [round, setRound] = useState<PicnicRound | null>(null)
  const prog = useRef<PicnicState | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  const start = (p: PicnicState) => {
    const r = makePicnic(p)
    prog.current = rememberPicnic(p, r)
    void savePicnic(prog.current)
    setRound(r)
  }
  useEffect(() => {
    let on = true
    void loadPicnic().then((p) => {
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
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? PICNIC_COPLAY.now : PICNIC_COPLAY.play}>
      {round && <PicnicView key={n} round={round} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { x: number; y: number; tap: number } | null

function PicnicView({ round, prog, onDone, onAgain, resting }: { round: PicnicRound; prog: { current: PicnicState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level, guests } = round
  const nTray = PICNIC_LEVELS[level].tray
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
  const geo = picnicGeo(size.w, size.h, nTray)
  const geoRef = useRef(geo)
  geoRef.current = geo

  const [gi, setGi] = useState(0)
  const guest = guests[gi]
  const [jitter, setJitter] = useState(() => trayJitter(level, nTray))
  /** 盤子上的（放的順序） */
  const [plate, setPlate] = useState<number[]>([])
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null)
  /** 一起數的時候數到第幾個（盤子上的位置） */
  const [counting, setCounting] = useState<number | null>(null)
  const [glow, setGlow] = useState<number[]>([])
  const [bellGlow, setBellGlow] = useState(false)
  const [ring, setRing] = useState(0)
  const [eaten, setEaten] = useState(false)
  const [hop, setHop] = useState(0)
  const [seated, setSeated] = useState(true)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)

  const st = useRef({
    gi: 0,
    busy: true,
    demo: false,
    armed: false,
    ended: false,
    plate: [] as number[],
    tries: 0,
    led: false,
    shown: false,
    praised: false,
    taps: [] as { pick: string; ms: number }[],
    given: [] as number[],
    t0: 0,
  })
  const dragRef = useRef<{ pid: number; id: number; sx: number; sy: number; moved: boolean } | null>(null)
  const g = () => guests[st.current.gi]

  const setPlateNow = (p: number[]) => {
    st.current.plate = p
    setPlate(p)
  }
  /** 籃子裡還在的（籃子的順序） */
  const trayLeft = () => Array.from({ length: nTray }, (_, i) => i).filter((i) => !st.current.plate.includes(i))

  // ── 位置 ──
  const itemCenter = (i: number, gg = geoRef.current): Pt => {
    if (!gg) return { x: 0, y: 0 }
    const k = st.current.plate.indexOf(i)
    if (k >= 0) return plateSpots(gg, st.current.plate.length).pts[k]
    const t = gg.tray[i]
    const j = jitter[i] ?? { dx: 0, dy: 0 }
    return { x: t.x + j.dx * gg.item * 0.1, y: t.y + j.dy * gg.item * 0.14 }
  }
  const pct = (p: Pt, dy = 0) => {
    const gg = geoRef.current
    return gg ? { x: (p.x / gg.w) * 100, y: ((p.y + dy) / gg.h) * 100 } : { x: 50, y: 50 }
  }
  const showHand = (p: Pt, tapIt: boolean) => setHand((h) => ({ ...pct(p, (geoRef.current?.item ?? 80) * 0.1), tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0) }))
  const bellCenter = (): Pt => {
    const gg = geoRef.current
    return gg ? { x: gg.bell.x + gg.bell.w / 2, y: gg.bell.y + gg.bell.h * 0.45 } : { x: 0, y: 0 }
  }

  // ── 發呆 ──
  const startIdle = () => {
    setTurn(true)
    idle.start({
      repeat: () => {
        const s = st.current
        void say(s.plate.length === g().want ? 'pn.bell' : askKey(g().food.icon, g().want))
      },
      hint: () => {
        // 發呆：手指著下一步（籃子裡的下一個、鈴鐺、盤子上多的那一個），不說話；之後算手帶著做
        const s = st.current
        if (s.busy || s.ended) return
        s.led = true
        const want = g().want
        if (s.plate.length < want) {
          const i = trayLeft()[0]
          if (i == null) return
          setGlow([i])
          showHand(itemCenter(i), true)
        } else if (s.plate.length === want) {
          setBellGlow(true)
          showHand(bellCenter(), true)
        } else {
          const i = s.plate[s.plate.length - 1]
          setGlow([i])
          showHand(itemCenter(i), true)
        }
      },
    })
  }

  // ── 放上去、拿回來 ──
  const put = (i: number, byHand = false) => {
    const s = st.current
    if (s.plate.includes(i)) return
    setPlateNow([...s.plate, i])
    setGlow((gl) => gl.filter((x) => x !== i))
    setBellGlow(false)
    sfx.pop()
    if (!byHand) {
      s.taps.push({ pick: `+${i}`, ms: Math.round(performance.now() - s.t0) })
      setHand(null)
      // 搶在客人說完之前就放的：從這一下開始計時發呆
      startIdle()
      // 牠數一聲；連著放很快的時候，前一聲停掉只念最新的數
      flow.cut()
      void say(numKey(s.plate.length))
    }
  }
  const takeBack = (i: number, byHand = false) => {
    const s = st.current
    if (!s.plate.includes(i)) return
    setPlateNow(s.plate.filter((x) => x !== i))
    setGlow((gl) => gl.filter((x) => x !== i))
    sfx.tap()
    if (!byHand) {
      s.taps.push({ pick: `-${i}`, ms: Math.round(performance.now() - s.t0) })
      setHand(null)
      startIdle()
      flow.cut()
    }
  }

  /** 牠點著盤子上的一個一個數一遍（不能搶：擋板開著） */
  const countTogether = async (ok: () => boolean) => {
    const p = st.current.plate
    for (let k = 0; k < p.length; k++) {
      setCounting(k)
      await say(numKey(k + 1))
      if (!ok()) return false
    }
    setCounting(null)
    return true
  }

  /** 手把一個東西從籃子拿到盤子（或從盤子拿回籃子） */
  const handMove = async (i: number, to: 'plate' | 'tray', ok: () => boolean) => {
    showHand(itemCenter(i), false)
    await wait(600)
    if (!ok()) return false
    showHand(itemCenter(i), true)
    await wait(300)
    if (!ok()) return false
    if (to === 'plate') put(i, true)
    else takeBack(i, true)
    await wait(80)
    showHand(itemCenter(i), false)
    await wait(520)
    return ok()
  }

  const record = () => {
    const s = st.current
    const gu = g()
    const phase = s.led || s.shown ? 'guided' : 'quiz'
    const first = s.tries === 0 && !s.shown && !s.led
    void logAttempt({
      station: 'logic',
      game: PICNIC_GAME,
      itemId: `picnic:${gu.food.icon}:${gu.want}`,
      skill: picnicSkill(level),
      phase,
      level,
      options: Array.from({ length: nTray }, (_, i) => String(i + 1)),
      answer: String(gu.want),
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.tries + 1,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.tries >= 2 || s.led || s.shown,
      heard: true,
      metrics: { want: gu.want, tries: s.tries, given: s.given[0] ?? 0, ...(s.led ? { led: 1 } : {}), ...(s.shown ? { shown: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = stepPicnic(p, { date: today(), first, counted: phase === 'quiz' })
      void savePicnic(prog.current)
    }
  }

  /** 換下一個客人坐下來、說要什麼 */
  const nextGuest = async (k: number) => {
    const s = st.current
    setSeated(false)
    await wait(380)
    if (!live.current) return
    s.gi = k
    s.plate = []
    s.tries = 0
    s.led = false
    s.shown = false
    s.taps = []
    s.given = []
    setPlate([])
    setEaten(false)
    setGlow([])
    setBellGlow(false)
    setCounting(null)
    setJitter(trayJitter(level, nTray))
    setGi(k)
    setSeated(true)
    await wait(420)
    if (!live.current) return
    if (round.demo && k === 0) return void runDemo()
    s.t0 = performance.now()
    s.busy = false
    s.armed = false
    window.setTimeout(() => {
      s.armed = true
      setHold(false)
    }, ARM_MS)
    const ok = flow.begin(live)
    await say(askKey(guests[k].food.icon, guests[k].want))
    // 被搶掉（他已經在放了）：放的那一下會自己開始計時發呆
    if (!ok() || s.ended || s.busy) return
    startIdle()
  }

  /** 剛好：謝謝、吃掉，換下一個客人（或野餐結束） */
  const thanks = async (ok: () => boolean, counted: boolean) => {
    const s = st.current
    const gu = g()
    setCounting(null)
    setGlow([])
    setBellGlow(false)
    setHand(null)
    sfx.correct()
    setHop((h) => h + 1)
    await say(`pn.got.${gu.want}`)
    if (!ok()) return
    setEaten(true)
    if (counted) record()
    await wait(650)
    if (!ok()) return
    if (s.gi + 1 < guests.length) return nextGuest(s.gi + 1)
    // 野餐結束
    s.ended = true
    setDone(true)
    setTurn(false)
    sfx.done()
    await wait(300)
    if (!ok()) return
    await say('pn.praise')
    if (!ok()) return
    // 時間到了：吃完這一次才去睡覺（TIME-2）
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 按鈴鐺：一起數一遍，看剛好、太多、太少 */
  const ringBell = async () => {
    const s = st.current
    const gu = g()
    s.busy = true
    idle.stop()
    setTurn(false)
    setHand(null)
    setBellGlow(false)
    flow.cut()
    setRing((r) => r + 1)
    sfx.star()
    const v = judge(s.plate.length, gu.want)
    s.taps.push({ pick: `bell:${s.plate.length}`, ms: Math.round(performance.now() - s.t0) })
    const ok = flow.begin(live)
    if (v === 'empty') {
      // 盤子還是空的：再說一次要什麼（不算給錯）
      await say(askKey(gu.food.icon, gu.want))
      if (!ok()) return
      s.busy = false
      startIdle()
      return
    }
    s.given.push(s.plate.length)
    setHold(true)
    await wait(250)
    if (!ok()) return
    if (!(await countTogether(ok))) return
    if (v === 'ok') return thanks(ok, true)
    s.tries++
    await say(v === 'over' ? `pn.over.${gu.want}` : `pn.under.${gu.want}`)
    if (!ok()) return
    if (s.tries >= 3) {
      // 第 3 次：手幫他拿好，再一起數一遍
      s.shown = true
      const m = fixMoves(s.plate, trayLeft(), gu.want)
      for (const i of m.back) if (!(await handMove(i, 'tray', ok))) return
      for (const i of m.add) if (!(await handMove(i, 'plate', ok))) return
      showHand(bellCenter(), true)
      sfx.star()
      setRing((r) => r + 1)
      await wait(400)
      if (!ok()) return
      if (!(await countTogether(ok))) return
      return thanks(ok, true)
    }
    if (s.tries === 2) {
      // 第 2 次：多的那幾個（或籃子裡要補的）亮起來
      if (v === 'over') {
        setGlow(s.plate.slice(gu.want))
        await say('pn.back')
        if (!ok()) return
      } else setGlow(trayLeft().slice(0, gu.want - s.plate.length))
    }
    setHold(false)
    s.busy = false
    startIdle()
  }

  /** 第一次到這一級：手示範（拿 2 個、一個一個數、按鈴） */
  const runDemo = async () => {
    const s = st.current
    const ok = flow.begin(live)
    const gu = g()
    s.demo = true
    s.busy = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say(askKey(gu.food.icon, gu.want))
    if (!ok()) return
    await say('teach.watch.dodo')
    if (!ok()) return
    for (let k = 0; k < gu.want; k++) {
      if (!(await handMove(trayLeft()[0], 'plate', ok))) return
      await say(numKey(k + 1))
      if (!ok()) return
    }
    showHand(bellCenter(), false)
    await wait(600)
    if (!ok()) return
    showHand(bellCenter(), true)
    setRing((r) => r + 1)
    sfx.star()
    await wait(300)
    if (!ok()) return
    if (!(await countTogether(ok))) return
    void logTeach({ station: 'logic', game: PICNIC_GAME, itemId: `picnic:${gu.food.icon}:${gu.want}`, skill: picnicSkill(level), level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void savePicnic(prog.current)
    }
    setHand(null)
    sfx.correct()
    setHop((h) => h + 1)
    await say(`pn.got.${gu.want}`)
    if (!ok()) return
    setEaten(true)
    await say('teach.turn.dodo')
    if (!ok()) return
    s.demo = false
    setDemo(false)
    return nextGuest(1)
  }

  useEffect(() => {
    // 延到下一輪才開始：StrictMode 開發模式會掛載兩次
    const t = window.setTimeout(() => {
      void (async () => {
        const ok = flow.begin(live)
        await say('pn.intro')
        if (!ok()) return
        void nextGuest(0)
      })()
    }, 0)
    return () => {
      clearTimeout(t)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const at = (e: { clientX: number; clientY: number }) => (area.current ? localPoint(area.current, e.clientX, e.clientY) : { x: 0, y: 0 })
  const ping = (e: { clientX: number; clientY: number }) => {
    const p = at(e)
    notYet.ping(p.x, p.y)
  }
  const canAct = () => {
    const s = st.current
    return !s.demo && s.armed && !s.busy && !s.ended
  }

  // ── 食物：點一下放上去（盤子上的點一下拿回來）、拖到盤子上 ──
  const downItem = (e: ReactPointerEvent<HTMLDivElement>, i: number) => {
    if (!firstFinger(e.nativeEvent) || dragRef.current) return
    if (!canAct()) return ping(e)
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
    if (!canAct()) {
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
    setDrag(null)
    if (!canAct()) return
    const on = st.current.plate.includes(d.id)
    if (!d.moved) return on ? takeBack(d.id) : put(d.id)
    // 拖著放手：放在盤子上就放上去；從盤子拖出去就拿回籃子；其他地方回原位、不算
    const gg = geoRef.current
    const over = !!gg && onPlate(gg, at(e))
    if (over && !on) put(d.id)
    else if (!over && on) takeBack(d.id)
  }
  const cancelItem = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pid !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
  }

  const downBell = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!firstFinger(e.nativeEvent)) return
    if (!canAct()) return ping(e)
    void ringBell()
  }

  const gg = geo
  const spots = gg ? plateSpots(gg, plate.length) : null
  const handSize = gg ? `${Math.round(Math.min(110, Math.max(64, gg.h * 0.13)))}px` : '90px'
  return (
    <div
      className={`pn${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}`}
      data-logic-game="picnic"
      data-level={level}
      data-guest={guest.who}
      data-food={guest.food.icon}
      data-want={guest.want}
      data-plate={plate.length}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-done={done ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="pn-play" ref={area}>
        <PicnicPlace id={round.place} />
        {gg && (
          <>
            <div className="pn-cloth-at" style={{ left: gg.w * 0.015, top: Math.min(gg.basket.y, gg.plate.y) - gg.h * 0.04, width: gg.w * 0.97, height: gg.h - (Math.min(gg.basket.y, gg.plate.y) - gg.h * 0.04) - gg.h * 0.02 }}>
              <Cloth id={round.cloth} />
            </div>
            {/* 客人：坐在盤子後面，轉過來看著籃子 */}
            <AnimatePresence>
              {seated && (
                <motion.div
                  key={`${gi}`}
                  className="pn-guest"
                  data-who={guest.who}
                  style={{ left: gg.guest.x, top: gg.guest.y, width: gg.guest.w, height: gg.guest.h }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.3 } }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <motion.div key={hop} className="pn-guest-in" animate={hop ? { y: [0, -16, 0, -8, 0] } : {}} transition={{ duration: 0.8, ease: 'easeOut' }}>
                    <Critter who={guest.who} flip={!gg.portrait} />
                  </motion.div>
                  {/* 對話框：要的東西和數字（靜音也看得懂要什麼，LANG-3） */}
                  {!eaten && (
                    <div className="pn-bubble" data-bubble="">
                      <span className="pn-bubble-food">
                        <Food icon={guest.food.icon} />
                      </span>
                      <span className="pn-bubble-n">{guest.want}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="pn-basket" style={{ left: gg.basket.x, top: gg.basket.y, width: gg.basket.w, height: gg.basket.h }} aria-hidden="true">
              <Basket id={round.basket} />
            </div>
            <div className="pn-plate" data-plate-box="" style={{ left: gg.plate.x, top: gg.plate.y, width: gg.plate.w, height: gg.plate.h }} aria-hidden="true">
              <Plate id={round.plate} />
            </div>
            <motion.button
              key={`bell${ring}`}
              type="button"
              className={`pn-bell${bellGlow ? ' is-glow' : ''}`}
              data-bell=""
              aria-label="給你"
              style={{ left: gg.bell.x, top: gg.bell.y, width: gg.bell.w, height: gg.bell.h }}
              animate={ring ? { scale: [1, 0.9, 1.04, 1] } : {}}
              transition={{ duration: 0.4 }}
              onPointerDown={downBell}
            >
              <Bell />
            </motion.button>
            {Array.from({ length: nTray }, (_, i) => {
              const k = plate.indexOf(i)
              const onP = k >= 0
              const isDrag = drag?.id === i
              const c = isDrag ? { x: drag.x, y: drag.y } : onP && spots ? spots.pts[k] : itemCenter(i, gg)
              const sz = onP && spots && !isDrag ? spots.size : gg.item
              const gone = onP && eaten
              const target = gone ? { x: gg.guest.x + gg.guest.w / 2, y: gg.guest.y + gg.guest.h * 0.45 } : c
              return (
                <motion.div
                  key={`${gi}-${i}`}
                  className={`pn-food${onP ? ' is-on' : ''}${isDrag ? ' is-drag' : ''}${glow.includes(i) ? ' is-glow' : ''}${onP && counting === k ? ' is-count' : ''}`}
                  data-food-item={i}
                  data-home={onP ? 'plate' : 'tray'}
                  role="button"
                  aria-label={onP ? `盤子上第 ${k + 1} 個` : `籃子裡第 ${i + 1} 個`}
                  style={{ width: gg.item, height: gg.item }}
                  initial={{ x: c.x - gg.item / 2, y: c.y - gg.item / 2, scale: sz / gg.item, opacity: 0 }}
                  animate={{ x: target.x - gg.item / 2, y: target.y - gg.item / 2, scale: gone ? 0.3 : (sz / gg.item) * (onP && counting === k ? 1.12 : 1), opacity: gone ? 0 : 1 }}
                  transition={isDrag ? { duration: 0 } : gone ? { duration: 0.5, ease: 'easeIn' } : { type: 'spring', stiffness: 360, damping: 32 }}
                  onPointerDown={(e) => downItem(e, i)}
                  onPointerMove={moveItem}
                  onPointerUp={upItem}
                  onPointerCancel={cancelItem}
                >
                  <Food icon={guest.food.icon} />
                </motion.div>
              )
            })}
          </>
        )}
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size={handSize} cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<PicnicPickArt />} againLabel="再野餐一次" line="pn.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
