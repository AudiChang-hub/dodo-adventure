import { useSyncExternalStore } from 'react'
import { db, type Attempt, type Chapter, type Drawing, type GrowthLogEntry, type Session } from './db'
import { env } from './env'
import { achieveForSync, type CardProgress, type Milestone } from './achievements'
import { wipeCloudLearning, type WipeFs, type WipeResult } from './reset-cloud'
import { UNKNOWN_KV } from './words'
import { growthForSync, type GrowthState, type Profile } from './growth'
import { mergeVerdicts, type Verdict } from './review'

const cfg = {
  apiKey: env('VITE_FIREBASE_API_KEY'),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: env('VITE_FIREBASE_PROJECT_ID'),
  appId: env('VITE_FIREBASE_APP_ID'),
}

export const syncConfigured = Boolean(cfg.apiKey && cfg.projectId)

export interface SyncState {
  status: 'off' | 'loading' | 'signedOut' | 'idle' | 'syncing' | 'error'
  user?: { uid: string; name: string; email: string }
  last?: number
  error?: string
}

let state: SyncState = { status: syncConfigured ? 'loading' : 'off' }
const subs = new Set<() => void>()
const set = (p: Partial<SyncState>) => {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}

export function useSync(): SyncState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}

type FB = Awaited<ReturnType<typeof boot>>
let fb: Promise<FB> | null = null

// Firebase 很大，等真的需要時才載入，不拖慢孩子端的開機
async function boot() {
  const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
  const app = initializeApp(cfg)
  const a = auth.getAuth(app)
  await auth.setPersistence(a, auth.browserLocalPersistence)
  const store = fs.getFirestore(app)
  auth.onAuthStateChanged(a, (u) => {
    if (u) {
      set({ status: 'idle', user: { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '' } })
      requestSync()
    } else set({ status: 'signedOut', user: undefined })
  })
  return { a, auth, store, fs }
}

export function initSync() {
  if (syncConfigured && !fb) fb = boot().catch((e) => { set({ status: 'error', error: String(e) }); throw e })
  return fb
}

export async function signIn() {
  const f = await initSync()
  if (!f) return
  const provider = new f.auth.GoogleAuthProvider()
  try {
    await f.auth.signInWithPopup(f.a, provider)
  } catch (e) {
    // 從主畫面圖示開啟（全螢幕 PWA）時，有些裝置不允許彈出視窗，改用整頁跳轉登入
    const code = (e as { code?: string }).code ?? ''
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) return f.auth.signInWithRedirect(f.a, provider)
    set({ status: 'error', error: friendly(e) })
  }
}

export async function signOut() {
  const f = await initSync()
  if (f) await f.auth.signOut(f.a)
}

function friendly(e: unknown): string {
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('popup-closed')) return '登入視窗被關掉了，請再試一次。'
  if (code.includes('unauthorized-domain')) return '這個網址還沒加進 Firebase 的授權網域。'
  if (code.includes('network')) return '網路好像斷了，連上網路後再試一次。'
  return String((e as Error).message ?? e)
}

let timer = 0
/** 重置學習進度時暫停同步：不再上傳，直到重新載入 App */
let paused = false
/** 正在跑的上傳，重置前要等它結束 */
let running: Promise<void> | null = null

export function requestSync() {
  if (!syncConfigured || paused) return
  clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), 4000)
}

const strip = <T extends { synced: 0 | 1 }>(r: T) => {
  const { synced: _s, ...rest } = r
  return rest
}

/** 把還沒上傳的紀錄批次寫到 users/{uid}/... */
export function syncNow(): Promise<void> {
  if (paused) return Promise.resolve()
  return (running ??= upload().finally(() => (running = null)))
}

async function upload() {
  const f = await initSync()
  if (!f || !state.user || !navigator.onLine || state.status === 'syncing') return
  const uid = state.user.uid
  set({ status: 'syncing', error: undefined })
  try {
    const { fs, store } = f
    const tables = [
      ['attempts', db.attempts],
      ['sessions', db.sessions],
      ['drawings', db.drawings],
      // 成長系統（v3）：時間軸、故事章節
      ['growthLog', db.growthLog],
      ['chapters', db.chapters],
    ] as const
    for (const [name, table] of tables) {
      const rows = (await (table as typeof db.attempts).where('synced').equals(0).toArray()) as unknown as (Attempt | Session | Drawing | GrowthLogEntry | Chapter)[]
      for (let i = 0; i < rows.length; i += 400) {
        const chunk = rows.slice(i, i + 400)
        const batch = fs.writeBatch(store)
        for (const r of chunk) {
          const data = strip(r) as Record<string, unknown>
          if (name === 'drawings' && typeof data.strokes === 'string' && data.strokes.length > 600_000) data.strokes = ''
          batch.set(fs.doc(store, 'users', uid, name, r.id), data)
        }
        await batch.commit()
        await (table as typeof db.attempts).bulkUpdate(chunk.map((r) => ({ key: r.id, changes: { synced: 1 as const } })))
      }
    }
    const [skills, levels, friends, settings, unknown, story] = await Promise.all([
      db.skills.toArray(),
      db.levels.toArray(),
      db.friends.toArray(),
      db.kv.get('settings'),
      db.kv.get(UNKNOWN_KV),
      db.kv.get('story'),
    ])
    // unknownWords：家長在「單字清單」勾的「他不認得」（家長設定，跟 settings 一樣備份；重置學習進度時本機保留，下次同步再寫回來）
    // profile（生日年月）、growth（年段覆寫、跨段放寬）、story（故事進度）：成長系統 §5.2。
    // 生日只放在這個私人文件裡，firestore.rules 只允許本人讀寫 users/{uid}
    await fs.setDoc(fs.doc(store, 'users', uid, 'meta', 'state'), {
      skills,
      levels,
      friends,
      settings: settings?.value ?? null,
      unknownWords: unknown?.value ?? {},
      achieve: achieveForSync(),
      ...growthForSync(),
      story: story?.value ?? null,
      updated: Date.now(),
    })
    // 故事審稿：家長可能在手機上審，平板每次同步時把決定讀回來
    await reviewRoundTrip(f, uid)
    set({ status: 'idle', last: Date.now() })
  } catch (e) {
    set({ status: 'error', error: friendly(e) })
  }
}

/**
 * 故事審稿的決定（lib/review.ts）：讀雲端的 users/{uid}/meta/review，和這台的合併（同一章以比較晚的為準），再寫回去。
 * 兩台裝置都這樣做，最後會一樣。這份文件只有審稿的決定，不碰 meta/state 的學習資料（手機上審稿不會蓋掉平板的進度）。
 */
async function reviewRoundTrip(f: FB, uid: string) {
  const { fs, store } = f
  const ref = fs.doc(store, 'users', uid, 'meta', 'review')
  const snap = await fs.getDoc(ref)
  const merged = await mergeVerdicts(snap.data()?.verdicts as Record<string, Verdict> | undefined)
  if (JSON.stringify(merged) !== JSON.stringify(snap.data()?.verdicts ?? {})) await fs.setDoc(ref, { verdicts: merged, updated: Date.now() })
}

/** 審稿頁打開、家長按了通過或退回：只同步審稿的決定（沒登入、沒網路就略過，決定還在這台裝置上） */
export async function syncReview(): Promise<boolean> {
  if (!syncConfigured || !state.user || !navigator.onLine) return false
  const f = await initSync()
  if (!f || !state.user) return false
  try {
    await reviewRoundTrip(f, state.user.uid)
    return true
  } catch {
    return false
  }
}

/**
 * 重置學習進度（家長區「設定與同步」）：先停掉同步、等正在上傳的批次結束，再刪掉雲端的學習資料。
 * 成功之後同步維持暫停，由呼叫的人清掉這台裝置的資料、重新載入 App；失敗會恢復同步，讓家長可以再試一次。
 * 沒登入（或沒設定 Firebase）回傳 null，不碰雲端。
 */
export async function wipeCloud(opts: { keepDrawings: boolean }): Promise<WipeResult | null> {
  // 沒登入就不必載入 Firebase（載入失敗也不該擋住只清本機的重置）
  if (!state.user) return null
  const f = await initSync()
  if (!f || !state.user) return null
  if (!navigator.onLine) throw new Error('目前沒有網路，請連上網路再重置。')
  paused = true
  clearTimeout(timer)
  try {
    await running
    return await wipeCloudLearning(f.fs as unknown as WipeFs, f.store, state.user.uid, opts)
  } catch (e) {
    paused = false
    throw new Error(friendly(e))
  }
}

export interface CloudBundle {
  attempts: Attempt[]
  sessions: Session[]
  drawings: Drawing[]
  skills: { key: string; box: number; seen: number; firstTry: number }[]
  /** 成就感強化的里程碑（家長區「今日亮點」） */
  milestones: Milestone[]
  /** 貼紙卡的進度（v2 之前上傳的資料沒有） */
  card: CardProgress | null
  /** 家長勾的「他不認得」：字 → 勾選時間（舊資料沒有） */
  unknownWords: Record<string, number>
  /** 成長系統：生日年月、年段狀態（v3 之前上傳的資料沒有） */
  profile: Profile | null
  growth: GrowthState | null
}

/** 家長用手機看報告時，從雲端讀回資料 */
export async function fetchCloud(): Promise<CloudBundle | null> {
  const f = await initSync()
  if (!f || !state.user) return null
  const { fs, store } = f
  const uid = state.user.uid
  const col = (n: string, max: number) =>
    fs.getDocs(fs.query(fs.collection(store, 'users', uid, n), fs.orderBy(n === 'sessions' ? 'start' : 'ts', 'desc'), fs.limit(max)))
  const [a, s, d, meta] = await Promise.all([col('attempts', 8000), col('sessions', 400), col('drawings', 80), fs.getDoc(fs.doc(store, 'users', uid, 'meta', 'state'))])
  const rows = <T,>(snap: { docs: { data: () => unknown }[] }) => snap.docs.map((x) => ({ ...(x.data() as object), synced: 1 }) as T)
  return {
    attempts: rows<Attempt>(a),
    sessions: rows<Session>(s),
    drawings: rows<Drawing>(d),
    skills: (meta.data()?.skills as CloudBundle['skills']) ?? [],
    milestones: (meta.data()?.achieve?.log as Milestone[]) ?? [],
    card: (meta.data()?.achieve?.card as CardProgress | undefined) ?? null,
    unknownWords: (meta.data()?.unknownWords as Record<string, number> | undefined) ?? {},
    profile: (meta.data()?.profile as Profile | undefined) ?? null,
    growth: (meta.data()?.growth as GrowthState | undefined) ?? null,
  }
}

window.addEventListener('online', () => requestSync())
