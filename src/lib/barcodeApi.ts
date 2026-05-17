export interface BarcodeProduct {
  name: string
  brand?: string
  barcode: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g?:   number | null
  carbsPer100g?: number | null
  source: 'openfoodfacts' | 'usda'
}

import { supabase } from './supabase'

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
  const res = await fetch(`/api/barcode?barcode=${encodeURIComponent(barcode)}`, { headers })
  if (!res.ok) return null
  const data = await res.json()
  return data ?? null
}
