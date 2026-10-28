import { db, today, uid, type Attempt, type Phase } from './db'
import { sessionId } from './session'
import { mastered, noteAttempt as noteConcept, recordSkill } from './adaptive'
import { noteAttempt } from './achievements'
import { requestSync } from './sync'

export type AttemptInput = Omit<Attempt, 'id' | 'ts' | 'date' | 'sessionId' | 'synced' | 'phase'> & { phase: Phase }

/**
 * 每一題都寫一筆紀錄。只有「自己答」會更新熟練度；
 * 教學卡與一起練也會留下紀錄（家長區看得到今天教了什麼），但另外標記階段。
 */
export async function logAttempt(a: AttemptInput) {
  const was = mastered(a.skill)
  if (a.phase === 'quiz') recordSkill(a.skill, a.firstTryCorrect, a)
  // 每條主線每週的新概念額度：記下第一次出現的概念（教學卡也算）
  noteConcept(a)
  // 成就感：自己改正、第一次熟練（貼紙）、這一局做了什麼。要在 await 之前，接下來的稱讚才讀得到
  noteAttempt(a, !was && mastered(a.skill))
  await db.attempts.put({ ...a, id: uid(), ts: Date.now(), date: today(), sessionId: sessionId(), synced: 0 })
  requestSync()
}

/** 教學卡、示範的紀錄：沒有對錯，記下孩子看了多久、點了沒 */
export function logTeach(a: Pick<AttemptInput, 'station' | 'game' | 'itemId' | 'skill' | 'level'> & { ms: number; retaught?: boolean }) {
  return logAttempt({
    station: a.station,
    game: a.game,
    itemId: a.itemId,
    skill: a.skill,
    level: a.level,
    phase: 'teach',
    options: [],
    answer: a.itemId,
    taps: [],
    firstTryCorrect: true,
    attempts: 0,
    responseMs: a.ms,
    hintUsed: false,
    ...(a.retaught ? { metrics: { retaught: 1 } } : {}),
  })
}
