import { game } from '../content/games'
import type { GameProps } from './Shell'
import { ChoiceGame } from './ChoiceGame'
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

const BY_KIND = {
  choice: ChoiceGame,
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
}

export function PlayGame(props: GameProps) {
  const C = BY_KIND[game(props.gameId).kind]
  return <C key={props.gameId} {...props} />
}
