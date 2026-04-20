import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate } from '../lib/i18n'
import { ProgressBar } from './ProgressBar'

interface DailySummaryProps {
  meals: Meal[]
  date: string
  goalCalories: number
  goalProtein: number
  lang: Lang
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

export function DailySummary({ meals, date, goalCalories, goalProtein, lang }: DailySummaryProps) {
  const totalCalories = Math.round(meals.reduce((s, m) => s + m.calories, 0))
  const totalProtein  = Math.round(meals.reduce((s, m) => s + m.protein,  0) * 10) / 10

  const remCal  = Math.round(goalCalories - totalCalories)
  const remProt = Math.round((goalProtein  - totalProtein) * 10) / 10

  const calLabel  = remainingLabel(remCal,  t(lang, 'caloriesUnit'), lang)
  const protLabel = remainingLabel(remProt, t(lang, 'proteinUnit'),  lang)

  return (
    <div
      className="fade-up"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 8 }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 14 }}>
        {formatDate(date, lang)}
      </p>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>

        {/* Calories */}
        <div style={{ flex: 1, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue-hi)', marginBottom: 4, letterSpacing: '0.04em' }}>
            {t(lang, 'calories').toUpperCase()}
          </p>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>
            {totalCalories}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3, marginBottom: 6 }}>
            / <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
              <span>{goalCalories}</span>
              <span>{t(lang, 'caloriesUnit')}</span>
            </span>
          </p>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 700,
            padding: '3px 7px', borderRadius: 999,
            background: calLabel.over ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.07)',
            color: calLabel.over ? 'var(--red)' : 'var(--text-2)',
          }}>
            <span className="icon icon-sm" style={{ fontSize: 12 }}>
              {calLabel.over ? 'arrow_upward' : 'arrow_downward'}
            </span>
            {calLabel.text}
          </span>
        </div>

        {/* Protein */}
        <div style={{ flex: 1, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-hi)', marginBottom: 4, letterSpacing: '0.04em' }}>
            {t(lang, 'protein').toUpperCase()}
          </p>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
              <span>{totalProtein}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>{t(lang, 'proteinUnit')}</span>
            </span>
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3, marginBottom: 6 }}>
            / <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
              <span>{goalProtein}</span>
              <span>{t(lang, 'proteinUnit')}</span>
            </span>
          </p>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 700,
            padding: '3px 7px', borderRadius: 999,
            background: protLabel.over ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.07)',
            color: protLabel.over ? 'var(--red)' : 'var(--text-2)',
          }}>
            <span className="icon icon-sm" style={{ fontSize: 12 }}>
              {protLabel.over ? 'arrow_upward' : 'arrow_downward'}
            </span>
            {protLabel.text}
          </span>
        </div>

      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ProgressBar value={totalCalories} goal={goalCalories} color="blue" />
        <ProgressBar value={totalProtein}  goal={goalProtein}  color="green" />
      </div>
    </div>
  )
}
