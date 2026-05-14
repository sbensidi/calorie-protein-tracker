import { useRef, useEffect } from 'react'
import type { FoodHistory } from '../types'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import { ClearableInput } from './ClearableInput'
import type { ComposedEntry } from './FoodEntryForm'
import { fuzzyScore } from '../lib/fuzzyMatch'
import { useAppContext } from '../context/AppContext'

const SEARCH_THRESHOLD = 0.45

interface FoodHistoryModalProps {
  lang: Lang
  history: FoodHistory[]
  composedEntries?: ComposedEntry[]
  search: string
  onSearchChange: (v: string) => void
  onClose: () => void
  onSelectHistory: (item: FoodHistory) => void
  onSelectComposed?: (entry: ComposedEntry) => void
}

export function FoodHistoryModal({
  lang,
  history,
  composedEntries,
  search,
  onSearchChange,
  onClose,
  onSelectHistory,
  onSelectComposed,
}: FoodHistoryModalProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const isRTL = lang === 'he'
  const unitLabel = lang === 'he' ? 'מנות' : 'serving(s)'
  const { styleMode } = useAppContext()
  const minimal = styleMode === 'minimal'

  // Auto-focus search on open
  useEffect(() => {
    const id = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [])

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = search.trim().toLowerCase()
  const filteredRaw = q
    ? [...history]
        .map(h => ({ h, score: fuzzyScore(q, h.name) }))
        .filter(({ score }) => score >= SEARCH_THRESHOLD)
        .sort((a, b) => b.score - a.score || b.h.use_count - a.h.use_count)
        .map(({ h }) => h)
    : [...history].sort((a, b) => b.use_count - a.use_count)
  // Deduplicate by name when no search query — show most-used variant per food name
  const filtered = q ? filteredRaw : (() => {
    const seen = new Set<string>()
    return filteredRaw.filter(h => {
      const key = h.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  const matchedComposed = composedEntries
    ? composedEntries.filter(e => !q || fuzzyScore(q, e.name) >= SEARCH_THRESHOLD)
    : []

  return (
    <div
      className="compose-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="compose-modal"
        style={{ maxWidth: 440, padding: 0, overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>manage_search</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', flex: 1 }}>
            {t(lang, 'foodHistory')}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 14px' }}>
          <ClearableInput
            ref={searchRef}
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onClear={() => onSearchChange('')}
            startIcon="search"
            isRTL={isRTL}
            style={{ height: 40, fontSize: 13 }}
            placeholder={t(lang, 'search')}
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid var(--border)' }}>

          {/* Composed dishes section */}
          {matchedComposed.length > 0 && (
            <>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {t(lang, 'myDishes')}
              </div>
              {matchedComposed.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelectComposed?.(entry)}
                  style={{
                    display: 'block', width: '100%',
                    padding: minimal ? '8px 14px' : '10px 14px',
                    background: 'transparent', border: 'none',
                    borderBottom: minimal ? `1px dashed var(--border)` : '1px solid var(--border)',
                    cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--composed-tint)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {minimal ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {entry.name}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--composed)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {t(lang, 'myDishes')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          {entry.calories}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          {entry.protein}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{lang === 'he' ? 'ג׳ חלבון' : 'g protein'}</span>
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="icon icon-sm" style={{ color: 'var(--composed)', flexShrink: 0 }}>restaurant</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.name}
                      </span>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)' }}>{entry.calories}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)', marginInlineStart: 4 }}>{entry.protein}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'proteinUnit')}</span>
                      </div>
                    </div>
                  )}
                </button>
              ))}
              {filtered.length > 0 && (
                <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {lang === 'he' ? 'היסטוריה' : 'History'}
                </div>
              )}
            </>
          )}

          {filtered.length === 0 && matchedComposed.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              {t(lang, 'noResultsFound')}
            </div>
          ) : filtered.map((item, i) => {
            const itemIsUnit  = item.grams < 0
            const itemIsFluid = item.fluid_ml != null && item.fluid_ml > 0
            const amtDisplay  = itemIsUnit  ? `${Math.abs(item.grams)} ${unitLabel}`
              : itemIsFluid ? (item.fluid_ml! >= 1000 ? `${(item.fluid_ml! / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}` : `${Math.round(item.fluid_ml!)}ml`)
              : `${item.grams}g`
            const isLast = i === filtered.length - 1
            return (
              <button
                key={item.id}
                onClick={() => onSelectHistory(item)}
                style={{
                  display: 'block', width: '100%',
                  padding: minimal ? '8px 14px' : '10px 14px',
                  background: 'transparent', border: 'none',
                  borderBottom: minimal
                    ? (isLast ? 'none' : '1px dashed var(--border)')
                    : (isLast ? 'none' : '1px solid var(--border)'),
                  cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--inp-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {minimal ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {item.name}
                        {itemIsFluid && <span className="icon" style={{ fontSize: 12, color: 'var(--cyan-hi)', opacity: 0.8, verticalAlign: 'middle', margin: '0 4px' }}>water_drop</span>}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{amtDisplay}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          {Math.round(item.calories)}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                          {Math.round(item.protein * 10) / 10}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{lang === 'he' ? 'ג׳ חלבון' : 'g protein'}</span>
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{item.use_count} {t(lang, 'uses')}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                        {amtDisplay} · {item.use_count} {t(lang, 'uses')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)' }}>{Math.round(item.calories)}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)', marginInlineStart: 4 }}>{Math.round(item.protein * 10) / 10}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'proteinUnit')}</span>
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
