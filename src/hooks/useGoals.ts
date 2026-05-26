import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Goal } from '../types'
import { readCache, writeCache } from '../lib/offlineCache'

const GOALS_TTL = 1000 * 60 * 60 * 24 * 7  // 7d
const goalsKey = (uid: string) => `goals_cache_${uid}`

function isGoal(x: unknown): x is Goal {
  return (
    typeof x === 'object' && x !== null &&
    typeof (x as Goal).default_calories === 'number' &&
    typeof (x as Goal).default_protein  === 'number'
  )
}

const DEFAULT_GOAL: Omit<Goal, 'id' | 'user_id' | 'updated_at'> = {
  default_calories: 1700,
  default_protein: 160,
  weekly_overrides: {},
}

export function useGoals(userId: string | null) {
  const [goals, setGoals] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchGoals = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (!err && isGoal(data)) {
      setGoals(data as Goal)
      writeCache(goalsKey(userId), data as Goal)
      setError(null)
    } else if (err?.code === 'PGRST116') {
      // New user — auto-save defaults to DB so they have something to start with
      const defaults = { ...DEFAULT_GOAL, user_id: userId, updated_at: new Date().toISOString() }
      const { error: upsertErr } = await supabase.from('goals').upsert(defaults, { onConflict: 'user_id' })
      if (upsertErr) setError(upsertErr.message)
      else {
        const g: Goal = { id: '', ...defaults }
        setGoals(g)
        writeCache(goalsKey(userId), g)
        setError(null)
      }
    } else if (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (userId) {
      const cached = readCache<Goal>(goalsKey(userId), GOALS_TTL)
      if (cached) setGoals(cached)
    }
    fetchGoals()
  }, [fetchGoals, userId])

  // Realtime
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`goals-changes-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${userId}` },
        () => { fetchGoals() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchGoals])

  const saveGoals = useCallback(async (updates: Partial<Goal>) => {
    if (!userId) return
    const { error: err } = await supabase
      .from('goals')
      .upsert({ ...updates, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (err) { if (import.meta.env.DEV) console.error('Save goals error:', err); setError(err.message) }
    else fetchGoals()
  }, [userId, fetchGoals])

  const getGoalForDate = useCallback((dateStr: string) => {
    if (!goals) return { calories: DEFAULT_GOAL.default_calories, protein: DEFAULT_GOAL.default_protein }
    const [year, month, day] = dateStr.split('-').map(Number)
    const dow = new Date(year, month - 1, day).getDay().toString()
    const override = goals.weekly_overrides?.[dow]
    return {
      calories: override?.calories ?? goals.default_calories,
      protein: override?.protein ?? goals.default_protein,
    }
  }, [goals])

  return { goals, loading, error, saveGoals, getGoalForDate, refetch: fetchGoals }
}
