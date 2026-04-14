import { useState, useEffect } from 'react'
import type { Goal } from '../types'
import type { Lang, DayKey } from '../lib/i18n'
import { t, DAY_KEYS } from '../lib/i18n'

interface GoalsTabProps {
  lang: Lang
  goals: Goal | null
  onSave: (updates: Partial<Goal>) => void
}

const DAY_INDEX: Record<DayKey, string> = {
  sunday: '0', monday: '1', tuesday: '2', wednesday: '3',
  thursday: '4', friday: '5', saturday: '6',
}

export function GoalsTab({ lang, goals, onSave }: GoalsTabProps) {
  const [defaultCalories, setDefaultCalories] = useState(1700)
  const [defaultProtein,  setDefaultProtein]  = useState(160)
  const [overrides, setOverrides] = useState<Record<string, { calories: number; protein: number }>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (goals) {
      setDefaultCalories(goals.default_calories)
      setDefaultProtein(goals.default_protein)
      setOverrides(goals.weekly_overrides || {})
    }
  }, [goals])

  const setDayOverride = (dayKey: DayKey, field: 'calories' | 'protein', value: string) => {
    const idx = DAY_INDEX[dayKey]
    setOverrides(prev => ({
      ...prev,
      [idx]: {
        calories: prev[idx]?.calories ?? defaultCalories,
        protein:  prev[idx]?.protein  ?? defaultProtein,
        [field]: Number(value),
      },
    }))
  }

  const resetDay = (dayKey: DayKey) => {
    const idx = DAY_INDEX[dayKey]
    setOverrides(prev => { const n = { ...prev }; delete n[idx]; return n })
  }

  const hasOverride = (dayKey: DayKey) => !!overrides[DAY_INDEX[dayKey]]
  const getVal = (dayKey: DayKey, field: 'calories' | 'protein') => {
    const idx = DAY_INDEX[dayKey]
    return overrides[idx]?.[field] ?? (field === 'calories' ? defaultCalories : defaultProtein)
  }

  const handleSave = () => {
    onSave({ default_calories: defaultCalories, default_protein: defaultProtein, weekly_overrides: overrides })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Default goals */}
      <div className="card fade-up" style={{ padding: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          {t(lang, 'defaultGoals')}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {t(lang, 'calories')} ({t(lang, 'caloriesUnit')})
            </label>
            <input type="number" className="inp" value={defaultCalories} onChange={e => setDefaultCalories(Number(e.target.value))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {t(lang, 'protein')} ({t(lang, 'proteinUnit')})
            </label>
            <input type="number" className="inp inp-green" value={defaultProtein} onChange={e => setDefaultProtein(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Weekly overrides */}
      <div className="card fade-up delay-1" style={{ padding: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          {t(lang, 'weeklyOverrides')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DAY_KEYS.map(dayKey => {
            const isCustom = hasOverride(dayKey)
            return (
              <div
                key={dayKey}
                style={{
                  background: isCustom ? 'rgba(59,130,246,0.05)' : 'transparent',
                  border: `1px solid ${isCustom ? 'rgba(59,130,246,0.18)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: isCustom ? 'var(--text)' : 'var(--text-2)' }}>
                    {t(lang, dayKey as any)}
                  </span>
                  {isCustom && (
                    <button
                      onClick={() => resetDay(dayKey)}
                      style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                    >
                      {t(lang, 'resetToDefault')}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    className="inp"
                    style={{ flex: 1, height: 38, fontSize: 13, opacity: isCustom ? 1 : 0.45 }}
                    value={getVal(dayKey, 'calories')}
                    onChange={e => setDayOverride(dayKey, 'calories', e.target.value)}
                  />
                  <input
                    type="number"
                    className="inp inp-green"
                    style={{ flex: 1, height: 38, fontSize: 13, opacity: isCustom ? 1 : 0.45 }}
                    value={getVal(dayKey, 'protein')}
                    onChange={e => setDayOverride(dayKey, 'protein', e.target.value)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button
        className={saved ? 'btn-confirm' : 'btn-primary'}
        onClick={handleSave}
        style={{ height: 48, fontSize: 14, borderRadius: 12, width: '100%' }}
      >
        {saved
          ? <><span className="icon icon-sm" style={{ verticalAlign: 'middle', marginInlineEnd: 4 }}>check_circle</span>{lang === 'he' ? 'נשמר!' : 'Saved!'}</>
          : t(lang, 'saveGoals')
        }
      </button>
    </div>
  )
}
