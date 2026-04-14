import { useMemo, useState, useRef, useCallback } from 'react'
import type { Meal, FoodHistory } from '../types'
import type { Lang } from '../lib/i18n'
import { t, today } from '../lib/i18n'
import { FoodEntryForm } from './FoodEntryForm'
import { MealCard } from './MealCard'
import { DailySummary } from './DailySummary'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: '#f59e0b',
  lunch:     '#10b981',
  dinner:    '#8b5cf6',
  snack:     '#f43f5e',
}

const MEAL_ICONS: Record<MealType, string> = {
  breakfast: 'wb_sunny',
  lunch:     'lunch_dining',
  dinner:    'nights_stay',
  snack:     'nutrition',
}

interface TodayTabProps {
  lang: Lang
  meals: Meal[]
  history: FoodHistory[]
  goalCalories: number
  goalProtein: number
  getSuggestions: (q: string) => FoodHistory[]
  onAddMeal: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => void
  onEditMeal: (id: string, updates: Partial<Meal>) => void
  onDeleteMeal: (id: string) => void
  onDuplicateMeal: (meal: Meal) => void
  onUpsertHistory: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>) => void
}

// Summary card can sit at index 0 (top) or after any of the visible meal groups
// Stored as a slot index: 0 = before first group, 1 = after first group, etc.
function loadSummarySlot(): number {
  const v = localStorage.getItem('summary-slot')
  return v !== null ? Number(v) : 999 // default: bottom
}
function saveSummarySlot(n: number) {
  localStorage.setItem('summary-slot', String(n))
}

function loadCollapsed(): Set<MealType> {
  try {
    const v = localStorage.getItem('collapsed-groups')
    return v ? new Set(JSON.parse(v)) : new Set()
  } catch { return new Set() }
}
function saveCollapsed(s: Set<MealType>) {
  localStorage.setItem('collapsed-groups', JSON.stringify([...s]))
}

export function TodayTab({
  lang, meals, history, goalCalories, goalProtein,
  getSuggestions, onAddMeal, onEditMeal, onDeleteMeal, onDuplicateMeal, onUpsertHistory,
}: TodayTabProps) {
  const todayMeals = useMemo(() => meals.filter(m => m.date === today()), [meals])

  const mealsByType = useMemo(() => {
    const grouped: Record<MealType, Meal[]> = { breakfast: [], lunch: [], dinner: [], snack: [] }
    todayMeals.forEach(m => { if (grouped[m.meal_type as MealType]) grouped[m.meal_type as MealType].push(m) })
    return grouped
  }, [todayMeals])

  const visibleTypes = useMemo(
    () => MEAL_TYPES.filter(t => mealsByType[t].length > 0),
    [mealsByType]
  )

  // ── Collapsible groups ───────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<MealType>>(loadCollapsed)

  const toggleCollapse = (type: MealType) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      saveCollapsed(next)
      return next
    })
  }

  // ── Draggable summary card ───────────────────────────────────────
  // summarySlot: position among the visible groups (0 = top, n = after group n-1)
  const [summarySlot, setSummarySlot] = useState(loadSummarySlot)

  // drag state
  const dragging      = useRef(false)
  const dragStartY    = useRef(0)
  const dragCurrentY  = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging,  setIsDragging]  = useState(false)
  const containerRef  = useRef<HTMLDivElement>(null)
  const summaryRef    = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current    = true
    dragStartY.current  = e.clientY
    dragCurrentY.current = e.clientY
    setIsDragging(true)
    setDragOffset(0)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragCurrentY.current = e.clientY
    setDragOffset(e.clientY - dragStartY.current)
  }, [])

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)

    const delta = dragCurrentY.current - dragStartY.current
    const groupCount = visibleTypes.length
    // Each group is roughly 80px tall; estimate slot from drag delta
    const slotDelta = Math.round(delta / 80)
    const newSlot   = Math.max(0, Math.min(groupCount, summarySlot + slotDelta))

    setSummarySlot(newSlot)
    saveSummarySlot(newSlot)
    setDragOffset(0)
  }, [summarySlot, visibleTypes.length])

  // ── Render helpers ───────────────────────────────────────────────
  const summaryCard = (
    <div
      ref={summaryRef}
      style={{
        marginBottom: 20,
        transform: isDragging ? `translateY(${dragOffset}px)` : 'none',
        transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(.22,.9,.36,1)',
        zIndex: isDragging ? 10 : 'auto',
        position: 'relative',
        opacity: isDragging ? 0.92 : 1,
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 24,
          marginBottom: 4,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <span className="icon icon-sm" style={{ color: 'var(--text-3)', fontSize: 20 }}>drag_handle</span>
      </div>

      <DailySummary
        meals={todayMeals}
        date={today()}
        goalCalories={goalCalories}
        goalProtein={goalProtein}
        lang={lang}
      />
    </div>
  )

  const mealGroup = (type: MealType, i: number) => {
    const typeMeals = mealsByType[type]
    const isCollapsed = collapsed.has(type)
    const totalCal  = Math.round(typeMeals.reduce((s, m) => s + m.calories, 0))
    const totalProt = Math.round(typeMeals.reduce((s, m) => s + m.protein,  0) * 10) / 10

    return (
      <div key={type} className="fade-up" style={{ animationDelay: `${i * 0.05}s`, marginBottom: 16 }}>
        {/* Group header — clickable to collapse */}
        <button
          onClick={() => toggleCollapse(type)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            width: '100%', background: 'none', border: 'none',
            padding: '4px 0 6px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span className="icon icon-sm" style={{ color: MEAL_COLORS[type] }}>
            {MEAL_ICONS[type]}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1, textAlign: 'start' }}>
            {t(lang, type)}
          </span>

          {/* Collapsed summary */}
          {isCollapsed && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>{totalCal} kcal</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)' }}>{totalProt}g</span>
            </span>
          )}

          <span className="icon icon-sm" style={{ color: 'var(--text-3)', transition: 'transform .2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            expand_more
          </span>
        </button>

        {/* Meal cards */}
        {!isCollapsed && typeMeals.map(meal => (
          <MealCard
            key={meal.id}
            meal={meal}
            lang={lang}
            onEdit={onEditMeal}
            onDelete={onDeleteMeal}
            onDuplicate={onDuplicateMeal}
          />
        ))}
      </div>
    )
  }

  // ── Compose the list with summary card inserted at summarySlot ──
  const items: React.ReactNode[] = []
  const clampedSlot = Math.min(summarySlot, visibleTypes.length)

  visibleTypes.forEach((type, i) => {
    if (i === clampedSlot) items.push(<div key="summary">{summaryCard}</div>)
    items.push(mealGroup(type, i))
  })
  // If slot >= number of groups, put summary at the end
  if (clampedSlot >= visibleTypes.length) items.push(<div key="summary">{summaryCard}</div>)

  return (
    <div ref={containerRef}>
      <FoodEntryForm
        lang={lang}
        history={history}
        getSuggestions={getSuggestions}
        onAdd={onAddMeal}
        onUpsertHistory={onUpsertHistory}
      />

      {todayMeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
          <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>restaurant_menu</span>
          <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noMealsToday')}</p>
        </div>
      )}

      {items}

      {/* Show summary even when no meal groups exist */}
      {visibleTypes.length === 0 && todayMeals.length === 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', fontSize: 20 }}>drag_handle</span>
          </div>
          <DailySummary meals={[]} date={today()} goalCalories={goalCalories} goalProtein={goalProtein} lang={lang} />
        </div>
      )}
    </div>
  )
}
