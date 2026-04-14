import type { FoodHistory } from '../types'

interface AutocompleteProps {
  suggestions: FoodHistory[]
  onSelect: (item: FoodHistory) => void
}

export function Autocomplete({ suggestions, onSelect }: AutocompleteProps) {
  if (suggestions.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 6 }}>
      {suggestions.map(item => (
        <button key={item.id} className="chip" onClick={() => onSelect(item)}>
          <span>{item.name}</span>
          <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{item.grams}g</span>
        </button>
      ))}
    </div>
  )
}
