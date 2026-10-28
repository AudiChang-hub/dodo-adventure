import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { TeachCard } from '../Teach'
import { Hand } from '../Demo'
import { Ride } from '../../art/Ride'
import { Emoji } from '../../art/Emoji'
import { ArrowArt } from '../../art/Arrow'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef, type TeachSpec } from '../../content/games'
import { BLOCK_ICON, DIRS, driveTarget, distMap, drivePuzzle, driveTeach, runProgram, stepOf, type Cell, type Dir, type DrivePuzzle } from '../../content/code'
import { markPlayed, plays, reportLevel } from '../../lib/adaptive'
import { planDrive, roundState } from '../pick'
import { logAttempt, logTeach } from '../../lib/record'
import { themeNow } from '../../lib/theme-play'
import type { Phase } from '../../lib/db'
import { preload, say, sfx, stopSpeech } from '../../lib/audio'
import { praiseKey, wait } from '../lines'
import { useIdle } from '../idle'
import { hit, useTapDrag } from './drag'
import type { Mood } from '../../art/Dino'
import './code.css'

const ROUNDS = 4
/** 車子走一格要多久（毫秒）：慢到孩子跟得上「卡片一張一張被執行」 */
const STEP_MS = 620

type Slot = Dir | null
/** 拖曳的來源：卡盒裡的卡（可以一直拿），或已經放進程式列的卡 */
type Src = { from: 'palette'; dir: Dir } | { from: 'slot'; i: number; dir: Dir }

/** D-pad 的位置：箭頭放在它指的那一邊，方向和位置一致 */
const PAD: Record<Dir, CSSProperties> = {
  up: { gridArea: '1 / 2' },
  left: { gridArea: '2 / 1' },
  right: { gridArea: '2 / 3' },
  down: { gridArea: '3 / 2' },
}

const targetOf = (p: DrivePuzzle) => driveTarget(p.target)
const promptOf = (p: DrivePuzzle) => [`c.drive.to.${p.target}`, ...(p.solution.length > 1 ? [`c.drive.cards.${p.solution.length}`] : [])]

/**
 * 現在最該放的是哪一格、哪張卡：前面的卡都對，就是第一個空格；
 * 有一張不會更靠近目的地，就是那一格（除錯）。全部都對回傳 null。
 */
function nextNeed(p: DrivePuzzle, prog: Slot[]): { slot: number; dir: Dir } | null {
  const d = distMap(p)
  let c = p.start
  for (let i = 0; i < prog.length; i++) {
    const here = d[c.y][c.x]
    const ok = DIRS.filter((dir) => {
      const n = stepOf(c, dir)
      return d[n.y]?.[n.x] === here - 1
    })
    const want = ok.includes(p.solution[i]) ? p.solution[i] : ok[0]
    const cur = prog[i]
    if (!cur || !ok.includes(cur)) return { slot: i, dir: want }
    c = stepOf(c, cur)
  }
  return null
}

/**
 * 箭頭卡開車（PRD §10，3–4 歲）：把箭頭卡放進程式列，按 Go，豆豆的車照著卡一格一格開。
 * - 點卡盒的卡＝放進第一個空格；點程式列的卡＝拿掉。也可以拖到某一格。
 * - 開錯了（撞到邊、撞到樹、沒停在目的地）：車子退回起點，卡片留著，開錯的那張卡搖一搖——改一張卡再開，就是除錯。
 * - 新的方向（或第一次用兩、三張卡）先上教學卡 → 一起練（正確的卡發光、其他變淡）→ 自己答。
 * - 自己答開錯兩次：重播精簡的教學卡，再一起練一次。熟練度只採計自己答。
 */
export function DriveGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [idx, setIdx] = useState(0)
  const [puzzle, setPuzzle] = useState<DrivePuzzle | null>(null)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ spec: TeachSpec; short: boolean; n: number } | null>(null)
  const [prog, setProg] = useState<Slot[]>([])
  const [car, setCar] = useState<{ at: Cell; face: 1 | -1; bump: Dir | null; moving: boolean }>({ at: { x: 0, y: 0 }, face: 1, bump: null, moving: false })
  const [trail, setTrail] = useState<Cell[]>([])
  const [runAt, setRunAt] = useState<number | null>(null)
  const [bug, setBug] = useState<number | null>(null)
  const [hintOn, setHintOn] = useState(false)
  const [needSlot, setNeedSlot] = useState<number | null>(null)
  /** 在第幾個畫面（view）開到目的地：只在那個畫面放煙火 */
  const [arrivedAt, setArrivedAt] = useState(-1)
  const [mood, setMood] = useState<Mood>('idle')
  const [view, setView] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  const running = useRef(false)
  const puzzleRef = useRef<DrivePuzzle | null>(null)
  const progRef = useRef<Slot[]>([])
  const phaseRef = useRef<Phase>('quiz')
  const stepRef = useRef(0)
  const idxRef = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const fails = useRef(0)
  const bumps = useRef(0)
  const hintUsed = useRef(false)
  const lv = useRef(1)
  const recentTargets = useRef<DrivePuzzle['target'][]>([])
  // 主題式冒險：開的是說故事那隻恐龍的車（莫莫的公車旅行就開黃色公車），開場也改成請孩子幫牠開
  const [driver] = useState(() => themeNow()?.host ?? 'dodo')
  const firstTries = useRef(0)
  const round = useRef(roundState(plays(def.id) === 0))
  const resolver = useRef<((ms: number) => void) | null>(null)
  const slotEls = useRef<(HTMLElement | null)[]>([])
  const rootEl = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef(0)
  const idle = useIdle()

  const waitStep = () => new Promise<number>((res) => (resolver.current = res))
  const release = (ms = 0) => {
    const r = resolver.current
    resolver.current = null
    r?.(ms)
  }

  const setProgBoth = (p: Slot[]) => {
    progRef.current = p
    setProg(p)
  }
  const mark = (pick: string) => taps.current.push({ pick, ms: Math.round(performance.now() - t0.current) })

  /** 換題（或重來）：車子回起點、程式列清空 */
  const setup = (p: DrivePuzzle) => {
    puzzleRef.current = p
    setPuzzle(p)
    setProgBoth(Array(p.solution.length).fill(null))
    setCar({ at: p.start, face: 1, bump: null, moving: false })
    setTrail([])
    setRunAt(null)
    setBug(null)
    setHintOn(false)
    setNeedSlot(null)
    viewRef.current++
    setView(viewRef.current)
    taps.current = []
    fails.current = 0
    bumps.current = 0
    hintUsed.current = false
  }

  const base = (p: DrivePuzzle) => ({
    station: def.station,
    game: def.id,
    itemId: p.itemId,
    skill: p.skill,
    level: lv.current,
    options: p.palette,
    answer: p.solution.join(','),
  })

  // ── 我示範：教學卡 ─────────────────────────────────────────
  const teach = async (p: DrivePuzzle, short: boolean) => {
    stepRef.current++
    idle.stop()
    locked.current = true
    setMood('happy')
    setCard({ spec: driveTeach(p), short, n: stepRef.current })
    const ms = await waitStep()
    if (!live.current) return
    setCard(null)
    void logTeach({ station: def.station, game: def.id, itemId: p.itemId, skill: p.skill, level: lv.current, ms, retaught: short })
    await wait(260)
  }

  // ── 一起練：該放的卡發光、其他變淡；放錯的卡不會被放進去 ─────────
  const guided = async (p: DrivePuzzle) => {
    const my = ++stepRef.current
    phaseRef.current = 'guided'
    setPhase('guided')
    setup(p)
    setMood('happy')
    locked.current = false
    t0.current = performance.now()
    const done = waitStep()
    void (async () => {
      await say(...promptOf(p), 'teach.here.bobo')
      // 一起練本來就在發光，第二段提醒不用再做什麼
      if (live.current && stepRef.current === my) idle.start({ repeat: () => void say(...promptOf(p), 'teach.here.bobo'), hint: () => {} })
    })()
    await done
  }

  // ── 自己答 ─────────────────────────────────────────────────
  const quiz = async (p: DrivePuzzle, afterGuide = false) => {
    const my = ++stepRef.current
    phaseRef.current = 'quiz'
    setPhase('quiz')
    setup(p)
    setMood('idle')
    locked.current = false
    t0.current = performance.now()
    await say(...(afterGuide ? ['teach.turn.bobo'] : []), ...promptOf(p))
    if (!live.current || stepRef.current !== my) return
    idle.start({
      repeat: () => void say(...promptOf(p)),
      // 第二段：該放（或該改）的那張卡慢慢發光，不說話；看了提示就不算第一次答對
      hint: () => {
        hintUsed.current = true
        setHintOn(true)
      },
    })
  }

  /** 出下一題：先決定這題要不要教 */
  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    // 這題練哪個技能、要不要先教（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { key, lv: l, fresh, walk } = planDrive(def, round.current, i)
    lv.current = l
    const p = drivePuzzle(lv.current, key, recentTargets.current)
    recentTargets.current = [p.target, ...recentTargets.current].slice(0, 2)
    preload([...promptOf(p), ...driveTeach(p).lines, ...p.solution.map((d) => `c.dir.${d}`), 'teach.here.bobo', 'teach.turn.bobo', 'c.drive.go', 'c.drive.made', 'c.drive.fix'])

    if (fresh) {
      await teach(p, false)
      if (!live.current) return
    }
    if (fresh || walk) {
      await guided(p)
      if (!live.current) return
      // 自己答換一題同技能的新路線（同一題再來一次只是記答案）
      const q = drivePuzzle(lv.current, key, [p.target])
      recentTargets.current = [q.target, ...recentTargets.current].slice(0, 2)
      return quiz(q, true)
    }
    return quiz(p)
  }

  const next = async () => {
    await wait(450)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ROUNDS) return onDone({ items: ROUNDS, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(async () => {
      markPlayed(def.id)
      await say(driver === 'dodo' ? def.intro : `c.intro.drive.${driver}`)
      if (live.current) present(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 放卡、拿卡 ─────────────────────────────────────────────
  const need = () => (puzzleRef.current ? nextNeed(puzzleRef.current, progRef.current) : null)

  /** 一起練只收「該放的那張、放在該放的那格」；其他的不放進去，再指一次 */
  const guidedRejects = (slot: number, dir: Dir) => {
    if (phaseRef.current !== 'guided') return false
    const n = need()
    if (n && n.slot === slot && n.dir === dir) return false
    sfx.gentle()
    void say('teach.here.bobo')
    return true
  }

  const changed = (p: Slot[]) => {
    setProgBoth(p)
    setBug(null)
    setNeedSlot(null)
    setHintOn(false)
    // 一起練：卡片放滿了，換 Go 發光
    if (phaseRef.current === 'guided' && p.every(Boolean)) void say('c.drive.go')
  }

  const place = (slot: number, dir: Dir) => {
    if (guidedRejects(slot, dir)) return
    const p = [...progRef.current]
    p[slot] = dir
    mark(`${dir}@${slot}`)
    sfx.pop()
    void say(`c.dir.${dir}`)
    changed(p)
  }

  const removeAt = (slot: number) => {
    const p = [...progRef.current]
    if (!p[slot]) return
    mark(`-@${slot}`)
    p[slot] = null
    sfx.tap()
    changed(p)
  }

  const canTouch = () => !locked.current && !running.current && !card

  const palette = useTapDrag<Src>({
    enabled: canTouch,
    onPoke: () => idle.poke(),
    onTap: (s) => {
      if (s.from === 'slot') return removeAt(s.i)
      const empty = progRef.current.indexOf(null)
      // 放滿了：提醒按 Go（Go 也會輕輕跳一下）
      if (empty < 0) {
        sfx.gentle()
        return void say('c.drive.go')
      }
      place(empty, s.dir)
    },
    onDrop: (s, x, y) => {
      const to = slotEls.current.findIndex((el) => hit(el, x, y))
      if (s.from === 'palette') {
        if (to >= 0) place(to, s.dir)
        return
      }
      // 從程式列拖出去＝拿掉；拖到另一格＝搬過去（兩格交換）
      if (to < 0) return removeAt(s.i)
      if (to === s.i) return
      const p = [...progRef.current]
      if (phaseRef.current === 'guided') return removeAt(s.i)
      ;[p[to], p[s.i]] = [p[s.i], p[to]]
      mark(`${s.dir}@${s.i}>${to}`)
      sfx.pop()
      changed(p)
    },
  })

  // ── 開車 ───────────────────────────────────────────────────
  const go = async () => {
    const p = puzzleRef.current
    if (!p || !canTouch()) return
    idle.poke()
    const pr = progRef.current
    const empty = pr.indexOf(null)
    if (empty >= 0) {
      // 還有空格：那一格亮起來，不算一次作答
      sfx.gentle()
      setNeedSlot(empty)
      await say('c.drive.need')
      return idle.poke()
    }
    const prog = pr as Dir[]
    mark('go')
    running.current = true
    locked.current = true
    stepRef.current++
    idle.stop()
    setHintOn(false)
    setBug(null)
    sfx.whoosh()
    const res = runProgram(p, prog)
    let face: 1 | -1 = 1
    for (let i = 0; i < prog.length; i++) {
      if (!live.current) return
      setRunAt(i)
      const d = prog[i]
      if (d === 'left') face = -1
      if (d === 'right') face = 1
      if (res.bump === i) {
        // 撞到：往那個方向探一下又彈回來
        bumps.current++
        setCar((c) => ({ ...c, face, bump: d, moving: false }))
        sfx.gentle()
        await say(`c.dir.${d}`)
        await say('c.drive.bump')
        break
      }
      setCar({ at: res.path[i + 1], face, bump: null, moving: true })
      setTrail(res.path.slice(0, i + 2))
      await Promise.all([say(`c.dir.${d}`), wait(STEP_MS)])
    }
    if (!live.current) return
    setRunAt(null)
    setCar((c) => ({ ...c, moving: false }))
    if (res.ok) return arrive(p)
    return miss(p, res.bump !== null, res.bug ?? 0)
  }

  /** 開到了 */
  const arrive = async (p: DrivePuzzle) => {
    running.current = false
    sfx.correct()
    setArrivedAt(viewRef.current)
    setMood('cheer')
    const ph = phaseRef.current
    const firstTry = fails.current === 0 && !hintUsed.current
    const metrics = { runs: fails.current + 1, bumps: bumps.current, cards: p.solution.length, ...(fails.current > 0 ? { fixed: 1 } : {}) }
    void logAttempt({
      ...base(p),
      phase: ph,
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: fails.current + 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: ph === 'guided' || hintUsed.current,
      metrics,
    })
    if (ph === 'guided') {
      await say('c.drive.made', praiseKey('bobo'))
      await wait(250)
      return release()
    }
    if (firstTry) firstTries.current++
    const change = reportLevel(def.id, firstTry, def.maxLevel, { skill: p.skill })
    await say('c.drive.made', praiseKey('bobo'), ...(change === 'up' ? ['levelup'] : []))
    next()
  }

  /** 沒開到：車子退回起點，卡片留著，開錯的那張搖一搖 */
  const miss = async (p: DrivePuzzle, bumped: boolean, bugAt: number) => {
    if (!bumped) {
      sfx.gentle()
      await say('c.drive.oops')
    }
    if (!live.current) return
    await wait(200)
    setCar((c) => ({ at: p.start, face: c.face, bump: null, moving: true }))
    setTrail([])
    await wait(700)
    if (!live.current) return
    setCar((c) => ({ ...c, face: 1, moving: false }))
    running.current = false
    fails.current++
    // 自己答開錯兩次：重新教一次，再一起練（PRD §5.8）
    if (phaseRef.current === 'quiz' && fails.current >= 2) return reteach(p)
    // 車子一回到起點就可以改卡，不用等波波說完
    setBug(bugAt)
    locked.current = false
    await say('c.drive.fix')
    if (live.current) idle.poke()
  }

  const reteach = async (p: DrivePuzzle) => {
    stepRef.current++
    idle.stop()
    hintUsed.current = true
    void logAttempt({
      ...base(p),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: false,
      attempts: fails.current,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: true,
      metrics: { runs: fails.current, bumps: bumps.current, cards: p.solution.length, retaught: 1 },
    })
    reportLevel(def.id, false, def.maxLevel, { skill: p.skill })
    await say('teach.again.bobo')
    if (!live.current) return
    await teach(p, true)
    if (!live.current) return
    await guided(p)
    if (live.current) next()
  }

  // 孩子主動點波波：再說一次要開去哪裡
  const onHost = () => {
    const p = puzzleRef.current
    if (card || !p) return
    idle.poke()
    void say(...promptOf(p), ...(phaseRef.current === 'guided' ? ['teach.here.bobo'] : []))
  }

  // ── 畫面 ───────────────────────────────────────────────────
  const p = puzzle
  const guide = phase === 'guided' && !card
  const want = p && (guide || hintOn) ? nextNeed(p, prog) : null
  const full = prog.length > 0 && prog.every(Boolean)
  const goGlow = (guide && full) || (hintOn && full && !want)
  const t = p ? targetOf(p) : null
  const pct = (v: number, of: number) => `${((v + 0.5) / of) * 100}%`

  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUNDS, done: idx }} onExit={onExit} onHost={onHost}>
      <AnimatePresence mode="wait">
        {card ? (
          <TeachCard key={`teach-${card.n}`} spec={card.spec} short={card.short} onDone={release} />
        ) : (
          p &&
          t && (
            <motion.div key={`d-${view}`} ref={rootEl} className="drive" data-solution={import.meta.env.DEV ? p.solution.join(',') : undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              {/* ── 路面 ── */}
              <div className="drive-board-area">
                <div className="drive-board" style={{ '--cols': p.cols, '--rows': p.rows } as CSSProperties}>
                  {Array.from({ length: p.cols * p.rows }, (_, k) => {
                    const c = { x: k % p.cols, y: Math.floor(k / p.cols) }
                    const isBlock = p.blocks.some((b) => b.x === c.x && b.y === c.y)
                    const isStart = c.x === p.start.x && c.y === p.start.y
                    return (
                      <div key={k} className={`road-tile${isBlock ? ' is-block' : ''}`}>
                        {isStart && <i className="park-mark" aria-hidden="true" />}
                        {isBlock && (
                          <div className="tile-icon">
                            <Emoji name={BLOCK_ICON} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {/* 車子、目的地、輪胎印放在路面內框裡（扣掉外框），座標才會對到格子中心 */}
                  <div className="drive-layer">
                  {/* 輪胎印：車子開過的路 */}
                  <svg className="drive-trail" viewBox={`0 0 ${p.cols * 100} ${p.rows * 100}`} preserveAspectRatio="none" aria-hidden="true">
                    {trail.length > 1 && (
                      <motion.polyline
                        points={trail.map((c) => `${c.x * 100 + 50},${c.y * 100 + 50}`).join(' ')}
                        fill="none"
                        stroke="#9AA7B4"
                        strokeWidth={9}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="2 20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.9 }}
                      />
                    )}
                  </svg>
                  {/* 目的地 */}
                  <motion.div
                    className="drive-goal"
                    style={{ left: pct(p.goal.x, p.cols), top: pct(p.goal.y, p.rows), width: `${100 / p.cols}%`, height: `${100 / p.rows}%` }}
                    initial={{ scale: 0 }}
                    animate={arrivedAt === view ? { scale: [1, 1.2, 1], rotate: [0, -6, 6, 0] } : { scale: 1 }}
                    transition={arrivedAt === view ? { duration: 0.6 } : { type: 'spring', stiffness: 300, damping: 16, delay: 0.25 }}
                  >
                    <div className="tile-icon">
                      <Emoji name={t.icon} />
                    </div>
                    {arrivedAt === view && <Sparkles count={14} />}
                  </motion.div>
                  {/* 豆豆的車 */}
                  <motion.div
                    className="drive-car"
                    style={{ width: `${(100 / p.cols) * 0.94}%` }}
                    initial={false}
                    animate={{
                      left: pct(car.at.x, p.cols),
                      top: pct(car.at.y, p.rows),
                      x: car.bump === 'left' ? ['0%', '-22%', '0%'] : car.bump === 'right' ? ['0%', '22%', '0%'] : '0%',
                      y: car.bump === 'up' ? ['0%', '-22%', '0%'] : car.bump === 'down' ? ['0%', '22%', '0%'] : '0%',
                      rotate: car.bump ? [0, -5, 4, 0] : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 150, damping: 20, x: { duration: 0.42 }, y: { duration: 0.42 }, rotate: { duration: 0.42 } }}
                  >
                    <div style={{ transform: `scaleX(${car.face})`, transition: 'transform .25s' }}>
                      <Ride who={driver} width="100%" moving={car.moving} mood={mood === 'cheer' ? 'cheer' : 'happy'} />
                    </div>
                  </motion.div>
                  </div>
                </div>
              </div>

              {/* ── 程式列：卡片一張一張排好，最後按 Go ── */}
              <div className="prog-strip">
                {prog.map((d, i) => {
                  const isWant = want?.slot === i
                  return (
                    <div key={i} className="prog-cell">
                      {i > 0 && <span className="prog-chev" aria-hidden="true" />}
                      <div
                        ref={(el) => {
                          slotEls.current[i] = el
                        }}
                        className={`prog-slot${d ? ' is-full' : ''}${runAt === i ? ' is-running' : ''}${needSlot === i || (isWant && !d) ? ' is-need' : ''}`}
                      >
                        <span className="prog-num" aria-hidden="true">
                          {i + 1}
                        </span>
                        <AnimatePresence>
                          {d && (
                            <motion.button
                              key={`${i}-${d}`}
                              className={`arrow-card in-slot${bug === i || (isWant && hintOn) ? ' is-bug' : ''}`}
                              aria-label={`第 ${i + 1} 張：${d}（點一下拿掉）`}
                              initial={{ scale: 0.4, opacity: 0, y: 30 }}
                              animate={bug === i ? { scale: 1, opacity: 1, y: 0, rotate: [0, -8, 8, -6, 6, 0] } : { scale: runAt === i ? 1.1 : 1, opacity: 1, y: 0, rotate: 0 }}
                              exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.16 } }}
                              transition={bug === i ? { rotate: { duration: 0.7, repeat: Infinity, repeatDelay: 0.9 } } : { type: 'spring', stiffness: 420, damping: 22 }}
                              {...palette.bind({ from: 'slot', i, dir: d })}
                            >
                              <ArrowArt dir={d} />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )
                })}
                <motion.button
                  className={`go-run${full ? ' is-ready' : ''}${goGlow ? ' guide' : ''}`}
                  aria-label="開車"
                  whileTap={{ scale: 0.92 }}
                  animate={full && !running.current ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 0.5 }}
                  onPointerDown={() => void go()}
                >
                  <svg viewBox="0 0 48 48" width="46%" aria-hidden="true">
                    <path d="M17 11 Q14 9.5 14 13 V35 Q14 38.5 17 37 L37 26 Q39.5 24 37 22 Z" fill="#FBF8F2" stroke="#FBF8F2" strokeWidth={3} strokeLinejoin="round" />
                  </svg>
                  {goGlow && <Hand x={66} y={62} size="9cqmin" beckon />}
                </motion.button>
              </div>

              {/* ── 卡盒：箭頭放在它指的那一邊 ── */}
              <div className="dpad">
                <i className="dpad-hub" aria-hidden="true" />
                {p.palette.map((d) => {
                  const lit = want?.dir === d && (guide || hintOn)
                  const dim = guide && !lit
                  return (
                    <motion.button
                      key={d}
                      className={`arrow-card${lit ? (guide ? ' guide' : ' hint') : ''}${dim ? ' dim' : ''}`}
                      style={PAD[d]}
                      aria-label={d}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: dim ? 0.9 : 1, opacity: dim ? 0.4 : 1 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                      {...palette.bind({ from: 'palette', dir: d })}
                    >
                      <ArrowArt dir={d} />
                      {lit && guide && <Hand x={70} y={66} size="9cqmin" beckon />}
                    </motion.button>
                  )
                })}
              </div>

              {/* 拖曳中跟著手指的卡 */}
              {palette.ghost && rootEl.current && (
                <div className="arrow-card ghost" style={{ left: palette.ghost.x - rootEl.current.getBoundingClientRect().left, top: palette.ghost.y - rootEl.current.getBoundingClientRect().top }} aria-hidden="true">
                  <ArrowArt dir={palette.ghost.item.dir} />
                </div>
              )}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </Shell>
  )
}
