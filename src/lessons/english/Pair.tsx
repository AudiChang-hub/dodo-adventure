import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { onBlank, useFlow } from '../../games/barge'
import { firstFinger, localPoint, useNotYet } from '../../games/NotYet'
import { PACE } from '../../games/pace'
import { praiseKey, wait } from '../../games/lines'
import { heardSince, say, sfx, stopSpeech } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { logAttempt } from '../../lib/record'
import { Sparkles } from '../../ui/Sparkles'
import { nextStep } from '../../ui/NextStep'
import { pointIn } from '../math/kit'
import { ABC_GAME_ID, letterOf, sandwich, type PairOpt, type PairRound } from './abc'

/** 手指移動不到這麼多（px）就放開：當作點一下（點一下也算放進籃子，TOUCH-2） */
const TAP_PX = 14

/**
 * 放進籃子（字母遊戲時間的配對遊戲之一，T-147 英文門案 A；聽字找圖）：上面一個空籃子，下面 2～3 張圖。
 * 豆豆說「Where's the apple?」，把那張圖拖進籃子，或點一下（自己飛進去）；放對了籃子上出現它的字母（A a），念三明治「Apple. A… Apple.」。
 * - 不考「哪個是 A 開頭」（家長 2026-11-14：孩子沒記得單字只能用猜的）。只念英文課教過的代表字，干擾圖是不同類的東西（abc.ts 的 distractors）。
 * - 學習目標：聽懂教過的英文字（apple），再把它和字母連起來。作答記 skill enword:apple（不算進 NEXT-2、不算隔天重不重上）。
 * - 第一回合先示範（新遊戲自己做對 2 次以前，abc.ts 的 DEMO_UNTIL）：Watch me! → 手帶著答案進籃子 → Your turn!，圖回到原位、不換位置（T-100）。
 * - 搶點（T-108）：示範、念題目、答錯說明的時候點圖或拿起圖就停掉，照常判。剛出來的 0.5 秒、答完之後點的：「看這裡」的圈圈。
 * - 拖到一半在別的地方放手：圖回原位，不算答、不扣分。多指：只理第一根手指。
 * - 放錯：那張淡掉、輕輕一聲（不打叉，T-109）；說出放的是什麼、要找的是什麼（That's a bus. Find the apple!），手指著答案等他。
 *   錯兩次：手帶著做完這一回合（一起練），回合數固定、一定玩得完。
 * - 發呆 8 秒手安靜地指著答案、15 秒再念一次題目（PHASE-7）。
 * - 每回合做完停住，點「下一步」大箭頭才換下一回合（T-118）；最後一回合做完直接 onDone。
 */
export function Pair({
  rounds,
  from = 0,
  demo,
  onRound,
  onDone,
}: {
  rounds: PairRound[]
  from?: number
  /** 第一回合要不要先示範 */
  demo: boolean
  /** 又做完一回合：做完幾回合、這一回合是不是自己一次就做對（聽完、沒有手帶） */
  onRound: (done: number, solo: boolean) => void
  onDone: () => void
}) {
  const start = Math.max(0, Math.min(from, rounds.length - 1))
  const still = useReducedMotion()
  const [i, setI] = useState(start)
  const r = rounds[i]
  const [state, setState] = useState<Record<string, 'no' | 'yes'>>({})
  const [solved, setSolved] = useState<'full' | 'plain' | null>(null)
  const [accept, setAccept] = useState(false)
  /** 手：指著答案（answer）、帶著答案到籃子（basket） */
  const [show, setShow] = useState<'answer' | 'basket' | null>(null)
  const [press, setPress] = useState(0)
  const [hint, setHint] = useState(false)
  const [beckon, setBeckon] = useState(false)
  /** 正在飛進籃子的那一張（示範、放對） */
  const [carry, setCarry] = useState<string | null>(null)
  const [fly, setFly] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const grip = useRef<{ id: string; pid: number; x: number; y: number; moved: boolean } | null>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const basket = useRef<HTMLDivElement | null>(null)
  const layer = useRef<HTMLDivElement | null>(null)
  const live = useRef(true)
  const phase = useRef<'demo' | 'ask' | 'fb' | 'turn' | 'done'>('ask')
  const armed = useRef(false)
  const armTimer = useRef(0)
  const flow = useFlow()
  const notYet = useNotYet()
  const idle = useIdle()
  const tries = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const qStart = useRef(0)
  const heard = useRef(false)
  const led = useRef(false)
  const shown = useRef(false)
  const gripped = useRef(false)
  const doneN = useRef(start)

  // 要飛進籃子的那一張：算出它到籃子中間的距離
  useLayoutEffect(() => {
    if (!carry) return setFly(null)
    const el = els.current.get(carry)
    const b = basket.current
    if (!el || !b) return
    const a = el.getBoundingClientRect()
    const t = b.getBoundingClientRect()
    const d = drag?.id === carry ? drag : { dx: 0, dy: 0 }
    setFly({ id: carry, dx: t.left + t.width / 2 - (a.left + a.width / 2 - d.dx), dy: t.top + t.height * 0.42 - (a.top + a.height / 2 - d.dy) })
    setDrag(null)
    grip.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carry])

  const prompt = (q: PairRound) => `en.where.word.${q.answer}`

  const openTurn = (q: PairRound) => {
    phase.current = 'turn'
    if (!t0.current) t0.current = performance.now()
    let asked = false
    idle.start(
      {
        repeat: () => setHint(true),
        hint: () => {
          if (asked) return
          asked = true
          void say(prompt(q))
        },
      },
      { repeat: 8_000, hint: 7_000 },
    )
  }

  const takeOver = () => {
    const was = phase.current
    flow.cut()
    if (was === 'demo') {
      setShow(null)
      setState({})
      setCarry(null)
    } else if (was === 'fb') {
      setShow('answer')
      setBeckon(true)
    }
    openTurn(rounds[i])
  }

  const ask = async (k: number) => {
    const ok = flow.begin(live)
    phase.current = demo && k === start ? 'demo' : 'ask'
    shown.current = phase.current === 'demo'
    armed.current = false
    setAccept(false)
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      if (!live.current || phase.current === 'done') return
      armed.current = true
      setAccept(true)
    }, PACE.BARGE_ARM)
    setState({})
    setCarry(null)
    setDrag(null)
    setSolved(null)
    setHint(false)
    setBeckon(false)
    setShow(null)
    tries.current = 0
    taps.current = []
    t0.current = 0
    heard.current = false
    led.current = false
    gripped.current = false
    idle.stop()
    const q = rounds[k]
    qStart.current = performance.now()
    await wait(k === start ? 350 : 450)
    if (!ok()) return
    if (shown.current) {
      // 我做：Watch me! → 念題目 → 手指答案、帶著它進籃子 → 三明治 → 圖回原位 → Your turn!
      await say('teach.watch.dodo')
      if (!ok()) return
      await say(prompt(q))
      if (!ok()) return
      setShow('answer')
      await wait(650)
      if (!ok()) return
      setPress((p) => p + 1)
      setShow('basket')
      setCarry(q.answer)
      sfx.pop()
      await say(...sandwich(q.L, q.w))
      await wait(500)
      if (!ok()) return
      setShow(null)
      setCarry(null)
      phase.current = 'ask'
      await wait(400)
      if (!ok()) return
      await say('teach.turn.dodo')
    } else {
      await say(prompt(q))
    }
    if (!ok()) return
    openTurn(q)
  }

  useEffect(() => {
    live.current = true
    void ask(start)
    return () => {
      live.current = false
      clearTimeout(armTimer.current)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 第一次拿起或點的那一刻：題目念完了沒、手正指著答案沒 */
  const first = () => {
    if (taps.current.length || gripped.current) return
    heard.current = heardSince(prompt(r), qStart.current)
    led.current = hint || show === 'answer'
  }

  const blocked = (at: { clientX: number; clientY: number }) => {
    if (armed.current && phase.current !== 'done') return false
    if (layer.current) {
      const p = localPoint(layer.current, at.clientX, at.clientY)
      notYet.ping(p.x, p.y)
    } else sfx.notYet()
    return true
  }

  const choose = async (o: PairOpt, at?: { clientX: number; clientY: number }) => {
    if (at ? blocked(at) : !armed.current || phase.current === 'done') return
    first()
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    const ms = Math.round(performance.now() - (t0.current || qStart.current))
    taps.current.push({ pick: o.id, ms })
    if (o.id !== r.answer) {
      tries.current++
      sfx.gentle()
      setState((s) => ({ ...s, [o.id]: 'no' }))
      setDrag(null)
      grip.current = null
      const together = tries.current >= 2
      phase.current = together ? 'done' : 'fb'
      if (together) setAccept(false)
      const ok = flow.begin(live)
      setHint(false)
      setBeckon(false)
      const why = [`en.that.word.${o.id}`, `en.find.word.${r.answer}`]
      const talk = say(...(why.every(hasLine) ? why : [prompt(r)]))
      setShow('answer')
      await wait(700)
      if (!ok()) return
      setPress((p) => p + 1)
      await talk
      if (!ok()) return
      if (together) return void complete(true, ms)
      setBeckon(true)
      phase.current = 'turn'
      return
    }
    void complete(false, ms)
  }

  const complete = async (together: boolean, ms: number) => {
    phase.current = 'done'
    setAccept(false)
    setHint(false)
    setBeckon(false)
    setShow(together ? 'basket' : null)
    idle.stop()
    const firstTry = !together && tries.current === 0
    const h = heard.current
    const byHand = led.current && !shown.current
    const full = firstTry && h && !led.current
    setState({ [r.answer]: 'yes' })
    setCarry(r.answer)
    setSolved(full ? 'full' : 'plain')
    if (full) sfx.correct()
    else sfx.pop()
    void logAttempt({
      station: 'english',
      game: ABC_GAME_ID.pair,
      itemId: `pair:${r.L}:${r.answer}`,
      skill: r.skill,
      phase: shown.current || byHand ? 'guided' : 'quiz',
      level: 1,
      options: r.options.map((x) => x.id),
      answer: r.answer,
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: tries.current + (together ? 0 : 1),
      responseMs: ms,
      hintUsed: hint || beckon || together,
      heard: h,
      ...(shown.current ? { metrics: { shown: 1 } } : byHand ? { metrics: { led: 1 } } : {}),
    })
    doneN.current = i + 1
    onRound(i + 1, full && !shown.current)
    // 三明治：Apple. A… Apple.（把字母和字連起來）
    await say(...(full ? [praiseKey('dodo'), ...sandwich(r.L, r.w)] : sandwich(r.L, r.w)))
    await wait(400)
    if (!live.current) return
    if (i + 1 >= rounds.length) return onDone()
    if (!(await nextStep({ cue: true })) || !live.current) return
    setI(i + 1)
    void ask(i + 1)
  }

  // 等他放答案：答案每 4 秒再跳一下、手再按一下（最多 3 次，MOTION-2）
  useEffect(() => {
    if (!beckon) return
    const el = els.current.get(r.answer)
    const hop = () => {
      setPress((p) => p + 1)
      if (!still) el?.animate([{ translate: '0 0' }, { translate: '0 -22px', offset: 0.35 }, { translate: '0 0' }], { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)' })
    }
    hop()
    let n = 0
    const k = window.setInterval(() => {
      if (++n > 3) return clearInterval(k)
      hop()
    }, 4000)
    return () => clearInterval(k)
  }, [beckon, r.answer, still])

  // ── 拖曳 ──
  const overBasket = (x: number, y: number) => {
    const b = basket.current?.getBoundingClientRect()
    return !!b && x >= b.left - 16 && x <= b.right + 16 && y >= b.top - 16 && y <= b.bottom + 16
  }
  const down = (e: ReactPointerEvent<HTMLButtonElement>, o: PairOpt) => {
    if (!firstFinger(e.nativeEvent) || grip.current || fly || state[o.id] === 'no') return
    if (blocked(e)) return
    first()
    gripped.current = true
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    grip.current = { id: o.id, pid: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 測試環境可能不支援 */
    }
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = grip.current
    if (!g || g.pid !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.moved && Math.hypot(dx, dy) < TAP_PX) return
    g.moved = true
    setDrag({ id: g.id, dx, dy })
  }
  const up = (e: ReactPointerEvent<HTMLButtonElement>, o: PairOpt, cancel = false) => {
    const g = grip.current
    if (!g || g.pid !== e.pointerId) return
    grip.current = null
    if (cancel) return setDrag(null)
    // 點一下（沒拖）、或拖到籃子上放開：放進籃子；拖到別的地方放開：回原位、不算
    if (!g.moved || overBasket(e.clientX, e.clientY)) void choose(o)
    else setDrag(null)
  }

  const blank = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onBlank(e.target) || !firstFinger(e.nativeEvent) || !layer.current) return
    const p = localPoint(layer.current, e.clientX, e.clientY)
    if (!armed.current || phase.current === 'done') return notYet.ping(p.x, p.y)
    if (phase.current === 'turn') return
    notYet.ping(p.x, p.y)
    takeOver()
  }

  const x = letterOf(r.L)
  const at = show === 'answer' || (show === 'basket' && !carry) ? pointIn(els.current.get(r.answer), layer.current) : show === 'basket' ? pointIn(basket.current, layer.current, 0.5, 0.45) : hint && !solved ? pointIn(els.current.get(r.answer), layer.current) : null
  return (
    <div className="en-pair" ref={layer} onPointerDown={blank} data-round={i} data-answer={r.answer} data-accepting={accept ? undefined : 'false'}>
      <motion.div key={`b${i}`} ref={basket} className={`en-basket${solved ? ' is-full' : ''}`} initial={{ opacity: 0, y: still ? 0 : -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {/* 籃子上的字母：放對了才出現（題目前就寫字母，會變成找開頭字母） */}
        <span className={`en-basket-letter${solved ? '' : ' is-empty'}`} aria-label={solved ? r.L : undefined}>
          <b>{solved ? x.L : ''}</b>
          <i>{solved ? x.l : ''}</i>
        </span>
        <svg className="en-basket-art" viewBox="0 0 200 110" aria-hidden="true">
          <path d="M14 30 H186 L168 102 H32 Z" fill="#E7C48F" stroke="#B88B4F" strokeWidth={6} strokeLinejoin="round" />
          <path d="M30 56 H170 M38 80 H162" stroke="#B88B4F" strokeWidth={5} strokeLinecap="round" opacity={0.6} />
          <rect x={8} y={20} width={184} height={16} rx={8} fill="#D9AE72" stroke="#B88B4F" strokeWidth={5} />
        </svg>
        {solved === 'full' && <Sparkles count={16} />}
      </motion.div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={i}
          className={`en-pair-opts n${r.options.length}`}
          initial={{ opacity: 0, x: still ? 0 : 80 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          {r.options.map((o) => {
            const d = drag?.id === o.id ? drag : null
            const f = fly?.id === o.id ? fly : null
            return (
              <motion.button
                key={o.id}
                ref={(el) => {
                  if (el) els.current.set(o.id, el)
                }}
                type="button"
                className={`en-findpic${state[o.id] === 'no' ? ' is-no' : ''}${state[o.id] === 'yes' ? ' is-yes' : ''}${(beckon || hint) && o.id === r.answer ? ' is-beckon' : ''}${d ? ' is-drag' : ''}`}
                aria-label={o.w}
                data-id={o.id}
                animate={f ? { x: f.dx, y: f.dy, scale: 0.55 } : d ? { x: d.dx, y: d.dy, scale: 1.06 } : { x: 0, y: 0, scale: 1 }}
                transition={f ? { duration: still ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] } : d ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                onPointerDown={(e) => down(e, o)}
                onPointerMove={move}
                onPointerUp={(e) => up(e, o)}
                onPointerCancel={(e) => up(e, o, true)}
                onClick={(e) => {
                  if (e.detail === 0) void choose(o)
                }}
              >
                {/* 只有圖、不寫字（三歲不識字；寫了字會變成找一樣的字母） */}
                <Emoji name={o.icon} />
              </motion.button>
            )
          })}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>{at && <Hand key="pair" x={at.x} y={at.y} tap={press} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
      {notYet.view}
    </div>
  )
}
