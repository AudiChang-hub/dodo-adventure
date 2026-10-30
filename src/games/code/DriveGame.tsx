import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
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
import { audioClock, onSpeech, preload, say, sfx, stopSpeech } from '../../lib/audio'
import { challengeKey, praiseKey, wait } from '../lines'
import { useIdle } from '../idle'
import { PACE, nextPause } from '../pace'
import { SETTLED_MS, REVEAL_MS, background, foreground, handoff } from '../../ui/motion'
import { hit, useTapDrag } from './drag'
import type { Mood } from '../../art/Dino'
import './code.css'

const ROUNDS = 4
/** 車子走一格要多久（毫秒）：慢到孩子跟得上「卡片一張一張被執行」 */
const STEP_MS = 620

/*
 * 教學卡（大大的箭頭）↔ 路面（小恐龍開車的地圖）的過場：全站轉場標準 ui/motion.ts 的「前景 ↔ 背景」。
 * 教學卡在原地淡入（只帶 2% 的推近）、地圖在卡片後面淡掉；回來時卡片淡出、地圖淡回來。不縮放、不從車子長出來。
 */

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

/**
 * 程式列的卡被拿掉：fly（孩子拿掉、換卡、開錯自己跳走）就往右上的卡盒跳回去；換題清空就原地縮掉。
 * 透明度只往下走一次（ui/motion.ts 規則 2）。
 */
const slotCardOut = {
  exit: (fly: boolean) =>
    fly
      ? { x: '150%', y: '-170%', rotate: 24, scale: 0.6, opacity: 0, transition: { duration: 0.5, ease: [0.4, 0, 1, 1] as const, opacity: { duration: 0.5, ease: 'easeIn' as const } } }
      : { scale: 0.4, opacity: 0, transition: { duration: 0.16 } },
}

/** 開場還不能玩：作答區（程式列、卡盒）變淡，路面和車子保持全亮 */
const ANSWER_FADE = 'opacity .4s, filter .4s'
const DIM: CSSProperties = { opacity: 0.45, filter: 'saturate(0.5)', transition: ANSWER_FADE }
const LIVE: CSSProperties = { transition: ANSWER_FADE }

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
  // 減少動態效果：教學卡淡入淡出時也不縮放（ui/motion.ts 的 foreground）
  const reduced = !!useReducedMotion()
  const [puzzle, setPuzzle] = useState<DrivePuzzle | null>(null)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ spec: TeachSpec; short: boolean; n: number } | null>(null)
  const [prog, setProg] = useState<Slot[]>([])
  const [car, setCar] = useState<{ at: Cell; face: 1 | -1; bump: Dir | null; moving: boolean }>({ at: { x: 0, y: 0 }, face: 1, bump: null, moving: false })
  const [trail, setTrail] = useState<Cell[]>([])
  const [runAt, setRunAt] = useState<number | null>(null)
  const [bug, setBug] = useState<number | null>(null)
  /** 這幾格的卡被拿掉時「跳回卡盒」（往右上的卡盒飛走），而不是原地縮掉：看得到卡去哪了 */
  const [fly, setFly] = useState<number[]>([])
  /** 程式列滿了、一起練時又點了卡盒：Go 外面閃一圈，告訴孩子現在該按 Go */
  const [goPing, setGoPing] = useState(0)
  const [hintOn, setHintOn] = useState(false)
  const [needSlot, setNeedSlot] = useState<number | null>(null)
  /** 在第幾個畫面（view）開到目的地：只在那個畫面放煙火 */
  const [arrivedAt, setArrivedAt] = useState(-1)
  const [mood, setMood] = useState<Mood>('idle')
  const [view, setView] = useState(0)
  /** 開場：路面、車子、卡盒先擺好，說話時作答區變淡（還不能玩） */
  const [intro, setIntro] = useState(true)
  /** 開場說到 arrow cards 的那一刻，卡盒的卡各閃一圈（一次，不循環） */
  const [cardPing, setCardPing] = useState(0)
  /** 還不能玩的時候點了：點的地方出現一圈「看這裡」（TOUCH-6），不算作答 */
  const [looks, setLooks] = useState<{ id: number; x: number; y: number }[]>([])

  const live = useRef(true)
  const locked = useRef(true)
  const running = useRef(false)
  const puzzleRef = useRef<DrivePuzzle | null>(null)
  const progRef = useRef<Slot[]>([])
  const bugRef = useRef<number | null>(null)
  /** 每一格放過幾次卡：同一個方向換上去也會有「舊的跳走、新的放進來」的動畫 */
  const slotGen = useRef<number[]>([])
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
  /** 這一題剛走過教學卡、示範或一起練：答對後多停一下再換題 */
  const taughtItem = useRef(false)
  const resolver = useRef<((ms: number) => void) | null>(null)
  const slotEls = useRef<(HTMLElement | null)[]>([])
  const rootEl = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef(0)
  /** 教學卡在畫面上（setCard 是非同步的，流程裡要馬上知道） */
  const cardUp = useRef(false)
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
  const setBugBoth = (b: number | null) => {
    bugRef.current = b
    setBug(b)
  }
  const mark = (pick: string) => taps.current.push({ pick, ms: Math.round(performance.now() - t0.current) })

  /** 換題（或重來）：車子回起點、程式列清空 */
  const setup = (p: DrivePuzzle) => {
    puzzleRef.current = p
    setPuzzle(p)
    setProgBoth(Array(p.solution.length).fill(null))
    slotGen.current = Array(p.solution.length).fill(0)
    setFly([])
    setCar({ at: p.start, face: 1, bump: null, moving: false })
    setTrail([])
    setRunAt(null)
    setBugBoth(null)
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
    cardUp.current = true
    setCard({ spec: driveTeach(p), short, n: stepRef.current })
    const done = waitStep()
    // 卡片蓋上、路面在後面淡掉之後，才把地圖換成這一題：卡片淡出時直接看到新地圖，不會先閃回上一題
    await wait(SETTLED_MS)
    if (!live.current) return
    setup(p)
    const ms = await done
    if (!live.current) return
    void logTeach({ station: def.station, game: def.id, itemId: p.itemId, skill: p.skill, level: lv.current, ms, retaught: short })
  }

  /** 教學卡收回車子裡、鏡頭拉遠回到地圖（一起練的狀態先準備好，拉遠時一次看到完整的畫面） */
  const reveal = async () => {
    if (!cardUp.current) return
    cardUp.current = false
    setCard(null)
    await wait(Math.max(PACE.TEACH_TO_GUIDED, REVEAL_MS))
  }

  // ── 一起練：該放的卡發光、其他變淡；放錯的卡不會被放進去 ─────────
  const guided = async (p: DrivePuzzle) => {
    const my = ++stepRef.current
    phaseRef.current = 'guided'
    setPhase('guided')
    setup(p)
    setMood('happy')
    await reveal()
    if (!live.current) return
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

  /** 這題練哪個技能、要不要先教（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份） */
  const plan = (i: number) => {
    const pl = planDrive(def, round.current, i)
    const p = drivePuzzle(pl.lv, pl.key, recentTargets.current)
    recentTargets.current = [p.target, ...recentTargets.current].slice(0, 2)
    return { ...pl, p }
  }

  /** 出下一題：先決定這題要不要教（第一題在開場就排好了，路面才能先擺出來） */
  const present = async (i: number, planned = plan(i)) => {
    idxRef.current = i
    setIdx(i)
    const { key, lv: l, fresh, walk, p } = planned
    lv.current = l
    preload([...promptOf(p), ...driveTeach(p).lines, ...p.solution.map((d) => `c.dir.${d}`), 'teach.here.bobo', 'teach.turn.bobo', 'c.drive.go', 'c.drive.made', 'c.drive.fix'])

    // 最後一題先說 Last one!（V-33、TIME-2），進度列的最後一格也同時放大
    if (i === ROUNDS - 1) {
      await say(challengeKey('bobo'))
      if (!live.current) return
    }
    if (fresh) {
      await teach(p, false)
      if (!live.current) return
    }
    taughtItem.current = fresh || walk
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

  /** 答對（或重教完）到下一題：剛教的新內容多停一下，複習題維持輕快 */
  const next = async (ms = nextPause(taughtItem.current)) => {
    await wait(ms)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ROUNDS) return onDone({ items: ROUNDS, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    let offIntro = () => {}
    const timers: number[] = []
    const boot = window.setTimeout(async () => {
      // 開場（V-14）：先把第一題的路面、車子、卡盒擺好，再說「Use the arrow cards!」；說到 arrow 的那一刻卡片閃一下
      const first = plan(0)
      markPlayed(def.id)
      setup(first.p)
      const key = driver === 'dodo' ? def.intro : `c.intro.drive.${driver}`
      let lit = false
      const light = () => {
        if (lit || !live.current) return
        lit = true
        setCardPing((n) => n + 1)
      }
      offIntro = onSpeech((e) => {
        if (!('key' in e) || e.key !== key) return
        if (e.type === 'whole') return light()
        if (e.type === 'end') return light()
        if (e.type !== 'seg') return
        const w = e.words?.find(([, , t]) => /^arrow/i.test(t))
        if (w) timers.push(window.setTimeout(light, Math.max(0, (e.at - audioClock()) * 1000 + w[0])))
      })
      await wait(REVEAL_MS)
      if (!live.current) return
      await say(key)
      offIntro()
      if (!live.current) return
      setIntro(false)
      present(0, first)
    }, 0)
    return () => {
      live.current = false
      offIntro()
      timers.forEach(clearTimeout)
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
    setBugBoth(null)
    setNeedSlot(null)
    setHintOn(false)
    // 一起練：卡片放滿了，換 Go 發光
    if (phaseRef.current === 'guided' && p.every(Boolean)) void say('c.drive.go')
  }

  const place = (slot: number, dir: Dir) => {
    if (guidedRejects(slot, dir)) return
    const p = [...progRef.current]
    // 這一格本來有卡（滿了換卡）：舊的跳回卡盒，新的放進來
    if (p[slot]) setFly([slot])
    p[slot] = dir
    slotGen.current[slot] = (slotGen.current[slot] ?? 0) + 1
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
    setFly([slot])
    sfx.tap()
    changed(p)
  }

  /**
   * 開錯之後：開錯的那張卡搖一搖，接著自己跳回卡盒，那一格空出來、亮起來（和「還有空格」時一樣的樣子）。
   * 孩子不用先學會「點程式列的卡可以拿掉」，只要像第一次一樣點一張卡，它就會放進亮起來的那一格。
   */
  const popOut = (slot: number) => {
    const p = [...progRef.current]
    if (!p[slot]) return
    p[slot] = null
    setFly([slot])
    sfx.whoosh()
    changed(p)
    setNeedSlot(slot)
  }

  const canTouch = () => !locked.current && !running.current && !card

  /**
   * 開場、車子在開、換題這些還不能玩的時候點下去（V-09、TOUCH-6）：不算作答、不打斷波波說話，
   * 但點的地方會出現一圈「看這裡」，再加一聲輕輕的點擊聲，孩子知道「有點到，只是現在先看」。
   */
  const lookHere = (e: PointerEvent) => {
    if (canTouch() || card || !rootEl.current) return
    const r = rootEl.current.getBoundingClientRect()
    const id = performance.now()
    sfx.tap()
    setLooks((l) => [...l.slice(-2), { id, x: e.clientX - r.left, y: e.clientY - r.top }])
    window.setTimeout(() => live.current && setLooks((l) => l.filter((k) => k.id !== id)), 800)
  }

  const palette = useTapDrag<Src>({
    enabled: canTouch,
    onPoke: () => idle.poke(),
    onTap: (s) => {
      if (s.from === 'slot') return removeAt(s.i)
      const empty = progRef.current.indexOf(null)
      if (empty >= 0) return place(empty, s.dir)
      // 放滿了（家長回饋：開錯後點對的卡完全沒反應，孩子只好一直按 Go）：點了一定看得到變化
      if (phaseRef.current === 'guided') {
        // 一起練只會放對的卡，滿了就是該按 Go：Go 外面閃一圈
        sfx.gentle()
        setGoPing((g) => g + 1)
        return void say('c.drive.go')
      }
      // 自己答：換掉開錯的那張；沒有標出錯的就換最後一張（舊的跳回卡盒，新的放進去）
      place(bugRef.current ?? progRef.current.length - 1, s.dir)
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
      // 兩格交換：卡片原地換位，不是跳回卡盒
      setFly([])
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
    setBugBoth(null)
    setNeedSlot(null)
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
      // 開到的動畫跑完、孩子看清楚了，才換「Your turn!」
      await wait(PACE.GUIDED_TO_QUIZ)
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
    // 車子一回到起點就可以改卡，不用等波波說完（這時點卡盒的卡，會直接換掉搖的那張）
    const my = stepRef.current
    setBugBoth(bugAt)
    locked.current = false
    await Promise.all([say('c.drive.fix'), wait(1500)])
    if (!live.current) return
    // 孩子還沒動手：開錯的卡自己跳回卡盒，空出來的那一格亮起來
    if (stepRef.current === my && bugRef.current === bugAt && !running.current) {
      popOut(bugAt)
      await say('c.drive.need')
    }
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
    // 一起練開到時已經停過了（GUIDED_TO_QUIZ），不用再多等
    if (live.current) next(PACE.NEXT_REVIEW)
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
      {/* 路面一直留在畫面上（不再每一題整塊卸載重掛），換題時只有車子、目的地、樹在裡面換；教學卡疊在上面淡入淡出 */}
      {p && t && (
        <motion.div
          ref={rootEl}
          className="drive"
          data-solution={import.meta.env.DEV ? p.solution.join(',') : undefined}
          style={{ pointerEvents: card ? 'none' : undefined }}
          onPointerDownCapture={lookHere}
          variants={background}
          initial="initial"
          animate={card ? 'hidden' : 'shown'}
        >
          {/* ── 路面 ── */}
          <div className="drive-board-area">
            {/* 只有格子數變了（升級）才換一塊路面：新的在上面淡入、舊的等新的蓋好才收掉，不會露出底色 */}
            <AnimatePresence initial={false}>
              <motion.div
                key={`${p.cols}x${p.rows}`}
                className="drive-board"
                style={{ '--cols': p.cols, '--rows': p.rows } as CSSProperties}
                {...handoff}
              >
                {Array.from({ length: p.cols * p.rows }, (_, k) => {
                  const c = { x: k % p.cols, y: Math.floor(k / p.cols) }
                  const isBlock = p.blocks.some((b) => b.x === c.x && b.y === c.y)
                  return (
                    <div key={k} className={`road-tile${isBlock ? ' is-block' : ''}`}>
                      <AnimatePresence initial={false}>
                        {isBlock && (
                          <motion.div key="block" className="tile-icon" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, transition: { duration: 0.22 } }} transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.3 }}>
                            <Emoji name={BLOCK_ICON} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
                {/* 車子、目的地、輪胎印放在路面內框裡（扣掉外框），座標才會對到格子中心 */}
                <div className="drive-layer">
                  {/* 起點：停車格的虛線框，換題時跟著車子移到新的起點 */}
                  <motion.i
                    className="park-mark"
                    aria-hidden="true"
                    style={{ width: `${100 / p.cols}%`, height: `${100 / p.rows}%` }}
                    initial={false}
                    animate={{ left: pct(p.start.x, p.cols), top: pct(p.start.y, p.rows) }}
                    transition={{ type: 'spring', stiffness: 150, damping: 20 }}
                  />
                  {/* 輪胎印：車子開過的路 */}
                  <svg className="drive-trail" viewBox={`0 0 ${p.cols * 100} ${p.rows * 100}`} preserveAspectRatio="none" aria-hidden="true">
                    <AnimatePresence>
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
                          exit={{ opacity: 0, transition: { duration: 0.3 } }}
                        />
                      )}
                    </AnimatePresence>
                  </svg>
                  {/* 目的地：換題時舊的縮掉、新的彈出來（同一個目的地就不動） */}
                  <AnimatePresence>
                    <motion.div
                      key={`${p.goal.x},${p.goal.y},${p.target}`}
                      className="drive-goal"
                      style={{ left: pct(p.goal.x, p.cols), top: pct(p.goal.y, p.rows), width: `${100 / p.cols}%`, height: `${100 / p.rows}%` }}
                      initial={{ scale: 0 }}
                      animate={arrivedAt === view ? { scale: [1, 1.2, 1], rotate: [0, -6, 6, 0] } : { scale: 1, rotate: 0 }}
                      exit={{ scale: 0, opacity: 0, transition: { duration: 0.26, ease: 'easeIn' } }}
                      // 新的目的地等舊的縮完才出來；彈簧幾乎不回彈：紙感螢幕上一次長到定位，不要大小來回晃好幾下
                      transition={arrivedAt === view ? { duration: 0.6 } : { type: 'spring', stiffness: 220, damping: 26, delay: 0.3 }}
                    >
                      <div className="tile-icon">
                        <Emoji name={t.icon} />
                      </div>
                      {arrivedAt === view && <Sparkles count={14} />}
                    </motion.div>
                  </AnimatePresence>
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
              </motion.div>
            </AnimatePresence>
          </div>

              {/* ── 程式列：卡片一張一張排好，最後按 Go ── */}
              <div className="prog-strip" style={intro ? DIM : LIVE}>
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
                        <AnimatePresence custom={fly.includes(i)}>
                          {d && (
                            <motion.button
                              key={`${i}-${d}-${slotGen.current[i] ?? 0}`}
                              custom={fly.includes(i)}
                              variants={slotCardOut}
                              className={`arrow-card in-slot${bug === i || (isWant && hintOn) ? ' is-bug' : ''}`}
                              aria-label={`第 ${i + 1} 張：${d}（點一下拿掉）`}
                              initial={{ scale: 0.4, opacity: 0, y: 30 }}
                              animate={bug === i ? { scale: 1, opacity: 1, y: 0, rotate: [0, -8, 8, -6, 6, 0] } : { scale: runAt === i ? 1.1 : 1, opacity: 1, y: 0, rotate: 0 }}
                              exit="exit"
                              transition={bug === i ? { rotate: { duration: 0.7, repeat: 1, repeatDelay: 0.9 } } : { type: 'spring', stiffness: 420, damping: 22 }}
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
                  {goPing > 0 && <motion.span key={goPing} className="go-ping" aria-hidden="true" initial={{ scale: 0.9, opacity: 0.9 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />}
                  {goGlow && <Hand x={66} y={62} size="9cqmin" beckon />}
                </motion.button>
              </div>

              {/* ── 卡盒：箭頭放在它指的那一邊 ── */}
              <div className="dpad" style={intro ? DIM : LIVE}>
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
                      {cardPing > 0 && intro && (
                        <motion.span key={cardPing} className="go-ping" style={{ borderRadius: '30%' }} aria-hidden="true" initial={{ scale: 0.95, opacity: 0.9 }} animate={{ scale: 1.35, opacity: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                      )}
                    </motion.button>
                  )
                })}
              </div>

              {/* 還不能玩時點的地方：一圈「看這裡」，擴開一次就消失 */}
              {looks.map((k) => (
                <motion.span
                  key={k.id}
                  className="go-ping"
                  aria-hidden="true"
                  style={{ left: k.x, top: k.y, inset: 'auto', width: '9cqmin', height: '9cqmin', translate: '-50% -50%', zIndex: 40 }}
                  initial={{ scale: 0.5, opacity: 0.85 }}
                  animate={{ scale: 1.3, opacity: 0 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}

              {/* 拖曳中跟著手指的卡 */}
              {palette.ghost && rootEl.current && (
                <div className="arrow-card ghost" style={{ left: palette.ghost.x - rootEl.current.getBoundingClientRect().left, top: palette.ghost.y - rootEl.current.getBoundingClientRect().top }} aria-hidden="true">
                  <ArrowArt dir={palette.ghost.item.dir} />
                </div>
              )}
        </motion.div>
      )}

      {/* 教學卡：在原地淡入、淡出，路面在後面淡掉（ui/motion.ts foreground／background） */}
      <AnimatePresence custom={reduced}>
        {card && (
          <motion.div
            key={`teach-${card.n}`}
            className="drive-teach-cam"
            custom={reduced}
            variants={foreground}
            initial="initial"
            animate="enter"
            exit="exit"
          >
            <TeachCard spec={card.spec} short={card.short} camera onDone={release} />
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}
