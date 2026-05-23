import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppProvider } from './context/AppContext'

;(window as unknown as Record<string, unknown>).__swPendingUpdate = null

// Guard: only dispatch one update notification per page load regardless of
// which detection path fires first (onNeedRefresh vs. direct SW API).
let _updateDispatched = false

function dispatchUpdateAvailable(update: () => void) {
  if (_updateDispatched) return
  _updateDispatched = true
  ;(window as unknown as Record<string, unknown>).__swPendingUpdate = update
  window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: { update } }))
}

// ── Path 1: VitePWA onNeedRefresh ─────────────────────────────────────────────
// Fires when the new SW enters the "waiting" state.
const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    dispatchUpdateAvailable(() => updateSW(true))
  },
})

// ── Path 2: Low-level SW API (fallback for iOS + race conditions) ─────────────
// Covers cases where onNeedRefresh doesn't fire:
//  • SW was already waiting before this page loaded
//  • iOS Safari quirks that suppress the VitePWA callback
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(reg => {

    // iOS PWA: force update check whenever the user switches back to the app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })

    function handleWaitingWorker(worker: ServiceWorker) {
      dispatchUpdateAvailable(() => {
        // Tell the waiting SW to skip waiting and take control
        worker.postMessage({ type: 'SKIP_WAITING' })
        // Reload once the new SW takes over (once prevents loops)
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => window.location.reload(),
          { once: true },
        )
      })
    }

    // Already waiting at load time (e.g. user reloaded after a deploy)
    if (reg.waiting && navigator.serviceWorker.controller) {
      handleWaitingWorker(reg.waiting)
    }

    // New SW found after the page loaded (triggered by reg.update())
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing
      if (!nw || !navigator.serviceWorker.controller) return
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed') handleWaitingWorker(nw)
      })
    })

  }).catch(() => {})
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
