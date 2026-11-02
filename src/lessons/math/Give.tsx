import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger } from '../../games/NotYet'
import { praiseKey, wait } from '../../games/lines'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx } from '../../lib/audio'
import { FADE } from '../../ui/motion'
import { giveRounds, range, type GiveRound } from './plan'
import { useLive, type PartCtx } from './kit'

/** 左邊可以拿的東西：兩排（上 4、下 3），左下角留給波波 */
const SUPPLY = [
  { x: 23, y: 26 },
  { x: 34, y: 26 },
  { x: 45, y: 26 },
  { x: 56, y: 26 },
  { x: 34, y: 50 },
  { x: 45, y: 50 },
  { x: 56, y: 50 },
]
/** 右邊波波的盤子：一排最多 4 個 */
const PLATE = { x: 80, y: 38 }
const slot = (i: number) => ({ x: PLATE.x - 10.5 + (i % 4) * 7, y: PLATE.y - 3 + Math.floor(i / 4) * 12 })
/** 勾勾（交給波波）：盤子下面，不在畫面最下緣 2 cm（TOUCH-5：平板上按鈕底在畫面最下面 90 px 以上） */
const DONE = { x: 80, y: 57 }

type Where = { at: 'pile'; i: number } | { at: 'plate'; i: number }

/**
 * 拿給波波（Give-N，現況對照 A1 第 6 點、指引 MA-2）：「Give me three!」孩子把東西一個一個點進波波的盤子，點勾勾交出去。
 * 這是看孩子是不是真的懂「3 是多少」最好的題目（會唱數不一定拿得出 3 個）。
 * - 只用點的（TOUCH-2）：點左邊的東西 → 飛進盤子，波波念盤子裡有幾個；點盤子裡的 → 拿回去。
 * - 第一次拿這個數量：波波先示範（手一個一個點進盤子、邊點邊數、最後點勾勾），示範中孩子點了不算。
 * - 點勾勾：剛好 → 「There are three! Yum! Thank you!」；不對（第一次）→ 說盤子裡有幾個、波波要幾個（More, please!／Too many!），
 *   東西留著讓孩子自己改；第二次 → 手把盤子改成剛好、一起數，再指勾勾，孩子點了就過。
 * - 盤子是空的就點勾勾：再說一次「Give me three!」，不算答錯。
 */
export function GivePart({ ctx }: { ctx: PartCtx }) {
  const [round] = useState<GiveRound>(() => giveRounds(ctx.lesson)[0])
  const { n, icon, supply } = round
  /** 盤子裡是哪幾個（依放進去的順序） */
  const [plate, setPlate] = useState<number[]>([])
  const [hold, setHold] = useState(true)
  const [hand, setHand] = useState<{ x: number; y: number; tap: number } | null>(null)
  const [glad, setGlad] = useState(false)
  const [want, setWant] = useState(0)
  const live = useLive()
  const busy = useRef(true)
  const plateRef = useRef<number[]>([])
  const checks = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const helped = useRef(false)
  const idle = useIdle()
  const demoing = useRef(false)
  const showing = (on: boolean) => {
    demoing.current = on
    ctx.demo(on)
  }
  const setP = (p: number[]) => {
    plateRef.current = p
    setPlate(p)
  }

  const where = (k: number): Where => {
    const i = plate.indexOf(k)
    return i >= 0 ? { at: 'plate', i } : { at: 'pile', i: k }
  }
  const posOf = (w: Where) => (w.at === 'plate' ? slot(w.i) : SUPPLY[w.i])

  /** 手點一下某個位置（示範、提示用） */
  const point = async (p: { x: number; y: number }, ms = 420) => {
    setHand((h) => ({ x: p.x + 1.5, y: p.y + 4, tap: (h?.tap ?? 0) + 1 }))
    await wait(ms)
  }

  /** 波波說要幾個：泡泡跳一下 */
  const ask = () => {
    setWant((w) => w + 1)
    return say(`ma.give.${n}`)
  }

  /** 手把盤子放成剛好 n 個，邊放邊數（示範、錯兩次的時候） */
  const fillTo = async () => {
    setP([])
    await wait(300)
    const got: number[] = []
    for (let k = 0; k < n; k++) {
      if (!live.current) return
      await point(SUPPLY[k], k === 0 ? 520 : 360)
      got.push(k)
      setP([...got])
      sfx.count(got.length)
      await say(`m.num.${got.length}`)
    }
  }

  const open = () => {
    busy.current = false
    setHold(false)
    t0.current = performance.now()
    idle.start({ repeat: () => void ask(), hint: nudge })
  }

  const start = async () => {
    busy.current = true
    setHold(true)
    if (round.demo) {
      const s = performance.now()
      showing(true)
      ctx.mood('happy')
      await ask()
      if (!live.current) return
      await say('teach.watch.bobo')
      if (!live.current) return
      await fillTo()
      if (!live.current) return
      await point(DONE, 500)
      await say(`m.total.${n}`)
      if (!live.current) return
      setGlad(true)
      await say('ma.give.thanks')
      if (!live.current) return
      await wait(PACE.DEMO_HOLD)
      if (!live.current) return
      setHand(null)
      setGlad(false)
      setP([])
      showing(false)
      ctx.mood('idle')
      void logTeach({ station: 'math', game: 'm-give', itemId: String(n), skill: `give:${n}`, level: 1, ms: Math.round(performance.now() - s) })
      await say('teach.turn.bobo')
      if (!live.current) return
    }
    await ask()
    if (!live.current) return
    open()
  }

  /** 閒置第二段、點波波：手指著下一步（還不夠：左邊的一個；太多：盤子裡的一個；剛好：勾勾） */
  const nudge = () => {
    if (busy.current) return
    helped.current = true
    const p = plateRef.current
    if (p.length < n) {
      const k = range(0, supply - 1).find((x) => !p.includes(x))
      if (k !== undefined) void point(SUPPLY[k], 0)
    } else if (p.length > n) void point(slot(p.length - 1), 0)
    else void point(DONE, 0)
  }

  useEffect(() => {
    const boot = window.setTimeout(() => void start(), 0)
    const mine = () => {
      if (busy.current) return
      idle.poke()
      void ask()
      nudge()
    }
    ctx.host.current = mine
    return () => {
      clearTimeout(boot)
      idle.stop()
      if (ctx.host.current === mine) ctx.host.current = null
      if (demoing.current) ctx.demo(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tapThing = (k: number) => {
    if (busy.current) return
    idle.poke()
    setHand(null)
    const p = plateRef.current
    const next = p.includes(k) ? p.filter((x) => x !== k) : [...p, k]
    setP(next)
    if (!p.includes(k)) sfx.count(next.length)
    else sfx.pop()
    if (next.length) void say(`m.num.${next.length}`)
  }

  const finish = async (firstTry: boolean) => {
    void logAttempt({
      station: 'math',
      game: 'm-give',
      itemId: String(n),
      skill: `give:${n}`,
      phase: 'quiz',
      level: 1,
      // 能交出去的數量：0～supply 個（不是 2 選 1，猜中的機會很小，算進熟練判斷）
      options: range(0, supply).map(String),
      answer: String(n),
      taps: checks.current,
      firstTryCorrect: firstTry,
      attempts: checks.current.length,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: helped.current,
      metrics: { lesson: ctx.lesson.n, supply, ...(checks.current.length > 1 ? { retaught: 1 } : {}) },
    })
    ctx.mood('cheer')
    sfx.correct()
    setGlad(true)
    await say(`m.total.${n}`, 'ma.give.thanks', praiseKey('bobo'))
    await wait(PACE.NEXT_NEW)
    if (live.current) ctx.done(1, firstTry ? 0 : 1)
  }

  const check = async () => {
    if (busy.current) return
    idle.poke()
    const have = plateRef.current.length
    // 盤子是空的：再說一次要幾個（不算答錯）
    if (!have) {
      sfx.gentle()
      return void ask()
    }
    checks.current.push({ pick: String(have), ms: Math.round(performance.now() - t0.current) })
    busy.current = true
    setHold(true)
    setHand(null)
    idle.stop()
    if (have === n) return void finish(checks.current.length === 1)
    sfx.gentle()
    if (checks.current.length < 2) {
      // 錯第一次：說出盤子裡有幾個、波波要幾個（HOW-5），東西留著讓孩子自己改
      await say(`m.total.${have}`, have < n ? 'ma.give.more' : 'ma.give.toomany', `ma.want.${n}`)
      if (!live.current) return
      return open()
    }
    // 錯第二次：手把盤子放成剛好、一起數，再指勾勾讓孩子點
    helped.current = true
    showing(true)
    await fillTo()
    if (!live.current) return
    await say(`m.total.${n}`)
    if (!live.current) return
    showing(false)
    await point(DONE, 0)
    busy.current = false
    setHold(false)
    idle.start({ repeat: () => void point(DONE, 0), hint: () => void point(DONE, 0) })
  }

  return (
    <div className="ma-give">
      {/* 波波要幾個：大大的數字和點點（只說英文也看得懂要幾個） */}
      <motion.div key={want} className="ma-give-want" aria-label={`波波要 ${n} 個`} animate={want ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 0.45 }}>
        <span className="ma-give-num">{n}</span>
        <span className="ma-give-dots" aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </motion.div>
      <div className={`ma-give-plate${glad ? ' glad' : ''}`} style={{ left: `${PLATE.x}%`, top: `${PLATE.y + 2}%` }} aria-hidden="true" />
      {range(0, supply - 1).map((k) => {
        const p = posOf(where(k))
        return (
          <motion.button
            key={k}
            type="button"
            className="ma-thing ma-give-thing"
            aria-label={plate.includes(k) ? `拿回第 ${k + 1} 個` : `拿第 ${k + 1} 個給波波`}
            initial={{ opacity: 0, left: `${p.x}%`, top: `${p.y}%` }}
            animate={{ opacity: 1, left: `${p.x}%`, top: `${p.y}%` }}
            transition={{ ...FADE, left: { duration: 0.35 }, top: { duration: 0.35 } }}
            onPointerDown={(e) => firstFinger(e.nativeEvent) && tapThing(k)}
          >
            <Emoji name={icon} />
          </motion.button>
        )
      })}
      <button type="button" className={`ma-give-done${!hold && plate.length > 0 ? ' on' : ''}`} style={{ left: `${DONE.x}%`, top: `${DONE.y}%` }} aria-label="好了，交給波波" onPointerDown={(e) => firstFinger(e.nativeEvent) && check()}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M12 25 L21 34 L37 15" fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size="11cqmin" cuff="#F0B088" />}</AnimatePresence>
      <WaitShield on={hold} />
    </div>
  )
}
