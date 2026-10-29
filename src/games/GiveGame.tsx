import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Hand } from './Demo'
import { WaitShield, firstFinger } from './NotYet'
import { Egg } from '../art/Egg'
import { BasketBack, BasketFront, basketSlot } from '../art/Basket'
import { Sparkles } from '../ui/Sparkles'
import { game as gameDef } from '../content/games'
import { level, markPlayed, plays, reportLevel } from '../lib/adaptive'
import { logAttempt, logTeach } from '../lib/record'
import type { Phase } from '../lib/db'
import { preload, say, sfx, stopSpeech } from '../lib/audio'
import { praiseKey, wait } from './lines'
import { useIdle } from './idle'
import { PACE, nextPause } from './pace'
import { NUMBER_RANGE, useNumberPicker } from './sheet/NumberFlow'
import { DoneButton } from './sheet/DoneButton'
import type { Mood } from '../art/Dino'
import './sheet/sheet.css'

const ROUNDS = 4
/** 波波要的數量：從 1–3 開始，熟了延伸到 10 */

// 學習單座標 1000×600：左邊是草窩，右邊是籃子，完成鍵在籃子下面
const BASKET = { x: 580, y: 176, w: 370, h: 254 }
/** 籃子圖的座標（320 寬）放大到學習單上的比例 */
const BS = 370 / 320
const DROP = { x0: 540, x1: 980, y0: 110, y1: 470 }
const DONE = { x: 765, y: 500 }
const NEST = { x: 320, y: 350 }
const NEST_W = 82
const BASKET_W = 64

interface EggSpot {
  id: string
  x: number
  y: number
}

/** 草窩裡的蛋：放在窩上，一排四顆；先放中排、再前排、最後後排，有一點點錯開 */
function nestSpots(m: number): EggSpot[] {
  const ROW_Y = [-14, 46, -70]
  return Array.from({ length: m }, (_, i) => {
    const r = Math.floor(i / 4)
    const inRow = Math.min(4, m - r * 4)
    const c = i % 4
    return { id: `e${i}`, x: NEST.x + (c - (inRow - 1) / 2) * 100 + (r === 1 ? 20 : 0) + (Math.random() - 0.5) * 14, y: NEST.y + ROW_Y[r] + (Math.random() - 0.5) * 10 }
  })
}

function slotOf(i: number) {
  const s = basketSlot(i)
  return { x: BASKET.x + s.x * BS, y: BASKET.y + s.y * BS, back: s.back }
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/** 蛋的外形（和 art/Egg 同一條線），對話泡泡裡的空位用 */
const EGG_D = 'M100 14 C150 14 184 92 184 144 C184 194 148 222 100 222 C52 222 16 194 16 144 C16 92 50 14 100 14 Z'

/**
 * 波波頭上的對話泡泡：要幾顆蛋就畫幾個空的蛋形虛線框，旁邊寫大大的數字（盤點：要幾顆原本只有英文說）。
 * have 是泡泡裡填滿幾格：剛好填滿，泡泡變成綠框；比要的多，多的蛋排在格子下面、泡泡輕輕搖。
 * 不靠語言也不只靠數字：3 歲孩子看的是「把空格填滿」，數字跟著一起出現、一起熟。
 * 示範、一起練：籃子放一顆就填一格。自己答：放蛋時泡泡不動（要自己數），按勾勾後才一格一格填起來對答案；
 * mark 時把還空著的格子（少幾顆）、多出來的蛋（多幾顆）溫和地標出來。
 */
function WantBubble({ k, have, ping, mark = false }: { k: number; have: number; ping: number; mark?: boolean }) {
  const [scope, animate] = useAnimate()
  // 波波說「Give me N eggs!」時泡泡跳一下：聲音和泡泡連在一起
  useEffect(() => {
    if (ping && scope.current) void animate(scope.current, { scale: [1, 1.08, 1] }, { duration: 0.5, ease: [0.22, 1, 0.36, 1] })
  }, [ping, animate, scope])
  const rows = k > 5 ? 2 : 1
  const perRow = Math.ceil(k / rows)
  const over = have > k
  const full = have === k
  return (
    <motion.div
      className={`give-want${full ? ' is-full' : ''}`}
      aria-label={`要 ${k} 顆蛋`}
      animate={over ? { rotate: [0, -3, 3, -2, 2, 0] } : { rotate: 0 }}
      transition={over ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.7 } : { duration: 0.3 }}
    >
      <div ref={scope} className="give-want-in">
        <span className="give-want-num">{k}</span>
        <div className="give-want-eggs" style={{ gridTemplateColumns: `repeat(${perRow}, auto)` }}>
          {Array.from({ length: k }, (_, i) => {
            // 少給：還空著的格子換成暖色、一起輕輕呼吸，看得出還差幾顆
            const miss = mark && i >= have
            return (
            <div key={i} className="give-want-slot">
              <motion.svg
                viewBox="0 0 200 240"
                width="100%"
                aria-hidden="true"
                style={{ display: 'block', overflow: 'visible' }}
                animate={{ scale: miss ? [1, 1.14, 1] : 1 }}
                transition={miss ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
              >
                <path
                  d={EGG_D}
                  fill={miss ? 'rgba(233,154,132,.3)' : 'rgba(241,210,124,.22)'}
                  stroke={miss ? '#DD8466' : '#C9A23E'}
                  strokeWidth={12}
                  strokeDasharray="22 18"
                  strokeLinecap="round"
                />
              </motion.svg>
              <AnimatePresence>
                {i < have && (
                  <motion.div
                    key="egg"
                    className="give-want-egg"
                    initial={{ scale: 0.3, opacity: 0, y: -10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.3, opacity: 0, transition: { duration: 0.2 } }}
                    transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                  >
                    <Egg cracks={0} size="100%" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            )
          })}
        </div>
        {/* 多給：多出來的蛋排在格子外面，看得出多了幾顆 */}
        {over && (
          <div className="give-want-extra">
            {Array.from({ length: have - k }, (_, i) => (
              <motion.div
                key={i}
                className="give-want-slot"
                initial={{ scale: 0.3, opacity: 0, y: -10 }}
                animate={{ scale: 1, opacity: 1, y: 0, rotate: mark ? [0, -12, 12, -7, 7, 0] : 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18, rotate: { duration: 0.6, repeat: mark ? Infinity : 0, repeatDelay: 0.6 } }}
              >
                <Egg cracks={0} size="100%" />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/**
 * 給波波 N 顆蛋（數量感，benchmark 手法 4）：波波說「Give me three eggs!」，
 * 孩子把蛋一顆一顆點進（或拖進）籃子，每放一顆波波就數一個，數好了按綠色勾勾。
 * 多給：多的那幾顆輕輕搖、請孩子拿出來；少給：「More, please!」，下一顆蛋發光。
 * 新的數量先由波波示範：手一顆一顆放、邊放邊數，最後按勾勾，再換孩子。
 */
export function GiveGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [n, setN] = useState(0)
  const [eggs, setEggs] = useState<EggSpot[]>([])
  const [bag, setBag] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('quiz')
  const [scaffold, setScaffold] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [glow, setGlow] = useState<'next' | 'extra' | 'done' | null>(null)
  const [finger, setFinger] = useState<{ x: number; y: number; tap: number } | null>(null)
  const [party, setParty] = useState(0)
  /** 對話泡泡跳一下（波波說要幾顆的時候） */
  const [askPing, setAskPing] = useState(0)
  /**
   * 自己答：按勾勾後泡泡填到第幾格（對答案），mark 時標出少幾顆、多幾顆。
   * null 是還沒對答案：泡泡只有數字和空格，放蛋時不會跟著填，要孩子自己數。
   */
  const [tally, setTally] = useState<{ n: number; mark: boolean } | null>(null)
  /** 示範、說明、念題目中：學習單上蓋透明擋板，點了只出現「看這裡」的圈圈（準則 PHASE-2、PHASE-3） */
  const [hold, setHold] = useState(true)
  /** 閒置提示的手（不是示範）：孩子一動手就收起來 */
  const againHand = useRef(false)

  const live = useRef(true)
  const locked = useRef(true)
  const bagRef = useRef<string[]>([])
  const eggsRef = useRef<EggSpot[]>([])
  const nRef = useRef(0)
  const phaseRef = useRef<Phase>('quiz')
  const board = useRef<HTMLDivElement>(null)
  const active = useRef<{ id: string; pid: number; sx: number; sy: number; moved: boolean } | null>(null)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const wrongs = useRef({ few: 0, many: 0 })
  const hintUsed = useRef(false)
  const lv = useRef(1)
  const first = useRef(0)
  const demos = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)
  const resolver = useRef<(() => void) | null>(null)
  const idle = useIdle()
  /** 這一題剛走過示範或一起練：答對後多停一下再換題 */
  const taughtItem = useRef(false)
  const picker = useNumberPicker('give', def.id)
  /** 每換一個步驟就加一，舊步驟的計時器看到不一樣就不動作 */
  const step = useRef(0)

  const release = () => {
    const f = resolver.current
    resolver.current = null
    f?.()
  }

  const setBagBoth = (b: string[]) => {
    bagRef.current = b
    setBag(b)
  }

  const reset = (m: number) => {
    const e = nestSpots(m)
    eggsRef.current = e
    setEggs(e)
    setBagBoth([])
    setGlow(null)
    setTally(null)
    setScaffold(false)
    setDrag(null)
  }

  const supply = (k: number) => Math.min(12, Math.max(5, k + 2))

  const posOf = (id: string) => {
    const i = bagRef.current.indexOf(id)
    if (i >= 0) return { ...slotOf(i), w: BASKET_W }
    const e = eggsRef.current.find((x) => x.id === id)!
    return { x: e.x, y: e.y, back: false, w: NEST_W }
  }

  // ── 我示範：波波一顆一顆放進籃子、邊放邊數，最後按勾勾 ────────────
  const demo = async (k: number) => {
    const s = performance.now()
    demos.current++
    locked.current = true
    // 示範時泡泡跟著籃子一格一格填（看波波怎麼數）
    phaseRef.current = 'teach'
    setPhase('teach')
    setMood('happy')
    await say('teach.watch.bobo')
    setAskPing((p) => p + 1)
    for (let i = 0; i < k; i++) {
      if (!live.current) return
      const id = eggsRef.current.find((e) => !bagRef.current.includes(e.id))!.id
      const p = posOf(id)
      setFinger((f) => ({ x: p.x, y: p.y, tap: f?.tap ?? 0 }))
      await wait(i === 0 ? 560 : 420)
      if (!live.current) return
      setFinger((f) => ({ x: p.x, y: p.y, tap: (f?.tap ?? 0) + 1 }))
      setBagBoth([...bagRef.current, id])
      sfx.count(i + 1)
      await say(`m.num.${i + 1}`)
    }
    if (!live.current) return
    setFinger((f) => ({ x: DONE.x, y: DONE.y, tap: f?.tap ?? 0 }))
    await wait(520)
    setFinger((f) => ({ x: DONE.x, y: DONE.y, tap: (f?.tap ?? 0) + 1 }))
    sfx.correct()
    await say(`teach.total.${k}`)
    if (!live.current) return
    setFinger(null)
    // 籃子裡的蛋停留一下，孩子看完整的結果
    await wait(PACE.DEMO_HOLD)
    reset(supply(k))
    void logTeach({ station: 'math', game: def.id, itemId: String(k), skill: `give:${k}`, level: lv.current, ms: Math.round(performance.now() - s) })
    setMood('idle')
  }

  /** 閒置第二段、點恐龍：手在下一顆蛋上點一下、移到籃子（不會真的放），或在勾勾上點一下；之後停在那裡 */
  const showAgain = async () => {
    if (locked.current || active.current) return
    const k = nRef.current
    const c = bagRef.current.length
    if (phaseRef.current === 'quiz') hintUsed.current = true
    if (c > k) return setGlow('extra')
    againHand.current = true
    const my = step.current
    const ok = () => live.current && againHand.current && step.current === my
    if (c === k) {
      setFinger((f) => ({ x: DONE.x, y: DONE.y, tap: f?.tap ?? 0 }))
      await wait(520)
      if (ok()) setFinger((f) => f && { ...f, tap: f.tap + 1 })
      return
    }
    const egg = eggsRef.current.find((e) => !bagRef.current.includes(e.id))
    if (!egg) return
    setFinger((f) => ({ x: egg.x, y: egg.y, tap: f?.tap ?? 0 }))
    await wait(620)
    if (!ok()) return
    setFinger((f) => f && { ...f, tap: f.tap + 1 })
    await wait(500)
    if (!ok()) return
    const slot = slotOf(c)
    setFinger((f) => ({ x: slot.x, y: slot.y, tap: f?.tap ?? 0 }))
  }
  const dropAgain = () => {
    if (!againHand.current) return
    againHand.current = false
    setFinger(null)
  }

  /** 一起練或自己答：同一個 N，蛋重新擺好 */
  const ask = async (k: number, ph: Phase, afterGuide: boolean) => {
    phaseRef.current = ph
    setPhase(ph)
    reset(supply(k))
    setScaffold(ph === 'guided')
    taps.current = []
    wrongs.current = { few: 0, many: 0 }
    hintUsed.current = false
    setMood(ph === 'guided' ? 'happy' : 'idle')
    locked.current = true
    setHold(true)
    const done = ph === 'guided' ? new Promise<void>((res) => (resolver.current = res)) : null
    const my = ++step.current
    if (afterGuide) await say('teach.turn.bobo')
    if (live.current && step.current === my) {
      setAskPing((p) => p + 1)
      await say(`ws.give.${k}`)
    }
    if (!live.current || step.current !== my) return
    // 波波說完要幾顆才收（準則 PHASE-3、V-12）
    locked.current = false
    setHold(false)
    t0.current = performance.now()
    // 閒置：15 秒再說一次 → 再 15 秒手示範下一步（拿一顆蛋、或按勾勾）→ 之後每 40 秒手再安靜地示範一次
    idle.start({
      repeat: () => {
        setAskPing((p) => p + 1)
        void say(`ws.give.${k}`)
      },
      hint: () => void showAgain(),
    })
    if (done) await done
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    const [a, b] = NUMBER_RANGE.give[lv.current]
    const { n: k, fresh } = picker.pick(a, b)
    nRef.current = k
    setN(k)
    setMood('idle')
    idle.stop()
    locked.current = true
    setHold(true)
    reset(supply(k))
    preload([`ws.give.${k}`, `ws.want.${k}`, `teach.total.${k}`, 'ws.give.more', 'ws.give.toomany', 'ws.give.takeout', 'ws.give.thanks'])
    // 要示範的回合：開場只說「Watch me!」就示範，指令（Give me three!）留到示範之後
    if (i === 0 && !fresh) await say(def.intro)
    if (!live.current) return
    const walk = !fresh && firstPlay.current && i === 0
    if (fresh) {
      await demo(k)
      if (!live.current) return
    }
    taughtItem.current = fresh || walk
    if (fresh || walk) {
      await ask(k, 'guided', false)
      if (!live.current) return
    }
    return ask(k, 'quiz', fresh || walk)
  }

  useEffect(() => {
    live.current = true
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      start(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const put = (id: string, into: boolean) => {
    const b = bagRef.current
    if (into === b.includes(id)) return
    const nb = into ? [...b, id] : b.filter((x) => x !== id)
    setBagBoth(nb)
    setGlow(null)
    // 對過答案之後再動籃子：泡泡回到空格，重新自己數
    setTally(null)
    taps.current.push({ pick: `${into ? '+' : '-'}${nb.length}`, ms: Math.round(performance.now() - t0.current) })
    if (into) {
      sfx.count(nb.length)
      void say(`m.num.${nb.length}`)
    } else {
      sfx.pop()
      if (nb.length) void say(`m.num.${nb.length}`)
    }
  }

  /** 波波一顆一顆數籃子裡的蛋，數到的最後一個就是總數 */
  const countBasket = async () => {
    for (let i = 0; i < bagRef.current.length; i++) {
      if (!live.current) return
      const p = slotOf(i)
      setFinger((f) => ({ x: p.x, y: p.y, tap: (f?.tap ?? 0) + 1 }))
      sfx.count(i + 1)
      await say(`m.num.${i + 1}`)
    }
    setFinger(null)
  }

  /** 自己答按下勾勾：泡泡照籃子裡的蛋一格一格填起來（對答案），多的排到格子外面 */
  const tallyUp = async (c: number) => {
    for (let i = 1; i <= c; i++) {
      if (!live.current) return
      setTally({ n: i, mark: false })
      sfx.count(i)
      await wait(i === 1 ? 300 : 220)
    }
    await wait(260)
  }

  const finish = async () => {
    const k = nRef.current
    locked.current = true
    step.current++
    idle.stop()
    setGlow(null)
    setMood('cheer')
    setParty((p) => p + 1)
    sfx.correct()
    const ph = phaseRef.current
    const firstTry = wrongs.current.few + wrongs.current.many === 0 && !hintUsed.current
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: String(k),
      skill: `give:${k}`,
      phase: ph,
      level: lv.current,
      options: [],
      answer: String(k),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: 1 + wrongs.current.few + wrongs.current.many,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: ph === 'guided' || hintUsed.current,
      metrics: { tooFew: wrongs.current.few, tooMany: wrongs.current.many, moves: taps.current.length },
    })
    if (ph === 'guided') {
      await say(`teach.total.${k}`, praiseKey('bobo'))
      // 答對的動畫跑完、孩子看清楚了，才換「Your turn!」
      await wait(PACE.GUIDED_TO_QUIZ)
      return release()
    }
    if (firstTry) first.current++
    reportLevel(def.id, firstTry, def.maxLevel)
    await say(`teach.total.${k}`, 'ws.give.thanks')
    // 剛教的新數量多停一下，複習題維持輕快
    await wait(nextPause(taughtItem.current))
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  const check = async () => {
    if (locked.current) return
    idle.poke()
    dropAgain()
    const k = nRef.current
    const c = bagRef.current.length
    if (c === 0) {
      // 籃子還是空的就按勾勾：泡泡跳一下，指回「要放這麼多」
      setAskPing((p) => p + 1)
      return void say(`ws.give.${k}`)
    }
    taps.current.push({ pick: `done:${c}`, ms: Math.round(performance.now() - t0.current) })
    const guided = phaseRef.current === 'guided'
    locked.current = true
    // 自己答：放蛋時泡泡不動，按了勾勾才把格子填起來對答案（剛好就變綠框）
    if (!guided) {
      await tallyUp(c)
      if (!live.current) return
    }
    if (c === k) return finish()
    sfx.gentle()
    // 少給：空著的格子呼吸；多給：多的蛋在格子外面搖
    if (!guided) setTally({ n: c, mark: true })
    if (c < k) {
      if (!guided) wrongs.current.few++
      setGlow('next')
      setAskPing((p) => p + 1)
      await say(`ws.want.${k}`, 'ws.give.more')
    } else {
      if (!guided) wrongs.current.many++
      setGlow('extra')
      await say('ws.give.toomany', `ws.want.${k}`, 'ws.give.takeout')
    }
    if (!live.current) return
    // 自己答錯兩次：波波陪孩子數一次籃子裡的蛋，再把 N 個位置畫出來
    if (!guided && wrongs.current.few + wrongs.current.many >= 2 && !scaffold) {
      hintUsed.current = true
      await say('ws.count')
      await countBasket()
      if (!live.current) return
      setScaffold(true)
      await say(`ws.want.${k}`)
    }
    locked.current = false
    idle.poke()
  }

  // ── 拖曳或點：點一下就放進／拿出籃子；拖到籃子放開也可以 ──────────────
  const toBoard = (e: RPointerEvent | PointerEvent) => {
    const rc = board.current!.getBoundingClientRect()
    return { x: ((e.clientX - rc.left) / rc.width) * 1000, y: ((e.clientY - rc.top) / rc.height) * 600 }
  }
  const down = (id: string) => (e: RPointerEvent) => {
    // 兩根手指、手掌：只算第一根手指（準則 TOUCH-3）
    if (locked.current || active.current || !firstFinger(e.nativeEvent)) return
    idle.poke()
    dropAgain()
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {
      /* 拿不到 capture 也照樣可以點 */
    }
    active.current = { id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false }
  }
  const move = (e: RPointerEvent) => {
    const a = active.current
    if (!a || a.pid !== e.pointerId) return
    if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 14) return
    a.moved = true
    const p = toBoard(e)
    setDrag({ id: a.id, x: p.x, y: p.y })
  }
  const up = (e: RPointerEvent) => {
    const a = active.current
    if (!a || a.pid !== e.pointerId) return
    active.current = null
    setDrag(null)
    if (locked.current) return
    idle.poke()
    const inBag = bagRef.current.includes(a.id)
    if (!a.moved) return put(a.id, !inBag)
    const p = toBoard(e)
    const over = p.x > DROP.x0 && p.x < DROP.x1 && p.y > DROP.y0 && p.y < DROP.y1
    put(a.id, over)
  }

  const k = n
  // 一起練：還沒放滿時，下一顆蛋一直發光；自己答只有提示時才發光
  const nextEgg = glow === 'next' || (phase === 'guided' && bag.length < k && !finger) ? eggs.find((e) => !bag.includes(e.id))?.id : undefined
  return (
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} demo={hold && !!finger && !againHand.current} onHost={() => {
        if (locked.current) return
        idle.poke()
        setAskPing((p) => p + 1)
        // 點恐龍：再說一次要幾顆，手再示範一次下一步
        void say(`ws.give.${nRef.current}`)
        void showAgain()
      }}>
      <div className="sheet-area">
        <div ref={board} data-n={import.meta.env.DEV ? k : undefined} style={{ position: 'relative', width: 'min(100cqw, 166.67cqh)', aspectRatio: '5 / 3', containerType: 'size' }}>
          {/* 草窩 */}
          <svg className="sheet-svg" viewBox="0 0 1000 600" aria-hidden="true">
            <ellipse cx={NEST.x} cy={NEST.y + 50} rx={270} ry={100} fill="#E9CF9E" />
            <ellipse cx={NEST.x} cy={NEST.y + 40} rx={244} ry={78} fill="#F3DFB4" />
            {Array.from({ length: 18 }, (_, i) => {
              const a = (i / 18) * Math.PI * 2
              return <path key={i} d={`M${NEST.x - 18 + Math.cos(a) * 222} ${NEST.y + 50 + Math.sin(a) * 82} q${16 + (i % 3) * 6} -${10 + (i % 4) * 4} ${36 + (i % 2) * 10} 0`} fill="none" stroke="#D2B077" strokeWidth={5} strokeLinecap="round" />
            })}
          </svg>
          <div style={{ position: 'absolute', left: pct(BASKET.x, 1000), top: pct(BASKET.y, 600), width: pct(BASKET.w, 1000), height: pct(BASKET.h, 600), zIndex: 1 }}>
            <BasketBack />
          </div>
          {/* 一起練：籃子裡畫出 N 個蛋的位置（虛線），放滿就對了 */}
          {scaffold && (
            <svg className="sheet-svg" viewBox="0 0 1000 600" style={{ zIndex: 1 }} aria-hidden="true">
              {Array.from({ length: k }, (_, i) => {
                const p = slotOf(i)
                return <ellipse key={i} className="nudge-path" cx={p.x} cy={p.y} rx={BASKET_W * 0.48} ry={BASKET_W * 0.58} fill="rgba(241,210,124,.35)" stroke="#C9A23E" strokeWidth={4} strokeDasharray="8 8" />
              })}
            </svg>
          )}
          {eggs.map((e) => {
            const i = bag.indexOf(e.id)
            const dragging = drag?.id === e.id
            const p = dragging ? { x: drag.x, y: drag.y, back: false, w: i >= 0 ? BASKET_W : NEST_W } : posOf(e.id)
            const extra = glow === 'extra' && i >= k
            return (
              <motion.div
                key={e.id}
                role="button"
                aria-label="蛋"
                className={`give-egg${dragging ? ' dragging' : ''}`}
                // 籃子裡：前排蓋住後排、籃子前緣蓋住蛋；草窩上：越前面（y 越大）越上層
                style={{ zIndex: dragging ? 99 : i >= 0 ? (p.back ? 2 : 3) : p.y > NEST.y + 20 ? 7 : p.y > NEST.y - 40 ? 6 : 5 }}
                initial={false}
                animate={{
                  left: pct(p.x, 1000),
                  top: pct(p.y, 600),
                  width: pct(p.w, 1000),
                  rotate: extra ? [0, -12, 12, -8, 8, 0] : 0,
                  // 多給的蛋從籃子裡浮起來一點、輕輕搖，告訴孩子要拿出哪一顆
                  y: party && i >= 0 && i < k ? [0, -22, 0] : extra ? '-30%' : 0,
                }}
                transition={
                  dragging
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 300, damping: 24, rotate: { duration: 0.6, repeat: extra ? Infinity : 0, repeatDelay: 0.6 }, y: { duration: 0.4, delay: i * 0.05 } }
                }
                onPointerDown={down(e.id)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              >
                {(nextEgg === e.id || extra) && <span className="nudge-glow" aria-hidden="true" />}
                <Egg cracks={0} size="100%" />
              </motion.div>
            )
          })}
          <div style={{ position: 'absolute', left: pct(BASKET.x, 1000), top: pct(BASKET.y, 600), width: pct(BASKET.w, 1000), height: pct(BASKET.h, 600), zIndex: 4, pointerEvents: 'none' }}>
            <BasketFront />
            {party > 0 && <Sparkles key={party} count={14} />}
          </div>
          {/* 一起練：泡泡填滿了，換勾勾發光 */}
          <DoneButton x={pct(DONE.x, 1000)} y={pct(DONE.y, 600)} glow={glow === 'done' || (phase === 'guided' && k > 0 && bag.length === k && !finger)} onPress={check} />
          <AnimatePresence>{finger && <Hand key="finger" x={(finger.x / 1000) * 100 + 0.8} y={(finger.y / 600) * 100 + 2} tap={finger.tap} size="9cqmin" cuff="#F0B088" />}</AnimatePresence>
          <WaitShield on={hold} z={120} />
        </div>
      </div>
      {/* 對話泡泡在波波頭上（學習單外面、舞台左邊那一欄），不蓋到草窩和籃子 */}
      {k > 0 && <WantBubble k={k} have={phase === 'quiz' ? (tally?.n ?? 0) : bag.length} mark={phase === 'quiz' && !!tally?.mark} ping={askPing} />}
    </Shell>
  )
}
