import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate } from '../lib/i18n'
import { DonutProgress } from './DonutProgress'

interface DailySummaryProps {
  meals:        Meal[]
  date:         string
  goalCalories: number
  goalProtein:  number
  lang:         Lang
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
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>
        {formatDate(date, lang)}
      </p>

      <div style={{ display: 'flex', gap: 10 }}>

        {/* ── Calories card ── */}
        <div style={{ flex: 1, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-hi)', marginBottom: 3, letterSpacing: '0.05em' }}>
                {t(lang, 'calories').toUpperCase()}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalCalories}</span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{t(lang, 'caloriesUnit')}</span>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                / {goalCalories} {t(lang, 'caloriesUnit')}
              </p>
            </div>
            <DonutProgress value={totalCalories} goal={goalCalories} type="calories" size={58} strokeWidth={5} />
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10, fontWeight: 700,
            padding: '3px 8px', borderRadius: 999,
            background: calLabel.over ? 'rgba(244,63,94,0.15)' : 'var(--surface-3)',
            color: calLabel.over ? 'var(--red)' : 'var(--text-2)',
            alignSelf: 'flex-start',
          }}>
            <span className="icon icon-sm" style={{ fontSize: 11 }}>
              {calLabel.over ? 'arrow_upward' : 'arrow_downward'}
            </span>
            {calLabel.text}
          </span>
        </div>

        {/* ── Protein card ── */}
        <div style={{ flex: 1, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-hi)', marginBottom: 3, letterSpacing: '0.05em' }}>
                {t(lang, 'protein').toUpperCase()}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{totalProtein}</span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{t(lang, 'proteinUnit')}</span>
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                / {goalProtein} {t(lang, 'proteinUnit')}
              </p>
            </div>
            <DonutProgress value={totalProtein} goal={goalProtein} type="protein" size={58} strokeWidth={5} />
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10, fontWeight: 700,
            padding: '3px 8px', borderRadius: 999,
            background: protLabel.over ? 'rgba(244,63,94,0.15)' : 'var(--surface-3)',
            color: protLabel.over ? 'var(--red)' : 'var(--text-2)',
            alignSelf: 'flex-start',
          }}>
            <span className="icon icon-sm" style={{ fontSize: 11 }}>
              {protLabel.over ? 'arrow_upward' : 'arrow_downward'}
            </span>
            {protLabel.text}
          </span>
        </div>

      </div>
    </div>
  )
}
