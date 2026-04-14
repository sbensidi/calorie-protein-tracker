import { useState } from 'react'
import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'

interface MealCardProps {
  meal: Meal
  lang: Lang
  onEdit: (id: string, updates: Partial<Meal>) => void
  onDelete: (id: string) => void
  onDuplicate: (meal: Meal) => void
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export function MealCard({ meal, lang, onEdit, onDelete, onDuplicate }: MealCardProps) {
  const [editing, setEditing] = useState(false)
  const [editName,     setEditName]     = useState(meal.name)
  const [editMealType, setEditMealType] = useState<MealType>(meal.meal_type as MealType)
  const [editCalories, setEditCalories] = useState<number | ''>(meal.calories)
  const [editProtein,  setEditProtein]  = useState<number | ''>(meal.protein)

  const saveEdit = () => {
    onEdit(meal.id, {
      name:      editName,
      meal_type: editMealType,
      calories:  Number(editCalories) || 0,
      protein:   Number(editProtein)  || 0,
    })
    setEditing(false)
  }
  const cancelEdit = () => {
    setEditName(meal.name)
    setEditMealType(meal.meal_type as MealType)
    setEditCalories(meal.calories)
    setEditProtein(meal.protein)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="meal-row" style={{ borderColor: 'rgba(59,130,246,0.25)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className="inp"
            style={{ flex: 1 }}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder={t(lang, 'foodName')}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
          <select
            className="inp"
            style={{ width: 110, flexShrink: 0 }}
            value={editMealType}
            onChange={e => setEditMealType(e.target.value as MealType)}
          >
            <option value="breakfast">{t(lang, 'breakfast')}</option>
            <option value="lunch">{t(lang, 'lunch')}</option>
            <option value="dinner">{t(lang, 'dinner')}</option>
            <option value="snack">{t(lang, 'snack')}</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t(lang, 'calories')}
            </label>
            <input
              type="number"
              className="inp"
              value={editCalories}
              placeholder="0"
              onChange={e => setEditCalories(e.target.value === '' ? '' : Number(e.target.value))}
              onFocus={() => { if (editCalories === 0) setEditCalories('') }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t(lang, 'protein')}
            </label>
            <input
              type="number"
              step="0.1"
              className="inp inp-green"
              value={editProtein}
              placeholder="0"
              onChange={e => setEditProtein(e.target.value === '' ? '' : Number(e.target.value))}
              onFocus={() => { if (editProtein === 0) setEditProtein('') }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveEdit} className="btn-confirm" style={{ flex: 1 }}>{t(lang, 'save')}</button>
          <button onClick={cancelEdit} className="btn-ghost" style={{ flex: 1 }}>{t(lang, 'cancel')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="meal-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meal.name}
        </p>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', margin: '2px 0 0' }}>
          {meal.grams < 0
            ? `${Math.abs(meal.grams)} ${lang === 'he' ? 'יח׳' : 'pcs'}`
            : `${meal.grams}g`}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue-hi)', lineHeight: 1 }}>
          {Math.round(meal.calories)}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginInlineStart: 2 }}>{t(lang, 'caloriesUnit')}</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-hi)', lineHeight: 1 }}>
          {Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginInlineStart: 1 }}>g</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <button className="icon-btn" onClick={() => onDuplicate(meal)} title={t(lang, 'duplicate')}>
          <span className="icon icon-sm">content_copy</span>
        </button>
        <button className="icon-btn" onClick={() => setEditing(true)} title={t(lang, 'edit')}>
          <span className="icon icon-sm">edit</span>
        </button>
        <button className="icon-btn danger" onClick={() => onDelete(meal.id)} title={t(lang, 'delete')}>
          <span className="icon icon-sm">delete</span>
        </button>
      </div>
    </div>
  )
}
