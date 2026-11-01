import { useEffect, useRef, useState } from 'react'
import { Shell } from '../../games/Shell'
import { Swap } from '../../ui/Scenes'
import { stopSpeech } from '../../lib/audio'
import { logTeach } from '../../lib/record'
import type { Mood } from '../../art/Dino'
import { leaveLesson } from '../LessonScreen'
import type { LessonProps } from '../types'
import { questionsOf, zhReady, type ZhQuestion, type ZhText } from './data'
import { markDone, todays } from './progress'
import { Reader } from './Reader'
import { Quiz } from './Quiz'
import './chinese.css'

/** 作答紀錄（家長區）用的遊戲 id；技能是 zhtext:<字詞> */
export const ZH_GAME = 'zh-lesson'

/** 主持的恐龍被點了：交給現在這一段（念課文：再念一次；選圖：再問一次） */
export type HostTap = { current: (() => void) | null }

/**
 * 中文課的一堂：念課文 → 選圖（每個紅字一題）→ 上完叫 onDone（LessonScreen 給貼紙、回首頁）。
 * 兩段之間、每一題之間都是原地淡入淡出（ui/Scenes 的 Swap），沒有打斷課程的整頁卡片。
 */
export function ChineseLessonBody({ onDone }: LessonProps) {
  const [t, setT] = useState<ZhText | null>(null)
  const [ready, setReady] = useState<Set<string> | null>(null)
  const [qs, setQs] = useState<ZhQuestion[]>([])
  const [scene, setScene] = useState<'read' | number>('read')
  const [answered, setAnswered] = useState(0)
  const [mood, setMood] = useState<Mood>('idle')
  const host: HostTap = useRef(null)
  const taught = useRef(false)

  useEffect(() => {
    let off = false
    void Promise.all([todays(), zhReady()]).then(([x, r]) => {
      if (off) return
      setT(x)
      setReady(r)
      setQs(questionsOf(x))
    })
    return () => {
      off = true
      stopSpeech()
    }
  }, [])

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
      progress={qs.length ? { total: qs.length, done: answered } : undefined}
      onExit={leaveLesson}
      onHost={() => host.current?.()}
      hintText={t?.parentTip}
    >
      {t && ready && (
        <Swap id={scene === 'read' ? 'read' : `q${scene}`}>
          {scene === 'read' ? (
            <Reader t={t} ready={ready} host={host} onNext={toQuiz} />
          ) : (
            <Quiz key={scene} t={t} q={qs[scene]} ready={ready} host={host} setMood={setMood} onNext={next} />
          )}
        </Swap>
      )}
    </Shell>
  )
}
