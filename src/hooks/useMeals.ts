import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Meal } from '../types'
import { today } from '../lib/i18n'

function isMeal(x: unknown): x is Meal {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as Meal).id         === 'string' &&
    typeof (x as Meal).user_id    === 'string' &&
    typeof (x as Meal).name       === 'string' &&
    typeof (x as Meal).calories   === 'number' &&
    typeof (x as Meal).protein    === 'number' &&
    typeof (x as Meal).grams      === 'number' &&
    typeof (x as Meal).date       === 'string'
  )
}

export function useMeals(userId: string | null) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMeals = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('time_logged', { ascending: true })
    if (!error && data) setMeals((data as unknown[]).filter(isMeal))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchMeals()
  }, [fetchMeals])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('meals-changes')
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
    const { error } = await supabase.from('meals').insert({
      ...meal,
      user_id: userId,
      date: meal.date || today(),
    })
    if (error) import.meta.env.DEV && console.error('Add meal error:', error)
    else fetchMeals()
  }, [userId, fetchMeals])

  const addMealWithId = useCallback(async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>): Promise<string | null> => {
    if (!userId) return null
    const id = crypto.randomUUID()
    const { error } = await supabase.from('meals').insert({
      ...meal,
      id,
      user_id: userId,
      date: meal.date || today(),
    })
    if (error) { import.meta.env.DEV && console.error('Add meal error:', error); return null }
    fetchMeals()
    return id
  }, [userId, fetchMeals])

  const updateMeal = useCallback(async (id: string, updates: Partial<Meal>) => {
    const { error } = await supabase.from('meals').update(updates).eq('id', id)
    if (error) import.meta.env.DEV && console.error('Update meal error:', error)
    else fetchMeals()
  }, [fetchMeals])

  const deleteMeal = useCallback(async (id: string) => {
    const { error } = await supabase.from('meals').delete().eq('id', id)
    if (error) import.meta.env.DEV && console.error('Delete meal error:', error)
    else fetchMeals()
  }, [fetchMeals])

  const duplicateMeal = useCallback(async (meal: Meal) => {
    if (!userId) return
    const { error } = await supabase.from('meals').insert({
      user_id: userId,
      date: today(),
      meal_type: meal.meal_type,
      name: meal.name,
      grams: meal.grams,
      calories: meal.calories,
      protein: meal.protein,
      time_logged: new Date().toTimeString().slice(0, 8),
    })
    if (error) import.meta.env.DEV && console.error('Duplicate meal error:', error)
    else fetchMeals()
  }, [userId, fetchMeals])

  return { meals, loading, addMeal, addMealWithId, updateMeal, deleteMeal, duplicateMeal, refetch: fetchMeals }
}
