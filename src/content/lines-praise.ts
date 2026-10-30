// 過程型的稱讚（T-49 FB-3、V-31）：說出孩子剛剛做了什麼，不只是 Yes!。
// 一個遊戲對一種「做了什麼」，每句 ≤ 6 個字；三隻恐龍各一份（莫莫用句號，比較沉穩）。
// 找出全部、圈圈看本來就說 You found them all!（ws.done），連點成圖有自己的 DOTS_PRAISE，這裡不重複。
// games/lines.ts 的 praiseKey 依「現在這一局是哪個遊戲」挑這裡的句子；之後的新遊戲加一行對應就好。
import { def, type Speaker } from './registry'

export const PRAISE_DID = {
  counted: 'You counted them all!',
  looked: 'You looked so carefully!',
  number: 'You found the number!',
  order: 'You went in order!',
  listened: 'You listened so well!',
  thought: 'You thought about it!',
  road: 'You stayed on the road!',
  traced: 'You traced it all!',
  color: 'You found the color!',
  shape: 'You found the shape!',
  cards: 'Your cards worked!',
  pattern: 'You saw the pattern!',
  story: 'You put them in order!',
} as const
export type Did = keyof typeof PRAISE_DID

/** 每個遊戲說哪一種（沒有列的遊戲只說 Yes!） */
export const GAME_DID: Record<string, Did> = {
  'ph-start': 'listened',
  'ph-same': 'listened',
  'ph-letter': 'listened',
  'm-count': 'counted',
  'm-match': 'counted',
  'm-fill': 'counted',
  'm-give': 'counted',
  'm-find': 'number',
  'm-compare': 'looked',
  'm-flash': 'looked',
  'm-order': 'order',
  'z-find': 'listened',
  'z-sound': 'listened',
  'z-category': 'thought',
  'd-trace': 'road',
  'd-glyph': 'traced',
  'p-color': 'color',
  'p-shape': 'shape',
  'p-size': 'looked',
  'c-drive': 'cards',
  'c-pattern': 'pattern',
  'c-seq': 'story',
}

const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']
for (const s of SPEAKERS)
  for (const [k, t] of Object.entries(PRAISE_DID)) def(`praise.did.${k}.${s}`, s, s === 'momo' ? t.replace(/!$/, '.') : t)
