import { useState } from 'react'
import type { Meal, ComposedGroup } from '../types'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'

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
  onAddIngredient: () => void  // signals TodayTab to open the FoodEntryForm modal
}

interface ChildEditState {
  name: string
  calories: number | ''
  protein: number | ''
}

export function ComposedMealCard({
  group, meals, lang, selected, onToggleSelect,
  onEditMeal, onDeleteMeal, onRename, onDeleteGroup, onAddIngredient,
}: ComposedMealCardProps) {
  const [open, setOpen] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(group.name)
  const [editingChildId, setEditingChildId] = useState<string | null>(null)
  const [childEdit, setChildEdit] = useState<ChildEditState>({ name: '', calories: '', protein: '' })

  const totalCal  = Math.round(meals.reduce((s, m) => s + m.calories, 0))
  const totalProt = Math.round(meals.reduce((s, m) => s + m.protein, 0) * 10) / 10

  const saveName = () => {
    const trimmed = nameInput.trim()
    if (trimmed) onRename(trimmed)
    else setNameInput(group.name)
    setEditingName(false)
  }

  const startEditChild = (meal: Meal) => {
    setEditingChildId(meal.id)
    setChildEdit({ name: meal.name, calories: meal.calories, protein: meal.protein })
  }

  const saveChild = (meal: Meal) => {
    onEditMeal(meal.id, {
      name:     childEdit.name || meal.name,
      calories: Number(childEdit.calories) || 0,
      protein:  Number(childEdit.protein)  || 0,
    })
    setEditingChildId(null)
  }

  return (
    <div className="composed-card">
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        {/* Checkbox */}
        <div
          className={`cb${selected ? ' cb-on' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleSelect() }}
        >
          {selected && <span className="icon icon-sm" style={{ color: 'var(--purple)', fontSize: 13 }}>check</span>}
        </div>

        {/* Icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'var(--purple-tint)', border: '1px solid rgba(139,92,246,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="icon icon-sm" style={{ color: 'var(--purple)', fontSize: 15 }}>restaurant</span>
        </div>

        {/* Name (editable) */}
        {editingName ? (
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              className="inp"
              style={{ width: '100%', height: 32, fontSize: 13, fontWeight: 700, paddingInlineStart: 8, paddingInlineEnd: nameInput ? 32 : 8, borderColor: 'rgba(59,130,246,0.4)' }}
              value={nameInput}
              autoFocus
              onChange={e => setNameInput(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameInput(group.name); setEditingName(false) } }}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
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
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {group.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '1px 0 0' }}>
              {meals.length} {t(lang, 'ingredients')}
            </p>
          </div>
        )}

        {/* Totals */}
        {!editingName && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue-hi)', lineHeight: 1 }}>{totalCal}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-hi)', lineHeight: 1 }}>{totalProt}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, lineHeight: 1.4 }}>{t(lang, 'caloriesUnit')}</span>
              <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, lineHeight: 1.4 }}>{t(lang, 'proteinUnit')}</span>
            </div>
          </div>
        )}

        {/* Edit-name button */}
        {!editingName && (
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); setEditingName(true) }}
            aria-label={t(lang, 'edit')}
          >
            <span className="icon icon-sm">edit</span>
          </button>
        )}

        {/* Chevron */}
        <span
          className="chevron-badge"
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          style={{ cursor: 'pointer' }}
        >
          <span className="icon icon-sm" style={{ color: 'var(--text-3)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            expand_more
          </span>
        </span>
      </div>

      {/* ── Children ────────────────────────────────────────── */}
      {open && (
        <div className="composed-children">
          {meals.map(meal => (
            <div key={meal.id}>
              {editingChildId === meal.id ? (
                /* ── Inline child edit form ── */
                <div style={{
                  background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.18)',
                  borderRadius: 8, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="inp"
                      style={{ height: 36, fontSize: 13, width: '100%', paddingInlineEnd: childEdit.name ? 32 : 12 }}
                      value={childEdit.name}
                      placeholder={t(lang, 'foodName')}
                      onChange={e => setChildEdit(s => ({ ...s, name: e.target.value }))}
                      autoFocus
                      dir={lang === 'he' ? 'rtl' : 'ltr'}
                    />
                    {childEdit.name && (
                      <button
                        onMouseDown={e => { e.preventDefault(); setChildEdit(s => ({ ...s, name: '' })) }}
                        tabIndex={-1}
                        style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span className="icon icon-sm">close</span>
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'var(--blue-hi)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                        {t(lang, 'caloriesUnit')}
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        className="inp"
                        style={{ height: 36, fontSize: 13 }}
                        value={childEdit.calories}
                        placeholder="0"
                        onChange={e => setChildEdit(s => ({ ...s, calories: e.target.value === '' ? '' : Number(e.target.value) }))}
                        onFocus={() => { if (childEdit.calories === 0) setChildEdit(s => ({ ...s, calories: '' })) }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'var(--green-hi)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                        {t(lang, 'proteinUnit')}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        className="inp inp-green"
                        style={{ height: 36, fontSize: 13 }}
                        value={childEdit.protein}
                        placeholder="0"
                        onChange={e => setChildEdit(s => ({ ...s, protein: e.target.value === '' ? '' : Number(e.target.value) }))}
                        onFocus={() => { if (childEdit.protein === 0) setChildEdit(s => ({ ...s, protein: '' })) }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-confirm"
                      style={{ flex: 1, height: 36, fontSize: 12 }}
                      onClick={() => saveChild(meal)}
                    >
                      {t(lang, 'save')}
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ flex: 1, height: 36, fontSize: 12 }}
                      onClick={() => setEditingChildId(null)}
                    >
                      {t(lang, 'cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal child row ── */
                <div className="child-row">
                  {/* dot */}
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.45)', flexShrink: 0 }} />

                  {/* name + grams */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meal.name}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '1px 0 0' }}>
                      {meal.grams < 0
                        ? `${Math.abs(meal.grams)} ${lang === 'he' ? 'יח׳' : 'pcs'}`
                        : `${meal.grams}g`}
                    </p>
                  </div>

                  {/* cal / protein */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>{Math.round(meal.calories)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)' }}>{Math.round(meal.protein * 10) / 10}</span>
                  </div>

                  {/* edit */}
                  <button
                    className="icon-btn"
                    style={{ width: 26, height: 26, borderRadius: 6 }}
                    onClick={() => startEditChild(meal)}
                    aria-label={t(lang, 'edit')}
                  >
                    <span className="icon" style={{ fontSize: 14 }}>edit</span>
                  </button>

                  {/* delete */}
                  <button
                    className="icon-btn danger"
                    style={{ width: 26, height: 26, borderRadius: 6 }}
                    onClick={() => onDeleteMeal(meal.id)}
                    aria-label={t(lang, 'delete')}
                  >
                    <span className="icon" style={{ fontSize: 14 }}>delete</span>
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* ── Add ingredient button ── */}
          <button
            onClick={onAddIngredient}
            style={{
              marginTop: 4, width: '100%', background: 'transparent',
              border: '1px dashed rgba(139,92,246,0.3)', borderRadius: 8,
              padding: '6px 10px', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 600, color: 'var(--purple)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span className="icon" style={{ fontSize: 14 }}>add</span>
            {t(lang, 'addIngredient')}
          </button>

          {/* Dissolve group link */}
          <button
            onClick={onDeleteGroup}
            style={{
              marginTop: 4, width: '100%', background: 'transparent',
              border: '1px dashed var(--border)', borderRadius: 8,
              padding: '6px 10px', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span className="icon" style={{ fontSize: 14 }}>link_off</span>
            {lang === 'he' ? 'פרק מנה לרכיבים' : 'Dissolve dish'}
          </button>
        </div>
      )}
    </div>
  )
}
