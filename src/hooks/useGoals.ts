import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Goal } from '../types'

const DEFAULT_GOAL: Omit<Goal, 'id' | 'user_id' | 'updated_at'> = {
  default_calories: 1700,
  default_protein: 160,
  weekly_overrides: {},
}

export function useGoals(userId: string | null) {
  const [goals, setGoals] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchGoals = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (!error && data) {
      setGoals(data as Goal)
    } else {
      // New user — auto-save defaults to DB so they have something to start with
      const defaults = { ...DEFAULT_GOAL, user_id: userId, updated_at: new Date().toISOString() }
      await supabase.from('goals').upsert(defaults, { onConflict: 'user_id' })
      setGoals({ id: '', ...defaults })
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  // Realtime
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('goals-changes')
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
    const { error } = await supabase
      .from('goals')
      .upsert({ ...updates, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error && import.meta.env.DEV) console.error('Save goals error:', error)
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

  return { goals, loading, saveGoals, getGoalForDate, refetch: fetchGoals }
}
