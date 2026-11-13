import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { onBlank, sayRevealing, useFlow } from '../../games/barge'
import { firstFinger, localPoint, nearest, useNotYet } from '../../games/NotYet'
import { PACE } from '../../games/pace'
import { praiseKey, retryKey, wait } from '../../games/lines'
import { heardSince, say, sfx, stopSpeech } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { logAttempt } from '../../lib/record'
import { nextStep } from '../../ui/NextStep'
import { pointIn } from '../math/kit'
import { needsDemo, noteFormat, type Format } from '../formats'
import type { QuizResult } from './plan'
import { wrongKeys, type Opt, type Question } from './quiz-plan'
import { OptFace, QUIZ_GAME, turnStyle, type OptView, type QuizLook } from './QuizParts'
import { Bubbles } from './Bubbles'
import { Feed } from './Feed'

const FORMAT: Record<Question['kind'], Format> = { big: 'en-big', little: 'en-little', word: 'en-word' }

/** 大寫或小寫題有一題不是一次就對：後面的小寫題改問大寫（退一級，LOAD-5） */

/** 點錯一次、等他點答案：答案每隔這麼久再跳一下、手再按一下（T-116） */
const BECKON_MS = 4000
/** 最多再跳幾次（紙感螢幕不一直動，MOTION-2） */
const BECKON_MAX = 3

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
 * 豆豆頭上的泡泡畫出要找的樣子（Ask）。這種題型孩子還不會（../formats.ts）：這一堂的第一題先示範（大寫、小寫算同一輪，只示範第一題，T-125）——
 * Watch me! → 手指泡泡、念題目 → 手點答案 → Your turn!（T-96：盲測裡他聽不懂英文題目，等手出來才點對）。
 * 示範完選項不換位置（T-100：三歲記的是位置，換邊他照手剛剛指的地方點就點錯了）；示範過的那一題記成一起練。
 * 大寫、小寫的選項卡一大一小（大 S 在大卡、小 s 在小卡），不用聽懂 big／little 也分得出來（T-100）。
 * 念完題目、開始收作答：每張選項一圈淡黃框、依序輕輕跳一下（輪到你了，靜音也看得出來；點了第一下就收起來）。
 * 答錯：手從泡泡（要找的樣子）移到答案上點一下，同時說出點的是什麼、要找的是什麼（That's big B. Find big A!），
 * 之後答案留著外框和手，點了才往下（一起練，不算答對）。聽不懂英文也看得出「要的是這個」（T-100）。
 * 等他點的時候（T-116，盲測 69bfad5 英文 seed 3：點錯小 s 後手指向大 S，他沒有跟著點，「我一直點大的，一直都一樣」就離開）：
 * 以前說明念完大手就收起來，只剩答案卡角落一隻小手。現在大手留在答案上，答案亮暖黃光、跳兩下，手跟著按一下；
 * 每 BECKON_MS 沒點就再跳一下、手再按一下（最多 BECKON_MAX 次，之後靜止，MOTION-2）；點空白處也會再跳一下。
 * 同一題錯兩次：手帶著做（手點答案、答案亮起來，記成一起練），然後照樣往下。所以一題最多點錯兩次，題數固定，一定上得完（T-104）。
 * 答對（T-104，AI 小男生盲測：只有 Yes 和綠框，他看不出對了）：答對的那張放大、跳一下、右上角綠色大打勾、星星，其他的淡掉；
 * 下面的進度（第四顆石頭裡的小點）亮一顆（onProgress）。跟中文課選圖（T-97）一樣不用聽懂話也看得出來。
 * 這個慶祝只給「聽完才答、一次就對」（T-109）；沒聽完就猜對、點錯過、手帶著做的只有安靜的綠框和再念一次。
 * 進度點不管哪一種都填滿、跳一下（T-124：每點對一題都看得到往前走），聽完才答、一次就對的多一顆小星星。
 * 每一題的選項卡換一組顏色、從右邊滑進來（T-124：第一天只有 S、s 兩張，看得出是新的一題）。
 * 點錯：輕輕一聲、那張淡掉，不搖、不打叉。
 * 大寫、小寫題都照問，不再把小寫題換成大寫題（T-124，盲測 f255333：以前大寫題錯過、或中途離開又回來，小寫題改問大寫（T-100 退一級），
 * 同樣的「Big S」連問兩次，他說「一直點都一樣」「好久喔」，英文 4 次離開都在這裡）。小寫題點錯照樣有手指著答案、答案亮、跳（T-116）。
 * 同一天中途離開又回來（from、answers）：從下一題接著問，先重播這一題的示範（replay），不直接丟回題目（T-104）。
 * 發呆 8 秒手安靜地指著答案、15 秒再念一次題目（PHASE-7，T-112；以前 15／30 秒）。
 * 關鍵字放最前面（T-109）：題目先講關鍵字（Big S!；找開頭音的圖先念 S… s, s…），選項在關鍵字開始念的那一刻才出來。
 * 孩子點下去的那一刻關鍵字念完了沒，記成作答紀錄的 heard：沒念完就點的是猜的，不計入熟練、也不算錯（lib/record.ts）；
 * 猜對了照樣稱讚，但稱讚後把關鍵字再念一次（Yes! Big S!），幫他把聲音和答案連起來。
 * 每一題都寫作答紀錄（家長區看得到）。onDone(每一題的種類和第一次有沒有答對)：隔天重不重上只看字母題（plan.ts 的 lessonGood）。
 */
export function Quiz({
  qs,
  from = 0,
  answers = [],
  replay = false,
  look = 'cards',
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
  /** 今天的玩法（T-127）：找卡片、泡泡、餵豆豆。出題、對錯、紀錄都一樣，只換外觀和操作 */
  look?: QuizLook
  /** 又答完一題：答完幾題、到現在的結果 */
  onProgress?: (done: number, rs: QuizResult[]) => void
  onDone: (rs: QuizResult[]) => void
}) {
  const start = Math.max(0, Math.min(from, qs.length - 1))
  const still = useReducedMotion()
  const [i, setI] = useState(start)
  /** 這一題答完了（答對的放大打勾、其他的淡掉） */
  const [solved, setSolved] = useState<'full' | 'plain' | null>(null)
  const [accept, setAccept] = useState(false)
  /** 選項出來了沒：關鍵字開始念、或孩子搶點的時候才出來（T-109） */
  const [opts, setOpts] = useState(false)
  const [state, setState] = useState<Record<string, 'no' | 'yes'>>({})
  const [hint, setHint] = useState(false)
  /** 輪到你了：念完題目、這一題還沒點過（T-84） */
  const [cue, setCue] = useState(false)
  /** 示範中、答錯時：手在泡泡上（ask）或答案上（answer） */
  const [show, setShow] = useState<'ask' | 'answer' | 'mouth' | null>(null)
  /** 餵豆豆：正被送進嘴巴的那一張（示範、餵對） */
  const [carry, setCarry] = useState<string | null>(null)
  const mouth = useRef<HTMLElement | null>(null)
  /** 餵豆豆：手指拿起卡片的那一刻已經記下「聽完了沒、手指著沒」（放開時才判對錯） */
  const gripped = useRef(false)
  const [press, setPress] = useState(0)
  const shown = useRef(false)
  /** 這一堂的題目（大寫、小寫都照問，T-124） */
  const list = useRef<Question[]>([])
  /**
   * 哪幾題要先示範：找字母（大寫、小寫算同一輪，T-125）、找開頭的圖，各自的第一題，而且這一輪裡有孩子還不會的題型；
   * 回來接著上的那一題一定示範（上課前就決定好，不會因為流程重跑而變）。
   * T-125（盲測 0f3363f 英文：「一直點都一樣」）：以前大寫、小寫各示範一次，Watch me → 題目 → Your turn 一模一樣走兩遍，
   * 第一天只有 S、s 兩張卡，看起來是同一題做兩輪。現在大寫、小寫混成一輪，只在第一題示範；小寫題直接問（點錯照樣有手指著答案，T-116）。
   */
  const demoAt = useRef<boolean[]>([])
  if (!list.current.length) {
    list.current = qs.slice()
    const round = (x: Question) => (x.kind === 'word' ? 'word' : 'letter')
    const later = (k: number) => list.current.filter((y, j) => j >= start && round(y) === round(list.current[k]))
    demoAt.current = list.current.map(
      (x, k) =>
        k >= start &&
        ((replay && k === start) || (list.current.findIndex((y, j) => j >= start && round(y) === round(x)) === k && later(k).some((y) => needsDemo(FORMAT[y.kind])))),
    )
  }
  /** 泡泡跳一下（答錯時：先看要找的樣子） */
  const [hop, setHop] = useState(0)
  /** 點錯一次以後等他點：大手留在答案上、答案亮暖黃光、跳一下（T-116） */
  const [beckon, setBeckon] = useState(false)
  /** 答案跳一下、手按一下（點空白處時也叫） */
  const nudge = useRef<() => void>(() => {})
  const layer = useRef<HTMLDivElement | null>(null)
  const bubble = useRef<HTMLDivElement | null>(null)
  const tiles = useRef(new Map<string, HTMLElement>())
  const live = useRef(true)
  /**
   * 題目都做完、交給課去慶祝了（T-143）：之後題目淡出卸載時不停掉語音。
   * 以前題目淡出（0.3 秒）卸載時 stopSpeech，把課剛開口的 You did it! 切掉（盲測 9231aa6 的重現測試抓到）
   */
  const over = useRef(false)
  const done = (rs: QuizResult[]) => {
    over.current = true
    onDone(rs)
  }
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
  /** 這一題什麼時候開始（關鍵字要在這之後念完才算聽完） */
  const qStart = useRef(0)
  /** 第一次點下去的時候，關鍵字念完了沒 */
  const heard = useRef(false)
  /**
   * 第一次點下去的時候，手正指著答案（發呆 30 秒手出來指、示範的手正停在答案上）：答案是看手的，記成一起練（metrics.led），
   * 不計入熟練、家長區的「聽完才答」，也不給完整的慶祝（T-111，盲測 a35cd5e：答對的 12 次有 5 次是手指著答案時點的）
   */
  const led = useRef(false)
  const results = useRef<QuizResult[]>(answers.slice(0, start))
  const idle = useIdle()
  const q = list.current[i]

  /** 輪到孩子（念完、或被搶掉）：黃框亮、開始計時 */
  const openTurn = (qk: Question) => {
    phase.current = 'turn'
    setOpts(true)
    if (!taps.current.length) setCue(true)
    if (!t0.current) t0.current = performance.now()
    // 發呆的提示照小班段（準則 PHASE-7、FRAME-9 的 8／15 秒，T-112）：以前 15 秒才重念、30 秒才有手，
    // 盲測 b637ff7 他說「一直點都不知道要幹嘛」。8 秒：手安靜地指著答案（不說話）；15 秒：再念一次題目（只念一次，之後安靜）。
    // 手指著答案時點的照 T-111 記成一起練，不計入熟練
    let asked = false
    idle.start(
      {
        repeat: () => setHint(true),
        hint: () => {
          if (asked) return
          asked = true
          void say(...qk.prompt)
        },
      },
      { repeat: 8_000, hint: 7_000 },
    )
  }

  /** 孩子搶點：停掉語音；示範的手收起來（答錯的說明被搶掉時，答案的外框留著），直接輪到他 */
  const takeOver = () => {
    const was = phase.current
    flow.cut()
    setOpts(true)
    if (was === 'demo') {
      setShow(null)
      setState({})
      setCarry(null)
    } else if (was === 'fb') {
      // 答錯的說明被搶掉：手直接停到答案上等他點（T-116）
      setShow('answer')
      setBeckon(true)
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
    setCarry(null)
    gripped.current = false
    setHint(false)
    setBeckon(false)
    setCue(false)
    setSolved(null)
    setOpts(false)
    qStart.current = performance.now()
    heard.current = false
    led.current = false
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
      await sayRevealing(() => setOpts(true), ...qk.prompt)
      if (!ok()) return
      setShow('answer')
      await wait(650)
      if (!ok()) return
      setPress((p) => p + 1)
      setState({ [qk.answer]: 'yes' })
      if (look === 'feed') {
        // 餵豆豆：手帶著答案卡走到豆豆嘴巴，豆豆吃一口
        setShow('mouth')
        setCarry(qk.answer)
      }
      sfx.pop()
      await say(qk.yes)
      await wait(500)
      if (!ok()) return
      // 你做：手收起來，選項留在原地（不換位置；餵豆豆的卡片回到原位）
      setShow(null)
      setState({})
      setCarry(null)
      phase.current = 'ask'
      await wait(400)
      if (!ok()) return
      await say('teach.turn.dodo')
    } else await sayRevealing(() => setOpts(true), ...qk.prompt)
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
      if (!over.current) stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 點在選項旁邊一點點（games/NotYet 的 NEAR_PX 以內，三歲手指平均偏 4.5 mm）：算點到那個選項（T-112：以前點在外面 15 px 毫無反應）。
   * 只看已經出來的選項（關鍵字還沒念、選項還沒出來的時候點那裡，照 T-109 算點空白）
   */
  const nearOpt = (x: number, y: number) =>
    nearest(
      q.options.map((o) => [o, tiles.current.get(o.id)] as const).filter(([, el]) => !el?.classList.contains('is-wait')),
      x,
      y,
    )

  /**
   * 點空白：選項旁邊一點點的算點到選項；念題目、示範、答錯說明的時候停掉語音、黃框馬上亮，不算錯；
   * 擋板時間（剛出來的 0.5 秒、答完之後）出「看這裡」的圈圈。輪到他的時候點空白只有按下去的波紋（ui/press）
   */
  const blank = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onBlank(e.target) || !layer.current || !firstFinger(e.nativeEvent)) return
    const near = nearOpt(e.clientX, e.clientY)
    if (near) return void choose(near, e)
    const p = localPoint(layer.current, e.clientX, e.clientY)
    if (!armed.current || phase.current === 'done') return notYet.ping(p.x, p.y)
    // 點錯過、等他點答案：點空白處，答案再跳一下、手再按一下（「點這裡」）
    if (phase.current === 'turn') return void (beckon && nudge.current())
    notYet.ping(p.x, p.y)
    takeOver()
  }

  /**
   * 餵豆豆：手指拿起一張卡（還沒放開、還不知道餵不餵）。擋板時間不能拿（出「看這裡」的圈圈）；
   * 示範、念題目、答錯說明的時候拿起來就搶掉（T-108）。第一次拿的那一刻記下關鍵字念完了沒、手指著答案沒，放開時才判對錯
   */
  const grab = (at: { clientX: number; clientY: number }) => {
    if (!armed.current || phase.current === 'done') {
      if (layer.current) {
        const p = localPoint(layer.current, at.clientX, at.clientY)
        notYet.ping(p.x, p.y)
      }
      return false
    }
    if (!taps.current.length && !gripped.current) {
      heard.current = heardSince(q.prompt[0], qStart.current)
      led.current = hint || show === 'answer'
      gripped.current = true
    }
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    return true
  }

  const choose = async (o: Opt, at?: { clientX: number; clientY: number }) => {
    // 擋板時間（剛出來的 0.5 秒、答完之後）點的：輕輕一聲、按的地方出「看這裡」的圈圈，不跳、不好玩（T-109；T-112 加上看得見的圈圈）
    if (!armed.current || phase.current === 'done') {
      if (!at || !layer.current) return void sfx.notYet()
      const p = localPoint(layer.current, at.clientX, at.clientY)
      return notYet.ping(p.x, p.y)
    }
    // 第一次點：題目的關鍵字念完了沒（要在 takeOver 停掉語音之前問）
    if (!taps.current.length && !gripped.current) {
      heard.current = heardSince(q.prompt[0], qStart.current)
      led.current = hint || show === 'answer'
    }
    if (phase.current !== 'turn') takeOver()
    idle.poke()
    setCue(false)
    const ms = Math.round(performance.now() - t0.current)
    taps.current.push({ pick: o.id, ms })
    if (o.id !== q.answer) {
      tries.current++
      sfx.gentle()
      setState((s) => ({ ...s, [o.id]: 'no' }))
      const together = tries.current >= 2
      // 第一次錯的說明可以搶（T-108）：點選項就照常判。
      // 第二次錯是手帶著做完這一題（題數固定、一定上得完，T-104）：不能搶，不然一直點錯的孩子會一直把它打斷，永遠做不完
      phase.current = together ? 'done' : 'fb'
      if (together) setAccept(false)
      const ok = flow.begin(live)
      // 手從泡泡（要找的樣子）移到答案上點一下，同時說明點的是什麼、要找的是什麼；之後答案留著外框和手。
      // 第二次錯：一樣手從泡泡到答案，這次手直接幫他點下去（一起做），這一題就算完（不再等他點，T-104）。
      setHint(false)
      setBeckon(false)
      setHop((h) => h + 1)
      setShow('ask')
      const why = wrongKeys(q, o)
      const talk = say(...(together ? q.prompt : why.every(hasLine) ? why : [retryKey('dodo')]))
      await wait(800)
      if (!ok()) return
      setShow('answer')
      await wait(450)
      if (!ok()) return
      setPress((p) => p + 1)
      await talk
      if (!ok()) return
      if (together) return void complete(true, ms)
      // 大手留在答案上（不收起來）、答案亮起來跳一下，等他點（T-116）
      setBeckon(true)
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
    setBeckon(false)
    // 自己點對的：等他點的那隻大手收起來（手帶著做的照舊留著，跟著念答案）
    if (!together) setShow(null)
    idle.stop()
    const first = !together && tries.current === 0
    const h = heard.current
    /** 跟著手點的（不是剛示範過的那一題）：記成一起練 */
    const byHand = led.current && !shown.current
    results.current.push({ kind: q.kind, first, heard: h })
    // 題型會了沒只看聽完才答、自己答的（猜對、跟著手點對都不代表懂這種題目在問什麼）
    if (h && !led.current) noteFormat(FORMAT[q.kind], first)
    setState({ [q.answer]: 'yes' })
    // 餵豆豆：答案卡飛進嘴巴吃掉
    if (look === 'feed') setCarry(q.answer)
    // 好玩的回饋只留給「聽完才答、一次就對」（T-109，家長：他把 App 當遊戲在亂試）：放大、打勾、星星、豆豆歡呼、進度點亮。
    // 沒聽完就猜對、點錯過才對、手帶著做的：答案安靜地亮著、其他的淡掉，把關鍵字或答案再念一次，不慶祝
    // 手正指著答案時點的（T-111）也一樣不慶祝：答案是看手的
    const full = first && h && !led.current
    setSolved(full ? 'full' : 'plain')
    if (full) sfx.correct()
    void logAttempt({
      station: 'english',
      game: QUIZ_GAME[look],
      itemId: `${q.kind}:${q.answer}`,
      skill: q.skill,
      // 剛看手示範過的：算一起練。第一次就點錯的算自己答、沒答對（T-109：以前也算一起練，答錯不會讓熟練度退，
      // 2 選 1 亂點的孩子只要猜對 3 次就算熟；現在答錯會退一格，沒聽完就點的另外排除）
      // 跟著手點的（第一次點的時候手正指著答案，T-111）也算一起練
      phase: shown.current || byHand ? 'guided' : 'quiz',
      level: 1,
      options: q.options.map((x) => x.id),
      answer: q.answer,
      taps: taps.current,
      firstTryCorrect: first,
      attempts: tries.current + (together ? 0 : 1),
      responseMs: ms,
      hintUsed: hint || beckon || together,
      heard: h,
      ...(shown.current ? { metrics: { shown: 1 } } : byHand ? { metrics: { led: 1 } } : {}),
    })
    onProgress?.(i + 1, results.current.slice())
    // 最後一題（T-113，盲測 8948054：打勾之後要等 4 秒才慶祝、4.5 秒才下課，孩子等不及按返回）：
    // 打勾、星星照舊馬上出來；聽完才答、一次就對的只說一聲 Yes!，0.6 秒後就進下課的慶祝（index.tsx 的 finish 說 You did it!）
    if (i + 1 >= list.current.length) {
      if (full) void say(praiseKey('dodo'))
      await wait(600)
      if (!live.current) return
      // 手帶著做完的最後一題（T-118，家長：做完一樣停住）：停在答案上，點「下一步」才去下課的慶祝；自己點對的直接慶祝
      if (together && !(await nextStep({ cue: true }))) return
      if (live.current) done(results.current)
      return
    }
    // 聽完才答、一次就對：Yes! S… s, s…。猜對（關鍵字還沒念完就點對）：不說 Yes!，平平地把關鍵字和答案再念一次（Big S!）
    await say(...(full ? [praiseKey('dodo'), q.yes] : first ? q.echo : [q.yes]))
    await wait(500)
    if (!live.current) return
    if (i + 1 >= list.current.length) return done(results.current)
    // 停在答完的這一題（打勾、綠框留著），等孩子點「下一步」才換題（T-118：不自己換）。
    // 箭頭一出來就跳、手馬上點給他看（T-122，盲測 ca0d1e1 英文 seed 2 重跑：答完他「不知道要幹嘛，好久喔」按返回離開）
    if (!(await nextStep({ cue: true })) || !live.current) return
    setI(i + 1)
    void ask(i + 1)
  }

  // 等他點答案（T-116）：答案跳兩下、手按一下；之後每 4 秒再一次，最多 3 次（減少動態效果時只亮、不跳）
  useEffect(() => {
    if (!beckon) {
      nudge.current = () => {}
      return
    }
    const el = tiles.current.get(q.answer)
    nudge.current = () => {
      if (!live.current) return
      setPress((p) => p + 1)
      if (!still) el?.animate([{ translate: '0 0' }, { translate: '0 -22px', offset: 0.35 }, { translate: '0 0' }], { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)', iterations: 1 })
    }
    if (!still) el?.animate([{ translate: '0 0' }, { translate: '0 -22px', offset: 0.35 }, { translate: '0 0' }], { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)', iterations: 2 })
    let n = 0
    const k = window.setInterval(() => {
      if (++n > BECKON_MAX) return clearInterval(k)
      nudge.current()
    }, BECKON_MS)
    return () => clearInterval(k)
  }, [beckon, q.answer, still])

  const handAt = q.options.findIndex((o) => o.id === q.answer)
  /** 字母題：大寫放大卡、小寫放小卡 */
  const size = (o: Opt) => (q.kind === 'word' || !o.text ? '' : o.text === o.text.toUpperCase() ? ' is-upper' : ' is-lower')
  const at =
    show === 'ask'
      ? pointIn(bubble.current, layer.current, 0.5, 0.62)
      : show === 'answer'
        ? pointIn(tiles.current.get(q.answer), layer.current)
        : show === 'mouth'
          ? pointIn(mouth.current, layer.current, 0.5, 0.5)
          : null
  /** 三種玩法共用的選項狀態（T-127：泡泡、餵豆豆只換外觀和操作） */
  const view: OptView = {
    q,
    i,
    still: !!still,
    boxClass: `is-${q.kind} n${q.options.length} q${i % 3}${show && !solved ? ' is-demo' : ''}${solved ? ' is-solved' : ''}${solved === 'plain' ? ' is-plain' : ''}`,
    accept,
    ready: opts || !!solved,
    state,
    optClass: (o) =>
      `en-opt${opts || solved ? '' : ' is-wait'}${size(o)}${show && o.id === q.answer ? ' is-shown' : ''}${state[o.id] === 'yes' ? ' is-yes' : state[o.id] === 'no' ? ' is-no' : ''}${hint && o.id === q.answer ? ' is-hint' : ''}${beckon && o.id === q.answer ? ' is-beckon' : ''}${cue ? ' is-cue turn-hop' : ''}`,
    tile: (id) => (el) => {
      if (el) tiles.current.set(id, el)
    },
    choose: (o, e) => void choose(o, e),
    grab,
    face: (o, k) => <OptFace o={o} hand={hint && !show && k === handAt} cheer={solved === 'full' && state[o.id] === 'yes'} still={!!still} />,
    cheer: (o) => solved === 'full' && state[o.id] === 'yes',
  }
  return (
    <div className={`en-quiz is-${look}`} ref={layer} onPointerDown={blank}>
      {/* 要找什麼：豆豆頭上的泡泡（每題換 key 輕輕出來一次，不循環） */}
      <motion.div key={`ask${i}-${hop}`} ref={bubble} className="en-ask" aria-hidden="true" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Ask q={q} />
      </motion.div>
      {look === 'bubbles' ? (
        <Bubbles v={view} />
      ) : look === 'feed' ? (
        <Feed v={view} carry={carry} onMouth={(el) => (mouth.current = el)} />
      ) : (
        <AnimatePresence initial={false}>
          <motion.div
            key={i}
            // 每一題換一組顏色的卡片、從右邊滑進來（T-124，盲測 f255333：第一天只有 S、s 兩張，兩題長得一模一樣，「一直點都一樣」）
            className={`en-options ${view.boxClass}`}
            data-accepting={accept ? undefined : 'false'}
            data-dim={show ? 'true' : undefined}
            initial={{ opacity: 0, x: still ? 0 : 90 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: still ? 0 : -90, transition: { duration: 0.3, delay: 0.1 } }}
          >
            {q.options.map((o, k) => (
              <motion.button
                key={o.id}
                animate={view.cheer(o) ? { scale: still ? 1.08 : [1, 1.18, 1.08], y: still ? -8 : [0, -20, -8] } : { scale: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                ref={view.tile(o.id)}
                type="button"
                className={view.optClass(o, k)}
                style={turnStyle(k)}
                aria-label={o.text ?? o.id}
                // 手指一按下就收（T-112：以前用 click，要放開才算，手指滑一下就被瀏覽器取消、毫無反應）；鍵盤（detail 0）照樣可以按
                onPointerDown={(e) => {
                  if (firstFinger(e.nativeEvent)) void choose(o, e)
                }}
                onClick={(e) => {
                  if (e.detail === 0) void choose(o)
                }}
              >
                {view.face(o, k)}
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
      <AnimatePresence>{at && <Hand key="demo" x={at.x} y={at.y} tap={press} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
      {notYet.view}
    </div>
  )
}
