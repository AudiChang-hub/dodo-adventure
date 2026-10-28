import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { Hand } from './Demo'
import { Emoji } from '../art/Emoji'
import { game as gameDef } from '../content/games'
import { COUNT_ICONS } from '../content/park'
import { themed } from '../lib/theme-play'
import { level, markPlayed, plays, reportLevel } from '../lib/adaptive'
import { planCount, roundState } from './pick'
import { logAttempt, logTeach } from '../lib/record'
import { say, sfx, stopSpeech } from '../lib/audio'
import { pick, shuffle } from '../lib/random'
import { scatter } from './layout'
import { praiseKey, retryKey, wait } from './lines'
import { useIdle } from './idle'
import { PACE, nextPause } from './pace'
import type { Mood } from '../art/Dino'
import { Swap } from '../ui/Scenes'
import { FADE } from '../ui/motion'

const ROUNDS = 4

interface Round {
  n: number
  icon: string
  pos: { x: number; y: number }[]
  choices: number[]
}

function makeRound(n: number): Round {
  const others = shuffle([n - 1, n + 1, n + 2, n - 2].filter((x) => x >= 1 && x <= 10)).slice(0, 2)
  // 主題式冒險數主題的東西（公車旅行數公車）
  return { n, icon: pick(themed(COUNT_ICONS, (t) => t.count)), pos: scatter(n, n > 6 ? 5 : 4, n > 4 ? 2 : 1), choices: shuffle([n, ...others]) }
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
  /** 示範中：手指在第幾個物件上，或在某個點（數字卡上，舞台的百分比座標）；null 表示沒有在示範 */
  const [finger, setFinger] = useState<number | { x: number; y: number } | null>(null)
  /** 示範第二步：手點下去的那張數字卡（變成答對的樣子） */
  const [demoPick, setDemoPick] = useState<number | null>(null)
  /**
   * 輪到孩子時的「點這裡」（盤點：示範完畫面只剩物件，沒有任何提示）：
   * hand＝剛示範過，手在下一個要數的物件上輕輕點；glow＝下一個要數的物件發光。孩子點了第一下就收起來。
   */
  const [lead, setLead] = useState<'hand' | 'glow' | null>(null)
  /** 選數字那一步輪到孩子：數字卡輕輕呼吸、最後一個號碼牌跳一下，孩子點了第一張就停 */
  const [askCue, setAskCue] = useState(false)
  const tileEls = useRef(new Map<number, HTMLElement>())
  const layerEl = useRef<HTMLElement | null>(null)
  const [press, setPress] = useState(0)
  const [ping, setPing] = useState<{ i: number; k: number } | null>(null)
  const live = useRef(true)
  const busy = useRef(false)
  const t0 = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const extra = useRef(0)
  const lv = useRef(1)
  const first = useRef(0)
  const retaught = useRef(false)
  const round0 = useRef(roundState(plays(def.id) === 0))
  /** 這一輪先示範過：答對後多停一下再換題 */
  const shown = useRef(false)
  const stage = useRef<'count' | 'ask' | 'done'>('count')
  /** 這一輪孩子點過物件了沒（點過就不用再出「點這裡」） */
  const tappedRef = useRef(false)
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

  /** 數字卡在舞台上的位置（百分比）：用比例量，外層正在做縮放轉場（新畫面從 0.6 倍放大）也對得上 */
  const tilePoint = (n: number) => {
    const el = tileEls.current.get(n)
    const box = layerEl.current
    if (!el || !box) return null
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    if (!b.width || !b.height) return null
    return { x: ((r.left + r.width * 0.56 - b.left) / b.width) * 100, y: ((r.top + r.height * 0.6 - b.top) / b.height) * 100 }
  }

  const demo = async (rd: Round) => {
    const s = performance.now()
    setMood('happy')
    await say('teach.watch.bobo')
    if (!live.current) return
    await countAlong(rd, true)
    if (!live.current) return
    // 第二步也要示範（盤點：示範只數，沒做過「選數字」）：數字卡出來，手移到答案那張點下去
    if (lv.current >= 2) {
      setAsk(true)
      await wait(650)
      if (!live.current) return
      void say('m.howmany')
      await wait(450)
      const pt = tilePoint(rd.n)
      if (pt) setFinger(pt)
      await wait(650)
      if (!live.current) return
      setPress((p) => p + 1)
      setDemoPick(rd.n)
      sfx.correct()
      await wait(250)
      await say(`m.num.${rd.n}`)
      if (!live.current) return
    }
    setFinger(null)
    // 數好、標上數字（和選好數字）的那一組停留一下，孩子看完整的結果
    await wait(PACE.DEMO_HOLD)
    setAsk(false)
    setDemoPick(null)
    setCounted([])
    void logTeach({ station: 'math', game: def.id, itemId: String(rd.n), skill: `count:${rd.n}`, level: lv.current, ms: Math.round(performance.now() - s) })
    setMood('idle')
    await say('teach.turn.bobo')
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    // 這一輪數幾個、要不要先示範（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const plan = planCount(def.id, lv.current, round0.current, i)
    const rd = makeRound(plan.n)
    setRound(rd)
    setCounted([])
    setAsk(false)
    setWrong([])
    setHint(false)
    setDemoPick(null)
    setAskCue(false)
    setLead(null)
    setMood('idle')
    taps.current = []
    extra.current = 0
    retaught.current = false
    // 要示範的話，示範完才換孩子點；不示範就跟以前一樣，邊聽邊可以開始點
    const show = plan.show
    shown.current = show
    busy.current = show
    stage.current = 'count'
    tappedRef.current = false
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
    // 輪到孩子：剛示範過就讓手在第一個要數的上面輕輕點；沒示範就讓它發光（還沒開始點的話）
    if (stage.current === 'count' && !tappedRef.current) setLead(show ? 'hand' : 'glow')
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
    // 剛示範的新數量多停一下，複習題維持輕快
    await wait(nextPause(shown.current))
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
    tappedRef.current = true
    setCounted(next)
    setNudge(false)
    setLead(null)
    sfx.count(next.length)
    if (next.length < round.n) return void say(`m.num.${next.length}`)
    busy.current = true
    idle.stop()
    await say(`m.num.${next.length}`, `m.total.${round.n}`)
    if (!live.current) return
    if (lv.current >= 2) {
      stage.current = 'ask'
      setAsk(true)
      setAskCue(true)
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
    setAskCue(false)
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

  // 閒置提示（或輪到孩子時的「點這裡」）要發光的「下一個」：跟示範一樣，上排到下排、由左到右第一個還沒數的
  const nextObj =
    (nudge || lead) && round && !ask
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
      {/* 換一回合：新的一回合蓋在舊的上面淡入，舊的（答對的樣子）等一下才淡掉，不會一下子變空（ui/Scenes.tsx 的 Swap） */}
      {round && (
        <Swap id={r}>
          <>
          {round.pos.map((p, i) => {
            const order = counted.indexOf(i)
            const pinged = ping?.i === i
            // 選數字輪到孩子：最後一個號碼牌跳一下（最後數到的數字就是答案）
            const lastBadge = askCue && order === round.n - 1
            return (
              <motion.button
                key={i}
                aria-label={`第 ${i + 1} 個`}
                style={{ position: 'absolute', left: `${p.x}%`, top: `${ask ? p.y * 0.55 : p.y}%`, width: round.n > 6 ? '12cqmin' : '17cqmin', aspectRatio: '1', translate: '-50% -50%' }}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: order >= 0 ? 0.92 : 1, rotate: 0, y: order >= 0 ? [0, -26, 0] : 0, opacity: order >= 0 ? 0.62 : 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16, delay: order >= 0 ? 0 : i * 0.06, opacity: FADE }}
                onPointerDown={() => tapObj(i)}
              >
                {nextObj === i && <span className="nudge-glow" aria-hidden="true" />}
                <motion.div key={pinged ? ping!.k : 'still'} style={{ width: '100%', height: '100%' }} animate={pinged ? { y: [0, -18, 0] } : {}} transition={{ duration: 0.4 }}>
                  <Emoji name={round.icon} />
                </motion.div>
                {order >= 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={lastBadge ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                    transition={lastBadge ? { duration: 0.7, repeat: Infinity, repeatDelay: 1.1 } : undefined}
                    style={{ position: 'absolute', right: '-10%', top: '-12%', width: '44%', aspectRatio: '1', borderRadius: '50%', background: 'var(--ink)', color: 'var(--card)', display: 'grid', placeItems: 'center', fontFamily: 'Fredoka', fontWeight: 600, fontSize: 'min(5cqmin, 40px)' }}
                  >
                    {order + 1}
                  </motion.span>
                )}
              </motion.button>
            )
          })}
          <AnimatePresence>
            {typeof finger === 'number' && round.pos[finger] && (
              <Hand key="finger" x={round.pos[finger].x + 1.5} y={(ask ? round.pos[finger].y * 0.55 : round.pos[finger].y) + 4} tap={press} size="11cqmin" cuff="#F0B088" />
            )}
            {finger !== null && typeof finger === 'object' && <Hand key="finger" x={finger.x} y={finger.y} tap={press} size="11cqmin" cuff="#F0B088" />}
            {/* 輪到孩子（剛示範過）：手在下一個要數的上面輕輕點 */}
            {finger === null && lead === 'hand' && nextObj !== undefined && round.pos[nextObj] && (
              <Hand key="lead" x={round.pos[nextObj].x + 1.5} y={round.pos[nextObj].y + 4} size="11cqmin" beckon />
            )}
          </AnimatePresence>
          {ask && (
            <div
              className="options"
              style={{ top: '46%', alignItems: 'flex-start' }}
              ref={(el) => {
                if (el?.parentElement) layerEl.current = el.parentElement
              }}
            >
              {round.choices.map((n, i) => (
                <motion.button
                  key={n}
                  ref={(el: HTMLButtonElement | null) => {
                    if (el) tileEls.current.set(n, el)
                  }}
                  className={`tile${hint && n === round.n ? ' hint' : ''}${demoPick === n ? ' correct' : ''}${askCue && !hint ? ' cue' : ''}`}
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
          </>
        </Swap>
      )}
    </Shell>
  )
}
