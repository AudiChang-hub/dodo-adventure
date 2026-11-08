import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger, localPoint, nearest, useNotYet } from '../../games/NotYet'
import { onBlank, sayRevealing, useFlow } from '../../games/barge'
import { praiseKey, retryKey, wait } from '../../games/lines'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { heardSince, say, sfx } from '../../lib/audio'
import { useRoute } from '../../lib/nav'
import { needsDemo, noteFormat, type Format } from '../formats'
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
  // 按返回離開時，舊畫面要淡出一下才卸載：路由一換就算離開，不再開始說新的話（T-92：波波數到一半按返回，回到首頁還在數）
  const route = useRoute().name
  const at = useRef(route)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  useEffect(() => {
    if (route !== at.current) live.current = false
  }, [route])
  return live
}

export interface QuizSpec {
  /** 題目換了就重來（Swap 的 id） */
  id: string
  /**
   * 題目（T-109：關鍵字放最前面，More! Which side?、Three! Where is three?）。第一句是關鍵字：
   * 孩子第一次點的時候這一句念完了沒，記成 QuizResult.heard；選項在這一句開始念的那一刻才出來
   */
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
  /** 題型（../formats.ts）：孩子還不會這種題型，手先做一次（T-96） */
  format?: Format
  /** 這一堂的最後一題：答對了不等稱讚念完，馬上交給下課的慶祝（T-113） */
  last?: boolean
}

export interface QuizResult {
  firstTry: boolean
  taps: { pick: string; ms: number }[]
  ms: number
  /** 錯兩次之後才答對（手指出答案） */
  hinted: boolean
  /** 這一題手先示範過（算一起練） */
  shown: boolean
  /** 第一次點的時候，題目的關鍵字念完了沒（T-109）；false 是用猜的，不計入熟練、也不算錯 */
  heard: boolean
  /**
   * 第一次點的時候手正指著答案（發呆手出來指、示範的手停在答案上，T-111）：答案是看手的，
   * 記成一起練（metrics.led），不計入熟練和家長區的「聽完才答」，也不給叮咚和 Yes!
   */
  led: boolean
}

/**
 * 一題選擇題。念完、輪到孩子：每張卡外面一圈淡黃框（看得出「現在可以選了」）。
 * 搶點（T-108，games/barge.ts）：念題目、示範、答錯的說明都可以被搶掉——點選項就停掉語音、收掉示範、照常判對錯；
 * 點空白就停掉語音、黃框馬上亮（不算錯）。題目剛出來 0.5 秒內（PACE.BARGE_ARM）、答對之後的稱讚到下一題，擋板照舊只給圈圈。
 * 點錯第一次：說出他選的是什麼、再問一次要找的（spec.wrong），答案外面一圈提示框；第二次：手點一下答案、說出答案，孩子再點對的（不會卡住）。
 * 閒置：15 秒再念一次題目 → 再 15 秒答案亮起來、手點一下（不說話）。
 * 題型還不會（spec.format，../formats.ts）：先示範——Watch me! → 手指泡泡（要找的樣子；How many? 指要數的那一堆）、念題目 → 手點答案、說出答案 → Your turn!（選項不換位置）
 * （T-96：盲測裡題目全是英文，他等到手出來才知道要做什麼）。
 * 關鍵字放最前面（T-109）：選項在題目第一句（關鍵字）開始念的時候才出來；第一次點的時候關鍵字念完了沒記成 heard。
 * 叮咚和 Yes! 只給「聽完才答、一次就對」；沒念完就點對（猜對）不說 Yes!，平平地把答案再說一次（This side has more!），
 * 幫他把聲音和答案連起來；點錯過才對的只有答案的綠框。點錯：淡掉、輕輕一聲，不搖、不打叉。
 */
export function Quiz({ spec, host, onDone, showing }: { spec: QuizSpec; host: PartCtx['host']; onDone: (r: QuizResult) => void; showing?: PartCtx['demo'] }) {
  const [marks, setMarks] = useState<Record<string, 'wrong' | 'correct'>>({})
  const [hint, setHint] = useState(false)
  const [hand, setHand] = useState(0)
  /** 擋板：題目剛出來的 0.5 秒、答對之後 */
  const [hold, setHold] = useState(true)
  const [cue, setCue] = useState(0)
  /** 輪到孩子選：每張卡外面一圈靜態的淡黃框（AI 小男生測試 #5：輪到他時選項要亮起來），點了第一下就收 */
  const [ready, setReady] = useState(false)
  /** 示範中：手在泡泡（有要數的那一堆就指那一堆）上、或在答案上 */
  const [teach, setTeach] = useState<'ask' | 'answer' | null>(null)
  const [press, setPress] = useState(0)
  /** 選項出來了沒（T-109）：題目的關鍵字開始念、或孩子搶點的時候 */
  const [opts, setOpts] = useState(false)
  const reveal = () => setOpts(true)
  /** 這一題什麼時候出來、第一次點的時候關鍵字念完了沒 */
  const qStart = useRef(performance.now())
  const heard = useRef(false)
  /** 第一次點的時候手正指著答案（T-111） */
  const led = useRef(false)
  const shown = useRef(!!spec.format && needsDemo(spec.format))
  const bubble = useRef<HTMLDivElement | null>(null)
  const pile = useRef<HTMLDivElement | null>(null)
  const live = useLive()
  /** demo 示範中、ask 念題目、fb 答錯的說明（這三段可以搶）；turn 輪到孩子；done 答對了（不能再點） */
  const phase = useRef<'demo' | 'ask' | 'turn' | 'fb' | 'done'>(shown.current ? 'demo' : 'ask')
  const armed = useRef(false)
  const flow = useFlow()
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const hinted = useRef(false)
  const idle = useIdle()
  const tiles = useRef(new Map<string, HTMLElement>())
  const layer = useRef<HTMLDivElement | null>(null)
  const notYet = useNotYet()

  /** 輪到孩子（念完、或被搶掉）：黃框亮、開始計時 */
  const openTurn = () => {
    phase.current = 'turn'
    setOpts(true)
    if (!taps.current.length) setReady(true)
    if (!t0.current) t0.current = performance.now()
    idle.start({ repeat: () => void say(...spec.prompt), hint: show })
  }

  /** 孩子搶點：停掉語音、示範收起來，直接輪到他（不再說 Your turn、不重講） */
  const takeOver = () => {
    const was = phase.current
    flow.cut()
    setOpts(true)
    if (was === 'demo') {
      setTeach(null)
      setMarks({})
      showing?.(false)
    }
    openTurn()
  }

  const ask = async () => {
    const ok = flow.begin(live)
    setCue((c) => c + 1)
    if (shown.current) {
      phase.current = 'demo'
      showing?.(true)
      await say('teach.watch.bobo')
      if (!ok()) return
      setTeach('ask')
      await sayRevealing(reveal, ...spec.prompt)
      if (!ok()) return
      setTeach('answer')
      await wait(650)
      if (!ok()) return
      setPress((p) => p + 1)
      setMarks({ [spec.answer]: 'correct' })
      sfx.pop()
      await say(...spec.correction)
      await wait(500)
      if (!ok()) return
      // 你做：手收起來，選項留在原地（T-100：三歲記的是位置，示範完換位置他照手剛剛指的地方點就點錯了）
      setTeach(null)
      setMarks({})
      showing?.(false)
      phase.current = 'ask'
      await wait(400)
      if (!ok()) return
      await say('teach.turn.bobo')
    } else await sayRevealing(reveal, ...spec.prompt)
    if (!ok()) return
    openTurn()
  }

  const show = () => {
    setHint(true)
    setHand((h) => h + 1)
  }

  useEffect(() => {
    const boot = window.setTimeout(ask, 0)
    // 題目剛出來：上一題連點的手指先不算（只給圈圈），之後念題目時就可以搶
    const arm = window.setTimeout(() => {
      if (!live.current || phase.current === 'done') return
      armed.current = true
      setHold(false)
    }, PACE.BARGE_ARM)
    const mine = () => {
      if (phase.current !== 'turn') return
      idle.poke()
      setCue((c) => c + 1)
      void say(...spec.prompt)
    }
    host.current = mine
    return () => {
      clearTimeout(boot)
      clearTimeout(arm)
      idle.stop()
      if (shown.current) showing?.(false)
      // 淡出中的上一題比下一題晚卸載：只收自己的
      if (host.current === mine) host.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 點空白：選項旁邊一點點（NEAR_PX 以內，T-112：以前點在選項外 15 px 毫無反應）算點到那個選項；
   * 念題目、示範的時候停掉語音、黃框馬上亮，不算錯。輪到他的時候點空白只有按下去的波紋（ui/press）
   */
  const blank = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onBlank(e.target) || !layer.current || !firstFinger(e.nativeEvent)) return
    if (opts && armed.current && phase.current !== 'done') {
      const near = nearest(
        spec.options.map((o) => [o.id, tiles.current.get(o.id)] as const),
        e.clientX,
        e.clientY,
      )
      if (near) return void tap(near)
    }
    if (!armed.current || phase.current === 'done' || phase.current === 'turn') return
    const p = localPoint(layer.current, e.clientX, e.clientY)
    notYet.ping(p.x, p.y)
    takeOver()
  }

  const tap = async (id: string) => {
    if (!armed.current || phase.current === 'done') return
    // 第一次點：題目的關鍵字念完了沒（要在 takeOver 停掉語音之前問）
    if (!taps.current.length) {
      heard.current = heardSince(spec.prompt[0], qStart.current)
      led.current = (hint && hand > 0) || teach === 'answer'
    }
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    // 又點到剛剛點錯的：輕輕一聲，答案亮起來（有反應，不會以為壞掉）
    if (marks[id] === 'wrong') {
      sfx.gentle()
      return show()
    }
    taps.current.push({ pick: id, ms: Math.round(performance.now() - t0.current) })
    setReady(false)
    if (id === spec.answer) {
      // 答對了：之後的點擊都不收（phase）；跟以前一樣不蓋擋板，稱讚完就換題
      phase.current = 'done'
      idle.stop()
      setMarks((m) => ({ ...m, [id]: 'correct' }))
      setHint(false)
      const r = { firstTry: taps.current.length === 1, taps: taps.current, ms: Math.round(performance.now() - t0.current), hinted: hinted.current, shown: shown.current, heard: heard.current, led: led.current }
      // 題型會了沒只看聽完才答、自己答的（猜對、跟著手點對都不代表懂這種題目在問什麼）
      if (spec.format && r.heard && !r.led) noteFormat(spec.format, r.firstTry)
      // 好玩的回饋只留給「聽完才答、一次就對」（T-109）：叮咚、Yes!。
      // 沒聽完就猜對：不說 Yes!，平平地把答案再說一次（This side has more!、This is three.）；點錯過才對的：答案的綠框就好
      // 手正指著答案時點的（T-111）：答案是看手的，也不慶祝
      const full = r.firstTry && r.heard && !r.led
      if (spec.last) {
        // 這一堂的最後一題（T-113，盲測 8948054：打勾之後等太久，孩子按返回）：打勾馬上出來，叮咚一聲就交給下課的慶祝（index.tsx 的 finish）
        if (full) sfx.correct()
        await wait(500)
        if (live.current) onDone(r)
        return
      }
      if (full) {
        sfx.correct()
        await say(praiseKey('bobo'))
      } else if (r.firstTry) await say(...spec.correction)
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
      // 錯第一次：說出選的是什麼、再問一次要找的；答案外面一圈提示框（不出手，讓孩子自己再點）。說的時候可以搶
      phase.current = 'fb'
      setHint(true)
      const ok = flow.begin(live)
      await say(...spec.wrong(id), ...spec.prompt)
      if (!ok()) return
      phase.current = 'turn'
      return idle.poke()
    }
    // 錯兩次：答案亮起來、手點一下、說出答案，再讓孩子點（說的時候可以搶）
    phase.current = 'fb'
    hinted.current = true
    show()
    const ok = flow.begin(live)
    await say(...spec.correction)
    if (!ok()) return
    phase.current = 'turn'
    idle.poke()
  }

  const at =
    teach === 'ask'
      ? // 有要數的那一堆（How many?）：手先指那一堆（數這些 → 點數字），沒有就指泡泡（要找的樣子）
        pile.current
        ? pointIn(pile.current, layer.current, 0.5, 0.7)
        : pointIn(bubble.current, layer.current, 0.5, 0.62)
      : teach === 'answer' || (hint && hand > 0)
        ? pointIn(tiles.current.get(spec.answer), layer.current)
        : null
  return (
    <div className={`ma-quiz${spec.top ? ' has-top' : ''}`} ref={layer} onPointerDown={blank}>
      {spec.top && (
        <div className="ma-quiz-top" key={cue} ref={pile}>
          {spec.top}
        </div>
      )}
      {spec.ask && (
        <div className="ma-ask" key={`ask${cue}`} ref={bubble} aria-hidden="true">
          {spec.ask}
        </div>
      )}
      <div className={`ma-options${spec.wide ? ' wide' : ''}${teach ? ' is-demo' : ''}`} data-dim={teach ? 'true' : undefined}>
        {spec.options.map((o, i) => (
          <motion.button
            key={o.id}
            ref={(el: HTMLButtonElement | null) => {
              if (el) tiles.current.set(o.id, el)
            }}
            className={`tile ma-tile${spec.wide ? ' wide' : ''}${teach && o.id === spec.answer ? ' is-shown' : ''}${marks[o.id] === 'correct' ? ' correct' : ''}${hint && o.id === spec.answer && marks[o.id] !== 'correct' ? ' hint' : ''}${ready && !hint ? ' cue turn-hop' : ''}`}
            aria-label={o.label}
            initial={{ y: 24, opacity: 0 }}
            // 關鍵字還沒開始念：先不出來、點不到（點那裡算點空白，T-109）
            // 點錯：淡掉就好，不搖、不打叉（T-109：點錯、亂點都平平的）
            animate={!opts ? { y: 24, opacity: 0 } : marks[o.id] === 'wrong' ? { opacity: 0.45, y: 0 } : { y: 0, opacity: 1 }}
            transition={!opts ? { duration: 0 } : marks[o.id] === 'wrong' ? { duration: 0.3 } : { ...FADE, delay: i * 0.06 }}
            style={{ '--turn-i': i, pointerEvents: opts ? undefined : 'none' } as CSSProperties}
            onPointerDown={(e) => firstFinger(e.nativeEvent) && tap(o.id)}
          >
            <div className="tile-in">{o.view}</div>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>{at && <Hand key="hint" x={at.x} y={at.y} tap={teach ? press : hand} size="10cqmin" cuff="#F0B088" />}</AnimatePresence>
      {notYet.view}
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
