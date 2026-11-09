import { nextStep } from '../../ui/NextStep'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../../games/NotYet'
import { onBlank, useFlow } from '../../games/barge'
import { scatter } from '../../games/layout'
import { praiseKey, wait } from '../../games/lines'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { logAttempt, logTeach } from '../../lib/record'
import { mastered } from '../../lib/adaptive'
import { say, sfx } from '../../lib/audio'
import { FADE } from '../../ui/motion'
import { FIRM, countRounds, lineUp, type CountRound } from './plan'
import { Fade, useLive, type PartCtx } from './kit'

interface Round extends CountRound {
  pos: { x: number; y: number }[]
}

/** 排好的位置：一排最多 5 個；6 個以上第一排 5 個、第二排是多出來的，靠左對齊（「5 和 1」）。左下角留給波波，所以從 x 30% 起排 */
const COLS = [30, 44, 58, 72, 86]
function rows(n: number): { x: number; y: number }[] {
  if (n <= FIRM) {
    const gap = Math.min(14, 60 / Math.max(1, n - 1))
    const x0 = 58 - (gap * (n - 1)) / 2
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * gap, y: 44 }))
  }
  return Array.from({ length: n }, (_, i) => ({ x: COLS[i % FIRM], y: i < FIRM ? 30 : 66 }))
}

/** 還沒熟的數量、6 個以上：排好再數（plan.ts 的 lineUp）；熟了的 5 以內才撒開 */
const place = (r: CountRound): Round => ({ ...r, pos: lineUp(r.n, mastered(`count:${r.n}`)) ? rows(r.n) : scatter(r.n, 4, r.n > 4 ? 2 : 1) })

/** 數的順序：先上排再下排、由左到右（示範和「下一個」的提示都照這個，不跳來跳去） */
const order = (r: Round) =>
  r.pos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.y > 50) - Number(b.p.y > 50) || a.p.x - b.p.x)
    .map((x) => x.i)

const countLine = (r: CountRound) => (r.n === 1 ? 'ma.count' : `ma.count.${r.icon}`)

/**
 * 數數（點點數數 CountGame 的做法）：一個一個點，每點一下波波念一個數字，最後一個強調「There are three!」。
 * 新的數字第一回合波波先示範（手指一個一個點、邊點邊數）。
 * 搶點（T-108，games/barge.ts）：示範中、說「Let's count…」的時候點了東西：停掉語音、示範收掉，他點的那一個就是 1；
 * 點空白：停掉語音，手馬上指著第一個要數的。數到最後一個之後的總數、稱讚不能搶。
 * 點過的再點：輕輕一聲，不重算。
 */
export function CountPart({ ctx }: { ctx: PartCtx }) {
  const [rounds] = useState(() => countRounds(ctx.lesson).map(place))
  const [r, setR] = useState(0)
  const [counted, setCountedState] = useState<number[]>([])
  /** 點擊時讀得到最新的（被搶掉的示範要馬上清空，不能讀到畫面上那一輪的舊值） */
  const countedRef = useRef<number[]>([])
  const setCounted = (f: number[] | ((c: number[]) => number[])) => {
    countedRef.current = typeof f === 'function' ? f(countedRef.current) : f
    setCountedState(countedRef.current)
  }
  const [finger, setFinger] = useState<number | null>(null)
  const [press, setPress] = useState(0)
  const [hold, setHold] = useState(true)
  /** 輪到孩子：hand＝手在下一個要數的上面輕輕點（剛示範過）；glow＝下一個發光 */
  const [lead, setLead] = useState<'hand' | 'glow' | null>(null)
  const [tapAgain, setTapAgain] = useState(0)
  /** 數完了：最後一個號碼牌跳一下 */
  const [last, setLast] = useState(false)
  const live = useLive()
  /** demo 示範、intro 說明（這兩段可以搶）；turn 輪到孩子；done 數完了（不能搶） */
  const phase = useRef<'demo' | 'intro' | 'turn' | 'done'>('intro')
  /** 這一回合剛出來的 0.5 秒過了（PACE.BARGE_ARM） */
  const armed = useRef(false)
  const armTimer = useRef(0)
  const flow = useFlow()
  const notYet = useNotYet()
  const box = useRef<HTMLDivElement | null>(null)
  const tapped = useRef(false)
  const recount = useRef(0)
  const t0 = useRef(0)
  const idle = useIdle()
  const round = rounds[r]
  const demoing = useRef(false)
  const showing = (on: boolean) => {
    demoing.current = on
    ctx.demo(on)
  }

  /** 波波數一次：手指照順序點每一個，邊點邊念，最後「There are three!」 */
  const countAlong = async (rd: Round, ok: () => boolean) => {
    const path = order(rd)
    for (let k = 0; k < rd.n; k++) {
      if (!ok()) return
      setFinger(path[k])
      await wait(k === 0 ? 520 : 380)
      if (!ok()) return
      setPress((p) => p + 1)
      setCounted((c) => [...c, path[k]])
      sfx.count(k + 1)
      await say(`m.num.${k + 1}`)
    }
    if (!ok()) return
    setFinger(null)
    setLast(true)
    ctx.ping()
    await say(`teach.total.${rd.n}`)
  }

  /** 輪到孩子（說完、或被搶掉）：手指著第一個要數的，開始計時 */
  const openTurn = () => {
    phase.current = 'turn'
    if (!t0.current) t0.current = performance.now()
    // 輪到孩子：一律用手指著第一個要數的（只有發光，三歲看不出要點它）
    if (!tapped.current) setLead('hand')
    idle.start({ repeat: () => void say('m.count.go'), hint: nudge })
  }

  /** 孩子搶點：停掉語音、示範收掉（數到一半的號碼清掉），直接輪到他 */
  const takeOver = () => {
    const was = phase.current
    flow.cut()
    if (was === 'demo') {
      setFinger(null)
      setCounted([])
      setLast(false)
      showing(false)
      ctx.mood('idle')
    }
    openTurn()
  }

  const start = async (i: number) => {
    const rd = rounds[i]
    const ok = flow.begin(live)
    setCounted([])
    setLast(false)
    setLead(null)
    setTapAgain(0)
    tapped.current = false
    recount.current = 0
    t0.current = 0
    phase.current = rd.demo ? 'demo' : 'intro'
    armed.current = false
    setHold(true)
    clearTimeout(armTimer.current)
    // 這一回合剛出來的 0.5 秒：上一回合連點的手指先不算，之後說明、示範都可以搶
    armTimer.current = window.setTimeout(() => {
      if (!live.current || phase.current === 'done') return
      armed.current = true
      setHold(false)
    }, PACE.BARGE_ARM)
    idle.stop()
    ctx.mood('idle')
    if (rd.demo) {
      const s = performance.now()
      showing(true)
      ctx.mood('happy')
      // 開場一句就好：直接「Watch me!」，數的時候就看得到數的是什麼（T-108）
      await say('teach.watch.bobo')
      if (!ok()) return
      await countAlong(rd, ok)
      if (!ok()) return
      await wait(PACE.DEMO_HOLD)
      if (!ok()) return
      setCounted([])
      setLast(false)
      showing(false)
      ctx.mood('idle')
      phase.current = 'intro'
      void logTeach({ station: 'math', game: 'm-count', itemId: String(rd.n), skill: `count:${rd.n}`, level: 1, ms: Math.round(performance.now() - s) })
      await say('teach.turn.bobo')
    } else {
      // 換一種東西再數（第一天數字是 1：畫面上突然只剩一隻恐龍）：也要明白告訴他「換你了」（T-107 真人試玩：大人、孩子都不知道要做什麼）
      await say(countLine(rd))
      if (!ok()) return
      if (rd.n <= 2) await say('teach.turn.bobo')
    }
    if (!ok()) return
    openTurn()
  }

  /** 閒置第二段、點波波：手在下一個要數的上面點一下 */
  const nudge = () => {
    if (phase.current !== 'turn') return
    setLead('hand')
    setTapAgain((n) => n + 1)
  }

  useEffect(() => {
    const boot = window.setTimeout(() => start(0), 0)
    const mine = () => {
      if (phase.current !== 'turn') return
      idle.poke()
      void say('m.count.go')
      nudge()
    }
    ctx.host.current = mine
    return () => {
      clearTimeout(boot)
      clearTimeout(armTimer.current)
      idle.stop()
      // 淡出中的這一段比下一段晚卸載：只收自己的，不要清掉下一段的
      if (ctx.host.current === mine) ctx.host.current = null
      if (demoing.current) ctx.demo(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 說明、示範的時候點空白：停掉語音，手馬上指著第一個要數的 */
  const blank = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!armed.current || phase.current === 'done' || phase.current === 'turn' || !onBlank(e.target) || !box.current) return
    const p = localPoint(box.current, e.clientX, e.clientY)
    notYet.ping(p.x, p.y)
    takeOver()
  }

  const tapObj = async (i: number) => {
    if (!armed.current || phase.current === 'done') return
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    const counted = countedRef.current
    if (counted.includes(i)) {
      recount.current++
      sfx.gentle()
      return
    }
    const next = [...counted, i]
    tapped.current = true
    setCounted(next)
    setLead(null)
    sfx.count(next.length)
    if (next.length < round.n) return void say(`m.num.${next.length}`)
    // 最後一個：念數字，再強調「There are three!」，右上角今天的數字跟著跳一下（這之後不能再點，作答在點下去的這一刻就記）
    phase.current = 'done'
    idle.stop()
    void logAttempt({
      station: 'math',
      game: 'm-count',
      itemId: String(round.n),
      skill: `count:${round.n}`,
      phase: 'quiz',
      level: 1,
      options: [],
      answer: String(round.n),
      taps: [],
      firstTryCorrect: true,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { recountTaps: recount.current, lesson: ctx.lesson.n },
    })
    await say(`m.num.${next.length}`)
    if (!live.current) return
    setLast(true)
    ctx.ping()
    await say(`m.total.${round.n}`)
    if (!live.current) return
    ctx.mood('cheer')
    sfx.correct()
    await say(praiseKey('bobo'))
    await wait(PACE.NEXT_NEW)
    if (!live.current) return
    if (r + 1 >= rounds.length) return ctx.done(rounds.length, 0)
    // 停在做完的樣子，等孩子點「下一步」才換下一個（T-118：不自己換）
    if (!(await nextStep()) || !live.current) return
    setR(r + 1)
    start(r + 1)
  }

  const path = order(round)
  const nextObj = lead ? path.find((i) => !counted.includes(i)) : undefined
  const big = round.n > 6
  return (
    <Fade id={r}>
      <div className="ma-count" ref={box} onPointerDown={blank}>
        {round.pos.map((p, i) => {
          const k = counted.indexOf(i)
          const isLast = last && k === round.n - 1
          return (
            <motion.button
              key={i}
              className={`ma-thing${big ? ' small' : ''}${k >= 0 ? ' on' : ''}`}
              aria-label={`第 ${i + 1} 個`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: k >= 0 ? [0, -22, 0] : 0 }}
              transition={k >= 0 ? { duration: 0.42 } : { ...FADE, delay: i * 0.05 }}
              onPointerDown={(e) => firstFinger(e.nativeEvent) && tapObj(i)}
            >
              {nextObj === i && lead === 'glow' && <span className="nudge-glow" aria-hidden="true" />}
              <Emoji name={round.icon} />
              {k >= 0 && (
                <motion.span
                  className={`ma-badge${isLast ? ' last' : ''}`}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={isLast ? { opacity: 1, scale: [1, 1.4, 1.15] } : { opacity: 1, scale: 1 }}
                  transition={isLast ? { duration: 0.6 } : { duration: 0.2 }}
                >
                  {k + 1}
                </motion.span>
              )}
            </motion.button>
          )
        })}
        <AnimatePresence>
          {finger !== null && round.pos[finger] && <Hand key="finger" x={round.pos[finger].x + 1.5} y={round.pos[finger].y + 4} tap={press} size="11cqmin" cuff="#F0B088" />}
          {finger === null && lead === 'hand' && nextObj !== undefined && round.pos[nextObj] && (
            <Hand key="lead" x={round.pos[nextObj].x + 1.5} y={round.pos[nextObj].y + 4} size="11cqmin" beckon={!tapAgain} tap={tapAgain} />
          )}
        </AnimatePresence>
        {notYet.view}
        <WaitShield on={hold} />
      </div>
    </Fade>
  )
}
