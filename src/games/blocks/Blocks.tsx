import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell } from '../Shell'
import { go, useBack } from '../../lib/nav'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { bedtimeIfDue } from '../../lib/session'
import { useTaps } from '../../ui/tap'
import { CopyArt, FreeArt } from './art'
import { BLOCKS_COPLAY } from './coplay'
import { Build } from './Build'
import { FreeBuild } from './Free'
import '../draw/coloring.css'
import './blocks.css'

// 積木蓋蓋看（T-162，家長 2026-11-17：讓 4 歲練習玩積木，方案 A）：遊戲角選單進來先選照圖蓋還是自由蓋（兩個大圖示，沒有字）。
// 返回一律一層：照圖蓋／自由蓋 → 選照圖蓋還是自由蓋 → 選玩法（遊戲角）→ 首頁。
// 一律叫「積木」，不用任何品牌的名稱或樣子。

type Mode = 'copy' | 'free'

export function Blocks() {
  const [mode, setMode] = useState<Mode | null>(null)
  const modeRef = useRef<Mode | null>(null)
  modeRef.current = mode
  const back = () => {
    stopSpeech()
    setMode(null)
  }
  // Android 的返回手勢：在玩的時候先回選照圖蓋／自由蓋
  useBack(() => {
    if (!modeRef.current) return false
    back()
    return true
  })
  if (mode === 'copy') return <Build onExit={back} />
  if (mode === 'free') return <FreeBuild onExit={back} />
  return <BlocksPick onPick={setMode} />
}

/** 選照圖蓋還是自由蓋：連點、兩根手指同時點兩張，只照第一下 */
function BlocksPick({ onPick }: { onPick: (m: Mode) => void }) {
  const tap = useTaps()
  const gone = useRef(false)
  useEffect(() => {
    if (bedtimeIfDue()) return
    const t = window.setTimeout(() => void say('bk.pick'), 0)
    return () => {
      clearTimeout(t)
      stopSpeech()
    }
  }, [])
  const cards = [
    { id: 'copy' as const, label: '照圖蓋', art: <CopyArt /> },
    { id: 'free' as const, label: '自由蓋', art: <FreeArt /> },
  ]
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={BLOCKS_COPLAY.pick}>
      <div className="draw-pick bk-pick" data-blocks-pick="">
        {cards.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            className="draw-pick-card"
            data-pick={c.id}
            aria-label={c.label}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.1 + i * 0.12 }}
            whileTap={{ scale: 0.95 }}
            {...tap(c.id, () => {
              if (gone.current) return
              gone.current = true
              sfx.tap()
              onPick(c.id)
            })}
          >
            {c.art}
          </motion.button>
        ))}
      </div>
    </Shell>
  )
}
