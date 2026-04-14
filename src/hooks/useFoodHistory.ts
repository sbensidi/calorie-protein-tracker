import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { FoodHistory } from '../types'

export function useFoodHistory(userId: string | null) {
  const [history, setHistory] = useState<FoodHistory[]>([])

  const fetchHistory = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('food_history')
      .select('*')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })
      .order('last_used', { ascending: false })
    if (!error && data) setHistory(data as FoodHistory[])
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

  const getSuggestions = useCallback((query: string): FoodHistory[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return history
      .filter(h => h.name.toLowerCase().includes(q))
      .slice(0, 5)
  }, [history])

  return { history, upsertHistory, getSuggestions }
}
