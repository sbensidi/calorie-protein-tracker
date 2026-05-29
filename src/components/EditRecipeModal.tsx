import { useState, useRef, useEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { ComposedGroup, RecipeIngredient, FoodHistory, FoodLibraryItem, Meal, UserFoodItem } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir } from '../lib/i18n'
import { FoodEntryForm } from './FoodEntryForm'
import { FoodHistoryModal } from './FoodHistoryModal'

interface EditRecipeModalProps {
  group: ComposedGroup
  lang: Lang
  onSave: (updated: ComposedGroup) => void
  onClose: () => void
  history: FoodHistory[]
  getSuggestions: (q: string) => FoodHistory[]
  searchLibrary?: (q: string) => FoodLibraryItem[]
  searchUserLibrary?: (q: string) => UserFoodItem[]
  library?: FoodLibraryItem[]
  defaultServingGrams?: number
  defaultWeightUnit?: 'g' | 'oz'
  defaultVolumeUnit?: 'ml' | 'cup' | 'tbsp' | 'tsp' | 'fl_oz'
  fluidThresholdMl?: number
  fluidZeroCalOnly?: boolean
  onUpsertHistory?: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>) => void
  onTouchHistory?: (id: string) => void
}

export function EditRecipeModal({
  group, lang, onSave, onClose,
  history, getSuggestions, searchLibrary, searchUserLibrary, library = [],
  defaultServingGrams = 150, defaultWeightUnit = 'g', defaultVolumeUnit = 'ml',
  fluidThresholdMl = 100, fluidZeroCalOnly = true,
  onUpsertHistory, onTouchHistory,
}: EditRecipeModalProps) {
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    () => group.ingredients ? group.ingredients.map(i => ({ ...i })) : []
  )
  const [addingIngredient, setAddingIngredient] = useState(false)
  const [searchingRow, setSearchingRow] = useState<number | null>(null)
  const [historySearch, setHistorySearch] = useState('')

  const modalRef    = useRef<HTMLDivElement>(null)
  const subModalRef = useRef<HTMLDivElement>(null)

  useLockBodyScroll(true)
  useFocusTrap(modalRef,    !addingIngredient)
  useFocusTrap(subModalRef, addingIngredient)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (addingIngredient) { setAddingIngredient(false); return }
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [addingIngredient, onClose])

  const scaleIngredient = (idx: number, newAmount: number) => {
    setIngredients(prev => prev.map((ing, i) => {
      if (i !== idx) return ing
      const isPcs      = ing.grams < 0
      const hasDisplay = !isPcs && ing.display_amount != null && ing.display_amount > 0
      const isFluid    = !isPcs && !hasDisplay && ing.fluid_ml != null && ing.fluid_ml > 0
      const current    = isPcs ? Math.abs(ing.grams) : hasDisplay ? ing.display_amount! : isFluid ? ing.fluid_ml! : ing.grams
      const ratio      = current > 0 ? newAmount / current : 0
      return {
        ...ing,
        grams:          isPcs      ? -newAmount                                               : Math.round(ing.grams * ratio),
        fluid_ml:       ing.fluid_ml != null                                                  ? Math.round(ing.fluid_ml * ratio) : null,
        display_amount: hasDisplay ? newAmount                                                 : ing.display_amount,
        calories:       Math.round(ing.calories * ratio),
        protein:        Math.round(ing.protein * ratio * 10) / 10,
      }
    }))
  }

  const updateName = (idx: number, name: string) =>
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, name } : ing))

  const removeRow = (idx: number) =>
    setIngredients(prev => prev.filter((_, i) => i !== idx))

  const handleAddIngredient = (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
    setIngredients(prev => [...prev, {
      name:           meal.name,
      grams:          meal.grams,
      calories:       Math.round(meal.calories),
      protein:        Math.round(meal.protein * 10) / 10,
      fluid_ml:       meal.fluid_ml       ?? null,
      display_unit:   meal.display_unit   ?? null,
      display_amount: meal.display_amount ?? null,
    }])
    setAddingIngredient(false)
  }

  const handleHistorySelect = (item: FoodHistory) => {
    if (searchingRow === null) return
    setIngredients(prev => prev.map((ing, i) => {
      if (i !== searchingRow) return ing
      const ratio = item.grams > 0 ? ing.grams / item.grams : 0
      return {
        ...ing,
        name:     item.name,
        calories: Math.round(item.calories * ratio),
        protein:  Math.round(item.protein * ratio * 10) / 10,
      }
    }))
    setSearchingRow(null)
    setHistorySearch('')
  }

  const save = () => {
    const totalCalories = Math.round(ingredients.reduce((s, i) => s + i.calories, 0))
    const totalProtein  = Math.round(ingredients.reduce((s, i) => s + i.protein,  0) * 10) / 10
    onSave({ ...group, ingredients, totalCalories, totalProtein })
  }

  const totalCal  = Math.round(ingredients.reduce((s, i) => s + i.calories, 0))
  const totalProt = Math.round(ingredients.reduce((s, i) => s + i.protein,  0) * 10) / 10

  return (
    <>
      {/* Main modal */}
      <div className="compose-modal-backdrop" onClick={onClose}>
        <div ref={modalRef} className="compose-modal" role="dialog" aria-modal="true" aria-label={t(lang, 'editRecipe')} onClick={e => e.stopPropagation()}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', textAlign: 'center' }}>
            {t(lang, 'editRecipe')} — {group.name}
          </p>

          {/* Editable ingredient rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ingredients.map((ing, i) => {
              const isPcs      = ing.grams < 0
              const hasDisplay = !isPcs && ing.display_amount != null && ing.display_amount > 0
              const isFluid    = !isPcs && !hasDisplay && ing.fluid_ml != null && ing.fluid_ml > 0
              const displayAmt = isPcs ? Math.abs(ing.grams) : hasDisplay ? ing.display_amount! : isFluid ? ing.fluid_ml! : ing.grams
              const unitMap: Record<string, string> = {
                'oz': t(lang, 'unitOptOz'), 'ml': t(lang, 'unitOptMl'),
                'cup': t(lang, 'unitOptCup'), 'tbsp': t(lang, 'unitOptTbsp'),
                'tsp': t(lang, 'unitOptTsp'), 'fl_oz': t(lang, 'unitOptFlOz'),
              }
              const unitLabel = isPcs      ? t(lang, 'unitOptPcs')
                              : hasDisplay ? (unitMap[ing.display_unit!] ?? ing.display_unit!)
                              : isFluid    ? t(lang, 'unitOptMl')
                              : t(lang, 'gramsUnit')
              return (
                <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {/* Name input + history search button */}
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <input
                      className="inp"
                      style={{ width: '100%', fontSize: 16, height: 36, paddingInlineEnd: 34 }}
                      value={ing.name}
                      onChange={e => updateName(i, e.target.value)}
                      dir={dir(lang)}
                    />
                    <button
                      className="icon-btn"
                      tabIndex={-1}
                      onClick={() => { setSearchingRow(i); setHistorySearch('') }}
                      aria-label={t(lang, 'foodHistory')}
                      style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 34, padding: 0, borderRadius: '0 8px 8px 0' }}
                    >
                      <span className="icon icon-sm" style={{ fontSize: 16, color: 'var(--text-3)' }}>manage_search</span>
                    </button>
                  </div>
                  {/* Amount input — fixed width, unit reflects original entry (g or ml) */}
                  <div
                    className="inp"
                    style={{
                      height: 36, display: 'flex', alignItems: 'center', gap: 3,
                      justifyContent: lang === 'he' ? 'flex-start' : 'flex-end',
                      padding: '0 8px', flexShrink: 0, cursor: 'text',
                      width: 76, boxSizing: 'border-box',
                    }}
                    onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
                  >
                    <input
                      type="number" inputMode="decimal"
                      style={{
                        border: 'none', background: 'transparent', outline: 'none',
                        fontSize: 16, color: 'var(--text)', fontFamily: 'inherit',
                        width: `${Math.max(2, String(Math.round(Math.abs(displayAmt)) || '').length + 1)}ch`,
                        minWidth: '2ch', padding: 0, margin: 0, lineHeight: 1,
                      }}
                      value={displayAmt > 0 ? displayAmt : ''}
                      onChange={e => scaleIngredient(i, parseFloat(e.target.value) || 0)}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>
                      {unitLabel}
                    </span>
                  </div>
                  {/* Calories — fixed width, same alignment pattern */}
                  <div style={{
                    height: 36, display: 'flex', alignItems: 'center', gap: 3,
                    justifyContent: lang === 'he' ? 'flex-start' : 'flex-end',
                    background: 'var(--accent-fill)', borderRadius: 8,
                    padding: '0 8px', flexShrink: 0,
                    width: 76, boxSizing: 'border-box',
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-hi)', lineHeight: 1 }}>
                      {ing.calories}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--accent-hi)', opacity: 0.7, flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>
                      {t(lang, 'caloriesUnit')}
                    </span>
                  </div>
                  {/* Delete */}
                  <button className="icon-btn" onClick={() => removeRow(i)} aria-label={t(lang, 'delete')}>
                    <span className="icon icon-sm" style={{ color: 'var(--danger-hi)', fontSize: 16 }}>delete</span>
                  </button>
                </div>
              )
            })}
          </div>

          {/* Add ingredient — dashed button opens FoodEntryForm sub-modal */}
          <button
            onClick={() => setAddingIngredient(true)}
            style={{
              marginTop: 8, width: '100%', background: 'transparent',
              border: '1px dashed var(--composed-glow)', borderRadius: 8,
              padding: '8px 12px', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600, color: 'var(--composed)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span className="icon" style={{ fontSize: 16 }}>add</span>
            {t(lang, 'addIngredient')}
          </button>

          {/* Total */}
          <div className="compose-modal-summary">
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', flex: 1 }}>{t(lang, 'total')}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-hi)', display: 'flex', alignItems: 'baseline', gap: 2 }}>
              {totalCal} <span style={{ fontSize: 10, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--positive-hi)', display: 'flex', alignItems: 'baseline', gap: 2, marginInlineStart: 12 }}>
              {totalProt} <span style={{ fontSize: 10, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
            </span>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-confirm" style={{ flex: 1 }} onClick={save}>
              {t(lang, 'save')}
            </button>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose}>
              {t(lang, 'cancel')}
            </button>
          </div>
        </div>
      </div>

      {/* Add ingredient sub-modal — opens on top of edit modal */}
      {addingIngredient && (
        <div
          className="compose-modal-backdrop"
          style={{ zIndex: 201 }}
          onClick={() => setAddingIngredient(false)}
        >
          <div
            ref={subModalRef}
            className="compose-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t(lang, 'addIngredient')}
            style={{ maxWidth: 420, padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <FoodEntryForm
              lang={lang}
              history={history}
              getSuggestions={getSuggestions}
              searchLibrary={searchLibrary}
              searchUserLibrary={searchUserLibrary}
              library={library}
              defaultServingGrams={defaultServingGrams}
              defaultWeightUnit={defaultWeightUnit}
              defaultVolumeUnit={defaultVolumeUnit}
              onAdd={handleAddIngredient}
              onUpsertHistory={onUpsertHistory ?? (() => {})}
              onTouchHistory={onTouchHistory}
              fluidThresholdMl={fluidThresholdMl}
              fluidZeroCalOnly={fluidZeroCalOnly}
            />
          </div>
        </div>
      )}

      {/* Food history sub-modal — replaces ingredient name/nutrition from history */}
      {searchingRow !== null && (
        <FoodHistoryModal
          lang={lang}
          history={history}
          search={historySearch}
          onSearchChange={setHistorySearch}
          onClose={() => { setSearchingRow(null); setHistorySearch('') }}
          onSelectHistory={handleHistorySelect}
        />
      )}
    </>
  )
}
