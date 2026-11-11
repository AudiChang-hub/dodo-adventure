import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useRoute, go, isChildPlay, lastHow, parentOf, type Route } from './lib/nav'
import { Home } from './screens/Home'
import { StoryBook } from './screens/StoryBook'
import { StickerBook } from './screens/StickerBook'
import { Bedtime } from './screens/Bedtime'
import { Parent } from './screens/parent/Parent'
import { PlayGame } from './games/PlayGame'
import { LessonScreen } from './lessons/LessonScreen'
import { ParentCorner, ParentGate } from './ui/ParentGate'
import { stopSpeech } from './lib/audio'
import { isBreakDue, onBreakChange } from './lib/session'
import { useSettings } from './lib/settings'
import { EyeBreak } from './ui/EyeBreak'
import { Subtitle } from './ui/Subtitle'
import { Scenes } from './ui/Scenes'
import { overlay } from './ui/motion'
import { NextStepHost, cancelNextStep } from './ui/NextStep'

const isNight = () => {
  const h = new Date().getHours()
  return h >= 19 || h < 6
}

/** 畫面的層級：往深的地方走是「往前」（新畫面蓋上來淡入），往淺的地方是「往回」（上面的畫面淡出） */
const DEPTH: Record<Route['name'], number> = { home: 0, parent: 1, bedtime: 1, lesson: 1, storybook: 1, stickers: 1, play: 1 }

const keyOf = (r: Route) => (r.name === 'play' ? `play-${r.game}` : r.name === 'lesson' ? `lesson-${r.subject}` : r.name)

/** 每一層畫面拿到的是它自己的路由：轉場時舊畫面還留在下面，不會讀到新路由變成新畫面 */
function Screen({ r }: { r: Route }) {
  switch (r.name) {
    case 'home':
      return <Home />
    case 'play': {
      // 玩完、離開都回上一層（首頁的畫畫：回首頁）
      const up = parentOf(r)!
      return <PlayGame gameId={r.game} onDone={() => go(up)} onExit={() => go(up, { back: true })} />
    }
    case 'lesson':
      return <LessonScreen subject={r.subject} />
    case 'storybook':
      return <StoryBook />
    case 'stickers':
      return <StickerBook />
    case 'bedtime':
      return <Bedtime />
    case 'parent':
      return <Parent />
  }
}

export function App() {
  const r = useRoute()
  const [gate, setGate] = useState(false)
  const breakDue = useSyncExternalStore(onBreakChange, isBreakDue)
  const { nightWarm } = useSettings()
  // 護眼休息只在首頁出現（上完一堂課、畫完畫回到首頁的時候），不打斷題目
  const showBreak = breakDue && r.name === 'home'
  const key = keyOf(r)
  // 上一個畫面：換畫面的那一次 render 用它判斷往前還是往回
  const prev = useRef(r)

  useEffect(() => {
    prev.current = r
  }, [r])

  // 換畫面就停掉上一個畫面的話。要用 layout effect：新畫面自己的開場語音（站點的歡迎）是在它的 useEffect 裡說的，
  // 一般的 useEffect 父元件比子元件晚跑，會把剛開始的歡迎語音切掉（B14）
  useLayoutEffect(() => {
    stopSpeech()
    // 換畫面：上一個畫面還在等的「下一步」大箭頭收掉（T-118）
    cancelNextStep()
  }, [key])

  return (
    // 系統設定「減少動態效果」：motion 只保留淡入淡出，不做縮放、位移（CSS 動畫在 global.css 另外處理）
    <MotionConfig reducedMotion="user">
      {/* 整頁切換：交叉淡化，新畫面蓋好了才卸載舊的，不縮放（ui/motion.ts 的 page） */}
      <Scenes
        id={key}
        move={() => {
          const how = lastHow()
          return { back: how.back ?? DEPTH[r.name] < DEPTH[prev.current.name] }
        }}
      >
        <Screen r={r} />
      </Scenes>
      {/* 「下一步」的大箭頭（T-118）：課程做完一段停下來，孩子點了才往下（ui/NextStep） */}
      <NextStepHost />
      {/* 字幕只靠播放事件運作，家長區不顯示 */}
      <Subtitle hidden={r.name === 'parent'} />
      {isChildPlay(r) && <ParentCorner onOpen={() => setGate(true)} />}
      <AnimatePresence>
        {gate && (
          <ParentGate
            key="gate"
            onCancel={() => setGate(false)}
            onPass={() => {
              setGate(false)
              go({ name: 'parent' })
            }}
          />
        )}
      </AnimatePresence>
      {/* 護眼休息：整個畫面一次淡入、一次淡出（ui/motion.ts 的 overlay）；裡面「看遠方時刻意淡掉」的設計不變 */}
      <AnimatePresence>
        {showBreak && (
          <motion.div key="eyebreak" className="overlay-layer" style={{ zIndex: 120 }} variants={overlay} initial="initial" animate="enter" exit="exit">
            <EyeBreak />
          </motion.div>
        )}
      </AnimatePresence>
      {nightWarm && isNight() && <div className="night-warm" aria-hidden="true" />}
      <div className="paper-grain" aria-hidden="true" />
    </MotionConfig>
  )
}
