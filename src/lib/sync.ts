import { useSyncExternalStore } from 'react'
import { db, type Attempt, type Drawing, type Session } from './db'
import { env } from './env'

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
export function requestSync() {
  if (!syncConfigured) return
  clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), 4000)
}

const strip = <T extends { synced: 0 | 1 }>(r: T) => {
  const { synced: _s, ...rest } = r
  return rest
}

/** 把還沒上傳的紀錄批次寫到 users/{uid}/... */
export async function syncNow() {
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
    ] as const
    for (const [name, table] of tables) {
      const rows = (await (table as typeof db.attempts).where('synced').equals(0).toArray()) as unknown as (Attempt | Session | Drawing)[]
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
    const [skills, levels, friends, settings] = await Promise.all([db.skills.toArray(), db.levels.toArray(), db.friends.toArray(), db.kv.get('settings')])
    await fs.setDoc(fs.doc(store, 'users', uid, 'meta', 'state'), { skills, levels, friends, settings: settings?.value ?? null, updated: Date.now() })
    set({ status: 'idle', last: Date.now() })
  } catch (e) {
    set({ status: 'error', error: friendly(e) })
  }
}

export interface CloudBundle {
  attempts: Attempt[]
  sessions: Session[]
  drawings: Drawing[]
  skills: { key: string; box: number; seen: number; firstTry: number }[]
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
  }
}

window.addEventListener('online', () => requestSync())
