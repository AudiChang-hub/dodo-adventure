// 自由畫畫的台詞（T-127）：發呆時的提示換成今天的世界的一句（以前永遠是「Draw anything you like!」，
// 三歲聽到「什麼都可以畫」等於沒有起點）。家長不用管，孩子可以不照著畫。
// content/lines.ts import 這個檔，npm run audio 才會產生音檔。
import { def } from '../../content/registry'
import type { WorldId } from '../../lib/today-world'

/** 今天的一句（一句 ≤ 6 個字；說的是今天的印章裡有的角色） */
export const DRAW_IDEA: Record<WorldId, string> = {
  farm: 'Draw a home for the cow!',
  beach: 'Draw a home for the crab!',
  site: 'Draw a road for the truck!',
  zoo: 'Draw a tree for the giraffe!',
  market: 'Draw a basket for the apples!',
  city: 'Draw a road for the bus!',
  valley: 'Draw a nest for the egg!',
  party: 'Draw candles on the cake!',
  rain: 'Draw a pond for the duck!',
  garden: 'Draw flowers for the butterfly!',
}

export const ideaKey = (id: WorldId) => `d.free.idea.${id}`
for (const [id, text] of Object.entries(DRAW_IDEA)) def(ideaKey(id as WorldId), 'dodo', text)
