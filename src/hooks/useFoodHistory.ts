import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  const historyRef = useRef<FoodHistory[]>([])

  const fetchHistory = useCallback(async () => {
    if (!userId) return
    const { data, error: err } = await supabase
      .from('food_history')
      .select('*')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })
      .order('last_used', { ascending: false })
    if (err) { import.meta.env.DEV && console.error('fetch food_history:', err); setError(err.message) }
    else {
      const loaded = (data as unknown[]).filter(isFoodHistory)
      historyRef.current = loaded
      setHistory(loaded)
      setError(null)
    }
  }, [userId])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Realtime subscription — keeps history in sync across tabs/devices
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`food-history-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_history', filter: `user_id=eq.${userId}` }, () => fetchHistory())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchHistory])

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

  const deleteHistory = useCallback(async (id: string) => {
    const prev = historyRef.current
    const next  = prev.filter(h => h.id !== id)
    historyRef.current = next
    setHistory(next)
    const { error: err } = await supabase.from('food_history').delete().eq('id', id)
    if (err) { import.meta.env.DEV && console.error('delete food_history:', err); setError(err.message); historyRef.current = prev; setHistory(prev) }
    else fetchHistory()
  }, [fetchHistory])

  const updateHistory = useCallback(async (id: string, updates: Partial<Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>>) => {
    const prev = historyRef.current
    const next  = prev.map(h => h.id === id ? { ...h, ...updates } : h)
    historyRef.current = next
    setHistory(next)
    const { error: err } = await supabase.from('food_history').update(updates).eq('id', id)
    if (err) { import.meta.env.DEV && console.error('update food_history:', err); setError(err.message); historyRef.current = prev; setHistory(prev) }
    else fetchHistory()
  }, [fetchHistory])

  return { history, error, upsertHistory, getSuggestions, deleteHistory, updateHistory }
}
