import { PRAISE_COUNT, RETRY_COUNT, type Speaker } from '../content/lines'
import { rand } from '../lib/random'

export function praiseKey(host: Speaker, english = false): string {
  if (english && Math.random() < 0.5) return `praise.en.${rand(5)}`
  return `praise.${host}.${rand(PRAISE_COUNT)}`
}

export const retryKey = (host: Speaker) => `retry.${host}.${rand(RETRY_COUNT)}`

export const challengeKey = (host: Speaker) => (host === 'dodo' ? 'challenge' : `challenge.${host}`)

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
