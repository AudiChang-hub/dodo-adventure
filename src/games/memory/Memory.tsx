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
import { useLive } from '../logic/kit'
import { MatchIcon, useMatchIcons } from '../match/Icon'
import { nameKey } from '../match/lines'
import { MemoryPickArt } from './art'
import { CardBack } from './backs'
import { MEMORY_COPLAY } from './coplay'
import { MEMORY_GAME, afterMemory, memoryRound, memorySkill, okSlips, type MemoryLevel, type MemoryRound, type MemoryState } from './plan'
import { loadMemory, saveMemory } from './progress'
import { flipFlow } from './turn'
import '../draw/tools.css'
import './memory.css'

/** 新的一局剛出來這麼久內點不算（上一個連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 兩張不一樣：翻開停多久再蓋回去（讓他看清楚、記住位置） */
const SHOW_MS = 1300
/** 蓋回去的淡出多久（慢慢蓋回去） */
const COVER_MS = 450
/** 剛配成一對：輕輕放大一下（≤ 5%，一次就停，MOTION-1） */
const POP = { scale: [1, 1.04, 1] }
const REST = { scale: 1 }

/**
 * 翻翻牌找一樣的（T-160）：牌蓋著排好，點一張翻開（念它的英文名字），再點一張：
 * - 一樣：兩張配成一對、留在上面（淡淡的綠框）。第一次配成一對說「You found a pair!」（FB-3）。
 * - 不一樣：停 1.3 秒再慢慢蓋回去（淡出，不旋轉，MOTION-1）。這段時間點別的牌只有「看這裡」的圈圈（第三張要等前兩張蓋回去，連點也不會亂）。
 * 記錯（翻開第一張時它的另一半之前看過了，第二張卻翻錯）：同一對第 2 次之後，翻開它時另一半亮起來「It was here!」；第 3 次手指著另一半（記一起做）。
 * 第一次玩：手先示範翻一對。發呆：15 秒再說一次、30 秒手點一張（翻開了一張的話，手指它的另一半）。
 * 全部翻完：念「You found them all!」，停在「再一局／回首頁」（HOW-9）。
 */
export function Memory() {
  const ready = useMatchIcons()
  const [round, setRound] = useState<MemoryRound | null>(null)
  const prog = useRef<MemoryState | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  useEffect(() => {
    if (!ready) return
    let on = true
    void loadMemory().then((p) => {
      if (!on || prog.current) return
      prog.current = p
      setRound(memoryRound(p.level as MemoryLevel, p))
    })
    return () => {
      on = false
    }
  }, [ready])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setRound(memoryRound(p.level as MemoryLevel, p))
    setN((k) => k + 1)
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? MEMORY_COPLAY.now : MEMORY_COPLAY.play}>
      {round && prog.current && <MemoryView key={n} round={round} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { x: number; y: number; tap: number } | null

function MemoryView({ round, prog, onDone, onAgain, resting }: { round: MemoryRound; prog: { current: MemoryState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level, cards, back } = round
  const total = cards.length
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

  const [open, setOpen] = useState<number[]>([])
  const [matched, setMatched] = useState<boolean[]>(() => Array(total).fill(false))
  const [glow, setGlow] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  /** 剛配成一對的兩張：輕輕放大一下（一次就停） */
  const [paired, setPaired] = useState<number[]>([])

  const st = useRef({
    busy: true,
    demo: false,
    armed: false,
    ended: false,
    /** 兩張不一樣、正在等蓋回去 */
    hold: false,
    open: [] as number[],
    matched: Array<boolean>(total).fill(false),
    seen: new Set<number>(),
    /** 翻開第一張時，它的另一半看過了沒 */
    knew: false,
    flips: 0,
    turns: 0,
    slips: 0,
    /** 每一對記錯幾次（key 是圖） */
    per: {} as Record<string, number>,
    /** 自己配成幾對 */
    pairs: 0,
    led: false,
    shown: false,
    demoed: false,
    taps: [] as { pick: string; ms: number }[],
    t0: 0,
  })

  const taught = () => prog.current?.taught.includes(1) ?? true
  const [firstTime] = useState(() => !taught())

  // ── 版面：牌的大小、位置（作答區的像素） ──
  // 直的螢幕（手機直式）：牌改排成 2 欄（12 張 3 欄），不會擠成一條
  const tall = size.h > size.w
  const cols = tall ? (total > 10 ? 3 : 2) : round.cols
  const rows = Math.ceil(total / cols)
  // 牌外面有一圈白框（7 px）：間隔至少 20 px，兩張的框不會黏在一起
  const gap = Math.max(20, Math.min(30, size.w * 0.022))
  const ratio = 0.78
  const cw = Math.max(0, Math.min((size.w - gap * (cols + 1)) / cols, ((size.h - gap * (rows + 1)) / rows) * ratio))
  const ch = cw / ratio
  const gx = (size.w - (cols * cw + (cols - 1) * gap)) / 2
  const gy = (size.h - (rows * ch + (rows - 1) * gap)) / 2
  const geo = useRef({ cw, ch, gx, gy, gap, w: size.w, h: size.h })
  geo.current = { cw, ch, gx, gy, gap, w: size.w, h: size.h }
  const center = (i: number) => {
    const g = geo.current
    return { x: g.gx + (i % cols) * (g.cw + g.gap) + g.cw / 2, y: g.gy + Math.floor(i / cols) * (g.ch + g.gap) + g.ch / 2 }
  }
  const pct = (p: { x: number; y: number }) => {
    const g = geo.current
    return g.w && g.h ? { x: (p.x / g.w) * 100, y: (p.y / g.h) * 100 } : { x: 50, y: 50 }
  }
  const showHand = (i: number, tapIt: boolean) => setHand((h) => ({ ...pct(center(i)), tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0) }))

  const partnerOf = (i: number) => cards.findIndex((c, k) => k !== i && c === cards[i])
  const setOpenBoth = (o: number[]) => {
    st.current.open = o
    setOpen(o)
  }

  const startIdle = () => {
    setTurn(true)
    idle.start({
      repeat: () => void say('mm.intro'),
      hint: () => {
        // 發呆：手點一張（翻開了一張：指它的另一半，那一張亮起來）；之後的這一局記成一起做
        const s = st.current
        if (s.hold || s.ended) return
        s.led = true
        if (s.open.length === 1) {
          const p = partnerOf(s.open[0])
          setGlow(p)
          return showHand(p, true)
        }
        // 兩張都看過、還沒配的那一對優先；不然第一張還蓋著的
        const known = cards.findIndex((_, k) => !s.matched[k] && s.seen.has(k) && s.seen.has(partnerOf(k)))
        const i = known >= 0 ? known : cards.findIndex((_, k) => !s.matched[k])
        if (i >= 0) showHand(i, true)
      },
    })
  }

  const record = () => {
    const s = st.current
    const phase = s.demoed || s.led || s.shown ? 'guided' : 'quiz'
    const first = s.slips <= okSlips(level) && !s.shown
    void logAttempt({
      station: 'logic',
      game: MEMORY_GAME,
      itemId: `memory:${round.theme}`,
      skill: memorySkill(level),
      phase,
      level,
      options: [...new Set(cards)],
      answer: round.theme,
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.turns,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.led || s.shown || Object.values(s.per).some((v) => v >= 2),
      heard: true,
      metrics: { cards: total, flips: s.flips, turns: s.turns, slips: s.slips, ...(s.led ? { led: 1 } : {}), ...(s.shown ? { shown: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = afterMemory(p, { round, date: today(), slips: s.slips, shown: s.shown, counted: phase === 'quiz' })
      void saveMemory(prog.current)
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
    await wait(700)
    if (!ok()) return
    await say('mm.done')
    if (!ok()) return
    // 時間到了：玩完這一局才去睡覺（TIME-2）
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 翻開一張（孩子點的、示範的手點的） */
  const flip = (i: number, by: 'kid' | 'hand') => {
    const s = st.current
    s.flips++
    s.seen.add(i)
    const o = [...s.open, i]
    setOpenBoth(o)
    sfx.tap()
    const ok = flipFlow(flow, live, by)
    void say(nameKey(cards[i]))
    if (o.length === 1) {
      const p = partnerOf(i)
      s.knew = s.seen.has(p)
      setGlow(null)
      setHand(null)
      if (by === 'kid' && s.knew) {
        // 這一對已經記錯過：第 2 次起另一半亮起來，第 3 次起手指著它
        const miss = s.per[cards[i]] ?? 0
        if (miss >= 2) setGlow(p)
        if (miss >= 3) {
          s.shown = true
          showHand(p, true)
        }
      }
      return
    }
    // 第二張
    s.turns++
    const [a, b] = o
    if (cards[a] === cards[b]) {
      s.matched = s.matched.map((v, k) => v || k === a || k === b)
      setMatched(s.matched)
      setOpenBoth([])
      setGlow(null)
      setHand(null)
      setPaired([a, b])
      sfx.pop()
      if (by === 'kid') s.pairs++
      if (s.matched.every(Boolean)) return void finish()
      // 過程讚美（FB-3）：自己配成的第一對（示範的那一對不算）
      if (s.pairs === 1 && by === 'kid')
        void wait(650).then(() => {
          if (ok()) void say('mm.pair')
        })
      return
    }
    // 不一樣：停一下再慢慢蓋回去
    if (s.knew) {
      s.slips++
      s.per[cards[a]] = (s.per[cards[a]] ?? 0) + 1
    }
    s.hold = true
    setHold(true)
    void (async () => {
      await wait(SHOW_MS)
      if (!live.current) return
      setOpenBoth([])
      // 記錯第 2 次：馬上告訴他另一半在哪裡（亮一下，下一次翻開這一張時也會亮）
      if (s.knew && s.per[cards[a]] === 2) {
        setGlow(partnerOf(a))
        void say('mm.here')
      } else setGlow(null)
      await wait(COVER_MS)
      if (!live.current) return
      s.hold = false
      setHold(false)
    })()
  }

  /** 第一次玩：手示範翻一對 */
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
    const a = 0
    const b = partnerOf(a)
    for (const i of [a, b]) {
      showHand(i, false)
      await wait(700)
      if (!ok()) return
      showHand(i, true)
      flip(i, 'hand')
      await wait(1100)
      if (!ok()) return
    }
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    setHand(null)
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: MEMORY_GAME, itemId: `memory:${round.theme}`, skill: memorySkill(level), level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(1)) {
      prog.current = { ...p, taught: [...p.taught, 1] }
      void saveMemory(prog.current)
    }
    s.demo = false
    s.busy = false
    s.armed = true
    setDemo(false)
    setHold(false)
    startIdle()
  }

  useEffect(() => {
    // 延到下一輪才開始：StrictMode 開發模式會掛載兩次
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
        await say('mm.intro')
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

  const downCard = (e: ReactPointerEvent<HTMLDivElement>, i: number) => {
    const s = st.current
    if (!firstFinger(e.nativeEvent)) return
    // 示範中、剛出來、兩張不一樣正在蓋回去：只有「看這裡」的圈圈（TOUCH-6）
    if (s.demo || !s.armed || s.hold || (s.busy && !s.ended)) return ping(e)
    if (s.ended || s.matched[i] || s.open.includes(i)) return
    s.taps.push({ pick: `${i}:${cards[i]}`, ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    flip(i, 'kid')
  }

  const showing = (i: number) => matched[i] || open.includes(i)
  return (
    <div
      className={`mm${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}`}
      data-logic-game="memory"
      data-level={level}
      data-theme={round.theme}
      data-cards={total}
      data-matched={matched.filter(Boolean).length}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      data-hold={hold ? '1' : undefined}
      data-done={done ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="mm-play" ref={area}>
        {cw > 0 &&
          cards.map((pic, i) => {
            const c = center(i)
            return (
              <motion.div
                key={i}
                className={`mm-card${showing(i) ? ' is-open' : ''}${matched[i] ? ' is-matched' : ''}${glow === i && !showing(i) ? ' is-glow' : ''}`}
                data-card={i}
                data-pic={pic}
                data-state={matched[i] ? 'matched' : open.includes(i) ? 'open' : 'closed'}
                role="button"
                aria-label={`第 ${i + 1} 張牌`}
                style={{ left: c.x - cw / 2, top: c.y - ch / 2, width: cw, height: ch }}
                animate={paired.includes(i) ? POP : REST}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                onPointerDown={(e) => downCard(e, i)}
              >
                <div className="mm-back">
                  <CardBack i={back} />
                </div>
                <motion.div className="mm-face" initial={false} animate={{ opacity: showing(i) ? 1 : 0, scale: showing(i) ? 1 : 0.96 }} transition={{ duration: showing(i) ? 0.22 : COVER_MS / 1000, ease: 'easeOut' }}>
                  <div className="mm-pic">{showing(i) && <MatchIcon id={pic} />}</div>
                </motion.div>
              </motion.div>
            )
          })}
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size={`${Math.round(Math.min(110, Math.max(70, size.h * 0.13)))}px`} cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={demo && !resting} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<MemoryPickArt />} againLabel="再一局" line="mm.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
