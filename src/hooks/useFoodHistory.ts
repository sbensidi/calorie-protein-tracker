import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { FoodHistory } from '../types'

function isFoodHistory(x: unknown): x is FoodHistory {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as FoodHistory).id       === 'string' &&
    typeof (x as FoodHistory).name     === 'string' &&
    typeof (x as FoodHistory).grams    === 'number' &&
    typeof (x as FoodHistory).calories === 'number' &&
    typeof (x as FoodHistory).protein  === 'number'
  )
}

export function useFoodHistory(userId: string | null) {
  const [history, setHistory] = useState<FoodHistory[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    if (!userId) return
    const { data, error: err } = await supabase
      .from('food_history')
      .select('*')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })
      .order('last_used', { ascending: false })
    if (err) setError(err.message)
    else { setHistory((data as unknown[]).filter(isFoodHistory)); setError(null) }
  }, [userId])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const upsertHistory = useCallback(async (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>) => {
    if (!userId) return
    // Check if exists
    const { data: existing } = await supabase
      .from('food_history')
      .select('id, use_count')
      .eq('user_id', userId)
      .eq('name', item.name)
      .eq('grams', item.grams)
      .single()

    if (existing) {
      await supabase
        .from('food_history')
        .update({ use_count: existing.use_count + 1, last_used: new Date().toISOString(), calories: item.calories, protein: item.protein })
        .eq('id', existing.id)
    } else {
      await supabase.from('food_history').insert({
        user_id: userId,
        ...item,
        use_count: 1,
        last_used: new Date().toISOString(),
      })
    }
    fetchHistory()
  }, [userId, fetchHistory])

  // Precompute lowercase names once per history change, not on every keystroke
  const historyLower = useMemo(
    () => history.map(h => ({ item: h, nameLower: h.name.toLowerCase() })),
    [history],
  )

  const getSuggestions = useCallback((query: string): FoodHistory[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return historyLower
      .filter(({ nameLower }) => nameLower.includes(q))
      .slice(0, 8)
      .map(({ item }) => item)
  }, [historyLower])

  return { history, error, upsertHistory, getSuggestions }
}
