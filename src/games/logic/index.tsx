import { useEffect, useRef, type CSSProperties } from 'react'
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
import { Picnic } from '../picnic/Picnic'
import { PicnicPickArt } from '../picnic/art'
import { Drum } from '../drum/Drum'
import { DrumPickArt } from '../drum/art'
import { Memory } from '../memory/Memory'
import { MemoryPickArt } from '../memory/art'
import { Shadow } from '../shadow/Shadow'
import { ShadowPickArt } from '../shadow/art'
import { Where } from '../where/Where'
import { WherePickArt } from '../where/art'
import { Feel } from '../feel/Feel'
import { FeelPickArt } from '../feel/art'
import type { LogicGame } from '../../lib/nav'
import { pickGrid } from './pick-grid'
import '../draw/coloring.css'
import './logic.css'
import './corner.css'

// 遊戲角的邏輯遊戲（T-152 設計稿第三節案 A）：首頁「邏輯遊戲」的圓窗進來先選一種玩法（跟畫畫的 DrawPick 一樣，大圖示、沒有字）。
// T-156（家長 2026-11-16）加上拼圖（games/puzzle）、迷宮（games/maze），四張排成 2×2。
// T-160（家長 2026-11-17）加上小熊野餐（games/picnic）、鼓聲停（games/drum）。遊戲會加到 10 個：平板橫的排成 2 排（5×2），
// 手機直的排成 2 欄；排法照卡片數自己算（pickGrid），清單多加幾項都排得下，卡片仍 ≥ 2.5 cm（TOUCH-1）。
// 每一層返回鍵點一下回上一層：玩到一半 → 選玩法 → 首頁（lib/nav.ts 的 parentOf）。
// 上次玩的那一個不另外標記（不暗示該玩哪個）。

/**
 * 選玩法：籃子（豆豆收拾，分類）、一串珠子（串珠珠，規律）、拼圖、迷宮、小熊野餐、鼓聲停。進來說一句 Pick a game!。
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
    { id: 'picnic' as const, label: '小熊野餐', art: <PicnicPickArt /> },
    { id: 'drum' as const, label: '鼓聲停', art: <DrumPickArt /> },
    // T-160（家長 2026-11-17）：翻翻牌、影子配對
    { id: 'memory' as const, label: '翻翻牌', art: <MemoryPickArt /> },
    { id: 'shadow' as const, label: '影子配對', art: <ShadowPickArt /> },
    // T-160（家長 2026-11-17）：躲在哪裡（位置詞 in、on、under）、心情臉（認情緒）
    { id: 'where' as const, label: '躲在哪裡', art: <WherePickArt /> },
    { id: 'feel' as const, label: '心情臉', art: <FeelPickArt /> },
  ]
  const grid = pickGrid(cards.length)
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'home' }, { back: true })} hideHost hintText={LOGIC_PICK_HINT}>
      <div
        className={`draw-pick lg-pick n${cards.length}${cards.length > 4 ? ' is-many' : ''}`}
        data-logic-pick=""
        style={{ '--cols': grid.cols, '--rows': grid.rows, '--pcols': grid.pcols, '--prows': grid.prows } as CSSProperties}
      >
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

/** 一種玩法：sort 豆豆收拾、pattern 串珠珠、puzzle 拼圖、maze 迷宮、picnic 小熊野餐、drum 鼓聲停、memory 翻翻牌、shadow 影子配對、where 躲在哪裡、feel 心情臉 */
export function LogicPlay({ game }: { game: LogicGame }) {
  if (game === 'puzzle') return <Puzzle />
  if (game === 'maze') return <Maze />
  if (game === 'picnic') return <Picnic />
  if (game === 'drum') return <Drum />
  if (game === 'memory') return <Memory />
  if (game === 'shadow') return <Shadow />
  if (game === 'where') return <Where />
  if (game === 'feel') return <Feel />
  return game === 'sort' ? <Sort /> : <Pattern />
}
