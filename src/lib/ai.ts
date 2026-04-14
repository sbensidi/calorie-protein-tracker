import type { NutritionResult, FoodHistory } from '../types'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.1-8b-instant'

/**
 * Fallback chain:
 * 1. Check food_history cache (exact name + amount ±5%)
 * 2. Call Groq AI
 * 3. Return {0,0} and let user fill manually
 *
 * amountType: 'g' = weight in grams, 'unit' = discrete items (e.g. 1 egg)
 * Convention: unit-based entries are stored with grams < 0 (negative = unit count)
 */
export async function calculateNutrition(
  foodName: string,
  amount: number,
  history: FoodHistory[],
  amountType: 'g' | 'unit' = 'g'
): Promise<NutritionResult> {
  // Step 1: check history cache
  const cached = findInHistory(foodName, amount, history, amountType)
  if (cached) return cached

  // Step 2: Groq AI
  if (GROQ_API_KEY) {
    try {
      const result = await callGroq(foodName, amount, amountType)
      if (result) return result
    } catch (err) {
      if (import.meta.env.DEV) console.error('Groq AI error:', err)
    }
  }

  // Step 3: USDA fallback (weight-based only)
  if (amountType === 'g') {
    try {
      const result = await callUSDA(foodName, amount)
      if (result) return result
    } catch (err) {
      if (import.meta.env.DEV) console.error('USDA fallback error:', err)
    }
  }

  // Step 4: manual entry
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
    // Unit entries stored as negative grams
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

  // Grams mode — only consider positive-grams entries
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

async function callGroq(
  foodName: string,
  amount: number,
  amountType: 'g' | 'unit'
): Promise<NutritionResult | null> {
  const amountText = amountType === 'unit'
    ? `Quantity: ${amount} item${amount !== 1 ? 's' : ''}`
    : `Amount: ${amount}g`

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
            'You are a nutrition calculator. Return ONLY valid JSON with no markdown, no explanation.\nFormat: {"calories": number, "protein": number}\nCalories in kcal, protein in grams, for the exact amount specified.',
        },
        {
          role: 'user',
          content: `Food: "${foodName.slice(0, 100).replace(/"/g, '')}", ${amountText}. What are the total calories and protein?`,
        },
      ],
      temperature: 0,
      max_tokens: 100,
    }),
  })

  if (!response.ok) throw new Error(`Groq API error: ${response.status}`)
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) return null

  // Extract JSON object from anywhere in the response (model may add extra text)
  const match = text.match(/\{[^{}]*"calories"[^{}]*"protein"[^{}]*\}|\{[^{}]*"protein"[^{}]*"calories"[^{}]*\}/)
  if (!match) return null
  const parsed = JSON.parse(match[0])
  if (typeof parsed.calories === 'number' && typeof parsed.protein === 'number') {
    return { calories: Math.round(parsed.calories), protein: Math.round(parsed.protein * 10) / 10 }
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
  const energyNutrient = nutrients.find(n =>
    n.nutrientName.toLowerCase().includes('energy') && !n.nutrientName.toLowerCase().includes('kj')
  )
  const proteinNutrient = nutrients.find(n => n.nutrientName.toLowerCase() === 'protein')

  // USDA values are per 100g
  const scale = grams / 100
  const calories = energyNutrient ? Math.round(energyNutrient.value * scale) : 0
  const protein  = proteinNutrient ? Math.round(proteinNutrient.value * scale * 10) / 10 : 0

  return { calories, protein }
}
