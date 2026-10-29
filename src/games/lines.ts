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
