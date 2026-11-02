import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger } from '../../games/NotYet'
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
 * 新的數字第一回合波波先示範（手指一個一個點、邊點邊數），示範中孩子點了只出現「看這裡」，不算數。
 * 點過的再點：輕輕一聲，不重算。
 */
export function CountPart({ ctx }: { ctx: PartCtx }) {
  const [rounds] = useState(() => countRounds(ctx.lesson).map(place))
  const [r, setR] = useState(0)
  const [counted, setCounted] = useState<number[]>([])
  const [finger, setFinger] = useState<number | null>(null)
  const [press, setPress] = useState(0)
  const [hold, setHold] = useState(true)
  /** 輪到孩子：hand＝手在下一個要數的上面輕輕點（剛示範過）；glow＝下一個發光 */
  const [lead, setLead] = useState<'hand' | 'glow' | null>(null)
  const [tapAgain, setTapAgain] = useState(0)
  /** 數完了：最後一個號碼牌跳一下 */
  const [last, setLast] = useState(false)
  const live = useLive()
  const busy = useRef(true)
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
  const countAlong = async (rd: Round) => {
    const path = order(rd)
    for (let k = 0; k < rd.n; k++) {
      if (!live.current) return
      setFinger(path[k])
      await wait(k === 0 ? 520 : 380)
      if (!live.current) return
      setPress((p) => p + 1)
      setCounted((c) => [...c, path[k]])
      sfx.count(k + 1)
      await say(`m.num.${k + 1}`)
    }
    if (!live.current) return
    setFinger(null)
    setLast(true)
    ctx.ping()
    await say(`teach.total.${rd.n}`)
  }

  const start = async (i: number) => {
    const rd = rounds[i]
    setCounted([])
    setLast(false)
    setLead(null)
    setTapAgain(0)
    tapped.current = false
    recount.current = 0
    busy.current = true
    setHold(true)
    idle.stop()
    ctx.mood('idle')
    if (rd.demo) {
      const s = performance.now()
      showing(true)
      ctx.mood('happy')
      await say(countLine(rd), 'teach.watch.bobo')
      if (!live.current) return
      await countAlong(rd)
      if (!live.current) return
      await wait(PACE.DEMO_HOLD)
      if (!live.current) return
      setCounted([])
      setLast(false)
      showing(false)
      ctx.mood('idle')
      void logTeach({ station: 'math', game: 'm-count', itemId: String(rd.n), skill: `count:${rd.n}`, level: 1, ms: Math.round(performance.now() - s) })
      await say('teach.turn.bobo')
    } else await say(countLine(rd))
    if (!live.current) return
    busy.current = false
    setHold(false)
    t0.current = performance.now()
    if (!tapped.current) setLead(rd.demo ? 'hand' : 'glow')
    idle.start({ repeat: () => void say('m.count.go'), hint: nudge })
  }

  /** 閒置第二段、點波波：手在下一個要數的上面點一下 */
  const nudge = () => {
    if (busy.current) return
    setLead('hand')
    setTapAgain((n) => n + 1)
  }

  useEffect(() => {
    const boot = window.setTimeout(() => start(0), 0)
    const mine = () => {
      if (busy.current) return
      idle.poke()
      void say('m.count.go')
      nudge()
    }
    ctx.host.current = mine
    return () => {
      clearTimeout(boot)
      idle.stop()
      // 淡出中的這一段比下一段晚卸載：只收自己的，不要清掉下一段的
      if (ctx.host.current === mine) ctx.host.current = null
      if (demoing.current) ctx.demo(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tapObj = async (i: number) => {
    if (busy.current) return
    idle.poke()
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
    // 最後一個：念數字，再強調「There are three!」，右上角今天的數字跟著跳一下
    busy.current = true
    idle.stop()
    await say(`m.num.${next.length}`)
    if (!live.current) return
    setLast(true)
    ctx.ping()
    await say(`m.total.${round.n}`)
    if (!live.current) return
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
    ctx.mood('cheer')
    sfx.correct()
    await say(praiseKey('bobo'))
    await wait(PACE.NEXT_NEW)
    if (!live.current) return
    if (r + 1 >= rounds.length) return ctx.done(rounds.length, 0)
    setR(r + 1)
    start(r + 1)
  }

  const path = order(round)
  const nextObj = lead ? path.find((i) => !counted.includes(i)) : undefined
  const big = round.n > 6
  return (
    <Fade id={r}>
      <div className="ma-count">
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
        <WaitShield on={hold} />
      </div>
    </Fade>
  )
}
