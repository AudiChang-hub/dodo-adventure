import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { StickerPicker } from '../ui/StickerPicker'
import { overlay } from '../ui/motion'
import { go, useBack } from '../lib/nav'
import { grantPick } from '../lib/achievements'
import { LESSONS } from '.'
import type { Subject } from './types'
import { extensionFor } from './extension'
import { finishRun, startRun } from '../lib/lesson-log'
import '../ui/celebrate.css'
import '../games/coplay.css'
import './lessons.css'

/**
 * App 的 lesson 路由：把一堂課放上來。課叫 onDone（上完了）→ 給一張貼紙、讓孩子挑 → 回首頁。
 * 挑貼紙時右上角給大人一句「現在去做」（lessons/extension.ts：跟今天內容有關、離開螢幕去做的事）。
 * 每一堂記開始、上完（lib/lesson-log.ts），家長區的下一步準備度算中途離開用。
 * 挑貼紙時按返回（Android 的返回手勢）也回首頁，貼紙留著下次再挑（StickerPicker 的「等一下再選」一樣）。
 * 課自己的返回鍵照路由回上一層（首頁），不用另外處理。
 */
export function LessonScreen({ subject }: { subject: Subject }) {
  const { Lesson } = LESSONS[subject]
  const [pick, setPick] = useState(false)
  const [next, setNext] = useState<string | null>(null)
  const done = useRef(false)
  const run = useRef<Promise<number> | null>(null)
  const home = () => go({ name: 'home' })

  useEffect(() => {
    run.current = startRun(subject).catch(() => 0)
  }, [subject])

  const onDone = () => {
    if (done.current) return
    done.current = true
    grantPick()
    setPick(true)
    void run.current?.then((start) => {
      if (start) void finishRun(start)
    })
    void extensionFor(subject).then(setNext)
  }

  useBack(() => {
    if (!pick) return false
    home()
  })

  return (
    <>
      <Lesson onDone={onDone} />
      <AnimatePresence>
        {pick && (
          <motion.div key="pick" className="cheer-scrim" variants={overlay} initial="initial" animate="enter">
            <StickerPicker onDone={home} />
            {next && (
              // 給大人看的一句：跟陪玩小字同一個位置、同一種樣子（孩子不識字，不搶眼、不接收點擊）
              <p className="coplay-hint lesson-next" aria-hidden="true">
                <span className="coplay-tag">現在去做</span>
                {next.replace(/^現在去做：/, '')}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** 離開這一堂（課裡自己的「回首頁」，例如 games/Shell 的 onExit）：跟返回鍵一樣回首頁 */
export const leaveLesson = () => go({ name: 'home' }, { back: true })
