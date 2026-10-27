// App 層的防護：真正的鎖是 Android 的「螢幕固定＋PIN」，這裡負責擋掉誤觸
import { currentRoute, go } from './nav'

let wakeLock: { release: () => Promise<void> } | null = null

export function installGuards() {
  history.pushState({ trap: 1 }, '')
  window.addEventListener('popstate', () => {
    // 返回手勢一律吃掉；家長區例外，返回就回首頁
    history.pushState({ trap: 1 }, '')
    if (currentRoute().name === 'parent') go({ name: 'home' })
  })
  window.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('gesturestart', (e) => e.preventDefault())
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault()
    },
    { passive: false },
  )
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wakeLock === null) void keepAwake()
  })
}

// 分頁用 requestFullscreen 進全螢幕時 Chrome 也會符合 display-mode: fullscreen，要排除掉
export const isStandalone = () =>
  !document.fullscreenElement &&
  (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches)

export async function enterFullscreen() {
  if (isStandalone() || document.fullscreenElement) return
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape')
  } catch {
    /* 瀏覽器不允許時就算了，螢幕固定仍然有效 */
  }
}

export async function keepAwake() {
  try {
    const wl = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void>; addEventListener: (e: string, f: () => void) => void }> } }).wakeLock?.request('screen')
    if (!wl) return
    wakeLock = wl
    wl.addEventListener('release', () => (wakeLock = null))
  } catch {
    wakeLock = null
  }
}
