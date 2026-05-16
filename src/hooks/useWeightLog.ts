import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { WeightLog } from '../types'
import { today } from '../lib/i18n'

function isWeightLog(x: unknown): x is WeightLog {
  if (typeof x !== 'object' || x === null) return false
  const w = x as Record<string, unknown>
  return (
    typeof w.id         === 'string' &&
    typeof w.user_id    === 'string' &&
    typeof w.date       === 'string' &&
    typeof w.weight_kg  === 'number' &&
    typeof w.created_at === 'string'
  )
}

export function useWeightLog(userId: string | null) {
  const [entries, setEntries] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 180)
    const { data, error: err } = await supabase
      .from('weight_log')
      .select('id,user_id,date,weight_kg,created_at')
      .eq('user_id', userId)
      .gte('date', cutoff.toISOString().slice(0, 10))
      .order('date', { ascending: false })
    if (err) setError(err.message)
    else { setEntries((data as unknown[]).filter(isWeightLog)); setError(null) }
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`weight-log-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weight_log', filter: `user_id=eq.${userId}` }, () => fetchEntries())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchEntries])

  const logWeight = useCallback(async (weight_kg: number, date?: string) => {
    if (!userId) return
    setError(null)
    const { error: err } = await supabase.from('weight_log').upsert({
      user_id: userId,
      date: date ?? today(),
      weight_kg,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' })
    if (err) { if (import.meta.env.DEV) console.error('Log weight error:', err); setError(err.message) }
    else fetchEntries()
  }, [userId, fetchEntries])

  const deleteEntry = useCallback(async (id: string) => {
    if (!userId) return
    const { error: err } = await supabase.from('weight_log').delete().eq('id', id).eq('user_id', userId)
    if (err) setError(err.message)
    else fetchEntries()
  }, [userId, fetchEntries])

  return { entries, loading, error, logWeight, deleteEntry }
}
