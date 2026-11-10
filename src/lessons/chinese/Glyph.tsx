import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { wait } from '../../games/lines'
import { WaitShield, firstFinger } from '../../games/NotYet'
import { Hand } from '../../games/Demo'
import { useFlow, onBlank } from '../../games/barge'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { Sparkles } from '../../ui/Sparkles'
import { FADE, REVEAL_MS } from '../../ui/motion'
import { useSwapQuiet } from '../../ui/Scenes'
import { shuffle } from '../../lib/random'
import type { Mood } from '../../art/Dino'
import type { ZhText } from './data'
import { GLYPH_GAME, type GlyphQuestion } from './match'
import type { HostTap } from './Lesson'

type Mark = 'wrong' | 'correct' | 'hint'
type Box = { left: number; top: number; width: number; height: number }

/** 字飛到空格要多久 */
const FLY_S = 0.36
/** 點錯的字：飛上去、跟答案並排一下、搖一搖、飛回來，一共多久（比答對短、沒有星星：不會為了看它故意點錯） */
const WRONG_S = 1.15
/** 答對：飛上去以後看一下打勾，就交給課程出「下一步」的大箭頭（T-123：停在配成一對的樣子，孩子點了才下課） */
const CHEER_MS = 800
/** 錯幾次以後手指出答案（FB-2；2 選 1 錯一次就只剩答案，不會走到這裡） */
const HINT_AFTER = 2

/**
 * 找一樣的字（T-117）：上面一個大字、旁邊一個虛線空格；下面兩、三個字，點長得一模一樣的那個（./match.ts 出題）。
 * 中文課是親子共讀：App 不出聲，題目不念，大人指著字問「下面哪一個跟它長得一模一樣？」。
 * - 點對：那個字飛上去、停在空格裡，兩個一模一樣的字並排，一起跳一下、亮綠框、打勾、撒星星，莫莫歡呼、叮一聲；打勾在飛上去的那張卡上（不會被蓋住）。停在這個樣子，等孩子點「下一步」才下課（Lesson.tsx）。
 * - 點錯：那個字也飛上去，跟答案並排一下（看得出「不一樣」：準則 FB-1 用看的說「你選的是什麼、要找的是什麼」），
 *   搖一搖、輕輕一聲，飛回原位、變淡；飛的時候就可以點別的。
 * - 最初幾次（progress 的 needsDemo）：下面的字先變淡，手點上面的字、再點下面一樣的那個，示範飛上去配成一對；
 *   做完字飛回去、選項換位置（不能靠記位置），才輪到他。示範中孩子搶著點（T-108）：示範收掉，照常判對錯（記成一起練）。
 * - 不示範的時候（T-124）：一進來手先點上面的字、再依序輕點下面每一張字卡（看這個、點這些），不停在答案上。
 * - 一直沒點：6 秒手再指一次字卡；12 秒手指著答案點一下（記成一起練）。點空白、點恐龍也會讓手再指一次。
 * - 配對成功：下面整排淡出收掉，只留上面一對、打勾和「下一步」大箭頭（T-124）。
 */
export function Glyph({
  t,
  q,
  demo,
  host,
  setMood,
  onResult,
  onDemoEnd,
  onNext,
}: {
  t: ZhText
  q: GlyphQuestion
  /** 這一堂先讓手示範一次 */
  demo: boolean
  host: HostTap
  setMood: (m: Mood) => void
  /** 答對了：第一下就對了沒、示範過沒、第一下時手正指著答案沒（progress 的 saveGlyph 用來升降級） */
  onResult: (r: { first: boolean; demo: boolean; led: boolean }) => void
  /** 示範做完、或被搶掉了（陪玩小字換成平常那句） */
  onDemoEnd?: () => void
  onNext: () => void
}) {
  const still = useReducedMotion()
  const quiet = useSwapQuiet()
  const [opts, setOpts] = useState(() => shuffle(q.options))
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const solved = Object.values(marks).includes('correct')
  const [accepting, setAcc] = useState(false)
  const acceptRef = useRef(false)
  const setAccepting = (v: boolean) => {
    acceptRef.current = v
    setAcc(v)
  }
  /** 正在飛的字：從哪一格、飛到空格；kind 決定飛上去停著（right、demo）還是飛回來（wrong） */
  const [fly, setFly] = useState<{ ch: string; from: Box; to: Box; kind: 'right' | 'wrong' | 'demo'; k: number } | null>(null)
  /** 兩個字配成一對了（答對、示範）：一起跳一下、綠框 */
  const [paired, setPaired] = useState<'right' | 'demo' | null>(null)
  /** 示範中（下面的字變淡） */
  const [demoing, setDemoing] = useState(demo)
  const demoingRef = useRef(demo)
  demoingRef.current = demoing
  /** 示範的手點到答案了：那一格亮起來（其他的還是淡的，PHASE-1） */
  const [demoPick, setDemoPick] = useState(false)
  /** 示範的手（作答區的百分比座標） */
  const [hand, setHand] = useState<{ x: number; y: number } | null>(null)
  const [demoTap, setDemoTap] = useState(0)
  /** 錯兩次、發呆太久：手在答案上點一下 */
  const [hintTap, setHintTap] = useState(0)
  /** 上面的字跳一下（提醒大人再指一次；示範時手點它） */
  const [nudge, setNudge] = useState(0)
  const idle = useIdle()
  const flow = useFlow()
  const live = useRef(true)
  const locked = useRef(false)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const wrongs = useRef(0)
  const hintUsed = useRef(false)
  const led = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const target = useRef<HTMLButtonElement>(null)
  const tiles = useRef(new Map<string, HTMLButtonElement>())
  const flyK = useRef(0)

  /** el 在作答區裡的位置（外層正在縮放、淡入時也對得上） */
  const boxOf = (el: Element | null | undefined): Box | null => {
    const r0 = root.current
    if (!el || !r0) return null
    const R = r0.getBoundingClientRect()
    const k = r0.offsetWidth ? R.width / r0.offsetWidth : 1
    const r = el.getBoundingClientRect()
    return { left: (r.left - R.left) / k, top: (r.top - R.top) / k, width: r.width / k, height: r.height / k }
  }
  /** el 的中心，換成作答區的百分比（給示範的手） */
  const pctOf = (el: Element | null | undefined, fx = 0.5, fy = 0.55) => {
    const b = boxOf(el)
    const r0 = root.current
    if (!b || !r0) return null
    return { x: ((b.left + b.width * fx) / r0.offsetWidth) * 100, y: ((b.top + b.height * fy) / r0.offsetHeight) * 100 }
  }
  const flyFrom = (ch: string, kind: 'right' | 'wrong' | 'demo') => {
    const from = boxOf(tiles.current.get(ch))
    const to = boxOf(slot.current)
    if (!from || !to) return
    setFly({ ch, from, to, kind, k: ++flyK.current })
  }

  const ask = () => setNudge((n) => n + 1)
  const showHint = () => {
    hintUsed.current = true
    setMarks((m) => ({ ...m, [q.char]: m[q.char] ?? 'hint' }))
    setHintTap((n) => n + 1)
  }
  /**
   * 「點下面的字卡」（T-124，盲測 f255333 中文 2：他不知道要點下面的字卡，點空白、點恐龍，20 秒就離開；中文課不出聲，只能用看的）：
   * 手先點一下上面的字（字跳一下：看這個），再依序輕點下面每一張字卡（每張跳一下：點這些），然後收起來。
   * 每一張都點一下、不停在答案上，所以不洩題、不算一起練。示範中孩子點了就收掉（搶點）。
   */
  const sweeping = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const [bump, setBump] = useState<Record<string, number>>({})
  const sweep = async () => {
    if (sweeping.current || locked.current || demoingRef.current || !acceptRef.current) return
    sweeping.current = true
    const ok = flow.begin(live)
    const end = () => {
      sweeping.current = false
      if (ok()) setHand(null)
    }
    const top = pctOf(target.current, 0.5, 0.62)
    if (top) setHand(top)
    await wait(650)
    if (!ok()) return end()
    setDemoTap((n) => n + 1)
    ask()
    await wait(750)
    for (const ch of optsRef.current) {
      if (!ok() || locked.current) return end()
      const at = pctOf(tiles.current.get(ch))
      if (at) setHand(at)
      await wait(600)
      if (!ok() || locked.current) return end()
      setDemoTap((n) => n + 1)
      setBump((b) => ({ ...b, [ch]: (b[ch] ?? 0) + 1 }))
      await wait(450)
    }
    await wait(300)
    end()
  }
  /** 孩子點了（或示範做完）：正在指字卡的手收掉 */
  const stopSweep = () => {
    if (!sweeping.current) return
    flow.cut()
    sweeping.current = false
    setHand(null)
  }
  /** 一直沒點：6 秒手再點一次每張字卡，12 秒手指著答案點一下（記成一起練） */
  const startIdle = () => idle.start({ repeat: () => void sweep(), hint: showHint }, { repeat: 6000, hint: 6000, again: 20_000 })

  /** 示範收掉（做完、或孩子搶著點） */
  const endDemo = () => {
    setHand(null)
    setPaired(null)
    setFly((f) => (f?.kind === 'demo' ? null : f))
    setDemoPick(false)
    setDemoing(false)
    onDemoEnd?.()
  }

  /** 手示範一次：點上面的字 → 點下面一樣的那個 → 飛上去配成一對 → 飛回去、換位置 → 輪到你了 */
  const runDemo = async () => {
    const ok = flow.begin(live)
    await wait(350)
    if (!ok()) return
    const top = pctOf(target.current, 0.5, 0.62)
    if (top) setHand(top)
    await wait(750)
    if (!ok()) return
    setDemoTap((n) => n + 1)
    ask()
    await wait(800)
    if (!ok()) return
    const at = pctOf(tiles.current.get(q.char))
    if (at) setHand(at)
    setDemoPick(true)
    await wait(800)
    if (!ok()) return
    setDemoTap((n) => n + 1)
    sfx.tap()
    flyFrom(q.char, 'demo')
    await wait(FLY_S * 1000 + 80)
    if (!ok()) return
    setPaired('demo')
    await wait(1300)
    if (!ok()) return
    setHand(null)
    setPaired(null)
    setFly(null)
    setDemoPick(false)
    await wait(250)
    if (!ok()) return
    // 換位置：答案一定換到別格（2 選 1 時就是兩個對調）
    setOpts((o) => {
      let n = shuffle(o)
      for (let i = 0; i < 5 && n.indexOf(q.char) === o.indexOf(q.char); i++) n = shuffle(o)
      return n.indexOf(q.char) === o.indexOf(q.char) ? [...o].reverse() : n
    })
    await wait(450)
    if (!ok()) return
    setDemoing(false)
    onDemoEnd?.()
    startIdle()
  }

  useEffect(() => {
    live.current = true
    void (async () => {
      // 卡片淡入完就收（上一題連點的手指不會直接點掉這一題，PACE.BARGE_ARM）；示範同時開始，孩子可以搶（T-108）
      await wait(Math.max(REVEAL_MS, PACE.BARGE_ARM))
      if (!live.current) return
      setAccepting(true)
      shownAt.current = performance.now()
      if (demo) void runDemo()
      else {
        startIdle()
        // 不示範的時候：一進來手就指一次下面的字卡（T-124）
        await wait(300)
        if (live.current) void sweep()
      }
    })()
    return () => {
      live.current = false
      idle.stop()
    }
    // 每一題進來一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    host.current = () => {
      if (locked.current) return
      idle.poke()
      ask()
      // 點恐龍（盲測：孩子不知道要點哪裡，先點恐龍）：手再指一次下面的字卡
      void sweep()
    }
    return () => {
      host.current = null
    }
  })

  /** 孩子點了（示範中也算：搶點，示範收掉） */
  const barge = () => {
    stopSweep()
    if (!demoing) return
    flow.cut()
    endDemo()
  }

  const tap = async (ch: string) => {
    if (!acceptRef.current || locked.current || marks[ch] === 'wrong') return
    barge()
    idle.poke()
    if (!taps.current.length) led.current = hintUsed.current
    taps.current.push({ pick: ch, ms: Math.round(performance.now() - shownAt.current) })
    if (ch === q.char) {
      locked.current = true
      idle.stop()
      setMarks((m) => ({ ...m, [ch]: 'correct' }))
      flyFrom(ch, 'right')
      sfx.correct()
      setMood('cheer')
      const guided = demo || led.current
      void logAttempt({
        station: 'mandarin',
        game: GLYPH_GAME,
        itemId: `${t.day}:${q.char}`,
        skill: `zhglyph:${q.char}`,
        level: q.level,
        phase: guided ? 'guided' : 'quiz',
        ...(guided ? { metrics: { led: 1 } } : {}),
        options: opts,
        answer: q.char,
        taps: taps.current,
        firstTryCorrect: wrongs.current === 0,
        attempts: taps.current.length,
        responseMs: taps.current[0].ms,
        hintUsed: hintUsed.current,
      })
      onResult({ first: wrongs.current === 0, demo, led: led.current })
      await wait(FLY_S * 1000)
      if (!live.current) return
      setPaired('right')
      await wait(CHEER_MS)
      if (live.current) onNext()
      return
    }
    wrongs.current++
    setMarks((m) => ({ ...m, [ch]: 'wrong' }))
    flyFrom(ch, 'wrong')
    sfx.gentle()
    await wait(WRONG_S * 1000)
    if (!live.current || locked.current) return
    setFly((f) => (f?.ch === ch ? null : f))
    if (wrongs.current >= HINT_AFTER) showHint()
    idle.poke()
  }

  const pairOn = paired != null
  return (
    <div
      ref={root}
      className="zh-quiz zh-glyph"
      data-demo={demoing ? '1' : undefined}
      onPointerDown={(e) => {
        // 示範中點空白處（T-108 搶點）：示範收掉、輪到你了
        if (demoing && acceptRef.current && onBlank(e.target) && firstFinger(e.nativeEvent)) {
          barge()
          startIdle()
          return
        }
        // 點空白處（盲測：先點空白）：手再指一次下面的字卡
        if (!demoing && acceptRef.current && !locked.current && onBlank(e.target) && firstFinger(e.nativeEvent)) {
          idle.poke()
          void sweep()
        }
      }}
    >
      <div className={`zh-glyph-pair${pairOn ? ' is-pair' : ''}${paired === 'right' ? ' is-solved' : ''}`}>
        <motion.button
          ref={target}
          type="button"
          className="zh-glyph-card zh-glyph-target"
          aria-label={`找一樣的字：${q.char}`}
          data-char={q.char}
          initial={nudge || quiet || still ? false : { y: -18 }}
          animate={pairOn && !still ? { y: [0, -16, 0] } : nudge && !still ? { y: [0, -10, 0] } : { y: 0 }}
          transition={pairOn || nudge ? { duration: 0.5, ease: 'easeOut' } : { type: 'spring', stiffness: 300, damping: 22 }}
          key={`t${nudge}${pairOn ? 'p' : ''}`}
          onPointerDown={() => {
            if (locked.current) return
            idle.poke()
            ask()
          }}
        >
          <span className="zh-glyph-char">{q.char}</span>
        </motion.button>
        <motion.div
          ref={slot}
          className="zh-glyph-card zh-glyph-slot"
          aria-hidden="true"
          animate={pairOn && !still ? { y: [0, -16, 0] } : { y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          key={`s${pairOn ? 'p' : ''}`}
        >
        </motion.div>
      </div>

      <div className={`options with-stim zh-options zh-glyph-options${solved ? ' is-solved' : ''}`} data-dim={demoing ? '1' : undefined}>
        {opts.map((ch, i) => {
          const m = marks[ch]
          const away = fly?.ch === ch || (m === 'correct' && paired === 'right')
          return (
            <motion.button
              key={ch}
              ref={(el) => {
                if (el) tiles.current.set(ch, el)
                else tiles.current.delete(ch)
              }}
              layout={!still}
              type="button"
              className={`tile${m === 'hint' ? ' hint' : ''}${accepting && !demoing && !Object.keys(marks).length ? ' cue turn-hop' : ''}${away ? ' is-away' : ''}`}
              style={{ '--turn-i': i } as CSSProperties}
              aria-label={`選項 ${i + 1}`}
              data-answer={ch === q.char ? '1' : undefined}
              data-char={ch}
              data-pick={demoPick && ch === q.char ? '1' : undefined}
              initial={quiet || still ? false : { y: 28, scale: 0.94 }}
              animate={
                solved
                  ? // 配對成功：下面整排淡出收掉（T-124：以前剩一張空白卡和一張淺灰的字，像壞掉），只留上面一對、打勾和大箭頭
                    { opacity: 0, scale: 0.86, y: 14, transition: { duration: 0.4, delay: 0.3 } }
                  : m === 'wrong'
                    ? { opacity: 0.45, scale: 0.94, y: 0, transition: { delay: fly?.ch === ch ? WRONG_S - 0.2 : 0, duration: 0.3 } }
                    : { y: 0, opacity: accepting || m ? 1 : 0.55, scale: 1 }
              }
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22, delay: m || solved ? 0 : 0.08 * i, opacity: FADE, layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
              onPointerDown={(e) => {
                // 兩根手指、手掌同時壓到兩張：只算第一根手指（準則 TOUCH-3）
                if (firstFinger(e.nativeEvent)) void tap(ch)
              }}
            >
              <div className={`tile-in${bump[ch] ? ' turn-hop' : ''}`} key={`b${bump[ch] ?? 0}`} style={{ '--turn-i': 0 } as CSSProperties}>
                <span className="zh-glyph-char">{ch}</span>
              </div>
              {m === 'hint' && hintTap > 0 && <Hand x={74} y={72} size="12cqmin" tap={hintTap} />}
            </motion.button>
          )
        })}
      </div>

      {fly && (
        <motion.div
          key={fly.k}
          className={`zh-glyph-fly${fly.kind === 'wrong' ? ' is-wrong' : ''}`}
          aria-hidden="true"
          style={{ width: fly.to.width, height: fly.to.height }}
          initial={{ left: fly.from.left + (fly.from.width - fly.to.width) / 2, top: fly.from.top + (fly.from.height - fly.to.height) / 2, scale: fly.from.width / fly.to.width }}
          animate={
            fly.kind === 'wrong'
              ? {
                  left: [fly.from.left + (fly.from.width - fly.to.width) / 2, fly.to.left, fly.to.left, fly.to.left, fly.to.left, fly.from.left + (fly.from.width - fly.to.width) / 2],
                  top: [fly.from.top + (fly.from.height - fly.to.height) / 2, fly.to.top, fly.to.top, fly.to.top, fly.to.top, fly.from.top + (fly.from.height - fly.to.height) / 2],
                  x: still ? 0 : [0, 0, -10, 10, 0, 0],
                  scale: [fly.from.width / fly.to.width, 1, 1, 1, 1, fly.from.width / fly.to.width],
                }
              : { left: fly.to.left, top: fly.to.top, scale: 1 }
          }
          transition={
            fly.kind === 'wrong'
              ? { duration: still ? 0.01 : WRONG_S, times: [0, 0.3, 0.45, 0.55, 0.68, 1], ease: 'easeInOut' }
              : { duration: still ? 0.01 : FLY_S, ease: [0.22, 1, 0.36, 1] }
          }
        >
          {/* 飛上去的字卡（配成一對時跟上面的字一起跳一下）；打勾、星星畫在這張卡上，不會被它蓋住（T-123，盲測 ca0d1e1 中文 seed 3：勾勾被蓋掉一半） */}
          <motion.div
            className="zh-glyph-fly-card"
            animate={pairOn && fly.kind !== 'wrong' && !still ? { y: [0, -16, 0] } : { y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            key={pairOn ? 'p' : 'n'}
          >
            <span className="zh-glyph-char">{fly.ch}</span>
            {paired === 'right' && fly.kind === 'right' && <Sparkles count={16} />}
            {pairOn && fly.kind !== 'wrong' && (
              <motion.span
                className="zh-yes zh-glyph-yes"
                initial={still ? false : { scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.08 }}
              >
                <svg viewBox="0 0 48 48" width="62%" aria-hidden="true">
                  <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.span>
            )}
          </motion.div>
        </motion.div>
      )}

      {hand && <Hand x={hand.x} y={hand.y} tap={demoTap} size="12cqmin" />}
      <WaitShield on={!accepting} />
    </div>
  )
}
