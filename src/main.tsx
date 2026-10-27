import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadSettings } from './lib/settings'
import { loadAdaptive } from './lib/adaptive'
import { startSession } from './lib/session'
import { installGuards } from './lib/lock'
import { installFirstGesture } from './lib/boot'
import { initSync } from './lib/sync'
import { installPromptCapture } from './lib/install'
import { initUpdates } from './lib/update'
import './styles/global.css'
import './ui/ui.css'
import './screens/screens.css'

installPromptCapture()
initUpdates()
if (import.meta.env.DEV) import('./lib/nav').then((m) => Object.assign(window, { __go: m.go }))
installGuards()
installFirstGesture()

Promise.all([loadSettings(), loadAdaptive()]).then(async () => {
  await startSession()
  void initSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
