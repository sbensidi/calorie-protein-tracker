import { useState, useEffect, useCallback } from 'react'
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

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('composed_groups')
      .select('id, name, meal_ids')
      .eq('user_id', userId)
    if (error) { import.meta.env.DEV && console.error('fetch composed_groups:', error); return }
    const loaded = ((data ?? []) as DbRow[]).map(rowToGroup)
    setGroups(loaded)
    lsSave(loaded)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('composed-groups-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'composed_groups', filter: `user_id=eq.${userId}` }, () => fetch())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetch])

  const upsert = useCallback(async (group: ComposedGroup) => {
    // Optimistic update — save locally first so refresh doesn't lose the group
    setGroups(prev => {
      const exists = prev.some(g => g.id === group.id)
      const next = exists ? prev.map(g => g.id === group.id ? group : g) : [...prev, group]
      lsSave(next)
      return next
    })
    if (!userId) return
    const { error } = await supabase.from('composed_groups').upsert({
      id:       group.id,
      user_id:  userId,
      name:     group.name,
      meal_ids: group.mealIds,
      updated_at: new Date().toISOString(),
    })
    if (error) { import.meta.env.DEV && console.error('upsert composed_group:', error) }
    else fetch()
  }, [userId, fetch])

  const remove = useCallback(async (id: string) => {
    // Optimistic update — remove locally first
    setGroups(prev => {
      const next = prev.filter(g => g.id !== id)
      lsSave(next)
      return next
    })
    if (!userId) return
    const { error } = await supabase.from('composed_groups').delete().eq('id', id)
    if (error) { import.meta.env.DEV && console.error('delete composed_group:', error) }
    else fetch()
  }, [userId, fetch])

  const updateLocal = useCallback((next: ComposedGroup[]) => {
    setGroups(next)
    lsSave(next)
  }, [])

  return { groups, upsert, remove, updateLocal, refetch: fetch }
}
