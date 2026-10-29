import { useRef, useState } from 'react'
import { game } from '../content/games'
import type { GameProps, GameResult } from './Shell'
import { Celebrate } from '../ui/Celebrate'
import { beginRound, endRound, type RoundSummary } from '../lib/achievements'
import { useThemeScope } from '../lib/theme-play'
import { useBack } from '../lib/nav'
import { ChoiceGame } from './ChoiceGame'
import { PhonicsGame } from './phonics/PhonicsGame'
import { CountGame } from './CountGame'
import { OrderGame } from './OrderGame'
import { TraceGame } from './draw/TraceGame'
import { DotsGame } from './draw/DotsGame'
import { ColoringGame } from './draw/ColoringGame'
import { FreeDraw } from './draw/FreeDraw'
import { GlyphGame } from './draw/GlyphGame'
import { FindAllGame } from './FindAllGame'
import { LassoGame } from './LassoGame'
import { FillCountGame } from './FillCountGame'
import { GiveGame } from './GiveGame'
import { SubitizeGame } from './SubitizeGame'
import { DriveGame } from './code/DriveGame'
import { SequenceGame } from './code/SequenceGame'
import { PatternGame } from './code/PatternGame'

const BY_KIND = {
  choice: ChoiceGame,
  phonics: PhonicsGame,
  count: CountGame,
  order: OrderGame,
  trace: TraceGame,
  dots: DotsGame,
  coloring: ColoringGame,
  free: FreeDraw,
  glyph: GlyphGame,
  // 工作線 B：學習單題型
  findall: FindAllGame,
  lasso: LassoGame,
  fill: FillCountGame,
  give: GiveGame,
  subitize: SubitizeGame,
  // 程式車庫
  drive: DriveGame,
  sequence: SequenceGame,
  pattern: PatternGame,
}

export function PlayGame(props: GameProps) {
  // 舊的字母遊戲 id（今天已經排好的冒險）會對到改寫後的自然發音遊戲
  const g = game(props.gameId)
  const C = BY_KIND[g.kind]
  // 主題式冒險：遊戲在畫面上的期間，題目產生器都讀得到今天的主題
  useThemeScope(props.theme)
  // 成就感：在遊戲自己的 markPlayed 之前記下開局的難度；結束時先回顧這一局、慶祝里程碑，再交回去
  useState(() => beginRound(g.id))
  const [cheer, setCheer] = useState<{ r: GameResult; s: RoundSummary } | null>(null)
  const ended = useRef(false)
  /** 已經交回去了（站點或冒險的下一段）：只交一次，慶祝自己結束和返回鍵不會各交一次 */
  const handed = useRef(false)
  const finish = (r: GameResult) => {
    if (handed.current) return
    handed.current = true
    props.onDone(r)
  }
  const onDone = (r: GameResult) => {
    if (ended.current) return
    ended.current = true
    const s = endRound(g.id)
    if (!s.things.length && !s.milestones.length) return finish(r)
    setCheer({ r, s })
  }
  /**
   * 返回（返回鍵、Android 的返回手勢）：玩到一半就回上一層，已經答的題目都記下了（logAttempt 每題當下就寫）。
   * 慶祝中返回當作看完慶祝：這一局照樣算完成，不會因為返回少一站。已經交回去了就交給外層（冒險）處理。
   */
  const exit = () => {
    if (handed.current) return false
    if (cheer) return finish(cheer.r)
    props.onExit()
  }
  useBack(exit)
  return (
    <>
      <C key={g.id} {...props} gameId={g.id} onDone={onDone} onExit={exit} />
      {cheer && <Celebrate summary={cheer.s} onDone={() => finish(cheer.r)} />}
    </>
  )
}
