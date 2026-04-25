import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { FoodLibraryItem } from '../types'

const CACHE_KEY = 'food_library_cache_v2'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24h — library rarely changes

function loadCache(): FoodLibraryItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch { return null }
}

function saveCache(data: FoodLibraryItem[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch { /* ignore */ }
}

export function useFoodLibrary() {
  const [library, setLibrary] = useState<FoodLibraryItem[]>(() => loadCache() ?? [])
  const [loading, setLoading] = useState(library.length === 0)

  useEffect(() => {
    const cached = loadCache()
    if (cached) { setLibrary(cached); setLoading(false); return }
    supabase
      .from('food_library')
      .select('id, name_he, name_en, category, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, serving_size, serving_unit, density')
      .order('name_he')
      .then(({ data }) => {
        if (data) { setLibrary(data as FoodLibraryItem[]); saveCache(data as FoodLibraryItem[]) }
        setLoading(false)
      })
  }, [])

  const libraryLower = useMemo(
    () => library.map(item => ({ item, nameLower: item.name_he.toLowerCase() + ' ' + item.name_en.toLowerCase() })),
    [library],
  )

  const searchLibrary = useCallback((query: string): FoodLibraryItem[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return libraryLower
      .filter(({ nameLower }) => nameLower.includes(q))
      .slice(0, 8)
      .map(({ item }) => item)
  }, [libraryLower])

  return { library, loading, searchLibrary }
}
