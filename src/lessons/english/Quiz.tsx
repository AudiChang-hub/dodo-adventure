import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { onBlank, useFlow } from '../../games/barge'
import { localPoint, useNotYet } from '../../games/NotYet'
import { PACE } from '../../games/pace'
import { praiseKey, retryKey, wait } from '../../games/lines'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { logAttempt } from '../../lib/record'
import { Sparkles } from '../../ui/Sparkles'
import { pointIn } from '../math/kit'
import { needsDemo, noteFormat, type Format } from '../formats'
import type { QuizResult } from './plan'
import { wrongKeys, type Opt, type Question } from './quiz-plan'

const FORMAT: Record<Question['kind'], Format> = { big: 'en-big', little: 'en-little', word: 'en-word' }

/** 大寫或小寫題有一題不是一次就對：後面的小寫題改問大寫（退一級，LOAD-5） */
const missedLetter = (rs: QuizResult[]) => rs.some((r) => r.kind !== 'word' && !r.first)

/** 小小的畫框（找開頭的圖：「S → 一張圖」） */
function Frame() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x={5} y={7} width={38} height={34} rx={6} fill="#fff" stroke="currentColor" strokeWidth={3.5} />
      <circle cx={33} cy={17} r={4} fill="currentColor" opacity={0.55} />
      <path d="M8 37 L19 24 L27 32 L32 27 L40 37 Z" fill="currentColor" opacity={0.55} />
    </svg>
  )
}

/**
 * 豆豆頭上的泡泡：這一題要找什麼（T-96，聽不懂 Where is big S? 也看得懂）。三種題型樣子固定、分得出來：
 * 找大寫＝大的 S 是實心、小的 s 只有淡淡的框；找小寫反過來；找開頭的圖＝S 後面一個畫框。泡泡小、不能點，不像選項。
 */
function Ask({ q }: { q: Question }) {
  if (q.kind === 'word')
    return (
      <span className="en-ask-in is-word">
        <b>{q.L}</b>
        <i aria-hidden="true">→</i>
        <Frame />
      </span>
    )
  return (
    <span className={`en-ask-in is-${q.kind}`}>
      <b className={q.kind === 'big' ? 'on' : ''}>{q.L}</b>
      <b className={q.kind === 'little' ? 'on' : ''}>{q.L.toLowerCase()}</b>
    </span>
  )
}

/**
 * 選擇（英文課第 4 段）：一題一題問。
 * 搶點（T-108，games/barge.ts）：念題目、示範、答錯的說明都可以搶——點選項就停掉語音、收掉示範、照常判對錯；
 * 點空白就停掉語音、黃框馬上亮。題目剛出來 0.5 秒內、答對之後的稱讚到下一題不收（點了輕輕一聲）。
 * 豆豆頭上的泡泡畫出要找的樣子（Ask）。這種題型孩子還不會（../formats.ts）：這一堂的第一題先示範——
 * Watch me! → 手指泡泡、念題目 → 手點答案 → Your turn!（T-96：盲測裡他聽不懂英文題目，等手出來才點對）。
 * 示範完選項不換位置（T-100：三歲記的是位置，換邊他照手剛剛指的地方點就點錯了）；示範過的那一題記成一起練。
 * 大寫、小寫的選項卡一大一小（大 S 在大卡、小 s 在小卡），不用聽懂 big／little 也分得出來（T-100）。
 * 念完題目、開始收作答：每張選項一圈淡黃框、依序輕輕跳一下（輪到你了，靜音也看得出來；點了第一下就收起來）。
 * 答錯：手從泡泡（要找的樣子）移到答案上點一下，同時說出點的是什麼、要找的是什麼（That's big B. Find big A!），
 * 之後答案留著外框和手，點了才往下（一起練，不算答對）。聽不懂英文也看得出「要的是這個」（T-100）。
 * 同一題錯兩次：手帶著做（手點答案、答案亮起來，記成一起練），然後照樣往下。所以一題最多點錯兩次，題數固定，一定上得完（T-104）。
 * 答對（T-104，AI 小男生盲測：只有 Yes 和綠框，他看不出對了）：答對的那張放大、跳一下、右上角綠色大打勾、星星，其他的淡掉；
 * 下面的進度（第四顆石頭裡的小點）亮一顆（onProgress）。跟中文課選圖（T-97）一樣不用聽懂話也看得出來。
 * 字母題有一題不是一次就對：後面的小寫題改問大寫（退一級，quiz-plan.ts 的 easy）。
 * 同一天中途離開又回來（from、answers）：從下一題接著問，先重播這一題的示範（replay），不直接丟回題目（T-104）。
 * 發呆 15 秒再念一次題目、30 秒手指著答案。
 * 每一題都寫作答紀錄（家長區看得到）。onDone(每一題的種類和第一次有沒有答對)：隔天重不重上只看字母題（plan.ts 的 lessonGood）。
 */
export function Quiz({
  qs,
  from = 0,
  answers = [],
  replay = false,
  onProgress,
  onDone,
}: {
  qs: Question[]
  /** 從第幾題開始（前面的已經答完） */
  from?: number
  /** 前面答完的那幾題 */
  answers?: QuizResult[]
  /** 中途離開又回來：這一題先示範一次 */
  replay?: boolean
  /** 又答完一題：答完幾題、到現在的結果 */
  onProgress?: (done: number, rs: QuizResult[]) => void
  onDone: (rs: QuizResult[]) => void
}) {
  const start = Math.max(0, Math.min(from, qs.length - 1))
  const still = useReducedMotion()
  const [i, setI] = useState(start)
  /** 這一題答完了（答對的放大打勾、其他的淡掉） */
  const [solved, setSolved] = useState(false)
  const [accept, setAccept] = useState(false)
  const [state, setState] = useState<Record<string, 'no' | 'yes'>>({})
  const [hint, setHint] = useState(false)
  /** 輪到你了：念完題目、這一題還沒點過（T-84） */
  const [cue, setCue] = useState(false)
  const [bump, setBump] = useState<{ id: string; n: number } | null>(null)
  /** 示範中、答錯時：手在泡泡上（ask）或答案上（answer） */
  const [show, setShow] = useState<'ask' | 'answer' | null>(null)
  const [press, setPress] = useState(0)
  const shown = useRef(false)
  /** 這一堂的題目（小寫題可能換成退一級的大寫題；接著上的時候前面錯過，一開始就換） */
  const list = useRef<Question[]>([])
  /** 哪幾題要先示範：每種題型的第一題，而且這種題型孩子還不會；回來接著上的那一題一定示範（上課前就決定好，不會因為流程重跑而變） */
  const demoAt = useRef<boolean[]>([])
  if (!list.current.length) {
    const before = answers.slice(0, start)
    list.current = qs.map((x, k) => (k >= start && x.easy && missedLetter(before) ? x.easy : x))
    demoAt.current = list.current.map(
      (x, k) => k >= start && ((replay && k === start) || (list.current.findIndex((y, j) => j >= start && y.kind === x.kind) === k && needsDemo(FORMAT[x.kind]))),
    )
  }
  /** 泡泡跳一下（答錯時：先看要找的樣子） */
  const [hop, setHop] = useState(0)
  const layer = useRef<HTMLDivElement | null>(null)
  const bubble = useRef<HTMLDivElement | null>(null)
  const tiles = useRef(new Map<string, HTMLElement>())
  const live = useRef(true)
  /** demo 示範、ask 念題目、fb 答錯的說明（可以搶）；turn 輪到孩子；done 答完了（不能再點） */
  const phase = useRef<'demo' | 'ask' | 'fb' | 'turn' | 'done'>('ask')
  /** 這一題剛出來的 0.5 秒過了（PACE.BARGE_ARM） */
  const armed = useRef(false)
  const armTimer = useRef(0)
  const flow = useFlow()
  const notYet = useNotYet()
  /** 現在是第幾題（搶點時要知道念的是哪一題） */
  const cur = useRef(start)
  const tries = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const results = useRef<QuizResult[]>(answers.slice(0, start))
  const idle = useIdle()
  const q = list.current[i]

  /** 輪到孩子（念完、或被搶掉）：黃框亮、開始計時 */
  const openTurn = (qk: Question) => {
    phase.current = 'turn'
    if (!taps.current.length) setCue(true)
    if (!t0.current) t0.current = performance.now()
    idle.start({ repeat: () => void say(qk.prompt), hint: () => setHint(true) })
  }

  /** 孩子搶點：停掉語音；示範的手收起來（答錯的說明被搶掉時，答案的外框留著），直接輪到他 */
  const takeOver = () => {
    const was = phase.current
    flow.cut()
    if (was === 'demo') {
      setShow(null)
      setState({})
    } else if (was === 'fb') {
      setShow(null)
      setHint(true)
    }
    openTurn(list.current[cur.current])
  }

  const ask = async (k: number) => {
    const ok = flow.begin(live)
    cur.current = k
    phase.current = demoAt.current[k] ? 'demo' : 'ask'
    armed.current = false
    setAccept(false)
    clearTimeout(armTimer.current)
    // 題目剛出來的 0.5 秒：上一題連點的手指先不算，之後念題目、示範都可以搶
    armTimer.current = window.setTimeout(() => {
      if (!live.current || phase.current === 'done') return
      armed.current = true
      setAccept(true)
    }, PACE.BARGE_ARM)
    setState({})
    setHint(false)
    setCue(false)
    setSolved(false)
    tries.current = 0
    taps.current = []
    t0.current = 0
    idle.stop()
    const qk = list.current[k]
    setShow(null)
    shown.current = demoAt.current[k]
    await wait(k === start ? 300 : 450)
    if (!ok()) return
    // 開場只念題目，不再先說 Let's play!（T-108：輪到他之前越短越好）；要示範的題目 Watch me! 就是開頭
    if (shown.current) {
      // 我做：手先指泡泡（要找的樣子），念題目，再去點答案；答案亮起來、念它的音
      await say('teach.watch.dodo')
      if (!ok()) return
      setShow('ask')
      await say(qk.prompt)
      if (!ok()) return
      setShow('answer')
      await wait(650)
      if (!ok()) return
      setPress((p) => p + 1)
      setState({ [qk.answer]: 'yes' })
      sfx.pop()
      await say(qk.yes)
      await wait(500)
      if (!ok()) return
      // 你做：手收起來，選項留在原地（不換位置）
      setShow(null)
      setState({})
      phase.current = 'ask'
      await wait(400)
      if (!ok()) return
      await say('teach.turn.dodo')
    } else await say(qk.prompt)
    if (!ok()) return
    openTurn(qk)
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

  /** 念題目、示範、答錯說明的時候點空白：停掉語音、黃框馬上亮，不算錯 */
  const blank = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!armed.current || phase.current === 'done' || phase.current === 'turn' || !onBlank(e.target) || !layer.current) return
    const p = localPoint(layer.current, e.clientX, e.clientY)
    notYet.ping(p.x, p.y)
    takeOver()
  }

  const choose = async (o: Opt) => {
    setBump((b) => ({ id: o.id, n: (b?.n ?? 0) + 1 }))
    if (!armed.current || phase.current === 'done') return void sfx.tap()
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    setCue(false)
    const ms = Math.round(performance.now() - t0.current)
    taps.current.push({ pick: o.id, ms })
    if (o.id !== q.answer) {
      tries.current++
      sfx.gentle()
      setState((s) => ({ ...s, [o.id]: 'no' }))
      phase.current = 'fb'
      const ok = flow.begin(live)
      // 手從泡泡（要找的樣子）移到答案上點一下，同時說明點的是什麼、要找的是什麼；之後答案留著外框和手。
      // 第二次錯：一樣手從泡泡到答案，這次手直接幫他點下去（一起做），這一題就算完（不再等他點，T-104）。
      // 說明、手在動的時候都可以搶（T-108）：點選項就照常判
      setHint(false)
      setHop((h) => h + 1)
      setShow('ask')
      const why = wrongKeys(q, o)
      const together = tries.current >= 2
      const talk = say(...(together ? [q.prompt] : why.every(hasLine) ? why : [retryKey('dodo')]))
      await wait(800)
      if (!ok()) return
      setShow('answer')
      await wait(450)
      if (!ok()) return
      setPress((p) => p + 1)
      await talk
      if (!ok()) return
      if (together) return void complete(true, ms)
      setShow(null)
      setHint(true)
      phase.current = 'turn'
      return
    }
    void complete(false, ms)
  }

  /** 這一題答完（自己點對，或錯兩次以後手帶著做）：答對的放大、打勾、星星，其他的淡掉，進度亮一顆，再換下一題 */
  const complete = async (together: boolean, ms: number) => {
    phase.current = 'done'
    setAccept(false)
    setHint(false)
    idle.stop()
    const first = !together && tries.current === 0
    results.current.push({ kind: q.kind, first })
    noteFormat(FORMAT[q.kind], first)
    setState({ [q.answer]: 'yes' })
    setSolved(true)
    sfx.correct()
    void logAttempt({
      station: 'english',
      game: 'lesson-en',
      itemId: `${q.kind}:${q.answer}`,
      skill: q.skill,
      // 答錯過（答案已經亮起來、手指著）才點對的、手帶著做的、剛看手示範過的：算一起練
      phase: tries.current >= 1 || shown.current ? 'guided' : 'quiz',
      level: 1,
      options: q.options.map((x) => x.id),
      answer: q.answer,
      taps: taps.current,
      firstTryCorrect: first,
      attempts: tries.current + (together ? 0 : 1),
      responseMs: ms,
      hintUsed: hint || together,
    })
    onProgress?.(i + 1, results.current.slice())
    await say(...(first ? [praiseKey('dodo'), q.yes] : [q.yes]))
    await wait(500)
    if (!live.current) return
    if (i + 1 >= list.current.length) return onDone(results.current)
    // 字母題有一題沒有一次就對：小寫題改問大寫（退一級）。大寫題已經示範過，這一題不再示範
    const nx = list.current[i + 1]
    if (nx.easy && missedLetter(results.current)) {
      list.current[i + 1] = nx.easy
      demoAt.current[i + 1] = false
    }
    setI(i + 1)
    void ask(i + 1)
  }

  const handAt = q.options.findIndex((o) => o.id === q.answer)
  /** 字母題：大寫放大卡、小寫放小卡 */
  const size = (o: Opt) => (q.kind === 'word' || !o.text ? '' : o.text === o.text.toUpperCase() ? ' is-upper' : ' is-lower')
  const at = show === 'ask' ? pointIn(bubble.current, layer.current, 0.5, 0.62) : show === 'answer' ? pointIn(tiles.current.get(q.answer), layer.current) : null
  return (
    <div className="en-quiz" ref={layer} onPointerDown={blank}>
      {/* 要找什麼：豆豆頭上的泡泡（每題換 key 輕輕出來一次，不循環） */}
      <motion.div key={`ask${i}-${hop}`} ref={bubble} className="en-ask" aria-hidden="true" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Ask q={q} />
      </motion.div>
      <AnimatePresence initial={false}>
        <motion.div
          key={i}
          className={`en-options is-${q.kind} n${q.options.length}${show && !solved ? ' is-demo' : ''}${solved ? ' is-solved' : ''}`}
          data-accepting={accept ? undefined : 'false'}
          data-dim={show ? 'true' : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.45 } }}
          exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.1 } }}
        >
          {q.options.map((o, k) => (
            <motion.button
              key={o.id}
              animate={solved && state[o.id] === 'yes' ? { scale: still ? 1.08 : [1, 1.18, 1.08], y: still ? -8 : [0, -20, -8] } : { scale: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              ref={(el: HTMLButtonElement | null) => {
                if (el) tiles.current.set(o.id, el)
              }}
              type="button"
              className={`en-opt${size(o)}${show && o.id === q.answer ? ' is-shown' : ''}${state[o.id] === 'yes' ? ' is-yes' : state[o.id] === 'no' ? ' is-no' : ''}${hint && o.id === q.answer ? ' is-hint' : ''}${cue ? ' is-cue turn-hop' : ''}`}
              style={{ '--turn-i': k } as CSSProperties}
              aria-label={o.text ?? o.id}
              onClick={() => void choose(o)}
            >
              <span key={bump?.id === o.id ? bump.n : 0} className={bump?.id === o.id ? (state[o.id] === 'no' ? 'en-shake' : 'en-hop') : undefined}>
                {o.icon ? <Emoji name={o.icon} /> : <span className="en-opt-letter">{o.text}</span>}
              </span>
              {hint && !show && k === handAt && (
                <span className="en-opt-hand" aria-hidden="true">
                  <Hand x={58} y={58} tap={1} size="38%" cuff="#BFE0CC" />
                </span>
              )}
              {/* 答對：星星撒開、右上角綠色大打勾（跟中文課選圖一樣，T-97） */}
              {solved && state[o.id] === 'yes' && <Sparkles count={16} />}
              {solved && state[o.id] === 'yes' && (
                <motion.span
                  className="en-yes"
                  aria-hidden="true"
                  initial={still ? false : { scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.12 }}
                >
                  <svg viewBox="0 0 48 48" width="62%" aria-hidden="true">
                    <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.span>
              )}
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>{at && <Hand key="demo" x={at.x} y={at.y} tap={press} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
      {notYet.view}
    </div>
  )
}
