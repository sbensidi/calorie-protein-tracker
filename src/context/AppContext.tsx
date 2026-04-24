import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Lang } from '../lib/i18n'

interface AppContextValue {
  lang:          Lang
  theme:         'dark' | 'light'
  toggleLang:    () => void
  toggleTheme:   () => void
  setTheme:      (t: 'dark' | 'light') => void
  setLang:       (l: Lang) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() =>
    (localStorage.getItem('lang') as Lang) || 'he'
  )
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleLang = useCallback(() => {
    const next: Lang = lang === 'he' ? 'en' : 'he'
    setLang(next)
    localStorage.setItem('lang', next)
  }, [lang])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  const applyTheme = useCallback((t: 'dark' | 'light') => {
    setTheme(t)
  }, [])

  const applyLang = useCallback((l: Lang) => {
    setLang(l)
    localStorage.setItem('lang', l)
  }, [])

  return (
    <AppContext.Provider value={{ lang, theme, toggleLang, toggleTheme, setTheme: applyTheme, setLang: applyLang }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider')
  return ctx
}
