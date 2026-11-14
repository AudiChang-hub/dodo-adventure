// 數學 4 歲內容的存取（./stage4.ts 是純函式）：進課時讀作答紀錄、更新門、算這一堂出什麼。
// 讀不到、壞掉都當作門關著（照 3 歲的上），不擋住上課。
import { db, getKV, setKV, today } from '../../lib/db'
import { pickVariety } from '../../lib/variety'
import { range } from './plan'
import { GAME_SET_IDS, GAME_VARIETY, NO_STAGE4, PAUSE_KEY, STAGE4_KEY, advance, planToday, type GameSet, type MathToday, type Stage4Kv } from './stage4'

/** 門要看的作答：1～5 的有幾個（count:、give:）、找數字（num:）、一眼看出（sub:） */
const SKILLS = range(1, 5).flatMap((n) => [`count:${n}`, `give:${n}`, `num:${n}`, `sub:${n}`])

let kv: Stage4Kv = {}

/** 進課時算一次：開門、升降級、存回去，回傳這一堂的 4 歲內容。firm：plan.ts 存著的 1～5 熟練過了 */
export async function loadStage4(firm: boolean): Promise<MathToday> {
  try {
    const [saved, paused, attempts] = await Promise.all([
      getKV<Stage4Kv>(STAGE4_KEY, {}),
      getKV<boolean | null>(PAUSE_KEY, null).then((v) => v === true),
      db.attempts.where('skill').anyOf(SKILLS).toArray(),
    ])
    const old = saved && typeof saved === 'object' ? saved : {}
    const d = today()
    kv = advance(old, attempts, d, { paused, firm, now: Date.now() })
    if (kv !== old) void setKV(STAGE4_KEY, kv).catch(() => {})
    return planToday(kv, attempts, d, paused)
  } catch {
    return NO_STAGE4
  }
}

/** 一眼看出的第一題手示範過了：之後不再示範 */
export function noteSubDemo() {
  if (!kv.sub || kv.sub.demoed) return
  kv = { ...kv, sub: { ...kv.sub, demoed: true } }
  void setKV(STAGE4_KEY, kv).catch(() => {})
}

/** 小遊戲今天出哪一組（三種輪流，連續兩天不一樣；測試可以用 localStorage 的 dodo:variety:math.game 固定一組） */
export const pickGameSet = (): Promise<GameSet> => pickVariety<GameSet>(GAME_VARIETY, GAME_SET_IDS)
