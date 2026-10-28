import { PRAISE_COUNT, RETRY_COUNT, type Speaker } from '../content/lines'
import { rand } from '../lib/random'
import { cheer } from '../lib/achievements'

/** 答對的稱讚。同時讓進度列飛一顆星星；剛才是錯了又自己改對的，換成「自己改好了」 */
export function praiseKey(host: Speaker, english = false): string {
  const fixed = cheer(host)
  if (fixed) return fixed
  if (english && Math.random() < 0.5) return `praise.en.${rand(5)}`
  return `praise.${host}.${rand(PRAISE_COUNT)}`
}

export const retryKey = (host: Speaker) => `retry.${host}.${rand(RETRY_COUNT)}`

export const challengeKey = (host: Speaker) => (host === 'dodo' ? 'challenge' : `challenge.${host}`)

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
