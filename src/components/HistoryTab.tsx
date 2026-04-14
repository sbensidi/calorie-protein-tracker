import { useMemo } from 'react'
import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate, today } from '../lib/i18n'
import { ProgressBar } from './ProgressBar'

const MEAL_ICONS: Record<string, string> = {
  breakfast: 'wb_sunny',
  lunch:     'lunch_dining',
  dinner:    'nights_stay',
  snack:     'nutrition',
}

interface HistoryTabProps {
  lang: Lang
  meals: Meal[]
  getGoalForDate: (date: string) => { calories: number; protein: number }
}

export function HistoryTab({ lang, meals, getGoalForDate }: HistoryTabProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Meal[]>()
    meals.forEach(m => {
      if (m.date === today()) return
      const list = map.get(m.date) || []
      list.push(m)
      map.set(m.date, list)
    })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [meals])

  if (grouped.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
        <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>history</span>
        <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noHistory')}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {grouped.map(([date, dayMeals], i) => {
        const goal = getGoalForDate(date)
        const totalCalories = dayMeals.reduce((s, m) => s + m.calories, 0)
        const totalProtein  = dayMeals.reduce((s, m) => s + m.protein,  0)

        return (
          <details
            key={date}
            className="card fade-up"
            style={{ animationDelay: `${i * 0.04}s`, overflow: 'hidden' }}
          >
            <summary style={{ padding: '14px 14px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{formatDate(date, lang)}</p>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{dayMeals.length} {t(lang, 'items')}</span>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue-hi)' }}>{Math.round(totalCalories)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{t(lang, 'caloriesUnit')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-hi)' }}>{Math.round(totalProtein * 10) / 10}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{t(lang, 'proteinUnit')}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ProgressBar value={totalCalories} goal={goal.calories} color="blue" />
                <ProgressBar value={totalProtein}  goal={goal.protein}  color="green" />
              </div>
            </summary>

            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
              {dayMeals.map((meal, j) => (
                <div
                  key={meal.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 0',
                    borderBottom: j < dayMeals.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span className="icon icon-sm" style={{ color: 'var(--text-2)', flexShrink: 0 }}>
                    {MEAL_ICONS[meal.meal_type] || 'restaurant'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meal.name}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{meal.grams}g</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)', flexShrink: 0 }}>
                    {Math.round(meal.calories)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)', flexShrink: 0 }}>
                    {Math.round(meal.protein * 10) / 10}g
                  </span>
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
