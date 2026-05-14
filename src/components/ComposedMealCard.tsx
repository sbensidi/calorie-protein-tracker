import { useState } from 'react'
import type { Meal, ComposedGroup } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir } from '../lib/i18n'
import { MealCard } from './MealCard'

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
  onAddIngredient: () => void  // signals TodayTab to open the FoodEntryForm modal
  onChangeMealType: (type: MealType) => void
}

export function ComposedMealCard({
  group, meals, lang, selected, onToggleSelect,
  onEditMeal, onDeleteMeal, onRename, onDeleteGroup, onAddIngredient, onChangeMealType,
}: ComposedMealCardProps) {
  const [open, setOpen] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(group.name)

  const totalCal  = Math.round(meals.reduce((s, m) => s + m.calories, 0))
  const totalProt = Math.round(meals.reduce((s, m) => s + m.protein, 0) * 10) / 10

  const saveName = () => {
    const trimmed = nameInput.trim()
    if (trimmed) onRename(trimmed)
    else setNameInput(group.name)
    setEditingName(false)
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
          {selected && <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 13 }}>check</span>}
        </div>

        {/* Icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'var(--composed-tint)', border: '1px solid rgba(139,92,246,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 15 }}>restaurant</span>
        </div>

        {/* Name (editable) */}
        {editingName ? (
          <div
            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}
            onBlur={e => {
              // Only close when focus leaves the entire editing area (not just moving to the select)
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              saveName()
            }}
          >
            <div style={{ position: 'relative' }}>
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
              style={{ fontSize: 16, width: '100%' }}
              value={meals[0]?.meal_type ?? 'snack'}
              onChange={e => onChangeMealType(e.target.value as MealType)}
            >
              <option value="breakfast">{t(lang, 'breakfast')}</option>
              <option value="lunch">{t(lang, 'lunch')}</option>
              <option value="dinner">{t(lang, 'dinner')}</option>
              <option value="snack">{t(lang, 'snack')}</option>
              <option value="beverage">{t(lang, 'beverage')}</option>
            </select>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Line 1: name + ingredient count */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {group.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {meals.length} {t(lang, 'ingredients')}
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
            <MealCard
              key={meal.id}
              meal={meal}
              lang={lang}
              showCheckbox={false}
              selected={false}
              onToggleSelect={() => {}}
              onEdit={onEditMeal}
              onDelete={onDeleteMeal}
              enableWeightScaling
            />
          ))}

          {/* ── Add ingredient button ── */}
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
