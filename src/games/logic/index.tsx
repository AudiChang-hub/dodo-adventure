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
import { Puzzle } from '../puzzle/Puzzle'
import { PuzzlePickArt } from '../puzzle/art'
import { Maze } from '../maze/Maze'
import { MazePickArt } from '../maze/art'
import type { LogicGame } from '../../lib/nav'
import '../draw/coloring.css'
import './logic.css'
import './corner.css'

// 遊戲角的邏輯遊戲（T-152 設計稿第三節案 A）：首頁「邏輯遊戲」的圓窗進來先選一種玩法（跟畫畫的 DrawPick 一樣，大圖示、沒有字）。
// T-156（家長 2026-11-16）加上拼圖（games/puzzle）、迷宮（games/maze），四張排成 2×2。
// 每一層返回鍵點一下回上一層：玩到一半 → 選玩法 → 首頁（lib/nav.ts 的 parentOf）。
// 上次玩的那一個不另外標記（不暗示該玩哪個）。

/**
 * 選玩法：籃子（豆豆收拾，分類）、一串珠子（串珠珠，規律）、拼圖、迷宮。進來說一句 Pick a game!。
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
  const open = (game: LogicGame) => {
    if (gone.current) return
    gone.current = true
    sfx.tap()
    go({ name: 'logic-play', game })
  }
  const cards = [
    { id: 'sort' as const, label: '豆豆收拾', art: <SortPickArt /> },
    { id: 'pattern' as const, label: '串珠珠', art: <PatternPickArt /> },
    { id: 'puzzle' as const, label: '拼圖', art: <PuzzlePickArt /> },
    { id: 'maze' as const, label: '迷宮', art: <MazePickArt /> },
  ]
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'home' }, { back: true })} hideHost hintText={LOGIC_PICK_HINT}>
      <div className={`draw-pick lg-pick n${cards.length}`} data-logic-pick="">
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

/** 一種玩法：sort 豆豆收拾、pattern 串珠珠、puzzle 拼圖、maze 迷宮 */
export function LogicPlay({ game }: { game: LogicGame }) {
  if (game === 'puzzle') return <Puzzle />
  if (game === 'maze') return <Maze />
  return game === 'sort' ? <Sort /> : <Pattern />
}
