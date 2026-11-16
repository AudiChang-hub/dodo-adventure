import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Shell } from '../Shell'
import { go } from '../../lib/nav'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { bedtimeIfDue } from '../../lib/session'
import { useTaps } from '../../ui/tap'
import { PatternPickArt, SortPickArt } from './art'
import { LOGIC_PICK_HINT } from './coplay'
import { Sort } from './Sort'
import { Pattern } from './Pattern'
import '../draw/coloring.css'
import './logic.css'

// 遊戲角的邏輯遊戲（T-152 設計稿第三節案 A）：首頁「邏輯遊戲」的圓窗進來先選一種玩法（跟畫畫的 DrawPick 一樣，兩個大圖示、沒有字）。
// 每一層返回鍵點一下回上一層：玩到一半 → 選玩法 → 首頁（lib/nav.ts 的 parentOf）。
// 上次玩的那一個不另外標記（不暗示該玩哪個）。

/**
 * 選玩法：籃子（豆豆收拾，分類）、一串珠子（串珠珠，規律）。進來說一句 Pick a game!。
 * 連點、兩根手指同時點兩張：只照第一下換畫面。時間到了（從一局回到這裡）：去睡覺，不再開新的一局。
 */
export function LogicPick() {
  const tap = useTaps()
  const gone = useRef(false)
  useEffect(() => {
    if (bedtimeIfDue()) return
    const t = window.setTimeout(() => void say('lg.pick.intro'), 0)
    return () => {
      clearTimeout(t)
      stopSpeech()
    }
  }, [])
  const open = (game: 'sort' | 'pattern') => {
    if (gone.current) return
    gone.current = true
    sfx.tap()
    go({ name: 'logic-play', game })
  }
  const cards = [
    { id: 'sort' as const, label: '豆豆收拾', art: <SortPickArt /> },
    { id: 'pattern' as const, label: '串珠珠', art: <PatternPickArt /> },
  ]
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'home' }, { back: true })} hideHost hintText={LOGIC_PICK_HINT}>
      <div className="draw-pick lg-pick" data-logic-pick="">
        {cards.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            className="draw-pick-card lg-pick-card"
            data-pick={c.id}
            aria-label={c.label}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.1 + i * 0.12 }}
            whileTap={{ scale: 0.95 }}
            {...tap(c.id, () => open(c.id))}
          >
            {c.art}
          </motion.button>
        ))}
      </div>
    </Shell>
  )
}

/** 一種玩法：sort 豆豆收拾、pattern 串珠珠 */
export function LogicPlay({ game }: { game: 'sort' | 'pattern' }) {
  return game === 'sort' ? <Sort /> : <Pattern />
}
