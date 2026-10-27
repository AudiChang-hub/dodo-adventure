// 安裝成 App：攔下 Chrome 的安裝提示，只在家長區才拿出來用
import { useSyncExternalStore } from 'react'
import { isStandalone } from './lock'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const KEY = 'dodo.installed'

const remembered = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const remember = (v: boolean) => {
  try {
    if (v) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* 私密模式存不了就算了 */
  }
}

export type InstallState = {
  /** 現在是從主畫面圖示開的 */
  standalone: boolean
  /** 這台已經裝過（可能此刻是用瀏覽器分頁開的） */
  installed: boolean
  /** 瀏覽器給了安裝提示，按鈕可以直接叫出安裝視窗 */
  canPrompt: boolean
}

let deferred: InstallPromptEvent | null = null
let state: InstallState = { standalone: false, installed: false, canPrompt: false }
const subs = new Set<() => void>()

function set(p: Partial<InstallState>) {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}

/** 要在畫面出來之前呼叫，beforeinstallprompt 可能很早就觸發 */
export function installPromptCapture() {
  const standalone = isStandalone()
  if (standalone) remember(true)
  state = { standalone, installed: standalone || remembered(), canPrompt: false }

  window.addEventListener('beforeinstallprompt', (e) => {
    // 擋掉 Chrome 自己跳出的安裝列，免得孩子誤觸
    e.preventDefault()
    deferred = e as InstallPromptEvent
    // 會收到這個事件就代表還沒安裝（之前裝過又移除了也算）
    remember(false)
    set({ canPrompt: true, installed: false })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    remember(true)
    set({ canPrompt: false, installed: true })
  })
  for (const mode of ['fullscreen', 'standalone']) {
    matchMedia(`(display-mode: ${mode})`).addEventListener('change', () => {
      const s = isStandalone()
      if (s) remember(true)
      set({ standalone: s, installed: s || state.installed })
    })
  }
}

/** 叫出 Chrome 的安裝視窗；回傳家長有沒有按下安裝 */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  deferred = null
  set({ canPrompt: false })
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome === 'accepted'
}

export function useInstall(): InstallState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
