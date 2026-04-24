import { useRef, useEffect } from 'react'
import type { FoodHistory } from '../types'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import { ClearableInput } from './ClearableInput'
import type { ComposedEntry } from './FoodEntryForm'

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
  const unitLabel = lang === 'he' ? 'יח׳' : 'pcs'

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
  const filtered = q
    ? history.filter(h => h.name.toLowerCase().includes(q))
    : [...history].sort((a, b) => b.use_count - a.use_count)

  const matchedComposed = composedEntries
    ? composedEntries.filter(e => !q || e.name.toLowerCase().includes(q))
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
            {lang === 'he' ? 'היסטוריית מזונות' : 'Food history'}
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
            placeholder={lang === 'he' ? 'חיפוש...' : 'Search...'}
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, borderTop: '1px solid var(--border)' }}>

          {/* Composed dishes section */}
          {matchedComposed.length > 0 && (
            <>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {lang === 'he' ? 'מנות שהרכבתי' : 'My composed dishes'}
              </div>
              {matchedComposed.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelectComposed?.(entry)}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%',
                    padding: '10px 14px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="icon icon-sm" style={{ color: 'var(--purple)', flexShrink: 0 }}>restaurant</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.name}
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>{entry.calories}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)', marginInlineStart: 4 }}>{entry.protein}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'proteinUnit')}</span>
                  </div>
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
              {lang === 'he' ? 'לא נמצאו תוצאות' : 'No results found'}
            </div>
          ) : filtered.map((item, i) => {
            const itemIsUnit = item.grams < 0
            const amtDisplay = itemIsUnit
              ? `${Math.abs(item.grams)} ${unitLabel}`
              : `${item.grams}g`
            return (
              <button
                key={item.id}
                onClick={() => onSelectHistory(item)}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  padding: '10px 14px', background: 'transparent', border: 'none',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--inp-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                    {amtDisplay} · {item.use_count} {lang === 'he' ? 'שימושים' : 'uses'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-hi)' }}>{Math.round(item.calories)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'caloriesUnit')}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)', marginInlineStart: 4 }}>{Math.round(item.protein * 10) / 10}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(lang, 'proteinUnit')}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
