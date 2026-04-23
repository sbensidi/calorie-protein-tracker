import { useMemo, useState, useCallback } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { useSheetScroll } from '../hooks/useSheetScroll'
import { SheetHandle } from './SheetHandle'
import type { Meal, FoodHistory, ComposedGroup } from '../types'
import type { Lang } from '../lib/i18n'
import { t, today, currentTime } from '../lib/i18n'
import { FoodEntryForm } from './FoodEntryForm'
import type { ComposedEntry } from './FoodEntryForm'
import { MealCard } from './MealCard'
import { ComposedMealCard } from './ComposedMealCard'
import { DailySummary } from './DailySummary'

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


// ── Props ────────────────────────────────────────────────────────
interface TodayTabProps {
  lang: Lang
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
  composedEntries: ComposedEntry[]
  composedGroups: ComposedGroup[]
  onUpsertGroup: (group: ComposedGroup) => void
  onRemoveGroup: (id: string) => void
}

export function TodayTab({
  lang, meals, history, goalCalories, goalProtein,
  getSuggestions, onAddMeal, onAddMealWithId, onEditMeal, onDeleteMeal, onDuplicateMeal, onUpsertHistory,
  composedEntries, composedGroups, onUpsertGroup, onRemoveGroup,
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

  const dissolveGroup = (groupId: string) => onRemoveGroup(groupId)

  // ── Add ingredient modal ─────────────────────────────────────
  const [addIngredientModal, setAddIngredientModal] = useState<{ groupId: string; mealType: MealType } | null>(null)

  const handleAddIngredientSubmit = async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
    if (!addIngredientModal) return
    const id = await onAddMealWithId({ ...meal, meal_type: addIngredientModal.mealType })
    if (!id) return
    const group = composedGroups.find(g => g.id === addIngredientModal.groupId)
    if (group) onUpsertGroup({ ...group, mealIds: [...group.mealIds, id] })
    setAddIngredientModal(null)
  }

  // ── Clone composed group into today ─────────────────────────
  const handleAddComposed = useCallback(async (composedId: string) => {
    const group = composedGroups.find(g => g.id === composedId)
    if (!group) return
    const newMealIds: string[] = []
    for (const mealId of group.mealIds) {
      const src = meals.find(m => m.id === mealId)
      if (!src) continue
      const newId = await onAddMealWithId({
        date:        today(),
        meal_type:   src.meal_type,
        name:        src.name,
        grams:       src.grams,
        calories:    src.calories,
        protein:     src.protein,
        time_logged: currentTime(),
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
    onUpsertGroup(newGroup)
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

  // ── Entry sheet ──────────────────────────────────────────────
  const [entryOpen, setEntryOpen] = useState(false)
  const anyModalOpen = entryOpen || !!composeModal || !!addIngredientModal
  useLockBodyScroll(anyModalOpen)
  const { scrollRef: entryScrollRef, scrolledDown: entryScrolledDown, onScroll: entryOnScroll } = useSheetScroll()

  // ── Render: summary card ─────────────────────────────────────
  const summaryCard = (
    <div style={{ marginBottom: 20 }}>
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
              background: editingGroupType === type ? 'rgba(245,158,11,0.12)' : 'var(--inp-bg)',
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

  // ── Meal groups list ─────────────────────────────────────────
  const items = visibleTypes.map((type, i) => mealGroup(type, i))

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
          <div style={{ position: 'relative' }}>
            <input
              className="inp"
              style={{ borderColor: 'rgba(139,92,246,0.4)', paddingInlineEnd: composeName ? 32 : 12 }}
              placeholder={t(lang, 'dishName') + '...'}
              value={composeName}
              onChange={e => setComposeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCompose() }}
              autoFocus
              dir={lang === 'he' ? 'rtl' : 'ltr'}
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
    <div>
      {summaryCard}

      {todayMeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
          <span className="icon" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>restaurant_menu</span>
          <p style={{ fontSize: 14, margin: 0 }}>{t(lang, 'noMealsToday')}</p>
        </div>
      )}

      {items}

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

      {/* ── FAB ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setEntryOpen(true)}
        style={{
          position: 'fixed',
          bottom: 28,
          insetInlineEnd: 'max(calc((100vw - 560px) / 2 + 24px), 24px)',
          zIndex: 40,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--blue)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(59,130,246,0.5)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(59,130,246,0.65)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';    e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.5)'  }}
      >
        <span className="icon" style={{ fontSize: 28 }}>add</span>
      </button>

      {/* ── Entry bottom sheet ────────────────────────────────────── */}
      <div
        onClick={() => setEntryOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 99,
          background: 'var(--modal-backdrop)',
          backdropFilter: entryOpen ? 'blur(2px)' : 'none',
          opacity: entryOpen ? 1 : 0,
          pointerEvents: entryOpen ? 'all' : 'none',
          transition: 'opacity 0.3s, backdrop-filter 0.3s',
        }}
      />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: '100%', maxWidth: 560,
          pointerEvents: 'all',
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
          borderRadius: '20px 20px 0 0',
          // Tall by default so dropdowns have room; overflow visible so
          // absolutely-positioned dropdowns are never clipped by the sheet.
          height: 'min(90vh, 720px)',
          overflow: 'visible',
          transform: entryOpen ? 'translateY(0)' : 'translateY(105%)',
          transition: 'transform 0.35s cubic-bezier(.22,.9,.36,1)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <SheetHandle scrolledDown={entryScrolledDown} onClose={() => setEntryOpen(false)} />

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
              onAdd={meal => { onAddMeal(meal); setEntryOpen(false) }}
              onUpsertHistory={onUpsertHistory}
              composedEntries={composedEntries}
              onAddComposed={id => { handleAddComposed(id); setEntryOpen(false) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
