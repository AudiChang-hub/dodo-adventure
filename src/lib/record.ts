import { db, today, uid, type Attempt } from './db'
import { sessionId } from './session'
import { recordSkill } from './adaptive'
import { requestSync } from './sync'

export type AttemptInput = Omit<Attempt, 'id' | 'ts' | 'date' | 'sessionId' | 'synced'>

/** 每一題都寫一筆紀錄，同時更新該技能的熟練度 */
export async function logAttempt(a: AttemptInput) {
  recordSkill(a.skill, a.firstTryCorrect)
  await db.attempts.put({ ...a, id: uid(), ts: Date.now(), date: today(), sessionId: sessionId(), synced: 0 })
  requestSync()
}
