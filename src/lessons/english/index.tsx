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
import { Meet } from './Meet'
import { Trace } from './Trace'
import { Words } from './Words'
import { Quiz } from './Quiz'
import { makeQuiz, type Question } from './quiz-plan'
import '../../games/coplay.css'
import './english.css'

type Stage = 'meet' | 'trace' | 'words' | 'quiz' | 'end'
const STEPS: Stage[] = ['meet', 'trace', 'words', 'quiz']

/** 給大人看的一行陪玩小字（A10，角落、不收點擊；跟數學課的 HINT、中文課的 parentTip 一樣） */
function hintOf(stage: Stage, x: LessonLetter) {
  const zh = lexWord(wordKey(x.words[0].w))?.zh?.replace(/\s+/g, '')
  switch (stage) {
    case 'meet':
      return `跟他一起用手指在空中寫 ${x.L}`
    case 'trace':
      return '描歪沒關係，讚美他從綠點開始'
    case 'words':
      // 不問「家裡有沒有」：第一個字可能是 snake、volcano 這種家裡沒有的（AI 小男生測試 2026-11-02）
      return zh ? `跟他一起說：${zh}、${x.words[0].w}` : `跟他一起找：還有什麼是 ${x.L} 開頭的？`
    case 'quiz':
      return '讓他自己找，錯了會有提示'
    default:
      return `今天的字母是 ${x.L}、${x.l}`
  }
}

/**
 * 英文字母課（豆豆）：照學校的順序，一堂約 5 分鐘。
 * 認字母 → 描字（大寫、小寫各一次）→ 單字範例（三個字，中文三明治）→ 選擇（4 題）→ 上完（下課畫面、不定時的貼紙由 LessonScreen 處理）。
 * 一天一個新字母（名字的字母先、再 A→Z），同一天再進來複習今天的字母；字母題錯很多就隔天重上（./plan.ts）。
 * 右上角一行給大人的陪玩小字（hintOf）。
 * 段落之間在原地淡入淡出，不縮放、不跳整頁卡片；上面四顆小石頭是進度。左上角返回鍵回首頁（中途離開隔天重上同一個字母）。
 * 同一天中途離開又回來：從離開的那一段接著上，做過的段落石頭已經亮著，描字大寫描過了就只描小寫（T-95；./plan.ts 的 markStage）。
 */
export function EnglishLesson({ onDone }: LessonProps) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [stage, setStage] = useState<Stage>('meet')
  /** 描字從第幾輪開始（同一天回來接著上） */
  const [traceFrom, setTraceFrom] = useState(0)
  const qs = useRef<Question[]>([])
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    void loadProgress().then(async (p) => {
      const pl = planFor(p)
      qs.current = makeQuiz(lessonLetter(pl.idx, pl.seq), pl.idx, pl.seq)
      await markStarted(pl)
      if (!live.current) return
      if (pl.resume) {
        setStage(pl.resume.stage)
        setTraceFrom(pl.resume.round)
      }
      setPlan(pl)
    })
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [])

  /** 往下一段，並記下來（中途離開，同一天回來從這裡接著上） */
  const next = (s: Exclude<Stage, 'end'>) => {
    setStage(s)
    if (plan) void markStage(plan, s)
  }

  const finish = async (rs: QuizResult[]) => {
    if (!plan) return
    await markDone(plan, lessonGood(rs))
    if (!live.current) return
    setStage('end')
    sfx.done()
    await say('le.en.done')
    await wait(500)
    if (live.current) onDone()
  }

  const letter = plan ? lessonLetter(plan.idx, plan.seq) : null
  const at = STEPS.indexOf(stage)

  return (
    <div className="screen en-lesson" data-phase={stage}>
      <div className="en-back">
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>
      {/* 進度：四顆小石頭（認字母、描字、單字、選擇），走過的變成今天的字母 */}
      <div className="en-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={i < at || stage === 'end' ? 'is-done' : i === at ? 'is-now' : ''}>
            {(i < at || stage === 'end') && letter ? letter.l : ''}
          </span>
        ))}
      </div>
      {letter && (
        <p className="coplay-hint en-coplay" aria-hidden="true">
          <span className="coplay-tag">陪玩</span>
          {hintOf(stage, letter)}
        </p>
      )}
      <div className="en-host" aria-hidden="true">
        <Dino who="dodo" mood={stage === 'end' ? 'cheer' : 'happy'} size="100%" />
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
              {stage === 'meet' && <Meet letter={letter} review={plan!.review} onDone={() => next('trace')} />}
              {stage === 'trace' && <Trace letter={letter} from={traceFrom} onRound={(i) => i > 0 && void markStage(plan!, 'trace', i)} onDone={() => next('words')} />}
              {stage === 'words' && <Words letter={letter} onDone={() => next('quiz')} />}
              {stage === 'quiz' && <Quiz qs={qs.current} onDone={(rs) => void finish(rs)} />}
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
