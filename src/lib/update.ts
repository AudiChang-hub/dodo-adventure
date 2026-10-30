// App 更新：背景下載新版，等孩子不在遊戲裡、也沒在操作時才重新載入
import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { currentRoute, RESUME_KEY, type Route } from './nav'
import { isBreakDue } from './session'

export const APP_VERSION = __APP_VERSION__
export const BUILD_TIME = __BUILD_TIME__

const CHECK_EVERY = 30 * 60 * 1000
/** 最後一次點擊後要安靜這麼久才更新，避免剛按下「出發」、轉場還在首頁時被重新載入 */
const IDLE_MS = 5000
/** 送出「換新版」後最多等這麼久，新版還沒接手就自己重新載入 */
const APPLY_TIMEOUT = 10 * 1000

/** 這些畫面重新載入不會打斷題目；載入後回到同一個畫面 */
const SAFE: Route['name'][] = ['home', 'map', 'collection', 'parent']

/** 等 Service Worker 回應最多這麼久：舊版的大型 precache 還在下載時，register() 會一直排隊不回來（T-54） */
const SW_WAIT = 4000

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'latest' | 'ready' | 'applying' | 'offline' | 'error' | 'stuck' | 'unsupported'

let status: UpdateStatus = 'serviceWorker' in navigator ? 'idle' : 'unsupported'
let lastCheck = 0
let reg: ServiceWorkerRegistration | undefined
let applySW: (() => Promise<void>) | undefined
let lastTouch = Date.now()
let waitTimer = 0
const subs = new Set<() => void>()

function setStatus(s: UpdateStatus) {
  status = s
  subs.forEach((f) => f())
}

const isSafe = () => SAFE.includes(currentRoute().name) && !isBreakDue()

function tryApply() {
  clearTimeout(waitTimer)
  if (status !== 'ready' || !applySW) return
  const quiet = Date.now() - lastTouch
  // 在背景時重新載入孩子看不到，不必等安靜；但遊戲中就算在背景也不動，回來才不會題目不見
  if (!isSafe() || (!document.hidden && quiet < IDLE_MS)) {
    waitTimer = window.setTimeout(tryApply, Math.max(IDLE_MS - quiet, 2000))
    return
  }
  try {
    sessionStorage.setItem(RESUME_KEY, currentRoute().name)
  } catch {
    /* 存不了就回首頁 */
  }
  setStatus('applying')
  window.__dodoBoot?.log(`套用新版（${document.hidden ? '背景' : '前景'}，畫面 ${currentRoute().name}）`)
  void applySW()
  // 正常情況新版接手後會立刻重新載入。等不到（等待中的新版已被別的分頁啟用、訊息沒送到、SW 卡住）
  // 就自己重新載入：不管這時是新版還是舊版在控制，整頁都會是同一版的檔案，不會停在半新半舊的狀態
  window.setTimeout(() => {
    window.__dodoBoot?.log('新版沒有接手，強制重新載入')
    location.reload()
  }, APPLY_TIMEOUT)
}

const within = <T,>(p: Promise<T>, ms: number): Promise<T | 'timeout'> =>
  Promise.race([p, new Promise<'timeout'>((r) => window.setTimeout(() => r('timeout'), ms))])

/** registerSW 的 onRegisteredSW 可能一直沒回來（register() 排在舊的安裝後面），改直接問瀏覽器 */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (reg) return reg
  const r = await within(navigator.serviceWorker.getRegistration(), SW_WAIT).catch(() => undefined)
  if (r && r !== 'timeout') reg = r
  return reg
}

/** 正在下載的新版：裝好了（waiting）就等孩子不在遊戲裡再換；失敗就標示出來 */
function watchInstalling(sw: ServiceWorker) {
  setStatus('downloading')
  window.__dodoBoot?.log('正在下載新版')
  sw.addEventListener('statechange', () => {
    if (sw.state === 'installed' && reg?.waiting) {
      setStatus('ready')
      tryApply()
    } else if (sw.state === 'redundant' && status === 'downloading') {
      window.__dodoBoot?.log('新版下載失敗')
      setStatus('error')
    }
  })
}

export async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) return
  if (!navigator.onLine) return setStatus(status === 'ready' ? 'ready' : 'offline')
  if (status === 'ready' || status === 'applying') return tryApply()
  lastCheck = Date.now()
  setStatus('checking')
  const r = await registration()
  if (!r) {
    // 連註冊資料都拿不到：Service Worker 卡住了，請家長用「強制更新」
    window.__dodoBoot?.log('檢查更新：Service Worker 沒有回應')
    return setStatus('stuck')
  }
  if (r.waiting) {
    setStatus('ready')
    return tryApply()
  }
  try {
    const res = await within(r.update(), 15_000)
    // 有新版時 workbox 會在安裝完成後呼叫 onNeedRefresh，那邊會把狀態改成 ready
    if (r.waiting) {
      setStatus('ready')
      tryApply()
    } else if (r.installing) watchInstalling(r.installing)
    else if (res === 'timeout') setStatus('stuck')
    else setStatus('latest')
  } catch (e) {
    window.__dodoBoot?.log(`檢查更新失敗：${String(e)}`)
    setStatus('error')
  }
}

/**
 * 強制更新（家長區）：解除 Service Worker、刪掉程式的快取後重新載入，直接從網路拿最新版。
 * 學習紀錄（IndexedDB）、家長設定（localStorage）、已經下載的語音（dodo-audio）都不動。
 */
export async function forceUpdate() {
  setStatus('applying')
  window.__dodoBoot?.log('家長按了強制更新')
  try {
    sessionStorage.setItem(RESUME_KEY, currentRoute().name)
  } catch {
    /* 存不了就回首頁 */
  }
  const jobs: Promise<unknown>[] = []
  if ('serviceWorker' in navigator)
    jobs.push(navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))))
  if ('caches' in window) jobs.push(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== 'dodo-audio').map((k) => caches.delete(k)))))
  // Service Worker 卡住時 unregister 可能一直不回來：最多等 5 秒
  await within(Promise.all(jobs), 5000).catch(() => undefined)
  location.reload()
}

export function initUpdates() {
  if (!('serviceWorker' in navigator)) return
  applySW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setStatus('ready')
      tryApply()
    },
    onRegisteredSW(_url, r) {
      reg = r
      // 打開 App 時新版已經在下載（或已經下載好在等）：家長區看得到進度
      if (r?.waiting) setStatus('ready')
      else if (r?.installing) watchInstalling(r.installing)
    },
    onRegisterError() {
      setStatus('error')
    },
  })

  // 放開也算：按住 3 秒回首頁時，從放手才開始算安靜
  for (const ev of ['pointerdown', 'pointerup']) window.addEventListener(ev, () => (lastTouch = Date.now()), { capture: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return tryApply()
    // 回到前景：距離上次檢查超過一分鐘才再查，切來切去不會一直打網路
    if (Date.now() - lastCheck > 60 * 1000) void checkForUpdate()
  })
  window.setInterval(() => void checkForUpdate(), CHECK_EVERY)
}

export function useUpdateStatus(): UpdateStatus {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => status,
  )
}
