import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadSettings } from './lib/settings'
import { loadAdaptive } from './lib/adaptive'
import { loadWords, loadZhAudio } from './lib/words'
import { loadAchievements } from './lib/achievements'
import { startSession } from './lib/session'
import { installGuards } from './lib/lock'
import { installFirstGesture } from './lib/boot'
import { initSync } from './lib/sync'
import { installPromptCapture } from './lib/install'
import { initUpdates } from './lib/update'
import { initAudioCache } from './lib/audio-cache'
import { BootSignal, ErrorBoundary } from './ui/ErrorBoundary'
import './styles/global.css'
import './ui/ui.css'
import './screens/screens.css'

installPromptCapture()
initUpdates()
// 開發模式沒有 audio/files.json，也沒有 Service Worker
if (!import.meta.env.DEV) initAudioCache()
if (import.meta.env.DEV) import('./lib/nav').then((m) => Object.assign(window, { __go: m.go }))
installGuards()
installFirstGesture()

// 成就（貼紙本）要在熟練度載入之後：第一次會把已經熟的技能補成貼紙
// 失敗時交給 index.html 顯示給家長看的說明；卡住不動時那邊也會逾時處理，不會一片白
Promise.all([loadSettings(), loadAdaptive().then(loadAchievements), loadWords(), loadZhAudio()])
  .then(async () => {
    await startSession()
    // 同步失敗會寫進同步狀態給家長區顯示，這裡不必再往外丟
    initSync()?.catch(() => {})
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
          <BootSignal />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
  .catch((err) => window.__dodoBoot?.fail(err, '讀取學習紀錄失敗'))
