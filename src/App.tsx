import { useEffect, useState, useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { useRoute, go, isChildPlay } from './lib/nav'
import { Home } from './screens/Home'
import { Adventure } from './screens/Adventure'
import { MapScreen } from './screens/MapScreen'
import { StationScreen } from './screens/StationScreen'
import { Collection } from './screens/Collection'
import { Bedtime } from './screens/Bedtime'
import { Parent } from './screens/parent/Parent'
import { PlayGame } from './games/PlayGame'
import { ParentCorner, ParentGate } from './ui/ParentGate'
import { stopSpeech } from './lib/audio'
import { isBreakDue, onBreakChange } from './lib/session'
import { useSettings } from './lib/settings'
import { EyeBreak } from './ui/EyeBreak'

const isNight = () => {
  const h = new Date().getHours()
  return h >= 19 || h < 6
}

function Screen() {
  const r = useRoute()
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
      return <PlayGame gameId={r.game} onDone={() => go({ name: 'station', station: r.station })} onExit={() => go({ name: 'home' })} />
    case 'collection':
      return <Collection />
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
  const showBreak = breakDue && (r.name === 'home' || r.name === 'map' || r.name === 'station' || r.name === 'collection')
  const key = r.name === 'play' ? `play-${r.game}` : r.name === 'station' ? `st-${r.station}` : r.name

  useEffect(() => {
    stopSpeech()
  }, [key])

  return (
    <>
      {/* 只做淡入、不做淡出：淡出期間舊畫面會讀到新路由，也可能卡住 */}
      <motion.div key={key} className="screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <Screen />
      </motion.div>
      {isChildPlay(r) && <ParentCorner onOpen={() => setGate(true)} />}
      {gate && (
        <ParentGate
          onCancel={() => setGate(false)}
          onPass={() => {
            setGate(false)
            go({ name: 'parent' })
          }}
        />
      )}
      {showBreak && <EyeBreak />}
      {nightWarm && isNight() && <div className="night-warm" aria-hidden="true" />}
      <div className="paper-grain" aria-hidden="true" />
    </>
  )
}
