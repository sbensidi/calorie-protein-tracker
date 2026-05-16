import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Lang } from '../lib/i18n'

export type StyleMode = 'classic' | 'minimal'

interface AppContextValue {
  lang:              Lang
  theme:             'dark' | 'light'
  styleMode:         StyleMode
  toggleLang:        () => void
  toggleTheme:       () => void
  selectStyleMode:   (m: StyleMode) => void
  setTheme:          (t: 'dark' | 'light') => void
  setLang:           (l: Lang) => void
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
  const [styleMode, setStyleMode] = useState<StyleMode>(() => {
    const saved = localStorage.getItem('styleMode')
    if (saved === 'classic' || saved === 'minimal') return saved
    return 'classic'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.style = styleMode
    localStorage.setItem('styleMode', styleMode)
  }, [styleMode])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr'
    localStorage.setItem('lang', lang)
  }, [lang])

  const toggleLang = useCallback(() => {
    setLang(l => l === 'he' ? 'en' : 'he')
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  const selectStyleMode = useCallback((m: StyleMode) => {
    setStyleMode(m)
  }, [])

  const applyTheme = useCallback((t: 'dark' | 'light') => {
    setTheme(t)
  }, [])

  const applyLang = useCallback((l: Lang) => {
    setLang(l)
  }, [])

  return (
    <AppContext.Provider value={{ lang, theme, styleMode, toggleLang, toggleTheme, selectStyleMode, setTheme: applyTheme, setLang: applyLang }}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider')
  return ctx
}
