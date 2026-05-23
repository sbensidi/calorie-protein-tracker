import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppProvider } from './context/AppContext'

// iOS PWA fix: the browser doesn't always poll for a new SW on launch from the
// home screen. Force a check every time the app becomes visible (e.g. user
// switches back to it), and reload immediately when a new SW takes control.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then(reg => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    })
    .catch(() => {})

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
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
