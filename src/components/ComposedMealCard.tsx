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
  onAddIngredient: () => void  // signals TodayTab to open the FoodEntryForm modal
  onChangeMealType: (type: MealType) => void
  open?: boolean
  onToggleOpen?: () => void
}

export function ComposedMealCard({
  group, meals, lang, selected, onToggleSelect,
  onEditMeal, onDeleteMeal, onRename, onDeleteGroup, onAddIngredient, onChangeMealType,
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
  const { styleMode } = useAppContext()

  const totalCal  = Math.round(meals.reduce((s, m) => s + m.calories, 0))
  const totalProt = Math.round(meals.reduce((s, m) => s + m.protein, 0) * 10) / 10

  const saveName = () => {
    const trimmed = nameInput.trim()
    if (trimmed) onRename(trimmed)
    else setNameInput(group.name)
    setEditingName(false)
  }

  // ── Minimal mode ────────────────────────────────────────────────
  if (styleMode === 'minimal') {
    return (
      <div style={{ borderBottom: '1px dashed var(--border)' }}>
        {/* Header */}
        {editingName ? (
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
              {meals.length} {t(lang, 'ingredients')}
            </span>

            <span style={{ flex: 1 }} />

            {/* Summary when collapsed */}
            {!open && meals.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0, fontSize: 11 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-hi)' }}>{totalCal}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                <span style={{ color: 'var(--border)', padding: '0 2px' }}>|</span>
                <span style={{ fontWeight: 600, color: 'var(--positive-hi)' }}>{totalProt}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{lang === 'he' ? "ג׳" : 'g'}</span>
              </span>
            )}

            {/* Edit name button */}
            <button
              className="icon-btn"
              onClick={e => { e.stopPropagation(); setEditingName(true) }}
              aria-label={t(lang, 'edit')}
            >
              <span className="icon icon-sm">edit</span>
            </button>

            {/* Chevron */}
            <button
              className="icon-btn"
              onClick={e => { e.stopPropagation(); toggleOpen() }}
              aria-label={open ? (lang === 'he' ? 'כווץ' : 'Collapse') : (lang === 'he' ? 'הרחב' : 'Expand')}
              aria-expanded={open}
            >
              <span className="icon icon-sm" style={{ color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                expand_more
              </span>
            </button>
          </div>
        )}

        {/* Expanded ingredient list — matches History list view style */}
        {open && (
          <div style={{ background: 'var(--composed-tint)', margin: '0 -4px', padding: '0 16px 10px' }}>
            {meals.map((meal, idx) => (
              <div
                key={meal.id}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 6, borderTop: idx === 0 ? 'none' : '1px dashed var(--border)' }}
              >
                <div style={{ flex: 1 }}>
                  <MealCard
                    meal={meal}
                    lang={lang}
                    showCheckbox={false}
                    selected={false}
                    onToggleSelect={() => {}}
                    onEdit={onEditMeal}
                    onDelete={onDeleteMeal}
                    enableWeightScaling
                    listStyle
                  />
                </div>
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

            {/* Dissolve */}
            <button
              onClick={onDeleteGroup}
              style={{
                marginBottom: 6, width: '100%', background: 'transparent',
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

  // ── Classic / Hybrid mode ────────────────────────────────────────
  return (
    <div className="composed-card">
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        role={!editingName ? 'button' : undefined}
        tabIndex={!editingName ? 0 : undefined}
        aria-expanded={!editingName ? open : undefined}
        onClick={() => { if (!editingName) toggleOpen() }}
        onKeyDown={e => { if (!editingName && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleOpen() } }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: editingName ? 'default' : 'pointer', userSelect: 'none' }}
      >
        {/* Checkbox + Icon — hidden while editing name to maximise input width */}
        {!editingName && (
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

        {/* Name (editable) */}
        {editingName ? (
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

        {/* Chevron — hidden while editing name */}
        {!editingName && (
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); toggleOpen() }}
            aria-label={open ? (lang === 'he' ? 'כווץ' : 'Collapse') : (lang === 'he' ? 'הרחב' : 'Expand')}
            aria-expanded={open}
          >
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              expand_more
            </span>
          </button>
        )}
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
