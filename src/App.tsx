import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useRoute, go, isChildPlay, lastHow, type Route } from './lib/nav'
import { Home } from './screens/Home'
import { Adventure } from './screens/Adventure'
import { MapScreen } from './screens/MapScreen'
import { StationScreen } from './screens/StationScreen'
import { Collection } from './screens/Collection'
import { MagicHouse } from './screens/MagicHouse'
import { StoryBook } from './screens/StoryBook'
import { Bedtime } from './screens/Bedtime'
import { Parent } from './screens/parent/Parent'
import { PlayGame } from './games/PlayGame'
import { ParentCorner, ParentGate } from './ui/ParentGate'
import { stopSpeech } from './lib/audio'
import { isBreakDue, onBreakChange } from './lib/session'
import { useSettings } from './lib/settings'
import { EyeBreak } from './ui/EyeBreak'
import { Subtitle } from './ui/Subtitle'
import { Scenes } from './ui/Scenes'
import { overlay } from './ui/motion'

const isNight = () => {
  const h = new Date().getHours()
  return h >= 19 || h < 6
}

/** 畫面的層級：往深的地方走是「往前」（新畫面蓋上來淡入），往淺的地方是「往回」（上面的畫面淡出） */
const DEPTH: Record<Route['name'], number> = { home: 0, map: 1, collection: 1, house: 1, adventure: 1, parent: 1, bedtime: 1, station: 2, storybook: 2, play: 3 }

const keyOf = (r: Route) => (r.name === 'play' ? `play-${r.game}` : r.name === 'station' ? `st-${r.station}` : r.name)

/** 每一層畫面拿到的是它自己的路由：轉場時舊畫面還留在下面，不會讀到新路由變成新畫面 */
function Screen({ r }: { r: Route }) {
  switch (r.name) {
    case 'home':
      return <Home />
    case 'adventure':
      return <Adventure />
    case 'map':
      return <MapScreen />
    case 'station':
      return <StationScreen id={r.station} />
    case 'play':
      return <PlayGame gameId={r.game} onDone={() => go({ name: 'station', station: r.station })} onExit={() => go({ name: 'station', station: r.station }, { back: true })} />
    case 'collection':
      return <Collection />
    case 'house':
      return <MagicHouse />
    case 'storybook':
      return <StoryBook />
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
  // 護眼休息只在兩個遊戲之間出現；冒險流程自己處理，避免打斷題目
  const showBreak = breakDue && (r.name === 'home' || r.name === 'map' || r.name === 'station' || r.name === 'collection' || r.name === 'house')
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
