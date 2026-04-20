export const config = { runtime: 'edge' }

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

interface BarcodeProduct {
  name: string
  brand?: string
  barcode: string
  caloriesPer100g: number
  proteinPer100g: number
  source: 'openfoodfacts' | 'usda'
}

async function lookupRaw(barcode: string): Promise<BarcodeProduct | null> {
  // Open Food Facts — global coverage including Israel
  try {
    const res = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
    )
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>
      if (data.status === 1 && data.product) {
        const p = data.product as Record<string, unknown>
        const name =
          (p.product_name_he as string) ||
          (p.product_name_en as string) ||
          (p.product_name   as string) || ''
        const brand = (p.brands as string) || ''
        const n = (p.nutriments ?? {}) as Record<string, number>
        const calories =
          n['energy-kcal_100g'] ??
          (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : 0)
        const protein = n['proteins_100g'] ?? 0
        if (name && (calories > 0 || protein > 0)) {
          return {
            name: name.trim(),
            brand: brand.trim() || undefined,
            barcode,
            caloriesPer100g: Math.round(calories),
            proteinPer100g:  Math.round(protein * 10) / 10,
            source: 'openfoodfacts',
          }
        }
      }
    }
  } catch { /* not found */ }

  return null
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { searchParams } = new URL(req.url)
  const barcode = searchParams.get('barcode')?.trim()

  if (!barcode || !/^\d{8,14}$/.test(barcode)) {
    return new Response(JSON.stringify({ error: 'Invalid barcode' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Try barcode, then reversed as fallback
  let product = await lookupRaw(barcode)
  if (!product) {
    const reversed = barcode.split('').reverse().join('')
    if (reversed !== barcode) product = await lookupRaw(reversed)
  }

  return new Response(JSON.stringify(product ?? null), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
