import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppProvider } from './context/AppContext'

// prompt mode: new SW waits until user explicitly confirms reload
// Store the update fn globally so App.tsx can pick it up even if onNeedRefresh fires before React mounts
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
)
