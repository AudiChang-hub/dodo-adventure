import { game } from '../content/games'
import type { GameProps } from './Shell'
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
}

export function PlayGame(props: GameProps) {
  // 舊的字母遊戲 id（今天已經排好的冒險）會對到改寫後的自然發音遊戲
  const g = game(props.gameId)
  const C = BY_KIND[g.kind]
  return <C key={g.id} {...props} gameId={g.id} />
}
