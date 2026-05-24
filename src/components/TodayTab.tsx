import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSheetScroll } from '../hooks/useSheetScroll'
import { SheetHandle } from './SheetHandle'
import type { Meal, FoodHistory, FoodLibraryItem, ComposedGroup } from '../types'
import type { Lang, MealTypeKey } from '../lib/i18n'
import { t, dir, today, currentTime } from '../lib/i18n'
import { FoodEntryForm } from './FoodEntryForm'
import type { ComposedEntry } from './FoodEntryForm'
import { MealCard } from './MealCard'
import { ComposedMealCard } from './ComposedMealCard'
import { DailySummary } from './DailySummary'
import { useAppContext } from '../context/AppContext'
import { getGreeting, estimateCookedWeight } from '../lib/calculations'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'beverage'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'beverage']

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'var(--warning)',
  lunch:     'var(--positive)',
  dinner:    'var(--composed)',
  snack:     'var(--danger)',
  beverage:  'var(--accent)',
}

const MEAL_ICONS: Record<MealType, string> = {
  breakfast: 'wb_sunny',
  lunch:     'lunch_dining',
  dinner:    'nights_stay',
  snack:     'nutrition',
  beverage:  'local_drink',
}

const MEAL_TINT: Record<MealType, string> = {
  breakfast: 'var(--warning-tint)',
  lunch:     'var(--positive-tint)',
  dinner:    'var(--composed-tint)',
  snack:     'var(--danger-tint)',
  beverage:  'var(--accent-tint)',
}

const MEAL_BORDER_TOKEN: Record<MealType, string> = {
  breakfast: 'var(--warning-border)',
  lunch:     'var(--positive-border)',
  dinner:    'var(--composed-border)',
  snack:     'var(--danger-border)',
  beverage:  'var(--accent-border)',
}

// ── localStorage helpers ────────────────────────────────────────
function loadCollapsed(): Set<MealType> {
  try {
    const v = localStorage.getItem('collapsed-groups')
    return v ? new Set(JSON.parse(v)) : new Set()
  } catch { return new Set() }
}
function saveCollapsed(s: Set<MealType>) {
  localStorage.setItem('collapsed-groups', JSON.stringify([...s]))
}


// ── GreetingPanel ─────────────────────────────────────────────────
function GreetingPanel({ greeting, lang, onDismiss }: {
  greeting: { line1: string; line2: string; isJoke: boolean }
  lang: Lang
  onDismiss: () => void
}) {
  const [step, setStep] = useState<'idle' | 'confirming'>('idle')

  if (step === 'confirming') {
    return (
      <div style={{
        marginBottom: 12, padding: '12px 14px',
        background: 'var(--bg-card)', border: '1px solid var(--warning-border)',
        borderRadius: 12,
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
          {t(lang, 'greetingDismissTitle')}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px', lineHeight: 1.5 }}>
          {t(lang, 'greetingDismissBody')}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setStep('idle')}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t(lang, 'greetingDismissCancel')}
          </button>
          <button
            onClick={onDismiss}
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-color)', background: 'var(--amber)', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t(lang, 'greetingDismissConfirm')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      marginBottom: 12, padding: '12px 14px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 20, lineHeight: 1.3, flexShrink: 0 }}>👋</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>
          {greeting.line1}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.45, ...(greeting.isJoke ? { direction: 'ltr', textAlign: 'left' } : {}) }}>
          {greeting.line2}
        </p>
      </div>
      <button
        onClick={() => setStep('confirming')}
        aria-label="dismiss greeting"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', flexShrink: 0, marginTop: -2 }}
      >
        <span className="icon" style={{ fontSize: 16 }}>close</span>
      </button>
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────────
interface TodayTabProps {
  lang: Lang
  meals: Meal[]
  loading?: boolean
  history: FoodHistory[]
  goalCalories: number
  goalProtein: number
  getSuggestions: (q: string) => FoodHistory[]
  searchLibrary?: (q: string) => FoodLibraryItem[]
  library?: FoodLibraryItem[]
  defaultServingGrams?: number
  defaultWeightUnit?: 'g' | 'oz'
  defaultVolumeUnit?: 'ml' | 'cup' | 'tbsp' | 'tsp' | 'fl_oz'
  onAddMeal: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => void
  onAddMealWithId: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => Promise<string | null>
  onEditMeal: (id: string, updates: Partial<Meal>) => void
  onDeleteMeal: (id: string) => void
  onDuplicateMeal: (meal: Meal) => void
  onUpsertHistory: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>) => void
  onTouchHistory?: (id: string) => void
  composedEntries: ComposedEntry[]
  composedGroups: ComposedGroup[]
  onUpsertGroup: (group: ComposedGroup) => void
  onRemoveGroup: (id: string) => void
  showToast: (message: string, type: 'success' | 'error' | 'info', options?: { action?: { label: string; onClick: () => void }; durationMs?: number }) => void
  fluidGoalMl?: number
  fluidThresholdMl?: number
  fluidZeroCalOnly?: boolean
  goalStreak?: number
  displayName?: string | null
  showGreeting?: boolean
  onDismissGreeting?: () => void
}

export function TodayTab({
  lang, meals, loading = false, history, goalCalories, goalProtein,
  getSuggestions, searchLibrary, library = [], defaultServingGrams = 150, defaultWeightUnit = 'g', defaultVolumeUnit = 'ml',
  onAddMeal, onAddMealWithId, onEditMeal, onDeleteMeal, onDuplicateMeal, onUpsertHistory, onTouchHistory,
  composedEntries, composedGroups, onUpsertGroup, onRemoveGroup, showToast,
  fluidGoalMl = 2500, fluidThresholdMl = 100, fluidZeroCalOnly = true, goalStreak = 0,
  displayName = null, showGreeting = true, onDismissGreeting,
}: TodayTabProps) {
  const todayMeals    = useMemo(() => meals.filter(m => m.date === today()), [meals])
  const fluidTodayMl  = useMemo(() => todayMeals.reduce((s, m) => s + (m.fluid_ml ?? 0), 0), [todayMeals])


  const { styleMode } = useAppContext()

  // ── Pending deletes (undo support) — declared before mealsByType ────────────
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set())
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const mealsByType = useMemo(() => {
    const grouped: Record<MealType, Meal[]> = { breakfast: [], lunch: [], dinner: [], snack: [], beverage: [] }
    todayMeals
      .filter(m => !pendingDeleteIds.has(m.id))
      .forEach(m => { if (grouped[m.meal_type as MealType]) grouped[m.meal_type as MealType].push(m) })
    return grouped
  }, [todayMeals, pendingDeleteIds])

  const visibleTypes = useMemo(
    () => MEAL_TYPES.filter(t => mealsByType[t].length > 0),
    [mealsByType]
  )

  // ── Collapsible groups ───────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<MealType>>(loadCollapsed)
  const [openComposedIds, setOpenComposedIds] = useState<Set<string>>(new Set())

  const toggleComposedOpen = (id: string) => setOpenComposedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const toggleCollapse = (type: MealType) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type); else next.add(type)
      saveCollapsed(next)
      return next
    })
    // Clear selection when closing
    setSelectedIds(prev => { const n = { ...prev }; delete n[type]; return n })
    // Close type picker if open
    setEditingGroupType(prev => prev === type ? null : prev)
  }

  // ── Group type editor ────────────────────────────────────────
  const [editingGroupType, setEditingGroupType] = useState<MealType | null>(null)

  const handleChangeGroupType = (fromType: MealType, toType: MealType) => {
    if (fromType === toType) { setEditingGroupType(null); return }
    // Move all meals in this group to the new type
    mealsByType[fromType].forEach(m => onEditMeal(m.id, { meal_type: toType }))
    setEditingGroupType(null)
  }

  // ── Selection state (per meal-type group) ────────────────────
  const [selectedIds, setSelectedIds] = useState<Partial<Record<MealType, Set<string>>>>({})

  const toggleSelect = (type: MealType, id: string) => {
    setSelectedIds(prev => {
      const cur = new Set(prev[type] ?? [])
      if (cur.has(id)) cur.delete(id); else cur.add(id)
      return { ...prev, [type]: cur }
    })
  }

  const clearSelection = (type: MealType) => {
    setSelectedIds(prev => { const n = { ...prev }; delete n[type]; return n })
  }

  const scheduleDeletes = useCallback((mealIds: string[], groupIds: string[]) => {
    const allIds = [...mealIds, ...groupIds]
    setPendingDeleteIds(prev => new Set([...prev, ...allIds]))

    // Schedule actual deletion after 4s
    const timerId = setTimeout(() => {
      mealIds.forEach(id => onDeleteMeal(id))
      groupIds.forEach(id => onRemoveGroup(id))
      setPendingDeleteIds(prev => {
        const next = new Set(prev)
        allIds.forEach(id => next.delete(id))
        return next
      })
      allIds.forEach(id => pendingTimersRef.current.delete(id))
    }, 4000)

    allIds.forEach(id => pendingTimersRef.current.set(id, timerId))

    return () => {
      clearTimeout(timerId)
      setPendingDeleteIds(prev => {
        const next = new Set(prev)
        allIds.forEach(id => next.delete(id))
        return next
      })
      allIds.forEach(id => pendingTimersRef.current.delete(id))
    }
  }, [onDeleteMeal, onRemoveGroup])

  // Clean up timers on unmount
  useEffect(() => {
    const timers = pendingTimersRef.current
    return () => { timers.forEach(t => clearTimeout(t)) }
  }, [])

  const dissolveGroup = useCallback((groupId: string) => {
    const cancelFn = scheduleDeletes([], [groupId])
    showToast(
      t(lang, 'groupDeleted'),
      'info',
      { action: { label: t(lang, 'undo'), onClick: cancelFn }, durationMs: 4000 },
    )
  }, [scheduleDeletes, showToast, lang])

  // ── Add ingredient modal ─────────────────────────────────────
  const [addIngredientModal, setAddIngredientModal] = useState<{ groupId: string; mealType: MealType } | null>(null)

  const handleAddIngredientSubmit = async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
    if (!addIngredientModal) return
    const { groupId, mealType } = addIngredientModal
    setAddIngredientModal(null)
    const id = await onAddMealWithId({ ...meal, meal_type: mealType })
    if (!id) return
    const group = composedGroups.find(g => g.id === groupId)
    if (group) onUpsertGroup({ ...group, mealIds: [...group.mealIds, id] })
  }

  // ── Clone composed group into today ─────────────────────────
  const handleAddComposed = useCallback(async (composedId: string, mealType: MealType) => {
    const group = composedGroups.find(g => g.id === composedId)
    if (!group) return
    const newMealIds: string[] = []
    for (const mealId of group.mealIds) {
      const src = meals.find(m => m.id === mealId)
      if (!src) continue
      const newId = await onAddMealWithId({
        date:           today(),
        meal_type:      mealType,
        name:           src.name,
        grams:          src.grams,
        calories:       src.calories,
        protein:        src.protein,
        fat:            src.fat,
        carbs:          src.carbs,
        notes:          src.notes,
        time_logged:    currentTime(),
        fluid_ml:       src.fluid_ml,
        fluid_excluded: src.fluid_excluded,
        display_unit:   src.display_unit,
        display_amount: src.display_amount,
      })
      if (newId) newMealIds.push(newId)
    }
    if (newMealIds.length > 0) {
      onUpsertGroup({ id: crypto.randomUUID(), name: group.name, mealIds: newMealIds })
    }
  }, [composedGroups, meals, onAddMealWithId, onUpsertGroup])

  const renameGroup = (groupId: string, name: string) => {
    const group = composedGroups.find(g => g.id === groupId)
    if (group) onUpsertGroup({ ...group, name })
  }

  // ── Compose modal ────────────────────────────────────────────
  const [composeModal, setComposeModal] = useState<{ mealType: MealType } | null>(null)
  const [composeName, setComposeName] = useState('')
  const [composeWeight, setComposeWeight] = useState('')
  const [composePortion, setComposePortion] = useState('')
  const [composeBreakdown, setComposeBreakdown] = useState<import('../lib/calculations').CookingBreakdownItem[]>([])

  const openComposeModal = (mealType: MealType) => {
    setComposeName('')
    setComposePortion('')
    setComposeModal({ mealType })
  }

  // When compose modal opens, compute cooking weight breakdown from selected meals
  useEffect(() => {
    if (!composeModal) return
    const { mealType } = composeModal
    const sel = selectedIds[mealType] ?? new Set<string>()
    const selMeals  = mealsByType[mealType].filter(m => sel.has(m.id))
    const selGroups = composedGroups.filter(g => sel.has(g.id))
    const groupMeals = todayMeals.filter(m => selGroups.some(g => g.mealIds.includes(m.id)))
    const { total, breakdown } = estimateCookedWeight([...selMeals, ...groupMeals])
    setComposeBreakdown(breakdown)
    setComposeWeight(String(total))
  }, [composeModal]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompose = async () => {
    if (!composeModal) return
    const { mealType } = composeModal
    const sel = selectedIds[mealType]
    if (!sel || sel.size === 0) return

    const selMeals   = mealsByType[mealType].filter(m => sel.has(m.id))
    const selGroups  = composedGroups.filter(g => sel.has(g.id))
    const groupMeals = todayMeals.filter(m => selGroups.some(g => g.mealIds.includes(m.id)))
    const allSel     = [...selMeals, ...groupMeals]

    const name         = composeName.trim() || t(lang, 'newDish')
    const batchWeightG = parseFloat(composeWeight)
    const totalCalories = Math.round(allSel.reduce((s, m) => s + m.calories, 0))
    const totalProtein  = Math.round(allSel.reduce((s, m) => s + m.protein, 0) * 10) / 10

    const portionG = parseFloat(composePortion)
    const loggingPortion = portionG > 0 && batchWeightG > 0 && totalCalories > 0

    const newGroup: ComposedGroup = {
      id: crypto.randomUUID(),
      name,
      // When logging a portion, original meals will be deleted — store empty mealIds so
      // they don't get double-counted if the group is later dissolved.
      mealIds: loggingPortion ? [] : [...sel],
      batchWeightG:  batchWeightG > 0 ? batchWeightG : null,
      totalCalories,
      totalProtein,
    }
    onUpsertGroup(newGroup)

    if (loggingPortion) {
      // Delete the original ingredient meals so only the portion appears in the daily total.
      selMeals.forEach(m => onDeleteMeal(m.id))
      groupMeals.forEach(m => onDeleteMeal(m.id))
      selGroups.forEach(g => onRemoveGroup(g.id))

      const ratio = portionG / batchWeightG
      await onAddMealWithId({
        date:           today(),
        meal_type:      mealType,
        name,
        grams:          Math.round(portionG),
        calories:       Math.round(totalCalories * ratio),
        protein:        Math.round(totalProtein  * ratio * 10) / 10,
        fat:            null,
        carbs:          null,
        notes:          null,
        time_logged:    currentTime(),
        fluid_ml:       null,
        fluid_excluded: false,
        display_unit:   null,
        display_amount: null,
      })
    }

    clearSelection(mealType)
    setComposeModal(null)
  }

  const handleAddRecipePortion = useCallback(async (composedId: string, mealType: MealType, portionG: number) => {
    const group = composedGroups.find(g => g.id === composedId)
    if (!group?.batchWeightG || !group.totalCalories || !group.totalProtein) return
    const ratio = portionG / group.batchWeightG
    await onAddMealWithId({
      date:           today(),
      meal_type:      mealType,
      name:           group.name,
      grams:          Math.round(portionG),
      calories:       Math.round(group.totalCalories * ratio),
      protein:        Math.round(group.totalProtein  * ratio * 10) / 10,
      fat:            null,
      carbs:          null,
      notes:          null,
      time_logged:    currentTime(),
      fluid_ml:       null,
      fluid_excluded: false,
      display_unit:   null,
      display_amount: null,
    })
  }, [composedGroups, onAddMealWithId])

  // ── Action bar helpers ───────────────────────────────────────
  const handleDuplicateSelected = (type: MealType) => {
    const sel = selectedIds[type]
    if (!sel) return
    let count = 0
    mealsByType[type]
      .filter(m => sel.has(m.id))
      .forEach(m => { onDuplicateMeal(m); count++ })
    // Also duplicate any composed groups fully selected
    composedGroups
      .filter(g => sel.has(g.id))
      .forEach(g => {
        const groupMeals = todayMeals.filter(m => g.mealIds.includes(m.id))
        groupMeals.forEach(m => onDuplicateMeal(m))
        count++
      })
    clearSelection(type)
    if (count > 0) showToast(`${t(lang, 'duplicatedPrefix')}${count} ${count === 1 ? t(lang, 'item') : t(lang, 'items')}`, 'success')
  }

  const handleDeleteSelected = (type: MealType) => {
    const sel = selectedIds[type]
    if (!sel) return

    // Collect standalone meal IDs and group IDs (groups track their child meal IDs internally)
    const standaloneMealIds = mealsByType[type]
      .filter(m => sel.has(m.id) && !composedGroups.some(g => g.mealIds.includes(m.id)))
      .map(m => m.id)

    const selectedGroups = composedGroups.filter(g => sel.has(g.id))
    const groupMealIds   = selectedGroups.flatMap(g => g.mealIds)
    const groupIds       = selectedGroups.map(g => g.id)

    const allMealIds = [...standaloneMealIds, ...groupMealIds]
    const count = standaloneMealIds.length + selectedGroups.length
    if (count === 0) return

    clearSelection(type)

    // Schedule deletion with undo support
    const cancelFn = scheduleDeletes(allMealIds, groupIds)

    showToast(
      `${t(lang, 'deletedPrefix')}${count} ${count === 1 ? t(lang, 'item') : t(lang, 'items')}`,
      'info',
      {
        action: {
          label: t(lang, 'undo'),
          onClick: cancelFn,
        },
        durationMs: 4000,
      },
    )
  }

  const handleDeleteTypeGroup = (type: MealType) => {
    const typeMealsAll = mealsByType[type]
    if (typeMealsAll.length === 0) return
    const groupsOfType = composedGroups.filter(g => g.mealIds.some(id => typeMealsAll.find(m => m.id === id)))
    const allMealIds = typeMealsAll.map(m => m.id)
    const groupIds   = groupsOfType.map(g => g.id)
    setEditingGroupType(null)
    const cancelFn = scheduleDeletes(allMealIds, groupIds)
    showToast(
      `${t(lang, 'typeGroupPrefix')}${t(lang, type as MealTypeKey)}${t(lang, 'typeGroupSuffix')}`,
      'info',
      { action: { label: t(lang, 'undo'), onClick: cancelFn }, durationMs: 4000 },
    )
  }

  // ── Entry sheet ──────────────────────────────────────────────
  const [entryOpen, setEntryOpen] = useState(false)
  const [entryDefaultType, setEntryDefaultType] = useState<MealType | undefined>(undefined)
  const openEntry = (type?: MealType) => { setEntryDefaultType(type); setEntryOpen(true) }
  const entrySheetRef         = useRef<HTMLDivElement>(null)
  const composeModalRef       = useRef<HTMLDivElement>(null)
  const addIngredientModalRef = useRef<HTMLDivElement>(null)
  const anyModalOpen = entryOpen || !!composeModal || !!addIngredientModal
  useLockBodyScroll(anyModalOpen)
  useFocusTrap(entrySheetRef,         entryOpen)
  useFocusTrap(composeModalRef,       !!composeModal)
  useFocusTrap(addIngredientModalRef, !!addIngredientModal)

  // Escape key closes the topmost open modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (addIngredientModal) { setAddIngredientModal(null); return }
      if (composeModal) { setComposeModal(null); return }
      if (entryOpen) { setEntryOpen(false); return }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [addIngredientModal, composeModal, entryOpen])
  const { scrollRef: entryScrollRef, scrolledDown: entryScrolledDown, onScroll: entryOnScroll } = useSheetScroll()
  const [entryDragOffset, setEntryDragOffset] = useState(0)
  const entryIsDragging = entryDragOffset > 0

  // ── Render: summary card ─────────────────────────────────────
  const summaryCard = (
    <div style={{ marginBottom: 20 }}>
      <DailySummary
        meals={todayMeals} date={today()}
        goalCalories={goalCalories} goalProtein={goalProtein}
        lang={lang}
        fluidGoalMl={fluidGoalMl}
        fluidTodayMl={fluidTodayMl}
        streak={goalStreak}
      />
    </div>
  )

  // ── Render: meal group ───────────────────────────────────────
  const mealGroup = (type: MealType, i: number, total: number) => {
    const typeMeals   = mealsByType[type]
    const isCollapsed = collapsed.has(type)
    const selSet      = selectedIds[type] ?? new Set<string>()

    const totalCal  = Math.round(typeMeals.reduce((s, m) => s + m.calories, 0))
    const totalProt = Math.round(typeMeals.reduce((s, m) => s + m.protein, 0) * 10) / 10

    // Split items: composed groups vs standalone (exclude pending deletes)
    const groupsHere = composedGroups.filter(g =>
      !pendingDeleteIds.has(g.id) &&
      g.mealIds.some(id => typeMeals.find(m => m.id === id))
    )
    const composedMealIdSet = new Set(groupsHere.flatMap(g => g.mealIds))
    const standalones = typeMeals.filter(m => !composedMealIdSet.has(m.id))

    // Selection totals (for action bar)
    const selMeals = typeMeals.filter(m => selSet.has(m.id))
    const selGroups = groupsHere.filter(g => selSet.has(g.id))
    const selGroupMeals = todayMeals.filter(m => selGroups.some(g => g.mealIds.includes(m.id)))
    const allSelMeals = [...selMeals, ...selGroupMeals]
    const selCal  = Math.round(allSelMeals.reduce((s, m) => s + m.calories, 0))
    const selProt = Math.round(allSelMeals.reduce((s, m) => s + m.protein, 0) * 10) / 10
    const selCount = selSet.size

    return (
      <div key={type} className={styleMode === 'minimal' ? 'fade-up' : 'card fade-up'} style={{ animationDelay: `${i * 0.05}s`, marginBottom: styleMode === 'minimal' ? 0 : 12, overflow: 'hidden', ...(styleMode === 'minimal' ? { borderTop: '1px solid var(--border)', ...(i === total - 1 ? { borderBottom: '1px solid var(--border)' } : {}) } : {}) }}>

        {/* ── Group header ────────────────────────────────── */}
        {styleMode === 'minimal' ? (
          /* Minimal: label + totals summary + chevron, fully collapsible */
          <div
            role="button"
            tabIndex={0}
            aria-expanded={!isCollapsed}
            onClick={() => toggleCollapse(type)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse(type) }}
            style={{ padding: '10px 4px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', borderBottom: `1px solid ${isCollapsed ? 'transparent' : 'var(--border)'}`, boxSizing: 'border-box' }}
          >
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {t(lang, type)}
            </span>
            {typeMeals.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0, fontSize: 11, opacity: isCollapsed ? 1 : 0 }}>
                <span style={{ fontWeight: 500, color: 'var(--accent-hi)' }}>{totalCal}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                <span style={{ color: 'var(--border)', fontWeight: 300, padding: '0 2px' }}>|</span>
                <span style={{ fontWeight: 500, color: 'var(--positive-hi)' }}>{totalProt}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{t(lang, 'gProteinLabel')}</span>
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button
              onClick={e => { e.stopPropagation(); setEditingGroupType(editingGroupType === type ? null : type) }}
              className="icon-btn"
              style={{ color: editingGroupType === type ? 'var(--warning)' : undefined, background: editingGroupType === type ? 'var(--warning-tint)' : undefined, border: editingGroupType === type ? '1px solid var(--warning-border)' : undefined }}
              aria-label={t(lang, 'changeGroup')}
            >
              <span className="icon icon-sm">edit</span>
            </button>
            <span className="icon icon-chevron" style={{ color: 'var(--text-3)', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
              expand_more
            </span>
          </div>
        ) : (
          /* Classic/hybrid: full collapsible header with icon + buttons */
          <div
            role="button"
            tabIndex={0}
            aria-expanded={!isCollapsed}
            aria-label={`${t(lang, type)} — ${isCollapsed ? t(lang, 'expandGroup') : t(lang, 'collapseGroup')}`}
            onClick={() => toggleCollapse(type)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleCollapse(type) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '12px 14px', cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span className="icon icon-sm" style={{ color: MEAL_COLORS[type] }}>
              {MEAL_ICONS[type]}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t(lang, type)}
            </span>

            {isCollapsed && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginInlineStart: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)' }}>
                  <span>{totalCal}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)' }}>
                  <span>{totalProt}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{t(lang, 'proteinUnit')}</span>
                </span>
              </span>
            )}

            <span style={{ flex: 1 }} />

            <button
              onClick={e => {
                e.stopPropagation()
                setEditingGroupType(editingGroupType === type ? null : type)
              }}
              style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: editingGroupType === type ? 'var(--warning-tint)' : 'transparent',
                border: editingGroupType === type ? '1px solid var(--warning-border)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label={t(lang, 'changeGroup')}
            >
              <span className="icon icon-sm" style={{ color: editingGroupType === type ? 'var(--warning)' : 'var(--text-3)' }}>
                edit
              </span>
            </button>

            <span className="chevron-badge" style={{ background: 'transparent', border: 'none' }}>
              <span className="icon icon-chevron" style={{ color: 'var(--text-3)', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
                expand_more
              </span>
            </span>
          </div>
        )}

        {/* ── Type picker (inline, under header) ─────────── */}
        {editingGroupType === type && (
          <div className="type-picker" role="radiogroup" aria-label={t(lang, 'selectMealType')}>
            {MEAL_TYPES.map(mt => (
              <div
                key={mt}
                role="radio"
                aria-checked={mt === type}
                tabIndex={0}
                className={`type-picker-row${mt === type ? ' current' : ''}`}
                onClick={() => handleChangeGroupType(type, mt)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleChangeGroupType(type, mt) } }}
              >
                <div
                  className="type-picker-ico"
                  style={{ background: MEAL_TINT[mt], border: `1px solid ${MEAL_BORDER_TOKEN[mt]}` }}
                >
                  <span className="icon icon-sm" style={{ color: MEAL_COLORS[mt] }}>{MEAL_ICONS[mt]}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: mt === type ? MEAL_COLORS[mt] : 'var(--text-2)', flex: 1 }}>
                  {t(lang, mt)}
                </span>
                <div className={`type-picker-radio${mt === type ? ' on' : ''}`}>
                  {mt === type && <span className="icon" style={{ fontSize: 11, color: 'var(--warning)' }}>check</span>}
                </div>
              </div>
            ))}
            {/* ── Delete type group ── */}
            <div
              role="button"
              tabIndex={0}
              className="type-picker-row"
              onClick={() => handleDeleteTypeGroup(type)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeleteTypeGroup(type) } }}
            >
              <div className="type-picker-ico" style={{ background: 'var(--danger-tint)', border: '1px solid var(--danger-border-lo)' }}>
                <span className="icon icon-sm" style={{ color: 'var(--danger-hi)' }}>delete</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger-hi)', flex: 1 }}>
                {t(lang, 'deleteAll')} {t(lang, type as MealTypeKey)}
              </span>
            </div>
          </div>
        )}

        {/* ── Meal cards ──────────────────────────────────── */}
        {!isCollapsed && (
          <div
            className={styleMode === 'minimal' ? 'expand-down' : undefined}
            style={styleMode === 'minimal'
              ? { padding: '0 0 10px' }
              : { borderTop: '1px solid var(--border)', padding: '14px 10px 10px' }
            }
          >

            {/* Composed groups */}
            {groupsHere.map(group => {
              const groupMeals = typeMeals.filter(m => group.mealIds.includes(m.id))
              return (
                <ComposedMealCard
                  key={group.id}
                  group={group}
                  meals={groupMeals}
                  lang={lang}
                  selected={selSet.has(group.id)}
                  onToggleSelect={() => toggleSelect(type, group.id)}
                  onEditMeal={onEditMeal}
                  onDeleteMeal={onDeleteMeal}
                  onRename={name => renameGroup(group.id, name)}
                  onDeleteGroup={() => dissolveGroup(group.id)}
                  onAddIngredient={() => setAddIngredientModal({ groupId: group.id, mealType: type })}
                  onChangeMealType={newType => groupMeals.forEach(m => onEditMeal(m.id, { meal_type: newType }))}
                  open={openComposedIds.has(group.id)}
                  onToggleOpen={() => toggleComposedOpen(group.id)}
                />
              )
            })}

            {/* Standalone meals */}
            {standalones.map((meal) => {
              const libServingG: number = (() => {
                const item = library.find(i => i.name_he === meal.name || i.name_en.toLowerCase() === meal.name.toLowerCase())
                return (item?.countable && item.serving_size != null) ? Number(item.serving_size) : defaultServingGrams
              })()
              return (
                <div key={meal.id} style={styleMode === 'minimal' ? { borderBottom: '1px dashed var(--border)' } : {}}>
                  <MealCard
                    meal={meal}
                    lang={lang}
                    weightUnit={defaultWeightUnit}
                    showCheckbox
                    selected={selSet.has(meal.id)}
                    onToggleSelect={() => toggleSelect(type, meal.id)}
                    onEdit={onEditMeal}
                    enableWeightScaling
                    servingG={libServingG}
                    listStyle={styleMode === 'minimal'}
                  />
                </div>
              )
            })}

            {/* Quick-add to this section */}
            {selCount === 0 && (styleMode === 'minimal' ? (
              <button
                onClick={() => openEntry(type)}
                style={{
                  marginTop: 10, background: 'var(--inp-bg)', border: '1px solid var(--border)',
                  borderRadius: 20, padding: '6px 14px', fontFamily: 'inherit',
                  fontSize: 11, fontWeight: 500, color: 'var(--text-2)',
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <span className="icon" style={{ fontSize: 13 }}>add</span>
                {t(lang, 'addToPrefix')}{t(lang, type as MealTypeKey)}
              </button>
            ) : (
              <button
                onClick={() => openEntry(type)}
                style={{
                  marginTop: 4, width: '100%', background: 'transparent',
                  border: '1px dashed var(--border)', borderRadius: 8,
                  padding: '6px 10px', fontFamily: 'inherit',
                  fontSize: 11, fontWeight: 600, color: MEAL_COLORS[type],
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span className="icon" style={{ fontSize: 14 }}>add</span>
                {t(lang, 'addToPrefix')}{t(lang, type as MealTypeKey)}
              </button>
            ))}

            {/* ── Action bar (shown when anything selected) ── */}
            {selCount > 0 && (
              <div className="group-action-bar">
                {/* Header row */}
                <div className="group-action-bar-header">
                  <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 16 }}>check_circle</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--composed)', flex: 1 }}>
                    {selCount} {t(lang, 'nSelected')}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
                    {selCal} {t(lang, 'caloriesUnit')} · {selProt} {t(lang, 'proteinUnit')}
                  </span>
                  <button
                    onClick={() => clearSelection(type)}
                    style={{ marginInlineStart: 10, background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', cursor: 'pointer', padding: '2px 4px' }}
                  >
                    {t(lang, 'cancel')}
                  </button>
                </div>

                {/* Action buttons */}
                <div className="group-action-bar-btns">
                  {/* Duplicate */}
                  <button className="group-action-btn" aria-label={t(lang, 'duplicate')} onClick={() => handleDuplicateSelected(type)}>
                    <div className="group-action-btn-ico" style={{ background: 'var(--positive-fill)', border: '1px solid var(--positive-select)' }}>
                      <span className="icon icon-sm" style={{ color: 'var(--positive-hi)' }}>content_copy</span>
                    </div>
                    <span style={{ color: 'var(--positive-hi)' }}>{t(lang, 'duplicate')}</span>
                  </button>

                  {/* Create dish */}
                  <button className="group-action-btn" aria-label={t(lang, 'createDish')} onClick={() => openComposeModal(type)}>
                    <div className="group-action-btn-ico" style={{ background: 'var(--composed-tint)', border: '1px solid var(--composed-glow)' }}>
                      <span className="icon icon-sm" style={{ color: 'var(--composed)' }}>restaurant</span>
                    </div>
                    <span style={{ color: 'var(--composed)' }}>{t(lang, 'createDish')}</span>
                  </button>

                  {/* Delete */}
                  <button className="group-action-btn" aria-label={t(lang, 'delete')} onClick={() => handleDeleteSelected(type)}>
                    <div className="group-action-btn-ico" style={{ background: 'var(--danger-tint)', border: '1px solid var(--danger-border-lo)' }}>
                      <span className="icon icon-sm" style={{ color: 'var(--danger-hi)' }}>delete</span>
                    </div>
                    <span style={{ color: 'var(--danger-hi)' }}>{t(lang, 'delete')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Meal groups list ─────────────────────────────────────────
  const items = visibleTypes.map((type, i) => mealGroup(type, i, visibleTypes.length))

  // ── Compose modal ────────────────────────────────────────────
  const composeModalEl = composeModal && (() => {
    const { mealType } = composeModal
    const sel = selectedIds[mealType] ?? new Set<string>()
    const selMealsList = mealsByType[mealType].filter(m => sel.has(m.id))
    const selGroupsList = composedGroups.filter(g => sel.has(g.id))
    const selGroupMeals = todayMeals.filter(m => selGroupsList.some(g => g.mealIds.includes(m.id)))
    const allSel = [...selMealsList, ...selGroupMeals]
    const totalCal  = Math.round(allSel.reduce((s, m) => s + m.calories, 0))
    const totalProt = Math.round(allSel.reduce((s, m) => s + m.protein, 0) * 10) / 10

    const items = [
      ...selMealsList.map(m => ({ name: m.name, cal: Math.round(m.calories), prot: Math.round(m.protein * 10) / 10 })),
      ...selGroupsList.map(g => {
        const gm = todayMeals.filter(m => g.mealIds.includes(m.id))
        return { name: g.name, cal: Math.round(gm.reduce((s, m) => s + m.calories, 0)), prot: Math.round(gm.reduce((s, m) => s + m.protein, 0) * 10) / 10 }
      }),
    ]

    return (
      <div className="compose-modal-backdrop" onClick={() => setComposeModal(null)}>
        <div ref={composeModalRef} className="compose-modal" role="dialog" aria-modal="true" aria-label={t(lang, 'composeMealLabel')} onClick={e => e.stopPropagation()}>
          {/* Title */}
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', margin: 0 }}>{t(lang, 'dishName')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: '4px 0 0' }}>
              {t(lang, 'fromNPrefix')}{sel.size} {t(lang, 'items')}
            </p>
          </div>

          {/* Totals summary */}
          <div className="compose-modal-summary">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', flex: 1 }}>
              {t(lang, 'total')}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-hi)', display: 'flex', alignItems: 'baseline', gap: 2 }}>
              {totalCal} <span style={{ fontSize: 10, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--positive-hi)', display: 'flex', alignItems: 'baseline', gap: 2, marginInlineStart: 12 }}>
              {totalProt} <span style={{ fontSize: 10, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
            </span>
          </div>

          {/* Item list */}
          <div className="compose-modal-items">
            {items.map((item, idx) => (
              <div key={idx} className="compose-modal-item">
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--composed-border-hi)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                  {item.cal} {t(lang, 'caloriesUnit')} · {item.prot} {t(lang, 'proteinUnit')}
                </span>
              </div>
            ))}
          </div>

          {/* Cooking weight breakdown */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px', fontSize: 11 }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--text-2)' }}>
              {t(lang, 'recipeBatchWeight')}
            </p>
            {composeBreakdown.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                <span style={{ flex: 1, color: b.skipped ? 'var(--text-3)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.name}
                </span>
                {b.skipped ? (
                  <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{t(lang, 'recipeSkipped')}</span>
                ) : (
                  <>
                    <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{b.rawG}g</span>
                    <span style={{ color: 'var(--text-3)' }}>×{b.factor}</span>
                    <span style={{ fontWeight: 700, color: b.matched ? 'var(--text)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'end' }}>
                      {b.cookedG}g{!b.matched && <span style={{ fontSize: 9, marginInlineStart: 2, opacity: 0.7 }}>*</span>}
                    </span>
                  </>
                )}
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            {/* Editable total */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontWeight: 700, color: 'var(--text-2)' }}>{t(lang, 'total')}</span>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  inputMode="decimal"
                  className="inp"
                  style={{ height: 32, fontSize: 13, width: 80, textAlign: 'end', paddingInlineEnd: 20 }}
                  value={composeWeight}
                  onChange={e => setComposeWeight(e.target.value)}
                />
                <span style={{ position: 'absolute', insetInlineEnd: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-3)', pointerEvents: 'none' }}>g</span>
              </div>
            </div>
            {composeBreakdown.some(b => !b.matched && !b.skipped) && (
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-3)' }}>
                * {t(lang, 'recipeDefaultFactor')}
              </p>
            )}
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-3)' }}>
              {t(lang, 'recipeWeightHint')}
            </p>
          </div>

          {/* Optional: log a portion today */}
          {parseFloat(composeWeight) > 0 && (
            <div style={{ background: 'var(--accent-fill)', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)' }}>
                {t(lang, 'logPortionOptional')}
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="inp"
                    style={{ fontSize: 14, height: 36, paddingInlineEnd: 24 }}
                    placeholder={t(lang, 'portionGramsPlaceholder')}
                    value={composePortion}
                    onChange={e => setComposePortion(e.target.value)}
                  />
                  <span style={{ position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-3)', pointerEvents: 'none' }}>g</span>
                </div>
                {parseFloat(composePortion) > 0 && (() => {
                  const ratio = parseFloat(composePortion) / parseFloat(composeWeight)
                  const pCal  = Math.round(totalCal  * ratio)
                  const pProt = Math.round(totalProt  * ratio * 10) / 10
                  return (
                    <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {pCal} {t(lang, 'caloriesUnit')} · {pProt} {t(lang, 'proteinUnit')}
                    </span>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Name input */}
          <div style={{ position: 'relative' }}>
            <input
              className="inp"
              style={{ borderColor: 'var(--composed-border-hi)', paddingInlineEnd: composeName ? 32 : 12 }}
              placeholder={t(lang, 'dishName') + '...'}
              value={composeName}
              onChange={e => setComposeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCompose() }}
              autoFocus
              dir={dir(lang)}
            />
            {composeName && (
              <button
                onMouseDown={e => { e.preventDefault(); setComposeName('') }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-confirm" style={{ flex: 1 }} onClick={handleCompose}>
              <span className="icon icon-sm">set_meal</span>
              {t(lang, 'mergeMeals')}
            </button>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setComposeModal(null)}>
              {t(lang, 'cancel')}
            </button>
          </div>
        </div>
      </div>
    )
  })()

  const now          = new Date()
  const hour         = now.getHours()
  const dayOfYear    = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000)
  const firstName    = displayName?.split(' ')[0] ?? null
  const calsConsumed = useMemo(() => todayMeals.reduce((s, m) => s + m.calories, 0), [todayMeals])
  const protConsumed = useMemo(() => todayMeals.reduce((s, m) => s + m.protein, 0), [todayMeals])

  const greeting = useMemo(() => getGreeting({
    hour, firstName, streak: goalStreak,
    calsConsumed, calsGoal: goalCalories,
    protConsumed, protGoal: goalProtein,
    fluidMl: fluidTodayMl, fluidGoalMl,
    dayOfYear, lang,
  }), [hour, firstName, goalStreak, calsConsumed, goalCalories, protConsumed, goalProtein, fluidTodayMl, fluidGoalMl, dayOfYear, lang])

  return (
    <div>
      {showGreeting && onDismissGreeting && (
        <GreetingPanel greeting={greeting} lang={lang} onDismiss={onDismissGreeting} />
      )}
      {summaryCard}

      {loading && todayMeals.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="card skeleton-card" style={{ height: 64, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      )}

      {!loading && todayMeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0 24px', color: 'var(--text-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span className="icon" style={{ fontSize: 36, display: 'block' }}>restaurant_menu</span>
          <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noMealsToday')}</p>
          <button
            className="btn-primary"
            onClick={() => openEntry()}
            style={{ marginTop: 4, fontSize: 13, height: 40, padding: '0 20px' }}
          >
            + {t(lang, 'addMeal')}
          </button>
        </div>
      )}

      {items}

      {composeModalEl}

      {/* ── Add ingredient modal ──────────────────────────────── */}
      {addIngredientModal && (
        <div className="compose-modal-backdrop" onClick={() => setAddIngredientModal(null)}>
          <div ref={addIngredientModalRef} className="compose-modal" role="dialog" aria-modal="true" aria-label={t(lang, 'addIngredient')} style={{ maxWidth: 420, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <FoodEntryForm
              key={addIngredientModal.groupId}
              lang={lang}
              history={history}
              getSuggestions={getSuggestions}
              searchLibrary={searchLibrary}
              library={library}
              defaultServingGrams={defaultServingGrams}
              defaultWeightUnit={defaultWeightUnit}
              defaultVolumeUnit={defaultVolumeUnit}
              defaultMealType={addIngredientModal.mealType}
              onAdd={handleAddIngredientSubmit}
              onUpsertHistory={onUpsertHistory}
              onTouchHistory={onTouchHistory}
              fluidThresholdMl={fluidThresholdMl}
              fluidZeroCalOnly={fluidZeroCalOnly}
            />
          </div>
        </div>
      )}

      {/* ── FAB — hidden on empty state ── */}
      {todayMeals.length > 0 && <button
        onClick={() => openEntry()}
        aria-label={t(lang, 'addMeal')}
        className="fab-btn"
        style={{
          position: 'fixed',
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          insetInlineEnd: 'max(calc((100vw - 560px) / 2 + 24px), 24px)',
          zIndex: 40, // --z-fab
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent)',
          color: 'var(--on-color)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        <span className="icon" style={{ fontSize: 28 }}>add</span>
      </button>}

      {/* ── Entry bottom sheet ────────────────────────────────────── */}
      <div
        onClick={() => setEntryOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 99, // --z-backdrop
          background: 'var(--modal-backdrop)',
          backdropFilter: entryOpen ? 'blur(2px)' : 'none',
          opacity: entryOpen ? 1 : 0,
          pointerEvents: entryOpen ? 'all' : 'none',
          transition: 'opacity 0.3s, backdrop-filter 0.3s',
        }}
      />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100, // --z-sheet
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        <div ref={entrySheetRef} style={{
          width: '100%', maxWidth: 560,
          pointerEvents: 'all',
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          borderRadius: '20px 20px 0 0',
          height: 'min(90dvh, 720px)',
          overflow: 'hidden',
          transform: entryOpen ? `translateY(${entryDragOffset}px)` : 'translateY(105%)',
          transition: entryIsDragging ? 'none' : 'transform 0.35s cubic-bezier(.22,.9,.36,1)',
          opacity: entryIsDragging ? Math.max(0.6, 1 - entryDragOffset / 400) : 1,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <SheetHandle scrolledDown={entryScrolledDown} onClose={() => setEntryOpen(false)} onDragOffset={setEntryDragOffset} />

          {/* Scroll container — overflow here, NOT on the outer sheet */}
          <div
            ref={entryScrollRef}
            onScroll={entryOnScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 16px',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
          >
            <FoodEntryForm
              lang={lang}
              history={history}
              getSuggestions={getSuggestions}
              searchLibrary={searchLibrary}
              library={library}
              defaultServingGrams={defaultServingGrams}
              defaultWeightUnit={defaultWeightUnit}
              defaultVolumeUnit={defaultVolumeUnit}
              defaultMealType={entryDefaultType}
              onAdd={meal => { onAddMeal(meal); setEntryOpen(false) }}
              onUpsertHistory={onUpsertHistory}
              onTouchHistory={onTouchHistory}
              composedEntries={composedEntries}
              onAddComposed={(id, mealType) => { handleAddComposed(id, mealType); setEntryOpen(false) }}
              onAddRecipePortion={(id, mealType, portionG) => { handleAddRecipePortion(id, mealType, portionG); setEntryOpen(false) }}
              fluidThresholdMl={fluidThresholdMl}
              fluidZeroCalOnly={fluidZeroCalOnly}
              isOpen={entryOpen}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
