// App 層的防護：真正的鎖是 Android 的「螢幕固定＋PIN」，這裡負責擋掉誤觸
import { back } from './nav'

let wakeLock: { release: () => Promise<void> } | null = null

export function installGuards() {
  history.pushState({ trap: 1 }, '')
  window.addEventListener('popstate', () => {
    // 返回手勢不離開 App（瀏覽器的上一頁一律補回去），只回 App 裡的上一層，跟畫面上的返回鍵一樣：
    // 遊戲 → 站點 → 地圖 → 首頁；首頁、睡覺畫面就停住。連續的返回手勢也只回一層（nav.ts 的 back）
    history.pushState({ trap: 1 }, '')
    back()
  })
  window.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('gesturestart', (e) => e.preventDefault())
  document.addEventListener(
    'touchmove',
    (e) => {
      // 已經被瀏覽器當成捲動接走的（cancelable=false）擋不了，硬擋只會在主控台留警告（B13）
      if (e.touches.length > 1 && e.cancelable) e.preventDefault()
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
