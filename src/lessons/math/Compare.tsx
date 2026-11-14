import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CueArt, VisualView } from '../../ui/Visual'
import { Hand } from '../../games/Demo'
import { WaitShield, firstFinger, localPoint, nearest, useNotYet } from '../../games/NotYet'
import { useFlow } from '../../games/barge'
import { wait } from '../../games/lines'
import { PACE } from '../../games/pace'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { FADE } from '../../ui/motion'
import { compareQs, countIcons, type CompareQ, type Lesson } from './plan'
import { Boat } from './skins'
import { Fade, Quiz, pointIn, useLive, type PartCtx, type QuizResult } from './kit'
import { nextStep } from '../../ui/NextStep'

/**
 * 輪到他選、這麼久沒點：手點一下「多」（「少」）的那一堆、再念一次題目（T-135，盲測 becf39a 數學 2：
 * 聽不懂 More，等不到 15＋15 秒的手就走了）。之後照共用的閒置規則（再 15 秒手再點一次）
 */
const NUDGE_MS = 10_000

/**
 * 比多少（比多少 m-compare 的做法）：左右兩堆，「More! Which side?」（T-109 關鍵字放最前面）。波波頭上的對話泡泡是徽章（一大堆／只有一個），靜音也知道問的是哪一個；泡泡很小、不能點，畫面上能點的只有兩堆。
 * 第一次問「多」或「少」先由手做一次給他看（CompareDemo），教過才考。
 * 輪到他選、10 秒沒點：手點一下答案、再念一次題目（NUDGE_MS）。
 */
export function ComparePart({ ctx, pick = compareQs, skin }: { ctx: PartCtx; pick?: (l: Lesson) => CompareQ[]; skin?: 'boat' }) {
  const [qs] = useState(() => {
    const icons = countIcons(3)
    return pick(ctx.lesson).map((q, k) => ({ ...q, icon: icons[k] }))
  })
  const [i, setI] = useState(0)
  // 要先教的題目：手先做一次，做完才出題（跟換題同一次決定，題目不會先閃一下）
  const [card, setCard] = useState(() => !!qs[0].teach)
  const [missed, setMissed] = useState(0)
  /** 聽完才答的有幾題（沒聽完就點的是猜的，不算進「錯很多隔天重上」，T-109） */
  const [asked, setAsked] = useState(0)
  const q = qs[i]

  const taught = (ms: number) => {
    void logTeach({ station: 'math', game: 'm-compare', itemId: `teach-${q.ask}`, skill: `compare:${q.ask}`, level: 1, ms })
    setCard(false)
  }

  const live = useLive()
  const answered = async (r: QuizResult) => {
    const target = q.ask === 'more' ? Math.max(q.a, q.b) : Math.min(q.a, q.b)
    void logAttempt({
      station: 'math',
      game: 'm-compare',
      itemId: `${q.a}v${q.b}${q.ask === 'less' ? '<' : '>'}`,
      skill: `compare:${q.ask}`,
      // 手示範過、或第一次點的時候手正指著答案（T-111）：一起練，不計入熟練
      phase: r.shown || r.led ? 'guided' : 'quiz',
      level: 1,
      options: [String(q.a), String(q.b)],
      answer: String(target),
      taps: r.taps,
      firstTryCorrect: r.firstTry,
      attempts: r.taps.length,
      responseMs: r.ms,
      hintUsed: r.hinted,
      heard: r.heard,
      metrics: { lesson: ctx.lesson.n, gap: Math.abs(q.a - q.b), ...(r.hinted ? { retaught: 1 } : {}), ...(r.shown ? { shown: 1 } : r.led ? { led: 1 } : {}) },
    })
    const m = missed + (r.heard && !r.firstTry ? 1 : 0)
    const n = asked + (r.heard ? 1 : 0)
    setMissed(m)
    setAsked(n)
    if (i + 1 >= qs.length) return ctx.done(n, m)
    // 停在答完的這一題，等孩子點「下一步」才換題（T-118：不自己換）
    if (!(await nextStep()) || !live.current) return
    const nq = qs[i + 1]
    setI(i + 1)
    setCard(!!nq.teach)
  }

  const fit = Math.max(q.a, q.b)
  return (
    <Fade id={`${i}-${card ? 'card' : 'q'}`}>
      {card ? (
        <CompareDemo q={q} showing={ctx.demo} onDone={taught} skin={skin} />
      ) : (
        <Quiz
          host={ctx.host}
          onDone={answered}
          spec={{
            id: String(i),
            // 關鍵字放最前面（T-109）：More! Which side?
            prompt: [q.ask === 'more' ? 'm.ask.more' : 'm.ask.less'],
            correction: [q.ask === 'more' ? 'm.this.more' : 'm.this.less'],
            // 錯第一次：點到的那邊是比較少（多）的那邊：「This side has fewer!」再問一次
            wrong: () => [q.ask === 'more' ? 'm.this.less' : 'm.this.more'],
            answer: String(q.ask === 'more' ? Math.max(q.a, q.b) : Math.min(q.a, q.b)),
            wide: true,
            nudgeMs: NUDGE_MS,
            ask: (
              <div className="ma-cue">
                <CueArt cue={q.ask} icon={q.icon} />
              </div>
            ),
            options: [q.a, q.b].map((c, k) => {
              const pile = <VisualView v={{ t: 'group', icon: q.icon, count: c }} fit={fit} />
              // 小遊戲（T-147）：兩堆坐在兩艘船上
              return { id: String(c), label: k ? '右邊' : '左邊', view: skin === 'boat' ? <Boat>{pile}</Boat> : pile }
            }),
          }}
        />
      )}
    </Fade>
  )
}

/**
 * 比多少第一次問「多」（「少」）：手先做一次給他看（T-135，盲測 becf39a 數學 2、9792b5d 數學 2 都在這裡離開）。
 * 以前是教學卡（games/Teach）：念「This side has more / fewer」，手輪流指兩邊，念完整張卡是一個「再聽一次」的按鈕。
 * 聽不懂英文的孩子看不出要點哪邊：手最後指的是「少」的那一邊、點了只是再念一次同一句，沒有「點這一堆就對了」的畫面；
 * 上一段打勾後順手點一下（停一下再點）還會把卡片的語音搶掉，直接跳到等他點（T-108），教的那一句沒聽到。
 * 現在跟題目長得一樣（兩堆、波波頭上的泡泡），不靠英文也看得懂：
 * Watch me! → 手移到「多」的那一堆、念題目 → 手點下去、那一堆亮綠框、波一聲、This side has more! → Your turn! → 換真的題目。
 * 例子固定 5 對 1、多的在左邊（跟以前的教學卡一樣），之後的題目照常洗牌、照常記成自己答的。
 * 示範中點空白、點另一堆：只有「看這裡」的圈圈，不會把示範搶掉（他還沒看到手點下去）；
 * 點到「多」的那一堆（看手學會了）：那一堆亮綠框、波一聲，直接換他。
 */
function CompareDemo({ q, showing, onDone, skin }: { q: CompareQ & { icon: string }; showing: PartCtx['demo']; onDone: (ms: number) => void; skin?: 'boat' }) {
  const less = q.ask === 'less'
  const piles = [5, 1]
  const answer = less ? 1 : 0
  const [opts, setOpts] = useState(false)
  const [hand, setHand] = useState(false)
  const [press, setPress] = useState(0)
  const [lit, setLit] = useState(false)
  const [hold, setHold] = useState(true)
  const layer = useRef<HTMLDivElement | null>(null)
  const tiles = useRef<(HTMLElement | null)[]>([])
  const live = useLive()
  const flow = useFlow()
  const notYet = useNotYet()
  const t0 = useRef(0)
  const ended = useRef(false)

  const end = () => {
    if (ended.current || !live.current) return
    ended.current = true
    showing(false)
    onDone(Math.round(performance.now() - t0.current))
  }

  useEffect(() => {
    t0.current = performance.now()
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時在念
    const boot = window.setTimeout(async () => {
      const ok = flow.begin(live)
      showing(true)
      await say('teach.watch.bobo')
      if (!ok()) return
      setOpts(true)
      setHand(true)
      await say(less ? 'm.ask.less' : 'm.ask.more')
      if (!ok()) return
      await wait(400)
      if (!ok()) return
      setPress((p) => p + 1)
      setLit(true)
      sfx.pop()
      await say(less ? 'm.this.less' : 'm.this.more')
      if (!ok()) return
      await wait(500)
      if (!ok()) return
      setHand(false)
      await say('teach.turn.bobo')
      if (ok()) end()
    }, 0)
    // 剛出來的 0.5 秒：上一段連點的手指只給圈圈
    const arm = window.setTimeout(() => setHold(false), PACE.BARGE_ARM)
    return () => {
      clearTimeout(boot)
      clearTimeout(arm)
      if (!ended.current) showing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!layer.current || !firstFinger(e.nativeEvent) || ended.current) return
    const near = opts ? nearest(piles.map((_, i) => [i, tiles.current[i]] as const), e.clientX, e.clientY) : null
    if (near === answer) {
      // 看手學會了：點「多」的那一堆，停掉語音、那一堆亮綠框，直接換他
      flow.cut()
      setHand(false)
      setLit(true)
      sfx.pop()
      void wait(450).then(end)
      return
    }
    const p = localPoint(layer.current, e.clientX, e.clientY)
    notYet.ping(p.x, p.y)
  }

  const at = hand ? pointIn(tiles.current[answer], layer.current) : null
  return (
    <div className="ma-teach" ref={layer} onPointerDown={down} data-teach-demo={q.ask}>
      <div className="ma-ask" aria-hidden="true">
        <div className="ma-cue">
          <CueArt cue={q.ask} icon={q.icon} />
        </div>
      </div>
      <div className="ma-options wide is-demo" data-dim="true">
        {piles.map((c, i) => (
          <motion.button
            key={i}
            type="button"
            ref={(el: HTMLButtonElement | null) => {
              tiles.current[i] = el
            }}
            className={`tile ma-tile wide${i === answer ? ' is-shown' : ''}${lit && i === answer ? ' correct' : ''}`}
            aria-label={`示範：${i ? '右邊' : '左邊'}`}
            data-answer={i === answer ? '1' : undefined}
            initial={{ y: 24, opacity: 0 }}
            animate={opts ? { y: 0, opacity: 1 } : { y: 24, opacity: 0 }}
            transition={opts ? { ...FADE, delay: i * 0.06 } : { duration: 0 }}
            style={{ pointerEvents: opts ? undefined : 'none' }}
          >
            <div className="tile-in">
              {skin === 'boat' ? (
                <Boat>
                  <VisualView v={{ t: 'group', icon: q.icon, count: c }} fit={5} />
                </Boat>
              ) : (
                <VisualView v={{ t: 'group', icon: q.icon, count: c }} fit={5} />
              )}
            </div>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>{at && <Hand key="demo" x={at.x} y={at.y} tap={press} size="10cqmin" cuff="#F0B088" />}</AnimatePresence>
      {notYet.view}
      <WaitShield on={hold} />
    </div>
  )
}
