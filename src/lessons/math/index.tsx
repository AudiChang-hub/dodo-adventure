import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { NEXT_HINT, cancelNextStep, nextStep, useNextPending } from '../../ui/NextStep'
import { Shell } from '../../games/Shell'
import { WaitShield } from '../../games/NotYet'
import { wait } from '../../games/lines'
import { useFlow } from '../../games/barge'
import { PACE } from '../../games/pace'
import { Sparkles } from '../../ui/Sparkles'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { DUR, EASE } from '../../ui/motion'
import type { Mood } from '../../art/Dino'
import { leaveLesson } from '../LessonScreen'
import type { LessonProps } from '../types'
import { openLesson, partDone, PARTS, type Lesson } from './plan'
import { Fade, useLive, type PartCtx } from './kit'
import { loadFormats } from '../formats'
import { CountPart } from './Count'
import { GivePart } from './Give'
import { WritePart } from './Write'
import { GamePart } from './Game'
import { WarmPart } from './Warm'
import { homeTip, pickWarmPlay, warmFor, type WarmPlay } from './warmup'
import { TrainPart } from './Train'
import { PlantPart } from './Plant'
import { loadPlays, pickGivePlay, type GivePlay } from './plays'
import { getTodayWorld } from '../../lib/today-world'
import { Scene } from '../../art/storybook/scenes'
import './math.css'

const PART_VIEW = { count: CountPart, give: GivePart, game: GamePart, write: WritePart }
/** 開場「玩著數數」今天的玩法（T-147，warmup.ts）的陪玩小字 */
const WARM_HINT: Record<WarmPlay, (n: number) => string> = {
  hop: (n) => `請他點青蛙，一下跳一片荷葉，一起數到 ${n}`,
  fingers: () => '跟他一起舉手指（從食指開始比）',
  find: () => '請他一個一個點出波波要找的，點過的不用再點',
}
/** 「拿給波波」那一段今天的玩法（T-127，plays.ts） */
const GIVE_VIEW: Record<GivePlay, typeof GivePart> = { give: GivePart, train: TrainPart, plant: PlantPart }
const GIVE_HINT: Record<GivePlay, (n: number) => string> = {
  give: () => '請他把東西拖到波波那裡，拿夠了按綠色勾勾',
  train: (n) => `請他點東西坐上火車，${n} 節車廂坐滿了按綠色勾勾`,
  plant: (n) => `請他點洞種花，${n} 個洞都種好了按綠色勾勾`,
}

/** 今天的世界的背景（T-127）：淡淡的一層，鋪滿整個舞台；世界關掉（null）就不畫，照舊是原本的底色 */
function WorldBackdrop() {
  const [world] = useState(() => getTodayWorld())
  if (!world) return null
  return (
    <div className="ma-world" data-world={world.id} aria-hidden="true">
      <svg viewBox="0 0 960 600" preserveAspectRatio="xMidYMax slice">
        <Scene id={world.scene} />
      </svg>
    </div>
  )
}

/** 給大人看的一行陪玩提示（角落小字，孩子看不懂也不需要懂） */
const HINT: Record<(typeof PARTS)[number] | 'open', (n: number) => string> = {
  open: (n) => `今天的數字是 ${n}`,
  warm: (n) => `一起數到 ${n}`,
  count: (n) => (n === 1 ? '請他點一下畫面上那個東西，一起說「one」' : `請他一個一個點，邊點邊一起數到 ${n}`),
  give: () => '請他把東西拖到波波那裡，拿夠了按綠色勾勾',
  game: () => '請他點東西比較多的那艘船；氣球是點波波說的那個數字',
  write: () => '請他從綠點開始，沿著發亮的路描到星星',
}

/** 數量點點：今天的數字旁邊一顆一顆的點（數字和數量放在一起看） */
function Dots({ n }: { n: number }) {
  return (
    <span className={`ma-dots${n > 5 ? ' two' : ''}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  )
}

/**
 * 數學課（波波帶，約 4.5～5 分鐘）：開場「Today's number is three!」→ 玩著數數（動作、手指、找找看每天輪一種，warmup.ts）→ 數數 → 拿給波波 → 小遊戲（船、氣球各 1 題）→ 寫數字（描兩次）
 * → 下課（onDone，LessonScreen 放下課畫面、不定時給貼紙；下課畫面右上角給大人一句在家可以做的事，C1）。
 * T-147 遊戲為主：家長 2026-11-14 不做童謠，開場改成三種玩著數數（主 repo docs/T-149-熱門幼兒App參考.md 第 3 節 M1～M3、C1）。
 * 進度（一天一個新數字、同一天再進來複習、錯很多隔天重上）在 ./plan.ts。
 * 每一段原地淡入淡出（不縮放、沒有整頁的段落卡片）；右上角一直掛著「今天的數字」。中途離開，同一天再進來從下一段接著上。
 */
export function MathLesson({ onDone }: LessonProps) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [play, setPlay] = useState<GivePlay>('give')
  const [warm, setWarm] = useState<WarmPlay>('hop')
  /** -1 是開場；PARTS.length 是下課 */
  const [part, setPart] = useState(-1)
  const [mood, setMood] = useState<Mood>('idle')
  const [demo, setDemo] = useState(false)
  const [ping, setPing] = useState(0)
  const host = useRef<(() => void) | null>(null)
  const partRef = useRef(-1)
  /** 開場中點波波：重說的那一次（開場要等它說完） */
  const replay = useRef<Promise<void> | null>(null)
  const live = useLive()
  const flow = useFlow()
  const pending = useNextPending()
  /** 開場時點大數字：停掉語音，直接開始第一段（T-108） */
  const skipOpen = useRef<(() => void) | null>(null)

  useEffect(() => {
    void Promise.all([openLesson(), loadFormats(), loadPlays(), pickGivePlay(), pickWarmPlay()]).then(([l, , , p, w]) => {
      if (!live.current) return
      setPlay(p)
      setWarm(warmFor(w, l.n))
      setLesson(l)
    })
    return () => stopSpeech()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (p: number) => {
    partRef.current = p
    setPart(p)
  }

  // 開場：波波說今天的數字，數字和點點在中間；說完就開始數數（中途離開過的從那一段接著上）。
  // 只說一句（T-108：以前複習、混合複習還先說 Let's practice again! 等等，輪到孩子之前話太多）；
  // 開場時點大數字：停掉語音、直接開始（三歲等不及）
  useEffect(() => {
    if (!lesson) return
    const ok = flow.begin(live)
    const at = performance.now()
    let went = false
    const proceed = () => {
      if (went || !live.current) return
      went = true
      host.current = null
      setMood('idle')
      go(lesson.part)
    }
    let atGate = false
    skipOpen.current = () => {
      // 剛進課的 0.5 秒：從首頁一直連點進來的手指先不算
      if (performance.now() - at < PACE.BARGE_ARM) return
      // 開場說完、停著等「下一步」：點別的地方不算開始（T-118：只有點大箭頭才往下，大箭頭會跳一下提醒）
      if (atGate) return
      flow.cut()
      replay.current = null
      cancelNextStep()
      proceed()
    }
    const t = window.setTimeout(async () => {
      setMood('happy')
      sfx.pop()
      // 先叫自己的名字 Hi! I'm Bobo!（T-137）；同一串念，開場時點大數字照舊整串停掉（T-108）。點波波重說的只有今天的數字
      await say('hi.bobo', `ma.today.${lesson.n}`)
      // 開場中點波波會從頭再說一次：等這一次說完才往下，不要被「Let's count!」切掉
      const replayed = async () => {
        while (live.current && replay.current) {
          const r = replay.current
          replay.current = null
          await r
        }
      }
      await replayed()
      if (!ok()) return
      await wait(400)
      if (!ok()) return
      host.current = null
      await replayed()
      if (!ok()) return
      // 開場說完：停在今天的數字上，等孩子點「下一步」才開始數（T-118：不自己換；開場念的時候點畫面照舊直接開始）
      atGate = true
      if (!(await nextStep()) || !ok()) return
      proceed()
    }, 0)
    host.current = () => {
      replay.current = say(`ma.today.${lesson.n}`)
    }
    return () => {
      clearTimeout(t)
      skipOpen.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson])

  const finish = async () => {
    skipOpen.current = null
    go(PARTS.length)
    setMood('cheer')
    sfx.done()
    host.current = null
    // Great job today! 念著的時候就出下課畫面（T-113：以前念完再等 0.6 秒，最後一題打勾到下課 3.3 秒）
    void say('ma.bye')
    await wait(1100)
    if (live.current) onDone()
  }

  if (!lesson)
    return (
      <Shell station="math" mood="idle" onExit={leaveLesson} hint={false}>
        <div />
      </Shell>
    )

  const ctx: PartCtx = {
    lesson,
    done: (asked, missed, opts) => {
      const p = partRef.current
      if (p < 0 || p >= PARTS.length) return
      void partDone(p, asked, missed)
      if (p + 1 >= PARTS.length) void finish()
      // 這一段做完：停在做完的樣子，等孩子點「下一步」才換下一段（T-118，家長：每一段都要自己點下一步）。進度已經記下了
      else
        void nextStep({ cue: opts?.cue }).then((ok) => {
          if (ok && live.current && partRef.current === p) go(p + 1)
        })
    },
    mood: setMood,
    demo: setDemo,
    host,
    ping: () => setPing((k) => k + 1),
  }

  const name = part >= 0 && part < PARTS.length ? PARTS[part] : null
  const View = name === 'give' ? GIVE_VIEW[play] : name && name !== 'warm' ? PART_VIEW[name] : null
  const opening = part < 0
  const over = part >= PARTS.length
  return (
    <Shell
      station="math"
      mood={mood}
      progress={{ total: PARTS.length, done: Math.max(0, Math.min(part, PARTS.length)) }}
      onExit={leaveLesson}
      onHost={() => host.current?.()}
      demo={demo}
      hintText={pending ? NEXT_HINT : name === 'give' ? GIVE_HINT[play](lesson.n) : name === 'warm' ? WARM_HINT[warm](lesson.n) : HINT[name ?? 'open'](lesson.n)}
    >
      <div className={`ma-lesson ma-${name ?? (over ? 'over' : 'open')}`} data-lesson-part={name ?? (over ? 'over' : 'open')} data-give-play={play} data-warm-play={warm}>
        <WorldBackdrop />
        {/* 右上角：今天的數字（開場在正中間，開始上課就掛到這裡；數到最後一個、寫好一次就跳一下） */}
        <AnimatePresence>
          {!opening && !over && (
            <motion.div className="ma-today" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: DUR.fadeIn, ease: EASE.out } }} exit={{ opacity: 0 }}>
              <motion.span key={ping} className="ma-today-num" animate={ping ? { y: [0, -10, 0] } : {}} transition={{ duration: 0.45, ease: EASE.out }}>
                {lesson.n}
              </motion.span>
              <Dots n={lesson.n} />
            </motion.div>
          )}
        </AnimatePresence>
        <Fade id={name ?? (over ? 'over' : 'open')}>
          {name === 'warm' ? (
            <WarmPart ctx={ctx} play={warm} />
          ) : View ? (
            <View ctx={ctx} />
          ) : (
            <div className="ma-hero">
              <span className="ma-hero-num">{lesson.n}</span>
              <Dots n={lesson.n} />
              {over && (
                <div className="ma-hero-burst">
                  <Sparkles count={18} />
                </div>
              )}
              <WaitShield on onTap={opening ? () => skipOpen.current?.() : undefined} />
            </div>
          )}
        </Fade>
      </div>
      {over && createPortal(<HomeTip n={lesson.n} />, document.body)}
    </Shell>
  )
}

/**
 * 下課畫面給大人的一句「今天在家可以做的事」（C1，主 repo docs/T-149-熱門幼兒App參考.md）：右上角、跟陪玩小字同一種樣子，
 * 疊在下課畫面（LessonScreen 的遮罩）上面、挑貼紙的畫面下面（挑貼紙有自己的陪玩小字）。不念、不能點。
 * 放在數學課自己這裡，不改三堂課共用的 LessonBye.tsx。
 */
function HomeTip({ n }: { n: number }) {
  const [tip] = useState(() => homeTip(n))
  return (
    <p className="coplay-hint ma-home-tip" aria-hidden="true" data-home-tip="">
      <span className="coplay-tag">在家</span>
      {tip}
    </p>
  )
}
