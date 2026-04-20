import { useMemo, useState, useRef, useCallback } from 'react'
import type { Meal, FoodHistory, ComposedGroup } from '../types'
import type { Lang } from '../lib/i18n'
import { t, today } from '../lib/i18n'
import { FoodEntryForm } from './FoodEntryForm'
import type { ComposedEntry } from './FoodEntryForm'
import { MealCard } from './MealCard'
import { ComposedMealCard } from './ComposedMealCard'
import { DailySummary } from './DailySummary'
import { useComposedGroups } from '../hooks/useComposedGroups'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'var(--amber)',
  lunch:     'var(--green)',
  dinner:    'var(--purple)',
  snack:     'var(--red)',
}

const MEAL_ICONS: Record<MealType, string> = {
  breakfast: 'wb_sunny',
  lunch:     'lunch_dining',
  dinner:    'nights_stay',
  snack:     'nutrition',
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

function loadSummarySlot(): number {
  const v = localStorage.getItem('summary-slot')
  return v !== null ? Number(v) : 0
}
function saveSummarySlot(n: number) {
  localStorage.setItem('summary-slot', String(n))
}


// ── Props ────────────────────────────────────────────────────────
interface TodayTabProps {
  lang: Lang
  userId: string | null
  meals: Meal[]
  history: FoodHistory[]
  goalCalories: number
  goalProtein: number
  getSuggestions: (q: string) => FoodHistory[]
  onAddMeal: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => void
  onAddMealWithId: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => Promise<string | null>
  onEditMeal: (id: string, updates: Partial<Meal>) => void
  onDeleteMeal: (id: string) => void
  onDuplicateMeal: (meal: Meal) => void
  onUpsertHistory: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>) => void
}

export function TodayTab({
  lang, userId, meals, history, goalCalories, goalProtein,
  getSuggestions, onAddMeal, onAddMealWithId, onEditMeal, onDeleteMeal, onDuplicateMeal, onUpsertHistory,
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

  // ── Collapsible groups ───────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<MealType>>(loadCollapsed)

  const toggleCollapse = (type: MealType) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
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
      cur.has(id) ? cur.delete(id) : cur.add(id)
      return { ...prev, [type]: cur }
    })
  }

  const clearSelection = (type: MealType) => {
    setSelectedIds(prev => { const n = { ...prev }; delete n[type]; return n })
  }

  // ── Composed groups (Supabase-backed) ───────────────────────
  const { groups: composedGroups, upsert: upsertGroup, remove: removeGroup } = useComposedGroups(userId)

  const composedEntries = useMemo<ComposedEntry[]>(() =>
    composedGroups.map(g => {
      const gMeals = meals.filter(m => g.mealIds.includes(m.id))
      return {
        id: g.id,
        name: g.name,
        calories: Math.round(gMeals.reduce((s, m) => s + m.calories, 0)),
        protein: Math.round(gMeals.reduce((s, m) => s + m.protein, 0) * 10) / 10,
      }
    }).filter(e => e.name),
  [composedGroups, meals])

  const dissolveGroup = (groupId: string) => removeGroup(groupId)

  // ── Add ingredient modal ─────────────────────────────────────
  const [addIngredientModal, setAddIngredientModal] = useState<{ groupId: string; mealType: MealType } | null>(null)

  const handleAddIngredientSubmit = async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
    if (!addIngredientModal) return
    const id = await onAddMealWithId({ ...meal, meal_type: addIngredientModal.mealType })
    if (!id) return
    const group = composedGroups.find(g => g.id === addIngredientModal.groupId)
    if (group) upsertGroup({ ...group, mealIds: [...group.mealIds, id] })
    setAddIngredientModal(null)
  }

  const renameGroup = (groupId: string, name: string) => {
    const group = composedGroups.find(g => g.id === groupId)
    if (group) upsertGroup({ ...group, name })
  }

  // ── Compose modal ────────────────────────────────────────────
  const [composeModal, setComposeModal] = useState<{ mealType: MealType } | null>(null)
  const [composeName, setComposeName] = useState('')

  const openComposeModal = (mealType: MealType) => {
    setComposeName('')
    setComposeModal({ mealType })
  }

  const handleCompose = () => {
    if (!composeModal) return
    const { mealType } = composeModal
    const sel = selectedIds[mealType]
    if (!sel || sel.size === 0) return

    const name = composeName.trim() || (lang === 'he' ? 'מנה חדשה' : 'New dish')
    const newGroup: ComposedGroup = {
      id: crypto.randomUUID(),
      name,
      mealIds: [...sel],
    }
    upsertGroup(newGroup)
    clearSelection(mealType)
    setComposeModal(null)
  }

  // ── Action bar helpers ───────────────────────────────────────
  const handleDuplicateSelected = (type: MealType) => {
    const sel = selectedIds[type]
    if (!sel) return
    mealsByType[type]
      .filter(m => sel.has(m.id))
      .forEach(m => onDuplicateMeal(m))
    // Also duplicate any composed groups fully selected
    composedGroups
      .filter(g => sel.has(g.id))
      .forEach(g => {
        const groupMeals = todayMeals.filter(m => g.mealIds.includes(m.id))
        groupMeals.forEach(m => onDuplicateMeal(m))
      })
    clearSelection(type)
  }

  const handleDeleteSelected = (type: MealType) => {
    const sel = selectedIds[type]
    if (!sel) return
    // Delete standalone meals
    mealsByType[type]
      .filter(m => sel.has(m.id) && !composedGroups.some(g => g.mealIds.includes(m.id)))
      .forEach(m => onDeleteMeal(m.id))
    // Delete composed groups (dissolve + delete all children)
    composedGroups
      .filter(g => sel.has(g.id))
      .forEach(g => {
        g.mealIds.forEach(id => onDeleteMeal(id))
        dissolveGroup(g.id)
      })
    clearSelection(type)
  }

  // ── Draggable summary card ───────────────────────────────────
  const [summarySlot, setSummarySlot] = useState(loadSummarySlot)
  const dragging     = useRef(false)
  const dragStartY   = useRef(0)
  const dragCurrentY = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const summaryRef   = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current     = true
    dragStartY.current   = e.clientY
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
    const newSlot = Math.max(0, Math.min(visibleTypes.length, summarySlot + Math.round(delta / 80)))
    setSummarySlot(newSlot)
    saveSummarySlot(newSlot)
    setDragOffset(0)
  }, [summarySlot, visibleTypes.length])

  // ── Render: summary card ─────────────────────────────────────
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
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 24, marginBottom: 4, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <span className="icon icon-sm" style={{ color: 'var(--text-3)', fontSize: 20 }}>drag_handle</span>
      </div>
      <DailySummary meals={todayMeals} date={today()} goalCalories={goalCalories} goalProtein={goalProtein} lang={lang} />
    </div>
  )

  // ── Render: meal group ───────────────────────────────────────
  const mealGroup = (type: MealType, i: number) => {
    const typeMeals   = mealsByType[type]
    const isCollapsed = collapsed.has(type)
    const selSet      = selectedIds[type] ?? new Set<string>()

    const totalCal  = Math.round(typeMeals.reduce((s, m) => s + m.calories, 0))
    const totalProt = Math.round(typeMeals.reduce((s, m) => s + m.protein, 0) * 10) / 10

    // Split items: composed groups vs standalone
    const groupsHere = composedGroups.filter(g =>
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
      <div key={type} className="card fade-up" style={{ animationDelay: `${i * 0.05}s`, marginBottom: 12, overflow: 'hidden' }}>

        {/* ── Group header (full row clickable) ──────────── */}
        <div
          role="button"
          tabIndex={0}
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

          {/* Totals when collapsed */}
          {isCollapsed && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginInlineStart: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>
                <span>{totalCal}</span>
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 700, color: 'var(--green-hi)' }}>
                <span>{totalProt}</span>
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{t(lang, 'proteinUnit')}</span>
              </span>
            </span>
          )}

          <span style={{ flex: 1 }} />

          {/* Pencil — change group type */}
          <button
            onClick={e => {
              e.stopPropagation()
              setEditingGroupType(editingGroupType === type ? null : type)
            }}
            style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0,
              background: editingGroupType === type ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${editingGroupType === type ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
            title={t(lang, 'changeGroup')}
          >
            <span className="icon icon-sm" style={{ color: editingGroupType === type ? 'var(--amber)' : 'var(--text-3)' }}>
              edit
            </span>
          </button>

          <span style={{ width: 6 }} />

          {/* Chevron */}
          <span className="chevron-badge">
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
              expand_more
            </span>
          </span>
        </div>

        {/* ── Type picker (inline, under header) ─────────── */}
        {editingGroupType === type && (
          <div className="type-picker">
            {MEAL_TYPES.map(mt => (
              <div
                key={mt}
                className={`type-picker-row${mt === type ? ' current' : ''}`}
                onClick={() => handleChangeGroupType(type, mt)}
              >
                <div
                  className="type-picker-ico"
                  style={{ background: `${MEAL_COLORS[mt]}18`, border: `1px solid ${MEAL_COLORS[mt]}30` }}
                >
                  <span className="icon icon-sm" style={{ color: MEAL_COLORS[mt] }}>{MEAL_ICONS[mt]}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: mt === type ? MEAL_COLORS[mt] : 'var(--text-2)', flex: 1 }}>
                  {t(lang, mt)}
                </span>
                <div className={`type-picker-radio${mt === type ? ' on' : ''}`}>
                  {mt === type && <span className="icon" style={{ fontSize: 11, color: 'var(--amber)' }}>check</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Meal cards ──────────────────────────────────── */}
        {!isCollapsed && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px 10px' }}>

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
                />
              )
            })}

            {/* Standalone meals */}
            {standalones.map(meal => (
              <MealCard
                key={meal.id}
                meal={meal}
                lang={lang}
                showCheckbox={true}
                selected={selSet.has(meal.id)}
                onToggleSelect={() => toggleSelect(type, meal.id)}
                onEdit={onEditMeal}
              />
            ))}

            {/* ── Action bar (shown when anything selected) ── */}
            {selCount > 0 && (
              <div className="group-action-bar">
                {/* Header row */}
                <div className="group-action-bar-header">
                  <span className="icon icon-sm" style={{ color: 'var(--purple)', fontSize: 16 }}>check_circle</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', flex: 1 }}>
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
                  <button className="group-action-btn" onClick={() => handleDuplicateSelected(type)}>
                    <div className="group-action-btn-ico" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <span className="icon icon-sm" style={{ color: 'var(--green-hi)' }}>content_copy</span>
                    </div>
                    <span style={{ color: 'var(--green-hi)' }}>{t(lang, 'duplicate')}</span>
                  </button>

                  {/* Create dish */}
                  <button className="group-action-btn" onClick={() => openComposeModal(type)}>
                    <div className="group-action-btn-ico" style={{ background: 'var(--purple-tint)', border: '1px solid rgba(139,92,246,0.25)' }}>
                      <span className="icon icon-sm" style={{ color: 'var(--purple)' }}>restaurant</span>
                    </div>
                    <span style={{ color: 'var(--purple)' }}>{t(lang, 'createDish')}</span>
                  </button>

                  {/* Delete */}
                  <button className="group-action-btn" onClick={() => handleDeleteSelected(type)}>
                    <div className="group-action-btn-ico" style={{ background: 'var(--red-tint)', border: '1px solid rgba(244,63,94,0.2)' }}>
                      <span className="icon icon-sm" style={{ color: 'var(--red-hi)' }}>delete</span>
                    </div>
                    <span style={{ color: 'var(--red-hi)' }}>{t(lang, 'delete')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
  if (clampedSlot >= visibleTypes.length) items.push(<div key="summary">{summaryCard}</div>)

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
        <div className="compose-modal" onClick={e => e.stopPropagation()}>
          {/* Title */}
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', margin: 0 }}>{t(lang, 'dishName')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: '4px 0 0' }}>
              {lang === 'he' ? `מ-${sel.size} פריטים` : `From ${sel.size} items`}
            </p>
          </div>

          {/* Totals summary */}
          <div className="compose-modal-summary">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', flex: 1 }}>
              {lang === 'he' ? 'סה״כ' : 'Total'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue-hi)', display: 'flex', alignItems: 'baseline', gap: 2 }}>
              {totalCal} <span style={{ fontSize: 10, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-hi)', display: 'flex', alignItems: 'baseline', gap: 2, marginInlineStart: 12 }}>
              {totalProt} <span style={{ fontSize: 10, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
            </span>
          </div>

          {/* Item list */}
          <div className="compose-modal-items">
            {items.map((item, idx) => (
              <div key={idx} className="compose-modal-item">
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.45)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                  {item.cal} {t(lang, 'caloriesUnit')} · {item.prot} {t(lang, 'proteinUnit')}
                </span>
              </div>
            ))}
          </div>

          {/* Name input */}
          <input
            className="inp"
            style={{ borderColor: 'rgba(139,92,246,0.4)' }}
            placeholder={t(lang, 'dishName') + '...'}
            value={composeName}
            onChange={e => setComposeName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCompose() }}
            autoFocus
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-confirm" style={{ flex: 1 }} onClick={handleCompose}>
              <span className="icon icon-sm" style={{ marginInlineEnd: 6 }}>merge</span>
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

  return (
    <div ref={containerRef}>
      <FoodEntryForm
        lang={lang}
        history={history}
        getSuggestions={getSuggestions}
        onAdd={onAddMeal}
        onUpsertHistory={onUpsertHistory}
        composedEntries={composedEntries}
      />

      {todayMeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
          <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>restaurant_menu</span>
          <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noMealsToday')}</p>
        </div>
      )}

      {items}

      {visibleTypes.length === 0 && todayMeals.length === 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', fontSize: 20 }}>drag_handle</span>
          </div>
          <DailySummary meals={[]} date={today()} goalCalories={goalCalories} goalProtein={goalProtein} lang={lang} />
        </div>
      )}

      {composeModalEl}

      {/* ── Add ingredient modal ──────────────────────────────── */}
      {addIngredientModal && (
        <div className="compose-modal-backdrop" onClick={() => setAddIngredientModal(null)}>
          <div className="compose-modal" style={{ maxWidth: 420, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <FoodEntryForm
              key={addIngredientModal.groupId}
              lang={lang}
              history={history}
              getSuggestions={getSuggestions}
              defaultMealType={addIngredientModal.mealType}
              onAdd={handleAddIngredientSubmit}
              onUpsertHistory={onUpsertHistory}
            />
          </div>
        </div>
      )}
    </div>
  )
}
