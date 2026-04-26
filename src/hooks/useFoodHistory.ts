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
    // fluid_ml is optional (null for non-fluids)
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

  const upsertHistory = useCallback(async (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>) => {
    if (!userId) return
    setError(null)
    // Match on name + grams (+ fluid_ml when it's a fluid, to distinguish e.g. 240ml vs 240g)
    let query = supabase
      .from('food_history')
      .select('id, use_count')
      .eq('user_id', userId)
      .eq('name', item.name)
      .eq('grams', item.grams)
    query = item.fluid_ml != null
      ? query.eq('fluid_ml', item.fluid_ml)
      : query.is('fluid_ml', null)
    const { data: existing } = await query.single()

    if (existing) {
      const { error: err } = await supabase
        .from('food_history')
        .update({ use_count: existing.use_count + 1, last_used: new Date().toISOString(), calories: item.calories, protein: item.protein, fluid_ml: item.fluid_ml ?? null })
        .eq('id', existing.id)
      if (err) { import.meta.env.DEV && console.error('upsert food_history (update):', err); setError(err.message); return }
    } else {
      const { error: err } = await supabase.from('food_history').insert({
        user_id: userId,
        ...item,
        fluid_ml: item.fluid_ml ?? null,
        use_count: 1,
        last_used: new Date().toISOString(),
      })
      if (err) { import.meta.env.DEV && console.error('upsert food_history (insert):', err); setError(err.message); return }
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
    if (!userId) return
    setError(null)
    const prev = historyRef.current
    const next  = prev.filter(h => h.id !== id)
    historyRef.current = next
    setHistory(next)
    const { error: err } = await supabase.from('food_history').delete().eq('id', id).eq('user_id', userId)
    if (err) { import.meta.env.DEV && console.error('delete food_history:', err); setError(err.message); historyRef.current = prev; setHistory(prev) }
    else fetchHistory()
  }, [userId, fetchHistory])

  const updateHistory = useCallback(async (id: string, updates: Partial<Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>>) => {
    if (!userId) return
    setError(null)
    const prev = historyRef.current
    const next  = prev.map(h => h.id === id ? { ...h, ...updates } : h)
    historyRef.current = next
    setHistory(next)
    const { error: err } = await supabase.from('food_history').update(updates).eq('id', id).eq('user_id', userId)
    if (err) { import.meta.env.DEV && console.error('update food_history:', err); setError(err.message); historyRef.current = prev; setHistory(prev) }
    else fetchHistory()
  }, [userId, fetchHistory])

  // Increments use_count + last_used on an existing record without creating new rows.
  // Used when the user selects from history and re-adds the same food.
  const touchHistory = useCallback(async (id: string) => {
    const existing = historyRef.current.find(h => h.id === id)
    if (!existing) return
    const next = historyRef.current.map(h =>
      h.id === id ? { ...h, use_count: h.use_count + 1, last_used: new Date().toISOString() } : h
    )
    historyRef.current = next
    setHistory(next)
    await supabase
      .from('food_history')
      .update({ use_count: existing.use_count + 1, last_used: new Date().toISOString() })
      .eq('id', id)
  }, [])

  return { history, error, upsertHistory, touchHistory, getSuggestions, deleteHistory, updateHistory }
}
