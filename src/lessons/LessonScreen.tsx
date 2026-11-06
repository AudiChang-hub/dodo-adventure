import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { StickerPicker } from '../ui/StickerPicker'
import { overlay } from '../ui/motion'
import { go, useBack } from '../lib/nav'
import { lessonDone } from '../lib/achievements'
import { LESSONS } from '.'
import type { Subject } from './types'
import { extensionFor } from './extension'
import { LessonBye } from './LessonBye'
import { BackButton } from '../ui/Back'
import { HomeIcon } from '../games/Shell'
import { finishRun, startRun } from '../lib/lesson-log'
import '../ui/celebrate.css'
import '../games/coplay.css'
import './lessons.css'

/**
 * App 的 lesson 路由：把一堂課放上來。課叫 onDone（上完了）→ 有時候挑一張貼紙、大部分是安靜的下課畫面 → 回首頁。
 * 貼紙不是每堂都有（A7，2026-11-03 家長決定）：平均每 3～4 堂一次、不固定、事先不說（lib/lesson-sticker.ts）；
 * 沒有貼紙的那堂是 LessonBye（恐龍、一顆回首頁的房子）。課自己的稱讚、再見兩種都一樣。
 * 兩種下課畫面都給大人一句「現在去做」（lessons/extension.ts：跟今天內容有關、離開螢幕去做的事）。
 * 每一堂記開始、上完（lib/lesson-log.ts），家長區的下一步準備度算中途離開用。
 * 下課畫面按返回（Android 的返回手勢）也回首頁；挑貼紙時按返回，貼紙留著下次有貼紙時再挑（StickerPicker 的「等一下再選」一樣）。
 * 課自己的返回鍵照路由回上一層（首頁），不用另外處理。
 * 下課畫面的遮罩蓋住課自己左上角的房子（看起來變淡、點不到，AI 小男生盲測三次都碰到，T-99）：
 * 遮罩上同一個位置再放一顆房子，一出現就點得動（準則 NAV-1、NAV-7：看得到的返回鍵一定點得動、永遠在最上層）。
 */
export function LessonScreen({ subject }: { subject: Subject }) {
  const { Lesson, host } = LESSONS[subject]
  /** 下課：挑貼紙（pick）或安靜的下課畫面（bye） */
  const [end, setEnd] = useState<'pick' | 'bye' | null>(null)
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
    setEnd(lessonDone() ? 'pick' : 'bye')
    void run.current?.then((start) => {
      if (start) void finishRun(start)
    })
    void extensionFor(subject).then(setNext)
  }

  useBack(() => {
    if (!end) return false
    home()
  })

  return (
    <>
      <Lesson onDone={onDone} />
      <AnimatePresence>
        {end && (
          <motion.div key="end" className="cheer-scrim" variants={overlay} initial="initial" animate="enter">
            {end === 'pick' ? <StickerPicker onDone={home} /> : <LessonBye host={host} onDone={home} />}
            {/* 左上角的房子：跟課裡的返回鍵同一個位置；挑貼紙時點它跟按返回一樣，貼紙留著下次再挑 */}
            <div className={`lesson-end-back${subject === 'english' ? ' is-en' : ''}`}>
              <BackButton label="回首頁" onTap={home}>
                <HomeIcon />
              </BackButton>
            </div>
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
