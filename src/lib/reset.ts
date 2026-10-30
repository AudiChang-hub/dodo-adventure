// 重置學習進度（家長區「設定與同步」）：清掉家長測試留下的學習狀態，回到「第一次玩、從頭教」
import { db } from './db'
import { RESUME_KEY } from './nav'
import { startSession, stopSession } from './session'
import { wipeCloud } from './sync'
import { UNKNOWN_KV } from './words'
import { GROWTH_KV, PROFILE_KV } from './growth'

/**
 * kv 裡要保留的 key，其他全部清掉。
 * 用「留下名單」而不是「刪除名單」：學習引擎、成就、冒險之後新增的學習狀態 key 不必回來改這裡也會被清乾淨。
 * 要新增「不是學習狀態」的 kv key（家長設定、裝置狀態）時，記得加進來。
 *
 * 目前 kv 的 key（2026-10-28 逐一讀過 src/ 裡每個 getKV／setKV）：
 * - 保留：settings（家長設定：每日時間、站數、自由探索、本週主題、音量、護眼間隔、夜間暖色、著色幫忙不塗出線）、
 *   words:unknown（家長在「單字清單」勾的「他不認得」）、
 *   profile（生日年月）、growth（家長的年段覆寫、支線鎖定，和照生日算的年段、跨段放寬；都跟學習紀錄無關）
 * - 清掉（成長系統 v3）：story（故事進度）、houseSeen（魔法屋上次看到幾樣東西）；growthLog、chapters 兩張表整張清掉
 * - 清掉（成長系統 G-2）：ladder（每條支線在第幾階、回補）、engine:transfer（遷移：哪些遊戲第一次就答對過）
 * - 清掉（新增）：words:taught（哪些字在教學卡上教過，lib/words.ts）
 * - 清掉：engine:concepts（每週新概念額度）、engine:loadDrop（負擔控制降級日）、achieve（里程碑／貼紙／貼紙本看過）、
 *   plan:{日期}（今日冒險進度、主題輪替紀錄）、coplay:{日期}（舊版爸爸回合次數，2026-10-29 拿掉了，舊資料可能還有）、usage:{日期}（今天已玩時間）、
 *   outing.ticks（出門任務卡勾選）、outing.recall（回到 App 的回想題紀錄）、phonics:migrated（舊字母熟練度的一次性換算）、
 *   cues:seen（比較題的題目徽章教過了沒）
 */
export const KEEP_KV = new Set(['settings', UNKNOWN_KV, PROFILE_KV, GROWTH_KV])

/** 只存在這次分頁：重置後重新載入，家長區顯示「已重置」 */
export const RESET_DONE_KEY = 'dodo.resetDone'

export interface ResetCounts {
  attempts: number
  sessions: number
  skills: number
  friends: number
  drawings: number
  kv: number
}

/** 確認卡片上的數字：這台裝置現在有多少會被清掉的資料 */
export async function resetCounts(): Promise<ResetCounts> {
  const [attempts, sessions, skills, friends, drawings, keys] = await Promise.all([
    db.attempts.count(),
    db.sessions.count(),
    db.skills.count(),
    db.friends.count(),
    db.drawings.count(),
    db.kv.toCollection().primaryKeys(),
  ])
  return { attempts, sessions, skills, friends, drawings, kv: keys.filter((k) => !KEEP_KV.has(k)).length }
}

export type ResetStep = 'cloud' | 'local' | 'reload'

/** 清掉這台裝置的學習資料（一個交易：要嘛全清、要嘛都不動） */
export async function wipeLocal(opts: { keepDrawings: boolean }) {
  const tables = [db.attempts, db.sessions, db.skills, db.levels, db.friends, db.growthLog, db.chapters, db.kv, ...(opts.keepDrawings ? [] : [db.drawings])]
  await db.transaction('rw', tables, async () => {
    await Promise.all([
      db.attempts.clear(),
      db.sessions.clear(),
      db.skills.clear(),
      db.levels.clear(),
      db.friends.clear(),
      db.growthLog.clear(),
      db.chapters.clear(),
      ...(opts.keepDrawings ? [] : [db.drawings.clear()]),
    ])
    const keys = await db.kv.toCollection().primaryKeys()
    await db.kv.bulkDelete(keys.filter((k) => !KEEP_KV.has(k)))
  })
}

/**
 * 整個重置流程：停止計時 → 刪雲端（有登入時；要有網路）→ 清這台裝置 → 重新載入。
 * 先刪雲端再清本機：雲端失敗就什麼都不動，家長可以連上網路再試；本機清掉之後才不會有「雲端還在、本機已空」卡一半的狀態。
 * 重新載入才能讓學習引擎（adaptive.ts）、成就、計時這些模組裡的快取回到空的。
 */
export async function resetLearning(opts: { keepDrawings: boolean; onStep?: (s: ResetStep) => void }) {
  await stopSession()
  try {
    opts.onStep?.('cloud')
    await wipeCloud(opts)
    opts.onStep?.('local')
    await wipeLocal(opts)
  } catch (e) {
    await startSession()
    throw e
  }
  opts.onStep?.('reload')
  try {
    sessionStorage.setItem(RESUME_KEY, 'parent')
    sessionStorage.setItem(RESET_DONE_KEY, String(Date.now()))
  } catch {
    /* 存不了就回首頁 */
  }
  location.reload()
}
