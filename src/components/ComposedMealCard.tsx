import { useState } from 'react'
import type { Meal, ComposedGroup } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir } from '../lib/i18n'
import { MealCard } from './MealCard'
import { useAppContext } from '../context/AppContext'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'beverage'

interface ComposedMealCardProps {
  group: ComposedGroup
  meals: Meal[]           // the actual Meal records for this group's mealIds
  lang: Lang
  selected: boolean
  onToggleSelect: () => void
  onEditMeal: (id: string, updates: Partial<Meal>) => void
  onDeleteMeal: (id: string) => void
  onRename: (name: string) => void
  onDeleteGroup: () => void  // dissolves the group (meals remain as standalones)
  onDuplicate: () => void
  onAddIngredient: () => void  // signals TodayTab to open the FoodEntryForm modal
  onEditRecipe?: () => void   // signals TodayTab to open the edit-recipe modal
  onChangeMealType: (type: MealType) => void
  open?: boolean
  onToggleOpen?: () => void
}

export function ComposedMealCard({
  group, meals, lang, selected, onToggleSelect,
  onEditMeal, onDeleteMeal, onRename, onDeleteGroup, onDuplicate, onAddIngredient, onEditRecipe, onChangeMealType,
  open: openProp, onToggleOpen,
}: ComposedMealCardProps) {
  // open state: controlled from parent (Today tab) to survive group collapse/expand
  // falls back to internal state for classic mode (no parent control)
  const [openInternal, setOpenInternal] = useState(true)
  const isControlled = openProp !== undefined && onToggleOpen !== undefined
  const open = isControlled ? openProp : openInternal
  const toggleOpen = isControlled ? onToggleOpen : () => setOpenInternal(o => !o)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(group.name)
  const [editingPortion, setEditingPortion] = useState(false)
  const [portionName, setPortionName] = useState('')
  const [portionGrams, setPortionGrams] = useState('')
  const [editingMealId, setEditingMealId] = useState<string | null>(null)
  const { styleMode } = useAppContext()

  const totalCal  = Math.round(meals.reduce((s, m) => s + m.calories, 0))
  const totalProt = Math.round(meals.reduce((s, m) => s + m.protein, 0) * 10) / 10

  // Portion mode: group holds a snapshot of the original recipe ingredients,
  // but only one meal record (the logged portion) exists in meals[].
  const isPortionMode = !!(
    group.ingredients?.length &&
    meals.length > 0 &&
    meals.length < group.ingredients.length
  )

  // In the header, show the full recipe ingredient count in portion mode
  const ingredientCount = isPortionMode
    ? (group.ingredients?.length ?? meals.length)
    : meals.length

  const saveName = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== group.name) onRename(trimmed)
    else setNameInput(group.name)
    setEditingName(false)
  }

  const openPortionEdit = () => {
    if (!meals[0]) return
    setPortionName(meals[0].name)
    setPortionGrams(String(meals[0].grams))
    setEditingPortion(true)
  }

  const savePortion = () => {
    if (!meals[0]) { setEditingPortion(false); return }
    const g = parseFloat(portionGrams)
    if (g > 0 && meals[0].grams > 0) {
      const ratio = g / meals[0].grams
      onEditMeal(meals[0].id, {
        name:     portionName.trim() || meals[0].name,
        grams:    Math.round(g),
        calories: Math.round(meals[0].calories * ratio),
        protein:  Math.round(meals[0].protein  * ratio * 10) / 10,
      })
    }
    setEditingPortion(false)
  }


  // ── Minimal mode ────────────────────────────────────────────────
  if (styleMode === 'minimal') {
    return (
      <div style={{ borderBottom: '1px dashed var(--border)' }}>
        {/* Header */}
        {editingPortion ? (
          <div
            style={{ padding: '6px 4px', display: 'flex', gap: 6, alignItems: 'center' }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) savePortion() }}
          >
            <div style={{ position: 'relative', flex: 2, minWidth: 0 }}>
              <input
                className="inp"
                style={{ width: '100%', height: 36, fontSize: 16, fontWeight: 600, paddingInlineStart: 8, paddingInlineEnd: portionName ? 32 : 8, borderColor: 'var(--accent-border-hi)' }}
                value={portionName}
                autoFocus
                onChange={e => setPortionName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePortion(); if (e.key === 'Escape') setEditingPortion(false) }}
                dir={dir(lang)}
              />
              {portionName && (
                <button
                  onMouseDown={e => { e.preventDefault(); setPortionName('') }}
                  tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
            <select
              className="inp"
              style={{ fontSize: 16, flex: 1, minWidth: 70 }}
              value={meals[0]?.meal_type ?? 'snack'}
              onChange={e => onChangeMealType(e.target.value as MealType)}
            >
              <option value="breakfast">{t(lang, 'breakfast')}</option>
              <option value="lunch">{t(lang, 'lunch')}</option>
              <option value="dinner">{t(lang, 'dinner')}</option>
              <option value="snack">{t(lang, 'snack')}</option>
              <option value="beverage">{t(lang, 'beverage')}</option>
            </select>
            <div style={{ position: 'relative', width: 70, flexShrink: 0 }}>
              <input
                type="number" inputMode="decimal" className="inp"
                style={{ height: 36, fontSize: 16, paddingInlineEnd: 22, textAlign: 'end', width: '100%' }}
                value={portionGrams}
                onChange={e => setPortionGrams(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePortion() }}
              />
              <span style={{ position: 'absolute', insetInlineEnd: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-3)', pointerEvents: 'none' }}>{t(lang, 'gramsUnit')}</span>
            </div>
            <button className="icon-btn" onClick={savePortion} aria-label={t(lang, 'save')}>
              <span className="icon icon-sm" style={{ color: 'var(--positive-hi)' }}>check</span>
            </button>
          </div>
        ) : editingName ? (
          <div
            style={{ padding: '8px 4px', display: 'flex', flexDirection: 'row', gap: 6, alignItems: 'center' }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) saveName() }}
          >
            <div style={{ position: 'relative', flex: 3 }}>
              <input
                className="inp"
                style={{ width: '100%', height: 36, fontSize: 16, fontWeight: 600, paddingInlineStart: 8, paddingInlineEnd: nameInput ? 32 : 8 }}
                value={nameInput}
                autoFocus
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameInput(group.name); setEditingName(false) } }}
                dir={dir(lang)}
              />
              {nameInput && (
                <button
                  onMouseDown={e => { e.preventDefault(); setNameInput('') }}
                  tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
            <select
              className="inp"
              style={{ fontSize: 16, flex: 1 }}
              value={meals[0]?.meal_type ?? 'snack'}
              onChange={e => onChangeMealType(e.target.value as MealType)}
            >
              <option value="breakfast">{t(lang, 'breakfast')}</option>
              <option value="lunch">{t(lang, 'lunch')}</option>
              <option value="dinner">{t(lang, 'dinner')}</option>
              <option value="snack">{t(lang, 'snack')}</option>
              <option value="beverage">{t(lang, 'beverage')}</option>
            </select>
            <button className="icon-btn" onClick={saveName} aria-label={t(lang, 'save')}>
              <span className="icon icon-sm" style={{ color: 'var(--positive-hi)' }}>check</span>
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleOpen()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen() } }}
            style={{ padding: '10px 4px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', boxSizing: 'border-box', borderBottom: open ? '1px solid var(--border)' : 'none' }}
          >
            {/* Checkbox */}
            <div
              role="checkbox"
              aria-checked={selected}
              tabIndex={0}
              className={`cb${selected ? ' cb-on' : ''}`}
              onClick={e => { e.stopPropagation(); onToggleSelect() }}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onToggleSelect() } }}
            >
              {selected && <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 13 }}>check</span>}
            </div>

            {/* Restaurant icon — small, no box */}
            <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 14, flexShrink: 0 }}>restaurant</span>

            {/* Name */}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {group.name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {ingredientCount} {t(lang, 'ingredients')}
            </span>

            <span style={{ flex: 1 }} />

            {/* Summary when collapsed */}
            {!open && meals.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0, fontSize: 11 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-hi)' }}>{totalCal}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                <span style={{ color: 'var(--border)', padding: '0 2px' }}>|</span>
                <span style={{ fontWeight: 600, color: 'var(--positive-hi)' }}>{totalProt}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{t(lang, 'proteinUnit')}</span>
              </span>
            )}

            {/* Edit button — edits portion in portion mode, name otherwise */}
            <button
              className="icon-btn"
              onClick={e => { e.stopPropagation(); if (isPortionMode) openPortionEdit(); else setEditingName(true) }}
              aria-label={t(lang, 'edit')}
            >
              <span className="icon icon-sm">edit</span>
            </button>

            {/* Duplicate group */}
            <button
              className="icon-btn"
              onClick={e => { e.stopPropagation(); onDuplicate() }}
              aria-label={t(lang, 'duplicate')}
              title={t(lang, 'duplicate')}
            >
              <span className="icon icon-sm">content_copy</span>
            </button>

            {/* Dissolve — visible in header when open, so user doesn't need to scroll */}
            {open && (
              <button
                className="icon-btn"
                onClick={e => { e.stopPropagation(); onDeleteGroup() }}
                aria-label={t(lang, 'dissolveDish')}
                title={t(lang, 'dissolveDish')}
              >
                <span className="icon icon-sm" style={{ color: 'var(--danger-hi)', opacity: 0.7 }}>link_off</span>
              </button>
            )}

            {/* Chevron */}
            <button
              className="icon-btn"
              onClick={e => { e.stopPropagation(); toggleOpen() }}
              aria-label={open ? t(lang, 'collapseGroup') : t(lang, 'expandGroup')}
              aria-expanded={open}
            >
              <span className="icon" style={{ fontSize: 24, color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                expand_more
              </span>
            </button>
          </div>
        )}

        {/* Expanded ingredient list — matches History list view style */}
        {open && (
          <div style={{ background: 'var(--composed-tint)', margin: '0 -4px', padding: '0 16px 10px' }}>
            {isPortionMode && group.ingredients ? (
              <>
                {group.ingredients.map((ing, i) => (
                  <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px dashed var(--border)', padding: '6px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--composed-border-hi)', flexShrink: 0 }} />
                      <span style={{ flexShrink: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ing.name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{ing.grams}{t(lang, 'gramsUnit')}</span>
                      <span style={{ flex: 1 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, paddingInlineStart: 9 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                        {ing.calories}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                        {ing.protein}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
                      </span>
                    </div>
                  </div>
                ))}
                {/* Edit recipe */}
                {onEditRecipe && (
                  <button
                    onClick={onEditRecipe}
                    style={{
                      margin: '4px 0 2px', width: '100%', background: 'transparent',
                      border: '1px dashed var(--composed-glow)', borderRadius: 8,
                      padding: '6px 10px', fontFamily: 'inherit',
                      fontSize: 11, fontWeight: 600, color: 'var(--composed)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <span className="icon" style={{ fontSize: 14 }}>edit</span>
                    {t(lang, 'editRecipe')}
                  </button>
                )}
              </>
            ) : (
              <>
                {meals.map((meal, idx) => (
                  <div key={meal.id} style={{ borderTop: idx === 0 ? 'none' : '1px dashed var(--border)' }}>
                    {editingMealId === meal.id ? (
                      <MealCard
                        meal={meal}
                        lang={lang}
                        showCheckbox={false}
                        selected={false}
                        onToggleSelect={() => {}}
                        onEdit={(id, updates) => { onEditMeal(id, updates); setEditingMealId(null) }}
                        onDelete={id => { onDeleteMeal(id); setEditingMealId(null) }}
                        enableWeightScaling
                        listStyle
                      />
                    ) : (
                      <div style={{ padding: '6px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--composed-border-hi)', flexShrink: 0 }} />
                          <span style={{ flexShrink: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meal.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {meal.fluid_ml && !meal.fluid_excluded ? `${Math.round(meal.fluid_ml)}ml` : `${Math.abs(meal.grams)}${t(lang, 'gramsUnit')}`}
                          </span>
                          <span style={{ flex: 1 }} />
                          <button className="icon-btn" onClick={() => setEditingMealId(meal.id)} aria-label={t(lang, 'edit')}>
                            <span className="icon icon-sm">edit</span>
                          </button>
                          <button className="icon-btn" onClick={() => onDeleteMeal(meal.id)} aria-label={t(lang, 'delete')}>
                            <span className="icon icon-sm" style={{ color: 'var(--danger-hi)', fontSize: 16 }}>delete</span>
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, paddingInlineStart: 9 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                            {Math.round(meal.calories)}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                            {Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add ingredient */}
                <button
                  onClick={onAddIngredient}
                  style={{
                    margin: '4px 0 4px', width: '100%', background: 'transparent',
                    border: '1px dashed var(--composed-glow)', borderRadius: 8,
                    padding: '6px 10px', fontFamily: 'inherit',
                    fontSize: 11, fontWeight: 600, color: 'var(--composed)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span className="icon" style={{ fontSize: 14 }}>add</span>
                  {t(lang, 'addIngredient')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Classic / Hybrid mode ────────────────────────────────────────
  return (
    <div className="composed-card">
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        role={!editingName && !editingPortion ? 'button' : undefined}
        tabIndex={!editingName && !editingPortion ? 0 : undefined}
        aria-expanded={!editingName && !editingPortion ? open : undefined}
        onClick={() => { if (!editingName && !editingPortion) toggleOpen() }}
        onKeyDown={e => { if (!editingName && !editingPortion && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleOpen() } }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: editingName || editingPortion ? 'default' : 'pointer', userSelect: 'none' }}
      >
        {/* Checkbox + Icon — hidden while editing name or editing portion */}
        {!editingName && !editingPortion && (
          <>
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

            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: 'var(--composed-tint)', border: '1px solid var(--composed-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 15 }}>restaurant</span>
            </div>
          </>
        )}

        {/* Name / edit area */}
        {editingPortion ? (
          /* Portion edit — single row: name · meal type · grams · ✓ */
          <div
            style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, alignItems: 'center' }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) savePortion() }}
          >
            <div style={{ position: 'relative', flex: 2, minWidth: 0 }}>
              <input
                className="inp"
                style={{ width: '100%', height: 38, fontSize: 16, fontWeight: 700, paddingInlineStart: 8, paddingInlineEnd: portionName ? 32 : 8, borderColor: 'var(--accent-border-hi)' }}
                value={portionName}
                autoFocus
                onChange={e => setPortionName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePortion(); if (e.key === 'Escape') setEditingPortion(false) }}
                dir={dir(lang)}
              />
              {portionName && (
                <button
                  onMouseDown={e => { e.preventDefault(); setPortionName('') }}
                  tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
            <select
              className="inp"
              style={{ fontSize: 16, flex: 1, minWidth: 70 }}
              value={meals[0]?.meal_type ?? 'snack'}
              onChange={e => onChangeMealType(e.target.value as MealType)}
            >
              <option value="breakfast">{t(lang, 'breakfast')}</option>
              <option value="lunch">{t(lang, 'lunch')}</option>
              <option value="dinner">{t(lang, 'dinner')}</option>
              <option value="snack">{t(lang, 'snack')}</option>
              <option value="beverage">{t(lang, 'beverage')}</option>
            </select>
            <div style={{ position: 'relative', width: 70, flexShrink: 0 }}>
              <input
                type="number" inputMode="decimal" className="inp"
                style={{ height: 38, fontSize: 16, paddingInlineEnd: 22, textAlign: 'end', width: '100%' }}
                value={portionGrams}
                onChange={e => setPortionGrams(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePortion() }}
              />
              <span style={{ position: 'absolute', insetInlineEnd: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-3)', pointerEvents: 'none' }}>{t(lang, 'gramsUnit')}</span>
            </div>
            <button className="icon-btn" onClick={savePortion} aria-label={t(lang, 'save')}>
              <span className="icon icon-sm" style={{ color: 'var(--positive-hi)' }}>check</span>
            </button>
          </div>
        ) : editingName ? (
          <div
            style={{ flex: 1, display: 'flex', flexDirection: 'row', gap: 6, alignItems: 'center' }}
            onBlur={e => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              saveName()
            }}
          >
            <div style={{ position: 'relative', flex: 3 }}>
              <input
                className="inp"
                style={{ width: '100%', height: 38, fontSize: 16, fontWeight: 700, paddingInlineStart: 8, paddingInlineEnd: nameInput ? 32 : 8, borderColor: 'var(--accent-border-hi)' }}
                value={nameInput}
                autoFocus
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameInput(group.name); setEditingName(false) } }}
                dir={dir(lang)}
              />
              {nameInput && (
                <button
                  onMouseDown={e => { e.preventDefault(); setNameInput('') }}
                  tabIndex={-1}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
            <select
              className="inp"
              style={{ fontSize: 16, flex: 1 }}
              value={meals[0]?.meal_type ?? 'snack'}
              onChange={e => onChangeMealType(e.target.value as MealType)}
            >
              <option value="breakfast">{t(lang, 'breakfast')}</option>
              <option value="lunch">{t(lang, 'lunch')}</option>
              <option value="dinner">{t(lang, 'dinner')}</option>
              <option value="snack">{t(lang, 'snack')}</option>
              <option value="beverage">{t(lang, 'beverage')}</option>
            </select>
            <button className="icon-btn" onClick={saveName} aria-label={t(lang, 'save')}>
              <span className="icon icon-sm" style={{ color: 'var(--positive-hi)' }}>check</span>
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Line 1: name + ingredient count */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {group.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {ingredientCount} {t(lang, 'ingredients')}
              </span>
            </div>
            {/* Line 2: calories + protein */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-hi)', lineHeight: 1 }}>
                {totalCal}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'caloriesUnit')}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--positive-hi)', lineHeight: 1 }}>
                {totalProt}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65, marginInlineStart: 2 }}>{t(lang, 'proteinUnit')}</span>
              </span>
            </div>
          </div>
        )}

        {/* Edit button — edits portion in portion mode, name otherwise */}
        {!editingName && !editingPortion && (
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); if (isPortionMode) openPortionEdit(); else setEditingName(true) }}
            aria-label={t(lang, 'edit')}
          >
            <span className="icon icon-sm">edit</span>
          </button>
        )}

        {/* Dissolve — visible in header when expanded */}
        {!editingName && !editingPortion && open && (
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); onDeleteGroup() }}
            aria-label={t(lang, 'dissolveDish')}
            title={t(lang, 'dissolveDish')}
          >
            <span className="icon icon-sm" style={{ color: 'var(--danger-hi)', opacity: 0.7 }}>link_off</span>
          </button>
        )}

        {/* Chevron — hidden while editing name or editing portion */}
        {!editingName && !editingPortion && (
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); toggleOpen() }}
            aria-label={open ? t(lang, 'collapseGroup') : t(lang, 'expandGroup')}
            aria-expanded={open}
          >
            <span className="icon" style={{ fontSize: 24, color: 'var(--text-3)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              expand_more
            </span>
          </button>
        )}
      </div>

      {/* ── Children ────────────────────────────────────────── */}
      {open && (
        <div className="composed-children">
          {isPortionMode && group.ingredients ? (
            /* Portion mode: snapshot ingredient rows + edit button + portion MealCard */
            <>
              {group.ingredients.map((ing, i) => (
                <div key={i} style={{ padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px dashed var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--composed-border-hi)', flexShrink: 0 }} />
                    <span style={{ flexShrink: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ing.name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{ing.grams}{t(lang, 'gramsUnit')}</span>
                    <span style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3, paddingInlineStart: 11 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                      {ing.calories}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                      {ing.protein}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
                    </span>
                  </div>
                </div>
              ))}
              {/* Edit recipe button */}
              {onEditRecipe && (
                <button
                  onClick={onEditRecipe}
                  style={{
                    margin: '6px 8px 2px', background: 'transparent',
                    border: '1px dashed var(--composed-glow)', borderRadius: 8,
                    padding: '6px 10px', fontFamily: 'inherit',
                    fontSize: 11, fontWeight: 600, color: 'var(--composed)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    width: 'calc(100% - 16px)',
                  }}
                >
                  <span className="icon" style={{ fontSize: 14 }}>edit</span>
                  {t(lang, 'editRecipe')}
                </button>
              )}
            </>
          ) : (
            /* Normal mode: editable meal records */
            <>
              {meals.map((meal, i) => editingMealId === meal.id ? (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  lang={lang}
                  showCheckbox={false}
                  selected={false}
                  onToggleSelect={() => {}}
                  onEdit={(id, updates) => { onEditMeal(id, updates); setEditingMealId(null) }}
                  onDelete={id => { onDeleteMeal(id); setEditingMealId(null) }}
                  enableWeightScaling
                />
              ) : (
                <div key={meal.id} style={{ padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px dashed var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--composed-border-hi)', flexShrink: 0 }} />
                    <span style={{ flexShrink: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meal.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {meal.fluid_ml && !meal.fluid_excluded ? `${Math.round(meal.fluid_ml)}ml` : `${Math.abs(meal.grams)}${t(lang, 'gramsUnit')}`}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button className="icon-btn" onClick={() => setEditingMealId(meal.id)} aria-label={t(lang, 'edit')}>
                      <span className="icon icon-sm">edit</span>
                    </button>
                    <button className="icon-btn" onClick={() => onDeleteMeal(meal.id)} aria-label={t(lang, 'delete')}>
                      <span className="icon icon-sm" style={{ color: 'var(--danger-hi)', fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3, paddingInlineStart: 11 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                      {Math.round(meal.calories)}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                      {Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
                    </span>
                  </div>
                </div>
              ))}
              <button
                onClick={onAddIngredient}
                style={{
                  marginTop: 4, width: '100%', background: 'transparent',
                  border: '1px dashed var(--composed-glow)', borderRadius: 8,
                  padding: '6px 10px', fontFamily: 'inherit',
                  fontSize: 11, fontWeight: 600, color: 'var(--composed)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span className="icon" style={{ fontSize: 14 }}>add</span>
                {t(lang, 'addIngredient')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
