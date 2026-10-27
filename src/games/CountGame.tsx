import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Hand } from './Demo'
import { Emoji } from '../art/Emoji'
import { game as gameDef } from '../content/games'
import { COUNT_ICONS } from '../content/park'
import { level, markPlayed, needsDemo, plays, reportLevel } from '../lib/adaptive'
import { logAttempt, logTeach } from '../lib/record'
import { say, sfx, stopSpeech } from '../lib/audio'
import { pick, rand, shuffle } from '../lib/random'
import { scatter } from './layout'
import { praiseKey, retryKey, wait } from './lines'
import { useIdle } from './idle'
import type { Mood } from '../art/Dino'

const ROUNDS = 4
const RANGE: Record<number, [number, number]> = { 1: [1, 3], 2: [2, 5], 3: [4, 8], 4: [6, 10] }
/** 一局最多示範一次：數數的規則一樣，看一次就夠 */
const MAX_DEMO = 1

interface Round {
  n: number
  icon: string
  pos: { x: number; y: number }[]
  choices: number[]
}

function makeRound(lv: number): Round {
  const [a, b] = RANGE[lv]
  const n = a + rand(b - a + 1)
  const others = shuffle([n - 1, n + 1, n + 2, n - 2].filter((x) => x >= 1 && x <= 10)).slice(0, 2)
  return { n, icon: pick(COUNT_ICONS), pos: scatter(n, n > 6 ? 5 : 4, n > 4 ? 2 : 1), choices: shuffle([n, ...others]) }
}

/**
 * 點點數數：一個一個點，波波會跟著數；數完再選「總共幾個」。
 * 新的數量（或第一次玩）先由波波示範：手指一個一個點、邊點邊數，再換孩子。
 */
export function CountGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [round, setRound] = useState<Round | null>(null)
  const [counted, setCounted] = useState<number[]>([])
  const [ask, setAsk] = useState(false)
  const [wrong, setWrong] = useState<number[]>([])
  const [hint, setHint] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  /** 示範中：手指在第幾個物件上（null 表示沒有在示範） */
  const [finger, setFinger] = useState<number | null>(null)
  const [press, setPress] = useState(0)
  const [ping, setPing] = useState<{ i: number; k: number } | null>(null)
  const live = useRef(true)
  const busy = useRef(false)
  const t0 = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const extra = useRef(0)
  const lv = useRef(1)
  const first = useRef(0)
  const demos = useRef(0)
  const retaught = useRef(false)
  const firstPlay = useRef(plays(def.id) === 0)
  const stage = useRef<'count' | 'ask' | 'done'>('count')
  const idle = useIdle()
  /** 閒置第二段提示：下一個要數的物件慢慢發光 */
  const [nudge, setNudge] = useState(false)

  /** 波波數一次：手指依序點每一個，邊點邊念 */
  const countAlong = async (rd: Round, mark: boolean) => {
    // 示範好的數法：先上排再下排、由左到右，不跳來跳去，也不會漏數
    const path = rd.pos
      .map((p, i) => ({ p, i }))
      .sort((a, b) => Number(a.p.y > 50) - Number(b.p.y > 50) || a.p.x - b.p.x)
      .map((x) => x.i)
    for (let k = 0; k < rd.n; k++) {
      if (!live.current) return
      const i = path[k]
      setFinger(i)
      await wait(k === 0 ? 520 : 380)
      if (!live.current) return
      setPress((p) => p + 1)
      // 示範時物件會被標上數字（自己會跳一下）；重數時已經有數字了，另外讓它跳一下
      if (mark) setCounted((c) => [...c, i])
      else setPing({ i, k: Date.now() })
      sfx.count(k + 1)
      await say(`m.num.${k + 1}`)
    }
    if (!live.current) return
    await say(`teach.total.${rd.n}`)
  }

  const demo = async (rd: Round) => {
    const s = performance.now()
    demos.current++
    setMood('happy')
    await say('teach.watch.bobo')
    if (!live.current) return
    await countAlong(rd, true)
    if (!live.current) return
    setFinger(null)
    await wait(350)
    setCounted([])
    void logTeach({ station: 'math', game: def.id, itemId: String(rd.n), skill: `count:${rd.n}`, level: lv.current, ms: Math.round(performance.now() - s) })
    setMood('idle')
    await say('teach.turn.bobo')
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    const rd = makeRound(lv.current)
    setRound(rd)
    setCounted([])
    setAsk(false)
    setWrong([])
    setHint(false)
    setMood('idle')
    taps.current = []
    extra.current = 0
    retaught.current = false
    // 要示範的話，示範完才換孩子點；不示範就跟以前一樣，邊聽邊可以開始點
    const show = demos.current < MAX_DEMO && needsDemo(firstPlay.current && i === 0, `count:${rd.n}`)
    busy.current = show
    stage.current = 'count'
    idle.stop()
    setNudge(false)
    t0.current = performance.now()
    if (i === 0) await say(def.intro)
    else if (!show) await say('m.count.go')
    if (!live.current) return
    if (show) {
      await demo(rd)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
    }
    // 還在數（孩子可能邊聽邊已經數完了）才開始閒置計時：再唸一次題目 → 下一個要數的慢慢發光
    if (stage.current === 'count') idle.start({ repeat: () => void say('m.count.go'), hint: () => setNudge(true) })
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
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

  const finish = async (firstTry: boolean) => {
    if (!round) return
    stage.current = 'done'
    idle.stop()
    if (firstTry) first.current++
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: String(round.n),
      skill: `count:${round.n}`,
      phase: 'quiz',
      level: lv.current,
      options: lv.current >= 2 ? round.choices.map(String) : [],
      answer: String(round.n),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: Math.max(1, taps.current.length),
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: retaught.current,
      metrics: { recountTaps: extra.current, ...(retaught.current ? { retaught: 1 } : {}) },
    })
    reportLevel(def.id, firstTry, def.maxLevel)
    setMood('cheer')
    sfx.correct()
    await say(praiseKey('bobo'))
    await wait(300)
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  const tapObj = async (i: number) => {
    if (!round || ask || busy.current) return
    idle.poke()
    if (counted.includes(i)) {
      extra.current++
      sfx.gentle()
      return
    }
    const next = [...counted, i]
    setCounted(next)
    setNudge(false)
    sfx.count(next.length)
    if (next.length < round.n) return void say(`m.num.${next.length}`)
    busy.current = true
    idle.stop()
    await say(`m.num.${next.length}`, `m.total.${round.n}`)
    if (!live.current) return
    if (lv.current >= 2) {
      stage.current = 'ask'
      setAsk(true)
      busy.current = false
      t0.current = performance.now()
      await say('m.howmany')
      // 選數字也是同一套：15 秒再問一次 → 再 15 秒正確的數字慢慢發光
      if (live.current && stage.current === 'ask') idle.start({ repeat: () => void say('m.howmany'), hint: () => setHint(true) })
    } else finish(true)
  }

  const tapChoice = async (n: number) => {
    if (!round || busy.current) return
    idle.poke()
    if (wrong.includes(n)) return
    taps.current.push({ pick: String(n), ms: Math.round(performance.now() - t0.current) })
    if (n === round.n) {
      busy.current = true
      return finish(taps.current.length === 1)
    }
    sfx.gentle()
    setWrong((w) => [...w, n])
    if (taps.current.length < 2) {
      await say(retryKey('bobo'))
      // 「再試一次」說完才重新計時，不算在閒置提醒裡
      return idle.poke()
    }
    // 錯兩次：波波再數一次給孩子看，最後一個數字就是答案
    busy.current = true
    retaught.current = true
    idle.stop()
    await say('teach.again.bobo')
    await countAlong(round, false)
    if (!live.current) return
    setFinger(null)
    setHint(true)
    busy.current = false
  }

  // 閒置提示要發光的「下一個」：跟示範一樣，上排到下排、由左到右第一個還沒數的
  const nextObj =
    nudge && round && !ask
      ? round.pos
          .map((p, i) => ({ p, i }))
          .filter((x) => !counted.includes(x.i))
          .sort((a, b) => Number(a.p.y > 50) - Number(b.p.y > 50) || a.p.x - b.p.x)[0]?.i
      : undefined

  return (
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} onHost={() => {
        idle.poke()
        void say(ask ? 'm.howmany' : 'm.count.go')
      }}>
      {round && (
        <div key={r} style={{ position: 'absolute', inset: 0 }}>
          {round.pos.map((p, i) => {
            const order = counted.indexOf(i)
            const pinged = ping?.i === i
            return (
              <motion.button
                key={i}
                aria-label={`第 ${i + 1} 個`}
                style={{ position: 'absolute', left: `${p.x}%`, top: `${ask ? p.y * 0.55 : p.y}%`, width: round.n > 6 ? '12cqmin' : '17cqmin', aspectRatio: '1', translate: '-50% -50%' }}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: order >= 0 ? 0.92 : 1, rotate: 0, y: order >= 0 ? [0, -26, 0] : 0, opacity: order >= 0 ? 0.62 : 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16, delay: order >= 0 ? 0 : i * 0.06 }}
                onPointerDown={() => tapObj(i)}
              >
                {nextObj === i && <span className="nudge-glow" aria-hidden="true" />}
                <motion.div key={pinged ? ping!.k : 'still'} style={{ width: '100%', height: '100%' }} animate={pinged ? { y: [0, -18, 0] } : {}} transition={{ duration: 0.4 }}>
                  <Emoji name={round.icon} />
                </motion.div>
                {order >= 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ position: 'absolute', right: '-10%', top: '-12%', width: '44%', aspectRatio: '1', borderRadius: '50%', background: 'var(--ink)', color: 'var(--card)', display: 'grid', placeItems: 'center', fontFamily: 'Fredoka', fontWeight: 600, fontSize: 'min(5cqmin, 40px)' }}
                  >
                    {order + 1}
                  </motion.span>
                )}
              </motion.button>
            )
          })}
          <AnimatePresence>
            {finger !== null && round.pos[finger] && (
              <Hand key="finger" x={round.pos[finger].x + 1.5} y={(ask ? round.pos[finger].y * 0.55 : round.pos[finger].y) + 4} tap={press} size="11cqmin" cuff="#F0B088" />
            )}
          </AnimatePresence>
          {ask && (
            <div className="options" style={{ top: '46%', alignItems: 'flex-start' }}>
              {round.choices.map((n, i) => (
                <motion.button
                  key={n}
                  className={`tile${hint && n === round.n ? ' hint' : ''}`}
                  style={{ width: 'min(24cqh, 18cqw)' }}
                  aria-label={String(n)}
                  initial={{ y: 40, opacity: 0 }}
                  animate={wrong.includes(n) ? { x: [0, -12, 12, 0], opacity: 0.45 } : { y: 0, opacity: 1 }}
                  transition={{ delay: wrong.includes(n) ? 0 : i * 0.08 }}
                  onPointerDown={() => tapChoice(n)}
                >
                  <div className="tile-in">
                    <span className="glyph num">{n}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}
