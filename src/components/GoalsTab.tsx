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

const DAY_SHORT_HE: Record<DayKey, string> = {
  sunday: 'א׳', monday: 'ב׳', tuesday: 'ג׳', wednesday: 'ד׳',
  thursday: 'ה׳', friday: 'ו׳', saturday: 'ש׳',
}

const DAY_SHORT_EN: Record<DayKey, string> = {
  sunday: 'Su', monday: 'Mo', tuesday: 'Tu', wednesday: 'We',
  thursday: 'Th', friday: 'Fr', saturday: 'Sa',
}

export function GoalsTab({ lang, goals, onSave }: GoalsTabProps) {
  const [defaultCalories, setDefaultCalories] = useState(1700)
  const [defaultProtein,  setDefaultProtein]  = useState(160)
  const [overrides, setOverrides] = useState<Record<string, { calories: number; protein: number }>>({})
  const [saved, setSaved]         = useState(false)
  const [expanded, setExpanded]   = useState(false)

  const todayKey = DAY_KEYS[new Date().getDay()]
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey)

  useEffect(() => {
    if (goals) {
      setDefaultCalories(goals.default_calories)
      setDefaultProtein(goals.default_protein)
      setOverrides(goals.weekly_overrides || {})
    }
  }, [goals])

  const hasOverride = (dayKey: DayKey) => !!overrides[DAY_INDEX[dayKey]]

  const getVal = (dayKey: DayKey, field: 'calories' | 'protein') => {
    const entry = overrides[DAY_INDEX[dayKey]]
    return entry?.[field] ?? (field === 'calories' ? defaultCalories : defaultProtein)
  }

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

  const getDiff = (dayKey: DayKey, field: 'calories' | 'protein'): string | null => {
    if (!hasOverride(dayKey)) return null
    const val = getVal(dayKey, field)
    const def = field === 'calories' ? defaultCalories : defaultProtein
    const diff = val - def
    if (diff === 0) return null
    const unit = field === 'protein' ? 'g' : ''
    return diff > 0 ? `(+${diff}${unit})` : `(${diff}${unit})`
  }

  const dayShort = (dayKey: DayKey) =>
    lang === 'he' ? DAY_SHORT_HE[dayKey] : DAY_SHORT_EN[dayKey]

  const handleSave = () => {
    onSave({ default_calories: defaultCalories, default_protein: defaultProtein, weekly_overrides: overrides })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleCancel = () => {
    if (goals) {
      setDefaultCalories(goals.default_calories)
      setDefaultProtein(goals.default_protein)
      setOverrides(goals.weekly_overrides || {})
    }
  }

  // ── Shared input with inline diff ────────────────────────────────────────
  const diffInputStyle = (diff: string | null): React.CSSProperties => ({
    paddingInlineEnd: diff ? 52 : undefined,
  })

  const DiffBadge = ({ diff }: { diff: string | null }) => {
    if (!diff) return null
    return (
      <span style={{
        position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)',
        fontSize: 10, fontWeight: 600, pointerEvents: 'none',
        color: diff.startsWith('(+') ? 'var(--green-hi)' : 'var(--red-hi)',
      }}>
        {diff}
      </span>
    )
  }

  // ── Day panel (used both in single-day and expanded views) ───────────────
  const DayPanel = ({ dayKey, compact = false }: { dayKey: DayKey; compact?: boolean }) => {
    const isToday  = dayKey === todayKey
    const isCustom = hasOverride(dayKey)
    const calDiff  = getDiff(dayKey, 'calories')
    const protDiff = getDiff(dayKey, 'protein')

    return (
      <div style={{
        border: `1.5px solid ${isToday ? 'rgba(59,130,246,0.4)' : isCustom ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
        background: isToday ? 'rgba(59,130,246,0.05)' : isCustom ? 'rgba(99,102,241,0.05)' : 'transparent',
        borderRadius: 12,
        padding: compact ? '10px 12px' : 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{
            fontSize: compact ? 12 : 13, fontWeight: 700,
            color: isToday ? 'var(--blue-hi)' : isCustom ? 'var(--indigo-hi)' : 'var(--text-2)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t(lang, dayKey as any)}
            {isToday && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: 'var(--blue)',
                background: 'rgba(59,130,246,0.12)', borderRadius: 4, padding: '2px 5px',
              }}>
                {t(lang, 'today')}
              </span>
            )}
          </span>
          {isCustom && (
            <button
              onClick={() => resetDay(dayKey)}
              title={t(lang, 'resetToDefault')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}
            >
              <span className="icon icon-sm">restart_alt</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            {!compact && (
              <label style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                {t(lang, 'calories')}
              </label>
            )}
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                className="inp"
                style={{ height: compact ? 38 : undefined, fontSize: compact ? 13 : undefined, ...diffInputStyle(calDiff) }}
                value={getVal(dayKey, 'calories')}
                onChange={e => setDayOverride(dayKey, 'calories', e.target.value)}
              />
              <DiffBadge diff={calDiff} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {!compact && (
              <label style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                {t(lang, 'protein')}
              </label>
            )}
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                className="inp inp-green"
                style={{ height: compact ? 38 : undefined, fontSize: compact ? 13 : undefined, ...diffInputStyle(protDiff) }}
                value={getVal(dayKey, 'protein')}
                onChange={e => setDayOverride(dayKey, 'protein', e.target.value)}
              />
              <DiffBadge diff={protDiff} />
            </div>
          </div>
        </div>
      </div>
    )
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {t(lang, 'weeklyOverrides')}
          </p>
          {Object.keys(overrides).length > 0 && (
            <button
              onClick={() => setOverrides({})}
              title={t(lang, 'resetToDefault')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span className="icon icon-sm">restart_alt</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'resetAllToDefault')}</span>
            </button>
          )}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 14 }}>
          {DAY_KEYS.map(dayKey => {
            const isToday    = dayKey === todayKey
            const isCustom   = hasOverride(dayKey)
            const isSelected = dayKey === selectedDay
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDay(dayKey)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '8px 2px 6px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit', position: 'relative',
                  border: `1.5px solid ${
                    isSelected ? 'var(--indigo)'
                    : isCustom ? 'rgba(99,102,241,0.45)'
                    : isToday  ? 'rgba(59,130,246,0.5)'
                    : 'var(--border)'
                  }`,
                  background: isSelected ? 'rgba(99,102,241,0.15)'
                    : isCustom ? 'rgba(99,102,241,0.06)'
                    : isToday  ? 'rgba(59,130,246,0.07)'
                    : 'transparent',
                  boxShadow: isSelected ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {isToday && (
                  <span style={{
                    position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--blue)', color: '#fff', fontSize: 7, fontWeight: 700,
                    padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap',
                  }}>
                    {t(lang, 'today')}
                  </span>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: isSelected ? 'var(--text)' : isCustom ? 'var(--indigo-hi)' : isToday ? 'var(--blue-hi)' : 'var(--text-3)',
                }}>
                  {dayShort(dayKey)}
                </span>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: isCustom ? 'var(--indigo)' : isToday ? 'var(--blue)' : 'var(--border)',
                }} />
              </button>
            )
          })}
        </div>

        {/* Single day detail panel */}
        <DayPanel dayKey={selectedDay} />

        {/* Expand / collapse all days */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              fontSize: 11, fontWeight: 600, color: 'var(--blue)',
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 20, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}
          >
            <span className="icon icon-sm">{expanded ? 'unfold_less' : 'unfold_more'}</span>
            {t(lang, expanded ? 'collapseAllDays' : 'expandAllDays')}
          </button>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* All days expanded */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {DAY_KEYS.map(dayKey => (
              <DayPanel key={dayKey} dayKey={dayKey} compact />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn-ghost"
          onClick={handleCancel}
          style={{ height: 48, fontSize: 14, borderRadius: 12, flex: 1 }}
        >
          {t(lang, 'cancel')}
        </button>
        <button
          className={saved ? 'btn-confirm' : 'btn-primary'}
          onClick={handleSave}
          style={{ height: 48, fontSize: 14, borderRadius: 12, flex: 1 }}
        >
          {saved
            ? <><span className="icon icon-sm" style={{ verticalAlign: 'middle', marginInlineEnd: 4 }}>check_circle</span>{lang === 'he' ? 'נשמר!' : 'Saved!'}</>
            : t(lang, 'saveGoals')
          }
        </button>
      </div>
    </div>
  )
}
