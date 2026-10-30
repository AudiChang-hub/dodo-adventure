import { PRAISE_COUNT, RETRY_COUNT, type Speaker } from '../content/lines'
import { rand } from '../lib/random'
import { cheer, roundGame } from '../lib/achievements'
import { GAME_DID } from '../content/lines-praise'

/** 過程型稱讚的比例（T-49 FB-3：至少一半說出孩子做了什麼） */
const DID_SHARE = 0.6

/**
 * 答對的稱讚。同時讓進度列飛一顆星星；剛才是錯了又自己改對的，換成「自己改好了」。
 * 其餘六成說孩子剛剛做了什麼（You counted them all!，lines-praise.ts），四成是 Yes!。
 */
export function praiseKey(host: Speaker, english = false): string {
  const fixed = cheer(host)
  if (fixed) return fixed
  const did = GAME_DID[roundGame() ?? '']
  if (did && Math.random() < DID_SHARE) return `praise.did.${did}.${host}`
  if (english && Math.random() < 0.5) return `praise.en.${rand(5)}`
  return `praise.${host}.${rand(PRAISE_COUNT)}`
}

export const retryKey = (host: Speaker) => `retry.${host}.${rand(RETRY_COUNT)}`

export const challengeKey = (host: Speaker) => (host === 'dodo' ? 'challenge' : `challenge.${host}`)

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 等 p，但最多等 ms：逾時或失敗都回傳 fallback。
 * 給「完成」流程裡不能卡住的那幾步用（存縮圖、存作品、說話）：哪一步出錯或剛從背景切回來時一直等不到，遊戲仍然收尾。
 */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.warn(`within：等了 ${ms} ms 還沒好，先往下走`)
      resolve(fallback)
    }, ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        console.warn(e)
        resolve(fallback)
      },
    )
  })
}
