// 挑選畫面一次給哪 6 張貼紙（純函式，不碰資料庫）。
//
// 規則（2026-10-28 家長：「貼紙可以隨機出」，加上前一次的「不用系列框住、可以重複選」）：
// - 6 張以隨機為主：每張是「圖庫裡隨機一個主角」＋「隨機的種子」（外觀由 sticker-look.ts 依種子畫出來）。
// - 留一點點偏好：主角被抽到的權重 = 1 + 他選過的類型的比例 × PREF（最多約 1.6 倍），加上起始的一點點恐龍、交通工具、動物偏好。
//   他一直選恐龍，恐龍出現的機會稍微多一點，但大部分還是隨機的。
// - 一批裡主角不重複；外框形狀、背景色票盡量不重複（同一批 6 張彼此看得出不同，又是同一套畫風）。
// - 選過的主角照樣會出現（同一個主角換了外觀就是新的一張），不會因為「已經收過」被排除。
// - 按「再看別的」：重新隨機一批，先避開這次已經看過的主角（全部看過再從頭）。
// - 集滿卡片時卡片上蓋著的那一張（feature）一定在 6 張裡，翻開看到的就選得到。
import { CAT_SEED, STICKER_ART, type ArtCat } from '../content/sticker-art'
import { lookOf, newSeed } from '../content/sticker-look'

export const PICK_OPTIONS = 6

/** 一張貼紙：主角 + 種子（存檔、同步都只存這兩個值） */
export interface Stk {
  art: string
  seed: number
}

/** 偏好的分量：他選過的類型比例 × PREF，加在基本權重 1 上 */
const PREF = 0.6
/** 起始偏好（CAT_SEED）縮小到「一點點」：最喜歡的類型約 1.2 倍 */
const SEED_PREF = 0.12
/** 越早的選擇分量越輕 */
const DECAY = 0.85

type Rnd = () => number

/** 各類型的權重：1 + 一點點起始偏好 + 他選過的比例 × PREF */
export function catWeights(history: string[]): Record<ArtCat, number> {
  const cat = new Map(STICKER_ART.map((a) => [a.id, a.cat]))
  const got: Partial<Record<ArtCat, number>> = {}
  let sum = 0
  history.forEach((id, i) => {
    const c = cat.get(id)
    if (!c) return
    const w = Math.pow(DECAY, history.length - 1 - i)
    got[c] = (got[c] ?? 0) + w
    sum += w
  })
  const out = {} as Record<ArtCat, number>
  for (const c of Object.keys(CAT_SEED) as ArtCat[]) out[c] = 1 + CAT_SEED[c] * SEED_PREF + (sum ? ((got[c] ?? 0) / sum) * PREF : 0)
  return out
}

function weighted<T>(list: T[], weight: (x: T) => number, rnd: Rnd): T {
  const ws = list.map(weight)
  let r = rnd() * ws.reduce((a, b) => a + b, 0)
  for (let i = 0; i < list.length; i++) if ((r -= ws[i]) < 0) return list[i]
  return list[list.length - 1]
}

/** 給一個主角挑一個種子：外框和色票盡量跟這一批已經有的不一樣（試幾次，挑撞得最少的） */
function seedFor(art: string, batch: Stk[], rnd: Rnd): number {
  const used = batch.map((b) => lookOf(b.art, b.seed))
  let best = 0
  let bestHit = Infinity
  for (let i = 0; i < 12; i++) {
    const seed = newSeedFrom(rnd)
    const L = lookOf(art, seed)
    const hit = used.filter((u) => u.shape.id === L.shape.id).length * 2 + used.filter((u) => u.palette.id === L.palette.id).length * 2 + used.filter((u) => u.pattern === L.pattern).length
    if (hit < bestHit) [best, bestHit] = [seed, hit]
    if (hit === 0) break
  }
  return best
}
const newSeedFrom = (rnd: Rnd) => (rnd === Math.random ? newSeed() : (rnd() * 4294967296) >>> 0)

/** 一張隨機的貼紙（集滿卡片時蓋在卡片上的那一張） */
export function featureFor(history: string[], rnd: Rnd = Math.random): Stk {
  const w = catWeights(history)
  const art = weighted(STICKER_ART, (a) => w[a.cat], rnd).id
  return { art, seed: newSeedFrom(rnd) }
}

/**
 * 一批 6 張（位置已打亂）。history：他選過的主角（舊到新）；exclude：這次挑選已經看過的主角。
 */
export function recommend(history: string[], exclude: Set<string>, feature?: Stk, rnd: Rnd = Math.random): Stk[] {
  const w = catWeights(history)
  const batch: Stk[] = feature ? [feature] : []
  const fresh = STICKER_ART.filter((a) => !exclude.has(a.id))
  while (batch.length < PICK_OPTIONS) {
    const from = (fresh.length >= PICK_OPTIONS ? fresh : STICKER_ART).filter((a) => !batch.some((b) => b.art === a.id))
    const art = weighted(from, (a) => w[a.cat], rnd).id
    batch.push({ art, seed: seedFor(art, batch, rnd) })
  }
  // 打亂位置（Fisher–Yates）
  for (let i = batch.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[batch[i], batch[j]] = [batch[j], batch[i]]
  }
  return batch
}
