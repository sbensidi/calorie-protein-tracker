import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate } from '../lib/i18n'
import { DonutProgress } from './DonutProgress'
import { StatusBadge } from './StatusBadge'

interface DailySummaryProps {
  meals:        Meal[]
  date:         string
  goalCalories: number
  goalProtein:  number
  lang:         Lang
  fluidGoalMl?:  number
  fluidTodayMl?: number
}

function remainingLabel(remaining: number, unit: string, lang: Lang): { text: string; over: boolean } {
  const over = remaining < 0
  const abs  = Math.abs(remaining)
  if (lang === 'he') {
    return over
      ? { text: `חרגת ב־${abs} ${unit}`, over: true }
      : { text: `נותרו ${abs} ${unit}`,   over: false }
  }
  return over
    ? { text: `${abs} ${unit} over`,      over: true }
    : { text: `${abs} ${unit} remaining`, over: false }
}

export function DailySummary({ meals, date, goalCalories, goalProtein, lang, fluidGoalMl = 0, fluidTodayMl = 0 }: DailySummaryProps) {
  const totalCalories = Math.round(meals.reduce((s, m) => s + m.calories, 0))
  const totalProtein  = Math.round(meals.reduce((s, m) => s + m.protein,  0) * 10) / 10

  const remCal  = Math.round(goalCalories - totalCalories)
  const remProt = Math.round((goalProtein  - totalProtein) * 10) / 10

  const calLabel  = remainingLabel(remCal,  t(lang, 'caloriesUnit'), lang)
  const protLabel = remainingLabel(remProt, t(lang, 'proteinUnit'),  lang)

  const fmtMl = (ml: number) => ml >= 1000
    ? `${(ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
    : `${Math.round(ml)}ml`
  const remFluid  = Math.round(fluidGoalMl - fluidTodayMl)
  const fluidOver = remFluid < 0
  const fluidLabel = lang === 'he'
    ? fluidOver ? `חרגת ב-${fmtMl(Math.abs(remFluid))}` : `נותרו ${fmtMl(Math.abs(remFluid))}`
    : fluidOver ? `${fmtMl(Math.abs(remFluid))} over` : `${fmtMl(Math.abs(remFluid))} remaining`

  return (
    <div
      className="fade-up"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 8 }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>
        {formatDate(date, lang)}
      </p>

      {/* ── OPTION A — horizontal scroll ── */}
      <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', margin: '0 0 6px', textTransform: 'uppercase' }}>
        {lang === 'he' ? 'אפשרות א — גלילה' : 'Option A — scroll'}
      </p>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 4, marginBottom: 16 }}>

        <div style={{ flex: '0 0 auto', minWidth: 130, scrollSnapAlign: 'start', background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-hi)', marginBottom: 3, letterSpacing: '0.05em' }}>
                {t(lang, 'calories').toUpperCase()}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalCalories}</span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{t(lang, 'caloriesUnit')}</span>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>/ {goalCalories} {t(lang, 'caloriesUnit')}</p>
            </div>
            <DonutProgress value={totalCalories} goal={goalCalories} type="calories" size={58} strokeWidth={5} />
          </div>
          <StatusBadge status={calLabel.over ? 'over' : 'under'} text={calLabel.text} lang={lang} />
        </div>

        <div style={{ flex: '0 0 auto', minWidth: 130, scrollSnapAlign: 'start', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-hi)', marginBottom: 3, letterSpacing: '0.05em' }}>
                {t(lang, 'protein').toUpperCase()}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalProtein}</span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{t(lang, 'proteinUnit')}</span>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>/ {goalProtein} {t(lang, 'proteinUnit')}</p>
            </div>
            <DonutProgress value={totalProtein} goal={goalProtein} type="protein" size={58} strokeWidth={5} />
          </div>
          <StatusBadge status={protLabel.over ? 'over' : 'under'} text={protLabel.text} lang={lang} />
        </div>

        {fluidGoalMl > 0 && (
          <div style={{ flex: '0 0 auto', minWidth: 130, scrollSnapAlign: 'start', background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-hi)', marginBottom: 3, letterSpacing: '0.05em' }}>
                  {lang === 'he' ? 'נוזלים' : 'FLUID'}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: fluidTodayMl >= 1000 ? 20 : 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
                    {fluidTodayMl >= 1000 ? (fluidTodayMl / 1000).toFixed(1) : Math.round(fluidTodayMl)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {fluidTodayMl >= 1000 ? (lang === 'he' ? 'ל׳' : 'L') : 'ml'}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>/ {fmtMl(fluidGoalMl)}</p>
              </div>
              <DonutProgress value={fluidTodayMl} goal={fluidGoalMl} type="fluid" size={58} strokeWidth={5} />
            </div>
            <StatusBadge status={fluidOver ? 'over' : 'under'} text={fluidLabel} lang={lang} />
          </div>
        )}
      </div>

      {/* ── OPTION B — unified donut row ── */}
      <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', margin: '0 0 6px', textTransform: 'uppercase' }}>
        {lang === 'he' ? 'אפשרות ב — שורת דונאטים' : 'Option B — donut row'}
      </p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-around' }}>
        {[
          { value: totalCalories, goal: goalCalories, label: t(lang, 'calories').toUpperCase(), unit: t(lang, 'caloriesUnit'), type: 'calories' as const, color: 'var(--blue-hi)' },
          { value: totalProtein,  goal: goalProtein,  label: t(lang, 'protein').toUpperCase(),  unit: t(lang, 'proteinUnit'),  type: 'protein'  as const, color: 'var(--green-hi)' },
          ...(fluidGoalMl > 0 ? [{ value: fluidTodayMl, goal: fluidGoalMl, label: lang === 'he' ? 'נוזלים' : 'FLUID', unit: 'ml', type: 'fluid' as const, color: 'var(--blue-hi)' }] : []),
        ].map(m => (
          <div key={m.type} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <DonutProgress value={m.value} goal={m.goal} type={m.type} size={64} strokeWidth={5} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', margin: '0 0 2px', letterSpacing: '0.06em' }}>{m.label}</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: m.color, margin: 0 }}>
                {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
                <span style={{ fontSize: 9, color: 'var(--text-3)', marginInlineStart: 2 }}>{m.unit}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
