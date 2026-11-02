import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger } from '../../games/NotYet'
import { praiseKey, retryKey, wait } from '../../games/lines'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { say, sfx } from '../../lib/audio'
import { DUR, EASE, FADE } from '../../ui/motion'
import type { Mood } from '../../art/Dino'
import type { Lesson } from './plan'

/** 每一段（數數、比多少、寫數字、小複習）從課拿到的東西 */
export interface PartCtx {
  lesson: Lesson
  /** 這一段做完：自己答了幾題、幾題不是一次就對 */
  done: (asked: number, missed: number) => void
  mood: (m: Mood) => void
  /** 示範中（手、筆在動）：Shell 的 data-demo，給三歲模擬測試看 */
  demo: (on: boolean) => void
  /** 點波波：這一段要做的事（再說一次題目、手再示範一次） */
  host: MutableRefObject<(() => void) | null>
  /** 右上角「今天的數字」跳一下（數到最後一個、寫好今天的數字） */
  ping: () => void
}

/** 畫面裡一個元素在 layer 裡的位置（百分比，給示範的手用） */
export function pointIn(el: HTMLElement | null | undefined, layer: HTMLElement | null, dx = 0.56, dy = 0.6) {
  if (!el || !layer) return null
  const r = el.getBoundingClientRect()
  const b = layer.getBoundingClientRect()
  if (!b.width || !b.height) return null
  return { x: ((r.left + r.width * dx - b.left) / b.width) * 100, y: ((r.top + r.height * dy - b.top) / b.height) * 100 }
}

/** 這一段還在畫面上（離開課、換到下一段就停下所有流程） */
export function useLive() {
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  return live
}

export interface QuizSpec {
  /** 題目換了就重來（Swap 的 id） */
  id: string
  prompt: string[]
  options: { id: string; view: ReactNode; label: string }[]
  answer: string
  /** 錯兩次、提示時說的話（This side has more!、This is three.） */
  correction: string[]
  /**
   * 錯第一次：說出孩子選的是什麼（This is four.、This side has fewer!），接著再問一次要找的（HOW-5、現況對照 A16）。
   * 沒給就只說 Try again!
   */
  wrong?: (picked: string) => string[]
  /** 題目上方的東西（有幾個的那一堆：要數的圖，不是選項） */
  top?: ReactNode
  /**
   * 波波的對話泡泡（比多少問「多」還是「少」的徽章）：貼在波波頭上、很小、不能點，
   * 畫面上能點的只有選項（以前放在選項上方的卡片，三歲孩子會以為也是一個選項）
   */
  ask?: ReactNode
  /** 選項是寬的（比多少的兩堆） */
  wide?: boolean
}

export interface QuizResult {
  firstTry: boolean
  taps: { pick: string; ms: number }[]
  ms: number
  /** 錯兩次之後才答對（手指出答案） */
  hinted: boolean
}

/**
 * 一題選擇題：念題目時選項上面蓋著擋板（點了只出現「看這裡」，PHASE-2），念完才收。
 * 念完、輪到孩子：每張卡外面一圈淡黃框（看得出「現在可以選了」）。
 * 點錯第一次：說出他選的是什麼、再問一次要找的（spec.wrong），答案外面一圈提示框；第二次：手點一下答案、說出答案，孩子再點對的（不會卡住）。
 * 閒置：15 秒再念一次題目 → 再 15 秒答案亮起來、手點一下（不說話）。
 */
export function Quiz({ spec, host, onDone }: { spec: QuizSpec; host: PartCtx['host']; onDone: (r: QuizResult) => void }) {
  const [marks, setMarks] = useState<Record<string, 'wrong' | 'correct'>>({})
  const [hint, setHint] = useState(false)
  const [hand, setHand] = useState(0)
  const [hold, setHold] = useState(true)
  const [cue, setCue] = useState(0)
  /** 輪到孩子選：每張卡外面一圈靜態的淡黃框（AI 小男生測試 #5：輪到他時選項要亮起來），點了第一下就收 */
  const [ready, setReady] = useState(false)
  const live = useLive()
  const busy = useRef(true)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const hinted = useRef(false)
  const idle = useIdle()
  const tiles = useRef(new Map<string, HTMLElement>())
  const layer = useRef<HTMLDivElement | null>(null)

  const ask = async () => {
    busy.current = true
    setHold(true)
    setCue((c) => c + 1)
    await say(...spec.prompt)
    if (!live.current) return
    busy.current = false
    setHold(false)
    if (!taps.current.length) setReady(true)
    t0.current = performance.now()
    idle.start({ repeat: () => void say(...spec.prompt), hint: show })
  }

  const show = () => {
    setHint(true)
    setHand((h) => h + 1)
  }

  useEffect(() => {
    const boot = window.setTimeout(ask, 0)
    const mine = () => {
      if (busy.current) return
      idle.poke()
      setCue((c) => c + 1)
      void say(...spec.prompt)
    }
    host.current = mine
    return () => {
      clearTimeout(boot)
      idle.stop()
      // 淡出中的上一題比下一題晚卸載：只收自己的
      if (host.current === mine) host.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async (id: string) => {
    if (busy.current) return
    idle.poke()
    // 又點到剛剛點錯的：輕輕一聲，答案亮起來（有反應，不會以為壞掉）
    if (marks[id] === 'wrong') {
      sfx.gentle()
      return show()
    }
    taps.current.push({ pick: id, ms: Math.round(performance.now() - t0.current) })
    setReady(false)
    if (id === spec.answer) {
      busy.current = true
      idle.stop()
      setMarks((m) => ({ ...m, [id]: 'correct' }))
      setHint(false)
      sfx.correct()
      const r = { firstTry: taps.current.length === 1, taps: taps.current, ms: Math.round(performance.now() - t0.current), hinted: hinted.current }
      await say(praiseKey('bobo'))
      await wait(r.firstTry ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
      if (live.current) onDone(r)
      return
    }
    sfx.gentle()
    setMarks((m) => ({ ...m, [id]: 'wrong' }))
    if (taps.current.length < 2) {
      if (!spec.wrong) {
        await say(retryKey('bobo'))
        return idle.poke()
      }
      // 錯第一次：說出選的是什麼、再問一次要找的；說的時候不收作答，答案外面一圈提示框（不出手，讓孩子自己再點）
      busy.current = true
      setHold(true)
      setHint(true)
      await say(...spec.wrong(id), ...spec.prompt)
      if (!live.current) return
      busy.current = false
      setHold(false)
      return idle.poke()
    }
    // 錯兩次：答案亮起來、手點一下、說出答案，再讓孩子點
    busy.current = true
    hinted.current = true
    setHold(true)
    show()
    await say(...spec.correction)
    if (!live.current) return
    busy.current = false
    setHold(false)
    idle.poke()
  }

  const at = hint && hand > 0 ? pointIn(tiles.current.get(spec.answer), layer.current) : null
  return (
    <div className={`ma-quiz${spec.top ? ' has-top' : ''}`} ref={layer}>
      {spec.top && (
        <div className="ma-quiz-top" key={cue}>
          {spec.top}
        </div>
      )}
      {spec.ask && (
        <div className="ma-ask" key={`ask${cue}`} aria-hidden="true">
          {spec.ask}
        </div>
      )}
      <div className={`ma-options${spec.wide ? ' wide' : ''}`}>
        {spec.options.map((o, i) => (
          <motion.button
            key={o.id}
            ref={(el: HTMLButtonElement | null) => {
              if (el) tiles.current.set(o.id, el)
            }}
            className={`tile ma-tile${spec.wide ? ' wide' : ''}${marks[o.id] === 'correct' ? ' correct' : ''}${hint && o.id === spec.answer && marks[o.id] !== 'correct' ? ' hint' : ''}${ready && !hint ? ' cue turn-hop' : ''}`}
            style={{ '--turn-i': i } as CSSProperties}
            aria-label={o.label}
            initial={{ y: 24, opacity: 0 }}
            animate={marks[o.id] === 'wrong' ? { x: [0, -10, 10, 0], opacity: 0.45, y: 0 } : { y: 0, opacity: 1 }}
            transition={marks[o.id] === 'wrong' ? { duration: 0.4 } : { ...FADE, delay: i * 0.06 }}
            onPointerDown={(e) => firstFinger(e.nativeEvent) && tap(o.id)}
          >
            <div className="tile-in">{o.view}</div>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>{at && <Hand key="hint" x={at.x} y={at.y} tap={hand} size="10cqmin" cuff="#F0B088" />}</AnimatePresence>
      <WaitShield on={hold} />
    </div>
  )
}

function FadeLayer({ children, className }: { children: ReactNode; className?: string }) {
  const present = useIsPresent()
  return (
    <motion.div
      className={className ?? 'ma-fill'}
      // 淡出中的那一層不收點擊（孩子連點上一題的手，不會點到正在消失的東西）
      style={{ pointerEvents: present ? undefined : 'none', zIndex: present ? 1 : 0 }}
      inert={!present}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DUR.swapIn, ease: EASE.out } }}
      exit={{ opacity: 0, transition: { duration: DUR.swapOut, delay: DUR.swapDelay, ease: EASE.in } }}
    >
      {children}
    </motion.div>
  )
}

/**
 * 原地換內容（換一回合、換一段）：只淡入淡出，不縮放（家長定的轉場）。新的蓋在上面淡入，舊的等一下才淡掉，不會先露出底色。
 * 跟 ui/Scenes 的 Swap 同一套節奏（ui/motion.ts 的 DUR），只是沒有 2% 的推近。
 */
export function Fade({ id, children, className }: { id: string | number; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence>
      <FadeLayer key={id} className={className}>
        {children}
      </FadeLayer>
    </AnimatePresence>
  )
}
