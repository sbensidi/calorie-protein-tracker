import { useState, useMemo, useEffect } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { useSheetScroll } from '../hooks/useSheetScroll'
import { SheetHandle } from './SheetHandle'
import type { Lang, DayKey } from '../lib/i18n'
import { t, DAY_KEYS } from '../lib/i18n'
import type { Goal } from '../types'
import type { UserProfile } from '../hooks/useProfile'

// ── Constants ─────────────────────────────────────────────────────────────────

type Screen = 'main' | 'profile' | 'goals'

const ACTIVITY_MULTIPLIERS = [1.2, 1.375, 1.55, 1.725, 1.9]

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

function MainScreen({ lang, connected, theme, onProfile, onGoals, onToggleLang, onToggleTheme, onSignOut }: {
  lang:           Lang
  connected:      boolean
  theme:          'dark' | 'light'
  onProfile:      () => void
  onGoals:        () => void
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

function ProfileScreen({ lang, profile, onSave, onApplyGoals, onBack }: {
  lang:         Lang
  profile:      UserProfile
  onSave:       (updates: Partial<UserProfile>) => void
  onApplyGoals: (calories: number, protein: number) => void
  onBack:       () => void
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
  }

  const handleApply = () => {
    onSave(draft)
    onApplyGoals(suggestedCal, suggestedProt)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
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

function GoalsScreen({ lang, profile, goals, onSave, onBack }: {
  lang:    Lang
  profile: UserProfile
  goals:   Goal | null
  onSave:  (updates: Partial<Goal>) => void
  onBack:  () => void
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

  const hasOverride = (dayKey: DayKey) => !!overrides[DAY_INDEX[dayKey]]

  const getVal = (dayKey: DayKey, field: 'calories' | 'protein') => {
    const entry = overrides[DAY_INDEX[dayKey]]
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
    const idx = DAY_INDEX[dayKey]
    setOverrides(prev => ({
      ...prev,
      [idx]: { calories: prev[idx]?.calories ?? defCal, protein: prev[idx]?.protein ?? defProt, [field]: Number(value) },
    }))
  }

  const resetDay = (dayKey: DayKey) => {
    const idx = DAY_INDEX[dayKey]
    setOverrides(prev => { const n = { ...prev }; delete n[idx]; return n })
  }

  const dayShort = (dayKey: DayKey) => lang === 'he' ? DAY_SHORT_HE[dayKey] : DAY_SHORT_EN[dayKey]

  const handleSave = () => {
    onSave({ default_calories: defCal, default_protein: defProt, weekly_overrides: overrides })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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

// ── SettingsSheet ─────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  isOpen:         boolean
  onClose:        () => void
  lang:           Lang
  connected:      boolean
  profile:        UserProfile
  onSaveProfile:  (updates: Partial<UserProfile>) => void
  goals:          Goal | null
  onSaveGoals:    (updates: Partial<Goal>) => void
  onToggleLang:   () => void
  onSignOut:      () => void
  theme:          'dark' | 'light'
  onToggleTheme:  () => void
}

export function SettingsSheet({
  isOpen, onClose, lang, connected, profile, onSaveProfile, goals, onSaveGoals, onToggleLang, onSignOut, theme, onToggleTheme
}: SettingsSheetProps) {
  const [screen, setScreen] = useState<Screen>('main')
  useLockBodyScroll(isOpen)
  const { scrollRef, scrolledDown, onScroll } = useSheetScroll()

  const handleClose = () => {
    setScreen('main')
    onClose()
  }

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
      <div style={{
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
            />
          )}
          {screen === 'goals' && (
            <GoalsScreen
              lang={lang}
              profile={profile}
              goals={goals}
              onSave={onSaveGoals}
              onBack={() => setScreen('main')}
            />
          )}
        </div>
      </div>
      </div>
    </>
  )
}
