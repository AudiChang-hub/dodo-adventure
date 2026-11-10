import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { wait } from '../../games/lines'
import { WaitShield, firstFinger } from '../../games/NotYet'
import { Hand, tween, easeInOut } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { Sparkles } from '../../ui/Sparkles'
import { REVEAL_MS } from '../../ui/motion'
import { useSwapQuiet } from '../../ui/Scenes'
import { shuffle } from '../../lib/random'
import type { Mood } from '../../art/Dino'
import { plain, type ZhOrder, type ZhText } from './data'
import { Pic } from './Pic'
import { ZH_GAME, type HostTap } from './Lesson'

/** 答對的慶祝（FB-4 ≤ 1.5 秒），之後交給課程出「下一步」的大箭頭 */
const CHEER_MS = 1100
/** 放錯幾次以後手指出該放的那張 */
const HINT_AFTER = 2
/** 手指按下去移動超過這麼多（px）才算拖；不到就是點 */
const DRAG_PX = 14
/** 放開的地方離格子這麼近（格子邊長的比例）也算放進去（三歲手不準，TOUCH-1） */
const DROP_SLACK = 0.35

type Box = { x: number; y: number; w: number; h: number }
type Spot = 'tray' | 0 | 1

/**
 * 排兩張圖的順序（T-127 B 案，第 3 次）：故事裡誰先、誰後。親子共讀，App 不出聲：大人問「故事裡先說到誰？後來呢？」。
 * - 上面兩個大虛線格（1 一個點、2 兩個點，中間一個往右的箭頭），下面兩張圖。
 * - 點一張圖：它飛到下一個空的格子（先放 1 再放 2）；也可以拖進格子。放錯了（後面的放到 1）搖一搖、輕輕一聲、回到下面；
 *   拖到一半放手（沒放到格子上）：回到下面，不算錯。兩根手指、手掌：只算第一根。
 * - 一進來（收作答以後）手示範一次：從下面兩張圖中間移到 1 號格點一下（只示範「放上去」，不洩露是哪一張）；示範時搶著點、拖照常算。
 * - 一直沒動：格子跳一下（提醒大人再問）；再久手指著該放的那張點一下（記成一起練）。放錯兩次也一樣。
 * - 兩張都放對：兩格亮綠框、打勾、撒星星、莫莫歡呼；停在這個樣子，等孩子點「下一步」（Lesson.tsx）。
 * - 下面一張給大人的小字條（T-126 的樣子）：怎麼問、答不出來時說的兩句（先…後來…）。
 */
export function Order({ t, o, host, setMood, onNext }: { t: ZhText; o: ZhOrder; host: HostTap; setMood: (m: Mood) => void; onNext: () => void }) {
  const still = useReducedMotion()
  const quiet = useSwapQuiet()
  const [cards] = useState(() => shuffle([o.first, o.then]))
  /** 兩個格子放了哪一張 */
  const [placed, setPlaced] = useState<[string | null, string | null]>([null, null])
  const placedRef = useRef(placed)
  placedRef.current = placed
  const solved = !!placed[0] && !!placed[1]
  const [accepting, setAcc] = useState(false)
  const acceptRef = useRef(false)
  const setAccepting = (v: boolean) => {
    acceptRef.current = v
    setAcc(v)
  }
  /** 放錯的那張搖一搖（第幾次） */
  const [shake, setShake] = useState<{ w: string; k: number } | null>(null)
  /** 要放的那個格子跳一下（提醒大人再問、放錯時「放這裡」） */
  const [nudge, setNudge] = useState(0)
  /** 錯兩次、發呆：該放的那張亮黃框、手點一下 */
  const [hint, setHint] = useState<string | null>(null)
  const [hintTap, setHintTap] = useState(0)
  /** 示範的手（作答區的百分比座標） */
  const [hand, setHand] = useState<{ x: number; y: number } | null>(null)
  const [demoTap, setDemoTap] = useState(0)
  const [burst, setBurst] = useState(0)
  const idle = useIdle()
  const live = useRef(true)
  const locked = useRef(false)
  const demoRun = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const wrongs = useRef(0)
  const hintUsed = useRef(false)
  const led = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const slots = useRef<(HTMLDivElement | null)[]>([null, null])
  const cardEls = useRef(new Map<string, HTMLElement>())

  /** 下一個空的格子要放哪一張 */
  const want = (p = placedRef.current) => (p[0] ? (p[1] ? null : o.then.word) : o.first.word)

  /** el 在作答區裡的位置（外層正在縮放、淡入時也對得上） */
  const boxOf = (el: Element | null | undefined): Box | null => {
    const r0 = root.current
    if (!el || !r0) return null
    const R = r0.getBoundingClientRect()
    const k = r0.offsetWidth ? R.width / r0.offsetWidth : 1
    const r = el.getBoundingClientRect()
    return { x: (r.left - R.left) / k, y: (r.top - R.top) / k, w: r.width / k, h: r.height / k }
  }
  const scaleK = () => {
    const r0 = root.current
    return r0 && r0.offsetWidth ? r0.getBoundingClientRect().width / r0.offsetWidth : 1
  }
  const pct = (b: Box | null, fx = 0.5, fy = 0.55) => {
    const r0 = root.current
    if (!b || !r0) return null
    return { x: ((b.x + b.w * fx) / r0.offsetWidth) * 100, y: ((b.y + b.h * fy) / r0.offsetHeight) * 100 }
  }

  const stopDemo = () => {
    demoRun.current++
    setHand(null)
  }
  const ask = () => setNudge((n) => n + 1)
  const showHint = () => {
    const w = want()
    if (!w) return
    hintUsed.current = true
    setHint(w)
    setHintTap((n) => n + 1)
  }

  /**
   * 示範（PHASE-1，不洩露答案）：手出現在兩張圖中間，移到 1 號格點一下，再收起來。示範中搶著點、拖，照常算（T-108）。
   */
  const demo = async () => {
    const my = ++demoRun.current
    const ok = () => live.current && demoRun.current === my
    const a = boxOf(cardEls.current.get(cards[0].word))
    const b = boxOf(cardEls.current.get(cards[1].word))
    const s = pct(boxOf(slots.current[0]))
    if (!a || !b || !s) return
    const from = pct({ x: (a.x + b.x) / 2, y: a.y, w: a.w, h: a.h })
    if (!from) return
    setHand(from)
    await wait(still ? 300 : 700)
    if (!ok()) return
    // 一路滑上去（手的 spring 會跟著位置走），到格子點一下
    await tween(still ? 0 : 900, (f) => ok() && setHand({ x: from.x + (s.x - from.x) * f, y: from.y + (s.y - from.y) * f }), ok, easeInOut)
    if (!ok()) return
    setDemoTap((n) => n + 1)
    ask()
    await wait(900)
    if (ok()) setHand(null)
  }

  const open = () => {
    if (!live.current || locked.current) return
    setAccepting(true)
    if (!shownAt.current) shownAt.current = performance.now()
    idle.start({ repeat: ask, hint: showHint })
    void demo()
  }

  useEffect(() => {
    live.current = true
    void (async () => {
      await wait(Math.max(REVEAL_MS, PACE.BARGE_ARM))
      if (live.current) open()
    })()
    return () => {
      live.current = false
      idle.stop()
    }
    // 進來一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    host.current = () => {
      if (locked.current) return
      idle.poke()
      ask()
    }
    return () => {
      host.current = null
    }
  })

  /** 記下這一下（點、放下）；第一下時手正指著答案的話記成一起練 */
  const note = (w: string) => {
    if (!taps.current.length) led.current = hintUsed.current
    taps.current.push({ pick: w, ms: Math.round(performance.now() - (shownAt.current || performance.now())) })
  }

  const place = async (w: string, s: 0 | 1) => {
    const next: [string | null, string | null] = s === 0 ? [w, placedRef.current[1]] : [placedRef.current[0], w]
    placedRef.current = next
    setPlaced(next)
    setHint(null)
    if (!next[0] || !next[1]) {
      sfx.pop()
      idle.poke()
      return
    }
    // 兩張都放對了
    locked.current = true
    idle.stop()
    setBurst((b) => b + 1)
    sfx.correct()
    setMood('cheer')
    void logAttempt({
      station: 'mandarin',
      game: ZH_GAME,
      itemId: `${t.day}:order:${o.first.word}>${o.then.word}`,
      skill: `zhorder:${t.day}`,
      level: 1,
      phase: led.current ? 'guided' : 'quiz',
      ...(led.current ? { metrics: { led: 1 } } : {}),
      options: cards.map((c) => c.word),
      answer: `${o.first.word}>${o.then.word}`,
      taps: taps.current,
      firstTryCorrect: wrongs.current === 0,
      attempts: taps.current.length,
      responseMs: taps.current[0]?.ms ?? 0,
      hintUsed: hintUsed.current,
    })
    await wait(CHEER_MS)
    if (live.current) onNext()
  }

  const wrong = async (w: string) => {
    wrongs.current++
    sfx.gentle()
    setShake({ w, k: performance.now() })
    ask()
    await wait(700)
    if (!live.current || locked.current) return
    if (wrongs.current >= HINT_AFTER) showHint()
    idle.poke()
  }

  /** 點一張圖：放進下一個空的格子（放錯就搖一搖） */
  const tapCard = (w: string) => {
    if (!acceptRef.current || locked.current || placedRef.current.includes(w)) return
    stopDemo()
    idle.poke()
    note(w)
    const s: 0 | 1 = placedRef.current[0] ? 1 : 0
    if (w === want()) void place(w, s)
    else void wrong(w)
  }

  /** 拖到格子上放開：那一格空著、是那張該去的格子才放得進去 */
  const dropCard = (w: string, s: 0 | 1) => {
    if (!acceptRef.current || locked.current || placedRef.current.includes(w)) return false
    idle.poke()
    note(w)
    if (placedRef.current[s]) {
      void wrong(w)
      return false
    }
    const right = s === 0 ? o.first.word : o.then.word
    if (w === right) {
      void place(w, s)
      return true
    }
    void wrong(w)
    return false
  }

  /** 放開的地方在哪一格上（離格子近一點也算） */
  const slotAt = (cx: number, cy: number): 0 | 1 | null => {
    for (const s of [0, 1] as const) {
      const b = boxOf(slots.current[s])
      if (!b) continue
      const m = b.w * DROP_SLACK
      if (cx >= b.x - m && cx <= b.x + b.w + m && cy >= b.y - m && cy <= b.y + b.h + m) return s
    }
    return null
  }

  const spotOf = (w: string): Spot => (placed[0] === w ? 0 : placed[1] === w ? 1 : 'tray')
  const firstLine = plain(t.lines[o.first.line]).replace(/[，、：；,]+$/, '')
  const thenLine = plain(t.lines[o.then.line]).replace(/[，、：；,]+$/, '')
  const sameLine = o.first.line === o.then.line

  return (
    <div className="zh-order" ref={root} data-solved={solved || undefined}>
      <motion.div
        className="zh-order-slots"
        key={`n${nudge}`}
        animate={nudge && !still ? { y: [0, -8, 0] } : { y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        {([0, 1] as const).map((s) => (
          <div key={s} className="zh-order-cell">
            <div
              ref={(el) => {
                slots.current[s] = el
              }}
              className={`zh-order-slot${!placed[s] && want() === (s === 0 ? o.first.word : o.then.word) && accepting && !solved ? ' next' : ''}${placed[s] ? ' full' : ''}${solved ? ' correct' : ''}`}
              data-slot={s + 1}
              aria-label={s === 0 ? '先' : '後'}
            >
              <span className="zh-order-dots" aria-hidden="true">
                {Array.from({ length: s + 1 }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            </div>
            {/* 給大人看的小字：先、後 */}
            <span className="zh-order-tag">{s === 0 ? '先' : '後'}</span>
          </div>
        ))}
        <svg className="zh-order-arrow" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M8 24 H36 M26 13 L38 24 L26 35" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.div>

      <div className="zh-order-tray">
        {cards.map((c, i) => (
          <OrderCard
            key={c.word}
            word={c.word}
            icon={c.icon}
            n={c.word === o.first.word ? 1 : 2}
            i={i}
            spot={spotOf(c.word)}
            cue={accepting && !solved && !placed.some(Boolean) && !hint}
            hint={hint === c.word}
            handTap={hint === c.word ? hintTap : 0}
            shake={shake?.w === c.word ? shake.k : 0}
            quiet={quiet || !!still}
            canGrab={() => acceptRef.current && !locked.current && !placedRef.current.includes(c.word)}
            onGrab={() => {
              stopDemo()
              idle.poke()
            }}
            register={(el) => {
              if (el) cardEls.current.set(c.word, el)
              else cardEls.current.delete(c.word)
            }}
            target={(s) => {
              const from = boxOf(cardEls.current.get(c.word)?.parentElement)
              const to = boxOf(slots.current[s])
              return from && to ? { dx: to.x + to.w / 2 - (from.x + from.w / 2), dy: to.y + to.h / 2 - (from.y + from.h / 2), s: to.w / from.w } : null
            }}
            scaleK={scaleK}
            onTap={() => tapCard(c.word)}
            onDrop={(dx, dy) => {
              const home = boxOf(cardEls.current.get(c.word)?.parentElement)
              if (!home) return false
              const s = slotAt(home.x + home.w / 2 + dx, home.y + home.h / 2 + dy)
              return s == null ? false : dropCard(c.word, s)
            }}
          />
        ))}
      </div>

      {/* 排好了：打勾、星星蓋在放進去的圖上面（同樣大小、同樣位置的一排透明格子） */}
      {solved && (
        <div className="zh-order-slots zh-order-over" aria-hidden="true">
          {([0, 1] as const).map((s) => (
            <div key={s} className="zh-order-cell">
              <div className="zh-order-slot">
                {s === 1 && (
                  <motion.span
                    className="zh-yes"
                    initial={still ? false : { scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.12 }}
                  >
                    <svg viewBox="0 0 48 48" width="62%" aria-hidden="true">
                      <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.span>
                )}
                <Sparkles key={`${burst}-${s}`} count={12} />
              </div>
              <span className="zh-order-tag">{s === 0 ? '先' : '後'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="zh-note zh-order-note">
        <p className="zh-talk-ask">
          <span className="zh-talk-tag">排排看・問他</span>
          <span className="zh-talk-q">「故事裡先說到誰？後來呢？」請他把圖放進 1、2（點或拖都可以）。</span>
        </p>
        <p className="zh-talk-model">
          <span className="zh-talk-how">答不出來就說</span>
          {sameLine ? `「先說到${o.first.word}，再說到${o.then.word}：${firstLine}」` : `「先是${firstLine}，後來${thenLine}」`}
        </p>
      </div>

      {hand && <Hand x={hand.x} y={hand.y} tap={demoTap} size="12cqmin" />}
      <WaitShield on={!accepting} />
    </div>
  )
}

/**
 * 一張可以點、可以拖的圖。位置：在下面的托盤（spot = tray）或飛進某個格子（0、1，target 算出要移多少、放大多少）。
 * 拖的時候跟著手指走；放開時交給 onDrop（放對了留在格子，不然彈回托盤）。
 */
function OrderCard({
  word,
  icon,
  n,
  i,
  spot,
  cue,
  hint,
  handTap,
  shake,
  quiet,
  canGrab,
  onGrab,
  register,
  target,
  scaleK,
  onTap,
  onDrop,
}: {
  word: string
  icon: string
  /** 該放第幾格（1 先、2 後；三歲測試看 data-order） */
  n: 1 | 2
  i: number
  spot: Spot
  cue: boolean
  hint: boolean
  handTap: number
  shake: number
  quiet: boolean
  canGrab: () => boolean
  onGrab: () => void
  register: (el: HTMLElement | null) => void
  target: (s: 0 | 1) => { dx: number; dy: number; s: number } | null
  scaleK: () => number
  onTap: () => void
  onDrop: (dx: number, dy: number) => boolean
}) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sc = useMotionValue(1)
  const still = useReducedMotion()
  const drag = useRef<{ id: number; x0: number; y0: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  const go = (to: { dx: number; dy: number; s: number }) => {
    const opt = still ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 26 }
    void animate(x, to.dx, opt)
    void animate(y, to.dy, opt)
    void animate(sc, to.s, opt)
  }
  // 放進格子、彈回托盤
  useEffect(() => {
    if (drag.current?.moved) return
    if (spot === 'tray') go({ dx: 0, dy: 0, s: 1 })
    else {
      const to = target(spot)
      if (to) go(to)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot])

  const end = (e: React.PointerEvent, cancel: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    if (!d.moved) {
      if (!cancel) onTap()
      return
    }
    const k = scaleK()
    const placed = !cancel && onDrop((e.clientX - d.x0) / k, (e.clientY - d.y0) / k)
    // 放對了：useEffect（spot 變了）會把它送進格子；放錯、放到一半：彈回托盤
    if (!placed) go({ dx: 0, dy: 0, s: 1 })
  }

  return (
    <div className="zh-order-home">
      <motion.button
        ref={register}
        type="button"
        className={`tile zh-order-card${spot !== 'tray' ? ' placed' : ''}${cue ? ' cue turn-hop' : ''}${hint ? ' hint' : ''}${dragging ? ' dragging' : ''}`}
        style={{ x, y, scale: sc, '--turn-i': i } as unknown as CSSProperties}
        aria-label={word}
        data-word={word}
        data-order={n}
        data-spot={spot}
        initial={quiet ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: quiet ? 0 : 0.08 * i }}
        onPointerDown={(e) => {
          // 兩根手指、手掌：只算第一根（TOUCH-3）；正在拖的時候別的手指不算
          if (!firstFinger(e.nativeEvent) || drag.current || spot !== 'tray' || !canGrab()) return
          onGrab()
          drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false }
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {
            /* 測試裡合成的事件沒有真的指標 */
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          const dx = e.clientX - d.x0
          const dy = e.clientY - d.y0
          if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return
          if (!d.moved) {
            d.moved = true
            setDragging(true)
          }
          const k = scaleK()
          x.set(dx / k)
          y.set(dy / k)
        }}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => end(e, true)}
      >
        {/* 放錯了：圖搖一搖（每放錯一次換 key 重播） */}
        <motion.div
          key={`s${shake}`}
          className="tile-in"
          initial={false}
          animate={shake && !still ? { rotate: [0, -10, 10, -6, 6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Pic name={icon} />
        </motion.div>
        {hint && handTap > 0 && <Hand x={74} y={72} size="12cqmin" tap={handTap} />}
      </motion.button>
    </div>
  )
}
