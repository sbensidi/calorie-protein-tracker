import type { NutritionResult, FoodHistory } from '../types'
import { lookupHebrew } from './hebrewFoods'

export class AiNetworkError   extends Error { name = 'AiNetworkError'   }
export class AiRateLimitError extends Error { name = 'AiRateLimitError' }
export class AiParseError     extends Error { name = 'AiParseError'     }

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
): Promise<NutritionResult | null> {
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
    if (err instanceof AiNetworkError || err instanceof AiRateLimitError || err instanceof AiParseError) throw err
    if (import.meta.env.DEV) console.error('Groq error:', err)
  }

  return null
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
  let res: Response
  try { res = await fetch('/api/nutrition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ foodName, amount, amountType }) }) }
  catch { throw new AiNetworkError() }
  if (res.status === 429) throw new AiRateLimitError()
  if (!res.ok) return null
  let data: Record<string, unknown>
  try { data = await res.json() } catch { throw new AiParseError() }
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

  const groqCall = async (messages: { role: string; content: string }[], maxTokens = 80) => {
    let res: Response
    try { res = await fetch(GROQ_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` }, body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0, max_tokens: maxTokens }) }) }
    catch { throw new AiNetworkError() }
    if (res.status === 429) throw new AiRateLimitError()
    if (!res.ok) return null
    let d: unknown
    try { d = await res.json() } catch { throw new AiParseError() }
    return (d as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content?.trim() ?? null
  }

  // Step 1 — resolve Hebrew food name to English (dictionary first, AI fallback)
  let queryName = lookupHebrew(safeName) ?? safeName

  if (queryName === safeName && /[^\x00-\x7F]/.test(safeName)) {
    // Not in dictionary — try AI translation
    const translated = await groqCall(
      [{ role: 'user', content: `Translate this food name to English (2-4 words max, no punctuation): ${safeName}` }],
      20
    )
    if (translated && /^[a-zA-Z\s\-']+$/.test(translated) && translated.length < 60) {
      queryName = translated
    }
  }

  // Step 2 — nutrition lookup with English name
  const userMsg = amountType === 'unit'
    ? `Per 1 piece of ${queryName}? JSON only: {"calories": number, "protein": number}`
    : `Per 100g of ${queryName}? JSON only: {"calories": number, "protein": number}`

  const text = await groqCall([
    { role: 'system', content: 'You are a nutrition database. Return USDA values as JSON only: {"calories": number, "protein": number}. No other text.' },
    { role: 'user', content: userMsg },
  ])

  if (!text) return null
  const match = text.match(/\{[^{}]*"calories"[^{}]*"protein"[^{}]*\}|\{[^{}]*"protein"[^{}]*"calories"[^{}]*\}/)
  if (!match) return null
  let parsed: { calories?: unknown; protein?: unknown }
  try { parsed = JSON.parse(match[0]) } catch { throw new AiParseError() }
  if (typeof parsed.calories === 'number' && typeof parsed.protein === 'number') {
    const scale = amountType === 'unit' ? amount : amount / 100
    return {
      calories: Math.round(parsed.calories * scale),
      protein:  Math.round(parsed.protein  * scale * 10) / 10,
    }
  }
  return null
}

