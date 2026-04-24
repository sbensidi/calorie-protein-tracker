import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSheetScroll } from '../hooks/useSheetScroll'
import { SheetHandle } from './SheetHandle'
import type { Lang, DayKey } from '../lib/i18n'
import { t, DAY_KEYS, DAY_SHORT_HE, DAY_SHORT_EN } from '../lib/i18n'
import { toWeekIndex } from '../lib/utils'
import type { Toast } from '../hooks/useToast'
import type { Goal, FoodHistory, ComposedGroup } from '../types'
import type { UserProfile } from '../hooks/useProfile'
import { useFoodLibrary } from '../hooks/useFoodLibrary'

// ── Constants ─────────────────────────────────────────────────────────────────

type Screen = 'main' | 'profile' | 'goals' | 'foodHistory' | 'library'

const ACTIVITY_MULTIPLIERS = [1.2, 1.375, 1.55, 1.725, 1.9]

function calcBMR(p: UserProfile) {
  return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161))
}

function calcTDEE(p: UserProfile) {
  return Math.round(calcBMR(p) * ACTIVITY_MULTIPLIERS[p.activityLevel])
}

// ── DayPanel (module-level to avoid React re-mounting on every render) ────────

interface DayPanelProps {
  dayKey:         DayKey
  compact?:       boolean
  lang:           Lang
  todayKey:       DayKey
  isCustom:       boolean
  calVal:         number
  protVal:        number
  calDiff:        string | null
  protDiff:       string | null
  onChangeCal:    (v: string) => void
  onChangeProt:   (v: string) => void
  onReset:        () => void
}

function DayPanel({
  dayKey, compact = false, lang, todayKey,
  isCustom, calVal, protVal, calDiff, protDiff,
  onChangeCal, onChangeProt, onReset,
}: DayPanelProps) {
  const isToday = dayKey === todayKey

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
          color: isToday ? 'var(--blue-hi)' : isCustom ? 'var(--indigo-hi, #a5b4fc)' : 'var(--text-2)',
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
            onClick={onReset}
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
              inputMode="numeric"
              className="inp"
              style={{ height: compact ? 38 : undefined, fontSize: compact ? 13 : undefined, paddingInlineEnd: calDiff ? 52 : undefined }}
              value={calVal === 0 ? '' : calVal}
              placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => onChangeCal(e.target.value)}
            />
            {calDiff && (
              <span style={{
                position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 600, pointerEvents: 'none',
                color: calDiff.startsWith('(+') ? 'var(--green-hi)' : 'var(--red)',
              }}>
                {calDiff}
              </span>
            )}
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
              inputMode="decimal"
              className="inp inp-green"
              style={{ height: compact ? 38 : undefined, fontSize: compact ? 13 : undefined, paddingInlineEnd: protDiff ? 52 : undefined }}
              value={protVal === 0 ? '' : protVal}
              placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => onChangeProt(e.target.value)}
            />
            {protDiff && (
              <span style={{
                position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 600, pointerEvents: 'none',
                color: protDiff.startsWith('(+') ? 'var(--green-hi)' : 'var(--red)',
              }}>
                {protDiff}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

function MainScreen({ lang, connected, theme, onProfile, onGoals, onFoodHistory, onLibrary, onToggleLang, onToggleTheme, onSignOut }: {
  lang:           Lang
  connected:      boolean
  theme:          'dark' | 'light'
  onProfile:      () => void
  onGoals:        () => void
  onFoodHistory:  () => void
  onLibrary:      () => void
  onToggleLang:   () => void
  onToggleTheme:  () => void
  onSignOut:      () => void
}) {
  const chevron = lang === 'he' ? 'chevron_left' : 'chevron_right'

  const rowBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 12px', borderRadius: 12,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    cursor: 'pointer', width: '100%', fontFamily: 'inherit',
    textAlign: 'start', transition: 'background 0.15s',
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 18px' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          {t(lang, 'settings')}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? 'var(--green)' : 'var(--text-3)',
            boxShadow: connected ? '0 0 5px var(--green)' : 'none',
          }} />
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {t(lang, connected ? 'connected' : 'disconnected')}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Personal Profile */}
        <button onClick={onProfile} style={rowBase}>
          <span className="icon" style={{ fontSize: 22, color: 'var(--blue)', flexShrink: 0 }}>person</span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {t(lang, 'personalProfile')}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
              {lang === 'he' ? 'גיל, גובה, משקל, פעילות, BMR/TDEE, BMI' : 'Age, height, weight, activity, BMR/TDEE, BMI'}
            </p>
          </div>
          <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
        </button>

        {/* Daily Goals */}
        <button onClick={onGoals} style={rowBase}>
          <span className="icon" style={{ fontSize: 22, color: 'var(--green-hi)', flexShrink: 0 }}>track_changes</span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {t(lang, 'dailyGoalsLabel')}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
              {lang === 'he' ? 'קלוריות, חלבון, התאמות שבועיות' : 'Calories, protein, weekly adjustments'}
            </p>
          </div>
          <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
        </button>

        {/* Food History Management */}
        <button onClick={onFoodHistory} style={rowBase}>
          <span className="icon" style={{ fontSize: 22, color: 'var(--amber)', flexShrink: 0 }}>manage_search</span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {lang === 'he' ? 'ניהול מזונות' : 'Manage foods'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
              {lang === 'he' ? 'עריכה ומחיקת מזונות מההיסטוריה' : 'Edit or delete saved food items'}
            </p>
          </div>
          <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
        </button>

        {/* Food Library */}
        <button onClick={onLibrary} style={rowBase}>
          <span className="icon" style={{ fontSize: 22, color: 'var(--green-hi)', flexShrink: 0 }}>menu_book</span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {lang === 'he' ? 'ספריית מזונות' : 'Food Library'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
              {lang === 'he' ? 'עיון ב-120+ מזונות מובנים' : 'Browse 120+ built-in foods'}
            </p>
          </div>
          <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
        </button>

        {/* Language */}
        <div style={{ ...rowBase, cursor: 'default' }}>
          <span className="icon" style={{ fontSize: 22, color: 'var(--purple)', flexShrink: 0 }}>language</span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {t(lang, 'language')}
            </p>
          </div>
          <button
            onClick={onToggleLang}
            style={{
              padding: '6px 16px', borderRadius: 999,
              background: 'var(--qty-bg)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
        </div>

        {/* Theme */}
        <div style={{ ...rowBase, cursor: 'default' }}>
          <span className="icon" style={{ fontSize: 22, color: 'var(--amber)', flexShrink: 0 }}>
            {theme === 'dark' ? 'dark_mode' : 'light_mode'}
          </span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {lang === 'he' ? 'מצב תצוגה' : 'Appearance'}
            </p>
          </div>
          {/* Toggle pill */}
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              position: 'relative',
              width: 50, height: 28,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              background: theme === 'dark' ? 'rgba(59,130,246,0.25)' : 'rgba(245,158,11,0.25)',
              transition: 'background 0.25s',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 3, left: theme === 'dark' ? 3 : 23,
              width: 22, height: 22,
              borderRadius: '50%',
              background: theme === 'dark' ? 'var(--blue)' : 'var(--amber)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'left 0.25s cubic-bezier(.34,1.56,.64,1), background 0.25s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }}>
              <span className="icon" style={{ fontSize: 13, color: '#fff' }}>
                {theme === 'dark' ? 'dark_mode' : 'light_mode'}
              </span>
            </span>
          </button>
        </div>

        {/* Sign Out */}
        <button
          onClick={onSignOut}
          style={{ ...rowBase, background: 'rgba(244,63,94,0.04)', border: '1px solid rgba(244,63,94,0.2)' }}
        >
          <span className="icon" style={{ fontSize: 22, color: 'var(--red)', flexShrink: 0 }}>logout</span>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', margin: 0, flex: 1, textAlign: 'start' }}>
            {t(lang, 'signOut')}
          </p>
        </button>
      </div>
    </>
  )
}

// ── Profile Screen ────────────────────────────────────────────────────────────

function ProfileScreen({ lang, profile, onSave, onApplyGoals, onBack, onNavigateToGoals, showToast }: {
  lang:               Lang
  profile:            UserProfile
  onSave:             (updates: Partial<UserProfile>) => void
  onApplyGoals:       (calories: number, protein: number) => void
  onBack:             () => void
  onNavigateToGoals:  () => void
  showToast:          (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [draft, setDraft] = useState<UserProfile>({ ...profile })
  const [saved, setSaved]     = useState(false)
  const [applied, setApplied] = useState(false)

  const set = <K extends keyof UserProfile>(key: K, val: UserProfile[K]) =>
    setDraft(p => ({ ...p, [key]: val }))

  const { bmr, tdee, suggestedCal, suggestedProt, bmi, bmiCategory } = useMemo(() => {
    const bmr  = calcBMR(draft)
    const tdee = calcTDEE(draft)
    const delta       = draft.goalType === 'lose' ? -500 : draft.goalType === 'gain' ? 300 : 0
    const suggestedCal  = tdee + delta
    const protRate      = draft.goalType === 'lose' ? 2.0 : draft.goalType === 'gain' ? 2.2 : 1.6
    const suggestedProt = Math.round(draft.weight * protRate)
    const bmiVal        = Math.round((draft.weight / ((draft.height / 100) ** 2)) * 10) / 10
    const bmiCategory   = bmiVal < 18.5 ? 'underweight' : bmiVal < 25 ? 'normal' : bmiVal < 30 ? 'overweight' : 'obese'
    return { bmr, tdee, suggestedCal, suggestedProt, bmi: bmiVal, bmiCategory }
  }, [draft])

  const handleSave = () => {
    onSave(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    showToast(lang === 'he' ? 'הפרופיל נשמר' : 'Profile saved', 'success')
  }

  const handleApply = () => {
    onSave(draft)
    onApplyGoals(suggestedCal, suggestedProt)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
    showToast(lang === 'he' ? 'היעדים הוחלו' : 'Goals applied', 'success')
    // Auto-navigate to goals screen so user can review what was applied
    setTimeout(() => onNavigateToGoals(), 600)
  }

  const bmiColor  = bmiCategory === 'normal' ? 'var(--green-hi)' : bmiCategory === 'obese' ? 'var(--red)' : 'var(--amber)'
  const bmiLabel  = { underweight: lang === 'he' ? 'תת משקל' : 'Underweight', normal: lang === 'he' ? 'משקל תקין' : 'Normal', overweight: lang === 'he' ? 'עודף משקל' : 'Overweight', obese: lang === 'he' ? 'השמנה' : 'Obese' }[bmiCategory]

  const ACTIVITY_LABELS = lang === 'he'
    ? [t(lang, 'sedentary'), t(lang, 'lightActive'), t(lang, 'moderateActive'), t(lang, 'activeLevel'), t(lang, 'veryActive')]
    : [t(lang, 'sedentary'), t(lang, 'lightActive'), t(lang, 'moderateActive'), t(lang, 'activeLevel'), t(lang, 'veryActive')]

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5,
  }

  const protRateLabel = draft.goalType === 'lose' ? '2.0' : draft.goalType === 'gain' ? '2.2' : '1.6'
  const protReasonHe  = draft.goalType === 'lose' ? 'לשמירה מרבית על מסת שריר בזמן ירידה' : draft.goalType === 'gain' ? 'לתמיכה בבניית שריר' : 'לשמירה על מסת שריר'
  const protReasonEn  = draft.goalType === 'lose' ? 'to preserve muscle mass while losing fat' : draft.goalType === 'gain' ? 'to support muscle building' : 'to maintain muscle mass'

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 18px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-2)', display: 'flex' }}>
          <span className="icon">{lang === 'he' ? 'arrow_forward' : 'arrow_back'}</span>
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          {t(lang, 'personalProfile')}
        </h2>
      </div>

      {/* Sex */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{t(lang, 'sex')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['m', 'f'] as const).map(s => (
            <button
              key={s}
              onClick={() => set('sex', s)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontFamily: 'inherit',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: draft.sex === s ? 'rgba(59,130,246,0.18)' : 'var(--bg-card)',
                border: `1.5px solid ${draft.sex === s ? 'var(--blue)' : 'var(--border)'}`,
                color: draft.sex === s ? 'var(--blue-hi)' : 'var(--text-2)',
                transition: 'all .15s',
              }}
            >
              {s === 'm' ? t(lang, 'male') : t(lang, 'female')}
            </button>
          ))}
        </div>
      </div>

      {/* Age / Height / Weight */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {([
          { key: 'age' as const,    label: t(lang, 'ageLabel'),  min: 10,  max: 100 },
          { key: 'height' as const, label: t(lang, 'heightCm'),  min: 100, max: 250 },
          { key: 'weight' as const, label: t(lang, 'weightKg'),  min: 30,  max: 300 },
        ]).map(({ key, label, min, max }) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                inputMode="numeric"
                className="inp"
                min={min} max={max}
                value={draft[key] === 0 ? '' : draft[key]}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => set(key, Number(e.target.value) as any)}
                style={{ textAlign: lang === 'he' ? 'right' : 'left', paddingInlineStart: 12, paddingInlineEnd: 28 }}
              />
              {(draft[key] as number) > 0 && (
                <button
                  onMouseDown={e => { e.preventDefault(); set(key, 0 as any) }}
                  tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Activity Level */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{t(lang, 'activityLevel')}</label>
        <select
          className="inp"
          value={draft.activityLevel}
          onChange={e => set('activityLevel', Number(e.target.value) as UserProfile['activityLevel'])}
          style={{ cursor: 'pointer' }}
        >
          {ACTIVITY_LABELS.map((label, i) => (
            <option key={i} value={i}>{label}</option>
          ))}
        </select>
      </div>

      {/* Goal Type */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>{t(lang, 'goalType')}</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['lose', 'maintain', 'gain'] as const).map(g => {
            const active = draft.goalType === g
            const colors = {
              lose:     { bg: 'rgba(59,130,246,0.18)',  border: 'var(--blue)',  text: 'var(--blue-hi)'  },
              maintain: { bg: 'rgba(99,102,241,0.18)',  border: '#6366f1',      text: '#a5b4fc'         },
              gain:     { bg: 'rgba(16,185,129,0.18)',  border: 'var(--green)', text: 'var(--green-hi)' },
            }[g]
            return (
              <button
                key={g}
                onClick={() => set('goalType', g)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 10, fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: active ? colors.bg : 'var(--bg-card)',
                  border: `1.5px solid ${active ? colors.border : 'var(--border)'}`,
                  color: active ? colors.text : 'var(--text-2)',
                  transition: 'all .15s',
                }}
              >
                {t(lang, g)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 18 }} />

      {/* BMR */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
            {lang === 'he' ? 'BMR — חילוף חומרים בסיסי' : 'BMR — Basal Metabolic Rate'}
          </span>
          <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>
            {bmr.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>{t(lang, 'caloriesUnit')}</span>
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
          {lang === 'he'
            ? 'קלוריות שהגוף שורף במנוחה מוחלטת — לב, נשימה, תפקוד תאים — ללא כל פעילות.'
            : 'Calories burned at complete rest — heart, breathing, cell function — with zero activity.'}
        </p>
      </div>

      {/* TDEE */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
            {lang === 'he' ? 'TDEE — הוצאה אנרגטית יומית' : 'TDEE — Total Daily Energy Expenditure'}
          </span>
          <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--blue-hi)' }}>
            {tdee.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>{t(lang, 'caloriesUnit')}</span>
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
          {lang === 'he'
            ? 'BMR × מכפיל פעילות — כמה קלוריות אתה באמת שורף ביום כולל כל הפעילות שלך.'
            : 'BMR × activity multiplier — actual daily calories burned including all your activities.'}
        </p>
      </div>

      {/* Suggestion card */}
      <div style={{
        background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 12, padding: 14, marginBottom: 16,
      }}>
        {/* Suggested Calories */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
            {lang === 'he' ? 'יעד קלוריות מומלץ' : 'Suggested Calorie Goal'}
          </span>
          <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--blue-hi)' }}>
            {suggestedCal.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>{t(lang, 'caloriesUnit')}</span>
          </span>
        </div>

        {/* Why 500 explanation */}
        {draft.goalType === 'lose' && (
          <div style={{ background: 'var(--depth-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-hi)', margin: '0 0 4px' }}>
              {lang === 'he' ? 'למה דווקא 500 קק״ל פחות?' : 'Why exactly 500 kcal less?'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              {lang === 'he'
                ? '1 ק״ג שומן ≈ 7,700 קק״ל. גרעון של 500 קק״ל ביום × 7 ימים = 3,500 קק״ל בשבוע ≈ 0.5 ק״ג שומן שרוף. זהו הקצב המומלץ — מהיר מספיק כדי להרגיש התקדמות, איטי מספיק כדי לשמור על מסת שריר.'
                : '1 kg of fat ≈ 7,700 kcal. A 500 kcal/day deficit × 7 days = 3,500 kcal/week ≈ 0.5 kg fat burned. This is the recommended rate — fast enough to feel progress, slow enough to preserve muscle mass.'}
            </p>
          </div>
        )}
        {draft.goalType === 'gain' && (
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {lang === 'he'
              ? '+300 קק״ל מעל ה-TDEE — עודף מבוקר שתומך בבניית שריר מבלי להצטבר כשומן מיותר.'
              : '+300 kcal above TDEE — a controlled surplus supporting muscle gain without unnecessary fat accumulation.'}
          </p>
        )}

        {/* Suggested Protein */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
            {lang === 'he' ? 'יעד חלבון מומלץ' : 'Suggested Protein Goal'}
          </span>
          <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--green-hi)' }}>
            {suggestedProt} <span style={{ fontSize: 11, fontWeight: 400 }}>{t(lang, 'proteinUnit')}</span>
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
          {lang === 'he'
            ? `${protRateLabel} גרם × ${draft.weight} ק״ג — ${protReasonHe}`
            : `${protRateLabel}g × ${draft.weight} kg — ${protReasonEn}`}
        </p>

        <button
          onClick={handleApply}
          className={applied ? 'btn-confirm' : 'btn-primary'}
          style={{ width: '100%', height: 44 }}
        >
          {applied
            ? <><span className="icon icon-sm" style={{ verticalAlign: 'middle', marginInlineEnd: 4 }}>check</span>{lang === 'he' ? 'הוחל!' : 'Applied!'}</>
            : t(lang, 'applyGoals')
          }
        </button>
      </div>

      {/* BMI */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
            {lang === 'he' ? 'BMI — מדד מסת גוף' : 'BMI — Body Mass Index'}
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, color: bmiColor }}>
            {bmi} — <span style={{ fontSize: 13 }}>{bmiLabel}</span>
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
          {lang === 'he'
            ? 'תת משקל < 18.5 | תקין 18.5–24.9 | עודף משקל 25–29.9 | השמנה ≥ 30'
            : 'Underweight < 18.5 | Normal 18.5–24.9 | Overweight 25–29.9 | Obese ≥ 30'}
        </p>
      </div>

      {/* Units preferences */}
      <div style={{ height: 1, background: 'var(--border)', margin: '18px 0' }} />
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {lang === 'he' ? 'יחידות מידה' : 'Units'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {/* Weight unit */}
        <div>
          <label style={labelStyle}>{lang === 'he' ? 'משקל' : 'Weight'}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['g', 'oz'] as const).map(u => (
              <button
                key={u}
                onClick={() => set('weightUnit', u)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: draft.weightUnit === u ? 'rgba(59,130,246,0.18)' : 'var(--bg-card)',
                  border: `1.5px solid ${draft.weightUnit === u ? 'var(--blue)' : 'var(--border)'}`,
                  color: draft.weightUnit === u ? 'var(--blue-hi)' : 'var(--text-2)',
                  transition: 'all .15s',
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        {/* Volume unit */}
        <div>
          <label style={labelStyle}>{lang === 'he' ? 'נוזלים' : 'Volume'}</label>
          <select
            className="inp"
            value={draft.volumeUnit}
            onChange={e => set('volumeUnit', e.target.value as any)}
            style={{ cursor: 'pointer', padding: '0 10px', height: 40 }}
          >
            {(['ml', 'cup', 'tbsp', 'tsp', 'fl_oz'] as const).map(u => (
              <option key={u} value={u}>{u === 'fl_oz' ? 'fl oz' : u}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Save Profile */}
      <button
        onClick={handleSave}
        className={saved ? 'btn-confirm' : 'btn-ghost'}
        style={{ width: '100%', height: 48, borderRadius: 12, fontSize: 14 }}
      >
        {saved
          ? <><span className="icon icon-sm" style={{ verticalAlign: 'middle', marginInlineEnd: 4 }}>check</span>{t(lang, 'profileSaved')}</>
          : t(lang, 'saveProfile')
        }
      </button>
    </>
  )
}

// ── Goals Screen ──────────────────────────────────────────────────────────────

function GoalsScreen({ lang, profile, goals, onSave, onBack, showToast }: {
  lang:      Lang
  profile:   UserProfile
  goals:     Goal | null
  onSave:    (updates: Partial<Goal>) => void
  onBack:    () => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [defCal,  setDefCal]  = useState(goals?.default_calories ?? 1700)
  const [defProt, setDefProt] = useState(goals?.default_protein  ?? 160)
  const [overrides, setOverrides] = useState<Record<string, { calories: number; protein: number }>>(goals?.weekly_overrides ?? {})
  const [saved, setSaved]     = useState(false)
  const [expandAll, setExpandAll] = useState(false)

  const todayKey    = DAY_KEYS[new Date().getDay()]
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey)

  useEffect(() => {
    if (goals) {
      setDefCal(goals.default_calories)
      setDefProt(goals.default_protein)
      setOverrides(goals.weekly_overrides ?? {})
    }
  }, [goals])

  const tdee = useMemo(() => calcTDEE(profile), [profile])
  const suggestedCal = tdee + (profile.goalType === 'lose' ? -500 : profile.goalType === 'gain' ? 300 : 0)

  const hasOverride = (dayKey: DayKey) => !!overrides[toWeekIndex(dayKey)]

  const getVal = (dayKey: DayKey, field: 'calories' | 'protein') => {
    const entry = overrides[toWeekIndex(dayKey)]
    return entry?.[field] ?? (field === 'calories' ? defCal : defProt)
  }

  const getDiff = (dayKey: DayKey, field: 'calories' | 'protein'): string | null => {
    if (!hasOverride(dayKey)) return null
    const val  = getVal(dayKey, field)
    const def  = field === 'calories' ? defCal : defProt
    const diff = val - def
    if (diff === 0) return null
    const unit = field === 'protein' ? 'g' : ''
    return diff > 0 ? `(+${diff}${unit})` : `(${diff}${unit})`
  }

  const setDayOverride = (dayKey: DayKey, field: 'calories' | 'protein', value: string) => {
    const idx = toWeekIndex(dayKey)
    setOverrides(prev => ({
      ...prev,
      [idx]: { calories: prev[idx]?.calories ?? defCal, protein: prev[idx]?.protein ?? defProt, [field]: Number(value) },
    }))
  }

  const resetDay = (dayKey: DayKey) => {
    const idx = toWeekIndex(dayKey)
    setOverrides(prev => { const n = { ...prev }; delete n[idx as keyof typeof n]; return n })
  }

  const dayShort = (dayKey: DayKey) => lang === 'he' ? DAY_SHORT_HE[dayKey] : DAY_SHORT_EN[dayKey]

  const handleSave = () => {
    onSave({ default_calories: defCal, default_protein: defProt, weekly_overrides: overrides })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    showToast(lang === 'he' ? 'היעדים נשמרו' : 'Goals saved', 'success')
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6,
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 18px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-2)', display: 'flex' }}>
          <span className="icon">{lang === 'he' ? 'arrow_forward' : 'arrow_back'}</span>
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          {t(lang, 'dailyGoalsLabel')}
        </h2>
      </div>

      {/* TDEE suggestion banner */}
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-hi)', margin: '0 0 5px' }}>
          {lang === 'he'
            ? `TDEE מהפרופיל שלך: ${tdee.toLocaleString()} קק״ל`
            : `Your profile TDEE: ${tdee.toLocaleString()} kcal`}
        </p>
        {profile.goalType === 'lose' ? (
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.6 }}>
            {lang === 'he'
              ? `מוצע: ${suggestedCal.toLocaleString()} קק״ל (גרעון 500). מדוע 500? 1 ק״ג שומן ≈ 7,700 קק״ל. 500 ביום × 7 = 3,500 קק״ל ≈ 0.5 ק״ג/שבוע — קצב בטוח ובר-קיימא שמשמר שריר.`
              : `Suggested: ${suggestedCal.toLocaleString()} kcal (500 deficit). Why 500? 1 kg fat ≈ 7,700 kcal. 500/day × 7 = 3,500 kcal ≈ 0.5 kg/week — safe, sustainable rate that preserves muscle.`}
          </p>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 10px' }}>
            {lang === 'he'
              ? `מוצע: ${suggestedCal.toLocaleString()} קק״ל`
              : `Suggested: ${suggestedCal.toLocaleString()} kcal`}
          </p>
        )}
        <button
          onClick={() => setDefCal(suggestedCal)}
          style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
            color: 'var(--blue-hi)',
          }}
        >
          {lang === 'he' ? 'החל הצעה' : 'Apply Suggestion'}
        </button>
      </div>

      {/* Default goals */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        {t(lang, 'defaultGoals')}
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, color: 'var(--blue-hi)' }}>
            {t(lang, 'calories')} ({t(lang, 'caloriesUnit')})
          </label>
          <div style={{ position: 'relative' }}>
            <input type="number" inputMode="numeric" className="inp"
              style={{ paddingInlineEnd: defCal > 0 ? 32 : undefined }}
              value={defCal === 0 ? '' : defCal} placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => setDefCal(Number(e.target.value))} />
            {defCal > 0 && (
              <button
                onMouseDown={e => { e.preventDefault(); setDefCal(0) }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, color: 'var(--green-hi)' }}>
            {t(lang, 'protein')} ({t(lang, 'proteinUnit')})
          </label>
          <div style={{ position: 'relative' }}>
            <input type="number" inputMode="decimal" className="inp inp-green"
              style={{ paddingInlineEnd: defProt > 0 ? 32 : undefined }}
              value={defProt === 0 ? '' : defProt} placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => setDefProt(Number(e.target.value))} />
            {defProt > 0 && (
              <button
                onMouseDown={e => { e.preventDefault(); setDefProt(0) }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Weekly overrides */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
          {t(lang, 'weeklyAdjustments')}
        </p>
        {Object.keys(overrides).length > 0 && (
          <button
            onClick={() => setOverrides({})}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
          >
            <span className="icon icon-sm">restart_alt</span>
            <span style={{ fontSize: 11 }}>{t(lang, 'resetAllToDefault')}</span>
          </button>
        )}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 12 }}>
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
                border: `1.5px solid ${isSelected ? '#6366f1' : isCustom ? 'rgba(99,102,241,0.45)' : isToday ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`,
                background: isSelected ? 'rgba(99,102,241,0.15)' : isCustom ? 'rgba(99,102,241,0.06)' : isToday ? 'rgba(59,130,246,0.07)' : 'transparent',
                boxShadow: isSelected ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none',
                transition: 'all .15s',
              }}
            >
              {isToday && (
                <span style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', background: 'var(--blue)', color: '#fff', fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                  {t(lang, 'today')}
                </span>
              )}
              <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--text)' : isCustom ? '#a5b4fc' : isToday ? 'var(--blue-hi)' : 'var(--text-3)' }}>
                {dayShort(dayKey)}
              </span>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: isCustom ? '#6366f1' : isToday ? 'var(--blue)' : 'var(--border)' }} />
            </button>
          )
        })}
      </div>

      <DayPanel
        dayKey={selectedDay}
        lang={lang}
        todayKey={todayKey}
        isCustom={hasOverride(selectedDay)}
        calVal={getVal(selectedDay, 'calories')}
        protVal={getVal(selectedDay, 'protein')}
        calDiff={getDiff(selectedDay, 'calories')}
        protDiff={getDiff(selectedDay, 'protein')}
        onChangeCal={v => setDayOverride(selectedDay, 'calories', v)}
        onChangeProt={v => setDayOverride(selectedDay, 'protein', v)}
        onReset={() => resetDay(selectedDay)}
      />

      {/* Expand / collapse all days */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <button
          onClick={() => setExpandAll(e => !e)}
          style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
        >
          <span className="icon icon-sm">{expandAll ? 'unfold_less' : 'unfold_more'}</span>
          {t(lang, expandAll ? 'collapseAllDays' : 'expandAllDays')}
        </button>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {expandAll && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {DAY_KEYS.map(dayKey => (
            <DayPanel
              key={dayKey}
              dayKey={dayKey}
              compact
              lang={lang}
              todayKey={todayKey}
              isCustom={hasOverride(dayKey)}
              calVal={getVal(dayKey, 'calories')}
              protVal={getVal(dayKey, 'protein')}
              calDiff={getDiff(dayKey, 'calories')}
              protDiff={getDiff(dayKey, 'protein')}
              onChangeCal={v => setDayOverride(dayKey, 'calories', v)}
              onChangeProt={v => setDayOverride(dayKey, 'protein', v)}
              onReset={() => resetDay(dayKey)}
            />
          ))}
        </div>
      )}

      {/* Save */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn-ghost" onClick={onBack} style={{ height: 48, fontSize: 14, borderRadius: 12, flex: 1 }}>
          {t(lang, 'cancel')}
        </button>
        <button
          className={saved ? 'btn-confirm' : 'btn-primary'}
          onClick={handleSave}
          style={{ height: 48, fontSize: 14, borderRadius: 12, flex: 1 }}
        >
          {saved
            ? <><span className="icon icon-sm" style={{ verticalAlign: 'middle', marginInlineEnd: 4 }}>check</span>{lang === 'he' ? 'נשמר!' : 'Saved!'}</>
            : t(lang, 'saveGoals')
          }
        </button>
      </div>
    </>
  )
}

// ── Food History Screen ───────────────────────────────────────────────────────

function FoodHistoryScreen({ lang, history, composedGroups, onDelete, onUpdate, onRemoveGroup, onBack, showToast }: {
  lang:           Lang
  history:        FoodHistory[]
  composedGroups: ComposedGroup[]
  onDelete:       (id: string) => void
  onUpdate:       (id: string, updates: Partial<Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>>) => void
  onRemoveGroup:  (id: string) => void
  onBack:         () => void
  showToast:      (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [search, setSearch]       = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ name: string; grams: string; calories: string; protein: string }>({ name: '', grams: '', calories: '', protein: '' })
  const [tab, setTab]             = useState<'foods' | 'composed'>('foods')
  // Per-gram ratios of the item being edited — used for proportional scaling when grams changes
  const editRatios = useRef({ calPerGram: 0, protPerGram: 0 })

  const q = search.trim().toLowerCase()
  const filtered = q
    ? history.filter(h => h.name.toLowerCase().includes(q))
    : [...history].sort((a, b) => b.use_count - a.use_count)

  const startEdit = (item: FoodHistory) => {
    const absGrams = Math.abs(item.grams) || 1
    editRatios.current = { calPerGram: item.calories / absGrams, protPerGram: item.protein / absGrams }
    setEditingId(item.id)
    setEditDraft({ name: item.name, grams: String(item.grams), calories: String(Math.round(item.calories)), protein: String(Math.round(item.protein * 10) / 10) })
  }

  const handleGramsChange = (val: string) => {
    const g = Math.abs(Number(val)) || 0
    const { calPerGram, protPerGram } = editRatios.current
    setEditDraft(d => ({
      ...d,
      grams:    val,
      calories: g > 0 ? String(Math.round(calPerGram  * g))           : d.calories,
      protein:  g > 0 ? String(Math.round(protPerGram * g * 10) / 10) : d.protein,
    }))
  }

  const saveEdit = () => {
    if (!editingId) return
    onUpdate(editingId, { name: editDraft.name, grams: Number(editDraft.grams), calories: Number(editDraft.calories), protein: Number(editDraft.protein) })
    setEditingId(null)
    showToast(lang === 'he' ? 'נשמר' : 'Saved', 'success')
  }
  const handleDelete = (id: string, name: string) => {
    onDelete(id)
    showToast(lang === 'he' ? `"${name}" נמחק` : `"${name}" deleted`, 'info')
  }
  const handleRemoveGroup = (id: string, name: string) => {
    onRemoveGroup(id)
    showToast(lang === 'he' ? `"${name}" נמחק` : `"${name}" deleted`, 'info')
  }

  const inputSm: React.CSSProperties = { height: 34, fontSize: 12, padding: '0 8px', borderRadius: 8 }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-2)', display: 'flex' }}>
          <span className="icon">{lang === 'he' ? 'arrow_forward' : 'arrow_back'}</span>
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0, flex: 1 }}>
          {lang === 'he' ? 'ניהול מזונות' : 'Manage foods'}
        </h2>
      </div>

      {/* Tab switcher */}
      <div className="tab-bar" style={{ marginBottom: 12 }}>
        {(['foods', 'composed'] as const).map(key => (
          <button key={key} onClick={() => setTab(key)} className={`tab-btn ${tab === key ? 'active' : ''}`} style={{ fontSize: 12 }}>
            {key === 'foods'
              ? (lang === 'he' ? `מזונות (${history.length})` : `Foods (${history.length})`)
              : (lang === 'he' ? `מנות (${composedGroups.length})` : `Dishes (${composedGroups.length})`)}
          </button>
        ))}
      </div>

      {tab === 'foods' && (
        <>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span className="icon" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(lang === 'he' ? { right: 10 } : { left: 10 }), color: 'var(--text-3)', fontSize: 18, pointerEvents: 'none' }}>search</span>
            <input className="inp" type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={lang === 'he' ? 'חיפוש...' : 'Search...'}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              style={lang === 'he' ? { paddingRight: 36 } : { paddingLeft: 36 }}
            />
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>search_off</span>
              <p style={{ fontSize: 13, margin: 0 }}>{lang === 'he' ? 'לא נמצאו תוצאות' : 'No results'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(item => {
                const isEditing = editingId === item.id
                const amtLabel  = item.grams < 0
                  ? `${Math.abs(item.grams)} ${lang === 'he' ? 'יח׳' : 'pcs'}`
                  : `${item.grams}g`
                return (
                  <div key={item.id} style={{ background: 'var(--bg-card)', border: `1px solid ${isEditing ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color .15s' }}>
                    {!isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                            {amtLabel} · <span style={{ color: 'var(--blue-hi)', fontWeight: 600 }}>{Math.round(item.calories)}</span> {t(lang, 'caloriesUnit')} · <span style={{ color: 'var(--green-hi)', fontWeight: 600 }}>{Math.round(item.protein * 10) / 10}</span>{t(lang, 'proteinUnit')} · {item.use_count}×
                          </p>
                        </div>
                        <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 6, display: 'flex', borderRadius: 8 }}>
                          <span className="icon icon-sm">edit</span>
                        </button>
                        <button onClick={() => handleDelete(item.id, item.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6, display: 'flex', borderRadius: 8 }}>
                          <span className="icon icon-sm">delete</span>
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input className="inp" value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                          placeholder={lang === 'he' ? 'שם' : 'Name'} style={inputSm} dir={lang === 'he' ? 'rtl' : 'ltr'} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>{lang === 'he' ? 'גרם/יח׳' : 'g/pcs'}</label>
                            <input className="inp" type="number" inputMode="decimal" value={editDraft.grams}
                              onFocus={e => e.target.select()}
                              onChange={e => handleGramsChange(e.target.value)}
                              style={{ ...inputSm, borderColor: 'rgba(59,130,246,0.5)' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue-hi)', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                              {t(lang, 'caloriesUnit')}
                              <span className="icon" style={{ fontSize: 10, opacity: 0.6 }} title={lang === 'he' ? 'מחושב אוטומטית לפי גרם' : 'Auto-scaled from grams'}>calculate</span>
                            </label>
                            <input className="inp" type="number" inputMode="decimal" value={editDraft.calories}
                              onFocus={e => e.target.select()}
                              onChange={e => setEditDraft(d => ({ ...d, calories: e.target.value }))}
                              style={inputSm} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--green-hi)', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                              {t(lang, 'proteinUnit')}
                              <span className="icon" style={{ fontSize: 10, opacity: 0.6 }} title={lang === 'he' ? 'מחושב אוטומטית לפי גרם' : 'Auto-scaled from grams'}>calculate</span>
                            </label>
                            <input className="inp" type="number" inputMode="decimal" value={editDraft.protein}
                              onFocus={e => e.target.select()}
                              onChange={e => setEditDraft(d => ({ ...d, protein: e.target.value }))}
                              style={inputSm} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setEditingId(null)} className="btn-ghost" style={{ flex: 1, height: 34, fontSize: 12, borderRadius: 8 }}>
                            {t(lang, 'cancel')}
                          </button>
                          <button onClick={saveEdit} className="btn-primary" style={{ flex: 1, height: 34, fontSize: 12, borderRadius: 8 }}>
                            {lang === 'he' ? 'שמור' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'composed' && (
        <>
          {composedGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>restaurant</span>
              <p style={{ fontSize: 13, margin: 0 }}>{lang === 'he' ? 'אין מנות מורכבות' : 'No composed dishes'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {composedGroups.map(group => (
                <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <span className="icon icon-sm" style={{ color: 'var(--purple)', flexShrink: 0 }}>restaurant</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                      {group.mealIds.length} {lang === 'he' ? 'מרכיבים' : 'ingredients'}
                    </p>
                  </div>
                  <button onClick={() => handleRemoveGroup(group.id, group.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 6, display: 'flex', borderRadius: 8, flexShrink: 0 }}>
                    <span className="icon icon-sm">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

// ── Library Screen ────────────────────────────────────────────────────────────

const LIBRARY_CATEGORIES_HE: Record<string, string> = {
  vegetable: 'ירקות', fruit: 'פירות', protein_meat: 'עוף ובשר',
  protein_fish: 'דגים', egg_dairy: 'ביצים ויוגורט', cheese: 'גבינות',
  nuts: 'אגוזים ופיצוחים', grain: 'דגנים', legume: 'קטניות',
  oil_fat: 'שמנים ושומנים', sauce_spread: 'רטבים וממרחים', beverage: 'משקאות',
}
const LIBRARY_CATEGORIES_EN: Record<string, string> = {
  vegetable: 'Vegetables', fruit: 'Fruits', protein_meat: 'Chicken & Meat',
  protein_fish: 'Fish', egg_dairy: 'Eggs & Dairy', cheese: 'Cheeses',
  nuts: 'Nuts & Seeds', grain: 'Grains', legume: 'Legumes',
  oil_fat: 'Oils & Fats', sauce_spread: 'Sauces & Spreads', beverage: 'Beverages',
}
const CATEGORY_ORDER = ['protein_meat', 'protein_fish', 'egg_dairy', 'cheese', 'vegetable', 'fruit', 'grain', 'legume', 'nuts', 'oil_fat', 'sauce_spread', 'beverage']

function LibraryScreen({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const { library, loading } = useFoodLibrary()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = useCallback(() => CATEGORY_ORDER, [])()
  const catLabels = lang === 'he' ? LIBRARY_CATEGORIES_HE : LIBRARY_CATEGORIES_EN

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return library.filter(item => {
      const matchCat  = !activeCategory || item.category === activeCategory
      const matchText = !q || item.name_he.toLowerCase().includes(q) || item.name_en.toLowerCase().includes(q)
      return matchCat && matchText
    })
  }, [library, search, activeCategory])

  const isRTL   = lang === 'he'

  return (
    <>
      {/* Back header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4, display: 'flex', borderRadius: 8 }}>
          <span className="icon icon-sm">{isRTL ? 'arrow_forward' : 'arrow_back'}</span>
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0, flex: 1 }}>
          {lang === 'he' ? 'ספריית מזונות' : 'Food Library'}
        </h2>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {library.length} {lang === 'he' ? 'פריטים' : 'items'}
        </span>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <span className="icon icon-sm" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(isRTL ? { right: 10 } : { left: 10 }), color: 'var(--text-3)', pointerEvents: 'none' }}>search</span>
        <input
          className="inp"
          type="search"
          placeholder={lang === 'he' ? 'חיפוש מזון...' : 'Search food...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...(isRTL ? { paddingRight: 34 } : { paddingLeft: 34 }) }}
        />
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 12, scrollbarWidth: 'none' }}>
        <button
          onClick={() => setActiveCategory(null)}
          style={{
            padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background .12s, color .12s',
            background: activeCategory === null ? 'var(--blue)' : 'var(--surface-2)',
            color: activeCategory === null ? '#fff' : 'var(--text-2)',
          }}
        >
          {lang === 'he' ? 'הכל' : 'All'}
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            style={{
              padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background .12s, color .12s',
              background: activeCategory === cat ? 'var(--blue)' : 'var(--surface-2)',
              color: activeCategory === cat ? '#fff' : 'var(--text-2)',
            }}
          >
            {catLabels[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="icon" style={{ fontSize: 24, display: 'block', marginBottom: 8, animation: 'spin 0.7s linear infinite' }}>progress_activity</span>
          {lang === 'he' ? 'טוען...' : 'Loading...'}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="icon" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.4 }}>search_off</span>
          {lang === 'he' ? 'לא נמצאו תוצאות' : 'No results found'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((item, i) => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 4px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lang === 'he' ? item.name_he : item.name_en}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                  {catLabels[item.category] ?? item.category}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600 }}>{item.calories_per_100g} {lang === 'he' ? 'קל' : 'cal'}</span>
                <span style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600 }}>{item.protein_per_100g}g</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>/{lang === 'he' ? '100' : '100'}g</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── SettingsSheet ─────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  isOpen:          boolean
  onClose:         () => void
  lang:            Lang
  connected:       boolean
  profile:         UserProfile
  onSaveProfile:   (updates: Partial<UserProfile>) => void | Promise<void>
  goals:           Goal | null
  onSaveGoals:     (updates: Partial<Goal>) => void
  onToggleLang:    () => void
  onSignOut:       () => void
  theme:           'dark' | 'light'
  onToggleTheme:   () => void
  showToast:       (message: string, type: Toast['type']) => void
  history:         FoodHistory[]
  onDeleteHistory: (id: string) => void
  onUpdateHistory: (id: string, updates: Partial<Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>>) => void
  composedGroups:  ComposedGroup[]
  onRemoveGroup:   (id: string) => void
}

export function SettingsSheet({
  isOpen, onClose, lang, connected, profile, onSaveProfile, goals, onSaveGoals, onToggleLang, onSignOut, theme, onToggleTheme, showToast,
  history, onDeleteHistory, onUpdateHistory, composedGroups, onRemoveGroup,
}: SettingsSheetProps) {
  const [screen, setScreen] = useState<Screen>('main')
  useLockBodyScroll(isOpen)
  const { scrollRef, scrolledDown, onScroll } = useSheetScroll()
  const sheetRef = useRef<HTMLDivElement>(null)

  const handleClose = () => {
    setScreen('main')
    onClose()
  }

  useFocusTrap(sheetRef, isOpen)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (screen !== 'main') { setScreen('main'); return }
      handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, screen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99,
          background: 'var(--modal-backdrop)',
          backdropFilter: isOpen ? 'blur(2px)' : 'none',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'all' : 'none',
          transition: 'opacity 0.3s, backdrop-filter 0.3s',
        }}
      />

      {/* Sheet — wrapper centres to app width, inner div animates */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
      <div ref={sheetRef} style={{
        width: '100%', maxWidth: 560,
        pointerEvents: 'all',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        borderLeft: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderRadius: '20px 20px 0 0',
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        transform: isOpen ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 0.35s cubic-bezier(.22,.9,.36,1)',
      }}>

        <SheetHandle scrolledDown={scrolledDown} onClose={handleClose} />

        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{
            flex: 1, overflowY: 'auto',
            padding: '20px 16px',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
          }}
        >
          {screen === 'main' && (
            <MainScreen
              lang={lang}
              connected={connected}
              theme={theme}
              onProfile={() => setScreen('profile')}
              onGoals={() => setScreen('goals')}
              onFoodHistory={() => setScreen('foodHistory')}
              onLibrary={() => setScreen('library')}
              onToggleLang={onToggleLang}
              onToggleTheme={onToggleTheme}
              onSignOut={() => { handleClose(); onSignOut() }}
            />
          )}
          {screen === 'profile' && (
            <ProfileScreen
              lang={lang}
              profile={profile}
              onSave={onSaveProfile}
              onApplyGoals={(cal, prot) => onSaveGoals({ default_calories: cal, default_protein: prot })}
              onBack={() => setScreen('main')}
              onNavigateToGoals={() => setScreen('goals')}
              showToast={showToast}
            />
          )}
          {screen === 'goals' && (
            <GoalsScreen
              lang={lang}
              profile={profile}
              goals={goals}
              onSave={onSaveGoals}
              onBack={() => setScreen('main')}
              showToast={showToast}
            />
          )}
          {screen === 'foodHistory' && (
            <FoodHistoryScreen
              lang={lang}
              history={history}
              composedGroups={composedGroups}
              onDelete={onDeleteHistory}
              onUpdate={onUpdateHistory}
              onRemoveGroup={onRemoveGroup}
              onBack={() => setScreen('main')}
              showToast={showToast}
            />
          )}
          {screen === 'library' && (
            <LibraryScreen
              lang={lang}
              onBack={() => setScreen('main')}
            />
          )}
        </div>
      </div>
      </div>
    </>
  )
}
