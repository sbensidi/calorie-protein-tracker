import { useState, useMemo, useRef, useEffect } from 'react'
import { useDebounce } from '../hooks/useDebounce'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { Meal, FoodHistory, ComposedGroup } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate, today, HE_MONTHS, EN_MONTHS } from '../lib/i18n'
import { DonutProgress } from './DonutProgress'
import type { ComposedEntry } from './FoodEntryForm'

// ── Constants ────────────────────────────────────────────────────────

const MEAL_ICONS: Record<string, string> = {
  breakfast: 'wb_sunny',
  lunch:     'lunch_dining',
  dinner:    'nights_stay',
  snack:     'nutrition',
}

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
  lang:             Lang
  meals:            Meal[]
  history:          FoodHistory[]
  getSuggestions:   (q: string) => FoodHistory[]
  getGoalForDate:   (date: string) => { calories: number; protein: number }
  composedEntries?: ComposedEntry[]
  composedGroups?:  ComposedGroup[]
  fluidGoalMl?:     number
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

export function HistoryTab({ lang, meals, history, getGoalForDate, composedEntries = [], composedGroups = [], fluidGoalMl = 2500 }: HistoryTabProps) {
  const todayKey = today()

  const [view, setView] = useState<'cal' | 'list' | 'stats'>(
    () => (localStorage.getItem('history-view') as 'cal' | 'list' | 'stats') ?? 'cal'
  )
  const [calYear,      setCalYear]      = useState(() => new Date().getFullYear())
  const [calMonth,     setCalMonth]     = useState(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (localStorage.getItem('history-filter') as StatusFilter) ?? 'all'
  )
  const [sortAsc, setSortAsc] = useState(false)
  const [chartMetric, setChartMetric] = useState<'cal' | 'prot' | 'fluid'>('cal')
  const [offset7,  setOffset7]  = useState(0) // weeks back (0 = current week)
  const [offset30, setOffset30] = useState(0) // months back (0 = current 30d)
  // Persist search per view
  const [searchByView, setSearchByView] = useState<Record<'cal' | 'list' | 'stats', string>>({ cal: '', list: '', stats: '' })
  const search = searchByView[view]
  const setSearch = (val: string) => setSearchByView(prev => ({ ...prev, [view]: val }))
  const debouncedSearch = useDebounce(search, 150)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set())
  const toggleGroupExpand = (id: string) =>
    setExpandedGroupIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Scroll-aware sticky (list view only) ──────────────────────────
  const [scrolledDown, setScrolledDown] = useState(false)
  const lastScrollY = useRef(0)
  useEffect(() => {
    const onScroll = () => {
      if (view !== 'list') { setScrolledDown(false); lastScrollY.current = window.scrollY; return }
      const y = window.scrollY
      const delta = y - lastScrollY.current
      if (Math.abs(delta) < 4) return
      if (delta > 0 && y > 80) setScrolledDown(true)
      else if (delta < 0)      setScrolledDown(false)
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [view])
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  useLockBodyScroll(historyModalOpen)

  useEffect(() => {
    if (!historyModalOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHistoryModalOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [historyModalOpen])
  const [historySearch,    setHistorySearch]    = useState('')
  const historySearchRef = useRef<HTMLInputElement>(null)
  const searchInputRef   = useRef<HTMLInputElement>(null)
  const searchDropdownRef = useRef<HTMLDivElement>(null)
  const isRTL = lang === 'he'
  const unitLabel = lang === 'he' ? 'יח׳' : 'pcs'

  const switchView = (v: 'cal' | 'list' | 'stats') => {
    setView(v)
    localStorage.setItem('history-view', v)
  }
  const switchFilter = (f: StatusFilter) => {
    setStatusFilter(f)
    localStorage.setItem('history-filter', f)
  }

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
    () => Array.from(grouped.keys()).sort((a, b) => sortAsc ? a.localeCompare(b) : b.localeCompare(a)),
    [grouped, sortAsc],
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
            onClick={() => switchFilter(key)}
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
  const DayCardContent = ({ date, data, chevron = false }: { date: string; data: DayData; chevron?: boolean }) => {
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
            {chevron && (
              <span className="chevron-badge">
                <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>expand_more</span>
              </span>
            )}
          </div>
        </div>

        {/* Totals with inline donuts */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

          {/* Calories */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <DonutProgress value={data.totalCalories} goal={data.goal.calories} type="calories" size={46} strokeWidth={4} />
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue-hi)', lineHeight: 1 }}>
                  {Math.round(data.totalCalories)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{t(lang, 'caloriesUnit')}</span>
              </div>
              <div style={{ fontSize: 10, color: data.calOk ? 'var(--text-3)' : 'var(--amber)', marginTop: 2 }}>
                {calHint}
              </div>
            </div>
          </div>

          <div style={{ width: 1, height: 36, background: 'var(--border)', flexShrink: 0 }} />

          {/* Protein */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <DonutProgress value={data.totalProtein} goal={data.goal.protein} type="protein" size={46} strokeWidth={4} />
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-hi)', lineHeight: 1 }}>
                  {Math.round(data.totalProtein * 10) / 10}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{protUnit}</span>
              </div>
              <div style={{ fontSize: 10, color: data.protOk ? 'var(--text-3)' : 'var(--indigo-hi)', marginTop: 2 }}>
                {protHint}
              </div>
            </div>
          </div>

        </div>
      </>
    )
  }

  // ── Meals list (shared) ────────────────────────────────────────────
  const MealsList = ({ data }: { data: DayData }) => {
    const dayMealIds     = new Set(data.meals.map(m => m.id))
    const dayGroups      = composedGroups.filter(g => g.mealIds.some(id => dayMealIds.has(id)))
    const groupedMealIds = new Set(dayGroups.flatMap(g => g.mealIds))
    const standalones    = data.meals.filter(m => !groupedMealIds.has(m.id))

    type Row =
      | { kind: 'group'; group: ComposedGroup; meals: Meal[] }
      | { kind: 'meal';  meal: Meal }

    const rows: Row[] = [
      ...dayGroups.map(g => ({ kind: 'group' as const, group: g, meals: data.meals.filter(m => g.mealIds.includes(m.id)) })),
      ...standalones.map(m => ({ kind: 'meal' as const, meal: m })),
    ]

    return (
      <div style={{ borderTop: '1px solid var(--border)', padding: '4px 14px' }}>
        {rows.map((row, j) => {
          const isLast = j === rows.length - 1

          if (row.kind === 'group') {
            const gCal     = Math.round(row.meals.reduce((s, m) => s + m.calories, 0))
            const gProt    = Math.round(row.meals.reduce((s, m) => s + m.protein, 0) * 10) / 10
            const expanded = expandedGroupIds.has(row.group.id)

            return (
              <div key={row.group.id} style={{ borderBottom: isLast && !expanded ? 'none' : '1px solid var(--border)' }}>
                {/* Group header row — clickable */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroupExpand(row.group.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleGroupExpand(row.group.id) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span className="icon icon-sm" style={{ color: 'var(--purple)', flexShrink: 0 }}>restaurant</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.group.name}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                      {row.meals.length} {t(lang, 'ingredients')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>
                      {gCal}<span style={{ fontSize: 10, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, fontSize: 12, fontWeight: 700, color: 'var(--green-hi)' }}>
                      {gProt}<span style={{ fontSize: 10, opacity: 0.8 }}>{t(lang, 'proteinUnit')}</span>
                    </span>
                    <span className="icon icon-sm" style={{ color: 'var(--text-3)', transition: 'transform .2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Expanded ingredient rows */}
                {expanded && (
                  <div style={{ marginBottom: 4 }}>
                    {row.meals.map((meal) => (
                      <div
                        key={meal.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '6px 0 6px 22px',
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.45)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {meal.name}
                          </p>
                          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>
                            {meal.fluid_ml != null && !meal.fluid_excluded
                              ? (meal.fluid_ml >= 1000
                                  ? `${(meal.fluid_ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
                                  : `${Math.round(meal.fluid_ml)}ml`)
                              : meal.grams < 0
                                ? `${Math.abs(meal.grams)} ${lang === 'he' ? 'יח׳' : 'pcs'}`
                                : `${meal.grams}g`}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue-hi)' }}>{Math.round(meal.calories)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-hi)' }}>{Math.round(meal.protein * 10) / 10}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          const meal = row.meal
          return (
            <div key={meal.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: isLast ? 'none' : '1px solid var(--border)', paddingBottom: isLast ? 10 : undefined }}>
              <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                {MEAL_ICONS[meal.meal_type] ?? 'restaurant'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {meal.name}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                  {meal.fluid_ml != null && !meal.fluid_excluded
                    ? (meal.fluid_ml >= 1000
                        ? `${(meal.fluid_ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
                        : `${Math.round(meal.fluid_ml)}ml`)
                    : meal.grams < 0
                      ? `${Math.abs(meal.grams)} ${lang === 'he' ? 'יח׳' : 'pcs'}`
                      : `${meal.grams}g`}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>
                  {Math.round(meal.calories)}<span style={{ fontSize: 10, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, fontSize: 12, fontWeight: 700, color: 'var(--green-hi)' }}>
                  {Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 10, opacity: 0.8 }}>{t(lang, 'proteinUnit')}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Pill FAB values (computed once, stable across renders) ──────────
  const fabBtnSize = 38, fabPad = 5, fabGap = 2
  // 3-button FAB: [list, cal, stats] in DOM order (RTL reverses visual order)
  // In LTR: list=0, cal=1, stats=2. In RTL: list appears rightmost (idx 0), cal center (1), stats left (2).
  const fabViewIdx: Record<'list' | 'cal' | 'stats', number> = { list: 0, cal: 1, stats: 2 }
  const fabIndicatorLeft = isRTL
    ? fabPad + (2 - fabViewIdx[view]) * (fabBtnSize + fabGap)
    : fabPad + fabViewIdx[view] * (fabBtnSize + fabGap)

  // ── List view pre-compute (needed before single return) ───────────
  const filteredDates = sortedDates.filter(date => {
    const data = grouped.get(date)!
    if (statusFilter !== 'all' && data.status !== statusFilter) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      return data.meals.some(m => m.name.toLowerCase().includes(q))
    }
    return true
  })
  const TOPBAR_H = 57  // 56px header + 1px border

  // ── Single return — FAB always at stable position in the tree ─────
  return (
    <>
      {/* ── Calendar: drill-down ───────────────────────────────── */}
      {view === 'cal' && selectedDate && (() => {
        const data = grouped.get(selectedDate)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              <div className="card" style={{ borderInlineStart: `3px solid ${STATUS_COLOR[data.status].border}`, overflow: 'hidden' }}>
                <div style={{ padding: '14px 14px 12px' }}>
                  <DayCardContent date={selectedDate} data={data} />
                </div>
                <MealsList data={data} />
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Calendar: grid ─────────────────────────────────────── */}
      {view === 'cal' && !selectedDate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                      background: data ? 'var(--surface-1)' : 'transparent',
                      border: `1.5px solid ${isToday ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
                      opacity: dimmed ? 0.2 : 1,
                      transition: 'opacity .15s',
                    }}
                  >
                    <span>{day}</span>
                    {data && (
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }} aria-label={[data.calOk ? (lang === 'he' ? 'קלוריות בסדר' : 'calories ok') : '', data.protOk ? (lang === 'he' ? 'חלבון הושג' : 'protein met') : ''].filter(Boolean).join(', ')}>
                        {data.calOk  && <span className="icon" aria-hidden="true" style={{ fontSize: 10, color: 'var(--blue-hi)'  }}>check</span>}
                        {data.protOk && <span className="icon" aria-hidden="true" style={{ fontSize: 10, color: 'var(--green-hi)' }}>check</span>}
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
      )}

      {/* ── List view ──────────────────────────────────────────── */}
      {view === 'list' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 80 }}>
            {/* Sticky bar: filters + search */}
            <div style={{
              position: 'sticky', top: TOPBAR_H, zIndex: 10,
              background: 'var(--bg)', paddingTop: 10, paddingBottom: 6,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                <button
                  onClick={() => setSortAsc(v => !v)}
                  title={sortAsc ? (lang === 'he' ? 'ישן לחדש' : 'Oldest first') : (lang === 'he' ? 'חדש לישן' : 'Newest first')}
                  style={{
                    flexShrink: 0, width: 36, borderRadius: 10, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-3)', transition: 'all .15s',
                  }}
                >
                  <span className="icon icon-sm">{sortAsc ? 'arrow_upward' : 'arrow_downward'}</span>
                </button>
                <div style={{ flex: 1 }}><StatusFilterBar /></div>
              </div>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <button
                  onMouseDown={e => {
                    e.preventDefault()
                    setHistorySearch('')
                    setHistoryModalOpen(true)
                    setDropdownOpen(false)
                    setTimeout(() => historySearchRef.current?.focus(), 50)
                  }}
                  tabIndex={-1}
                  title={lang === 'he' ? 'היסטוריית מזונות' : 'Food history'}
                  style={{
                    position: 'absolute',
                    ...(isRTL ? { left: 0 } : { right: 0 }),
                    top: 0, bottom: 0, width: 42,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...(isRTL ? { borderRight: '1px solid var(--border)' } : { borderLeft: '1px solid var(--border)' }),
                  }}
                >
                  <span className="icon icon-sm">manage_search</span>
                </button>
                <span className="icon" style={{
                  position: 'absolute',
                  ...(isRTL ? { right: 10 } : { left: 52 }),
                  top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-3)', fontSize: 18, pointerEvents: 'none',
                }}>search</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="inp"
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                  value={search}
                  onChange={e => { setSearch(e.target.value); setDropdownOpen(true) }}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => {
                    if (!searchDropdownRef.current?.contains(document.activeElement)) setDropdownOpen(false)
                  }, 150)}
                  placeholder={t(lang, 'searchFood')}
                  style={isRTL
                    ? { paddingRight: 36, paddingLeft: search ? 78 : 46 }
                    : { paddingLeft: 78, paddingRight: search ? 78 : 46 }}
                />
                {search && (
                  <button
                    onMouseDown={e => { e.preventDefault(); setSearch(''); setDropdownOpen(false); searchInputRef.current?.focus() }}
                    style={{
                      position: 'absolute',
                      ...(isRTL ? { left: 42 } : { right: 42 }),
                      top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-3)', padding: 2, display: 'flex',
                    }}
                  >
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
                {/* Inline recent items dropdown */}
                {dropdownOpen && (() => {
                  const q = debouncedSearch.trim().toLowerCase()
                  const recentItems = q
                    ? history.filter(h => h.name.toLowerCase().includes(q)).slice(0, 6)
                    : [...history].sort((a, b) => b.use_count - a.use_count).slice(0, 6)
                  const matchedComposed = composedEntries.filter(e => !q || e.name.toLowerCase().includes(q))
                  if (recentItems.length === 0 && matchedComposed.length === 0) return null
                  return (
                    <div ref={searchDropdownRef} style={{
                      position: 'absolute', top: 'calc(46px + 4px)', left: 0, right: 0,
                      background: 'var(--bg-card2)', border: '1px solid var(--border-hi)',
                      borderRadius: 10, overflow: 'hidden', zIndex: 50,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}>
                      {matchedComposed.map(entry => (
                        <button key={entry.id} onMouseDown={() => { setSearch(entry.name); setDropdownOpen(false) }}
                          style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit', transition: 'background .12s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span className="icon icon-sm" style={{ color: 'var(--purple)', flexShrink: 0 }}>restaurant</span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600 }}>{entry.calories}</span>
                          <span style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600, marginInlineStart: 6 }}>{entry.protein}g</span>
                        </button>
                      ))}
                      {recentItems.map((item, i) => (
                        <button key={item.id} onMouseDown={() => { setSearch(item.name); setDropdownOpen(false) }}
                          style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: i < recentItems.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit', transition: 'background .12s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span className="icon icon-sm" style={{ color: 'var(--text-2)', flexShrink: 0 }}>history</span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600 }}>{Math.round(item.calories)}</span>
                          <span style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600, marginInlineStart: 6 }}>{Math.round(item.protein * 10) / 10}g</span>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Top gradient fade */}
              <div style={{ position: 'relative', height: 0, overflow: 'visible', zIndex: 9, pointerEvents: 'none' }}>
                <div style={{
                  position: 'absolute', top: 0, left: -16, right: -16, height: 28,
                  background: 'linear-gradient(to bottom, var(--bg), transparent)',
                  opacity: scrolledDown ? 1 : 0, transition: 'opacity 0.35s ease',
                }} />
              </div>
            </div>{/* end sticky bar */}

            {filteredDates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
                <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>search_off</span>
                <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noResults')}</p>
              </div>
            ) : (
              filteredDates.map((date, i) => {
                const data = grouped.get(date)!
                return (
                  <details key={date} className="card fade-up"
                    style={{ animationDelay: `${i * 0.04}s`, borderInlineStart: `3px solid ${STATUS_COLOR[data.status].border}`, overflow: 'hidden' }}
                  >
                    <summary style={{ padding: '14px 14px 12px' }}>
                      <DayCardContent date={date} data={data} chevron />
                    </summary>
                    <MealsList data={data} />
                  </details>
                )
              })
            )}
          </div>

          {/* Bottom gradient fade */}
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 560, height: 80,
            background: 'linear-gradient(to top, var(--bg) 20%, transparent)',
            pointerEvents: 'none', zIndex: 39,
          }} />

          {/* Food history modal */}
          {historyModalOpen && (() => {
            const q = historySearch.trim().toLowerCase()
            const filtered = q
              ? history.filter(h => h.name.toLowerCase().includes(q))
              : [...history].sort((a, b) => b.use_count - a.use_count)
            return (
              <div className="compose-modal-backdrop" onClick={() => setHistoryModalOpen(false)}>
                <div className="compose-modal"
                  style={{ maxWidth: 440, padding: 0, overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>manage_search</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', flex: 1 }}>
                      {lang === 'he' ? 'היסטוריית מזונות' : 'Food history'}
                    </span>
                    <button onClick={() => setHistoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                      <span className="icon icon-sm">close</span>
                    </button>
                  </div>
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ position: 'relative' }}>
                      <input ref={historySearchRef} className="inp"
                        style={{ paddingInlineStart: 36, height: 40, fontSize: 13 }}
                        placeholder={lang === 'he' ? 'חיפוש...' : 'Search...'}
                        value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                        dir={lang === 'he' ? 'rtl' : 'ltr'}
                      />
                      <span className="icon icon-sm" style={{
                        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                        ...(isRTL ? { right: 10 } : { left: 10 }),
                        color: 'var(--text-3)', pointerEvents: 'none',
                      }}>search</span>
                      {historySearch && (
                        <button onClick={() => setHistorySearch('')} style={{
                          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                          ...(isRTL ? { left: 8 } : { right: 8 }),
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-3)', padding: 2, display: 'flex',
                        }}>
                          <span className="icon icon-sm">close</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid var(--border)' }}>
                    {composedEntries.filter(e => !q || e.name.toLowerCase().includes(q)).length > 0 && (
                      <>
                        <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                          {lang === 'he' ? 'מנות שהרכבתי' : 'My composed dishes'}
                        </div>
                        {composedEntries.filter(e => !q || e.name.toLowerCase().includes(q)).map(entry => (
                          <button key={entry.id}
                            onClick={() => { setSearch(entry.name); setHistoryModalOpen(false); setHistorySearch('') }}
                            style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit', transition: 'background .12s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="icon icon-sm" style={{ color: 'var(--purple)', flexShrink: 0 }}>restaurant</span>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>{entry.calories}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)', marginInlineStart: 4 }}>{entry.protein}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'proteinUnit')}</span>
                            </div>
                          </button>
                        ))}
                        {filtered.length > 0 && (
                          <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                            {lang === 'he' ? 'היסטוריה' : 'History'}
                          </div>
                        )}
                      </>
                    )}
                    {filtered.length === 0 && composedEntries.filter(e => !q || e.name.toLowerCase().includes(q)).length === 0 ? (
                      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                        {lang === 'he' ? 'לא נמצאו תוצאות' : 'No results found'}
                      </div>
                    ) : filtered.map((item, i) => {
                      const amtDisplay = item.grams < 0 ? `${Math.abs(item.grams)} ${unitLabel}` : `${item.grams}g`
                      return (
                        <button key={item.id}
                          onClick={() => { setSearch(item.name); setHistoryModalOpen(false); setHistorySearch('') }}
                          style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit', transition: 'background .12s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--inp-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                              {amtDisplay} · {item.use_count} {lang === 'he' ? 'שימושים' : 'uses'}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>{Math.round(item.calories)}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)', marginInlineStart: 4 }}>{Math.round(item.protein * 10) / 10}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'proteinUnit')}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ── Stats view ─────────────────────────────────────────── */}
      {view === 'stats' && (() => {
        const now = new Date()
        const nowKey = today()

        // Helper: format a Date as DD.MM
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`

        // Helper: date key string from Date
        const toKey = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

        // ── 7-day window ──────────────────────────────────────────
        // offset7=0 → ends yesterday; offset7=1 → 8–14 days ago, etc.
        const end7 = new Date(now)
        end7.setDate(end7.getDate() - 1 - offset7 * 7)
        const start7 = new Date(end7)
        start7.setDate(start7.getDate() - 6)
        const range7Label = `${fmt(start7)} – ${fmt(end7)}`

        const barDays: Array<{ label: string; dateKey: string; cal: number; prot: number; fluid: number; goalCal: number; goalProt: number; goalFluid: number; hasData: boolean }> = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(end7)
          d.setDate(d.getDate() - i)
          const dKey = toKey(d)
          const data = grouped.get(dKey)
          const g    = getGoalForDate(dKey)
          const dayLabel = lang === 'he'
            ? ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][d.getDay()]
            : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]
          barDays.push({ label: dayLabel, dateKey: dKey, cal: data?.totalCalories ?? 0, prot: data?.totalProtein ?? 0, fluid: fluidForDate(dKey), goalCal: g.calories, goalProt: g.protein, goalFluid: fluidGoalMl, hasData: !!data })
        }

        const last7 = barDays.filter(b => b.hasData).map(b => b.dateKey)

        // ── 30-day window ─────────────────────────────────────────
        const end30 = new Date(now)
        end30.setDate(end30.getDate() - 1 - offset30 * 30)
        const start30 = new Date(end30)
        start30.setDate(start30.getDate() - 29)
        const range30Label = `${fmt(start30)} – ${fmt(end30)}`

        const last30 = sortedDates.filter(d => {
          const t = new Date(d).getTime()
          return t >= start30.setHours(0,0,0,0) && t <= end30.setHours(23,59,59,999)
        })

        const avg = (arr: string[], key: 'totalCalories' | 'totalProtein') => {
          if (arr.length === 0) return 0
          return Math.round(arr.reduce((s, d) => s + (grouped.get(d)?.[key] ?? 0), 0) / arr.length)
        }

        const avg7Cal   = avg(last7,  'totalCalories')
        const avg7Prot  = avg(last7,  'totalProtein')
        const avg30Cal  = avg(last30, 'totalCalories')
        const avg30Prot = avg(last30, 'totalProtein')

        const successDays7  = last7.filter(d  => grouped.get(d)?.status === 'success').length
        const successDays30 = last30.filter(d => grouped.get(d)?.status === 'success').length
        const pct7  = last7.length  ? Math.round(successDays7  / last7.length  * 100) : 0
        const pct30 = last30.length ? Math.round(successDays30 / last30.length * 100) : 0

        // ── Fluid stats ───────────────────────────────────────────
        const fluidForDate = (date: string): number =>
          (grouped.get(date)?.meals ?? []).reduce((s, m) => s + (m.fluid_ml ?? 0), 0)

        const fluidDays7    = last7.filter(d  => fluidForDate(d) > 0)
        const fluidDays30   = last30.filter(d => fluidForDate(d) > 0)
        const avg7FluidMl   = fluidDays7.length  > 0 ? Math.round(fluidDays7.reduce( (s, d) => s + fluidForDate(d), 0) / fluidDays7.length)  : 0
        const avg30FluidMl  = fluidDays30.length > 0 ? Math.round(fluidDays30.reduce((s, d) => s + fluidForDate(d), 0) / fluidDays30.length) : 0
        const goalDays7Fluid  = last7.filter(d  => fluidForDate(d) >= fluidGoalMl).length
        const goalDays30Fluid = last30.filter(d => fluidForDate(d) >= fluidGoalMl).length
        const pct7Fluid  = last7.length  > 0 ? Math.round(goalDays7Fluid  / last7.length  * 100) : 0
        const pct30Fluid = last30.length > 0 ? Math.round(goalDays30Fluid / last30.length * 100) : 0
        const fmtMl = (ml: number) => ml >= 1000
          ? `${(ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
          : `${ml}ml`

        const barH    = 80

        const StatCard = ({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) => (
          <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: 0, margin: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color }}>{value.toLocaleString()}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginInlineStart: 3 }}>{unit}</span>
            </p>
          </div>
        )

        if (last7.length === 0 && last30.length === 0) {
          return (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>bar_chart</span>
              <p style={{ fontSize: 14, margin: 0 }}>{lang === 'he' ? 'אין מספיק נתונים עדיין' : 'Not enough data yet'}</p>
            </div>
          )
        }

        // Today's goal for reference row
        const todayGoal = getGoalForDate(nowKey)

        // Chart values derived from chartMetric toggle
        const isCal   = chartMetric === 'cal'
        const isProt  = chartMetric === 'prot'
        const isFluid = chartMetric === 'fluid'
        const maxVal  = Math.max(...barDays.map(b => {
          const val  = isCal ? b.cal  : isProt ? b.prot  : b.fluid
          const goal = isCal ? b.goalCal : isProt ? b.goalProt : b.goalFluid
          return Math.max(val, goal)
        }), 1)
        const barColor        = isCal ? 'var(--blue)'             : isProt ? 'var(--green)'             : 'var(--blue)'
        const goalDashColor   = isCal ? 'rgba(59,130,246,0.35)'  : isProt ? 'rgba(16,185,129,0.35)'  : 'rgba(59,130,246,0.25)'
        const goalLegendColor = isCal ? 'rgba(59,130,246,0.5)'   : isProt ? 'rgba(16,185,129,0.5)'   : 'rgba(59,130,246,0.4)'

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 80 }}>

            {/* ── Goals reference row ────────────────────────────── */}
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '10px 14px',
            }}>
              <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>target</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', flexShrink: 0 }}>
                {lang === 'he' ? 'יעד יומי:' : 'Daily goal:'}
              </span>
              <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--blue-hi)', whiteSpace: 'nowrap' }}>
                  {todayGoal.calories.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green-hi)', whiteSpace: 'nowrap' }}>
                  {todayGoal.protein}g <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{lang === 'he' ? 'חלבון' : 'protein'}</span>
                </span>
              </div>
            </div>

            {/* 7-day section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {lang === 'he' ? `7 ימים — ${last7.length} עם נתונים` : `7 days — ${last7.length} with data`}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{range7Label}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset7(o => o + 1)}
                    aria-label={lang === 'he' ? 'שבוע קודם' : 'Previous week'}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_right' : 'chevron_left'}</span>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset7(o => o - 1)}
                    disabled={offset7 === 0}
                    aria-label={lang === 'he' ? 'שבוע הבא' : 'Next week'}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_left' : 'chevron_right'}</span>
                  </button>
                </div>
              </div>
              {last7.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)' }}>
                  <p style={{ fontSize: 13, margin: 0 }}>{lang === 'he' ? 'אין נתונים בטווח זה' : 'No data in this range'}</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StatCard label={lang === 'he' ? 'קל׳ ממוצע' : 'Avg cal'} value={avg7Cal} unit={t(lang, 'caloriesUnit')} color="var(--blue-hi)" />
                    <StatCard label={lang === 'he' ? 'חל׳ ממוצע' : 'Avg prot'} value={avg7Prot} unit={t(lang, 'proteinUnit')} color="var(--green-hi)" />
                    <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {lang === 'he' ? 'עמידה ביעד' : 'On target'}
                      </p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: pct7 >= 70 ? 'var(--green-hi)' : pct7 >= 40 ? 'var(--amber)' : 'var(--red)', margin: 0 }}>
                        {pct7}%
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{successDays7}/{last7.length} {lang === 'he' ? 'ימים' : 'days'}</p>
                    </div>
                  </div>
                  {fluidDays7.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {lang === 'he' ? '💧 נוזלים ממוצע' : '💧 Avg fluid'}
                        </p>
                        <p style={{ fontSize: 0, margin: 0 }}>
                          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue-hi)' }}>
                            {avg7FluidMl >= 1000 ? (avg7FluidMl / 1000).toFixed(1) : avg7FluidMl}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-3)', marginInlineStart: 3 }}>
                            {avg7FluidMl >= 1000 ? (lang === 'he' ? 'ל׳' : 'L') : 'ml'}
                          </span>
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                          {lang === 'he' ? `${fluidDays7.length} ימים עם נוזלים` : `${fluidDays7.length} days logged`}
                        </p>
                      </div>
                      <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {lang === 'he' ? '💧 יעד נוזלים' : '💧 Fluid goal'}
                        </p>
                        <p style={{ fontSize: 22, fontWeight: 800, color: pct7Fluid >= 70 ? 'var(--blue-hi)' : pct7Fluid >= 40 ? 'var(--amber)' : 'var(--red)', margin: 0 }}>
                          {pct7Fluid}%
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                          {goalDays7Fluid}/{last7.length} {lang === 'he' ? 'ימים' : 'days'} · {lang === 'he' ? 'יעד' : 'goal'} {fmtMl(fluidGoalMl)}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bar chart with cal/prot toggle */}
            {last7.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 12px' }}>
                {/* Chart header: title + toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>
                    {range7Label}
                  </p>
                  <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 2, gap: 2 }}>
                    {(['cal', 'prot', 'fluid'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setChartMetric(m)}
                        style={{
                          padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 11, fontWeight: 700, transition: 'all .15s',
                          background: chartMetric === m ? (m === 'prot' ? 'var(--green)' : 'var(--blue)') : 'transparent',
                          color: chartMetric === m ? '#fff' : 'var(--text-3)',
                        }}
                      >
                        {m === 'cal' ? (lang === 'he' ? 'קל׳' : 'Cal') : m === 'prot' ? (lang === 'he' ? 'חל׳' : 'Prot') : '💧'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: barH + 20 }}>
                  {barDays.map(b => {
                    const val      = isCal ? b.cal  : isProt ? b.prot  : b.fluid
                    const goalVal  = isCal ? b.goalCal : isProt ? b.goalProt : b.goalFluid
                    const hasBar   = b.hasData || (isFluid && b.fluid > 0)
                    const barHeight  = hasBar ? Math.max(4, Math.round((val / maxVal) * barH)) : 0
                    const goalHeight = goalVal > 0 ? Math.max(2, Math.round((goalVal / maxVal) * barH)) : 0
                    // For fluid: over-goal is good (green), not amber
                    const overGoal = hasBar && val > goalVal && goalVal > 0
                    const barBg    = isFluid
                      ? (overGoal ? 'var(--green)' : barColor)
                      : (overGoal ? 'var(--amber)' : barColor)
                    const valLabel = isFluid
                      ? (val >= 1000 ? `${(val / 1000).toFixed(1)}` : `${Math.round(val)}`)
                      : isCal ? `${Math.round(val)}` : `${Math.round(val * 10) / 10}`
                    return (
                      <div key={b.dateKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ position: 'relative', width: '100%', height: barH, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                          {goalHeight > 0 && <div style={{ position: 'absolute', bottom: goalHeight, left: 0, right: 0, borderTop: `1.5px dashed ${goalDashColor}` }} />}
                          {hasBar && (
                            <div style={{
                              width: '70%', height: barHeight,
                              borderRadius: '4px 4px 0 0',
                              background: barBg,
                              opacity: 0.85,
                              transition: 'height .3s ease',
                              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                              paddingBottom: 3, overflow: 'hidden',
                            }}>
                              {barHeight >= 20 && (
                                <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-on-brand)', lineHeight: 1 }}>
                                  {valLabel}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)' }}>{b.label}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                    <div style={{ width: 12, height: 3, background: barColor, borderRadius: 2 }} />
                    {isCal ? (lang === 'he' ? 'קלוריות' : 'Calories') : isProt ? (lang === 'he' ? 'חלבון' : 'Protein') : (lang === 'he' ? 'נוזלים' : 'Fluid')}
                  </div>
                  {(!isFluid || fluidGoalMl > 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                      <div style={{ width: 12, borderTop: `1.5px dashed ${goalLegendColor}` }} />
                      {lang === 'he' ? 'יעד' : 'Goal'}
                      <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                        {isCal
                          ? `${todayGoal.calories.toLocaleString()} ${t(lang, 'caloriesUnit')}`
                          : isProt
                            ? `${todayGoal.protein}${t(lang, 'proteinUnit')}`
                            : fmtMl(fluidGoalMl)}
                      </span>
                    </div>
                  )}
                  {!isFluid && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                      <div style={{ width: 12, height: 3, background: 'var(--amber)', borderRadius: 2 }} />
                      {lang === 'he' ? 'חריגה' : 'Over goal'}
                    </div>
                  )}
                  {isFluid && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                      <div style={{ width: 12, height: 3, background: 'var(--green)', borderRadius: 2 }} />
                      {lang === 'he' ? 'הגעת ליעד' : 'Reached goal'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 30-day section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {lang === 'he' ? `30 ימים — ${last30.length} עם נתונים` : `30 days — ${last30.length} with data`}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{range30Label}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset30(o => o + 1)}
                    aria-label={lang === 'he' ? '30 הימים הקודמים' : 'Previous 30 days'}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_right' : 'chevron_left'}</span>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset30(o => o - 1)}
                    disabled={offset30 === 0}
                    aria-label={lang === 'he' ? '30 הימים הבאים' : 'Next 30 days'}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_left' : 'chevron_right'}</span>
                  </button>
                </div>
              </div>
              {last30.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)' }}>
                  <p style={{ fontSize: 13, margin: 0 }}>{lang === 'he' ? 'אין נתונים בטווח זה' : 'No data in this range'}</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StatCard label={lang === 'he' ? 'קל׳ ממוצע' : 'Avg cal'} value={avg30Cal} unit={t(lang, 'caloriesUnit')} color="var(--blue-hi)" />
                    <StatCard label={lang === 'he' ? 'חל׳ ממוצע' : 'Avg prot'} value={avg30Prot} unit={t(lang, 'proteinUnit')} color="var(--green-hi)" />
                    <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {lang === 'he' ? 'עמידה ביעד' : 'On target'}
                      </p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: pct30 >= 70 ? 'var(--green-hi)' : pct30 >= 40 ? 'var(--amber)' : 'var(--red)', margin: 0 }}>
                        {pct30}%
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{successDays30}/{last30.length} {lang === 'he' ? 'ימים' : 'days'}</p>
                    </div>
                  </div>
                  {fluidDays30.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {lang === 'he' ? '💧 נוזלים ממוצע' : '💧 Avg fluid'}
                        </p>
                        <p style={{ fontSize: 0, margin: 0 }}>
                          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue-hi)' }}>
                            {avg30FluidMl >= 1000 ? (avg30FluidMl / 1000).toFixed(1) : avg30FluidMl}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-3)', marginInlineStart: 3 }}>
                            {avg30FluidMl >= 1000 ? (lang === 'he' ? 'ל׳' : 'L') : 'ml'}
                          </span>
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                          {lang === 'he' ? `${fluidDays30.length} ימים עם נוזלים` : `${fluidDays30.length} days logged`}
                        </p>
                      </div>
                      <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {lang === 'he' ? '💧 יעד נוזלים' : '💧 Fluid goal'}
                        </p>
                        <p style={{ fontSize: 22, fontWeight: 800, color: pct30Fluid >= 70 ? 'var(--blue-hi)' : pct30Fluid >= 40 ? 'var(--amber)' : 'var(--red)', margin: 0 }}>
                          {pct30Fluid}%
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>
                          {goalDays30Fluid}/{last30.length} {lang === 'he' ? 'ימים' : 'days'} · {lang === 'he' ? 'יעד' : 'goal'} {fmtMl(fluidGoalMl)}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Insight note */}
            {last7.length >= 3 && (
              <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: 12, padding: '10px 14px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                  {lang === 'he'
                    ? `ב-7 הימים האחרונים צרכת בממוצע ${avg7Cal.toLocaleString()} קק״ל ו-${avg7Prot}ג׳ חלבון. עמדת ביעד ב-${pct7}% מהימים.`
                    : `Over the last 7 days you averaged ${avg7Cal.toLocaleString()} kcal and ${avg7Prot}g protein. You met your goals on ${pct7}% of days.`}
                </p>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Pill FAB — always last child → stable in React tree → transitions work ── */}
      <div
        style={{
          position: 'fixed',
          bottom: 28,
          insetInlineEnd: 'max(calc((100vw - 560px) / 2 + 24px), 24px)',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-card2)',
          border: '1px solid var(--border-hi)',
          borderRadius: 999,
          padding: fabPad,
          gap: fabGap,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 var(--surface-2)',
        }}
      >
        {/* Sliding active indicator */}
        <div style={{
          position: 'absolute',
          top: fabPad,
          left: fabIndicatorLeft,
          width: fabBtnSize,
          height: fabBtnSize,
          borderRadius: 999,
          background: 'rgba(59,130,246,0.18)',
          border: '1px solid rgba(59,130,246,0.4)',
          boxShadow: '0 0 14px rgba(59,130,246,0.3)',
          transition: 'left 0.28s cubic-bezier(.34,1.56,.64,1)',
          pointerEvents: 'none',
        }} />
        {/* List button */}
        <button
          className="fab-pill-btn"
          onClick={() => { switchView('list'); setSelectedDate(null) }}
          style={{
            width: fabBtnSize, height: fabBtnSize, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer',
            position: 'relative', zIndex: 1,
            color: view === 'list' ? 'var(--blue-hi)' : 'var(--text-3)',
          }}
        >
          <span className="icon" style={{ fontSize: 20 }}>format_list_bulleted</span>
        </button>
        {/* Calendar button */}
        <button
          className="fab-pill-btn"
          onClick={() => { switchView('cal'); setSelectedDate(null) }}
          style={{
            width: fabBtnSize, height: fabBtnSize, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer',
            position: 'relative', zIndex: 1,
            color: view === 'cal' ? 'var(--blue-hi)' : 'var(--text-3)',
          }}
        >
          <span className="icon" style={{ fontSize: 20 }}>calendar_month</span>
        </button>
        {/* Stats button */}
        <button
          className="fab-pill-btn"
          onClick={() => { switchView('stats'); setSelectedDate(null) }}
          style={{
            width: fabBtnSize, height: fabBtnSize, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer',
            position: 'relative', zIndex: 1,
            color: view === 'stats' ? 'var(--blue-hi)' : 'var(--text-3)',
          }}
        >
          <span className="icon" style={{ fontSize: 20 }}>bar_chart</span>
        </button>
      </div>
    </>
  )
}
