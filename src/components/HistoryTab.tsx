import { useState, useMemo, useRef, useEffect } from 'react'
import { useDebounce } from '../hooks/useDebounce'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { useAppContext } from '../context/AppContext'
import type { Meal, FoodHistory, ComposedGroup } from '../types'
import type { Lang, MealTypeKey } from '../lib/i18n'
import { t, dir, formatDate, today, HE_MONTHS, EN_MONTHS } from '../lib/i18n'
import { DonutProgress } from './DonutProgress'
import type { ComposedEntry } from './FoodEntryForm'

// ── Constants ────────────────────────────────────────────────────────


// ── Types ────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'success' | 'over_cal' | 'under_prot'

interface DayData {
  meals:          Meal[]
  totalCalories:  number
  totalProtein:   number
  totalFluid:     number
  goal:           { calories: number; protein: number }
  calOk:          boolean   // calories did not exceed goal
  protOk:         boolean   // protein reached goal
  fluidOk:        boolean   // fluid goal reached
  status:         'success' | 'over_cal' | 'under_prot' | 'both'
}

interface HistoryTabProps {
  lang:             Lang
  meals:            Meal[]
  history:          FoodHistory[]
  getGoalForDate:   (date: string) => { calories: number; protein: number }
  composedEntries?: ComposedEntry[]
  composedGroups?:  ComposedGroup[]
  fluidGoalMl?:     number
  loading?:         boolean
  weeklyTdee?:      number  // 7 × daily TDEE, for weight-impact calculation
}

// ── Helpers ──────────────────────────────────────────────────────────

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function dayStatus(calOk: boolean, protOk: boolean): DayData['status'] {
  if (!calOk && !protOk) return 'both'
  if (!calOk)            return 'over_cal'
  if (!protOk)           return 'under_prot'
  return 'success'
}

// ── Status colours (all from design tokens) ──────────────────────────

const STATUS_COLOR: Record<DayData['status'], { badge: string; text: string; icon: string }> = {
  success:    { badge: 'var(--positive-tint)',  text: 'var(--positive-hi)',  icon: 'check_circle'  },
  over_cal:   { badge: 'var(--warning-tint)',   text: 'var(--warning)',      icon: 'trending_up'   },
  under_prot: { badge: 'var(--library-tint)',   text: 'var(--library-hi)',   icon: 'trending_down' },
  both:       { badge: 'var(--danger-tint)',    text: 'var(--danger-hi)',    icon: 'warning'       },
}

// ── Component ────────────────────────────────────────────────────────

export function HistoryTab({ lang, meals, history, getGoalForDate, composedEntries = [], composedGroups = [], fluidGoalMl = 2500, loading = false, weeklyTdee = 0 }: HistoryTabProps) {
  const { styleMode } = useAppContext()
  const todayKey = today()

  const [view, setView] = useState<'cal' | 'list' | 'stats'>(
    () => (localStorage.getItem('history-view') as 'cal' | 'list' | 'stats') ?? 'cal'
  )
  const [calYear,      setCalYear]      = useState(() => new Date().getFullYear())
  const [calMonth,     setCalMonth]     = useState(() => new Date().getMonth())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const saved = localStorage.getItem('history-filter')
    // Migrate old values from previous 3-state schema
    if (saved === 'over')  return 'over_cal'
    if (saved === 'under') return 'under_prot'
    return (saved as StatusFilter) ?? 'all'
  })
  const [sortAsc, setSortAsc] = useState(false)
  const [chartMetric7,  setChartMetric7]  = useState<'cal' | 'prot' | 'fluid'>('cal')
  const [chartMetric30, setChartMetric30] = useState<'cal' | 'prot' | 'fluid'>('cal')
  const [selectedBarDate, setSelectedBarDate] = useState<string | null>(null)
  const panelTouchStartX = useRef(0)
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>(
    () => (localStorage.getItem('stats-period') as 'week' | 'month') ?? 'week'
  )
  const switchStatsPeriod = (p: 'week' | 'month') => { setStatsPeriod(p); localStorage.setItem('stats-period', p) }
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
    setExpandedGroupIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // ── Scroll-aware sticky (list view only) ──────────────────────────
  const [scrolledDown, setScrolledDown] = useState(false)
  const lastScrollY = useRef(0)
  useEffect(() => {
    const onScroll = () => {
      if (view !== 'list') { setScrolledDown(false); lastScrollY.current = window.scrollY; return }
      const y = window.scrollY
      const delta = y - lastScrollY.current
      if (Math.abs(delta) < 4) return
      // Close search dropdown when user scrolls (fixes touch-scroll on mobile)
      setDropdownOpen(false)
      if (delta > 0 && y > 80) setScrolledDown(true)
      else if (delta < 0)      setScrolledDown(false)
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [view])
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  useLockBodyScroll(historyModalOpen || selectedBarDate !== null)

  useEffect(() => {
    if (!historyModalOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHistoryModalOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [historyModalOpen])

  useEffect(() => {
    if (!selectedBarDate) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedBarDate(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedBarDate])
  const [historySearch,    setHistorySearch]    = useState('')
  const historySearchRef = useRef<HTMLInputElement>(null)
  const searchInputRef   = useRef<HTMLInputElement>(null)
  const searchDropdownRef = useRef<HTMLDivElement>(null)
  const isRTL = lang === 'he'
  const unitLabel = t(lang, 'unitLabel')

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
      const totalFluid    = dayMeals.reduce((s, m) => s + (m.fluid_ml ?? 0), 0)
      const calOk   = totalCalories <= goal.calories
      const protOk  = totalProtein  >= goal.protein
      const fluidOk = totalFluid    >= fluidGoalMl
      result.set(date, { meals: dayMeals, totalCalories, totalProtein, totalFluid, goal, calOk, protOk, fluidOk, status: dayStatus(calOk, protOk) })
    })
    return result
  }, [meals, todayKey, getGoalForDate, fluidGoalMl])

  const sortedDates = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => sortAsc ? a.localeCompare(b) : b.localeCompare(a)),
    [grouped, sortAsc],
  )

  // ── Skeleton loading state ────────────────────────────────────────
  if (loading && grouped.size === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[72, 56, 88].map((h, i) => (
          <div key={i} className="card" style={{ padding: 14, animationDelay: `${i * 0.08}s` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 13, width: '40%', marginBottom: 8, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 11, width: '65%', borderRadius: 6 }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 8 }} />
                <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 8 }} />
              </div>
            </div>
            {h > 60 && <div className="skeleton" style={{ height: 10, width: '80%', marginTop: 10, borderRadius: 6 }} />}
          </div>
        ))}
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────
  if (grouped.size === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-3)' }}>
        <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>history</span>
        <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noHistory')}</p>
        <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-3)' }}>
          {t(lang, 'noHistoryHint')}
        </p>
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
    setSelectedBarDate(null)
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
    { key: 'all',        icon: 'filter_list'  },
    { key: 'success',    icon: 'check_circle' },
    { key: 'over_cal',   icon: 'trending_up'  },
    { key: 'under_prot', icon: 'trending_down'},
  ]
  // Labels for filter chips
  const filterLabel: Record<StatusFilter, string> = {
    all:        t(lang, 'allDays'),
    success:    t(lang, 'metGoal'),
    over_cal:   t(lang, 'overCal'),
    under_prot: t(lang, 'underProt'),
  }
  // Labels for the per-day badge (includes 'both' which has no filter chip)
  const statusLabel: Record<DayData['status'], string> = {
    success:    t(lang, 'metGoal'),
    over_cal:   t(lang, 'overCal'),
    under_prot: t(lang, 'underProt'),
    both:       t(lang, 'overBoth'),
  }
  const filterActive: Record<StatusFilter, { bg: string; border: string; color: string }> = {
    all:        { bg: 'var(--accent-tint)',   border: 'var(--accent-border)',   color: 'var(--accent-hi)'   },
    success:    { bg: 'var(--positive-tint)', border: 'var(--positive-border)', color: 'var(--positive-hi)' },
    over_cal:   { bg: 'var(--warning-tint)',  border: 'var(--warning-border)',  color: 'var(--warning)'     },
    under_prot: { bg: 'var(--library-tint)',  border: 'var(--library-border)',  color: 'var(--library-hi)'  },
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
            aria-pressed={isActive}
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
    const fmtFluid = (ml: number) => ml >= 1000
      ? `${(ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
      : `${Math.round(ml)}ml`
    const fluidDiff = Math.round(Math.abs(data.totalFluid - fluidGoalMl))

    const calHint   = data.calOk   ? `${t(lang, 'goal')}: ${data.goal.calories}` : `+${calDiff} ${t(lang, 'overGoalShort')}`
    const protHint  = data.protOk  ? `${t(lang, 'goal')}: ${data.goal.protein}`  : `${protDiff}${protUnit} ${t(lang, 'underGoalShort')}`
    const fluidHint = data.fluidOk ? `${t(lang, 'goal')}: ${fmtFluid(fluidGoalMl)}` : `${fmtFluid(fluidDiff)} ${t(lang, 'underGoalShort')}`

    if (styleMode === 'minimal') {
      const calPct  = data.goal.calories > 0 ? Math.min(1, data.totalCalories / data.goal.calories) : 0
      const protPct = data.goal.protein  > 0 ? Math.min(1, data.totalProtein  / data.goal.protein)  : 0
      return (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)', margin: 0 }}>
                {formatDate(date, lang)}
              </p>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {data.meals.length} {t(lang, data.meals.length === 1 ? 'item' : 'items')}
              </span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
                background: sc.badge, color: sc.text,
              }}>
                <span className="icon icon-sm">{sc.icon}</span>
                {statusLabel[data.status]}
              </span>
            </div>
            {chevron && (
              <span className="icon icon-chevron chevron-rotate" style={{ color: 'var(--text-3)', transition: 'transform 0.2s', flexShrink: 0 }}>expand_more</span>
            )}
          </div>
          {/* Calories row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 80 }}>
              <span style={{ color: 'var(--text-3)' }}>{lang === 'he' ? 'קל׳ · ' : 'cal · '}</span>
              <span style={{ color: 'var(--text-2)' }}>{Math.round(data.totalCalories)}</span>
            </span>
            <div style={{ flex: 1, height: 2, background: 'var(--border)', position: 'relative', borderRadius: 2 }}>
              <div style={{
                position: 'absolute', top: 0, insetInlineStart: 0, bottom: 0,
                width: `${calPct * 100}%`, borderRadius: 2,
                background: data.calOk ? 'var(--text)' : 'var(--accent-hi)',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
          {/* Protein row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 80 }}>
              <span style={{ color: 'var(--text-3)' }}>{lang === 'he' ? 'חלבון · ' : 'prot · '}</span>
              <span style={{ color: 'var(--positive-hi)' }}>{Math.round(data.totalProtein * 10) / 10}{protUnit}</span>
            </span>
            <div style={{ flex: 1, height: 2, background: 'var(--border)', position: 'relative', borderRadius: 2 }}>
              <div style={{
                position: 'absolute', top: 0, insetInlineStart: 0, bottom: 0,
                width: `${protPct * 100}%`, borderRadius: 2,
                background: 'var(--positive)',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
          {/* Fluid row */}
          {fluidGoalMl > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 80 }}>
                <span style={{ color: 'var(--text-3)' }}>{lang === 'he' ? 'נוזלים · ' : 'fluid · '}</span>
                <span style={{ color: 'var(--cyan-hi)' }}>{fmtFluid(data.totalFluid)}</span>
              </span>
              <div style={{ flex: 1, height: 2, background: 'var(--border)', position: 'relative', borderRadius: 2 }}>
                <div style={{
                  position: 'absolute', top: 0, insetInlineStart: 0, bottom: 0,
                  width: `${Math.min(1, fluidGoalMl > 0 ? data.totalFluid / fluidGoalMl : 0) * 100}%`, borderRadius: 2,
                  background: 'var(--cyan-hi)',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          )}
        </>
      )
    }

    return (
      <>
        {/* Summary row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          {/* date + count + badge — grouped at the start (right in RTL) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {formatDate(date, lang)}
            </p>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {data.meals.length} {t(lang, data.meals.length === 1 ? 'item' : 'items')}
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
              background: sc.badge, color: sc.text,
            }}>
              <span className="icon icon-sm">{sc.icon}</span>
              {statusLabel[data.status]}
            </span>
          </div>
          {/* chevron at the end (left in RTL) */}
          {chevron && (
            <span className="icon icon-chevron chevron-rotate" style={{ color: 'var(--text-3)', transition: 'transform 0.2s', flexShrink: 0 }}>expand_more</span>
          )}
        </div>

        {/* Totals with inline donuts */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

          {/* Calories */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <DonutProgress value={data.totalCalories} goal={data.goal.calories} type="calories" lang={lang} size={46} strokeWidth={4} />
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>
                {lang === 'he' ? 'קלוריות' : 'Calories'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-hi)', lineHeight: 1 }}>
                  {Math.round(data.totalCalories)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{t(lang, 'caloriesUnit')}</span>
              </div>
              <div style={{ fontSize: 10, color: data.calOk ? 'var(--text-3)' : 'var(--warning)', marginTop: 2 }}>
                {calHint}
              </div>
            </div>
          </div>

          <div style={{ width: 1, height: 36, background: 'var(--border)', flexShrink: 0 }} />

          {/* Protein */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <DonutProgress value={data.totalProtein} goal={data.goal.protein} type="protein" lang={lang} size={46} strokeWidth={4} />
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>
                {lang === 'he' ? 'חלבון' : 'Protein'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--positive-hi)', lineHeight: 1 }}>
                  {Math.round(data.totalProtein * 10) / 10}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{protUnit}</span>
              </div>
              <div style={{ fontSize: 10, color: data.protOk ? 'var(--text-3)' : 'var(--library-hi)', marginTop: 2 }}>
                {protHint}
              </div>
            </div>
          </div>

        </div>

        {/* Fluid row — below the donut pair so it never competes for width */}
        {fluidGoalMl > 0 && (() => {
          const fluidPct = Math.min(1, fluidGoalMl > 0 ? data.totalFluid / fluidGoalMl : 0)
          const fluidPctLabel = `${Math.round(fluidPct * 100)}%`
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 10, paddingTop: 10,
              borderTop: '1px solid var(--border)',
            }}>
              <span className="icon" style={{ fontSize: 14, color: data.fluidOk ? 'var(--cyan-hi)' : 'var(--text-3)', flexShrink: 0 }}>water_drop</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                {lang === 'he' ? 'נוזלים' : 'Fluid'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: data.fluidOk ? 'var(--cyan-hi)' : 'var(--text-2)', flexShrink: 0 }}>
                {fmtFluid(data.totalFluid)}
              </span>
              <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 0, insetInlineStart: 0, bottom: 0,
                  width: `${fluidPct * 100}%`, borderRadius: 2,
                  background: data.fluidOk ? 'var(--cyan-hi)' : 'var(--accent)',
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: data.fluidOk ? 'var(--cyan-hi)' : 'var(--text-3)', flexShrink: 0, minWidth: 30, textAlign: 'end' }}>
                {fluidPctLabel}
              </span>
              <span style={{ fontSize: 10, color: data.fluidOk ? 'var(--text-3)' : 'var(--warning)', flexShrink: 0 }}>
                {fluidHint}
              </span>
            </div>
          )
        })()}
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

            const groupMealType = row.meals[0]?.meal_type
            return (
              <div key={row.group.id} style={{ borderBottom: expanded || isLast ? 'none' : '1px dashed var(--border)' }}>
                {/* Group header row — clickable, same 2-line layout as meal rows */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroupExpand(row.group.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleGroupExpand(row.group.id) }}
                  style={{ padding: '8px 0', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Two-line content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Line 1: name · count | meal type */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {row.group.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {row.meals.length} {t(lang, 'ingredients')}
                        </span>
                        {groupMealType && (
                          <>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>|</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{t(lang, groupMealType as MealTypeKey)}</span>
                          </>
                        )}
                      </div>
                      {/* Line 2: calories | protein */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          {gCal}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          {gProt}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{lang === 'he' ? 'ג׳ חלבון' : 'g protein'}</span>
                        </span>
                      </div>
                    </div>
                    {/* Chevron — centered to full header height */}
                    <span className="icon icon-chevron" style={{ color: 'var(--text-3)', flexShrink: 0, transition: 'transform .2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Expanded ingredient rows — solid top/bottom border frames the group */}
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--border)', borderBottom: isLast ? 'none' : '1px solid var(--border)', marginBottom: isLast ? 0 : 8, background: 'var(--composed-tint)', marginInline: -14, paddingInline: 14 }}>
                    {row.meals.map((meal, idx) => {
                      const iQty = meal.fluid_ml != null && !meal.fluid_excluded
                        ? (meal.fluid_ml >= 1000 ? `${(meal.fluid_ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}` : `${Math.round(meal.fluid_ml)}ml`)
                        : meal.grams < 0
                          ? `${Math.abs(meal.grams)} ${unitLabel}`
                          : `${meal.grams}g`
                      const isIngFirst = idx === 0
                      return (
                        <div key={meal.id} style={{ padding: '6px 0 6px 16px', borderTop: isIngFirst ? 'none' : '1px dashed var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--composed-border-hi)', flexShrink: 0, alignSelf: 'center' }} />
                            <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                              {meal.name}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{iQty}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, paddingInlineStart: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                              {Math.round(meal.calories)}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                              {Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>{lang === 'he' ? 'ג׳ חלבון' : 'g protein'}</span>
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          const meal = row.meal
          const qty = meal.fluid_ml != null && !meal.fluid_excluded
            ? (meal.fluid_ml >= 1000 ? `${(meal.fluid_ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}` : `${Math.round(meal.fluid_ml)}ml`)
            : meal.grams < 0
              ? `${Math.abs(meal.grams)} ${unitLabel}`
              : `${meal.grams}g`
          return (
            <div key={meal.id} style={{ padding: '8px 0', borderBottom: isLast ? 'none' : '1px dashed var(--border)' }}>
              {/* Line 1: name · qty | meal type */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {meal.name}
                  {meal.fluid_ml != null && !meal.fluid_excluded && (
                    <span className="icon" style={{ fontSize: 12, color: 'var(--cyan-hi)', opacity: 0.8, verticalAlign: 'middle', margin: '0 4px' }}>water_drop</span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{qty}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>|</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{t(lang, meal.meal_type as MealTypeKey)}</span>
              </div>
              {/* Line 2: calories | protein */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                  {Math.round(meal.calories)}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                  {Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{lang === 'he' ? 'ג׳ חלבון' : 'g protein'}</span>
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
  // 3-button FAB: [cal, list, stats] in DOM order (RTL reverses visual order)
  // In LTR: cal=0, list=1, stats=2. In RTL: cal appears rightmost (idx 0), list center (1), stats left (2).
  const fabViewIdx: Record<'list' | 'cal' | 'stats', number> = { cal: 0, list: 1, stats: 2 }
  const fabIndicatorLeft = isRTL
    ? fabPad + (2 - fabViewIdx[view]) * (fabBtnSize + fabGap)
    : fabPad + fabViewIdx[view] * (fabBtnSize + fabGap)

  // ── List view pre-compute (needed before single return) ───────────
  const filteredDates = sortedDates.filter(date => {
    const data = grouped.get(date)!
    if (statusFilter !== 'all') {
      const s = data.status
      if (statusFilter === 'success'    && s !== 'success')                              return false
      if (statusFilter === 'over_cal'   && s !== 'over_cal'   && s !== 'both')          return false
      if (statusFilter === 'under_prot' && s !== 'under_prot' && s !== 'both')          return false
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      return data.meals.some(m => m.name.toLowerCase().includes(q))
    }
    return true
  })
  const TOPBAR_H = 57  // 56px header + 1px border

  // Group filteredDates by month for month separators
  const monthGroups = (() => {
    const groups: { monthKey: string; label: string; dates: string[] }[] = []
    for (const date of filteredDates) {
      const [year, month] = date.split('-').map(Number)
      const monthKey = date.substring(0, 7)
      const label = `${lang === 'he' ? HE_MONTHS[month - 1] : EN_MONTHS[month - 1]} ${year}`
      if (groups.length === 0 || groups[groups.length - 1].monthKey !== monthKey) {
        groups.push({ monthKey, label, dates: [] })
      }
      groups[groups.length - 1].dates.push(date)
    }
    return groups
  })()

  // ── Single return — FAB always at stable position in the tree ─────
  return (
    <>
      {/* ── Calendar: grid ─────────────────────────────────────── */}
      {view === 'cal' && (
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
                const dimmed  = !!data && statusFilter !== 'all' && (() => {
                  const s = data.status
                  if (statusFilter === 'success')    return s !== 'success'
                  if (statusFilter === 'over_cal')   return s !== 'over_cal'   && s !== 'both'
                  if (statusFilter === 'under_prot') return s !== 'under_prot' && s !== 'both'
                  return false
                })()
                return (
                  <div
                    key={dateKey}
                    onClick={() => data && setSelectedBarDate(dateKey)}
                    {...(data ? {
                      role: 'button',
                      tabIndex: 0,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedBarDate(dateKey) }
                      },
                      'aria-label': `${dateKey}${data.calOk ? ' ✓' : ''}`,
                    } : {})}
                    style={{
                      height: 38,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 2,
                      fontSize: 12, fontWeight: 600, borderRadius: 8,
                      cursor: data ? 'pointer' : 'default',
                      color:  isToday ? 'var(--accent-hi)' : data ? 'var(--text-2)' : 'var(--text-3)',
                      background: data ? 'var(--surface-1)' : 'transparent',
                      border: `1.5px solid ${isToday ? 'var(--accent-border-hi)' : 'transparent'}`,
                      opacity: dimmed ? 0.2 : 1,
                      transition: 'opacity .15s',
                    }}
                  >
                    <span>{day}</span>
                    {data && (
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }} aria-label={[data.calOk ? (lang === 'he' ? 'קלוריות בסדר' : 'calories ok') : '', data.protOk ? (lang === 'he' ? 'חלבון הושג' : 'protein met') : '', data.fluidOk ? (lang === 'he' ? 'נוזלים הושגו' : 'fluid met') : ''].filter(Boolean).join(', ')}>
                        {data.calOk   && <span className="icon" aria-hidden="true" style={{ fontSize: 10, color: 'var(--accent-hi)'  }}>check</span>}
                        {data.protOk  && <span className="icon" aria-hidden="true" style={{ fontSize: 10, color: 'var(--positive-hi)' }}>check</span>}
                        {data.fluidOk && <span className="icon" aria-hidden="true" style={{ fontSize: 10, color: 'var(--cyan-hi)' }}>water_drop</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
                <span className="icon" style={{ fontSize: 11, color: 'var(--accent-hi)' }}>check</span>
                {t(lang, 'caloriesOk')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
                <span className="icon" style={{ fontSize: 11, color: 'var(--positive-hi)' }}>check</span>
                {t(lang, 'proteinMet')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
                <span className="icon" style={{ fontSize: 11, color: 'var(--cyan-hi)' }}>water_drop</span>
                {t(lang, 'fluidMet')}
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
              touchAction: 'pan-y',
            }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                <button
                  onClick={() => setSortAsc(v => !v)}
                  aria-label={sortAsc ? t(lang, 'sortOldFirst') : t(lang, 'sortNewFirst')}
                  title={sortAsc ? (t(lang, 'sortOldFirst')) : (t(lang, 'sortNewFirst'))}
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
                  title={t(lang, 'foodHistory')}
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
                  dir={dir(lang)}
                  value={search}
                  onChange={e => { setSearch(e.target.value); setDropdownOpen(true) }}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => {
                    if (!searchDropdownRef.current?.contains(document.activeElement)) setDropdownOpen(false)
                  }, 150)}
                  placeholder={t(lang, 'searchFood')}
                  style={{ paddingInlineStart: 36, paddingInlineEnd: search ? 78 : 46 }}
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
                      boxShadow: 'var(--shadow-lg)',
                    }}>
                      {matchedComposed.map(entry => (
                        <button key={entry.id} onMouseDown={() => { setSearch(entry.name); setDropdownOpen(false) }}
                          style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit', transition: 'background .12s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--composed-tint)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span className="icon icon-sm" style={{ color: 'var(--composed)', flexShrink: 0 }}>restaurant</span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600 }}>{entry.calories}</span>
                          <span style={{ fontSize: 11, color: 'var(--positive-hi)', fontWeight: 600, marginInlineStart: 6 }}>{entry.protein}g</span>
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
                          <span style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600 }}>{Math.round(item.calories)}</span>
                          <span style={{ fontSize: 11, color: 'var(--positive-hi)', fontWeight: 600, marginInlineStart: 6 }}>{Math.round(item.protein * 10) / 10}g</span>
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
                {debouncedSearch ? (
                  <>
                    <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>search_off</span>
                    <p style={{ fontSize: 13, margin: 0 }}>
                      {lang === 'he' ? `לא נמצאו תוצאות עבור "${debouncedSearch}"` : `No results for "${debouncedSearch}"`}
                    </p>
                    <button
                      onClick={() => setSearch('')}
                      style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-hi)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
                    >
                      {lang === 'he' ? 'נקה חיפוש' : 'Clear search'}
                    </button>
                  </>
                ) : statusFilter !== 'all' ? (
                  <>
                    <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>filter_list_off</span>
                    <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noResults')}</p>
                    <button
                      onClick={() => setStatusFilter('all')}
                      style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-hi)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
                    >
                      {lang === 'he' ? 'הצג הכל' : 'Show all'}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>history</span>
                    <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noHistory')}</p>
                  </>
                )}
              </div>
            ) : (
              monthGroups.map((group) => (
                <div key={group.monthKey}>
                  {/* Month label separator */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 2px',
                    pointerEvents: 'none',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                      textTransform: 'uppercase', color: 'var(--text-3)',
                      background: 'var(--bg)', padding: '2px 8px',
                      borderRadius: 20, border: '1px solid var(--border)',
                    }}>
                      {group.label}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  {group.dates.map((date) => {
                    const data = grouped.get(date)!
                    const i = filteredDates.indexOf(date)
                    return (
                      <details key={date} className="card fade-up"
                        style={{ animationDelay: `${i * 0.04}s`, overflow: 'hidden', marginTop: 6 }}
                      >
                        <summary style={{ padding: '14px 14px 12px' }}>
                          <DayCardContent date={date} data={data} chevron />
                        </summary>
                        <MealsList data={data} />
                      </details>
                    )
                  })}
                </div>
              ))
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
                  role="dialog" aria-modal="true" aria-label={lang === 'he' ? 'היסטוריית מזון' : 'Food history'}
                  style={{ maxWidth: 440, padding: 0, overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>manage_search</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', flex: 1 }}>
                      {t(lang, 'foodHistory')}
                    </span>
                    <button onClick={() => setHistoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                      <span className="icon icon-sm">close</span>
                    </button>
                  </div>
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ position: 'relative' }}>
                      <input ref={historySearchRef} className="inp"
                        style={{ paddingInlineStart: 36, height: 40, fontSize: 16 }}
                        placeholder={t(lang, 'search')}
                        value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                        dir={dir(lang)}
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
                          {t(lang, 'myDishes')}
                        </div>
                        {composedEntries.filter(e => !q || e.name.toLowerCase().includes(q)).map(entry => (
                          <button key={entry.id}
                            onClick={() => { setSearch(entry.name); setHistoryModalOpen(false); setHistorySearch('') }}
                            style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit', transition: 'background .12s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--composed-fill)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span className="icon icon-sm" style={{ color: 'var(--composed)', flexShrink: 0 }}>restaurant</span>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)' }}>{entry.calories}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)', marginInlineStart: 4 }}>{entry.protein}</span>
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
                        {t(lang, 'noResultsFound')}
                      </div>
                    ) : filtered.map((item, i) => {
                      const amtDisplay = item.grams < 0
                        ? `${Math.abs(item.grams)} ${unitLabel}`
                        : item.fluid_ml != null && item.fluid_ml > 0
                          ? (item.fluid_ml >= 1000 ? `${(item.fluid_ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}` : `${Math.round(item.fluid_ml)}ml`)
                          : `${item.grams}g`
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
                              {amtDisplay} · {item.use_count} {t(lang, 'uses')}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)' }}>{Math.round(item.calories)}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)', marginInlineStart: 4 }}>{Math.round(item.protein * 10) / 10}</span>
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

        // ── Calendar week (Sun–Sat, week starts Sunday) ───────────
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay() - offset7 * 7)
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        weekEnd.setHours(23, 59, 59, 999)
        const range7Label = `${fmt(weekStart)} – ${fmt(weekEnd)}`

        // ── Fluid stats helpers (declared early — used in barDays) ────
        const fluidForDate = (date: string): number =>
          (grouped.get(date)?.meals ?? []).reduce((s, m) => s + (m.fluid_ml ?? 0), 0)

        const barDays: Array<{ label: string; dateKey: string; cal: number; prot: number; fluid: number; goalCal: number; goalProt: number; goalFluid: number; hasData: boolean }> = []
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart)
          d.setDate(weekStart.getDate() + i)
          const dKey = toKey(d)
          const data = grouped.get(dKey)
          const g    = getGoalForDate(dKey)
          const dayLabel = lang === 'he'
            ? ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][d.getDay()]
            : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]
          barDays.push({ label: dayLabel, dateKey: dKey, cal: data?.totalCalories ?? 0, prot: data?.totalProtein ?? 0, fluid: fluidForDate(dKey), goalCal: g.calories, goalProt: g.protein, goalFluid: fluidGoalMl, hasData: !!data })
        }

        const last7 = barDays.filter(b => b.hasData).map(b => b.dateKey)

        // ── Calendar month ────────────────────────────────────────
        const HE_MONTHS_SHORT = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳']
        const EN_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const monthNames = lang === 'he' ? HE_MONTHS_SHORT : EN_MONTHS_SHORT
        const calMonthRef = new Date(now.getFullYear(), now.getMonth() - offset30, 1)
        const monthStart = new Date(calMonthRef.getFullYear(), calMonthRef.getMonth(), 1)
        monthStart.setHours(0, 0, 0, 0)
        const monthEnd = new Date(calMonthRef.getFullYear(), calMonthRef.getMonth() + 1, 0)
        monthEnd.setHours(23, 59, 59, 999)
        const month30Title = `${monthNames[calMonthRef.getMonth()]} ${calMonthRef.getFullYear()}`
        const range30Label = `${fmt(monthStart)} – ${fmt(monthEnd)}`

        const last30 = sortedDates.filter(d => {
          const t = new Date(d).getTime()
          return t >= monthStart.getTime() && t <= monthEnd.getTime()
        })

        const avg = (arr: string[], key: 'totalCalories' | 'totalProtein') => {
          if (arr.length === 0) return 0
          return Math.round(arr.reduce((s, d) => s + (grouped.get(d)?.[key] ?? 0), 0) / arr.length)
        }

        const avg7Cal   = avg(last7,  'totalCalories')
        const avg7Prot  = avg(last7,  'totalProtein')

        // ── Weekly calorie balance ─────────────────────────────────
        const weeklyTotalCal  = barDays.filter(b => b.hasData).reduce((s, b) => s + b.cal,     0)
        const weeklyGoalCal   = barDays.filter(b => b.hasData).reduce((s, b) => s + b.goalCal, 0)
        const weeklyBalanceCal = weeklyTotalCal - weeklyGoalCal
        const avg30Cal  = avg(last30, 'totalCalories')
        const avg30Prot = avg(last30, 'totalProtein')

        const calOkDays7   = last7.filter(d  => grouped.get(d)?.calOk).length
        const protOkDays7  = last7.filter(d  => grouped.get(d)?.protOk).length
        const calOkDays30  = last30.filter(d => grouped.get(d)?.calOk).length
        const protOkDays30 = last30.filter(d => grouped.get(d)?.protOk).length
        const pct7Cal  = last7.length  ? Math.round(calOkDays7  / last7.length  * 100) : 0
        const pct7Prot = last7.length  ? Math.round(protOkDays7 / last7.length  * 100) : 0
        const pct30Cal = last30.length ? Math.round(calOkDays30 / last30.length * 100) : 0
        const pct30Prot= last30.length ? Math.round(protOkDays30/ last30.length * 100) : 0

        // ── Fluid stats ───────────────────────────────────────────
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

        const StatCard = ({ label, value, unit, color, pct, successDays, totalDays, pctColor, metric, onSelect, isActive }: {
          label: string; value: number | string; unit: string; color: string;
          pct?: number; successDays?: number; totalDays?: number; pctColor?: string
          metric?: 'cal' | 'prot' | 'fluid'
          onSelect?: (m: 'cal' | 'prot' | 'fluid') => void
          isActive?: boolean
        }) => (
          <div
            onClick={metric && onSelect ? () => onSelect(metric) : undefined}
            style={{
              flex: 1, background: 'var(--bg-card)', border: `1px solid ${isActive ? 'var(--accent-border-hi)' : 'var(--border)'}`,
              borderRadius: 12, padding: '12px 10px', textAlign: 'center',
              cursor: metric && onSelect ? 'pointer' : 'default',
              transition: 'border-color .15s',
            }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: 0, margin: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color }}>{typeof value === 'number' ? value.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US') : value}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginInlineStart: 3 }}>{unit}</span>
            </p>
            {pct !== undefined && (
              <p style={{ fontSize: 10, margin: '4px 0 0', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: pctColor ?? (pct >= 70 ? 'var(--positive-hi)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)') }}>{pct}%</span>
                {successDays !== undefined && totalDays !== undefined && (
                  <span style={{ color: 'var(--text-3)' }}> · {successDays}/{totalDays} {lang === 'he' ? 'ימים' : 'd'}</span>
                )}
              </p>
            )}
          </div>
        )

        if (last7.length === 0 && last30.length === 0) {
          return (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>bar_chart</span>
              <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noEnoughData')}</p>
            </div>
          )
        }

        // Today's goal for reference row
        const todayGoal = getGoalForDate(nowKey)

        const delta7Cal   = avg7Cal  - Math.round(todayGoal.calories)
        const delta7Prot  = Math.round(avg7Prot  - todayGoal.protein)
        const delta30Cal  = avg30Cal - Math.round(todayGoal.calories)
        const delta30Prot = Math.round(avg30Prot - todayGoal.protein)

        // Chart values derived from chartMetric7 toggle (7-day bar chart)
        const isCal7   = chartMetric7 === 'cal'
        const isProt7  = chartMetric7 === 'prot'
        const isFluid7 = chartMetric7 === 'fluid'
        const maxVal7  = Math.max(...barDays.map(b => {
          const val  = isCal7 ? b.cal  : isProt7 ? b.prot  : b.fluid
          const goal = isCal7 ? b.goalCal : isProt7 ? b.goalProt : b.goalFluid
          return Math.max(val, goal)
        }), 1)
        const barColor7        = isCal7 ? 'var(--accent)'            : isProt7 ? 'var(--positive)'            : 'var(--accent)'
        const goalDashColor7   = isCal7 ? 'var(--accent-border)' : isProt7 ? 'var(--positive-border)' : 'var(--accent-glow)'
        const goalLegendColor7 = isCal7 ? 'var(--accent-border)'  : isProt7 ? 'var(--positive-border)'  : 'var(--accent-glow)'

        // Chart values derived from chartMetric30 toggle (30-day line chart)
        const isCal30   = chartMetric30 === 'cal'
        const isProt30  = chartMetric30 === 'prot'
        const isFluid30 = chartMetric30 === 'fluid'

        // Build full calendar-month array (all days, hasData=false for missing days)
        const daysInMonth30 = new Date(calMonthRef.getFullYear(), calMonthRef.getMonth() + 1, 0).getDate()
        const lineDays30: Array<{ dateKey: string; label: string; cal: number; prot: number; fluid: number; hasData: boolean }> = []
        for (let i = 0; i < daysInMonth30; i++) {
          const d = new Date(monthStart)
          d.setDate(monthStart.getDate() + i)
          const dKey = toKey(d)
          const data30 = grouped.get(dKey)
          lineDays30.push({ dateKey: dKey, label: fmt(d), cal: data30?.totalCalories ?? 0, prot: data30?.totalProtein ?? 0, fluid: fluidForDate(dKey), hasData: !!data30 })
        }

        const lineGoal30 = isCal30 ? getGoalForDate(nowKey).calories : isProt30 ? getGoalForDate(nowKey).protein : fluidGoalMl
        const lineVals30 = lineDays30.map(d => isCal30 ? d.cal : isProt30 ? d.prot : d.fluid)
        const lineMax30  = Math.max(...lineVals30, lineGoal30, 1)
        const lineColorRaw30  = isCal30 ? 'var(--accent)' : isProt30 ? 'var(--positive)' : 'var(--accent)'
        const goalLineColor30 = isCal30
          ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
          : isProt30
          ? 'color-mix(in srgb, var(--positive) 45%, transparent)'
          : 'color-mix(in srgb, var(--accent) 35%, transparent)'

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
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-hi)', whiteSpace: 'nowrap' }}>
                  {todayGoal.calories.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--positive-hi)', whiteSpace: 'nowrap' }}>
                  {todayGoal.protein}g <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{lang === 'he' ? 'חלבון' : 'protein'}</span>
                </span>
                {fluidGoalMl > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-hi)', whiteSpace: 'nowrap' }}>
                    {fluidGoalMl >= 1000 ? `${(fluidGoalMl / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}` : `${fluidGoalMl}ml`}
                    {' '}<span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{lang === 'he' ? 'נוזלים' : 'fluid'}</span>
                  </span>
                )}
              </div>
            </div>

            {/* ── Period toggle ─────────────────────────────────── */}
            {styleMode === 'minimal' ? (
              <div className="tabs-secondary">
                {(['week', 'month'] as const).map(p => (
                  <button
                    key={p}
                    className={`tabs-secondary__btn${statsPeriod === p ? ' active' : ''}`}
                    onClick={() => switchStatsPeriod(p)}
                  >
                    {p === 'week' ? t(lang, 'week') : t(lang, 'month')}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 3, background: 'var(--bg-card2)', border: '1px solid var(--border-hi)',
                borderRadius: 999, padding: 3, position: 'relative',
                boxShadow: 'var(--shadow-md), inset 0 1px 0 var(--surface-2)',
              }}>
                {(['week', 'month'] as const).map(p => (
                  <button key={p} onClick={() => switchStatsPeriod(p)} style={{
                    padding: '8px 0', borderRadius: 999, border: statsPeriod === p ? `1px solid var(--accent-border-hi)` : '1px solid transparent', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, transition: 'all .22s',
                    background: statsPeriod === p ? 'var(--accent-select)' : 'transparent',
                    color: statsPeriod === p ? 'var(--accent-hi)' : 'var(--text-3)',
                    boxShadow: statsPeriod === p ? '0 0 14px var(--accent-glow)' : 'none',
                  }}>
                    {p === 'week' ? (t(lang, 'week')) : (t(lang, 'month'))}
                  </button>
                ))}
              </div>
            )}

            {/* 7-day section */}
            {statsPeriod === 'week' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                    {range7Label}
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginInlineStart: 6 }}>
                      · {last7.length} {t(lang, 'daysWithData')}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>
                    {t(lang, 'week')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset7(o => o + 1)}
                    aria-label={t(lang, 'prevWeek')}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_right' : 'chevron_left'}</span>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset7(o => o - 1)}
                    disabled={offset7 === 0}
                    aria-label={t(lang, 'nextWeek')}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_left' : 'chevron_right'}</span>
                  </button>
                </div>
              </div>
              {last7.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)' }}>
                  <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noDataInRange')}</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StatCard
                      label={t(lang, 'avgCal')}
                      value={avg7Cal} unit={t(lang, 'caloriesUnit')} color="var(--accent-hi)"
                      pct={pct7Cal} successDays={calOkDays7} totalDays={last7.length}
                      pctColor={pct7Cal >= 70 ? 'var(--positive-hi)' : pct7Cal >= 40 ? 'var(--warning)' : 'var(--danger)'}
                      metric="cal" onSelect={setChartMetric7} isActive={chartMetric7 === 'cal'}
                    />
                    <StatCard
                      label={t(lang, 'avgProt')}
                      value={avg7Prot} unit={t(lang, 'proteinUnit')} color="var(--positive-hi)"
                      pct={pct7Prot} successDays={protOkDays7} totalDays={last7.length}
                      pctColor={pct7Prot >= 70 ? 'var(--positive-hi)' : pct7Prot >= 40 ? 'var(--warning)' : 'var(--danger)'}
                      metric="prot" onSelect={setChartMetric7} isActive={chartMetric7 === 'prot'}
                    />
                    {fluidGoalMl > 0 && (
                      <StatCard
                        label={t(lang, 'avgFluid')}
                        value={avg7FluidMl >= 1000 ? (avg7FluidMl / 1000).toFixed(1) : avg7FluidMl}
                        unit={avg7FluidMl >= 1000 ? (lang === 'he' ? 'ל׳' : 'L') : 'ml'}
                        color="var(--cyan-hi)"
                        pct={pct7Fluid} successDays={goalDays7Fluid} totalDays={last7.length}
                        pctColor={pct7Fluid >= 70 ? 'var(--cyan-hi)' : pct7Fluid >= 40 ? 'var(--warning)' : 'var(--danger)'}
                        metric="fluid" onSelect={setChartMetric7} isActive={chartMetric7 === 'fluid'}
                      />
                    )}
                  </div>
                  {/* Weekly calorie balance card */}
                  {last7.length > 0 && (() => {
                    // Row 1: plan adherence (consumed vs. user goal)
                    const planDiff      = weeklyBalanceCal  // positive = over goal
                    const planOver      = planDiff > 0
                    const planExact     = planDiff === 0
                    const planColor     = planExact ? 'var(--text-3)' : planOver ? 'var(--warning)' : 'var(--positive-hi)'
                    const planSign      = planDiff > 0 ? '+' : ''
                    const planLocale    = lang === 'he' ? 'he-IL' : 'en-US'
                    const planLabel     = `${planSign}${Math.round(planDiff).toLocaleString(planLocale)} ${t(lang, 'caloriesUnit')} ${t(lang, 'calVsPlan')}`

                    // Row 2: weight impact (consumed vs. TDEE)
                    const hasWeightCalc = weeklyTdee > 0
                    const tdeeBalance   = weeklyTotalCal - weeklyTdee          // negative = deficit
                    const weightGrams   = Math.round(Math.abs(tdeeBalance) / 7.7)  // 7700 kcal/kg → /7.7 = grams
                    const isWeightLoss  = tdeeBalance < 0
                    const isWeightGain  = tdeeBalance > 0
                    const weightColor   = isWeightLoss ? 'var(--positive-hi)' : isWeightGain ? 'var(--warning)' : 'var(--text-3)'
                    const weightLabel   = isWeightLoss
                      ? `${t(lang, 'weightLossOf')}${weightGrams}${t(lang, 'gramsSuffix')}`
                      : isWeightGain
                      ? `${t(lang, 'weightGainOf')}${weightGrams}${t(lang, 'gramsSuffix')}`
                      : t(lang, 'noWeightChange')

                    return (
                      <div style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 12, padding: '10px 14px',
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        {/* Header */}
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
                          {t(lang, 'weeklyBalance')}
                        </p>

                        {/* Plan row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {t(lang, 'weeklyPlan')}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                              {Math.round(weeklyTotalCal).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}
                              {' / '}
                              {Math.round(weeklyGoalCal).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: planColor, fontVariantNumeric: 'tabular-nums' }}>
                              {planExact ? '✓' : planLabel}
                            </span>
                          </div>
                        </div>

                        {/* Weight impact row */}
                        {hasWeightCalc && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                              {t(lang, 'weightImpact')}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: weightColor }}>
                                {weightLabel}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>*</span>
                            </div>
                          </div>
                        )}

                        {hasWeightCalc && (
                          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>
                            {t(lang, 'tdeeNote')}
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Bar chart */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>
                        {range7Label}
                      </p>
                      <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 2, gap: 2 }}>
                        {(['cal', 'prot', 'fluid'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => setChartMetric7(m)}
                            style={{
                              padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              fontFamily: 'inherit', fontSize: 11, fontWeight: 700, transition: 'all .15s',
                              background: chartMetric7 === m ? (m === 'prot' ? 'var(--positive)' : 'var(--accent)') : 'transparent',
                              color: chartMetric7 === m ? 'var(--on-color)' : 'var(--text-3)',
                            }}
                          >
                            {m === 'cal' ? (t(lang, 'calShort')) : m === 'prot' ? (t(lang, 'protShort')) : (t(lang, 'fluid'))}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: barH + 20 }}>
                      {barDays.map(b => {
                        const val      = isCal7 ? b.cal  : isProt7 ? b.prot  : b.fluid
                        const goalVal  = isCal7 ? b.goalCal : isProt7 ? b.goalProt : b.goalFluid
                        const hasBar   = b.hasData || (isFluid7 && b.fluid > 0)
                        const barHeight  = hasBar ? Math.max(4, Math.round((val / maxVal7) * barH)) : 0
                        const isSelected = selectedBarDate === b.dateKey
                        const goalHeight = goalVal > 0 ? Math.max(2, Math.round((goalVal / maxVal7) * barH)) : 0
                        const overGoal = hasBar && val > goalVal && goalVal > 0
                        const barBg    = isFluid7
                          ? (overGoal ? 'var(--positive)' : barColor7)
                          : (overGoal ? 'var(--warning)' : barColor7)
                        const valLabel = isFluid7
                          ? (val >= 1000 ? `${(val / 1000).toFixed(1)}` : `${Math.round(val)}`)
                          : isCal7 ? `${Math.round(val)}` : `${Math.round(val * 10) / 10}`
                        return (
                          <div
                            key={b.dateKey}
                            onClick={b.hasData ? () => setSelectedBarDate(b.dateKey) : undefined}
                            style={{
                              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                              cursor: b.hasData ? 'pointer' : 'default',
                              borderRadius: 6,
                              background: isSelected ? 'var(--accent-fill)' : 'transparent',
                              transition: 'background .15s',
                            }}
                          >
                            <div style={{ position: 'relative', width: '100%', height: barH, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                              {goalHeight > 0 && <div style={{ position: 'absolute', bottom: goalHeight, left: 0, right: 0, borderTop: `1.5px dashed ${goalDashColor7}` }} />}
                              {hasBar && (
                                <div style={{
                                  width: '70%', height: barHeight,
                                  borderRadius: '4px 4px 0 0',
                                  background: barBg, opacity: isSelected ? 1 : 0.85,
                                  transition: 'height .3s ease, opacity .15s',
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
                            <span style={{ fontSize: 9, fontWeight: 600, color: isSelected ? 'var(--accent-hi)' : 'var(--text-3)' }}>{b.label}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                        <div style={{ width: 12, height: 3, background: barColor7, borderRadius: 2 }} />
                        {isCal7 ? (lang === 'he' ? 'קלוריות' : 'Calories') : isProt7 ? (lang === 'he' ? 'חלבון' : 'Protein') : (t(lang, 'fluid'))}
                      </div>
                      {(!isFluid7 || fluidGoalMl > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                          <div style={{ width: 12, borderTop: `1.5px dashed ${goalLegendColor7}` }} />
                          {lang === 'he' ? 'יעד' : 'Goal'}
                          <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                            {isCal7
                              ? `${todayGoal.calories.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} ${t(lang, 'caloriesUnit')}`
                              : isProt7
                                ? `${todayGoal.protein}${t(lang, 'proteinUnit')}`
                                : fmtMl(fluidGoalMl)}
                          </span>
                        </div>
                      )}
                      {!isFluid7 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                          <div style={{ width: 12, height: 3, background: 'var(--warning)', borderRadius: 2 }} />
                          {lang === 'he' ? 'חריגה' : 'Over goal'}
                        </div>
                      )}
                      {isFluid7 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                          <div style={{ width: 12, height: 3, background: 'var(--positive)', borderRadius: 2 }} />
                          {t(lang, 'reachedGoal')}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 7-day insight */}
                  {last7.length >= 3 && (
                    <div style={{ background: 'var(--accent-fill)', border: '1px solid var(--accent-chip)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* calories row */}
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 5px', fontSize: 12, lineHeight: 1.5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-hi)', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {lang === 'he' ? `${calOkDays7} מתוך ${last7.length} ימים ביעד` : `${calOkDays7} of ${last7.length} days on target`}
                        </span>
                        <span style={{ color: 'var(--text-3)' }}>·</span>
                        <span style={{ color: 'var(--text-2)' }}>
                          {lang === 'he' ? `ממוצע ${avg7Cal.toLocaleString('he-IL')} קק״ל` : `avg ${avg7Cal.toLocaleString('en-US')} kcal`}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 5, padding: '1px 6px',
                          color: delta7Cal === 0 ? 'var(--positive-hi)' : delta7Cal > 0 ? 'var(--warning)' : 'var(--accent-hi)',
                          background: delta7Cal === 0 ? 'var(--positive-fill)' : delta7Cal > 0 ? 'var(--warning-tint)' : 'var(--accent-fill)',
                        }}>
                          {delta7Cal === 0
                            ? (lang === 'he' ? 'בדיוק ביעד' : 'on target')
                            : `${delta7Cal > 0 ? '+' : '−'}${Math.abs(delta7Cal).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} ${lang === 'he' ? 'קק״ל' : 'kcal'}`}
                        </span>
                      </div>
                      {/* protein row */}
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 5px', fontSize: 12, lineHeight: 1.5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive-hi)', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {lang === 'he' ? `${protOkDays7} מתוך ${last7.length} ימים ביעד` : `${protOkDays7} of ${last7.length} days on target`}
                        </span>
                        <span style={{ color: 'var(--text-3)' }}>·</span>
                        <span style={{ color: 'var(--text-2)' }}>
                          {lang === 'he' ? `ממוצע ${avg7Prot}ג׳ חלבון` : `avg ${avg7Prot}g protein`}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 5, padding: '1px 6px',
                          color: delta7Prot === 0 ? 'var(--positive-hi)' : delta7Prot > 0 ? 'var(--warning)' : 'var(--accent-hi)',
                          background: delta7Prot === 0 ? 'var(--positive-fill)' : delta7Prot > 0 ? 'var(--warning-tint)' : 'var(--accent-fill)',
                        }}>
                          {delta7Prot === 0
                            ? (lang === 'he' ? 'בדיוק ביעד' : 'on target')
                            : `${delta7Prot > 0 ? '+' : '−'}${Math.abs(delta7Prot)}${lang === 'he' ? 'ג׳' : 'g'}`}
                        </span>
                      </div>
                      {/* fluid row */}
                      {fluidGoalMl > 0 && fluidDays7.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 5px', fontSize: 12, lineHeight: 1.5 }}>
                          <span className="icon" style={{ fontSize: 12, color: 'var(--cyan-hi)', flexShrink: 0 }}>water_drop</span>
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                            {lang === 'he' ? `${goalDays7Fluid} מתוך ${last7.length} ימים ביעד` : `${goalDays7Fluid} of ${last7.length} days on target`}
                          </span>
                          <span style={{ color: 'var(--text-3)' }}>·</span>
                          <span style={{ color: 'var(--text-2)' }}>
                            {lang === 'he' ? `ממוצע ${fmtMl(avg7FluidMl)} נוזלים` : `avg ${fmtMl(avg7FluidMl)} fluid`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>}

            {/* 30-day section */}
            {statsPeriod === 'month' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                    {month30Title}
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginInlineStart: 6 }}>
                      · {last30.length} {t(lang, 'daysWithData')}
                    </span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>{range30Label}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset30(o => o + 1)}
                    aria-label={t(lang, 'prevMonth')}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_right' : 'chevron_left'}</span>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setOffset30(o => o - 1)}
                    disabled={offset30 === 0}
                    aria-label={t(lang, 'nextMonth')}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_left' : 'chevron_right'}</span>
                  </button>
                </div>
              </div>
              {last30.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)' }}>
                  <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noDataInRange')}</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <StatCard
                      label={t(lang, 'avgCal')}
                      value={avg30Cal} unit={t(lang, 'caloriesUnit')} color="var(--accent-hi)"
                      pct={pct30Cal} successDays={calOkDays30} totalDays={last30.length}
                      pctColor={pct30Cal >= 70 ? 'var(--positive-hi)' : pct30Cal >= 40 ? 'var(--warning)' : 'var(--danger)'}
                      metric="cal" onSelect={setChartMetric30} isActive={chartMetric30 === 'cal'}
                    />
                    <StatCard
                      label={t(lang, 'avgProt')}
                      value={avg30Prot} unit={t(lang, 'proteinUnit')} color="var(--positive-hi)"
                      pct={pct30Prot} successDays={protOkDays30} totalDays={last30.length}
                      pctColor={pct30Prot >= 70 ? 'var(--positive-hi)' : pct30Prot >= 40 ? 'var(--warning)' : 'var(--danger)'}
                      metric="prot" onSelect={setChartMetric30} isActive={chartMetric30 === 'prot'}
                    />
                    {fluidGoalMl > 0 && (
                      <StatCard
                        label={t(lang, 'avgFluid')}
                        value={avg30FluidMl >= 1000 ? (avg30FluidMl / 1000).toFixed(1) : avg30FluidMl}
                        unit={avg30FluidMl >= 1000 ? (lang === 'he' ? 'ל׳' : 'L') : 'ml'}
                        color="var(--cyan-hi)"
                        pct={pct30Fluid} successDays={goalDays30Fluid} totalDays={last30.length}
                        pctColor={pct30Fluid >= 70 ? 'var(--cyan-hi)' : pct30Fluid >= 40 ? 'var(--warning)' : 'var(--danger)'}
                        metric="fluid" onSelect={setChartMetric30} isActive={chartMetric30 === 'fluid'}
                      />
                    )}
                  </div>

                  {/* ── 30-day SVG line chart ─────────────────────── */}
                  {(() => {
                    const svgW = 320, svgH = 100
                    const padL = 4, padR = 4, padT = 12, padB = 18
                    const chartW = svgW - padL - padR
                    const chartH = svgH - padT - padB
                    const n = lineDays30.length // 30

                    const xPos = (i: number) => padL + (i / (n - 1)) * chartW
                    const yPos = (v: number) => padT + chartH - (v / lineMax30) * chartH

                    // Goal line y
                    const goalY = yPos(lineGoal30)

                    // Build polyline segments — break on missing data
                    type Seg = { x: number; y: number }[]
                    const segments: Seg[] = []
                    let cur: Seg = []
                    lineDays30.forEach((d, i) => {
                      const v = isCal30 ? d.cal : isProt30 ? d.prot : d.fluid
                      if (d.hasData || (isFluid30 && v > 0)) {
                        cur.push({ x: xPos(i), y: yPos(v) })
                      } else {
                        if (cur.length > 0) { segments.push(cur); cur = [] }
                      }
                    })
                    if (cur.length > 0) segments.push(cur)

                    const toPolyline = (seg: Seg) => seg.map(p => `${p.x},${p.y}`).join(' ')

                    // Date labels — show ~5 evenly spaced
                    const labelIdxs = [0, 7, 14, 21, 29]

                    // Area fill — build closed path per segment
                    const toAreaPath = (seg: Seg) => {
                      if (seg.length < 2) return ''
                      const bottom = padT + chartH
                      const pts = seg.map(p => `${p.x},${p.y}`).join(' L ')
                      return `M ${seg[0].x},${bottom} L ${pts} L ${seg[seg.length-1].x},${bottom} Z`
                    }

                    return (
                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 12px' }}>
                        {/* chart header: range + toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>{range30Label}</p>
                          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 2, gap: 2 }}>
                            {(['cal', 'prot', 'fluid'] as const).map(m => (
                              <button
                                key={m}
                                onClick={() => setChartMetric30(m)}
                                style={{
                                  padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                  fontFamily: 'inherit', fontSize: 11, fontWeight: 700, transition: 'all .15s',
                                  background: chartMetric30 === m ? (m === 'prot' ? 'var(--positive)' : 'var(--accent)') : 'transparent',
                                  color: chartMetric30 === m ? 'var(--on-color)' : 'var(--text-3)',
                                }}
                              >
                                {m === 'cal' ? (t(lang, 'calShort')) : m === 'prot' ? (t(lang, 'protShort')) : (t(lang, 'fluid'))}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* SVG line chart */}
                        <svg
                          viewBox={`0 0 ${svgW} ${svgH}`}
                          style={{ width: '100%', height: 'auto', overflow: 'visible', display: 'block', cursor: 'pointer' }}
                          onClick={(e: React.MouseEvent<SVGSVGElement>) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const svgX = ((e.clientX - rect.left) / rect.width) * svgW
                            const i = Math.max(0, Math.min(n - 1, Math.round((svgX - padL) / chartW * (n - 1))))
                            const day = lineDays30[i]
                            if (day?.hasData) setSelectedBarDate(day.dateKey)
                          }}
                        >
                          {/* Goal line */}
                          <line
                            x1={padL} y1={goalY} x2={svgW - padR} y2={goalY}
                            style={{ stroke: goalLineColor30 }} strokeWidth={1.5} strokeDasharray="4 3"
                          />

                          {/* Area fills */}
                          {segments.map((seg, si) => (
                            <path
                              key={`area-${si}`}
                              d={toAreaPath(seg)}
                              style={{ fill: lineColorRaw30, fillOpacity: 0.08 }}
                            />
                          ))}

                          {/* Polylines */}
                          {segments.map((seg, si) => (
                            <polyline
                              key={`line-${si}`}
                              points={toPolyline(seg)}
                              fill="none"
                              style={{ stroke: lineColorRaw30 }}
                              strokeWidth={2}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                            />
                          ))}

                          {/* Selected day indicator */}
                          {selectedBarDate && (() => {
                            const selIdx = lineDays30.findIndex(d => d.dateKey === selectedBarDate)
                            if (selIdx < 0) return null
                            const sx = xPos(selIdx)
                            return (
                              <line
                                x1={sx} y1={padT} x2={sx} y2={padT + chartH}
                                style={{ stroke: lineColorRaw30 }} strokeWidth={1} strokeDasharray="3 2" opacity={0.6}
                              />
                            )
                          })()}

                          {/* Data dots — only on days with data */}
                          {lineDays30.map((d, i) => {
                            const v = isCal30 ? d.cal : isProt30 ? d.prot : d.fluid
                            if (!d.hasData && !(isFluid30 && v > 0)) return null
                            const overGoal = v > lineGoal30 && lineGoal30 > 0
                            const dotColor = isFluid30
                              ? (overGoal ? 'var(--positive)' : lineColorRaw30)
                              : (overGoal && !isFluid30 ? 'var(--warning)' : lineColorRaw30)
                            const isSelected = selectedBarDate === d.dateKey
                            return (
                              <circle
                                key={d.dateKey}
                                cx={xPos(i)} cy={yPos(v)}
                                r={isSelected ? 4.5 : 2.5}
                                style={{ fill: dotColor }} stroke="var(--bg-card)" strokeWidth={1.5}
                              />
                            )
                          })}

                          {/* X-axis date labels */}
                          {labelIdxs.map(i => {
                            if (i >= lineDays30.length) return null
                            return (
                              <text
                                key={i}
                                x={xPos(i)} y={svgH - 2}
                                textAnchor="middle"
                                fontSize={8} fill="var(--text-3)" fontFamily="inherit"
                              >
                                {lineDays30[i].label}
                              </text>
                            )
                          })}
                        </svg>

                        {/* Legend */}
                        <div style={{ display: 'flex', gap: 14, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                            <div style={{ width: 16, height: 2, background: lineColorRaw30, borderRadius: 2 }} />
                            {isCal30 ? (lang === 'he' ? 'קלוריות' : 'Calories') : isProt30 ? (lang === 'he' ? 'חלבון' : 'Protein') : (t(lang, 'fluid'))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
                            <div style={{ width: 16, borderTop: `1.5px dashed ${goalLineColor30}` }} />
                            {lang === 'he' ? 'יעד' : 'Goal'}
                            <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>
                              {isCal30 ? `${lineGoal30.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} ${t(lang, 'caloriesUnit')}` : isProt30 ? `${lineGoal30}${t(lang, 'proteinUnit')}` : fmtMl(lineGoal30)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* 30-day insight */}
                  {last30.length >= 7 && (
                    <div style={{ background: 'var(--accent-fill)', border: '1px solid var(--accent-chip)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* calories row */}
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 5px', fontSize: 12, lineHeight: 1.5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-hi)', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {lang === 'he' ? `${calOkDays30} מתוך ${last30.length} ימים ביעד` : `${calOkDays30} of ${last30.length} days on target`}
                        </span>
                        <span style={{ color: 'var(--text-3)' }}>·</span>
                        <span style={{ color: 'var(--text-2)' }}>
                          {lang === 'he' ? `ממוצע ${avg30Cal.toLocaleString('he-IL')} קק״ל` : `avg ${avg30Cal.toLocaleString('en-US')} kcal`}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 5, padding: '1px 6px',
                          color: delta30Cal === 0 ? 'var(--positive-hi)' : delta30Cal > 0 ? 'var(--warning)' : 'var(--accent-hi)',
                          background: delta30Cal === 0 ? 'var(--positive-fill)' : delta30Cal > 0 ? 'var(--warning-tint)' : 'var(--accent-fill)',
                        }}>
                          {delta30Cal === 0
                            ? (lang === 'he' ? 'בדיוק ביעד' : 'on target')
                            : `${delta30Cal > 0 ? '+' : '−'}${Math.abs(delta30Cal).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} ${lang === 'he' ? 'קק״ל' : 'kcal'}`}
                        </span>
                      </div>
                      {/* protein row */}
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 5px', fontSize: 12, lineHeight: 1.5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive-hi)', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {lang === 'he' ? `${protOkDays30} מתוך ${last30.length} ימים ביעד` : `${protOkDays30} of ${last30.length} days on target`}
                        </span>
                        <span style={{ color: 'var(--text-3)' }}>·</span>
                        <span style={{ color: 'var(--text-2)' }}>
                          {lang === 'he' ? `ממוצע ${avg30Prot}ג׳ חלבון` : `avg ${avg30Prot}g protein`}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 5, padding: '1px 6px',
                          color: delta30Prot === 0 ? 'var(--positive-hi)' : delta30Prot > 0 ? 'var(--warning)' : 'var(--accent-hi)',
                          background: delta30Prot === 0 ? 'var(--positive-fill)' : delta30Prot > 0 ? 'var(--warning-tint)' : 'var(--accent-fill)',
                        }}>
                          {delta30Prot === 0
                            ? (lang === 'he' ? 'בדיוק ביעד' : 'on target')
                            : `${delta30Prot > 0 ? '+' : '−'}${Math.abs(delta30Prot)}${lang === 'he' ? 'ג׳' : 'g'}`}
                        </span>
                      </div>
                      {/* fluid row */}
                      {fluidGoalMl > 0 && fluidDays30.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 5px', fontSize: 12, lineHeight: 1.5 }}>
                          <span className="icon" style={{ fontSize: 12, color: 'var(--cyan-hi)', flexShrink: 0 }}>water_drop</span>
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                            {lang === 'he' ? `${goalDays30Fluid} מתוך ${last30.length} ימים ביעד` : `${goalDays30Fluid} of ${last30.length} days on target`}
                          </span>
                          <span style={{ color: 'var(--text-3)' }}>·</span>
                          <span style={{ color: 'var(--text-2)' }}>
                            {lang === 'he' ? `ממוצע ${fmtMl(avg30FluidMl)} נוזלים` : `avg ${fmtMl(avg30FluidMl)} fluid`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>}

            {/* ── Meal timing insights ──────────────────────────────────────── */}
            {(() => {
              const periodDates = statsPeriod === 'week' ? last7 : last30
              if (periodDates.length === 0) return null

              const periodMeals = periodDates.flatMap(d => grouped.get(d)?.meals ?? [])
                .filter(m => m.time_logged)

              if (periodMeals.length === 0) return null

              // Convert "HH:MM:SS" to minutes since midnight
              const toMins = (t: string) => {
                const [h, m] = t.split(':').map(Number)
                return h * 60 + (m || 0)
              }
              const fmtTime = (mins: number) => {
                const h = Math.floor(mins / 60) % 24
                const m = Math.round(mins % 60)
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
              }

              const byType: Record<string, number[]> = {}
              for (const m of periodMeals) {
                if (!byType[m.meal_type]) byType[m.meal_type] = []
                byType[m.meal_type].push(toMins(m.time_logged))
              }

              const typeOrder = ['breakfast', 'lunch', 'dinner', 'snack', 'beverage']
              const typeLabels: Record<string, string> = {
                breakfast: t(lang, 'breakfast'),
                lunch:     t(lang, 'lunch'),
                dinner:    t(lang, 'dinner'),
                snack:     t(lang, 'snack'),
                beverage:  t(lang, 'beverage'),
              }
              const typeColors: Record<string, string> = {
                breakfast: 'var(--warning)', lunch: 'var(--accent-hi)',
                dinner: 'var(--positive-hi)', snack: 'var(--text-2)', beverage: 'var(--cyan-hi)',
              }

              const avgMins = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)

              const rows = typeOrder.filter(t => byType[t]?.length).map(type => ({
                type, label: typeLabels[type], color: typeColors[type],
                avg: fmtTime(avgMins(byType[type])),
                count: byType[type].length,
              }))

              if (rows.length === 0) return null

              return (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
                    {t(lang, 'mealTiming')}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rows.map(r => (
                      <div key={r.type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: r.color, flex: 1 }}>{r.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{r.avg}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', minWidth: 30, textAlign: 'end' }}>×{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── Bar day detail modal ─────────────────────────────────────────── */}
      {selectedBarDate && (() => {
        const data = grouped.get(selectedBarDate)
        if (!data) return null
        const chronoDates = Array.from(grouped.keys()).sort()
        const idx = chronoDates.indexOf(selectedBarDate)
        const prevDate = idx > 0 ? chronoDates[idx - 1] : null
        const nextDate = idx < chronoDates.length - 1 ? chronoDates[idx + 1] : null
        const goTo = (dateKey: string) => setSelectedBarDate(dateKey)
        return (
          <div className="compose-modal-backdrop" onClick={() => setSelectedBarDate(null)}>
            <div
              className="compose-modal"
              style={{ maxWidth: 440, padding: 0, overflow: 'hidden', height: '82vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}
              onTouchStart={e => { panelTouchStartX.current = e.touches[0].clientX }}
              onTouchEnd={e => {
                const delta = e.changedTouches[0].clientX - panelTouchStartX.current
                if (Math.abs(delta) < 44) return
                const isRTL = lang === 'he'
                const goForward  = isRTL ? delta > 0 : delta < 0
                if (goForward  && nextDate) goTo(nextDate)
                if (!goForward && prevDate) goTo(prevDate)
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 10px 0' }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    onClick={() => prevDate && goTo(prevDate)}
                    disabled={!prevDate}
                    style={{ background: 'none', border: 'none', cursor: prevDate ? 'pointer' : 'default', color: prevDate ? 'var(--text-2)' : 'var(--border)', padding: 4, display: 'flex', borderRadius: 6 }}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_right' : 'chevron_left'}</span>
                  </button>
                  <button
                    onClick={() => nextDate && goTo(nextDate)}
                    disabled={!nextDate}
                    style={{ background: 'none', border: 'none', cursor: nextDate ? 'pointer' : 'default', color: nextDate ? 'var(--text-2)' : 'var(--border)', padding: 4, display: 'flex', borderRadius: 6 }}
                  >
                    <span className="icon icon-sm">{lang === 'he' ? 'chevron_left' : 'chevron_right'}</span>
                  </button>
                </div>
                <button
                  onClick={() => setSelectedBarDate(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
                >
                  <span className="icon icon-sm">close</span>
                </button>
              </div>
              {/* Day summary */}
              <div style={{ padding: '0 14px 12px' }}>
                <DayCardContent date={selectedBarDate} data={data} />
              </div>
              {/* Scrollable meals */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <MealsList data={data} />
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── View switcher — pill FAB, same in all modes. Minimal colors via CSS tokens. ── */}
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(32px + env(safe-area-inset-bottom, 0px))',
          insetInlineEnd: 'max(calc((100vw - 560px) / 2 + 24px), 24px)',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-card2)',
          border: '1px solid var(--border-hi)',
          borderRadius: 999,
          padding: fabPad,
          gap: fabGap,
          boxShadow: 'var(--shadow-xl), inset 0 1px 0 var(--surface-2)',
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
          background: 'var(--accent-select)',
          border: '1px solid var(--accent-border-hi)',
          boxShadow: '0 0 14px var(--accent-glow)',
          transition: 'left 0.28s cubic-bezier(.34,1.56,.64,1)',
          pointerEvents: 'none',
        }} />
        <button
          className="fab-pill-btn"
          onClick={() => { switchView('cal'); setSelectedBarDate(null) }}
          aria-label={lang === 'he' ? 'תצוגת לוח שנה' : 'Calendar view'}
          aria-pressed={view === 'cal'}
          style={{
            width: fabBtnSize, height: fabBtnSize, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer',
            position: 'relative', zIndex: 1,
            color: view === 'cal' ? 'var(--accent-hi)' : 'var(--text-3)',
          }}
        >
          <span className="icon" style={{ fontSize: 20 }}>calendar_month</span>
        </button>
        <button
          className="fab-pill-btn"
          onClick={() => { switchView('list'); setSelectedBarDate(null) }}
          aria-label={lang === 'he' ? 'תצוגת רשימה' : 'List view'}
          aria-pressed={view === 'list'}
          style={{
            width: fabBtnSize, height: fabBtnSize, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer',
            position: 'relative', zIndex: 1,
            color: view === 'list' ? 'var(--accent-hi)' : 'var(--text-3)',
          }}
        >
          <span className="icon" style={{ fontSize: 20 }}>format_list_bulleted</span>
        </button>
        <button
          className="fab-pill-btn"
          onClick={() => { switchView('stats'); setSelectedBarDate(null) }}
          aria-label={lang === 'he' ? 'תצוגת סטטיסטיקות' : 'Statistics view'}
          aria-pressed={view === 'stats'}
          style={{
            width: fabBtnSize, height: fabBtnSize, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer',
            position: 'relative', zIndex: 1,
            color: view === 'stats' ? 'var(--accent-hi)' : 'var(--text-3)',
          }}
        >
          <span className="icon" style={{ fontSize: 20 }}>bar_chart</span>
        </button>
      </div>
    </>
  )
}
