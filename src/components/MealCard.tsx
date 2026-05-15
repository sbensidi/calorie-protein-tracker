import { useState, useRef } from 'react'
import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir } from '../lib/i18n'
import { formatWeight, UNITS, toBase } from '../lib/units'
import type { WeightUnit, UnitId } from '../lib/units'

interface MealCardProps {
  meal: Meal
  lang: Lang
  weightUnit?: WeightUnit
  showCheckbox: boolean
  selected: boolean
  onToggleSelect: () => void
  onEdit: (id: string, updates: Partial<Meal>) => void
  enableWeightScaling?: boolean
  onDelete?: (id: string) => void
  listStyle?: boolean
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'beverage'

export function MealCard({ meal, lang, weightUnit = 'g', showCheckbox, selected, onToggleSelect, onEdit, enableWeightScaling = false, onDelete, listStyle = false }: MealCardProps) {
  const [editing, setEditing] = useState(false)
  const scalingRatios = useRef<{ calPerGram: number; protPerGram: number; perServing: boolean } | null>(null)
  const [editName,     setEditName]     = useState(meal.name)
  const [editMealType, setEditMealType] = useState<MealType>(meal.meal_type as MealType)
  const [editCalories, setEditCalories] = useState<number | ''>(meal.calories)
  const [editProtein,  setEditProtein]  = useState<number | ''>(meal.protein)
  // Weight: positive = grams, negative = pcs (stored as negative), fluid uses fluid_ml
  const isPcsEntry    = meal.grams < 0
  const isFluidEntry  = meal.fluid_ml != null && !meal.fluid_excluded
  const [editWeight,  setEditWeight]  = useState<number | ''>(
    isFluidEntry ? Math.round(meal.fluid_ml!) : Math.abs(meal.grams)
  )
  const [editWeightUnit, setEditWeightUnit] = useState<UnitId | 'pcs'>(
    isFluidEntry ? 'ml' : isPcsEntry ? 'pcs' : 'g'
  )

  const saveEdit = () => {
    if (!editName.trim()) return
    const w    = Number(editWeight) || 0
    const isVol = editWeightUnit !== 'pcs' && UNITS[editWeightUnit as UnitId].type === 'volume'
    const base  = editWeightUnit === 'pcs' ? w : toBase(w, editWeightUnit as UnitId)
    onEdit(meal.id, {
      name:      editName.trim(),
      meal_type: editMealType,
      calories:  Math.max(0, Number(editCalories) || 0),
      protein:   Math.max(0, Number(editProtein)  || 0),
      grams:     editWeightUnit === 'pcs' ? -w : Math.round(base),
      ...(isVol ? { fluid_ml: base } : {}),
    })
    setEditing(false)
  }
  const openEdit = () => {
    if (enableWeightScaling) {
      const base = isFluidEntry ? (meal.fluid_ml ?? 0) : Math.abs(meal.grams)
      const d = base || 1
      scalingRatios.current = { calPerGram: meal.calories / d, protPerGram: meal.protein / d, perServing: isPcsEntry }
    }
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditName(meal.name)
    setEditMealType(meal.meal_type as MealType)
    setEditCalories(meal.calories)
    setEditProtein(meal.protein)
    setEditWeight(isFluidEntry ? Math.round(meal.fluid_ml!) : Math.abs(meal.grams))
    setEditWeightUnit(isFluidEntry ? 'ml' : isPcsEntry ? 'pcs' : 'g')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="meal-row" style={{ borderColor: 'var(--accent-glow)' }}>
        {/* Row 1: name + meal type */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              className="inp"
              style={{ width: '100%', fontSize: 16, paddingInlineEnd: editName ? 32 : 12 }}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder={t(lang, 'foodName')}
              dir={dir(lang)}
              autoFocus
            />
            {editName && (
              <button
                onMouseDown={e => { e.preventDefault(); setEditName('') }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
          <select
            className="inp"
            style={{ width: 110, flexShrink: 0, fontSize: 16 }}
            value={editMealType}
            onChange={e => setEditMealType(e.target.value as MealType)}
          >
            <option value="breakfast">{t(lang, 'breakfast')}</option>
            <option value="lunch">{t(lang, 'lunch')}</option>
            <option value="dinner">{t(lang, 'dinner')}</option>
            <option value="snack">{t(lang, 'snack')}</option>
            <option value="beverage">{t(lang, 'beverage')}</option>
          </select>
        </div>
        {/* Row 2: calories | protein | weight | unit — 4 equal columns (Issue 6) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t(lang, 'calories')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                inputMode="numeric"
                className="inp"
                style={{ fontSize: 16, paddingInlineEnd: editCalories !== '' ? 32 : 12 }}
                value={editCalories}
                placeholder="0"
                onChange={e => setEditCalories(e.target.value === '' ? '' : Number(e.target.value))}
                onFocus={() => { if (editCalories === 0) setEditCalories('') }}
              />
              {editCalories !== '' && (
                <button onMouseDown={e => { e.preventDefault(); setEditCalories('') }} tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--positive-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {lang === 'he' ? 'חלבון (ג׳)' : 'Protein (g)'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                className="inp inp-green"
                style={{ fontSize: 16, paddingInlineEnd: editProtein !== '' ? 32 : 12 }}
                value={editProtein}
                placeholder="0"
                onChange={e => setEditProtein(e.target.value === '' ? '' : Number(e.target.value))}
                onFocus={() => { if (editProtein === 0) setEditProtein('') }}
              />
              {editProtein !== '' && (
                <button onMouseDown={e => { e.preventDefault(); setEditProtein('') }} tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t(lang, 'amount')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                inputMode="decimal"
                className="inp"
                style={{ width: '100%', fontSize: 16, paddingInlineEnd: editWeight !== '' ? 32 : 12 }}
                value={editWeight}
                placeholder="0"
                onChange={e => {
                  const w = e.target.value === '' ? '' : Number(e.target.value)
                  setEditWeight(w)
                  if (enableWeightScaling && scalingRatios.current && typeof w === 'number' && w > 0) {
                    // Only scale if still in same unit family (pcs vs gram/volume)
                    const isPcs = editWeightUnit === 'pcs'
                    if (isPcs === scalingRatios.current.perServing) {
                      const base = isPcs ? w : toBase(w, editWeightUnit as UnitId)
                      setEditCalories(Math.round(base * scalingRatios.current.calPerGram))
                      setEditProtein(Math.round(base * scalingRatios.current.protPerGram * 10) / 10)
                    }
                  }
                }}
                onFocus={e => e.target.select()}
              />
              {editWeight !== '' && (
                <button onMouseDown={e => { e.preventDefault(); setEditWeight('') }} tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {lang === 'he' ? 'יחידה' : 'Unit'}
            </label>
            <select
              className="inp"
              style={{ width: '100%', fontSize: 16 }}
              value={editWeightUnit}
              onChange={e => {
                const newUnit = e.target.value as UnitId | 'pcs'
                setEditWeightUnit(newUnit)
                if (enableWeightScaling && scalingRatios.current) {
                  const crossingBoundary = (editWeightUnit === 'pcs') !== (newUnit === 'pcs')
                  if (crossingBoundary) {
                    // Can't convert pcs↔gram without servingGrams — disable scaling
                    scalingRatios.current = null
                  } else if (editWeightUnit !== 'pcs' && newUnit !== 'pcs') {
                    // Weight/volume switch: recalculate nutrition for current amount in new unit
                    const w = typeof editWeight === 'number' ? editWeight : Number(editWeight) || 0
                    if (w > 0) {
                      const base = toBase(w, newUnit as UnitId)
                      setEditCalories(Math.round(base * scalingRatios.current.calPerGram))
                      setEditProtein(Math.round(base * scalingRatios.current.protPerGram * 10) / 10)
                    }
                  }
                }
              }}
            >
              <option value="g">g</option>
              <option value="oz">{lang === 'he' ? UNITS.oz.abbr_he : 'oz'}</option>
              <option value="ml">ml</option>
              <option value="cup">{lang === 'he' ? UNITS.cup.abbr_he : 'cup'}</option>
              <option value="tbsp">{lang === 'he' ? UNITS.tbsp.abbr_he : 'tbsp'}</option>
              <option value="tsp">{lang === 'he' ? UNITS.tsp.abbr_he : 'tsp'}</option>
              <option value="fl_oz">{lang === 'he' ? UNITS.fl_oz.abbr_he : 'fl oz'}</option>
              <option value="pcs">{lang === 'he' ? 'מנה' : 'serving'}</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveEdit} className="btn-confirm" style={{ flex: 1 }}>{t(lang, 'save')}</button>
          <button onClick={cancelEdit} className="btn-ghost" style={{ flex: 1 }}>{t(lang, 'cancel')}</button>
        </div>
      </div>
    )
  }

  if (listStyle) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 0',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {meal.name}
              {meal.fluid_ml != null && !meal.fluid_excluded && (
                <span className="icon" style={{ fontSize: 12, color: 'var(--cyan-hi)', opacity: 0.8, verticalAlign: 'middle', margin: '0 4px' }}>water_drop</span>
              )}
            </span>
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {meal.fluid_ml != null && !meal.fluid_excluded
                ? (meal.fluid_ml >= 1000
                    ? `${(meal.fluid_ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
                    : `${Math.round(meal.fluid_ml)}ml`)
                : meal.grams < 0
                  ? `${Math.abs(meal.grams)} ${lang === 'he' ? 'מנות' : 'serving(s)'}`
                  : formatWeight(meal.grams, weightUnit)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', lineHeight: 1 }}>
              {Math.round(meal.calories)}
              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'caloriesUnit')}</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', lineHeight: 1 }}>
              {Math.round(meal.protein * 10) / 10}
              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.65, marginInlineStart: 2 }}>{lang === 'he' ? "ג׳ חלבון" : 'g protein'}</span>
            </span>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={e => { e.stopPropagation(); openEdit() }}
          aria-label={t(lang, 'edit')}
        >
          <span className="icon icon-sm">edit</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="meal-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        ...(selected ? { borderColor: 'color-mix(in srgb, var(--composed) 35%, transparent)', background: 'var(--composed-tint)' } : {}),
      }}
    >
      {/* Checkbox — only shown when group is open */}
      {showCheckbox && (
        <div
          className={`cb${selected ? ' cb-on' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleSelect() }}
        >
          {selected && <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 13 }}>check</span>}
        </div>
      )}

      {/* Content: 2-line layout — Line1: name+qty, Line2: cal+protein */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: food name + quantity */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {meal.name}
            {meal.fluid_ml != null && !meal.fluid_excluded && (
              <span className="icon" style={{ fontSize: 13, color: 'var(--cyan-hi)', opacity: 0.8, verticalAlign: 'middle', marginInlineStart: 3 }}>water_drop</span>
            )}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {meal.fluid_ml != null && !meal.fluid_excluded
              ? (meal.fluid_ml >= 1000
                  ? `${(meal.fluid_ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
                  : `${Math.round(meal.fluid_ml)}ml`)
              : meal.grams < 0
                ? `${Math.abs(meal.grams)} ${lang === 'he' ? 'מנות' : 'serving(s)'}`
                : formatWeight(meal.grams, weightUnit)}
          </span>
        </div>
        {/* Line 2: calories + protein */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-hi)', lineHeight: 1 }}>
            {Math.round(meal.calories)}
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'caloriesUnit')}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--positive-hi)', lineHeight: 1 }}>
            {Math.round(meal.protein * 10) / 10}
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'proteinUnit')}</span>
          </span>
        </div>
      </div>

      {/* Edit button — always visible */}
      <button
        className="icon-btn"
        onClick={e => { e.stopPropagation(); openEdit() }}
        aria-label={t(lang, 'edit')}
      >
        <span className="icon icon-sm">edit</span>
      </button>
      {onDelete && (
        <button
          className="icon-btn danger"
          onClick={e => { e.stopPropagation(); onDelete(meal.id) }}
          aria-label={t(lang, 'delete')}
        >
          <span className="icon icon-sm">delete</span>
        </button>
      )}
    </div>
  )
}
