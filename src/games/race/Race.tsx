import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, localPoint, useNotYet } from '../NotYet'
import { useFlow } from '../barge'
import { useIdle } from '../idle'
import { wait } from '../lines'
import { DoneChoices } from '../draw/DoneChoices'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { ANSWER_TAP, useTaps } from '../../ui/tap'
import { pointIn, useLive } from '../logic/kit'
import { Backdrop } from '../hide/scene'
import { Emo } from '../hide/emoji'
import { Cell, DieFace, FinishLine, RacePickArt, Runner } from './art'
import { REWARDS, TRACKS } from './data'
import { RACE_COPLAY } from './coplay'
import { gotKey, hopsKey, numKey } from './lines'
import { GOAL, RACE_GAME, RACE_LEVELS, demoRoll, makeRace, raceSkill, raceTap, rollDie, stepRace, type Race as RaceRound, type RaceState } from './plan'
import { loadRace, saveRace } from './progress'
import '../draw/tools.css'
import './race.css'

/** 新的一步剛輪到他這麼久內點不算（上一步連點的手指，TOUCH-4） */
const ARM_MS = 300

// 場景座標（SVG 1100 × 520，置中、等比例）：平板橫向的作答區約 1200 × 558，縮放約 1.07 倍，孩子那一排的格子點的範圍約 94 px 寬（≥ 2 cm，TOUCH-1）
const W = 1100
const H = 520
/** 第 i 格（0 是起點）的中心 x */
const cx = (i: number) => (i === 0 ? 61 : 161 + (i - 1) * 88)
const CELL_W = 82
/** 豆豆的跑道（上面）、孩子的跑道（下面，可以點，比較大） */
const LANE = { dodo: { y: 150, h: 66, feet: 120, tall: 92 }, kid: { y: 352, h: 90, feet: 310, tall: 112 } } as const
const DIE = { x: 550, y: 460, s: 96 }
const GIFT = { x: 1058, y: 252, s: 82 }

type Who = 'kid' | 'dodo'
type Phase = 'intro' | 'roll' | 'rolling' | 'step' | 'busy' | 'end'

/**
 * 恐龍賽跑棋（家長 2026-11-17，指引 MA-3 一一對應、數到 10、SE-2 輪流）：上下兩條 1～10 的數字線，上面是豆豆的、下面是孩子的。
 * 輪到他：點骰子（1～3 點，熟練了 1～6 點），骰子停了說「Two hops!」，他自己點下一格（或點自己的恐龍）一格一格跳，每跳一格念那一格的數字，
 * 骰子上的點同時一顆一顆變黃（走了幾格看得到）。點太前面的格子（跳格）：恐龍原地抖一下、說「One hop at a time!」（不說錯）；
 * 第 2 次下一格亮起來；第 3 次手在下一格上輕輕點（算手帶著走）。走完骰子的點數自動換豆豆。
 * 輪到豆豆：豆豆說「My turn!」，自己擲、自己跳、念數字，他等一下（擋板接住觸碰，只有「看這裡」的圈圈）。
 * 誰先到終點都一起慶祝（不說輸贏），另一隻接著走；兩隻都到了，終點的禮物打開（每次不一樣的驚喜，同一天不重複，FB-6），停在「再玩一次／回首頁」。
 * 第一次到這一級：他的第一步由手示範（點骰子、一格一格點）；示範裡不呼叫會 flow.cut() 的函式（T-163 翻牌卡死的教訓）。
 * 發呆：15 秒再說一次（Roll the dice!／Tap to hop!）、30 秒手點骰子或下一格。
 */
export function Race() {
  const prog = useRef<RaceState | null>(null)
  const [race, setRace] = useState<RaceRound | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  const start = (p: RaceState) => {
    const r = makeRace(p, today())
    prog.current = r.state
    void saveRace(r.state)
    setRace(r.race)
  }
  useEffect(() => {
    let on = true
    void loadRace().then((p) => {
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
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? RACE_COPLAY.now : RACE_COPLAY.play}>
      {race && <RaceView key={n} race={race} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { el: 'die' | number; tap: number; beckon: boolean } | null

function RaceView({ race, prog, onDone, onAgain, resting }: { race: RaceRound; prog: { current: RaceState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level } = race
  const spec = RACE_LEVELS[level]
  const track = TRACKS.find((t) => t.id === race.track) ?? TRACKS[0]
  const reward = REWARDS.find((r) => r.id === race.reward) ?? REWARDS[0]
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const dieEl = useRef<SVGGElement | null>(null)
  const cellEls = useRef(new Map<number, SVGGElement | null>())

  const [pos, setPos] = useState({ kid: 0, dodo: 0 })
  const [who, setWho] = useState<Who>('kid')
  const [phase, setPhase] = useState<Phase>('intro')
  const [die, setDie] = useState({ value: 1, lit: 0 })
  const [spin, setSpin] = useState(0)
  const [glowNext, setGlowNext] = useState(false)
  const [nudge, setNudge] = useState(0)
  const [hop, setHop] = useState({ kid: 0, dodo: 0 })
  const [cheer, setCheer] = useState({ kid: false, dodo: false })
  const [open, setOpen] = useState(false)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [ended, setEnded] = useState(false)
  const [poke, setPoke] = useState(0)

  const st = useRef({
    who: 'kid' as Who,
    phase: 'intro' as Phase,
    pos: { kid: 0, dodo: 0 },
    left: 0,
    lit: 0,
    v: 0,
    from: 0,
    rolls: [] as number[],
    armed: false,
    wrongs: 0,
    led: false,
    guided: false,
    demoDone: false,
    afterDemo: false,
    kidTurns: 0,
    tapLine: true,
    taps: [] as { pick: string; ms: number }[],
    t0: 0,
    lastStep: 0,
    missAt: -Infinity,
    ended: false,
  })
  const armTimer = useRef(0)

  const setPh = (p: Phase) => {
    st.current.phase = p
    setPhase(p)
  }
  const showHand = (el: 'die' | number, tapIt: boolean, beckon = false) => setHand((h) => ({ el, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))
  const nextCell = () => st.current.pos.kid + 1
  const arm = () => {
    st.current.armed = false
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      st.current.armed = true
      if (!st.current.ended && st.current.who === 'kid') setHold(false)
    }, ARM_MS)
  }

  /** 跳一格（畫面、骰子上的點）；回傳跳到第幾格 */
  const moveOne = (w: Who) => {
    const s = st.current
    const p = Math.min(GOAL, s.pos[w] + 1)
    s.pos = { ...s.pos, [w]: p }
    s.lit++
    s.left--
    setPos(s.pos)
    setHop((h) => ({ ...h, [w]: h[w] + 1 }))
    setDie((d) => ({ ...d, lit: s.lit }))
    sfx.pop()
    return p
  }

  /** 擲骰子：翻幾下再停，說「Two hops!」；回傳點數（流程被打斷就回傳 null） */
  const roll = async (ok: () => boolean, forced?: number): Promise<number | null> => {
    const s = st.current
    setPh('rolling')
    const v = forced ?? rollDie(level, s.rolls)
    s.rolls = [...s.rolls, v].slice(-4)
    s.v = v
    s.lit = 0
    sfx.clack()
    for (let k = 0; k < 6; k++) {
      setDie({ value: ((v + k * 2) % spec.die) + 1, lit: 0 })
      setSpin((x) => x + 1)
      await wait(90)
      if (!ok()) return null
    }
    setDie({ value: v, lit: 0 })
    setSpin((x) => x + 1)
    s.from = s.pos[s.who]
    s.left = Math.min(v, GOAL - s.pos[s.who])
    await say(hopsKey(v))
    if (!ok()) return null
    return v
  }

  // ── 發呆 ──
  const startIdle = () => {
    idle.start({
      repeat: () => void say(st.current.phase === 'roll' ? 'rc.roll' : 'rc.tap'),
      hint: () => {
        const s = st.current
        if (s.who !== 'kid' || s.ended) return
        s.led = true
        if (s.phase === 'roll') showHand('die', true)
        else if (s.phase === 'step') {
          setGlowNext(true)
          showHand(nextCell(), true)
        }
      },
    })
  }

  const record = () => {
    const s = st.current
    const phase = s.led || s.guided ? 'guided' : 'quiz'
    const first = s.wrongs === 0 && !s.led
    void logAttempt({
      station: 'logic',
      game: RACE_GAME,
      itemId: `race:${race.track}:${s.from}+${s.v}`,
      skill: raceSkill(level),
      phase,
      level,
      options: Array.from({ length: GOAL }, (_, i) => String(i + 1)),
      answer: String(s.pos.kid),
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led,
      heard: true,
      metrics: { die: s.v, from: s.from, skips: s.wrongs, ...(s.led ? { led: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = stepRace(p, { first, counted: phase === 'quiz' })
      void saveRace(prog.current)
    }
  }

  /** 兩隻都到了：一起慶祝，禮物打開 */
  const finale = async (ok: () => boolean) => {
    const s = st.current
    s.ended = true
    setEnded(true)
    setPh('end')
    setHold(true)
    idle.stop()
    setHand(null)
    setGlowNext(false)
    setCheer({ kid: true, dodo: true })
    setHop((h) => ({ kid: h.kid + 1, dodo: h.dodo + 1 }))
    sfx.done()
    await say('rc.both')
    if (!ok()) return
    await say('rc.open')
    if (!ok()) return
    setOpen(true)
    sfx.star()
    await wait(450)
    if (!ok()) return
    await say(gotKey(reward.id))
    if (!ok()) return
    // 時間到了：玩完這一局才去睡覺（TIME-2）
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 一步走完：到終點了就慶祝一下，換另一隻 */
  const endMove = async (w: Who, ok: () => boolean): Promise<void> => {
    const s = st.current
    const other: Who = w === 'kid' ? 'dodo' : 'kid'
    if (s.pos[w] >= GOAL) {
      setCheer((c) => ({ ...c, [w]: true }))
      setHop((h) => ({ ...h, [w]: h[w] + 1 }))
      if (s.pos[other] >= GOAL) return finale(ok)
      sfx.star()
      await say(w === 'kid' ? 'rc.you' : 'rc.me')
      if (!ok()) return
    } else {
      await wait(350)
      if (!ok()) return
    }
    return other === 'kid' ? kidTurn() : dodoTurn()
  }

  /** 豆豆的回合：自己擲、自己跳（他等一下） */
  const dodoTurn = async (): Promise<void> => {
    const s = st.current
    if (s.ended) return
    if (s.pos.dodo >= GOAL) return kidTurn()
    s.who = 'dodo'
    setWho('dodo')
    setPh('busy')
    setHold(true)
    idle.stop()
    setHand(null)
    setGlowNext(false)
    setDie((d) => ({ ...d, lit: 0 }))
    const ok = flow.begin(live)
    await wait(300)
    if (!ok()) return
    await say('rc.my')
    if (!ok()) return
    const v = await roll(ok)
    if (v == null) return
    setPh('busy')
    while (s.left > 0) {
      await wait(260)
      if (!ok()) return
      const p = moveOne('dodo')
      await say(numKey(p))
      if (!ok()) return
    }
    return endMove('dodo', ok)
  }

  /** 他的第一步由手示範：點骰子、一格一格點。不呼叫 flow.cut()／flow.begin()（示範本身就是一段流程） */
  const runDemo = async () => {
    const s = st.current
    const ok = flow.begin(live)
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    const handTap = async (el: 'die' | number) => {
      showHand(el, false)
      await wait(650)
      if (!ok()) return false
      showHand(el, true)
      await wait(320)
      return ok()
    }
    await say('teach.watch.dodo')
    if (!ok()) return
    if (!(await handTap('die'))) return
    const v = await roll(ok, demoRoll(level))
    if (v == null) return
    setPh('busy')
    while (s.left > 0) {
      if (!(await handTap(nextCell()))) return
      const p = moveOne('kid')
      await say(numKey(p))
      if (!ok()) return
    }
    setHand(null)
    void logTeach({ station: 'logic', game: RACE_GAME, itemId: `race:${race.track}:demo`, skill: raceSkill(level), level, ms: Math.round(performance.now() - t0) })
    const pr = prog.current
    if (pr && !pr.taught.includes(level)) {
      prog.current = { ...pr, taught: [...pr.taught, level] }
      void saveRace(prog.current)
    }
    s.demoDone = true
    s.afterDemo = true
    setDemo(false)
    return endMove('kid', ok)
  }

  /** 他的回合：說「Your turn!」，等他點骰子 */
  const kidTurn = async (): Promise<void> => {
    const s = st.current
    if (s.ended) return
    if (s.pos.kid >= GOAL) return dodoTurn()
    s.who = 'kid'
    setWho('kid')
    setHand(null)
    setGlowNext(false)
    setDie((d) => ({ ...d, lit: 0 }))
    Object.assign(s, { wrongs: 0, missAt: -Infinity, led: false, taps: [], t0: performance.now(), lit: 0 })
    if (race.demo && !s.demoDone) {
      setPh('busy')
      return runDemo()
    }
    // 示範之後的第一步：手在骰子上輕輕點、下一格亮著（一起做）
    s.guided = s.afterDemo
    s.afterDemo = false
    setPh('roll')
    arm()
    const ok = flow.begin(live)
    await say('teach.turn.dodo', ...(s.kidTurns++ === 0 ? ['rc.roll'] : []))
    if (!ok() || s.phase !== 'roll') return
    if (s.guided) showHand('die', false, true)
    startIdle()
  }

  useEffect(() => {
    // 延到下一輪才開始：StrictMode 開發模式會掛載兩次
    const t = window.setTimeout(() => {
      void (async () => {
        const ok = flow.begin(live)
        await say('rc.intro')
        if (!ok()) return
        void kidTurn()
      })()
    }, 0)
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
  const kidCan = (ph: Phase) => {
    const s = st.current
    return !resting && !s.ended && s.who === 'kid' && s.armed && s.phase === ph
  }

  // ── 點骰子 ──
  const tapDie = async () => {
    const s = st.current
    if (!kidCan('roll')) return pingAt(dieEl.current)
    s.taps.push({ pick: 'die', ms: Math.round(performance.now() - s.t0) })
    idle.stop()
    setHand(null)
    setHold(true)
    flow.cut()
    const ok = flow.begin(live)
    const v = await roll(ok)
    if (v == null) return
    setPh('step')
    setHold(false)
    setGlowNext(spec.glow || s.guided)
    if (s.guided) showHand(nextCell(), false, true)
    startIdle()
    if (s.tapLine) {
      s.tapLine = false
      await say('rc.tap')
    }
  }

  // ── 點格子、點自己的恐龍：跳一格 ──
  const tapCell = async (c: number | 'me') => {
    const s = st.current
    const el = c === 'me' ? null : cellEls.current.get(c)
    if (!kidCan('step')) return c === 'me' ? undefined : pingAt(el)
    const next = nextCell()
    const now = performance.now()
    // 點自己、點自己站的那一格：跳下一格；後面的格子：不算，只有「看這裡」的圈圈
    // 剛跳完 0.25 秒內、跳格點錯後的鎖裡（miss-lock 0.45 秒）、剛跳到的那一格 0.7 秒內再點：都不算（race/plan 的 raceTap，T-168）
    const { kind, target } = raceTap(c, s.pos.kid, now, s)
    if (kind === 'ping') return pingAt(el)
    if (kind === 'ignore') return
    s.taps.push({ pick: String(target), ms: Math.round(now - s.t0) })
    idle.poke()
    if (kind === 'skip') {
      // 跳格：恐龍原地抖一下，一格一格走（不說錯）
      s.wrongs++
      s.missAt = now
      setNudge((k) => k + 1)
      sfx.boing()
      if (s.wrongs >= 2) setGlowNext(true)
      if (s.wrongs >= 3) {
        s.led = true
        showHand(next, true, true)
      }
      flow.cut()
      const ok = flow.begin(live)
      await say('rc.one')
      if (!ok()) return
      startIdle()
      return
    }
    s.lastStep = now
    setHand(null)
    const p = moveOne('kid')
    flow.cut()
    if (s.left > 0 && p < GOAL) {
      // 連著點很快的時候，前一聲停掉只念最新的數
      void say(numKey(p))
      if (s.wrongs >= 3) showHand(p + 1, false, true)
      startIdle()
      return
    }
    // 走完這一步
    setPh('busy')
    setHold(true)
    idle.stop()
    setGlowNext(false)
    const ok = flow.begin(live)
    await say(numKey(p))
    if (!ok()) return
    record()
    s.guided = false
    return endMove('kid', ok)
  }

  const handAt = hand ? pointIn(hand.el === 'die' ? dieEl.current : cellEls.current.get(hand.el), layer.current, 0.55, 0.55) : null
  const fills = (i: number) => (Array.isArray(track.fill) ? track.fill[(i - 1) % track.fill.length] : track.fill)
  const kidTurnNow = who === 'kid' && !ended
  /** 一隻棋子：站在第 p 格上（往右跳），跳的時候是一個小弧線 */
  const piece = (w: Who) => {
    const lane = LANE[w]
    const p = pos[w]
    const isKid = w === 'kid'
    return (
      <motion.g key={w} initial={{ x: cx(0) }} animate={{ x: cx(p) }} transition={{ duration: 0.32, ease: 'easeOut' }}>
        {/* 輪到誰：腳下一圈（靜止） */}
        {who === w && !ended && <ellipse cx={0} cy={lane.feet + 4} rx={56} ry={14} fill="rgba(241,210,124,0.45)" stroke="#F1D27C" strokeWidth={5} />}
        <motion.g
          key={`h${hop[w]}-${isKid ? nudge : 0}`}
          animate={hop[w] ? { y: [0, -34, 0] } : {}}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          data-runner={w}
          data-pos={p}
        >
          <motion.g key={`n${nudge}`} animate={isKid && nudge ? { x: [0, -8, 8, -4, 0] } : {}} transition={{ duration: 0.35 }}>
            <Runner who={isKid ? race.runner : 'dodo'} x={0} y={lane.feet} h={lane.tall} cheer={cheer[w]} />
          </motion.g>
        </motion.g>
        {isKid && <rect className="rc-hit" x={-52} y={lane.feet - lane.tall} width={104} height={lane.tall} fill="transparent" role="button" aria-label="我的恐龍" {...tap('me', () => void tapCell('me'))} />}
      </motion.g>
    )
  }
  return (
    <div
      className={`rc${resting ? ' is-resting' : ''}`}
      data-logic-game="race"
      data-level={level}
      data-track={race.track}
      data-reward={race.reward}
      data-who={who}
      data-phase={phase}
      data-kid={pos.kid}
      data-dodo={pos.dodo}
      data-die={die.value}
      data-lit={die.lit}
      data-demo={demo ? '1' : undefined}
      data-turn={kidTurnNow && (phase === 'roll' || phase === 'step') ? '1' : undefined}
      data-done={ended ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="rc-play" ref={layer}>
        <svg className="rc-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <g pointerEvents="none">
            <Backdrop def={track.scene} w={W} h={H} />
            {/* 起點：兩隻恐龍站的地方 */}
            <ellipse cx={cx(0)} cy={LANE.dodo.y} rx={44} ry={22} fill="#fff" opacity={0.55} />
            <ellipse cx={cx(0)} cy={LANE.kid.y} rx={48} ry={26} fill="#fff" opacity={0.55} />
            <FinishLine x={cx(GOAL) + CELL_W / 2 + 6} y1={LANE.dodo.y - 50} y2={LANE.kid.y + 50} />
            {/* 豆豆的跑道（不能點） */}
            {Array.from({ length: GOAL }, (_, k) => k + 1).map((i) => (
              <Cell key={`d${i}`} shape={track.cell} fill={fills(i)} edge={track.edge} ink={track.ink} x={cx(i)} y={LANE.dodo.y} w={CELL_W - 6} h={LANE.dodo.h} n={i} />
            ))}
          </g>
          {/* 他的跑道：每一格都可以點（點的範圍是整格寬、上下多一圈） */}
          {Array.from({ length: GOAL }, (_, k) => k + 1).map((i) => (
            <g
              key={`k${i}`}
              ref={(el) => {
                cellEls.current.set(i, el)
              }}
              className="rc-cell"
              data-cell={i}
              data-next={i === pos.kid + 1 ? '1' : undefined}
              role="button"
              aria-label={`第 ${i} 格`}
              {...tap(`c${i}`, () => void tapCell(i), ANSWER_TAP)}
            >
              <rect x={cx(i) - 44} y={LANE.kid.y - LANE.kid.h / 2 - 8} width={88} height={LANE.kid.h + 16} fill="transparent" />
              <Cell shape={track.cell} fill={fills(i)} edge={track.edge} ink={track.ink} x={cx(i)} y={LANE.kid.y} w={CELL_W} h={LANE.kid.h} n={i} glow={glowNext && i === pos.kid + 1 && phase === 'step'} />
            </g>
          ))}
          {/* 終點的禮物：兩隻都到了才打開（每次不一樣的驚喜） */}
          <g pointerEvents="none">
            <ellipse cx={GIFT.x} cy={GIFT.y + GIFT.s / 2 + 4} rx={42} ry={10} fill="#2E2A25" opacity={0.12} />
            <AnimatePresence mode="wait">
              {open ? (
                <motion.g key="open" data-gift="open" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} style={{ transformOrigin: `${GIFT.x}px ${GIFT.y}px`, transformBox: 'view-box' }}>
                  <circle cx={GIFT.x} cy={GIFT.y} r={46} fill="#FFF3C4" opacity={0.85} />
                  <Emo name={reward.emoji} x={GIFT.x - 40} y={GIFT.y - 40} size={80} />
                </motion.g>
              ) : (
                <motion.g key="gift" data-gift="closed" exit={{ opacity: 0, y: -30 }} transition={{ duration: 0.25 }}>
                  <Emo name="wrapped-gift" x={GIFT.x - GIFT.s / 2} y={GIFT.y - GIFT.s / 2} size={GIFT.s} />
                </motion.g>
              )}
            </AnimatePresence>
          </g>
          <g pointerEvents="none">{piece('dodo')}</g>
          {piece('kid')}
          {/* 骰子：輪到他擲的時候外面一圈黃框（靜止）；旁邊是現在輪到誰 */}
          <g pointerEvents="none">
            <Runner who={who === 'kid' ? race.runner : 'dodo'} x={DIE.x - 118} y={DIE.y + 44} h={66} />
          </g>
          <g
            ref={dieEl}
            className="rc-die"
            data-die-btn=""
            role="button"
            aria-label="骰子"
            transform={`translate(${DIE.x} ${DIE.y})`}
            {...tap('die', () => void tapDie())}
          >
            <rect x={-62} y={-56} width={124} height={116} fill="transparent" />
            {kidTurnNow && phase === 'roll' && <rect x={-DIE.s / 2 - 12} y={-DIE.s / 2 - 12} width={DIE.s + 24} height={DIE.s + 24} rx={30} fill="rgba(241,210,124,0.22)" stroke="#F1D27C" strokeWidth={8} />}
            <motion.g key={spin} animate={phase === 'rolling' ? { rotate: [0, -12, 10, 0], scale: [1, 1.04, 1] } : {}} transition={{ duration: 0.18 }}>
              <DieFace value={die.value} s={DIE.s} lit={die.lit} />
            </motion.g>
          </g>
        </svg>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<RacePickArt />} againLabel="再玩一次" line="rc.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
