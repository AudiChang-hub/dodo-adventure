import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger, localPoint, nearest, useNotYet } from '../../games/NotYet'
import { onBlank, sayRevealing, useFlow } from '../../games/barge'
import { wait } from '../../games/lines'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { logAttempt, logTeach } from '../../lib/record'
import { heardSince, say, sfx } from '../../lib/audio'
import { FADE } from '../../ui/motion'
import { giveRounds, range, type GiveRound } from './plan'
import { PLAY_GAME, giveOptions, needsPlayDemo, notePlay } from './plays'
import { useLive, type PartCtx } from './kit'

export type Pt = { x: number; y: number }

/** 小火車、種花的外觀（Train.tsx、Plant.tsx）；流程（示範、搶點、發呆、答錯、記錄）都在這裡，兩種玩法一模一樣 */
export interface LoadSkin {
  play: 'train' | 'plant'
  /** 外層的 class（ma-give 之外再加的，例如 ma-train） */
  className: string
  /** 關鍵字（Three!）之後說要做什麼：Put three on the train! */
  askLine: (n: number) => string
  /** 做完以後說的（Choo choo!、Look! They grow!） */
  doneLine: (n: number) => string
  /** 有沒有左邊可以拿的東西：小火車有（點東西 → 坐進下一節空車廂）；種花沒有（直接點洞） */
  source: boolean
  sourcePos: (k: number) => Pt
  /** 第 i 個位置（車廂、洞）；away：火車開走了 */
  slotPos: (i: number, n: number, away: boolean) => Pt
  /** 勾勾（好了）的位置：上緣中間 */
  done: Pt
  /** 位置上放的東西（小火車：今天世界的東西；種花：花） */
  icon: string
  sourceLabel: (k: number, loaded: boolean) => string
  slotLabel: (i: number, filled: boolean) => string
  /** 不能點的底圖（火車頭和車廂、花圃）；車廂、洞本身能點的是 slot 按鈕 */
  body: (s: { n: number; away: boolean; glad: boolean; bloom: boolean }) => ReactNode
  /** 空的位置（車廂、洞）長什麼樣子（按鈕裡面） */
  emptySlot: (i: number) => ReactNode
}

/** 多拿的那一個（小火車：車廂都坐滿了還點）：搖一搖、多久以後停下來（跟拿給波波的 BACK_MS 一樣） */
const BACK_MS = 900
/** 火車開走的時間（慢慢開，紙感螢幕不留殘影） */
export const AWAY_S = 2.2

/**
 * 拿給波波的另外兩種玩法（T-127）共用的流程。跟 Give.tsx 一樣的規則：
 * - 「Three! Put three on the train!」關鍵字先念，東西在「Three!」開始念的時候才出來（T-109）；第一次按勾勾時念完了沒記成 heard。
 * - 第一次拿這個數量（give:N 還沒拿過）、或這種玩法還沒自己做對過 2 次：波波先示範（手一個一個放、邊放邊數、點勾勾），再 Your turn!。
 * - 搶點（T-108）：示範、說明、答錯的說明中點了東西就停掉語音、示範收掉，那一下照常算；點勾勾或空白：手馬上指下一步。
 * - 點勾勾：剛好 → There are three! 火車開走／花長大；不夠（第一次）→ There are two. More, please! I want three.，留著讓他自己補；
 *   第二次 → 手把剩下的放好、一起數，再指勾勾。空的就按勾勾：再說一次要幾個，不算錯。
 * - 小火車都坐滿了還點左邊的東西：那一個搖一搖、留在原位（多拿了），波波再數一次（Three!），勾勾跳一下；不算一次就對。
 * - 記錄：skill give:N、選項照拿給波波（plays.ts 的 giveOptions），game 是 m-train／m-plant；手帶著做的記成 guided。
 * - 交出去以後：勾勾變綠、跳一下就收起來，沒坐上火車的東西淡掉，數完（There is three!）要幾個的數字也收起來；
 *   接著說 Choo choo! Bye-bye!（Grow, grow!），同時出下一步的大箭頭，不等它念完（T-139）。等的時候點畫面只有「等一下」的圈圈。
 */
export function LoadPart({ ctx, skin }: { ctx: PartCtx; skin: LoadSkin }) {
  const [round] = useState<GiveRound>(() => giveRounds(ctx.lesson)[0])
  const { n, supply } = round
  /** 這一段要不要先示範：這個數量還沒拿過，或這種玩法還不熟 */
  const [demoNow] = useState(() => round.demo || needsPlayDemo(skin.play))
  /** 每個位置放了什麼（小火車：左邊第幾個東西；種花：自己的編號）；null 是空的 */
  const [fill, setFillState] = useState<(number | null)[]>(() => Array(n).fill(null))
  const fillRef = useRef<(number | null)[]>(Array(n).fill(null))
  const setFill = (f: (number | null)[]) => {
    fillRef.current = f
    setFillState(f)
  }
  const count = (f = fillRef.current) => f.filter((x) => x != null).length
  const [hold, setHold] = useState(true)
  const [hand, setHand] = useState<{ x: number; y: number; tap: number } | null>(null)
  const [glad, setGlad] = useState<false | 'full' | 'plain'>(false)
  const [gone, setGone] = useState(false)
  /** 要幾個的數字念完了（交出去以後）：收起來 */
  const [said, setSaid] = useState(false)
  /** 火車開走了（小火車）、花長大了（種花） */
  const [away, setAway] = useState(false)
  const [bloom, setBloom] = useState(false)
  const [want, setWant] = useState(0)
  const [extra, setExtra] = useState<number[]>([])
  const extraRef = useRef(new Set<number>())
  const over = useRef(0)
  const [poke, setPoke] = useState(0)
  const doneRef = useRef<HTMLButtonElement | null>(null)
  const [things, setThings] = useState(false)
  const reveal = () => setThings(true)
  const since = useRef(performance.now())
  const heard = useRef(false)
  const live = useLive()
  const phase = useRef<'demo' | 'intro' | 'fb' | 'help' | 'turn' | 'done'>('intro')
  const armed = useRef(false)
  const flow = useFlow()
  const notYet = useNotYet()
  const box = useRef<HTMLDivElement | null>(null)
  const checks = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const helped = useRef(false)
  const led = useRef(false)
  const idle = useIdle()
  const demoing = useRef(false)
  const showing = (on: boolean) => {
    demoing.current = on
    ctx.demo(on)
  }
  const game = PLAY_GAME[skin.play]

  const point = async (p: Pt, ms = 420) => {
    setHand((h) => ({ x: p.x + 1.5, y: p.y + 4, tap: (h?.tap ?? 0) + 1 }))
    await wait(ms)
  }

  const askKey = `m.ask.num.${n}`
  const ask = () => {
    setWant((w) => w + 1)
    return sayRevealing(reveal, askKey, skin.askLine(n))
  }

  /** 第一個空的位置 */
  const firstEmpty = (f = fillRef.current) => f.findIndex((x) => x == null)
  /** 左邊還沒坐上車的第一個（小火車） */
  const firstFree = (f = fillRef.current) => range(0, supply - 1).find((k) => !f.includes(k) && !extraRef.current.has(k))

  /** 放一個進第 i 個位置（小火車：左邊第 k 個坐進去；種花：種一朵） */
  const put = (i: number, k: number) => {
    const f = [...fillRef.current]
    f[i] = k
    setFill(f)
    return count(f)
  }

  /** 手把每個位置放好，邊放邊數（示範、錯兩次的時候） */
  const fillTo = async (ok: () => boolean, fromScratch: boolean) => {
    clearExtra()
    if (fromScratch) {
      setFill(Array(n).fill(null))
      await wait(300)
    }
    while (count() < n) {
      if (!ok()) return
      const i = firstEmpty()
      const k = skin.source ? firstFree() : i
      if (i < 0 || k === undefined) return
      await point(skin.source ? skin.sourcePos(k) : skin.slotPos(i, n, false), count() === 0 ? 520 : 360)
      if (!ok()) return
      const c = put(i, k)
      sfx.count(c)
      await say(`m.num.${c}`)
    }
  }

  const clearExtra = () => {
    extraRef.current.clear()
    setExtra([])
  }

  /** 小火車都坐滿了還點左邊的：那一個搖一搖、留在原位，波波再數一次，勾勾跳一下 */
  const tooMany = (k: number) => {
    over.current++
    extraRef.current.add(k)
    setExtra([...extraRef.current])
    sfx.tap()
    window.setTimeout(() => {
      if (!live.current || !extraRef.current.has(k)) return
      extraRef.current.delete(k)
      setExtra([...extraRef.current])
      sfx.pop()
      if (phase.current !== 'turn') return
      void say(`m.num.${count()}`)
      setPoke((p) => p + 1)
    }, BACK_MS)
  }

  const open = () => {
    phase.current = 'turn'
    setThings(true)
    if (!t0.current) t0.current = performance.now()
    idle.start({ repeat: () => void ask(), hint: nudge })
  }

  const takeOver = () => {
    const was = phase.current
    flow.cut()
    setThings(true)
    if (was === 'demo' || was === 'help') {
      setHand(null)
      setGlad(false)
      if (was === 'demo') {
        clearExtra()
        setFill(Array(n).fill(null))
      }
      showing(false)
      ctx.mood('idle')
    }
    open()
  }

  const start = async () => {
    const ok = flow.begin(live)
    phase.current = demoNow ? 'demo' : 'intro'
    if (demoNow) {
      const s = performance.now()
      showing(true)
      ctx.mood('happy')
      await ask()
      if (!ok()) return
      await say('teach.watch.bobo')
      if (!ok()) return
      await fillTo(ok, true)
      if (!ok()) return
      await point(skin.done, 500)
      if (!ok()) return
      setHand(null)
      setGlad('full')
      await say(`m.total.${n}`)
      if (!ok()) return
      await wait(PACE.DEMO_HOLD)
      if (!ok()) return
      setHand(null)
      setGlad(false)
      setFill(Array(n).fill(null))
      showing(false)
      ctx.mood('idle')
      phase.current = 'intro'
      void logTeach({ station: 'math', game, itemId: String(n), skill: `give:${n}`, level: 1, ms: Math.round(performance.now() - s) })
      await say('teach.turn.bobo')
    } else await ask()
    if (!ok()) return
    open()
    if (demoNow) void point(skin.source ? skin.sourcePos(0) : skin.slotPos(0, n, false), 0)
  }

  /** 閒置第二段、點波波：手指著下一步（還不夠：下一個要拿的、要種的；夠了：勾勾） */
  const nudge = () => {
    if (phase.current !== 'turn') return
    helped.current = true
    if (count() < n) {
      if (skin.source) {
        const k = firstFree()
        if (k !== undefined) void point(skin.sourcePos(k), 0)
      } else {
        const i = firstEmpty()
        if (i >= 0) void point(skin.slotPos(i, n, false), 0)
      }
    } else void point(skin.done, 0)
  }

  useEffect(() => {
    const boot = window.setTimeout(() => void start(), 0)
    const arm = window.setTimeout(() => {
      if (!live.current || phase.current === 'done') return
      armed.current = true
      setHold(false)
    }, PACE.BARGE_ARM)
    const mine = () => {
      if (phase.current !== 'turn') return
      idle.poke()
      void ask()
      nudge()
    }
    ctx.host.current = mine
    return () => {
      clearTimeout(boot)
      clearTimeout(arm)
      idle.stop()
      if (ctx.host.current === mine) ctx.host.current = null
      if (demoing.current) ctx.demo(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const blank = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!armed.current || phase.current === 'done' || !onBlank(e.target) || !box.current) return
    if (phase.current === 'turn') {
      if (!firstFinger(e.nativeEvent)) return
      if (nearest([[true, doneRef.current]], e.clientX, e.clientY)) return void check()
      if (count()) setPoke((p) => p + 1)
      return
    }
    const p = localPoint(box.current, e.clientX, e.clientY)
    notYet.ping(p.x, p.y)
    takeOver()
    nudge()
  }

  /** 開始動手之前的共同檢查；回傳 false 是這一下不算 */
  const touch = () => {
    if (!armed.current || phase.current === 'done') return false
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    setHand(null)
    return true
  }

  /** 拿掉第 i 個位置的（小火車：下車回到左邊；種花：花收回土裡） */
  const takeOut = (i: number) => {
    const f = [...fillRef.current]
    f[i] = null
    setFill(f)
    sfx.pop()
    const c = count(f)
    if (c) void say(`m.num.${c}`)
  }

  /** 放進第 i 個位置（空的） */
  const putIn = (i: number, k: number) => {
    const c = put(i, k)
    sfx.count(c)
    void say(`m.num.${c}`)
  }

  /** 小火車：點左邊的東西（坐上下一節空車廂）、點車上的（下車） */
  const tapSource = (k: number) => {
    if (!touch()) return
    if (extraRef.current.has(k)) return
    const at = fillRef.current.indexOf(k)
    if (at >= 0) return takeOut(at)
    const i = firstEmpty()
    if (i < 0) return tooMany(k)
    putIn(i, k)
  }

  /** 點位置本身：空的車廂 → 左邊下一個坐進來；空的洞 → 種一朵；有花的洞 → 收回去 */
  const tapSlot = (i: number) => {
    if (!touch()) return
    const f = fillRef.current
    if (f[i] != null) return takeOut(i)
    if (!skin.source) return putIn(i, i)
    const k = firstFree()
    if (k !== undefined) putIn(i, k)
  }

  const finish = async (firstTry: boolean) => {
    const shownHere = demoNow
    const ledHere = !shownHere && led.current
    void logAttempt({
      station: 'math',
      game,
      itemId: String(n),
      skill: `give:${n}`,
      phase: shownHere || ledHere ? 'guided' : 'quiz',
      level: 1,
      options: giveOptions(n),
      answer: String(n),
      taps: checks.current,
      firstTryCorrect: firstTry && !over.current,
      attempts: checks.current.length,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: helped.current,
      heard: heard.current,
      metrics: { lesson: ctx.lesson.n, supply, slots: n, ...(over.current ? { over: over.current } : {}), ...(checks.current.length > 1 ? { retaught: 1 } : {}), ...(shownHere ? { shown: 1 } : ledHere ? { led: 1 } : {}) },
    })
    const full = firstTry && !over.current && heard.current && !led.current
    notePlay(skin.play, full && !shownHere)
    if (full) {
      ctx.mood('cheer')
      sfx.correct()
    }
    setGlad(full ? 'full' : 'plain')
    // 交出去以後畫面上不留看起來還要做的東西（T-139，盲測 9792b5d、becf39a、61ee1cf 數學 2 都在這裡離開：
    // 火車開走以後左邊剩下的東西、灰色的勾勾、要幾個的數字都還在，看起來像還有一題，他一直點都只有圈圈，「不知道要幹嘛」）：
    // 勾勾跳一下就收起來（不再變灰留著讓他點）、剩下的東西淡掉；點畫面只有「等一下」的圈圈
    window.setTimeout(() => live.current && setGone(true), 520)
    // 火車開走、花長大：答案「做出來了」，不靠語言也看得懂
    if (skin.play === 'train') {
      setAway(true)
      sfx.whoosh()
    } else setBloom(true)
    await say(`m.total.${n}`)
    if (!live.current) return
    // 數完（There is three!）：要幾個的數字也收起來；Choo choo! Bye-bye! 跟下一步的大箭頭一起出來，不再等它念完（以前按勾勾後 4.3 秒才能往下）
    setSaid(true)
    void say(skin.doneLine(n))
    ctx.done(heard.current ? 1 : 0, heard.current && !firstTry ? 1 : 0)
  }

  const check = async () => {
    if (!armed.current || phase.current === 'done') return
    if (phase.current !== 'turn') {
      takeOver()
      return nudge()
    }
    idle.poke()
    const have = count()
    if (!have) {
      sfx.gentle()
      return void ask()
    }
    if (!checks.current.length) {
      heard.current = heardSince(askKey, since.current)
      led.current = helped.current
    }
    checks.current.push({ pick: String(have), ms: Math.round(performance.now() - t0.current) })
    setHand(null)
    idle.stop()
    if (have === n) {
      phase.current = 'done'
      setHold(true)
      return void finish(checks.current.length === 1)
    }
    sfx.gentle()
    const ok = flow.begin(live)
    if (checks.current.length < 2) {
      phase.current = 'fb'
      await say(`m.total.${have}`, 'ma.give.more', `ma.want.${n}`)
      if (!ok()) return
      return open()
    }
    phase.current = 'help'
    helped.current = true
    showing(true)
    await fillTo(ok, false)
    if (!ok()) return
    await say(`m.total.${n}`)
    if (!ok()) return
    showing(false)
    await point(skin.done, 0)
    phase.current = 'turn'
    idle.start({ repeat: () => void point(skin.done, 0), hint: () => void point(skin.done, 0) })
  }

  const slide = { ...FADE, left: { duration: away ? AWAY_S : 0.35, ease: away ? 'easeIn' : 'easeOut' }, top: { duration: 0.35 } } as const
  const c = count(fill)
  return (
    <div className={`ma-give ma-load ${skin.className}`} ref={box} onPointerDown={blank} data-play={skin.play}>
      {/* 要幾個：大大的數字和點點（只說英文也看得懂要幾個） */}
      <motion.div
        key={want}
        className="ma-give-want"
        aria-label={`波波要 ${n} 個`}
        animate={said ? { opacity: 0 } : want ? { scale: [1, 1.08, 1] } : {}}
        transition={said ? FADE : { duration: 0.45 }}
      >
        <span className="ma-give-num">{n}</span>
        <span className="ma-give-dots" aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </motion.div>
      {skin.body({ n, away, glad: !!glad, bloom })}
      {/* 位置（車廂、洞）：空的可以點（小火車：左邊下一個坐進來；種花：種一朵） */}
      {range(0, n - 1).map((i) => {
        const p = skin.slotPos(i, n, away)
        const filled = fill[i] != null
        const plantHere = !skin.source
        return (
          <motion.button
            key={`slot-${i}`}
            type="button"
            className={`ma-slot${filled ? ' is-full' : ''}${plantHere ? ' ma-give-thing' : ''}${plantHere && bloom ? ' is-bloom' : ''}`}
            aria-label={skin.slotLabel(i, filled)}
            initial={{ opacity: 0, left: `${p.x}%`, top: `${p.y}%` }}
            animate={{ opacity: things ? 1 : 0, left: `${p.x}%`, top: `${p.y}%` }}
            style={things && !(skin.source && filled) ? undefined : { pointerEvents: 'none' }}
            transition={slide}
            onPointerDown={(e) => firstFinger(e.nativeEvent) && tapSlot(i)}
          >
            {skin.emptySlot(i)}
            {plantHere && filled && (
              <motion.span className="ma-sprout" initial={{ scale: 0.2, y: '30%' }} animate={{ scale: 1, y: '0%' }} transition={{ duration: 0.35, ease: 'easeOut' }}>
                <Emoji name={skin.icon} />
              </motion.span>
            )}
          </motion.button>
        )
      })}
      {/* 小火車：左邊的東西，點了坐進下一節空車廂（坐上去以後跟著車廂；點車上的就下車） */}
      {skin.source &&
        range(0, supply - 1).map((k) => {
          const at = fill.indexOf(k)
          const p = at >= 0 ? skin.slotPos(at, n, away) : skin.sourcePos(k)
          // 交出去以後：沒坐上火車的淡掉（T-139）
          const show = things && !(glad && at < 0)
          return (
            <motion.button
              key={k}
              type="button"
              className={`ma-thing ma-give-thing${at >= 0 ? ' is-on' : ''}${extra.includes(k) ? ' is-extra' : ''}`}
              aria-label={skin.sourceLabel(k, at >= 0)}
              initial={{ opacity: 0, left: `${p.x}%`, top: `${p.y}%` }}
              animate={{ opacity: show ? 1 : 0, left: `${p.x}%`, top: `${p.y}%` }}
              style={show ? undefined : { pointerEvents: 'none' }}
              transition={slide}
              onPointerDown={(e) => firstFinger(e.nativeEvent) && tapSource(k)}
            >
              <Emoji name={skin.icon} />
            </motion.button>
          )
        })}
      <button
        key={`done-${poke}`}
        ref={doneRef}
        type="button"
        data-poke={poke || undefined}
        className={`ma-give-done${glad ? ` is-done${glad === 'plain' ? ' is-plain' : ''}${gone ? ' is-gone' : ''}` : !hold && c > 0 ? ` on${poke ? ' poke' : ''}` : ''}`}
        style={{ left: `${skin.done.x}%`, top: `${skin.done.y}%` }}
        aria-label={skin.play === 'train' ? '好了，火車開走' : '好了，種好了'}
        onPointerDown={(e) => firstFinger(e.nativeEvent) && check()}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M12 25 L21 34 L37 15" fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size="11cqmin" cuff="#F0B088" />}</AnimatePresence>
      {notYet.view}
      <WaitShield on={hold} />
    </div>
  )
}
