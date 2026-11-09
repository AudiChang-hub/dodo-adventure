import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dino } from '../../art/Dino'
import { BackButton } from '../../ui/Back'
import { HomeIcon } from '../../games/Shell'
import { Sparkles } from '../../ui/Sparkles'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import type { LessonProps } from '../types'
import { lexWord, wordKey } from '../../content/lexicon'
import { lessonLetter, type LessonLetter } from './data'
import { lessonGood, loadProgress, markDone, markStage, markStarted, planFor, type QuizResult, type TodayPlan } from './plan'
import { NEXT_HINT, nextStep, useNextPending } from '../../ui/NextStep'
import { Meet } from './Meet'
import { LESSON_RETRIES, Trace, WRITE_ROUNDS, type RetryBudget } from './Trace'
import { Words } from './Words'
import { Quiz } from './Quiz'
import { makeQuiz, type Question } from './quiz-plan'
import { loadFormats } from '../formats'
import '../../games/coplay.css'
import './english.css'

type Stage = 'meet' | 'trace' | 'words' | 'write' | 'quiz' | 'end'
/** 一堂的段落（T-112：單字之後加「寫寫看」，選擇題減成 2～3 題，手寫的時間變多、一堂不變長） */
const STEPS: Stage[] = ['meet', 'trace', 'words', 'write', 'quiz']

/** 給大人看的一行陪玩小字（A10，角落、不收點擊；跟數學課的 HINT、中文課的 parentTip 一樣） */
function hintOf(stage: Stage, x: LessonLetter, q?: Question) {
  const zh = lexWord(wordKey(x.words[0].w))?.zh?.replace(/\s+/g, '')
  switch (stage) {
    case 'meet':
      return `跟他一起用手指在空中寫 ${x.L}`
    case 'trace':
      return '請他從綠點開始，沿著發亮的路描到星星；描歪沒關係'
    case 'words':
      // 不問「家裡有沒有」：第一個字可能是 snake、volcano 這種家裡沒有的（AI 小男生測試 2026-11-02）
      return zh ? `跟他一起說：${zh}、${x.words[0].w}` : `跟他一起找：還有什麼是 ${x.L} 開頭的？`
    case 'write':
      return `換他自己寫：從綠點開始描一次大的 ${x.L}；描歪沒關係，不用重來`
    case 'quiz':
      // 每一題直接寫「現在請他點哪一個」（T-107 真人試玩：大人聽完英文也不知道這一段要做什麼）
      if (q?.kind === 'big') return `找字母：請他點大的 ${q.L}（大卡片）`
      if (q?.kind === 'little') return `找字母：請他點小的 ${q.L.toLowerCase()}（小卡片）`
      if (q?.kind === 'word') return `找圖：請他點 ${q.L} 開頭的那張圖`
      return '找字母：請他點豆豆頭上泡泡裡亮的那一個'
    default:
      return `今天的字母是 ${x.L}、${x.l}`
  }
}

/**
 * 英文字母課（豆豆）：照學校的順序，一堂約 5 分鐘。
 * 認字母 → 描字（大寫、小寫各一次）→ 單字範例（三個字，中文三明治）→ 寫寫看（自己再描一次大寫，T-112）→ 選擇（第一天 2 題、之後 3 題）
 * → 上完（下課畫面、不定時的貼紙由 LessonScreen 處理）。
 * 一天一個新字母（名字的字母先、再 A→Z），同一天再進來複習今天的字母；字母題錯很多就隔天重上（./plan.ts）。
 * 右上角一行給大人的陪玩小字（hintOf）。
 * 段落之間在原地淡入淡出，不縮放、不跳整頁卡片；上面五顆小石頭是進度。左上角返回鍵回首頁（中途離開隔天重上同一個字母）。
 * 每一段、每一輪描字、每一題做完都停在做完的樣子，右下角出「下一步」的大箭頭，孩子點了才往下（T-118，ui/NextStep）；
 * 最後一題答對直接慶祝、到下課的晚安道別（LessonScreen）。
 * 同一天中途離開又回來：從離開的那一段接著上，做過的段落石頭已經亮著，描字大寫描過了就只描小寫（T-95；./plan.ts 的 markStage）。
 * 題目都做完、還沒跟恐龍說完晚安就離開：同一天回來直接回到晚安道別（T-122）。
 */
/** 這一題算不算「聽完才答、一次就對」（舊的進度沒有 heard，當作聽完了） */
const earnedBy = (r: QuizResult | undefined) => !!r && r.first && r.heard !== false

export function EnglishLesson({ onDone }: LessonProps) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [stage, setStage] = useState<Stage>('meet')
  /** 描字從第幾輪開始（同一天回來接著上） */
  const [traceFrom, setTraceFrom] = useState(0)
  /** 選擇題：同一天回來從第幾題接著問、前面答完的（T-104） */
  const [quizAt, setQuizAt] = useState<{ from: number; answers: QuizResult[]; replay: boolean }>({ from: 0, answers: [], replay: false })
  /** 選擇題答完幾題（最後一顆石頭裡的小點） */
  const [quizDone, setQuizDone] = useState(0)
  /** 哪幾題是聽完才答、一次就對（這幾顆小點才亮，T-109） */
  const [earned, setEarned] = useState<boolean[]>([])
  /** 答對一題：豆豆歡呼一下 */
  const [cheer, setCheer] = useState(0)
  const qs = useRef<Question[]>([])
  const live = useRef(true)
  /** 描字、寫寫看共用：整堂課最多重描一次（T-122） */
  const retry = useRef<RetryBudget>({ left: LESSON_RETRIES })

  useEffect(() => {
    live.current = true
    void Promise.all([loadProgress(), loadFormats()]).then(async ([p]) => {
      const pl = planFor(p)
      // 中途離開、回來接著做選擇題：先只問大寫（退一級，T-100）
      qs.current = makeQuiz(lessonLetter(pl.idx, pl.seq), pl.idx, pl.seq, pl.resume?.stage === 'quiz')
      await markStarted(pl)
      if (!live.current) return
      if (pl.resume?.stage === 'end') {
        // 上完了、還沒說完晚安就離開（T-122）：停在今天的字母上一下，直接回到晚安道別（不重說 You did it!、不重上）
        setStage('end')
        setPlan(pl)
        sfx.pop()
        await wait(900)
        if (live.current) onDone()
        return
      }
      if (pl.resume) {
        setStage(pl.resume.stage)
        setTraceFrom(pl.resume.round)
        if (pl.resume.stage === 'quiz') {
          const from = Math.min(pl.resume.round, qs.current.length - 1)
          setQuizAt({ from, answers: (pl.resume.answers ?? []).slice(0, from), replay: true })
          setQuizDone(from)
          setEarned((pl.resume.answers ?? []).slice(0, from).map(earnedBy))
        }
      }
      setPlan(pl)
    })
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [])

  /** 這一段做完了、正在等「下一步」（同一段不會等兩次） */
  const waiting = useRef<Stage | null>(null)
  /**
   * 這一段做完：先記下來（中途離開，同一天回來從下一段接著上），畫面停在做完的樣子，
   * 等孩子點「下一步」的大箭頭才換到下一段（T-118，家長：每一段都要自己點下一步，不自己換頁）
   */
  const next = async (s: Exclude<Stage, 'end'>) => {
    if (waiting.current === s) return
    waiting.current = s
    if (plan) void markStage(plan, s)
    const ok = await nextStep()
    waiting.current = null
    if (ok && live.current) setStage(s)
  }
  const pending = useNextPending()

  /** 上完：馬上換成慶祝（大字母、星星、完成的音效），You did it! 念著的時候就出下課畫面（T-113：以前念完再等 0.5 秒，打勾到下課 4.5 秒） */
  const finish = async (rs: QuizResult[]) => {
    if (!plan) return
    setStage('end')
    sfx.done()
    void say('le.en.done')
    await Promise.all([markDone(plan, lessonGood(rs)), wait(1100)])
    if (live.current) onDone()
  }

  /** 選擇題又答完一題：聽完才答、一次就對的小點亮一顆、豆豆歡呼一下（其他的只留一圈淡框），記下來（中途離開，回來從下一題接著問） */
  const progress = (n: number, rs: QuizResult[]) => {
    setQuizDone(n)
    setEarned(rs.map(earnedBy))
    // 豆豆歡呼只給聽完才答、一次就對的（T-109）
    if (earnedBy(rs[rs.length - 1])) setCheer((c) => c + 1)
    if (plan && n < qs.current.length) void markStage(plan, 'quiz', n, rs)
  }

  useEffect(() => {
    if (!cheer) return
    const t = setTimeout(() => live.current && setCheer(0), 1400)
    return () => clearTimeout(t)
  }, [cheer])

  const letter = plan ? lessonLetter(plan.idx, plan.seq) : null
  const at = STEPS.indexOf(stage)

  return (
    <div className="screen en-lesson" data-phase={stage}>
      <div className="en-back">
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>
      {/* 進度：五顆小石頭（認字母、描字、單字、寫寫看、選擇），走過的變成今天的字母；選擇題那一顆拉長，一題一顆小點（T-104） */}
      <div className="en-steps" aria-hidden="true">
        {STEPS.map((s, i) =>
          s === 'quiz' && stage === 'quiz' ? (
            <span key={s} className="is-now is-quiz" data-done={quizDone} data-total={qs.current.length}>
              {qs.current.map((_, j) => (
                <i key={j} className={j < quizDone ? (earned[j] ? 'on' : 'past') : undefined} />
              ))}
            </span>
          ) : (
            <span key={s} className={i < at || stage === 'end' ? 'is-done' : i === at ? 'is-now' : ''}>
              {(i < at || stage === 'end') && letter ? letter.l : ''}
            </span>
          ),
        )}
      </div>
      {letter && (
        <p className="coplay-hint en-coplay" aria-hidden="true">
          <span className="coplay-tag">陪玩</span>
          {pending ? NEXT_HINT : hintOf(stage, letter, qs.current[Math.min(quizDone, qs.current.length - 1)])}
        </p>
      )}
      <div className="en-host" aria-hidden="true">
        <Dino who="dodo" mood={stage === 'end' || cheer ? 'cheer' : 'happy'} size="100%" />
      </div>
      <div className="en-stage">
        {/* 一段淡出、下一段再淡入（紙感螢幕上兩段疊在一起看起來很亂，不交叉淡化） */}
        <AnimatePresence initial={false} mode="wait">
          {letter && (
            <motion.div
              key={stage}
              className="en-pane"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
            >
              {stage === 'meet' && <Meet letter={letter} review={plan!.review} onDone={() => void next('trace')} />}
              {stage === 'trace' && <Trace letter={letter} from={traceFrom} retry={retry.current} onRound={(i) => i > 0 && void markStage(plan!, 'trace', i)} onDone={() => void next('words')} />}
              {stage === 'words' && <Words letter={letter} onDone={() => void next('write')} />}
              {stage === 'write' && <Trace letter={letter} rounds={WRITE_ROUNDS} retry={retry.current} onDone={() => void next('quiz')} />}
              {stage === 'quiz' && (
                <Quiz qs={qs.current} from={quizAt.from} answers={quizAt.answers} replay={quizAt.replay} onProgress={progress} onDone={(rs) => void finish(rs)} />
              )}
              {stage === 'end' && (
                <div className="en-end">
                  <span className="en-letter is-big is-lit">{letter.L}</span>
                  <span className="en-letter is-little is-lit">{letter.l}</span>
                  <div className="en-end-spark">
                    <Sparkles count={18} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
