import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Meal } from '../types'
import { today } from '../lib/i18n'

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'beverage'])

function isMeal(x: unknown): x is Meal {
  if (typeof x !== 'object' || x === null) return false
  const m = x as Record<string, unknown>
  return (
    typeof m.id          === 'string' &&
    typeof m.user_id     === 'string' &&
    typeof m.name        === 'string' &&
    typeof m.calories    === 'number' &&
    typeof m.protein     === 'number' &&
    typeof m.grams       === 'number' &&
    typeof m.date        === 'string' &&
    typeof m.time_logged === 'string' &&
    typeof m.created_at  === 'string' &&
    MEAL_TYPES.has(m.meal_type as string)
  )
}

export function useMeals(userId: string | null) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMeals = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('time_logged', { ascending: true })
    if (err) setError(err.message)
    else { setMeals((data as unknown[]).filter(isMeal)); setError(null) }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchMeals()
  }, [fetchMeals])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`meals-changes-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meals', filter: `user_id=eq.${userId}` },
        () => { fetchMeals() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchMeals])

  const addMeal = useCallback(async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
    if (!userId) return
    setError(null)
    const { error: err } = await supabase.from('meals').insert({
      ...meal,
      user_id: userId,
      date: meal.date || today(),
    })
    if (err) { import.meta.env.DEV && console.error('Add meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals])

  const addMealWithId = useCallback(async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>): Promise<string | null> => {
    if (!userId) return null
    setError(null)
    const id = crypto.randomUUID()
    const { error: err } = await supabase.from('meals').insert({
      ...meal,
      id,
      user_id: userId,
      date: meal.date || today(),
    })
    if (err) { import.meta.env.DEV && console.error('Add meal error:', err); setError(err.message); return null }
    fetchMeals()
    return id
  }, [userId, fetchMeals])

  const updateMeal = useCallback(async (id: string, updates: Partial<Meal>) => {
    if (!userId) return
    setError(null)
    const { error: err } = await supabase.from('meals').update(updates).eq('id', id).eq('user_id', userId)
    if (err) { import.meta.env.DEV && console.error('Update meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals])

  const deleteMeal = useCallback(async (id: string) => {
    if (!userId) return
    setError(null)
    const { error: err } = await supabase.from('meals').delete().eq('id', id).eq('user_id', userId)
    if (err) { import.meta.env.DEV && console.error('Delete meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals])

  const duplicateMeal = useCallback(async (meal: Meal) => {
    if (!userId) return
    setError(null)
    const { error: err } = await supabase.from('meals').insert({
      user_id: userId,
      date: today(),
      meal_type: meal.meal_type,
      name: meal.name,
      grams: meal.grams,
      calories: meal.calories,
      protein: meal.protein,
      fluid_ml: meal.fluid_ml ?? null,
      fluid_excluded: meal.fluid_excluded ?? false,
      time_logged: new Date().toTimeString().slice(0, 8),
    })
    if (err) { import.meta.env.DEV && console.error('Duplicate meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals])

  return { meals, loading, error, addMeal, addMealWithId, updateMeal, deleteMeal, duplicateMeal, refetch: fetchMeals }
}
