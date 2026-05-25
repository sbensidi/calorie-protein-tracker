import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { UserFoodItem } from '../types'

export function useUserFoodLibrary(userId: string | null) {
  const [items, setItems] = useState<UserFoodItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('user_food_library')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (!error && data) setItems(data as UserFoodItem[])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchItems() }, [fetchItems])

  const addItem = useCallback(async (item: Omit<UserFoodItem, 'id' | 'user_id' | 'created_at'>) => {
    if (!userId) return
    const { error } = await supabase
      .from('user_food_library')
      .insert({ ...item, user_id: userId })
    if (!error) fetchItems()
    return error
  }, [userId, fetchItems])

  const deleteItem = useCallback(async (id: string) => {
    if (!userId) return
    setItems(prev => prev.filter(i => i.id !== id))
    const { error } = await supabase
      .from('user_food_library')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) fetchItems()
  }, [userId, fetchItems])

  const itemsLower = useMemo(
    () => items.map(item => ({ item, nameLower: item.name.toLowerCase() })),
    [items],
  )

  const searchUserLibrary = useCallback((query: string): UserFoodItem[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return itemsLower
      .filter(({ nameLower }) => nameLower.includes(q))
      .slice(0, 5)
      .map(({ item }) => item)
  }, [itemsLower])

  return { items, loading, addItem, deleteItem, searchUserLibrary }
}
