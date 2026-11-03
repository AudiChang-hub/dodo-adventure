import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Shell } from '../../games/Shell'
import { Swap } from '../../ui/Scenes'
import { EASE } from '../../ui/motion'
import { sfx, stopSpeech } from '../../lib/audio'
import { getKV, setKV } from '../../lib/db'
import { logTeach } from '../../lib/record'
import type { Mood } from '../../art/Dino'
import { leaveLesson } from '../LessonScreen'
import type { LessonProps } from '../types'
import { STORY_RUN, questionsOf, storyQuestionsOf, type ZhQuestion, type ZhText } from './data'
import { doneDays, lessonToday, markDone } from './progress'
import { Reader } from './Reader'
import { Quiz } from './Quiz'
import './chinese.css'

/** 作答紀錄（家長區）用的遊戲 id；技能是 zhtext:<字詞> */
export const ZH_GAME = 'zh-lesson'

/** 大人看過「親子共讀怎麼上」的說明了（只出現一次；家長重置學習進度時跟著清掉，會再出現一次） */
const INTRO_KV = 'zhLesson:introSeen'

/** 主持的恐龍被點了：交給現在這一段（App 不出聲，只有一聲輕的音效或題目卡跳一下） */
export type HostTap = { current: (() => void) | null }

type Scene = 'intro' | 'read' | number

/** 角落的陪玩小字：大人每一步要做什麼（PARENT-1） */
function hintOf(scene: Scene, run: number, talk: boolean): string {
  if (scene === 'intro') return '先看一下怎麼上，看完按「開始念」。'
  if (scene !== 'read') return '念題目給他聽：「哪個是〇〇？」再指著三張有黃框的圖說「點一下」。點錯會有提示，不用幫他點。'
  if (talk) return '照卡片問他、等他回答；他說一兩個字，你幫他說成完整的一句。問完按「去選圖」。'
  if (run === 2) return '今天第 2 次：念到框起來、標「停」的詞前停一下，等他說出來再一起念。念完一行按右下「下一行」。'
  if (run >= 3) return '今天第 3 次：念到紅字時讓他點那張大圖、跟著說一次。念完一行按右下「下一行」。'
  return '指著字一行一行念；念到紅字時指著那張放大的圖，讓他點一下。念完一行按右下「下一行」。'
}

/**
 * 中文課的一堂（親子共讀，2026-11-03：App 不出聲，大人念給孩子聽）：
 * 第一次進來先給大人一張說明 → 念課文（大人一行一行念、按「下一行」）→ 聊一聊（開放問題）→ 選圖（每個紅字一題）→ 上完叫 onDone。
 * 同一篇連上 3 次（progress.ts）：第 2 次念到框起來的紅字前停一下讓孩子接（Reader）；第 3 次再加故事題（STORY_RUN，現況對照 A8，題目還沒做）。
 * 兩段之間、每一題之間都是原地淡入淡出（ui/Scenes 的 Swap），沒有打斷課程的整頁卡片。
 */
export function ChineseLessonBody({ onDone }: LessonProps) {
  const [t, setT] = useState<ZhText | null>(null)
  /** 這一篇第幾次上 */
  const [run, setRun] = useState(1)
  const [qs, setQs] = useState<ZhQuestion[]>([])
  const [scene, setScene] = useState<Scene | null>(null)
  const [talk, setTalk] = useState(false)
  const [answered, setAnswered] = useState(0)
  const [mood, setMood] = useState<Mood>('idle')
  const host: HostTap = useRef(null)
  const taught = useRef(false)

  useEffect(() => {
    let off = false
    void Promise.all([lessonToday(), doneDays(), getKV<boolean>(INTRO_KV, false)]).then(([{ t: x, n }, done, seen]) => {
      if (off) return
      setT(x)
      setRun(n)
      setQs([...questionsOf(x, done), ...(n >= STORY_RUN ? storyQuestionsOf(x) : [])])
      setScene(seen ? 'read' : 'intro')
    })
    return () => {
      off = true
      stopSpeech()
    }
  }, [])

  const start = () => {
    sfx.tap()
    void setKV(INTRO_KV, true)
    setScene('read')
  }

  const finish = async () => {
    if (!t) return
    setMood('cheer')
    await markDone(t.day)
    window.setTimeout(onDone, 900)
  }

  /** 課文念完、要去選圖了：第一次念完時，每個要考的字詞記一筆「教學」（家長區看得到今天教了什麼） */
  const toQuiz = (ms: number) => {
    if (!t) return
    if (!taught.current) {
      taught.current = true
      for (const q of qs) void logTeach({ station: 'mandarin', game: ZH_GAME, itemId: `${t.day}:${q.word}`, skill: `zhtext:${q.word}`, level: 1, ms })
    }
    if (qs.length) setScene(0)
    else void finish()
  }

  const next = () => {
    setAnswered((n) => n + 1)
    setMood('idle')
    if (typeof scene === 'number' && scene + 1 < qs.length) setScene(scene + 1)
    else void finish()
  }

  return (
    <Shell
      station="mandarin"
      mood={mood}
      progress={qs.length && typeof scene === 'number' ? { total: qs.length, done: answered } : undefined}
      onExit={leaveLesson}
      onHost={() => host.current?.()}
      hintText={scene == null ? undefined : hintOf(scene, run, talk)}
    >
      {t && scene != null && (
        <Swap id={typeof scene === 'number' ? `q${scene}` : scene}>
          {scene === 'intro' ? (
            <Intro onStart={start} />
          ) : scene === 'read' ? (
            <Reader t={t} run={run} host={host} goLabel={qs.length ? '去選圖' : '下課'} onTalk={setTalk} onNext={toQuiz} />
          ) : (
            <Quiz key={scene} t={t} q={qs[scene]} host={host} setMood={setMood} onNext={next} />
          )}
        </Swap>
      )}
    </Shell>
  )
}

/** 第一次進中文課：給大人的一張說明（只出現一次） */
function Intro({ onStart }: { onStart: () => void }) {
  const still = useReducedMotion()
  return (
    <div className="zh-intro-wrap">
      <motion.section
        className="zh-intro"
        role="dialog"
        aria-label="親子共讀怎麼上"
        initial={still ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE.out }}
      >
        <div className="zh-talk-tag">給大人・只看這一次</div>
        <h2>中文課是親子共讀，App 不出聲，由你念給他聽</h2>
        <ol>
          <li>
            <b>一行一行念</b>：畫面一次亮一行，你指著字念，念完按右下「下一行」。念到紅字時，那張圖會放大、加一圈黃框，讓他點那張圖。
          </li>
          <li>
            <b>同一篇上 3 次</b>：第 2 次念到框起來、標「停」的詞前停一下，等他說出來。
          </li>
          <li>
            <b>念完聊一聊</b>：卡片上有一個問題，問他、等他回答，再幫他說成完整的一句。
          </li>
          <li>
            <b>最後選圖</b>：你念「哪個是〇〇？」，讓他自己點。
          </li>
        </ol>
        <p className="zh-intro-more">每一步要做什麼，右上角的小字都會寫。</p>
        <button type="button" className="zh-go" onPointerDown={onStart}>
          開始念
        </button>
      </motion.section>
    </div>
  )
}
