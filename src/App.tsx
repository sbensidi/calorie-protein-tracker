import { useState, useEffect, useMemo, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { t } from './lib/i18n'
import type { Lang } from './lib/i18n'
import { useAppContext } from './context/AppContext'
import { useMeals } from './hooks/useMeals'
import { useGoals } from './hooks/useGoals'
import { useFoodHistory } from './hooks/useFoodHistory'
import { useComposedGroups } from './hooks/useComposedGroups'
import { useToast } from './hooks/useToast'
import { TodayTab } from './components/TodayTab'
import { HistoryTab } from './components/HistoryTab'
import { SettingsSheet } from './components/SettingsSheet'
import { ToastContainer } from './components/ToastContainer'
import { useProfile } from './hooks/useProfile'

type Tab = 'today' | 'history'

export default function App() {
  const { lang, theme, toggleLang, toggleTheme, setTheme, setLang } = useAppContext()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isRecovery, setIsRecovery] = useState(false)
  const [tab, setTab]             = useState<Tab>('today')
  const [connected, setConnected] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true)
      if (event === 'SIGNED_IN' && isRecovery) setIsRecovery(false)
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setConnected(navigator.onLine)
    const handleOnline  = () => setConnected(true)
    const handleOffline = () => setConnected(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const userId = session?.user?.id || null

  // Sync theme/lang from Supabase on login; save back on change
  const prefsSynced = useRef(false)
  useEffect(() => {
    if (!userId) { prefsSynced.current = false; return }
    prefsSynced.current = false
    supabase.from('profiles').select('theme, lang').eq('id', userId).single().then(({ data }) => {
      if (data?.theme === 'dark' || data?.theme === 'light') setTheme(data.theme)
      if (data?.lang === 'he' || data?.lang === 'en') setLang(data.lang as Lang)
      // Defer so state-update effects triggered by setTheme/setLang fire before we allow saves
      setTimeout(() => { prefsSynced.current = true })
    })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userId || !prefsSynced.current) return
    supabase.from('profiles').upsert({ id: userId, theme, lang, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  }, [theme, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const { toasts, showToast, dismissToast } = useToast()
  const { profile, saveProfile, error: profileError } = useProfile(userId)
  const { meals, loading: mealsLoading, error: mealsError, addMeal, addMealWithId, updateMeal, deleteMeal, duplicateMeal } = useMeals(userId)
  const { goals, error: goalsError, saveGoals, getGoalForDate } = useGoals(userId)
  const { history, error: historyError, upsertHistory, getSuggestions, deleteHistory, updateHistory } = useFoodHistory(userId)
  const { groups: composedGroups, error: groupsError, upsert: upsertGroup, remove: removeGroup } = useComposedGroups(userId)

  // Surface hook errors as toasts
  useEffect(() => {
    const err = mealsError || goalsError || historyError || groupsError || profileError
    if (err) showToast(lang === 'he' ? 'שגיאה בתקשורת עם השרת' : 'Server error. Please try again.', 'error')
  }, [mealsError, goalsError, historyError, groupsError, profileError]) // eslint-disable-line react-hooks/exhaustive-deps

  const composedEntries = useMemo(() =>
    composedGroups.map(g => {
      const gMeals = meals.filter(m => g.mealIds.includes(m.id))
      return {
        id: g.id,
        name: g.name,
        calories: Math.round(gMeals.reduce((s, m) => s + m.calories, 0)),
        protein: Math.round(gMeals.reduce((s, m) => s + m.protein, 0) * 10) / 10,
      }
    }).filter(e => e.name),
  [composedGroups, meals])

  const todayGoal = getGoalForDate(new Date().toISOString().slice(0, 10))

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  // Password recovery: user arrived via reset-password email link
  if (session && isRecovery) {
    return (
      <UpdatePasswordPage
        lang={lang}
        onDone={() => setIsRecovery(false)}
        onToggleLang={toggleLang}
      />
    )
  }

  if (!session) {
    return <AuthPage lang={lang} onToggleLang={toggleLang} />
  }

  return (
    <div
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      style={{ minHeight: '100vh', background: 'var(--bg)' }}
    >

      {/* ── Sticky app header ─────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 56 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
              {t(lang, 'appTitle')}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label={lang === 'he' ? 'הגדרות' : 'Settings'}
                style={{
                  width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--qty-bg)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', cursor: 'pointer', transition: 'background .15s, color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--qty-hover)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--qty-bg)'; e.currentTarget.style.color = 'var(--text-2)' }}
              >
                <span className="icon" style={{ fontSize: 20 }}>settings</span>
              </button>
            </div>
          </header>
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────── */}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* Tab bar */}
        <div className="tab-bar" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {/* Sliding active indicator — left computed based on active tab + direction */}
          <div className="tab-indicator" style={{
            left: (() => {
              const isRTL = lang === 'he'
              const todayActive = tab === 'today'
              // In DOM: [today, history]. RTL grid: today=right col, history=left col.
              // indicator starts at left:3px (LTR today / RTL history)
              // or at calc(50% + 1.5px) (LTR history / RTL today)
              if (isRTL) return todayActive ? 'calc(50% + 1.5px)' : '3px'
              else       return todayActive ? '3px' : 'calc(50% + 1.5px)'
            })(),
            width: 'calc(50% - 4.5px)',
          }} />
          {(['today', 'history'] as Tab[]).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`tab-btn ${tab === tabKey ? 'active' : ''}`}
            >
              {t(lang, tabKey as any)}
            </button>
          ))}
        </div>

        {tab === 'today' && (
          <TodayTab
            lang={lang}
            meals={meals}
            loading={mealsLoading}
            history={history}
            goalCalories={todayGoal.calories}
            goalProtein={todayGoal.protein}
            getSuggestions={getSuggestions}
            onAddMeal={addMeal}
            onAddMealWithId={addMealWithId}
            onEditMeal={updateMeal}
            onDeleteMeal={deleteMeal}
            onDuplicateMeal={duplicateMeal}
            onUpsertHistory={upsertHistory}
            composedEntries={composedEntries}
            composedGroups={composedGroups}
            onUpsertGroup={upsertGroup}
            onRemoveGroup={removeGroup}
            showToast={showToast}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            lang={lang}
            meals={meals}
            history={history}
            getSuggestions={getSuggestions}
            getGoalForDate={getGoalForDate}
            composedEntries={composedEntries}
            composedGroups={composedGroups}
          />
        )}
      </div>

      <SettingsSheet
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        lang={lang}
        profile={profile}
        onSaveProfile={saveProfile}
        goals={goals}
        onSaveGoals={saveGoals}
        connected={connected}
        onToggleLang={toggleLang}
        onSignOut={() => supabase.auth.signOut()}
        theme={theme}
        onToggleTheme={toggleTheme}
        showToast={showToast}
        history={history}
        onDeleteHistory={deleteHistory}
        onUpdateHistory={updateHistory}
        composedGroups={composedGroups}
        onRemoveGroup={removeGroup}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} lang={lang} />
    </div>
  )
}

// ── Update Password Page (shown after clicking reset link in email) ────────────

function UpdatePasswordPage({ lang, onDone, onToggleLang }: { lang: Lang; onDone: () => void; onToggleLang: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  const handleUpdate = async () => {
    if (!password || password.length < 6) {
      setError(lang === 'he' ? 'הסיסמה חייבת להכיל לפחות 6 תווים' : 'Password must be at least 6 characters')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(onDone, 1800)
    }
    setLoading(false)
  }

  return (
    <div
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
    >
      <div style={{ width: '100%', maxWidth: 380 }} className="fade-up">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span className="icon" style={{ fontSize: 36, color: 'var(--blue)', display: 'block', marginBottom: 10 }}>lock_reset</span>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
            {t(lang, 'updatePassword')}
          </h1>
        </div>
        <div className="card" style={{ padding: 20 }}>
          {done ? (
            <p style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600, padding: '8px 0' }}>
              <span className="icon" style={{ display: 'block', fontSize: 28, marginBottom: 8 }}>check_circle</span>
              {t(lang, 'passwordUpdated')}
            </p>
          ) : (
            <>
              <input
                type="password"
                className="inp"
                style={{ marginBottom: 8 }}
                placeholder={t(lang, 'newPassword')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                dir="ltr"
                autoFocus
              />
              {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</p>}
              <button
                className="btn-primary"
                onClick={handleUpdate}
                disabled={loading || !password}
                style={{ width: '100%', marginTop: 4 }}
              >
                {loading ? '...' : t(lang, 'updatePassword')}
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            onClick={onToggleLang}
            style={{ padding: '5px 14px', borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {lang === 'he' ? 'English' : 'עברית'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Auth Page ─────────────────────────────────────────────────────────────────

function AuthPage({ lang, onToggleLang }: { lang: Lang; onToggleLang: () => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode]         = useState<'signin' | 'signup' | 'magic' | 'reset'>('signin')
  const [loading, setLoading]   = useState(false)
  const [message, setMessage]   = useState('')
  const [error, setError]       = useState('')

  const handleAuth = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setMessage(t(lang, 'checkEmail'))
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        setMessage(t(lang, 'checkEmail'))
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setMessage(t(lang, 'checkEmail'))
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error')
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const showPassword = mode === 'signin' || mode === 'signup'
  const isResetMode  = mode === 'reset'

  return (
    <div
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
    >
      <div style={{ width: '100%', maxWidth: 380 }} className="fade-up">

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span className="icon" style={{ fontSize: 36, color: 'var(--blue)', display: 'block', marginBottom: 10 }}>monitor_weight</span>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
            {t(lang, 'appTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
            {lang === 'he' ? 'מעקב תזונה חכם' : 'Smart nutrition tracking'}
          </p>
        </div>

        <div className="card" style={{ padding: 20 }}>

          {/* Google button */}
          {!isResetMode && (
            <>
              <button
                onClick={handleGoogle}
                style={{
                  width: '100%', height: 46, borderRadius: 10, marginBottom: 6,
                  background: 'var(--qty-bg)', border: '1px solid var(--border-hi)',
                  color: 'var(--text)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'background .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--qty-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--qty-bg)')}
              >
                {/* Google G logo SVG */}
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t(lang, 'signInWithGoogle')}
              </button>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{t(lang, 'orDivider')}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            </>
          )}

          {/* Mode tabs (not shown in reset mode) */}
          {!isResetMode && (
            <div className="tab-bar" style={{ marginBottom: 16 }}>
              {(['signin', 'signup', 'magic'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setError(''); setMessage('') }} className={`tab-btn ${mode === m ? 'active' : ''}`} style={{ fontSize: 12 }}>
                  {m === 'signin' ? t(lang, 'signIn') : m === 'signup' ? t(lang, 'signUp') : t(lang, 'magicLink')}
                </button>
              ))}
            </div>
          )}

          {/* Reset mode header */}
          {isResetMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => { setMode('signin'); setError(''); setMessage('') }}
                className="icon-btn"
              >
                <span className="icon icon-sm">{lang === 'he' ? 'arrow_forward' : 'arrow_back'}</span>
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                {t(lang, 'forgotPassword')}
              </span>
            </div>
          )}

          <input
            type="email"
            className="inp"
            style={{ marginBottom: 8 }}
            placeholder={t(lang, 'email')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            dir="ltr"
          />

          {showPassword && (
            <div style={{ marginBottom: 8 }}>
              <input
                type="password"
                className="inp"
                placeholder={t(lang, 'password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                dir="ltr"
              />
              {/* Forgot password link — only in signin mode */}
              {mode === 'signin' && (
                <button
                  onClick={() => { setMode('reset'); setError(''); setMessage('') }}
                  style={{
                    background: 'none', border: 'none', padding: '4px 0',
                    fontSize: 12, color: 'var(--text-3)', cursor: 'pointer',
                    fontFamily: 'inherit', textDecoration: 'underline',
                  }}
                >
                  {t(lang, 'forgotPassword')}?
                </button>
              )}
            </div>
          )}

          {error   && <p style={{ fontSize: 12, color: 'var(--red)',   marginBottom: 8 }}>{error}</p>}
          {message && <p style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>{message}</p>}

          <button
            className="btn-primary"
            onClick={handleAuth}
            disabled={loading || !email || (showPassword && !password)}
            style={{ width: '100%', marginTop: 4 }}
          >
            {loading ? '...'
              : isResetMode ? t(lang, 'sendResetLink')
              : mode === 'signin' ? t(lang, 'signIn')
              : mode === 'signup' ? t(lang, 'signUp')
              : t(lang, 'magicLink')}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            onClick={onToggleLang}
            style={{ padding: '5px 14px', borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {lang === 'he' ? 'English' : 'עברית'}
          </button>
        </div>
      </div>
    </div>
  )
}
