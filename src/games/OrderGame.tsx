import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Hand } from './Demo'
import { WaitShield, firstFinger } from './NotYet'
import { game as gameDef } from '../content/games'
import { level, markPlayed, plays, reportLevel, unlockedNumbers } from '../lib/adaptive'
import { planOrder, roundState } from './pick'
import { logAttempt, logTeach } from '../lib/record'
import { say, sfx, stopSpeech } from '../lib/audio'
import { scatter } from './layout'
import { praiseKey, retryKey, wait } from './lines'
import { useIdle } from './idle'
import { PACE, nextPause } from './pace'
import type { Mood } from '../art/Dino'
import { Swap } from '../ui/Scenes'

const ROUNDS = 3
const TINTS = ['#F6DE95', '#F3C1B2', '#C9E4D4', '#D3E3F3', '#E2DAF1', '#F8DCC8']

/**
 * 照順序：1、2、3…依序點數字，點對的數字會排到上面的小火車裡。
 * 第一次玩（或沒學過的長度）先由波波示範點 1、2、3，再換孩子。
 */
/** 點錯的「Try again!」最少隔多久才再說一次 */
const RETRY_GAP_MS = 4000

export function OrderGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [k, setK] = useState(3)
  const [pos, setPos] = useState<{ x: number; y: number }[]>([])
  const [next, setNext] = useState(1)
  const [hint, setHint] = useState(false)
  const [shake, setShake] = useState(0)
  const [mood, setMood] = useState<Mood>('idle')
  const live = useRef(true)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const wrongs = useRef(0)
  const lv = useRef(1)
  const first = useRef(0)
  const busy = useRef(true)
  const nextRef = useRef(1)
  const retrySaid = useRef(-Infinity)
  const idle = useIdle()
  const round0 = useRef(roundState(plays(def.id) === 0))
  /** 這一輪先示範過：答對後多停一下再換題 */
  const shown = useRef(false)
  /** 示範中：手指指著哪個數字（null 表示沒有在示範） */
  const [finger, setFinger] = useState<number | null>(null)
  const [press, setPress] = useState(0)
  /** 示範、說明中：數字卡上蓋透明擋板，點了只出現「看這裡」的圈圈（準則 PHASE-2） */
  const [hold, setHold] = useState(true)
  /** 閒置提示、點恐龍：手在下一個數字上點一下（null 表示沒有），孩子一點就收起來 */
  const [again, setAgain] = useState<number | null>(null)

  /** 波波示範點 1、2、3，再把數字放回去換孩子 */
  const demo = async (n: number) => {
    const s = performance.now()
    setMood('happy')
    await say('teach.watch.bobo')
    const upto = Math.min(3, n)
    for (let m = 1; m <= upto; m++) {
      if (!live.current) return
      setFinger(m)
      await wait(m === 1 ? 560 : 420)
      if (!live.current) return
      setPress((p) => p + 1)
      sfx.count(m)
      setNext(m + 1)
      await say(`m.num.${m}`)
    }
    if (!live.current) return
    setFinger(null)
    // 排好的 1、2、3 停留一下，孩子看完整的結果
    await wait(PACE.DEMO_HOLD)
    setNext(1)
    void logTeach({ station: 'math', game: def.id, itemId: `1-${n}`, skill: `order:${n}`, level: lv.current, ms: Math.round(performance.now() - s) })
    setMood('idle')
    // 指令放在示範之後，說完「Your turn!」才開放（準則 PHASE-3）
    await say('m.order.start', 'teach.turn.bobo')
  }

  /** 閒置第二段、點恐龍：下一個數字亮起來，手移過去點一下，之後停在那裡 */
  const showNext = () => {
    if (busy.current) return
    setHint(true)
    setAgain(nextRef.current)
    setPress((p) => p + 1)
  }

  const start = async (i: number) => {
    busy.current = true
    lv.current = level(def.id)
    // 這一輪排到幾、要不要先示範（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { n, show } = planOrder(def.id, lv.current, unlockedNumbers(), round0.current, i)
    shown.current = show
    const layout = scatter(n, n > 5 ? 5 : 4, 2).map((p) => ({ ...p, y: 28 + p.y * 0.7 }))
    setK(n)
    setPos(layout)
    setNext(1)
    setHint(false)
    setMood('idle')
    taps.current = []
    wrongs.current = 0
    // 要示範的話，示範完才換孩子點；不示範就跟以前一樣，邊聽邊可以開始點
    busy.current = show
    setHold(show)
    setAgain(null)
    nextRef.current = 1
    idle.stop()
    t0.current = performance.now()
    // 要示範的回合：開場只說「Watch me!」就示範，「1, 2, 3…」的指令留到示範之後
    if (!show) await say(i === 0 ? def.intro : 'm.order.start')
    if (!live.current) return
    if (show) {
      await demo(n)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
      setHold(false)
    }
    // 閒置：15 秒再唸一次「Where is 下一個數字?」→ 再 15 秒手在下一個數字上點一下 → 之後每 40 秒手再安靜地點一次
    if (nextRef.current <= n) idle.start({ repeat: () => void say(`m.findnum.${nextRef.current}`), hint: showNext })
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

  const tap = async (n: number) => {
    if (n < next || busy.current) return
    idle.poke()
    setAgain(null)
    taps.current.push({ pick: String(n), ms: Math.round(performance.now() - t0.current) })
    if (n !== next) {
      wrongs.current++
      sfx.gentle()
      setShake(n)
      setTimeout(() => setShake(0), 450)
      if (wrongs.current >= 2) setHint(true)
      // 一直點錯（三歲亂點）：搖一下、亮起來每次都有，「Try again!」最多每 4 秒說一次，不會一直被唸
      if (performance.now() - retrySaid.current < RETRY_GAP_MS) return idle.poke()
      retrySaid.current = performance.now()
      // 點錯的回饋，不算閒置提醒；說完才重新計時
      await say(retryKey('bobo'), `m.findnum.${next}`)
      return idle.poke()
    }
    sfx.count(n)
    setHint(false)
    setNext(n + 1)
    nextRef.current = n + 1
    if (n < k) return void say(`m.num.${n}`)
    busy.current = true
    idle.stop()
    const firstTry = wrongs.current === 0
    if (firstTry) first.current++
    void logAttempt({
      station: 'math',
      game: def.id,
      itemId: `1-${k}`,
      skill: `order:${k}`,
      phase: 'quiz',
      level: lv.current,
      options: Array.from({ length: k }, (_, i) => String(i + 1)),
      answer: Array.from({ length: k }, (_, i) => String(i + 1)).join(','),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: wrongs.current >= 2,
      metrics: { wrongTaps: wrongs.current },
    })
    reportLevel(def.id, firstTry, def.maxLevel)
    setMood('cheer')
    sfx.correct()
    await say(`m.num.${n}`, praiseKey('bobo'))
    // 剛示範的新長度多停一下，複習題維持輕快
    await wait(nextPause(shown.current))
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  return (
    <Shell station="math" mood={mood} progress={{ total: ROUNDS, done: r }} onExit={onExit} demo={hold && finger !== null} onHost={() => {
        if (busy.current) return
        idle.poke()
        // 點恐龍：再問一次，手再示範一次（點下一個數字）
        void say(`m.findnum.${Math.min(next, k)}`)
        showNext()
      }}>
      {/* 換一回合：新的一回合蓋在舊的上面淡入，舊的（答對的樣子）等一下才淡掉，不會一下子變空（ui/Scenes.tsx 的 Swap） */}
      <Swap id={r}>
        <>
        <div style={{ position: 'absolute', top: '2%', left: '50%', translate: '-50% 0', display: 'flex', gap: '1.4cqmin', padding: '1.6cqmin 2.4cqmin', borderRadius: 999, background: 'rgba(251,248,242,.7)' }}>
          {Array.from({ length: k }, (_, i) => (
            <div key={i} style={{ width: '8.5cqmin', aspectRatio: '1', borderRadius: '2cqmin', background: i + 1 < next ? TINTS[i % TINTS.length] : 'rgba(46,42,37,.06)', display: 'grid', placeItems: 'center' }}>
              {i + 1 < next && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="glyph num" style={{ fontSize: '5.5cqmin' }}>
                  {i + 1}
                </motion.span>
              )}
            </div>
          ))}
        </div>
        {pos.map((p, i) => {
          const n = i + 1
          if (n < next) return null
          return (
            <motion.button
              key={n}
              className={`tile${hint && n === next ? ' hint' : ''}`}
              aria-label={String(n)}
              style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: '19cqmin', translate: '-50% -50%', background: TINTS[i % TINTS.length] }}
              initial={{ scale: 0 }}
              animate={shake === n ? { x: [0, -12, 12, -6, 0], scale: 1 } : { scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 18, delay: shake === n ? 0 : i * 0.05 }}
              onPointerDown={(e) => firstFinger(e.nativeEvent) && tap(n)}
            >
              <div className="tile-in">
                <span className="glyph num">{n}</span>
              </div>
            </motion.button>
          )
        })}
        <AnimatePresence>
          {finger !== null && pos[finger - 1] && <Hand key="finger" x={pos[finger - 1].x + 2} y={pos[finger - 1].y + 5} tap={press} size="11cqmin" />}
          {finger === null && again !== null && again === next && pos[again - 1] && <Hand key="again" x={pos[again - 1].x + 2} y={pos[again - 1].y + 5} tap={press} size="11cqmin" />}
        </AnimatePresence>
        <WaitShield on={hold} />
        </>
      </Swap>
    </Shell>
  )
}
