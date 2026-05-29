import { useState, useRef, useEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { ComposedGroup, RecipeIngredient, FoodHistory, FoodLibraryItem, Meal, UserFoodItem } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir } from '../lib/i18n'
import { FoodEntryForm } from './FoodEntryForm'

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

  const scaleIngredient = (idx: number, newGrams: number) => {
    setIngredients(prev => prev.map((ing, i) => {
      if (i !== idx) return ing
      const ratio = ing.grams > 0 ? newGrams / ing.grams : 0
      return { ...ing, grams: newGrams, calories: Math.round(ing.calories * ratio), protein: Math.round(ing.protein * ratio * 10) / 10 }
    }))
  }

  const updateName = (idx: number, name: string) =>
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, name } : ing))

  const removeRow = (idx: number) =>
    setIngredients(prev => prev.filter((_, i) => i !== idx))

  const handleAddIngredient = (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
    setIngredients(prev => [...prev, {
      name:     meal.name,
      grams:    meal.grams,
      calories: Math.round(meal.calories),
      protein:  Math.round(meal.protein * 10) / 10,
    }])
    setAddingIngredient(false)
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
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {/* Name input */}
                <input
                  className="inp"
                  style={{ flex: 2, fontSize: 16, height: 36 }}
                  value={ing.name}
                  onChange={e => updateName(i, e.target.value)}
                  dir={dir(lang)}
                />
                {/* Grams input */}
                <div style={{ position: 'relative', width: 72 }}>
                  <input
                    type="number" inputMode="decimal" className="inp"
                    style={{ height: 36, fontSize: 16, paddingInlineEnd: 20, textAlign: 'end', width: '100%' }}
                    value={ing.grams > 0 ? ing.grams : ''}
                    onChange={e => scaleIngredient(i, parseFloat(e.target.value) || 0)}
                  />
                  <span style={{ position: 'absolute', insetInlineEnd: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-3)', pointerEvents: 'none' }}>g</span>
                </div>
                {/* Calories — readonly, visually distinct */}
                <div style={{ position: 'relative', width: 60 }}>
                  <input
                    readOnly
                    className="inp"
                    style={{
                      height: 36, fontSize: 13, fontWeight: 700,
                      paddingInlineEnd: 20, textAlign: 'end', width: '100%',
                      background: 'var(--accent-fill)', borderColor: 'transparent',
                      color: 'var(--accent-hi)', cursor: 'default',
                    }}
                    value={ing.calories}
                    tabIndex={-1}
                  />
                  <span style={{ position: 'absolute', insetInlineEnd: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--accent-hi)', opacity: 0.7, pointerEvents: 'none' }}>
                    {t(lang, 'caloriesUnit')}
                  </span>
                </div>
                {/* Delete */}
                <button className="icon-btn" onClick={() => removeRow(i)} aria-label={t(lang, 'delete')}>
                  <span className="icon icon-sm" style={{ color: 'var(--danger-hi)', fontSize: 16 }}>delete</span>
                </button>
              </div>
            ))}
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
          style={{ zIndex: 101 }}
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
    </>
  )
}
