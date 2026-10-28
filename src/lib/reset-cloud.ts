/**
 * 重置學習進度：刪掉 Firestore 上 users/{uid} 底下的學習資料。
 * 只用到 firebase/firestore 的幾個函式，用參數傳進來，單元測試可以換成假的（不必真的連 Firebase）。
 *
 * 雲端的資料長這樣（lib/sync.ts 的 syncNow）：
 * - users/{uid}/attempts/{id}   作答紀錄
 * - users/{uid}/sessions/{id}   每次遊玩
 * - users/{uid}/drawings/{id}   畫畫作品（家長勾選保留時不刪）
 * - users/{uid}/meta/state      熟練度、難度、朋友、成就，和家長設定的備份；下次同步會用重置後的資料重新寫一份
 */

/** 用到的 firebase/firestore 函式（形狀和官方的一樣，參數放寬成 unknown） */
export interface WipeFs {
  collection(store: unknown, path: string, ...segments: string[]): unknown
  doc(store: unknown, path: string, ...segments: string[]): unknown
  query(q: unknown, ...constraints: unknown[]): unknown
  limit(n: number): unknown
  /** 一定要問伺服器：一般的 getDocs 離線時可能回傳本機快取（空的），會誤以為已經刪完 */
  getDocsFromServer(q: unknown): Promise<{ docs: { ref: unknown }[] }>
  writeBatch(store: unknown): { delete(ref: unknown): unknown; commit(): Promise<void> }
}

/** Firestore 一個 batch 最多 500 筆寫入 */
export const BATCH_MAX = 500
/** 保險：一個集合最多刪這麼多批（50 萬筆），避免刪除沒生效時無限迴圈 */
const MAX_ROUNDS = 1000
/** 一次讀取或寫入等這麼久還沒回應就放棄（離線時 Firestore 的寫入會一直等，不會自己失敗） */
const STEP_TIMEOUT_MS = 30_000

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, no) => {
      t = setTimeout(() => no(new Error('網路太慢，雲端沒有回應，請確認網路後再試一次')), ms)
    }),
  ])
}

export const cloudCollections = (keepDrawings: boolean) => ['attempts', 'sessions', ...(keepDrawings ? [] : ['drawings'])]

export interface WipeResult {
  /** 每個集合刪了幾筆 */
  deleted: Record<string, number>
  /** 用了幾個 batch */
  batches: number
}

/**
 * 一批一批（每批 ≤ 500）刪掉學習資料。任何一批失敗就丟出錯誤，已經刪掉的不會回來，
 * 再按一次重置會從剩下的接著刪（刪除可以重複做）。
 */
export async function wipeCloudLearning(
  fs: WipeFs,
  store: unknown,
  uid: string,
  opts: { keepDrawings: boolean; batchSize?: number; timeoutMs?: number },
): Promise<WipeResult> {
  const wait = opts.timeoutMs ?? STEP_TIMEOUT_MS
  const size = Math.min(BATCH_MAX, Math.max(1, opts.batchSize ?? BATCH_MAX))
  const result: WipeResult = { deleted: {}, batches: 0 }
  for (const name of cloudCollections(opts.keepDrawings)) {
    result.deleted[name] = 0
    for (let round = 0; ; round++) {
      if (round >= MAX_ROUNDS) throw new Error(`雲端的 ${name} 刪不完，請稍後再試一次`)
      const snap = await timeout(fs.getDocsFromServer(fs.query(fs.collection(store, 'users', uid, name), fs.limit(size))), wait)
      if (!snap.docs.length) break
      const batch = fs.writeBatch(store)
      for (const d of snap.docs) batch.delete(d.ref)
      await timeout(batch.commit(), wait)
      result.batches++
      result.deleted[name] += snap.docs.length
      // 不滿一批代表已經是最後一批，省一次讀取
      if (snap.docs.length < size) break
    }
  }
  const meta = fs.writeBatch(store)
  meta.delete(fs.doc(store, 'users', uid, 'meta', 'state'))
  await timeout(meta.commit(), wait)
  result.batches++
  result.deleted.meta = 1
  return result
}
