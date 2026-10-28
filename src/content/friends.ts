// 孵出來的朋友：英文名字、怎麼動、怎麼叫（benchmark 手法 7「朋友會說話」）
// 朋友清單本身在 park.ts 的 FRIENDS（工作線 B 擁有，這裡只讀）；key 是同一組圖示名稱
import type { Speaker } from './registry'

/** 點朋友時的動作：動物跳一跳、轉身；交通工具開過去再開回來；火箭、直升機飛起來 */
export type FriendMove = 'hop' | 'drive' | 'fly'

export interface FriendInfo {
  /** 顯示在下方的英文名字，爸爸可以跟著唸 */
  name: string
  /** 冠詞：I'm a / I'm an */
  an?: boolean
  move: FriendMove
  /** 說話用哪隻恐龍的聲音（三隻都是同一個童聲，只差音高） */
  voice: Speaker
  /** 叫聲、引擎聲或特徵，接在名字後面說 */
  sound: string
  /** 作答紀錄的詞彙代碼 vocab:<id>；和動物村同名的詞用同一個 id */
  vocab: string
}

export const FRIEND_INFO: Record<string, FriendInfo> = {
  't-rex': { name: 'T-rex', move: 'hop', voice: 'bobo', sound: 'Roar, roar!', vocab: 't-rex' },
  sauropod: { name: 'dinosaur', move: 'hop', voice: 'momo', sound: 'Stomp, stomp.', vocab: 'dinosaur' },
  dragon: { name: 'dragon', move: 'fly', voice: 'bobo', sound: 'Whoosh!', vocab: 'dragon' },
  'baby-chick': { name: 'chick', move: 'hop', voice: 'dodo', sound: 'Peep, peep!', vocab: 'chick' },
  turtle: { name: 'turtle', move: 'hop', voice: 'momo', sound: 'I go slow, slow.', vocab: 'turtle' },
  penguin: { name: 'penguin', move: 'hop', voice: 'dodo', sound: 'Waddle, waddle!', vocab: 'penguin' },
  owl: { name: 'owl', an: true, move: 'hop', voice: 'momo', sound: 'Hoot, hoot.', vocab: 'owl' },
  fox: { name: 'fox', move: 'hop', voice: 'dodo', sound: 'Yip, yip!', vocab: 'fox' },
  koala: { name: 'koala', move: 'hop', voice: 'momo', sound: 'I love trees.', vocab: 'koala' },
  panda: { name: 'panda', move: 'hop', voice: 'momo', sound: 'I love to eat!', vocab: 'panda' },
  'rabbit-face': { name: 'rabbit', move: 'hop', voice: 'dodo', sound: 'Hop, hop!', vocab: 'rabbit' },
  lion: { name: 'lion', move: 'hop', voice: 'bobo', sound: 'Roar!', vocab: 'lion' },
  'tiger-face': { name: 'tiger', move: 'hop', voice: 'bobo', sound: 'I have stripes!', vocab: 'tiger' },
  elephant: { name: 'elephant', an: true, move: 'hop', voice: 'momo', sound: 'I have a long nose.', vocab: 'elephant' },
  giraffe: { name: 'giraffe', move: 'hop', voice: 'momo', sound: 'I am so tall.', vocab: 'giraffe' },
  zebra: { name: 'zebra', move: 'hop', voice: 'dodo', sound: 'Black and white!', vocab: 'zebra' },
  hedgehog: { name: 'hedgehog', move: 'hop', voice: 'dodo', sound: 'I am spiky!', vocab: 'hedgehog' },
  dolphin: { name: 'dolphin', move: 'hop', voice: 'dodo', sound: 'Splash, splash!', vocab: 'dolphin' },
  octopus: { name: 'octopus', an: true, move: 'hop', voice: 'momo', sound: 'I have eight arms.', vocab: 'octopus' },
  crab: { name: 'crab', move: 'hop', voice: 'bobo', sound: 'Snip, snip!', vocab: 'crab' },
  'racing-car': { name: 'race car', move: 'drive', voice: 'bobo', sound: 'Vroom, vroom!', vocab: 'race-car' },
  'fire-engine': { name: 'fire truck', move: 'drive', voice: 'bobo', sound: 'Spray, spray!', vocab: 'fire-truck' },
  locomotive: { name: 'train', move: 'drive', voice: 'bobo', sound: 'Choo choo!', vocab: 'train' },
  helicopter: { name: 'helicopter', move: 'fly', voice: 'dodo', sound: 'Whirr, whirr!', vocab: 'helicopter' },
  rocket: { name: 'rocket', move: 'fly', voice: 'bobo', sound: 'Blast off!', vocab: 'rocket' },
  tractor: { name: 'tractor', move: 'drive', voice: 'bobo', sound: 'Chug, chug!', vocab: 'tractor' },
  // 一張圖一個名字：帆船的圖在動物村叫 boat
  sailboat: { name: 'boat', move: 'drive', voice: 'momo', sound: 'I float on the water.', vocab: 'boat' },
  'police-car': { name: 'police car', move: 'drive', voice: 'bobo', sound: 'Wee-woo, wee-woo!', vocab: 'police-car' },
  bus: { name: 'bus', move: 'drive', voice: 'dodo', sound: 'Beep, beep!', vocab: 'bus' },
  ambulance: { name: 'ambulance', an: true, move: 'drive', voice: 'momo', sound: 'I help people.', vocab: 'ambulance' },
}

/** 沒登記到的朋友（其他工作線之後加的）：用圖示名稱當名字，跳一跳 */
export function friendInfo(id: string): FriendInfo {
  const f = FRIEND_INFO[id]
  if (f) return f
  const name = id.replace(/-face$/, '').replace(/-/g, ' ')
  return { name, an: /^[aeiou]/.test(name), move: 'hop', voice: 'dodo', sound: 'Hello!', vocab: id.replace(/-face$/, '') }
}

/** 第二次點的反應：愛心飄出來，說一句好玩的 */
export const TICKLE_COUNT = 3
