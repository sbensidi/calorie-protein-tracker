import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppProvider } from './context/AppContext'

// prompt mode: new SW waits until user explicitly confirms reload.
// Store the update fn globally so App.tsx can pick it up even if
// onNeedRefresh fires before React mounts its listener.
;(window as unknown as Record<string, unknown>).__swPendingUpdate = null

const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    const update = () => updateSW(true)
    ;(window as unknown as Record<string, unknown>).__swPendingUpdate = update
    window.dispatchEvent(
      new CustomEvent('pwa-update-available', { detail: { update } })
    )
  },
})

// iOS PWA fix: the browser doesn't always poll for a new SW on launch from
// the home screen. Force a check every time the app becomes visible.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then(reg => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    })
    .catch(() => {})
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
