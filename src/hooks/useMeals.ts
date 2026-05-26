import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Meal, PendingMeal, PendingOperation } from '../types'
import { today } from '../lib/i18n'
import { readCache, writeCache, clearCache } from '../lib/offlineCache'

const MEALS_TTL    = 1000 * 60 * 60 * 24  // 24h
const mealsKey     = (uid: string) => `meals_cache_${uid}`
const pendingKey   = (uid: string) => `pending_meals_${uid}`
const opsKey       = (uid: string) => `pending_ops_${uid}`

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

function normalizeMeal(x: Record<string, unknown>): Meal {
  return {
    id:             x.id          as string,
    user_id:        x.user_id     as string,
    date:           x.date        as string,
    meal_type:      x.meal_type   as Meal['meal_type'],
    name:           x.name        as string,
    grams:          x.grams       as number,
    calories:       x.calories    as number,
    protein:        x.protein     as number,
    fat:            typeof x.fat   === 'number' ? x.fat   : null,
    carbs:          typeof x.carbs === 'number' ? x.carbs : null,
    notes:          typeof x.notes === 'string' ? x.notes : null,
    time_logged:    x.time_logged as string,
    created_at:     x.created_at  as string,
    fluid_ml:       typeof x.fluid_ml === 'number' ? x.fluid_ml : null,
    fluid_excluded: typeof x.fluid_excluded === 'boolean' ? x.fluid_excluded : false,
    display_unit:   typeof x.display_unit === 'string' ? x.display_unit : null,
    display_amount: typeof x.display_amount === 'number' ? x.display_amount : null,
  }
}

export function useMeals(userId: string | null) {
  const [meals, setMeals]               = useState<Meal[]>([])
  const [pendingMeals, setPendingMeals] = useState<PendingMeal[]>([])
  const [pendingOps, setPendingOps]     = useState<PendingOperation[]>([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const fetchMeals = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const { data, error: err } = await supabase
      .from('meals')
      .select('id,user_id,name,calories,protein,fat,carbs,notes,grams,date,meal_type,time_logged,created_at,fluid_ml,fluid_excluded,display_unit,display_amount')
      .eq('user_id', userId)
      .gte('date', cutoff.toISOString().slice(0, 10))
      .order('date', { ascending: false })
      .order('time_logged', { ascending: true })
    if (err) setError(err.message)
    else {
      const fresh = (data as unknown[]).filter(isMeal).map(x => normalizeMeal(x as unknown as Record<string, unknown>))
      setMeals(fresh)
      writeCache(mealsKey(userId), fresh)
      setError(null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (userId) {
      const cached = readCache<Meal[]>(mealsKey(userId), MEALS_TTL)
      if (cached) setMeals(cached)
      const savedPending = readCache<PendingMeal[]>(pendingKey(userId), Infinity) ?? []
      if (savedPending.length) setPendingMeals(savedPending)
      const savedOps = readCache<PendingOperation[]>(opsKey(userId), Infinity) ?? []
      if (savedOps.length) setPendingOps(savedOps)
    }
    fetchMeals()
  }, [fetchMeals, userId])

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

  const savePending = useCallback((next: PendingMeal[]) => {
    setPendingMeals(next)
    if (!userId) return
    if (next.length === 0) clearCache(pendingKey(userId))
    else writeCache(pendingKey(userId), next)
  }, [userId])

  const saveOps = useCallback((next: PendingOperation[]) => {
    setPendingOps(next)
    if (!userId) return
    if (next.length === 0) clearCache(opsKey(userId))
    else writeCache(opsKey(userId), next)
  }, [userId])

  const drainPendingRef = useRef<() => Promise<void>>(async () => {})

  const drainPending = useCallback(async () => {
    if (!userId) return
    let didWork = false

    // Drain add queue — per-item error check, keep failures in queue
    if (pendingMeals.length > 0) {
      const failed: PendingMeal[] = []
      for (const p of pendingMeals) {
        const { pendingId, queuedAt: _ts, ...meal } = p
        const { error: err } = await supabase.from('meals').insert({ ...meal, id: pendingId, user_id: userId })
        if (err) failed.push(p)
        else didWork = true
      }
      savePending(failed)
    }

    // Drain edit/delete queue — per-item error check, treat 404 as success
    if (pendingOps.length > 0) {
      const failed: PendingOperation[] = []
      for (const op of pendingOps) {
        if (op.type === 'delete') {
          const { error: err } = await supabase.from('meals').delete().eq('id', op.mealId).eq('user_id', userId)
          if (err && err.code !== 'PGRST116') failed.push(op)
          else didWork = true
        } else if (op.type === 'update' && op.updates) {
          const { error: err } = await supabase.from('meals').update(op.updates).eq('id', op.mealId).eq('user_id', userId)
          if (err && err.code !== 'PGRST116') failed.push(op)
          else didWork = true
        }
      }
      saveOps(failed)
    }

    if (didWork) fetchMeals()
  }, [userId, pendingMeals, pendingOps, savePending, saveOps, fetchMeals])

  // Keep ref current so the stable 'online' listener always calls the latest version
  useEffect(() => { drainPendingRef.current = drainPending }, [drainPending])

  useEffect(() => {
    const handler = () => drainPendingRef.current()
    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [])

  const addMeal = useCallback(async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
    if (!userId) return
    setError(null)
    if (!navigator.onLine) {
      const p: PendingMeal = {
        pendingId:      crypto.randomUUID(),
        queuedAt:       Date.now(),
        date:           meal.date || today(),
        meal_type:      meal.meal_type,
        name:           meal.name,
        grams:          meal.grams,
        calories:       meal.calories,
        protein:        meal.protein,
        fat:            meal.fat ?? null,
        carbs:          meal.carbs ?? null,
        notes:          meal.notes ?? null,
        time_logged:    meal.time_logged || new Date().toTimeString().slice(0, 8),
        fluid_ml:       meal.fluid_ml ?? null,
        fluid_excluded: meal.fluid_excluded ?? false,
        display_unit:   meal.display_unit ?? null,
        display_amount: meal.display_amount ?? null,
      }
      savePending([...pendingMeals, p])
      return
    }
    const { error: err } = await supabase.from('meals').insert({
      ...meal,
      user_id: userId,
      date: meal.date || today(),
    })
    if (err) { if (import.meta.env.DEV) console.error('Add meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals, pendingMeals, savePending])

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
    if (err) { if (import.meta.env.DEV) console.error('Add meal error:', err); setError(err.message); return null }
    fetchMeals()
    return id
  }, [userId, fetchMeals])

  const updateMeal = useCallback(async (id: string, updates: Partial<Meal>) => {
    if (!userId) return
    setError(null)
    if (!navigator.onLine) {
      // Optimistic: apply update to local meals state
      setMeals(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
      // Merge into ops queue — replace any existing update for same id
      const filtered = pendingOps.filter(op => !(op.mealId === id && op.type === 'update'))
      const existing = pendingOps.find(op => op.mealId === id && op.type === 'update')
      const merged   = existing ? { ...existing.updates, ...updates } : updates
      saveOps([...filtered, { type: 'update', mealId: id, updates: merged, queuedAt: Date.now() }])
      return
    }
    const { error: err } = await supabase.from('meals').update(updates).eq('id', id).eq('user_id', userId)
    if (err) { if (import.meta.env.DEV) console.error('Update meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals, pendingOps, saveOps])

  const deleteMeal = useCallback(async (id: string) => {
    if (!userId) return
    setError(null)
    if (!navigator.onLine) {
      // Optimistic: remove from local meals state
      setMeals(prev => prev.filter(m => m.id !== id))
      // Cancel any pending update for this meal, then queue delete
      const filtered = pendingOps.filter(op => !(op.mealId === id && op.type === 'update'))
      saveOps([...filtered, { type: 'delete', mealId: id, queuedAt: Date.now() }])
      return
    }
    const { error: err } = await supabase.from('meals').delete().eq('id', id).eq('user_id', userId)
    if (err) { if (import.meta.env.DEV) console.error('Delete meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals, pendingOps, saveOps])

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
      fat: meal.fat ?? null,
      carbs: meal.carbs ?? null,
      notes: meal.notes ?? null,
      fluid_ml: meal.fluid_ml ?? null,
      fluid_excluded: meal.fluid_excluded ?? false,
      display_unit: meal.display_unit ?? null,
      display_amount: meal.display_amount ?? null,
      time_logged: new Date().toTimeString().slice(0, 8),
    })
    if (err) { if (import.meta.env.DEV) console.error('Duplicate meal error:', err); setError(err.message) }
    else fetchMeals()
  }, [userId, fetchMeals])

  return { meals, pendingMeals, pendingOps, loading, error, addMeal, addMealWithId, updateMeal, deleteMeal, duplicateMeal, refetch: fetchMeals }
}
