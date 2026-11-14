import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../../games/NotYet'
import { useFlow } from '../../games/barge'
import { wait } from '../../games/lines'
import { PACE } from '../../games/pace'
import { say, sfx } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { EASE } from '../../ui/motion'
import { countIcons } from './plan'
import { spots, subRound, type Layout } from './sub-plan'
import { noteSubDemo } from './stage4-store'
import type { SubLevel } from './stage4'
import { Quiz, useLive, type PartCtx, type QuizResult } from './kit'

/** 一組點點或東西（閃的那一組是點點；卡片上是數數用的圖）。五格框畫出 5 格的框 */
function Group({ n, layout, icon, lit }: { n: number; layout: Layout; icon?: string; lit?: number }) {
  return (
    <div className={`ma-sub-group${layout === 'frame' ? ' frame' : ''}`} data-sub-n={n} data-sub-layout={layout}>
      {layout === 'frame' && (
        <div className="ma-sub-frame" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      )}
      {spots(n, layout).map((p, i) => (
        <span key={i} className={`ma-sub-dot${icon ? ' is-icon' : ''}${lit != null && i < lit ? ' lit' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          {icon ? <Emoji name={icon} /> : null}
          {lit != null && i < lit && <b className="ma-sub-k">{i + 1}</b>}
        </span>
      ))}
    </div>
  )
}

/**
 * 一眼看出幾個（T-150 M，./sub-plan.ts）：小遊戲段裡的一題。
 * 1. 波波說「Look!」，布掀開：點點亮 flash 毫秒（2～3 秒，不短於 1.5 秒），布蓋回去。閃的時候點畫面：不會怎樣（輕輕的圈圈）。
 * 2. 「How many? Find the same!」下面 3 張卡（第 1 級 2 張）：另一種東西、另一種排法，點跟剛剛一樣多的（kit.tsx 的 Quiz：搶點、閒置、點錯兩次手指答案）。
 *    布蓋著的時候點布不會掀開；點波波：再閃一次（Look again!），這一題就不算第一次答對。
 * 3. 答錯：布掀開、「Look! Three.」再問一次。答對：布掀開，點點一個一個亮、一起數「One, two, three. Three!」。
 * 第一次出：手先示範（布掀開讓他看，那一題記 guided）。記 sub:N（game math-sub）；不算進「錯很多隔天重上」。
 */
export function SubitizePart({ ctx, level, demo, flash, onDone }: { ctx: PartCtx; level: SubLevel; demo: boolean; flash: number; onDone: (opts?: { cue?: boolean }) => void }) {
  const [round] = useState(() => subRound(level, countIcons(3)))
  /** flash：第一次閃；cover：蓋著（出題）；open：掀開（答錯、示範、答對以後） */
  const [cloth, setCloth] = useState<'flash' | 'cover' | 'open'>('flash')
  const [ask, setAsk] = useState(false)
  const [lit, setLit] = useState<number | undefined>(undefined)
  const [hold, setHold] = useState(true)
  const peeked = useRef(false)
  const over = useRef(false)
  const live = useLive()
  const flow = useFlow()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  /** Quiz 自己的「點波波」（再念一次題目）：這一題改成再閃一次，所以給 Quiz 一個不用的 */
  const quizHost = useRef<(() => void) | null>(null) as MutableRefObject<(() => void) | null>

  const flashOnce = async (ms: number) => {
    setCloth('flash')
    await wait(ms)
    if (!live.current || over.current) return
    setCloth((c) => (c === 'open' ? c : 'cover'))
  }

  useEffect(() => {
    const boot = window.setTimeout(async () => {
      const ok = flow.begin(live)
      sfx.pop()
      void say('ma.sub.peek')
      await wait(flash)
      if (!ok()) return
      setCloth('cover')
      await wait(350)
      if (!live.current) return
      setAsk(true)
    }, 0)
    const arm = window.setTimeout(() => setHold(false), PACE.BARGE_ARM)
    return () => {
      clearTimeout(boot)
      clearTimeout(arm)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 點波波：再閃一次（這一題不算第一次答對）。題目出來以前點波波不理（正在閃）
  useEffect(() => {
    if (!ask) return
    const mine = () => {
      if (over.current) return
      if (cloth === 'open') return void say('ma.sub.ask')
      peeked.current = true
      void say('ma.sub.again')
      void flashOnce(flash)
    }
    ctx.host.current = mine
    return () => {
      if (ctx.host.current === mine) ctx.host.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, cloth])

  /** 掀開、一個一個亮著一起數（One, two, three. Three!） */
  const countAll = async () => {
    setCloth('open')
    for (let k = 1; k <= round.n; k++) {
      if (!live.current) return
      setLit(k)
      await say(`m.num.${k}`)
    }
    if (!live.current) return
    await wait(200)
    await say(`m.num.${round.n}`)
  }

  const answered = async (r: QuizResult) => {
    over.current = true
    const guided = demo || r.shown || r.led
    void logAttempt({
      station: 'math',
      game: 'math-sub',
      itemId: `${round.n}-${round.layout}`,
      skill: `sub:${round.n}`,
      phase: guided ? 'guided' : 'quiz',
      level,
      options: round.cards.map((c) => String(c.n)),
      answer: String(round.n),
      taps: r.taps,
      // 再閃過一次（點波波）就不算第一次答對
      firstTryCorrect: r.firstTry && !peeked.current,
      attempts: r.taps.length,
      responseMs: r.ms,
      hintUsed: r.hinted,
      heard: r.heard,
      metrics: { lesson: ctx.lesson.n, flash, ...(peeked.current ? { peek: 1 } : {}), ...(r.hinted ? { retaught: 1 } : {}), ...(r.shown ? { shown: 1 } : r.led ? { led: 1 } : {}) },
    })
    if (demo) noteSubDemo()
    const ok = flow.begin(live)
    await countAll()
    if (!ok()) return
    ctx.ping()
    await wait(300)
    if (live.current) onDone()
  }

  /** 閃的時候點畫面：輕輕的圈圈，不會怎樣（出題以後點空白交給 Quiz：停掉語音、黃框亮） */
  const tapBoard = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!layer.current || !firstFinger(e.nativeEvent)) return
    const p = localPoint(layer.current, e.clientX, e.clientY)
    notYet.ping(p.x, p.y)
  }

  const board = (
    <div className="ma-sub-board" data-sub-cloth={cloth}>
      <Group n={round.n} layout={round.layout} lit={lit} />
      <motion.div
        className="ma-sub-cloth"
        aria-hidden="true"
        initial={false}
        animate={{ y: cloth === 'cover' ? '0%' : '-104%' }}
        transition={{ duration: 0.35, ease: EASE.out }}
      />
    </div>
  )

  return (
    <div className="ma-sub" ref={layer} data-sub={round.n} data-sub-level={level} data-sub-ask={ask ? '1' : undefined}>
      {!ask ? (
        <div className="ma-sub-stage" onPointerDown={tapBoard}>
          {board}
        </div>
      ) : (
        <Quiz
          host={quizHost}
          onDone={answered}
          showing={(on) => {
            ctx.demo(on)
            // 示範：布掀開讓他看手怎麼對
            if (on) setCloth('open')
          }}
          spec={{
            id: 'sub',
            demo,
            prompt: ['ma.sub.ask'],
            correction: [`m.num.${round.n}`],
            // 點錯：布掀開，「Look! Three.」再問一次
            wrong: () => {
              setCloth('open')
              return ['ma.sub.peek', `m.num.${round.n}`]
            },
            answer: String(round.n),
            top: board,
            options: round.cards.map((c) => ({
              id: String(c.n),
              label: `${c.n} 個`,
              view: <Group n={c.n} layout={c.layout} icon={c.icon} />,
            })),
          }}
        />
      )}
      {notYet.view}
      <WaitShield on={hold} />
    </div>
  )
}
