import { useState, useRef, useEffect } from 'react'
import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir } from '../lib/i18n'
import { formatWeight, UNITS, toBase } from '../lib/units'
import type { WeightUnit, UnitId } from '../lib/units'
import { useNutritionAmountEditor } from '../hooks/useNutritionAmountEditor'

interface MealCardProps {
  meal: Meal
  lang: Lang
  weightUnit?: WeightUnit
  showCheckbox: boolean
  selected: boolean
  onToggleSelect: () => void
  onEdit: (id: string, updates: Partial<Meal>) => void
  enableWeightScaling?: boolean
  servingG?: number
  onDelete?: (id: string) => void
  onDuplicate?: () => void
  listStyle?: boolean
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'beverage'

function fmtDisplayUnit(meal: Meal, lang: Lang): string | null {
  if (meal.display_unit == null || meal.display_amount == null) return null
  if (!(meal.display_unit in UNITS)) return null
  const u = UNITS[meal.display_unit as UnitId]
  return `${meal.display_amount} ${lang === 'he' ? u.abbr_he : u.abbr_en}`
}

export function MealCard({ meal, lang, weightUnit = 'g', showCheckbox, selected, onToggleSelect, onEdit, enableWeightScaling = false, servingG, onDelete, onDuplicate, listStyle = false }: MealCardProps) {
  const [editing, setEditing] = useState(false)
  const [quickEdit, setQuickEdit] = useState(false)
  const quickInputRef = useRef<HTMLInputElement>(null)
  const [editName,     setEditName]     = useState(meal.name)
  const [editMealType, setEditMealType] = useState<MealType>(meal.meal_type as MealType)
  const [editNotes, setEditNotes] = useState(meal.notes ?? '')

  const isPcsEntry   = meal.grams < 0
  const isFluidEntry = meal.fluid_ml != null && !meal.fluid_excluded

  const editor = useNutritionAmountEditor({
    initialAmount:   String(isFluidEntry ? Math.round(meal.fluid_ml!) : Math.abs(meal.grams)),
    initialUnit:     isFluidEntry ? 'ml' : isPcsEntry ? 'pcs' : 'g',
    initialCalories: meal.calories,
    initialProtein:  meal.protein,
    initialSg:       servingG ?? 100,
    enableScaling:   enableWeightScaling,
  })

  const saveEdit = () => {
    if (!editName.trim()) return
    const w    = parseFloat(editor.amountStr) || 0
    const isVol = editor.unit !== 'pcs' && UNITS[editor.unit as UnitId].type === 'volume'
    const base  = editor.unit === 'pcs' ? w : toBase(w, editor.unit as UnitId)
    onEdit(meal.id, {
      name:      editName.trim(),
      meal_type: editMealType,
      calories:  Math.max(0, Number(editor.calories) || 0),
      protein:   Math.max(0, Number(editor.protein)  || 0),
      grams:     editor.unit === 'pcs' ? -w : Math.round(base),
      notes:     editNotes.trim() || null,
      ...(isVol ? { fluid_ml: base } : {}),
    })
    setEditing(false)
  }

  const openEdit = () => {
    if (enableWeightScaling) {
      const base = isFluidEntry ? (meal.fluid_ml ?? 0) : Math.abs(meal.grams)
      const d = base || 1
      editor.ratios.current = {
        calPerUnit: meal.calories / d,
        protPerUnit: meal.protein / d,
        perServing: isPcsEntry,
      }
    }
    editor.sg.current = servingG ?? 100
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditName(meal.name)
    setEditMealType(meal.meal_type as MealType)
    editor.setAmountStr(String(isFluidEntry ? Math.round(meal.fluid_ml!) : Math.abs(meal.grams)))
    editor.setUnit(isFluidEntry ? 'ml' : isPcsEntry ? 'pcs' : 'g')
    editor.setCalories(meal.calories)
    editor.setProtein(meal.protein)
    editor.ratios.current = null
    setEditNotes(meal.notes ?? '')
    setEditing(false)
  }

  const openQuickEdit = () => {
    if (enableWeightScaling) {
      const base = isFluidEntry ? (meal.fluid_ml ?? 0) : Math.abs(meal.grams)
      const d = base || 1
      editor.ratios.current = { calPerUnit: meal.calories / d, protPerUnit: meal.protein / d, perServing: isPcsEntry }
    }
    editor.sg.current = servingG ?? 100
    setQuickEdit(true)
  }

  const saveQuickEdit = () => {
    const w     = parseFloat(editor.amountStr) || 0
    const isVol = editor.unit !== 'pcs' && UNITS[editor.unit as UnitId].type === 'volume'
    const base  = editor.unit === 'pcs' ? w : toBase(w, editor.unit as UnitId)
    onEdit(meal.id, {
      calories: Math.max(0, Number(editor.calories) || 0),
      protein:  Math.max(0, Number(editor.protein)  || 0),
      grams:    editor.unit === 'pcs' ? -w : Math.round(base),
      ...(isVol ? { fluid_ml: base, display_unit: editor.unit, display_amount: w }
                : { fluid_ml: null, display_unit: null, display_amount: null }),
    })
    setQuickEdit(false)
  }

  const cancelQuickEdit = () => {
    editor.setAmountStr(String(isFluidEntry ? Math.round(meal.fluid_ml!) : Math.abs(meal.grams)))
    editor.setUnit(isFluidEntry ? 'ml' : isPcsEntry ? 'pcs' : 'g')
    editor.ratios.current = null
    setQuickEdit(false)
  }

  const isRTL = lang === 'he'

  useEffect(() => {
    if (quickEdit) quickInputRef.current?.focus()
  }, [quickEdit])

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
                aria-label={t(lang, 'clearField')}
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
        {/* Row 2: calories | protein | weight | unit */}
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
                style={{ fontSize: 16, paddingInlineEnd: editor.calories !== '' ? 32 : 12 }}
                value={editor.calories}
                placeholder="0"
                onChange={e => editor.setCalories(e.target.value === '' ? '' : Number(e.target.value))}
                onFocus={() => { if (editor.calories === 0) editor.setCalories('') }}
              />
              {editor.calories !== '' && (
                <button onMouseDown={e => { e.preventDefault(); editor.setCalories('') }} tabIndex={-1}
                  aria-label={t(lang, 'clearField')}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--positive-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t(lang, 'proteinGramsLabel')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                className="inp inp-green"
                style={{ fontSize: 16, paddingInlineEnd: editor.protein !== '' ? 32 : 12 }}
                value={editor.protein}
                placeholder="0"
                onChange={e => editor.setProtein(e.target.value === '' ? '' : Number(e.target.value))}
                onFocus={() => { if (editor.protein === 0) editor.setProtein('') }}
              />
              {editor.protein !== '' && (
                <button onMouseDown={e => { e.preventDefault(); editor.setProtein('') }} tabIndex={-1}
                  aria-label={t(lang, 'clearField')}
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
                style={{ width: '100%', fontSize: 16, paddingInlineEnd: editor.amountStr !== '' ? 32 : 12 }}
                value={editor.amountStr}
                placeholder="0"
                onChange={e => editor.handleAmountChange(e.target.value)}
                onFocus={e => e.target.select()}
              />
              {editor.amountStr !== '' && (
                <button onMouseDown={e => { e.preventDefault(); editor.setAmountStr('') }} tabIndex={-1}
                  aria-label={t(lang, 'clearField')}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t(lang, 'unitSingular')}
            </label>
            <select
              className="inp"
              style={{ width: '100%', fontSize: 16 }}
              value={editor.unit}
              onChange={e => editor.handleUnitChange(e.target.value as Parameters<typeof editor.handleUnitChange>[0])}
            >
              <optgroup label={t(lang, 'unitGroupWeight')}>
                <option value="g">{t(lang, 'unitOptG')}</option>
                <option value="oz">{t(lang, 'unitOptOz')}</option>
              </optgroup>
              <optgroup label={t(lang, 'unitGroupVolume')}>
                <option value="ml">{t(lang, 'unitOptMl')}</option>
                <option value="fl_oz">{t(lang, 'unitOptFlOz')}</option>
                <option value="cup">{t(lang, 'unitOptCup')}</option>
                <option value="tbsp">{t(lang, 'unitOptTbsp')}</option>
                <option value="tsp">{t(lang, 'unitOptTsp')}</option>
              </optgroup>
              <optgroup label={t(lang, 'unitGroupCount')}>
                <option value="pcs">{t(lang, 'serving')}</option>
              </optgroup>
            </select>
          </div>
        </div>
        {editor.unit === 'pcs' && (servingG != null) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '3px 8px',
            }}>
              {`${t(lang, 'serving')} ≈ ${servingG}${t(lang, 'proteinUnit')}`}
            </span>
          </div>
        )}
        {/* Notes field */}
        <input
          type="text"
          className="inp"
          style={{ fontSize: 16, marginBottom: 8 }}
          placeholder={t(lang, 'notesPlaceholder')}
          value={editNotes}
          onChange={e => setEditNotes(e.target.value)}
          maxLength={200}
        />
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
        {showCheckbox && (
          <div
            role="checkbox"
            aria-checked={selected}
            tabIndex={0}
            className={`cb${selected ? ' cb-on' : ''}`}
            onClick={e => { e.stopPropagation(); onToggleSelect() }}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggleSelect() } }}
          >
            {selected && <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 13 }}>check</span>}
          </div>
        )}
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
                    ? `${(meal.fluid_ml / 1000).toFixed(1)}${t(lang, 'litersUnit')}`
                    : `${Math.round(meal.fluid_ml)}ml`)
                : meal.grams < 0
                  ? `${Math.abs(meal.grams)} ${t(lang, 'unitLabel')}`
                  : (fmtDisplayUnit(meal, lang) ?? formatWeight(meal.grams, weightUnit, lang))}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', lineHeight: 1 }}>
              {Math.round(meal.calories)}
              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'caloriesUnit')}</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', lineHeight: 1 }}>
              {Math.round(meal.protein * 10) / 10}
              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'gProteinLabel')}</span>
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
        {onDuplicate && (
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); onDuplicate() }}
            aria-label={t(lang, 'duplicate')}
          >
            <span className="icon icon-sm">content_copy</span>
          </button>
        )}
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
          role="checkbox"
          aria-checked={selected}
          tabIndex={0}
          className={`cb${selected ? ' cb-on' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleSelect() }}
          onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggleSelect() } }}
        >
          {selected && <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 13 }}>check</span>}
        </div>
      )}

      {/* Content: 2-line layout — Line1: name+qty, Line2: cal+protein */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: food name + quantity (tap quantity to quick-edit) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: quickEdit ? 'visible' : 'hidden', flexWrap: quickEdit ? 'wrap' : 'nowrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {meal.name}
            {meal.fluid_ml != null && !meal.fluid_excluded && (
              <span className="icon" style={{ fontSize: 13, color: 'var(--cyan-hi)', opacity: 0.8, verticalAlign: 'middle', marginInlineStart: 3 }}>water_drop</span>
            )}
          </span>
          {quickEdit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <input
                ref={quickInputRef}
                type="number"
                inputMode="decimal"
                value={editor.amountStr}
                onChange={e => editor.setAmountStr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveQuickEdit(); if (e.key === 'Escape') cancelQuickEdit() }}
                style={{ width: 64, fontSize: 13, padding: '3px 6px', border: '1.5px solid var(--accent-border-hi)', borderRadius: 6, background: 'var(--inp-bg)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
              />
              <select
                value={editor.unit}
                onChange={e => editor.handleUnitChange(e.target.value as Parameters<typeof editor.handleUnitChange>[0])}
                style={{ fontSize: 13, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--inp-bg)', color: 'var(--text)', fontFamily: 'inherit' }}
              >
                <optgroup label={t(lang, 'unitGroupWeight')}>
                  <option value="g">{t(lang, 'unitOptG')}</option>
                  <option value="oz">{t(lang, 'unitOptOz')}</option>
                </optgroup>
                <optgroup label={t(lang, 'unitGroupVolume')}>
                  <option value="ml">{t(lang, 'unitOptMl')}</option>
                  <option value="fl_oz">{t(lang, 'unitOptFlOz')}</option>
                  <option value="cup">{t(lang, 'unitOptCup')}</option>
                  <option value="tbsp">{t(lang, 'unitOptTbsp')}</option>
                  <option value="tsp">{t(lang, 'unitOptTsp')}</option>
                </optgroup>
                <optgroup label={t(lang, 'unitGroupCount')}>
                  <option value="pcs">{t(lang, 'serving')}</option>
                </optgroup>
              </select>
              <button onClick={saveQuickEdit} aria-label={t(lang, 'save')} style={{ background: 'var(--accent)', color: 'var(--on-color)', border: 'none', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="icon" style={{ fontSize: 16 }}>check</span>
              </button>
              <button onClick={cancelQuickEdit} aria-label={t(lang, 'cancel')} style={{ background: 'var(--surface-1)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="icon" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          ) : (
            <span
              onClick={() => !editing && openQuickEdit()}
              title={t(lang, 'quickEditAmount')}
              style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', borderRadius: 4, padding: '1px 4px', transition: 'background .12s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-fill)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {meal.fluid_ml != null && !meal.fluid_excluded
                ? (meal.fluid_ml >= 1000
                    ? `${(meal.fluid_ml / 1000).toFixed(1)}${t(lang, 'litersUnit')}`
                    : `${Math.round(meal.fluid_ml)}ml`)
                : meal.grams < 0
                  ? `${Math.abs(meal.grams)} ${t(lang, 'unitLabel')}`
                  : (fmtDisplayUnit(meal, lang) ?? formatWeight(meal.grams, weightUnit, lang))}
            </span>
          )}
        </div>
        {/* Line 2: calories · protein · fat · carbs */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-hi)', lineHeight: 1 }}>
            {Math.round(meal.calories)}
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'caloriesUnit')}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--positive-hi)', lineHeight: 1, display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
            {isRTL ? (
              <>{Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>{t(lang, 'proteinUnit')}</span><span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6 }}>{t(lang, 'protein')}</span></>
            ) : (
              <><span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6 }}>{t(lang, 'protein')}</span>{Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>{t(lang, 'proteinUnit')}</span></>
            )}
          </span>
          {meal.fat != null && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning-hi)', opacity: 0.85, display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
              {isRTL ? (
                <>{meal.fat}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>{t(lang, 'fatUnit')}</span><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75 }}>{t(lang, 'fat')}</span></>
              ) : (
                <><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75 }}>{t(lang, 'fat')}</span>{meal.fat}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>{t(lang, 'fatUnit')}</span></>
              )}
            </span>
          )}
          {meal.carbs != null && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--library-hi)', opacity: 0.85, display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
              {isRTL ? (
                <>{meal.carbs}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>{t(lang, 'carbsUnit')}</span><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75 }}>{t(lang, 'carbs')}</span></>
              ) : (
                <><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75 }}>{t(lang, 'carbs')}</span>{meal.carbs}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>{t(lang, 'carbsUnit')}</span></>
              )}
            </span>
          )}
        </div>
        {meal.notes && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0', lineHeight: 1.4 }}>
            {meal.notes}
          </p>
        )}
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
