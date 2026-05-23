import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppProvider } from './context/AppContext'

// iOS PWA fix: the browser doesn't always poll for a new SW on launch from the
// home screen. Force a check every time the app becomes visible (e.g. user
// switches back to it). When a new SW takes control, notify the app to show
// an "update ready" banner so the user can reload at their own pace.
if ('serviceWorker' in navigator) {
  // Capture whether a SW was already controlling this page at load time.
  // controllerchange fires both on fresh install (no previous controller) and
  // on update (previous controller existed). We only want to show the banner
  // for updates, not for the very first install.
  const hadController = !!navigator.serviceWorker.controller

  navigator.serviceWorker.ready
    .then(reg => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    })
    .catch(() => {})

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return  // fresh install — no banner needed
    const update = () => window.location.reload()
    // Store for race condition: event may fire before React mounts its listener
    ;(window as unknown as Record<string, unknown>).__swPendingUpdate = update
    window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: { update } }))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
)
