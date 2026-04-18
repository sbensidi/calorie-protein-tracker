import { useState } from 'react'
import type { Meal, ComposedGroup } from '../types'
import type { Lang } from '../lib/i18n'
import { t, today } from '../lib/i18n'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface ComposedMealCardProps {
  group: ComposedGroup
  meals: Meal[]           // the actual Meal records for this group's mealIds
  lang: Lang
  mealType: MealType
  selected: boolean
  onToggleSelect: () => void
  onEditMeal: (id: string, updates: Partial<Meal>) => void
  onDeleteMeal: (id: string) => void
  onRename: (name: string) => void
  onDeleteGroup: () => void  // dissolves the group (meals remain as standalones)
  onAddIngredient: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => Promise<void>
}

interface ChildEditState {
  name: string
  calories: number | ''
  protein: number | ''
}

interface AddState {
  name: string
  calories: number | ''
  protein: number | ''
  grams: number | ''
}

const EMPTY_ADD: AddState = { name: '', calories: '', protein: '', grams: '' }

export function ComposedMealCard({
  group, meals, lang, mealType, selected, onToggleSelect,
  onEditMeal, onDeleteMeal, onRename, onDeleteGroup, onAddIngredient,
}: ComposedMealCardProps) {
  const [open, setOpen] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(group.name)
  const [editingChildId, setEditingChildId] = useState<string | null>(null)
  const [childEdit, setChildEdit] = useState<ChildEditState>({ name: '', calories: '', protein: '' })
  const [addingIngredient, setAddingIngredient] = useState(false)
  const [addState, setAddState] = useState<AddState>(EMPTY_ADD)
  const [saving, setSaving] = useState(false)

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

  const handleAddIngredient = async () => {
    const name = addState.name.trim()
    if (!name) return
    setSaving(true)
    await onAddIngredient({
      date: today(),
      meal_type: mealType,
      name,
      grams: Number(addState.grams) || 0,
      calories: Number(addState.calories) || 0,
      protein: Number(addState.protein) || 0,
      time_logged: new Date().toTimeString().slice(0, 8),
    })
    setAddState(EMPTY_ADD)
    setAddingIngredient(false)
    setSaving(false)
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
          <input
            className="inp"
            style={{ flex: 1, height: 32, fontSize: 13, fontWeight: 700, padding: '0 8px', borderColor: 'rgba(59,130,246,0.4)' }}
            value={nameInput}
            autoFocus
            onChange={e => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameInput(group.name); setEditingName(false) } }}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
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
            title={t(lang, 'edit')}
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
                  <input
                    className="inp"
                    style={{ height: 36, fontSize: 13 }}
                    value={childEdit.name}
                    placeholder={t(lang, 'foodName')}
                    onChange={e => setChildEdit(s => ({ ...s, name: e.target.value }))}
                    autoFocus
                    dir={lang === 'he' ? 'rtl' : 'ltr'}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'var(--blue-hi)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                        {t(lang, 'caloriesUnit')}
                      </label>
                      <input
                        type="number"
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
                    title={t(lang, 'edit')}
                  >
                    <span className="icon" style={{ fontSize: 14 }}>edit</span>
                  </button>

                  {/* delete */}
                  <button
                    className="icon-btn danger"
                    style={{ width: 26, height: 26, borderRadius: 6 }}
                    onClick={() => onDeleteMeal(meal.id)}
                    title={t(lang, 'delete')}
                  >
                    <span className="icon" style={{ fontSize: 14 }}>delete</span>
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* ── Add ingredient form ── */}
          {addingIngredient ? (
            <div style={{
              background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 8, padding: '10px', display: 'flex', flexDirection: 'column', gap: 8,
              marginTop: 4,
            }}>
              <input
                className="inp"
                style={{ height: 36, fontSize: 13 }}
                value={addState.name}
                placeholder={t(lang, 'foodName')}
                onChange={e => setAddState(s => ({ ...s, name: e.target.value }))}
                autoFocus
                dir={lang === 'he' ? 'rtl' : 'ltr'}
                onKeyDown={e => { if (e.key === 'Enter') handleAddIngredient() }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                    {lang === 'he' ? 'גרמים' : 'Grams'}
                  </label>
                  <input
                    type="number"
                    className="inp"
                    style={{ height: 36, fontSize: 13 }}
                    value={addState.grams}
                    placeholder="0"
                    onChange={e => setAddState(s => ({ ...s, grams: e.target.value === '' ? '' : Number(e.target.value) }))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--blue-hi)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                    {t(lang, 'caloriesUnit')}
                  </label>
                  <input
                    type="number"
                    className="inp"
                    style={{ height: 36, fontSize: 13 }}
                    value={addState.calories}
                    placeholder="0"
                    onChange={e => setAddState(s => ({ ...s, calories: e.target.value === '' ? '' : Number(e.target.value) }))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--green-hi)', fontWeight: 700, display: 'block', marginBottom: 3 }}>
                    {t(lang, 'proteinUnit')}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="inp inp-green"
                    style={{ height: 36, fontSize: 13 }}
                    value={addState.protein}
                    placeholder="0"
                    onChange={e => setAddState(s => ({ ...s, protein: e.target.value === '' ? '' : Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-confirm"
                  style={{ flex: 1, height: 36, fontSize: 12 }}
                  onClick={handleAddIngredient}
                  disabled={saving || !addState.name.trim()}
                >
                  {saving ? '...' : t(lang, 'save')}
                </button>
                <button
                  className="btn-ghost"
                  style={{ flex: 1, height: 36, fontSize: 12 }}
                  onClick={() => { setAddingIngredient(false); setAddState(EMPTY_ADD) }}
                >
                  {t(lang, 'cancel')}
                </button>
              </div>
            </div>
          ) : (
            /* ── Add ingredient button ── */
            <button
              onClick={() => setAddingIngredient(true)}
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
          )}

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
