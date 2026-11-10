// 今天的世界（T-127，src/lib/today-world.ts）：恐龍的開場句，三隻恐龍各一份（念的內容一樣，聲音不一樣）。
import { def, type Speaker } from './registry'
import type { WorldId } from '../lib/today-world'

/** 開場句（一句 ≤ 6 個字，3～4 歲聽得懂的長度；`|` 後面是加重的地方，只能有一個） */
export const WORLD_HI: Record<WorldId, string> = {
  farm: "Today we're on the | farm!",
  beach: "Today we're at the | beach!",
  site: "We're at the | building site!",
  zoo: "Today we're at the | zoo!",
  market: "We're at the | fruit market!",
  city: "Today we're in the | city!",
  valley: "We're in | Dino Valley!",
  party: "Today is a | party!",
  rain: "It's a | rainy day!",
  garden: "Today we're in the | garden!",
}

const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']
for (const [id, text] of Object.entries(WORLD_HI)) for (const s of SPEAKERS) def(`world.${id}.hi.${s}`, s, text)
