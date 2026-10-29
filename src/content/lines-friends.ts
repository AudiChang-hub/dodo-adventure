// 工作線 D（陪玩與體驗）的台詞：朋友會說話、過程型稱讚、今日路線、先用手指描
// 全部用 registry 的 def()，由 lines.ts 頂部 import 一行載入
import { def, type Speaker } from './registry'
import { FRIEND_INFO, TICKLE_COUNT } from './friends'

const NUM = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty',
]

// ── 朋友會說話（benchmark 手法 7）：名字加重，叫聲或特徵另外一句 ─────────
// 收集品就變成詞彙複習；key 是 park.ts 的 FRIENDS 圖示名稱。
// 「這是 ___」全站只用一種說法（2026-10-28 單字盤點第 4 章）：朋友的名字也說 This is a | dinosaur!，不說 I'm a ___!
for (const [id, f] of Object.entries(FRIEND_INFO)) {
  def(`friend.name.${id}`, f.voice, `This is ${f.an ? 'an' : 'a'} | ${f.name}!`)
  def(`friend.sound.${id}`, f.voice, f.sound)
}
// 再點一次的第二種反應：愛心飄出來
const tickle: Record<Speaker, string[]> = {
  dodo: ['Again! Again!', 'Hee hee! That tickles!', 'I like you!'],
  bobo: ['Again! Again!', 'Ha ha! That tickles!', 'I like you!'],
  momo: ['Again, again.', 'Hee hee. That tickles.', 'I like you.'],
}
for (const [s, list] of Object.entries(tickle) as [Speaker, string[]][]) list.slice(0, TICKLE_COUNT).forEach((t, i) => def(`friend.tickle.${s}.${i}`, s, t))
/** 點還沒孵出來的蛋：去冒險就能孵出來 */
def('friend.egg', 'dodo', 'Let’s go! The egg will crack!')

/** 收集頁偶爾數一數：波波最愛數東西 */
export const FRIEND_COUNT_MAX = 30
for (let n = 1; n <= FRIEND_COUNT_MAX; n++) def(`friend.count.${n}`, 'bobo', n === 1 ? 'You have | one friend!' : `You have | ${NUM[n]} friends!`)

// ── 過程型稱讚（稱讚努力，不稱讚聰明）──────────────────────────
// 同一個意思只用一種說法（2026-10-28 單字盤點第 4 章）：You kept trying!；key 的數量不變
export const EFFORT_COUNT = 4
const effort: Record<Speaker, string[]> = {
  dodo: Array<string>(EFFORT_COUNT).fill('You kept trying!'),
  bobo: Array<string>(EFFORT_COUNT).fill('You kept trying!'),
  momo: Array<string>(EFFORT_COUNT).fill('You kept trying.'),
}
for (const [s, list] of Object.entries(effort) as [Speaker, string[]][]) list.forEach((t, i) => def(`effort.${s}.${i}`, s, t))

/** 過程型稱讚的 key；其他工作線（例如選擇題）也可以在糾正之後用 */
export const effortKey = (host: Speaker, i = Math.floor(Math.random() * EFFORT_COUNT)) => `effort.${host}.${i % EFFORT_COUNT}`

// ── 蛋是旅程的劇情，不是付款 ───────────────────────────────────
export const STORY_EGG_COUNT = 4
;['The egg wiggled in the car!', 'Bump! The egg is cracking!', 'Shh… the egg moved!', 'Look! The egg is cracking!'].forEach((t, i) => def(`story.egg.${i}`, 'dodo', t))

// ── 今日路線（手法 8）：開局先看到今天要去幾站 ─────────────────────
for (let n = 2; n <= 5; n++) def(`route.stops.${n}`, 'dodo', `Today, we have | ${NUM[n]} stops!`)

// ── 先用手指描，再換筆（手法 5）──────────────────────────────────
def('ink.finger', 'dodo', 'Use your finger!')
def('ink.pen', 'dodo', 'Now use the pen!')
