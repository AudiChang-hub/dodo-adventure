import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../../games/Shell'
import { WaitShield } from '../../games/NotYet'
import { wait } from '../../games/lines'
import { Sparkles } from '../../ui/Sparkles'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { DUR, EASE } from '../../ui/motion'
import type { Mood } from '../../art/Dino'
import { leaveLesson } from '../LessonScreen'
import type { LessonProps } from '../types'
import { openLesson, partDone, PARTS, type Lesson } from './plan'
import { Fade, useLive, type PartCtx } from './kit'
import { CountPart } from './Count'
import { GivePart } from './Give'
import { ComparePart } from './Compare'
import { WritePart } from './Write'
import { ReviewPart } from './Review'
import './math.css'

const PART_VIEW = { count: CountPart, give: GivePart, compare: ComparePart, write: WritePart, review: ReviewPart }

/** 給大人看的一行陪玩提示（角落小字，孩子看不懂也不需要懂） */
const HINT: Record<(typeof PARTS)[number] | 'open', (n: number) => string> = {
  open: (n) => `今天的數字是 ${n}`,
  count: (n) => `今天的數字是 ${n}：陪孩子一起數出聲音`,
  give: () => '讓孩子自己拿，拿好點勾勾；之後在家也玩「拿 3 個給我」',
  compare: () => '問問看：哪邊比較多？讓孩子自己指',
  write: () => '用觸控筆從綠點開始描，描歪了沒關係',
  review: () => '讓孩子自己找，答錯會有提示',
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
 * 數學課（波波帶，約 5 分鐘）：開場「Today's number is three!」→ 數數 → 拿給波波 → 比多少 → 寫數字 → 小複習 → 下課（onDone，給貼紙）。
 * 進度（一天一個新數字、同一天再進來複習、錯很多隔天重上）在 ./plan.ts。
 * 每一段原地淡入淡出（不縮放、沒有整頁的段落卡片）；右上角一直掛著「今天的數字」。中途離開，同一天再進來從下一段接著上。
 */
export function MathLesson({ onDone }: LessonProps) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
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

  useEffect(() => {
    void openLesson().then((l) => live.current && setLesson(l))
    return () => stopSpeech()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (p: number) => {
    partRef.current = p
    setPart(p)
  }

  // 開場：波波說今天的數字（複習、混合複習先說一句），數字和點點在中間；說完就開始數數（中途離開過的從那一段接著上）
  useEffect(() => {
    if (!lesson) return
    const t = window.setTimeout(async () => {
      setMood('happy')
      if (lesson.mode !== 'new') await say(lesson.mode === 'review' ? 'ma.again' : 'ma.mix')
      if (!live.current) return
      sfx.pop()
      await say(`ma.today.${lesson.n}`)
      // 開場中點波波會從頭再說一次：等這一次說完才往下，不要被「Let's count!」切掉
      const replayed = async () => {
        while (live.current && replay.current) {
          const r = replay.current
          replay.current = null
          await r
        }
      }
      await replayed()
      if (!live.current) return
      await wait(700)
      host.current = null
      await replayed()
      if (!live.current) return
      setMood('idle')
      go(lesson.part)
    }, 0)
    host.current = () => {
      replay.current = say(`ma.today.${lesson.n}`)
    }
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson])

  const finish = async () => {
    go(PARTS.length)
    setMood('cheer')
    sfx.done()
    host.current = null
    await say('ma.bye')
    if (!live.current) return
    await wait(600)
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
    done: (asked, missed) => {
      const p = partRef.current
      if (p < 0 || p >= PARTS.length) return
      void partDone(p, asked, missed)
      if (p + 1 >= PARTS.length) void finish()
      else go(p + 1)
    },
    mood: setMood,
    demo: setDemo,
    host,
    ping: () => setPing((k) => k + 1),
  }

  const name = part >= 0 && part < PARTS.length ? PARTS[part] : null
  const View = name ? PART_VIEW[name] : null
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
      hintText={HINT[name ?? 'open'](lesson.n)}
    >
      <div className={`ma-lesson ma-${name ?? (over ? 'over' : 'open')}`} data-lesson-part={name ?? (over ? 'over' : 'open')}>
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
          {View ? (
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
              <WaitShield on />
            </div>
          )}
        </Fade>
      </div>
    </Shell>
  )
}
