import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
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
import { Blocks } from '../blocks/Blocks'
import { BlocksPickArt } from '../blocks/art'
import { Race } from '../race/Race'
import { RacePickArt } from '../race/art'
import { Hide } from '../hide/Hide'
import { HidePickArt } from '../hide/art'
import { Order } from '../order/Order'
import { OrderPickArt } from '../order/art'
import { Listen } from '../listen/Listen'
import { ListenPickArt } from '../listen/art'
import { Seesaw } from '../seesaw/Seesaw'
import { SeesawPickArt } from '../seesaw/art'
import type { LogicGame } from '../../lib/nav'
import { PICK_GROUPS, groupLayout } from './pick-grid'
import { GroupIcon } from './group-art'
import '../draw/coloring.css'
import './logic.css'
import './corner.css'

// 遊戲角的邏輯遊戲（T-152 設計稿第三節案 A）：首頁「邏輯遊戲」的圓窗進來先選一種玩法（跟畫畫的 DrawPick 一樣，大圖示、沒有字）。
// T-156（家長 2026-11-16）加上拼圖（games/puzzle）、迷宮（games/maze），四張排成 2×2。
// T-160 起陸續加到 16 個（家長 2026-11-17）。16 張分成 4 類（數一數、動動腦、看仔細、聽和說，./pick-grid 的 PICK_GROUPS），
// 每類一塊底色、標頭一個圖示，沒有多一層「選類別」：一個畫面看得到全部，點一下就進遊戲。
// 平板橫的一頁放下（groupLayout 挑卡片最大的排法，卡片 ≥ 2.5 cm、間距 ≥ 0.6 cm，TOUCH-1）；手機直的一類一塊往下排，可以捲。
// 每一層返回鍵點一下回上一層：玩到一半 → 選玩法 → 首頁（lib/nav.ts 的 parentOf）。
// 上次玩的那一個不另外標記（不暗示該玩哪個）。

/**
 * 選玩法：4 類 16 張大圖示（見 PICK_GROUPS）。進來說一句 Pick a game!。
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
  // 每一張的圖和名字（名字只給螢幕閱讀器、家長看）。Record 讓每個遊戲都一定有一張；分在哪一類、順序照 PICK_GROUPS。
  const cards: Record<LogicGame, { label: string; art: ReactNode }> = {
    sort: { label: '豆豆收拾', art: <SortPickArt /> },
    pattern: { label: '串珠珠', art: <PatternPickArt /> },
    puzzle: { label: '拼圖', art: <PuzzlePickArt /> },
    maze: { label: '迷宮', art: <MazePickArt /> },
    // T-160（家長 2026-11-17）：小熊野餐、鼓聲停、翻翻牌、影子配對、躲在哪裡（位置詞 in、on、under）、心情臉（認情緒）
    picnic: { label: '小熊野餐', art: <PicnicPickArt /> },
    drum: { label: '鼓聲停', art: <DrumPickArt /> },
    memory: { label: '翻翻牌', art: <MemoryPickArt /> },
    shadow: { label: '影子配對', art: <ShadowPickArt /> },
    where: { label: '躲在哪裡', art: <WherePickArt /> },
    feel: { label: '心情臉', art: <FeelPickArt /> },
    // T-162（家長 2026-11-17）：積木蓋蓋看（照圖蓋＋自由蓋）
    blocks: { label: '積木蓋蓋看', art: <BlocksPickArt /> },
    // 家長 2026-11-17：恐龍賽跑棋（數字線、一一對應、輪流）、躲起來了幾隻（5 以內的分與合）
    race: { label: '恐龍賽跑棋', art: <RacePickArt /> },
    hide: { label: '躲起來了幾隻', art: <HidePickArt /> },
    // T-164（家長 2026-11-17）：故事排順序（先後、因果）、聽兩步驟指令（英文、工作記憶）
    order: { label: '故事排順序', art: <OrderPickArt /> },
    listen: { label: '聽指令', art: <ListenPickArt /> },
    // 家長 2026-11-17：蹺蹺板比輕重（給 4 歲左右玩中學）
    seesaw: { label: '蹺蹺板', art: <SeesawPickArt /> },
  }
  const layout = groupLayout(PICK_GROUPS.map((g) => g.games.length))
  let i = 0
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'home' }, { back: true })} hideHost hintText={LOGIC_PICK_HINT}>
      <div className="draw-pick lg-pick is-grouped" data-logic-pick="" style={layout.vars as CSSProperties}>
        <div className="lg-groups">
          {layout.rows.map((row, r) => (
            <div key={r} className="lg-group-row">
              {row.map((gi) => {
                const g = PICK_GROUPS[gi]
                return (
                  <motion.section
                    key={g.id}
                    className={`lg-group is-${g.id}`}
                    data-group={g.id}
                    role="group"
                    aria-label={g.label}
                    style={{ '--gc': layout.cols[gi], '--gpc': layout.pcols[gi], flexGrow: layout.cols[gi] } as CSSProperties}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.05 + gi * 0.08 }}
                  >
                    <div className="lg-group-head" aria-hidden="true">
                      <GroupIcon id={g.id} />
                      <span className="lg-group-name">{g.label}</span>
                    </div>
                    <div className="lg-group-cards">
                      {g.games.map((id) => {
                        const c = cards[id]
                        const k = i++
                        return (
                          <motion.button
                            key={id}
                            type="button"
                            className="draw-pick-card lg-pick-card"
                            data-pick={id}
                            aria-label={c.label}
                            initial={{ y: 24, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.1 + k * 0.05 }}
                            whileTap={{ scale: 0.95 }}
                            {...tap(id, () => open(id))}
                          >
                            {c.art}
                          </motion.button>
                        )
                      })}
                    </div>
                  </motion.section>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Shell>
  )
}

/** 一種玩法（16 種，名字見 LogicPick 的 cards）；返回鍵回到選玩法（lib/nav.ts 的 parentOf） */
export function LogicPlay({ game }: { game: LogicGame }) {
  if (game === 'puzzle') return <Puzzle />
  if (game === 'maze') return <Maze />
  if (game === 'picnic') return <Picnic />
  if (game === 'drum') return <Drum />
  if (game === 'memory') return <Memory />
  if (game === 'shadow') return <Shadow />
  if (game === 'where') return <Where />
  if (game === 'feel') return <Feel />
  if (game === 'blocks') return <Blocks />
  if (game === 'race') return <Race />
  if (game === 'hide') return <Hide />
  if (game === 'order') return <Order />
  if (game === 'listen') return <Listen />
  if (game === 'seesaw') return <Seesaw />
  return game === 'sort' ? <Sort /> : <Pattern />
}
