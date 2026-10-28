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

export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'ready' | 'applying' | 'offline' | 'error' | 'unsupported'

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

export async function checkForUpdate() {
  if (!reg) return
  if (!navigator.onLine) return setStatus(status === 'ready' ? 'ready' : 'offline')
  if (status === 'ready' || status === 'applying') return tryApply()
  lastCheck = Date.now()
  setStatus('checking')
  try {
    await reg.update()
    // 有新版時 workbox 會在安裝完成後呼叫 onNeedRefresh，那邊會把狀態改成 ready
    const sw = reg.installing
    if (sw) sw.addEventListener('statechange', () => sw.state === 'redundant' && status === 'checking' && setStatus('error'))
    else if (!reg.waiting) setStatus('latest')
  } catch {
    setStatus('error')
  }
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
