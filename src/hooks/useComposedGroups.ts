import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { ComposedGroup } from '../types'

// localStorage fallback key (used for migration + offline cache)
const LS_KEY = 'composed-groups'

function lsLoad(): ComposedGroup[] {
  try { const v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : [] } catch { return [] }
}
function lsSave(groups: ComposedGroup[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(groups))
}

interface DbRow {
  id: string
  name: string
  meal_ids: string[]
}

function rowToGroup(row: DbRow): ComposedGroup {
  return { id: row.id, name: row.name, mealIds: row.meal_ids }
}

export function useComposedGroups(userId: string | null) {
  const [groups, setGroups] = useState<ComposedGroup[]>(lsLoad)
  const [error, setError] = useState<string | null>(null)
  const groupsRef = useRef<ComposedGroup[]>(groups)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data, error: err } = await supabase
      .from('composed_groups')
      .select('id, name, meal_ids')
      .eq('user_id', userId)
    if (err) { import.meta.env.DEV && console.error('fetch composed_groups:', err); setError(err.message); return }
    const loaded = ((data ?? []) as DbRow[]).map(rowToGroup)
    groupsRef.current = loaded
    setGroups(loaded)
    lsSave(loaded)
    setError(null)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`composed-groups-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'composed_groups', filter: `user_id=eq.${userId}` }, () => fetch())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetch])

  const upsert = useCallback(async (group: ComposedGroup) => {
    // Optimistic update — save locally first so refresh doesn't lose the group
    setGroups(prev => {
      const exists = prev.some(g => g.id === group.id)
      const next = exists ? prev.map(g => g.id === group.id ? group : g) : [...prev, group]
      groupsRef.current = next
      lsSave(next)
      return next
    })
    if (!userId) return
    const { error: err } = await supabase.from('composed_groups').upsert({
      id:       group.id,
      user_id:  userId,
      name:     group.name,
      meal_ids: group.mealIds,
      updated_at: new Date().toISOString(),
    })
    if (err) { import.meta.env.DEV && console.error('upsert composed_group:', err); setError(err.message) }
    else fetch()
  }, [userId, fetch])

  const remove = useCallback(async (id: string) => {
    if (!userId) return
    setGroups(prev => {
      const next = prev.filter(g => g.id !== id)
      groupsRef.current = next
      lsSave(next)
      return next
    })
    const { error: err } = await supabase.from('composed_groups').delete().eq('id', id).eq('user_id', userId)
    if (err) { import.meta.env.DEV && console.error('delete composed_group:', err); setError(err.message) }
    else fetch()
  }, [userId, fetch])

  // C4: when a meal is deleted, remove it from all groups (delete group if it becomes empty)
  const pruneMealId = useCallback(async (mealId: string) => {
    const current = groupsRef.current
    const affected = current.filter(g => g.mealIds.includes(mealId))
    if (affected.length === 0) return

    const next = current
      .map(g => ({ ...g, mealIds: g.mealIds.filter(id => id !== mealId) }))
      .filter(g => g.mealIds.length > 0)

    groupsRef.current = next
    setGroups(next)
    lsSave(next)

    if (!userId) return
    await Promise.all(affected.map(g => {
      const nextIds = g.mealIds.filter(id => id !== mealId)
      return nextIds.length === 0
        ? supabase.from('composed_groups').delete().eq('id', g.id).eq('user_id', userId)
        : supabase.from('composed_groups').update({ meal_ids: nextIds }).eq('id', g.id).eq('user_id', userId)
    }))
  }, [userId])

  return { groups, error, upsert, remove, pruneMealId, refetch: fetch }
}
