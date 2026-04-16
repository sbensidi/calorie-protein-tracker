import type { NutritionResult, FoodHistory } from '../types'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL    = 'llama-3.3-70b-versatile'

/**
 * Fallback chain:
 * 1. History cache
 * 2. Groq AI — via Edge Function proxy in production, direct in dev
 * 3. USDA (weight-based only)
 * 4. Manual entry {0,0}
 */
export async function calculateNutrition(
  foodName: string,
  amount: number,
  history: FoodHistory[],
  amountType: 'g' | 'unit' = 'g'
): Promise<NutritionResult> {
  const cached = findInHistory(foodName, amount, history, amountType)
  if (cached) return cached

  try {
    // Production: proxy keeps API key server-side
    // Dev: direct call (key in local .env, never committed)
    const result = import.meta.env.DEV
      ? await callGroqDirect(foodName, amount, amountType)
      : await callGroqProxy(foodName, amount, amountType)
    if (result) return result
  } catch (err) {
    if (import.meta.env.DEV) console.error('Groq error:', err)
  }

  if (amountType === 'g') {
    try {
      const result = await callUSDA(foodName, amount)
      if (result) return result
    } catch (err) {
      if (import.meta.env.DEV) console.error('USDA fallback error:', err)
    }
  }

  return { calories: 0, protein: 0 }
}

function findInHistory(
  name: string,
  amount: number,
  history: FoodHistory[],
  amountType: 'g' | 'unit'
): NutritionResult | null {
  const nameLower = name.toLowerCase().trim()

  if (amountType === 'unit') {
    const match = history.find(h => {
      if (h.grams >= 0) return false
      const storedUnits = Math.abs(h.grams)
      const ratio = Math.abs(storedUnits - amount) / Math.max(storedUnits, amount)
      return h.name.toLowerCase().trim() === nameLower && ratio <= 0.05
    })
    if (!match) return null
    const scale = amount / Math.abs(match.grams)
    return {
      calories: Math.round(match.calories * scale),
      protein:  Math.round(match.protein  * scale * 10) / 10,
    }
  }

  const match = history.find(h => {
    if (h.grams <= 0) return false
    const ratio = Math.abs(h.grams - amount) / Math.max(h.grams, amount)
    return h.name.toLowerCase().trim() === nameLower && ratio <= 0.05
  })
  if (!match) return null
  const scale = amount / match.grams
  return {
    calories: Math.round(match.calories * scale),
    protein:  Math.round(match.protein  * scale * 10) / 10,
  }
}

// Production path — key stays on server
async function callGroqProxy(
  foodName: string,
  amount: number,
  amountType: 'g' | 'unit'
): Promise<NutritionResult | null> {
  const res = await fetch('/api/nutrition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foodName, amount, amountType }),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (typeof data.calories === 'number' && typeof data.protein === 'number') {
    return { calories: data.calories, protein: data.protein }
  }
  return null
}

// Dev path — direct call using local VITE_GROQ_API_KEY
async function callGroqDirect(
  foodName: string,
  amount: number,
  amountType: 'g' | 'unit'
): Promise<NutritionResult | null> {
  if (!GROQ_API_KEY) return null

  const safeName = foodName.slice(0, 100).replace(/"/g, '')

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a nutrition expert. Identify the food (translate if needed), then provide accurate USDA nutritional values. ' +
            'Return JSON only: {"food_en": "english name", "calories": number, "protein": number}. No other text.',
        },
        {
          role: 'user',
          content: amountType === 'unit'
            ? `Per 1 piece of ${safeName}?`
            : `Per 100g of ${safeName}?`,
        },
      ],
      temperature: 0,
      max_tokens: 80,
    }),
  })

  if (!response.ok) throw new Error(`Groq API error: ${response.status}`)
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) return null

  const match = text.match(/\{[^{}]*"calories"[^{}]*"protein"[^{}]*\}|\{[^{}]*"protein"[^{}]*"calories"[^{}]*\}/)
  if (!match) return null
  const parsed = JSON.parse(match[0])
  if (typeof parsed.calories === 'number' && typeof parsed.protein === 'number') {
    // Model returns per-100g (grams mode) or per-1-piece (unit mode) — scale to actual amount
    const scale = amountType === 'unit' ? amount : amount / 100
    return {
      calories: Math.round(parsed.calories * scale),
      protein:  Math.round(parsed.protein  * scale * 10) / 10,
    }
  }
  return null
}

async function callUSDA(foodName: string, grams: number): Promise<NutritionResult | null> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(foodName)}&pageSize=1&api_key=DEMO_KEY`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const food = data.foods?.[0]
  if (!food) return null

  const nutrients = food.foodNutrients as Array<{ nutrientName: string; value: number }>
  const energyNutrient  = nutrients.find(n =>
    n.nutrientName.toLowerCase().includes('energy') && !n.nutrientName.toLowerCase().includes('kj')
  )
  const proteinNutrient = nutrients.find(n => n.nutrientName.toLowerCase() === 'protein')

  const scale    = grams / 100
  const calories = energyNutrient  ? Math.round(energyNutrient.value  * scale) : 0
  const protein  = proteinNutrient ? Math.round(proteinNutrient.value * scale * 10) / 10 : 0

  return { calories, protein }
}
