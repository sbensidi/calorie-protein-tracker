import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Lang } from './lib/i18n'
import { t } from './lib/i18n'
import { useMeals } from './hooks/useMeals'
import { useGoals } from './hooks/useGoals'
import { useFoodHistory } from './hooks/useFoodHistory'
import { TodayTab } from './components/TodayTab'
import { HistoryTab } from './components/HistoryTab'
import { GoalsTab } from './components/GoalsTab'

type Tab = 'today' | 'history' | 'goals'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('lang') as Lang) || 'he'
  })
  const [tab, setTab] = useState<Tab>('today')
  const [connected, setConnected] = useState(true)

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Realtime connection status
  useEffect(() => {
    const channel = supabase.channel('connection-check')
    channel.subscribe(status => {
      setConnected(status === 'SUBSCRIBED')
    })
    return () => { supabase.removeChannel(channel) }
  }, [])

  const userId = session?.user?.id || null

  const { meals, addMeal, updateMeal, deleteMeal, duplicateMeal } = useMeals(userId)
  const { goals, saveGoals, getGoalForDate } = useGoals(userId)
  const { history, upsertHistory, getSuggestions } = useFoodHistory(userId)

  const todayGoal = getGoalForDate(new Date().toISOString().slice(0, 10))

  const toggleLang = () => {
    const next: Lang = lang === 'he' ? 'en' : 'he'
    setLang(next)
    localStorage.setItem('lang', next)
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
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
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
            {t(lang, 'appTitle')}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: connected ? 'var(--green)' : 'var(--text-3)',
                boxShadow: connected ? '0 0 6px var(--green)' : 'none',
              }} />
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                {t(lang, connected ? 'connected' : 'disconnected')}
              </span>
            </div>
            <button
              onClick={toggleLang}
              style={{
                padding: '5px 12px', borderRadius: 999,
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'background .15s',
              }}
            >
              {lang === 'he' ? 'EN' : 'עב'}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                padding: '5px 12px', borderRadius: 999,
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-2)', fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'color .15s',
              }}
            >
              {t(lang, 'signOut')}
            </button>
          </div>
        </header>

        {/* Tab bar */}
        <div className="tab-bar" style={{ marginBottom: 20 }}>
          {(['today', 'history', 'goals'] as Tab[]).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`tab-btn ${tab === tabKey ? 'active' : ''}`}
            >
              {t(lang, tabKey as any)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'today' && (
          <TodayTab
            lang={lang}
            meals={meals}
            history={history}
            goalCalories={todayGoal.calories}
            goalProtein={todayGoal.protein}
            getSuggestions={getSuggestions}
            onAddMeal={addMeal}
            onEditMeal={updateMeal}
            onDeleteMeal={deleteMeal}
            onDuplicateMeal={duplicateMeal}
            onUpsertHistory={upsertHistory}
          />
        )}
        {tab === 'history' && (
          <HistoryTab lang={lang} meals={meals} getGoalForDate={getGoalForDate} />
        )}
        {tab === 'goals' && (
          <GoalsTab lang={lang} goals={goals} onSave={saveGoals} />
        )}
      </div>
    </div>
  )
}

// ── Auth page ─────────────────────────────────────────────────────────────────

function AuthPage({ lang, onToggleLang }: { lang: Lang; onToggleLang: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleAuth = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMessage(t(lang, 'checkEmail'))
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage(t(lang, 'checkEmail'))
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error')
    }
    setLoading(false)
  }

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
          {/* Mode tabs */}
          <div className="tab-bar" style={{ marginBottom: 16 }}>
            {(['signin', 'signup', 'magic'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`tab-btn ${mode === m ? 'active' : ''}`} style={{ fontSize: 12 }}>
                {m === 'signin' ? t(lang, 'signIn') : m === 'signup' ? t(lang, 'signUp') : t(lang, 'magicLink')}
              </button>
            ))}
          </div>

          <input
            type="email"
            className="inp"
            style={{ marginBottom: 8 }}
            placeholder={t(lang, 'email')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            dir="ltr"
          />

          {mode !== 'magic' && (
            <input
              type="password"
              className="inp"
              style={{ marginBottom: 8 }}
              placeholder={t(lang, 'password')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              dir="ltr"
            />
          )}

          {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</p>}
          {message && <p style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>{message}</p>}

          <button
            className="btn-blue"
            onClick={handleAuth}
            disabled={loading || !email}
            style={{ width: '100%', marginTop: 4 }}
          >
            {loading ? '...' : mode === 'signin' ? t(lang, 'signIn') : mode === 'signup' ? t(lang, 'signUp') : t(lang, 'magicLink')}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            onClick={onToggleLang}
            style={{ padding: '5px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {lang === 'he' ? 'English' : 'עברית'}
          </button>
        </div>
      </div>
    </div>
  )
}
