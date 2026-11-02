import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dino } from '../../art/Dino'
import { BackButton } from '../../ui/Back'
import { HomeIcon } from '../../games/Shell'
import { Sparkles } from '../../ui/Sparkles'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import type { LessonProps } from '../types'
import { lessonLetter } from './data'
import { goodEnough, loadProgress, markDone, markStarted, planFor, type TodayPlan } from './plan'
import { Meet } from './Meet'
import { Trace } from './Trace'
import { Words } from './Words'
import { Quiz } from './Quiz'
import { makeQuiz, type Question } from './quiz-plan'
import './english.css'

type Stage = 'meet' | 'trace' | 'words' | 'quiz' | 'end'
const STEPS: Stage[] = ['meet', 'trace', 'words', 'quiz']

/**
 * 英文字母課（豆豆）：照學校的順序，一堂約 5 分鐘。
 * 認字母 → 描字（大寫、小寫各兩次）→ 單字範例（三個字，中文三明治）→ 選擇（4 題）→ 上完（貼紙由 LessonScreen 給）。
 * 一天一個新字母（A→Z），同一天再進來複習今天的字母；選擇題錯很多就隔天重上（./plan.ts）。
 * 段落之間在原地淡入淡出，不縮放、不跳整頁卡片；上面四顆小石頭是進度。左上角返回鍵回首頁（中途離開隔天重上同一個字母）。
 */
export function EnglishLesson({ onDone }: LessonProps) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [stage, setStage] = useState<Stage>('meet')
  const qs = useRef<Question[]>([])
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    void loadProgress().then(async (p) => {
      const pl = planFor(p)
      qs.current = makeQuiz(lessonLetter(pl.idx), pl.idx)
      await markStarted(pl)
      if (live.current) setPlan(pl)
    })
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [])

  const finish = async (right: number, total: number) => {
    if (!plan) return
    await markDone(plan, goodEnough(right, total))
    if (!live.current) return
    setStage('end')
    sfx.done()
    await say('le.en.done')
    await wait(500)
    if (live.current) onDone()
  }

  const letter = plan ? lessonLetter(plan.idx) : null
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
              {stage === 'meet' && <Meet letter={letter} review={plan!.review} onDone={() => setStage('trace')} />}
              {stage === 'trace' && <Trace letter={letter} onDone={() => setStage('words')} />}
              {stage === 'words' && <Words letter={letter} onDone={() => setStage('quiz')} />}
              {stage === 'quiz' && <Quiz qs={qs.current} onDone={(r, t) => void finish(r, t)} />}
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
