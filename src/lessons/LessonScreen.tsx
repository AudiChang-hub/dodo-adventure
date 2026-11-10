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
import { holdBedtime, isTimeUp } from '../lib/session'
import { takeResumeEnd } from './resume-end'
import '../ui/celebrate.css'
import '../games/coplay.css'
import './lessons.css'

/**
 * T-118（家長：課程會自己突然結束，孩子覺得「怎麼不見了」）：
 * - 下課畫面不會自己離開：沒有貼紙的那堂直接是晚安道別（LessonBye：點恐龍說晚安、恐龍睡著、點房子才回首頁）；
 *   有貼紙的那堂挑完、看完貼紙本，點「下一步」的大箭頭也來到晚安道別。以前 20 秒（挑貼紙 90 秒）沒碰就自己回首頁。
 * - 每天的時間到了，不在一堂課的中間打斷（準則 TIME-2）：整堂課（含下課畫面）擋著睡覺畫面（holdBedtime）。
 *   以前只有數學、中文課（games/Shell）擋著，英文課上到一半就被換成睡覺畫面。
 *   時間到的那一天，晚安道別的房子換成月亮，點了直接去睡覺畫面；陪玩小字先告訴大人「今天的時間到了」。
 *   放著不管超過上限 6 分鐘（lib/session 的 GRACE_MAX_SEC）照舊會結束，避免平板被丟著一直計時。
 *
 * App 的 lesson 路由：把一堂課放上來。課叫 onDone（上完了）→ 有時候挑一張貼紙、大部分是安靜的下課畫面 → 回首頁。
 * 貼紙不是每堂都有（A7，2026-11-03 家長決定）：平均每 3～4 堂一次、不固定、事先不說（lib/lesson-sticker.ts）；
 * 沒有貼紙的那堂是 LessonBye（晚安道別）。課自己的稱讚、再見兩種都一樣。
 * 兩種下課畫面都給大人一句「現在去做」（lessons/extension.ts：跟今天內容有關、離開螢幕去做的事）。
 * 每一堂記開始、上完（lib/lesson-log.ts），家長區的下一步準備度算中途離開用。
 * 下課畫面按返回（Android 的返回手勢）也回首頁；挑貼紙時按返回，貼紙留著下次有貼紙時再挑（StickerPicker 的「等一下再選」一樣）。
 * 課自己的返回鍵照路由回上一層（首頁），不用另外處理。
 * 上完了、還沒說完晚安就離開，同一天回來（英文課，T-122）：課先叫 resumeEnd() 再叫 onDone，直接回到晚安道別，
 * 不再算一堂（T-125：以前又算一次，貼紙的間隔剛好到了就變成挑貼紙）。貼紙沒挑完就離開的，貼紙照舊留著下次再挑。
 * 下課畫面的遮罩蓋住課自己左上角的房子（看起來變淡、點不到，AI 小男生盲測三次都碰到，T-99）：
 * 遮罩上同一個位置再放一顆房子，一出現就點得動（準則 NAV-1、NAV-7：看得到的返回鍵一定點得動、永遠在最上層）。
 */
export function LessonScreen({ subject }: { subject: Subject }) {
  const { Lesson, host } = LESSONS[subject]
  /** 下課：挑貼紙（pick）或安靜的下課畫面（bye） */
  const [end, setEnd] = useState<'pick' | 'bye' | null>(null)
  const [next, setNext] = useState<string | null>(null)
  /** 晚安道別：恐龍睡著了（陪玩小字從「請他跟恐龍說晚安」換成「現在去做」） */
  const [asleep, setAsleep] = useState(false)
  /** 今天的時間到了（下課時看一次） */
  const [timeUp, setTimeUp] = useState(false)
  const done = useRef(false)
  const run = useRef<Promise<number> | null>(null)
  const home = () => go({ name: 'home' })

  useEffect(() => {
    run.current = startRun(subject).catch(() => 0)
  }, [subject])

  // 整堂課（含下課畫面）擋著睡覺畫面：時間到了等他道別完才去（T-118、準則 TIME-2）
  useEffect(() => holdBedtime(), [])

  const onDone = () => {
    const again = takeResumeEnd()
    if (done.current) return
    done.current = true
    setTimeUp(isTimeUp())
    // 回到還沒說完的晚安道別（T-125）：這一堂上完時已經算過，不再算一次、也不會變成挑貼紙
    setEnd(!again && lessonDone() ? 'pick' : 'bye')
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
            {end === 'pick' ? (
              // 挑完貼紙（或等一下再選）：接著跟恐龍說晚安（T-118）
              <StickerPicker
                onDone={() => {
                  setTimeUp(isTimeUp())
                  setEnd('bye')
                }}
              />
            ) : (
              <LessonBye host={host} timeUp={timeUp} onAsleep={() => setAsleep(true)} onDone={timeUp ? () => go({ name: 'bedtime' }) : home} />
            )}
            {/* 左上角的房子：跟課裡的返回鍵同一個位置；挑貼紙時點它跟按返回一樣，貼紙留著下次再挑 */}
            <div className={`lesson-end-back${subject === 'english' ? ' is-en' : ''}`}>
              <BackButton label="回首頁" onTap={home}>
                <HomeIcon />
              </BackButton>
            </div>
            {end === 'bye' && !asleep ? (
              // 晚安道別之前：告訴大人現在要做什麼（時間到的那一天先預告）
              <p className="coplay-hint lesson-next" aria-hidden="true">
                <span className="coplay-tag">陪玩</span>
                {timeUp ? '今天的時間到了。請他點恐龍說晚安，恐龍睡著後點月亮，就是睡覺畫面。' : '下課了。請他點恐龍說晚安，恐龍睡著後再點房子回首頁。'}
              </p>
            ) : (
              next && (
                // 給大人看的一句：跟陪玩小字同一個位置、同一種樣子（孩子不識字，不搶眼、不接收點擊）
                <p className="coplay-hint lesson-next" aria-hidden="true">
                  <span className="coplay-tag">現在去做</span>
                  {next.replace(/^現在去做：/, '')}
                </p>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** 離開這一堂（課裡自己的「回首頁」，例如 games/Shell 的 onExit）：跟返回鍵一樣回首頁 */
export const leaveLesson = () => go({ name: 'home' }, { back: true })
