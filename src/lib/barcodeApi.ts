export interface BarcodeProduct {
  name: string
  brand?: string
  barcode: string
  caloriesPer100g: number
  proteinPer100g: number
  source: 'openfoodfacts' | 'usda'
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const res = await fetch(`/api/barcode?barcode=${encodeURIComponent(barcode)}`)
  if (!res.ok) return null
  const data = await res.json()
  return data ?? null
}
