import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { onBlank, useFlow } from '../../games/barge'
import { firstFinger, localPoint, useNotYet } from '../../games/NotYet'
import { PACE } from '../../games/pace'
import { praiseKey, wait } from '../../games/lines'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { Sparkles } from '../../ui/Sparkles'
import { nextStep } from '../../ui/NextStep'
import { pointIn } from '../math/kit'
import { ABC_GAME_ID, letterOf, sandwich, type FlipCard } from './abc'

/** 翻錯的兩張停多久再蓋回去 */
const MISS_MS = 1300

/** 翻開一張卡念什麼：字母卡念字母名（A…）、圖卡念那個字（Apple.） */
const sayCard = (c: FlipCard) => `ph.word.${c.pair}`
/** 這一對的另一張 */
const mateOf = (cards: FlipCard[], c: FlipCard) => cards.find((k) => k.pair === c.pair && k.id !== c.id)

/**
 * 翻翻卡（字母遊戲時間的配對遊戲之一，T-147 英文門案 A）：一盤 2 對蓋著的卡（🍎🍎、🚌🚌），翻開兩張一樣的圖。
 * 不配「字母＋開頭的圖」（家長 2026-11-14：孩子沒記得單字，配開頭字母只能用猜的）。
 * 3 歲先用 2 對，熟了第一盤 3 對（指引 CG-3：記得 2 個步驟）。兩盤，共 4～5 對（LOAD-3）。
 * - 學習目標：聽、說英文課教過的字（apple），配好時把字母和字連起來。配好一對記 skill enword:apple（不算進 NEXT-2）；那一對翻錯過就不算一次就對。
 * - 翻一張念一張（Apple.）；配好念三明治「Apple. A… Apple.」，兩張留著打開、亮起來，卡角出現那個字母（A a）。
 * - 翻錯：輕輕一聲，停 1.3 秒再蓋回去，不扣分、不打叉（T-109）。蓋回去之前點別張：輕輕一聲、「看這裡」的圈圈。
 * - 第一盤先示範（新遊戲自己做對 2 次以前）：Watch me! → 手翻一張 apple、再翻另一張 apple → 三明治 → 蓋回去 → Your turn!（位置不換，T-100）。
 *   示範時點卡：停掉示範、蓋回去，直接輪到他（搶點，T-108）。
 * - 發呆 8 秒：手指著一張（翻開了一張就指它的另一半）；15 秒再說一次 Find a match!。
 * - 一盤配完停住，點「下一步」大箭頭才換下一盤（T-118）；最後一盤配完直接 onDone。多指只理第一根手指。
 */
export function Flip({
  boards,
  from = 0,
  demo,
  onMatch,
  onBoard,
  onDone,
}: {
  boards: FlipCard[][]
  from?: number
  demo: boolean
  /** 又配好一對：這一次一共配好幾對 */
  onMatch: (n: number) => void
  /** 一盤配完：配完幾盤、這一盤是不是自己做的（沒有翻錯、沒有手帶） */
  onBoard: (done: number, solo: boolean) => void
  onDone: () => void
}) {
  const start = Math.max(0, Math.min(from, boards.length - 1))
  const still = useReducedMotion()
  const [b, setB] = useState(start)
  const cards = boards[b]
  const [open, setOpen] = useState<string[]>([])
  const [matched, setMatched] = useState<string[]>([])
  const [glow, setGlow] = useState<string | null>(null)
  const [hand, setHand] = useState<string | null>(null)
  const [press, setPress] = useState(0)
  const [accept, setAccept] = useState(false)
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const live = useRef(true)
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const phase = useRef<'demo' | 'ask' | 'turn' | 'miss' | 'done'>('ask')
  const armed = useRef(false)
  const armTimer = useRef(0)
  /** 這一盤每一對翻錯過幾次 */
  const misses = useRef<Record<string, number>>({})
  /** 手帶過（示範、發呆的手）的那幾對：記成一起練 */
  const ledPairs = useRef(new Set<string>())
  const openRef = useRef<string[]>([])
  const matchedRef = useRef<string[]>([])
  const before = useRef(boards.slice(0, start).reduce((n, x) => n + x.length / 2, 0))
  const t0 = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])

  const setOpenBoth = (v: string[]) => {
    openRef.current = v
    setOpen(v)
  }

  const openTurn = () => {
    phase.current = 'turn'
    if (!t0.current) t0.current = performance.now()
    let asked = false
    idle.start(
      {
        repeat: () => {
          // 手指著一張：翻開了一張就指它的另一半；不然指第一對還沒配的字母卡
          const one = openRef.current.length === 1 ? cards.find((c) => c.id === openRef.current[0]) : null
          const target = one ? mateOf(cards, one) : cards.find((c) => !matchedRef.current.includes(c.pair))
          if (!target) return
          ledPairs.current.add(target.pair)
          setHand(target.id)
          setPress((p) => p + 1)
        },
        hint: () => {
          if (asked) return
          asked = true
          void say('en.abc.flip')
        },
      },
      { repeat: 8_000, hint: 7_000 },
    )
  }

  const begin = async (k: number) => {
    const ok = flow.begin(live)
    const cs = boards[k]
    phase.current = demo && k === start ? 'demo' : 'ask'
    armed.current = false
    setAccept(false)
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      if (!live.current || phase.current === 'done') return
      armed.current = true
      setAccept(true)
    }, PACE.BARGE_ARM)
    setOpenBoth([])
    matchedRef.current = []
    setMatched([])
    setGlow(null)
    setHand(null)
    misses.current = {}
    ledPairs.current = new Set()
    t0.current = 0
    taps.current = []
    idle.stop()
    await wait(k === start ? 350 : 450)
    if (!ok()) return
    if (phase.current === 'demo') {
      // 我做：手翻字母卡、再翻它的圖卡 → A is for apple! → 蓋回去 → Your turn!
      const a = cs[0]
      const w = mateOf(cs, a)!
      ledPairs.current.add(a.pair)
      await say('teach.watch.dodo')
      if (!ok()) return
      for (const c of [a, w]) {
        setHand(c.id)
        await wait(600)
        if (!ok()) return
        setPress((p) => p + 1)
        sfx.tap()
        setOpenBoth([...openRef.current, c.id])
        await say(sayCard(c))
        if (!ok()) return
      }
      setGlow(a.pair)
      sfx.pop()
      await say(...sandwich(a.L, a.w))
      if (!ok()) return
      await wait(500)
      if (!ok()) return
      setHand(null)
      setGlow(null)
      setOpenBoth([])
      phase.current = 'ask'
      await wait(450)
      if (!ok()) return
      await say('teach.turn.dodo')
    } else await say('en.abc.flip')
    if (!ok()) return
    openTurn()
  }

  useEffect(() => {
    live.current = true
    void begin(start)
    return () => {
      live.current = false
      clearTimeout(armTimer.current)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ping = (x: number, y: number) => {
    if (!layer.current) return void sfx.notYet()
    const p = localPoint(layer.current, x, y)
    notYet.ping(p.x, p.y)
  }

  /** 示範中被搶掉：示範收掉、蓋回去，直接輪到他 */
  const takeOver = () => {
    flow.cut()
    setHand(null)
    setGlow(null)
    setOpenBoth([])
    openTurn()
  }

  const tap = async (c: FlipCard, e?: ReactPointerEvent<HTMLButtonElement>) => {
    if (!armed.current || phase.current === 'done' || phase.current === 'miss') return e ? ping(e.clientX, e.clientY) : void sfx.notYet()
    if (phase.current === 'demo' || phase.current === 'ask') takeOver()
    if (matchedRef.current.includes(c.pair) || openRef.current.includes(c.id)) return void sfx.notYet()
    idle.poke()
    setHand(null)
    taps.current.push({ pick: c.id, ms: Math.round(performance.now() - t0.current) })
    sfx.tap()
    const now = [...openRef.current, c.id]
    setOpenBoth(now)
    if (now.length < 2) return void say(sayCard(c))
    const [x, y] = now.map((id) => cards.find((k) => k.id === id)!)
    if (x.pair === y.pair) {
      // 配好一對：兩張留著、亮起來；A is for apple!
      phase.current = 'miss'
      const L = x.pair
      const first = !misses.current[L]
      const guided = ledPairs.current.has(L)
      matchedRef.current = [...matchedRef.current, L]
      setMatched(matchedRef.current)
      setOpenBoth([])
      setGlow(L)
      if (first && !guided) sfx.correct()
      else sfx.pop()
      void logAttempt({
        station: 'english',
        game: ABC_GAME_ID.flip,
        itemId: `flip:${L}`,
        skill: `enword:${L}`,
        phase: guided ? 'guided' : 'quiz',
        level: 1,
        options: cards.map((k) => k.id),
        answer: L,
        taps: taps.current,
        firstTryCorrect: first,
        attempts: (misses.current[L] ?? 0) + 1,
        responseMs: Math.round(performance.now() - t0.current),
        hintUsed: guided,
        ...(guided ? { metrics: { led: 1 } } : {}),
      })
      taps.current = []
      t0.current = performance.now()
      onMatch(before.current + matchedRef.current.length)
      const all = matchedRef.current.length * 2 >= cards.length
      // 三明治：Apple. A… Apple.（把字母和字連起來）
      await say(...(first && !guided ? [praiseKey('dodo'), ...sandwich(x.L, x.w)] : sandwich(x.L, x.w)))
      if (!live.current) return
      // 稱讚念完才能翻下一張（稱讚不能搶，免得兩對的聲音疊在一起）
      if (!all) {
        phase.current = 'turn'
        return
      }
      phase.current = 'done'
      setAccept(false)
      idle.stop()
      const solo = !Object.values(misses.current).some(Boolean) && !ledPairs.current.size
      before.current += cards.length / 2
      onBoard(b + 1, solo)
      await wait(400)
      if (!live.current) return
      if (b + 1 >= boards.length) return onDone()
      if (!(await nextStep({ cue: true })) || !live.current) return
      setB(b + 1)
      void begin(b + 1)
      return
    }
    // 翻錯：念第二張，停一下再蓋回去
    phase.current = 'miss'
    misses.current[x.pair] = (misses.current[x.pair] ?? 0) + 1
    misses.current[y.pair] = (misses.current[y.pair] ?? 0) + 1
    void say(sayCard(c))
    await wait(MISS_MS)
    if (!live.current) return
    sfx.gentle()
    setOpenBoth([])
    phase.current = 'turn'
  }

  const blank = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onBlank(e.target) || !firstFinger(e.nativeEvent)) return
    if (!armed.current || phase.current === 'done' || phase.current === 'miss') return ping(e.clientX, e.clientY)
    if (phase.current === 'demo' || phase.current === 'ask') {
      ping(e.clientX, e.clientY)
      takeOver()
    }
  }

  const at = hand ? pointIn(els.current.get(hand), layer.current) : null
  return (
    <div className="en-flip" ref={layer} onPointerDown={blank} data-board={b} data-accepting={accept ? undefined : 'false'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={b}
          className={`en-flip-grid n${cards.length}`}
          initial={{ opacity: 0, x: still ? 0 : 80 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          {cards.map((c) => {
            const up = open.includes(c.id) || matched.includes(c.pair)
            const x = letterOf(c.L)
            const done = matched.includes(c.pair)
            return (
              <button
                key={c.id}
                ref={(el) => {
                  if (el) els.current.set(c.id, el)
                }}
                type="button"
                className={`en-flipcard${up ? ' is-up' : ''}${matched.includes(c.pair) ? ' is-matched' : ''}${glow === c.pair ? ' is-glow' : ''}`}
                aria-label={up ? c.w : '蓋著的卡'}
                data-id={c.id}
                data-pair={c.pair}
                onPointerDown={(e) => {
                  if (firstFinger(e.nativeEvent)) void tap(c, e)
                }}
                onClick={(e) => {
                  if (e.detail === 0) void tap(c)
                }}
              >
                <span className="en-flipcard-in">
                  <span className="en-flipcard-back" aria-hidden="true" />
                  <span className="en-flipcard-face" aria-hidden="true">
                    <Emoji name={c.icon} />
                    {/* 配好了：卡角出現這個字是哪個字母（A a），跟三明治一起把字母和字連起來 */}
                    {done && (
                      <span className="en-flipcard-letter">
                        <b>{x.L}</b>
                        <i>{x.l}</i>
                      </span>
                    )}
                  </span>
                </span>
                {glow === c.pair && matched.includes(c.pair) && <Sparkles count={10} />}
              </button>
            )
          })}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>{at && <Hand key="flip" x={at.x} y={at.y} tap={press} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
      {notYet.view}
    </div>
  )
}
