import { unlockAudio, setVolume } from './audio'
import { enterFullscreen, keepAwake } from './lock'
import { getSettings } from './settings'

let ready = false
const waiters = new Set<() => void>()

export const audioReady = () => ready

/** 瀏覽器要等使用者第一次點擊才能出聲、全螢幕；之後才能讓恐龍打招呼 */
export function onUnlock(fn: () => void) {
  if (ready) return () => {}
  waiters.add(fn)
  return () => {
    waiters.delete(fn)
  }
}

export function installFirstGesture() {
  const handler = async () => {
    await unlockAudio()
    setVolume(getSettings().volume)
    void enterFullscreen()
    void keepAwake()
    if (ready) return
    ready = true
    waiters.forEach((f) => f())
    waiters.clear()
  }
  window.addEventListener('pointerdown', handler, { capture: true })
}
