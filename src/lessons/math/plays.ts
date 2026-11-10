// 「拿給波波」那一段的三種玩法（T-127 B 案）：學習目標一樣（一對一對應、拿出 N 個），外觀和操作每天換一種。
// ① give：拿給波波（Give.tsx）；② train：小火車，一節車廂載一個（Train.tsx）；③ plant：種花，一個洞種一朵（Plant.tsx）。
// 哪一天用哪一種由 lib/variety.ts 挑（連續兩天不一樣）。三種都記成 skill `give:N`、選項欄位一樣，countReady 的熟練判斷才一致；
// game 各自不同（m-give、m-train、m-plant），家長區看得出是哪一種玩法。
import { getKV, setKV } from '../../lib/db'
import { pickVariety } from '../../lib/variety'
import { range } from './plan'

export const GIVE_PLAYS = ['give', 'train', 'plant'] as const
export type GivePlay = (typeof GIVE_PLAYS)[number]
/** lib/variety.ts 裡這一段的名字 */
export const GIVE_VARIETY = 'math.give'

/** 作答紀錄的 game */
export const PLAY_GAME: Record<GivePlay, string> = { give: 'm-give', train: 'm-train', plant: 'm-plant' }

/** 今天的玩法（同一天再進來沿用；讀不到資料庫也會回傳一種） */
export const pickGivePlay = (date?: Date) => pickVariety<GivePlay>(GIVE_VARIETY, GIVE_PLAYS, date)

/**
 * 作答紀錄的選項欄位：跟拿給波波一樣，能交出去的數量 0～supply 個（supply 比要的多 2、最多 7）。
 * 小火車、種花畫面上不一定有 supply 個東西，但選項要記成一樣，熟練判斷（3 選 1 以上才算）才不會因為玩法不同而不同。
 */
export const giveOptions = (n: number) => range(0, Math.min(7, n + 2)).map(String)

// ── 新玩法的示範（熟練前不教不考）：每一種玩法，孩子自己一次就做對 2 次以前，先看手做一次 ──────────

const SOLO_KEY = 'math-play-solo'
export const PLAY_SOLO = 2
let solo: Partial<Record<GivePlay, number>> | null = null

/** 上課前讀一次（讀不到就當作還不會，照樣示範） */
export async function loadPlays() {
  solo ??= await getKV<Partial<Record<GivePlay, number>>>(SOLO_KEY, {}).catch(() => ({}))
}

export const needsPlayDemo = (p: GivePlay) => (solo?.[p] ?? 0) < PLAY_SOLO

/** 這種玩法做完了：自己一次就做對（聽完才做、沒有手帶）才算一次 */
export function notePlay(p: GivePlay, solo1: boolean) {
  if (!solo1) return
  solo = { ...solo, [p]: (solo?.[p] ?? 0) + 1 }
  void setKV(SOLO_KEY, solo).catch(() => {})
}
