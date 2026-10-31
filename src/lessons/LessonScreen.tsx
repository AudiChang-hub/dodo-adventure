import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { StickerPicker } from '../ui/StickerPicker'
import { overlay } from '../ui/motion'
import { go, useBack } from '../lib/nav'
import { grantPick } from '../lib/achievements'
import { LESSONS } from '.'
import type { Subject } from './types'
import '../ui/celebrate.css'

/**
 * App 的 lesson 路由：把一堂課放上來。課叫 onDone（上完了）→ 給一張貼紙、讓孩子挑 → 回首頁。
 * 挑貼紙時按返回（Android 的返回手勢）也回首頁，貼紙留著下次再挑（StickerPicker 的「等一下再選」一樣）。
 * 課自己的返回鍵照路由回上一層（首頁），不用另外處理。
 */
export function LessonScreen({ subject }: { subject: Subject }) {
  const { Lesson } = LESSONS[subject]
  const [pick, setPick] = useState(false)
  const done = useRef(false)
  const home = () => go({ name: 'home' })

  const onDone = () => {
    if (done.current) return
    done.current = true
    grantPick()
    setPick(true)
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** 離開這一堂（課裡自己的「回首頁」，例如 games/Shell 的 onExit）：跟返回鍵一樣回首頁 */
export const leaveLesson = () => go({ name: 'home' }, { back: true })
