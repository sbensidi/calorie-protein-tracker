import { useState, useMemo } from 'react'
import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate, today } from '../lib/i18n'
import { ProgressBar } from './ProgressBar'

// ── Constants ────────────────────────────────────────────────────────

const MEAL_ICONS: Record<string, string> = {
  breakfast: 'wb_sunny',
  lunch:     'lunch_dining',
  dinner:    'nights_stay',
  snack:     'nutrition',
}

const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const EN_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Types ────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'success' | 'over' | 'under'

interface DayData {
  meals:          Meal[]
  totalCalories:  number
  totalProtein:   number
  goal:           { calories: number; protein: number }
  calOk:          boolean   // calories did not exceed goal
  protOk:         boolean   // protein reached goal
  status:         'success' | 'over' | 'under'
}

interface HistoryTabProps {
  lang:           Lang
  meals:          Meal[]
  getGoalForDate: (date: string) => { calories: number; protein: number }
}

// ── Helpers ──────────────────────────────────────────────────────────

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function dayStatus(calOk: boolean, protOk: boolean): DayData['status'] {
  if (!calOk)  return 'over'
  if (!protOk) return 'under'
  return 'success'
}

// ── Status colours (all from design tokens) ──────────────────────────

const STATUS_COLOR: Record<DayData['status'], { border: string; badge: string; text: string; icon: string }> = {
  success: { border: 'var(--green)',     badge: 'var(--green-tint)',  text: 'var(--green-hi)',  icon: 'check_circle'  },
  over:    { border: 'var(--amber)',     badge: 'var(--amber-tint)',  text: 'var(--amber)',     icon: 'trending_up'   },
  under:   { border: 'var(--indigo)',    badge: 'var(--indigo-tint)', text: 'var(--indigo-hi)', icon: 'trending_down' },
}

// ── Component ────────────────────────────────────────────────────────

export function HistoryTab({ lang, meals, getGoalForDate }: HistoryTabProps) {
  const todayKey = today()

  const [view,         setView]         = useState<'cal' | 'list'>('cal')
  const [calYear,      setCalYear]      = useState(() => new Date().getFullYear())
  const [calMonth,     setCalMonth]     = useState(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search,       setSearch]       = useState('')

  // ── Group meals by date ────────────────────────────────────────────
  const grouped = useMemo<Map<string, DayData>>(() => {
    const byDate = new Map<string, Meal[]>()
    meals.forEach(m => {
      if (m.date === todayKey) return
      byDate.set(m.date, [...(byDate.get(m.date) ?? []), m])
    })
    const result = new Map<string, DayData>()
    byDate.forEach((dayMeals, date) => {
      const goal          = getGoalForDate(date)
      const totalCalories = dayMeals.reduce((s, m) => s + m.calories, 0)
      const totalProtein  = dayMeals.reduce((s, m) => s + m.protein,  0)
      const calOk  = totalCalories <= goal.calories
      const protOk = totalProtein  >= goal.protein
      result.set(date, { meals: dayMeals, totalCalories, totalProtein, goal, calOk, protOk, status: dayStatus(calOk, protOk) })
    })
    return result
  }, [meals, todayKey, getGoalForDate])

  const sortedDates = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a)),
    [grouped],
  )

  // ── Empty state ────────────────────────────────────────────────────
  if (grouped.size === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
        <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>history</span>
        <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noHistory')}</p>
      </div>
    )
  }

  // ── Calendar helpers ───────────────────────────────────────────────
  const changeMonth = (dir: 1 | -1) => {
    setCalMonth(prev => {
      const next = prev + dir
      if (next > 11) { setCalYear(y => y + 1); return 0 }
      if (next < 0)  { setCalYear(y => y - 1); return 11 }
      return next
    })
    setSelectedDate(null)
  }

  const monthLabel = lang === 'he'
    ? `${HE_MONTHS[calMonth]} ${calYear}`
    : `${EN_MONTHS[calMonth]} ${calYear}`

  const firstDow    = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calCells    = [...Array<null>(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const weekDayLabels = lang === 'he'
    ? ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
    : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  // ── Status filter bar (shared) ─────────────────────────────────────
  const filterChips: Array<{ key: StatusFilter; icon: string }> = [
    { key: 'all',     icon: 'filter_list'  },
    { key: 'success', icon: 'check_circle' },
    { key: 'over',    icon: 'trending_up'  },
    { key: 'under',   icon: 'trending_down'},
  ]
  const filterLabel: Record<StatusFilter, string> = {
    all:     t(lang, 'allDays'),
    success: t(lang, 'metGoal'),
    over:    t(lang, 'overGoal'),
    under:   t(lang, 'underGoal'),
  }
  const filterActive: Record<StatusFilter, { bg: string; border: string; color: string }> = {
    all:     { bg: 'var(--blue-tint)',   border: 'rgba(59,130,246,0.35)',  color: 'var(--blue-hi)' },
    success: { bg: 'var(--green-tint)',  border: 'rgba(16,185,129,0.35)',  color: 'var(--green-hi)' },
    over:    { bg: 'var(--amber-tint)',  border: 'rgba(245,158,11,0.35)',  color: 'var(--amber)' },
    under:   { bg: 'var(--indigo-tint)', border: 'rgba(99,102,241,0.35)', color: 'var(--indigo-hi)' },
  }

  const StatusFilterBar = () => (
    <div style={{ display: 'flex', gap: 6 }}>
      {filterChips.map(({ key, icon }) => {
        const isActive = statusFilter === key
        const a = filterActive[key]
        return (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{
              flex: 1, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              padding: '6px 4px', borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              border: `1px solid ${isActive ? a.border : 'var(--border)'}`,
              background: isActive ? a.bg : 'var(--bg-card)',
              color: isActive ? a.color : 'var(--text-3)',
              transition: 'all .15s', whiteSpace: 'nowrap',
            }}
          >
            <span className="icon icon-sm">{icon}</span>
            {filterLabel[key]}
          </button>
        )
      })}
    </div>
  )

  // ── Day card content ───────────────────────────────────────────────
  const DayCardContent = ({ date, data }: { date: string; data: DayData }) => {
    const sc = STATUS_COLOR[data.status]
    const calDiff  = Math.round(Math.abs(data.totalCalories - data.goal.calories))
    const protDiff = Math.abs(data.totalProtein - data.goal.protein).toFixed(1)
    const protUnit = t(lang, 'proteinUnit')

    const calHint  = data.calOk  ? `${t(lang, 'goal')}: ${data.goal.calories}` : `+${calDiff} ${lang === 'he' ? 'מעל היעד' : 'over goal'}`
    const protHint = data.protOk ? `${t(lang, 'goal')}: ${data.goal.protein}`  : `${protDiff}${protUnit} ${lang === 'he' ? 'מתחת ליעד' : 'under goal'}`

    return (
      <>
        {/* Summary row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            {formatDate(date, lang)}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {data.meals.length} {t(lang, 'items')}
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
              background: sc.badge, color: sc.text,
            }}>
              <span className="icon icon-sm">{sc.icon}</span>
              {filterLabel[data.status]}
            </span>
          </div>
        </div>

        {/* Totals */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue-hi)' }}>
                {Math.round(data.totalCalories)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{t(lang, 'caloriesUnit')}</span>
            </div>
            <div style={{ fontSize: 10, color: data.calOk ? 'var(--text-3)' : 'var(--amber)', marginTop: 1 }}>
              {calHint}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-hi)' }}>
                {Math.round(data.totalProtein * 10) / 10}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{protUnit}</span>
            </div>
            <div style={{ fontSize: 10, color: data.protOk ? 'var(--text-3)' : 'var(--indigo-hi)', marginTop: 1 }}>
              {protHint}
            </div>
          </div>
        </div>

        {/* Progress bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <ProgressBar value={data.totalCalories} goal={data.goal.calories} color="blue" />
          <ProgressBar value={data.totalProtein}  goal={data.goal.protein}  color="green" />
        </div>
      </>
    )
  }

  // ── Meals list (shared) ────────────────────────────────────────────
  const MealsList = ({ data }: { data: DayData }) => (
    <div style={{ borderTop: '1px solid var(--border)', padding: '4px 14px' }}>
      {data.meals.map((meal, j) => (
        <div
          key={meal.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0',
            borderBottom: j < data.meals.length - 1 ? '1px solid var(--border)' : 'none',
            paddingBottom: j === data.meals.length - 1 ? 10 : undefined,
          }}
        >
          <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            {MEAL_ICONS[meal.meal_type] ?? 'restaurant'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {meal.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
              {meal.grams}{t(lang, 'proteinUnit')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>
              {Math.round(meal.calories)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)' }}>
              {Math.round(meal.protein * 10) / 10}{t(lang, 'proteinUnit')}
            </span>
          </div>
        </div>
      ))}
    </div>
  )

  // ── View toggle ────────────────────────────────────────────────────
  const ViewToggle = () => (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        display: 'flex', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2,
      }}>
        {(['cal', 'list'] as const).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); setSelectedDate(null); setSearch('') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: 'none',
              background: view === v ? 'var(--indigo-tint)' : 'transparent',
              color:      view === v ? 'var(--indigo-hi)'   : 'var(--text-3)',
              transition: 'all .15s',
            }}
          >
            <span className="icon icon-sm">{v === 'cal' ? 'calendar_month' : 'format_list_bulleted'}</span>
            {t(lang, v === 'cal' ? 'calView' : 'listView')}
          </button>
        ))}
      </div>
    </div>
  )

  // ── Calendar view ──────────────────────────────────────────────────
  if (view === 'cal') {
    // Drill-down: show single day detail
    if (selectedDate) {
      const data = grouped.get(selectedDate)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ViewToggle />
          {/* Back button */}
          <button
            onClick={() => setSelectedDate(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              color: 'var(--blue-hi)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '2px 0',
            }}
          >
            <span className="icon icon-sm">{lang === 'he' ? 'arrow_forward' : 'arrow_back'}</span>
            {t(lang, 'calView')}
          </button>

          {data && (
            <div
              className="card"
              style={{ borderInlineEnd: `3px solid ${STATUS_COLOR[data.status].border}`, overflow: 'hidden' }}
            >
              <div style={{ padding: '14px 14px 12px' }}>
                <DayCardContent date={selectedDate} data={data} />
              </div>
              <MealsList data={data} />
            </div>
          )}
        </div>
      )
    }

    // Calendar grid
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ViewToggle />
        <StatusFilterBar />

        <div className="card" style={{ padding: 14 }}>
          {/* Month header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {([[-1, 'chevron_right'], [1, 'chevron_left']] as const).map(([dir, icon]) => (
                <button
                  key={dir}
                  onClick={() => changeMonth(dir)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: 4, display: 'flex',
                    alignItems: 'center', borderRadius: 7,
                  }}
                >
                  <span className="icon">{icon}</span>
                </button>
              ))}
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{monthLabel}</span>
          </div>

          {/* Weekday labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {weekDayLabels.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '3px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {calCells.map((day, idx) => {
              if (day === null) return <div key={`e${idx}`} />
              const dateKey = toDateKey(calYear, calMonth, day)
              const data    = grouped.get(dateKey)
              const isToday = dateKey === todayKey
              const dimmed  = !!data && statusFilter !== 'all' && data.status !== statusFilter

              return (
                <div
                  key={dateKey}
                  onClick={() => data && setSelectedDate(dateKey)}
                  style={{
                    height: 38,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                    fontSize: 12, fontWeight: 600, borderRadius: 8,
                    cursor: data ? 'pointer' : 'default',
                    color:  isToday ? 'var(--blue-hi)' : data ? 'var(--text-2)' : 'var(--text-3)',
                    background: data ? 'rgba(255,255,255,0.03)' : 'transparent',
                    border: `1.5px solid ${isToday ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
                    opacity: dimmed ? 0.2 : 1,
                    transition: 'opacity .15s',
                  }}
                >
                  <span>{day}</span>
                  {data && (
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      {data.calOk  && <span className="icon" style={{ fontSize: 10, color: 'var(--blue-hi)'  }}>check</span>}
                      {data.protOk && <span className="icon" style={{ fontSize: 10, color: 'var(--green-hi)' }}>check</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 11, color: 'var(--blue-hi)' }}>check</span>
              {t(lang, 'caloriesOk')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 11, color: 'var(--green-hi)' }}>check</span>
              {t(lang, 'proteinMet')}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────
  const filteredDates = sortedDates.filter(date => {
    const data = grouped.get(date)!
    if (statusFilter !== 'all' && data.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return data.meals.some(m => m.name.toLowerCase().includes(q))
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ViewToggle />
      <StatusFilterBar />

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <span
          className="icon"
          style={{ position: 'absolute', insetInlineEnd: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 18, pointerEvents: 'none' }}
        >
          search
        </span>
        <input
          type="text"
          className="inp"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t(lang, 'searchFood')}
          style={{ paddingInlineEnd: 36 }}
        />
      </div>

      {filteredDates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
          <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>search_off</span>
          <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noResults')}</p>
        </div>
      ) : (
        filteredDates.map((date, i) => {
          const data = grouped.get(date)!
          return (
            <details
              key={date}
              className="card fade-up"
              style={{
                animationDelay: `${i * 0.04}s`,
                borderInlineEnd: `3px solid ${STATUS_COLOR[data.status].border}`,
                overflow: 'hidden',
              }}
            >
              <summary style={{ padding: '14px 14px 12px' }}>
                <DayCardContent date={date} data={data} />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                  <span className="icon details-chevron" style={{ fontSize: 16, color: 'var(--text-3)' }}>
                    expand_more
                  </span>
                </div>
              </summary>
              <MealsList data={data} />
            </details>
          )
        })
      )}
    </div>
  )
}
