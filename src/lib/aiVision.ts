import { supabase } from './supabase'
import { AiNetworkError, AiRateLimitError, AiParseError } from './ai'

export { AiNetworkError, AiRateLimitError, AiParseError }

// Thrown specifically when the Groq free-tier vision quota is exceeded
export class AiVisionQuotaError extends Error { name = 'AiVisionQuotaError' }

export interface VisionNutritionResult {
  identified:        string
  calories_per_100g: number
  protein_per_100g:  number
  fat_per_100g:      number | null
  carbs_per_100g:    number | null
  confidence:        'high' | 'medium' | 'low'
}

// ── Client-side daily rate limit (5/day) ──────────────────────────────────────
// Guards against accidental runaway calls before the server even sees the request.
const RL_KEY      = 'photo-nutrition-rl'
const RL_MAX      = 5
const MS_PER_DAY  = 86_400_000

interface RlRecord { count: number; resetAt: number }

function getRlRecord(): RlRecord {
  try {
    const raw = localStorage.getItem(RL_KEY)
    if (!raw) return { count: 0, resetAt: Date.now() + MS_PER_DAY }
    return JSON.parse(raw) as RlRecord
  } catch {
    return { count: 0, resetAt: Date.now() + MS_PER_DAY }
  }
}

export function photoAnalysisRemaining(): number {
  const rec = getRlRecord()
  if (Date.now() > rec.resetAt) return RL_MAX
  return Math.max(0, RL_MAX - rec.count)
}

function canMakeRequest(): boolean {
  return photoAnalysisRemaining() > 0
}

function incrementRl(): void {
  try {
    const rec = getRlRecord()
    const now = Date.now()
    const next: RlRecord = now > rec.resetAt
      ? { count: 1, resetAt: now + MS_PER_DAY }
      : { count: rec.count + 1, resetAt: rec.resetAt }
    localStorage.setItem(RL_KEY, JSON.stringify(next))
  } catch { /* localStorage unavailable — allow the request */ }
}

// ── Image resize (client-side, saves 70-80% of tokens) ───────────────────────
// Returns a base64 JPEG string (no data-URI prefix).
// Uses FileReader instead of createObjectURL — more reliable on iOS PWA.
export async function resizeImageToBase64(file: File, maxPx = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('File read failed'))
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string | undefined
      if (!dataUrl) { reject(new Error('Empty file read')); return }

      const img = new Image()
      img.onerror = () => reject(new Error('Image decode failed'))
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width  * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width  = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas 2d unavailable')); return }
        ctx.drawImage(img, 0, 0, w, h)
        // quality 0.82 — good tradeoff between file size and visual clarity
        const b64 = canvas.toDataURL('image/jpeg', 0.82).replace(/^data:image\/jpeg;base64,/, '')
        resolve(b64)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

// ── Main analysis call ────────────────────────────────────────────────────────
export async function analyzeNutritionImage(
  imageBase64: string,
  hint?: string,
): Promise<VisionNutritionResult> {
  if (!canMakeRequest()) throw new AiVisionQuotaError('Daily photo quota reached')

  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

  let res: Response
  try {
    res = await fetch('/api/nutrition-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64, hint }),
    })
  } catch {
    throw new AiNetworkError('Network error')
  }

  if (res.status === 429) {
    // Distinguish Groq quota from generic rate limit
    if (res.headers.get('X-Quota-Exceeded') === 'groq-free-tier') {
      throw new AiVisionQuotaError('Groq free-tier quota exceeded')
    }
    throw new AiRateLimitError('Rate limit exceeded')
  }

  if (!res.ok) throw new AiNetworkError(`Server error ${res.status}`)

  let data: Record<string, unknown>
  try {
    data = await res.json()
  } catch {
    throw new AiParseError('Invalid JSON response')
  }

  const cal  = data.calories_per_100g
  const prot = data.protein_per_100g
  if (typeof cal !== 'number' || typeof prot !== 'number') {
    throw new AiParseError('Incomplete nutrition data in response')
  }

  // Only increment client counter on success — failed calls don't count
  incrementRl()

  return {
    identified:        typeof data.identified === 'string' ? data.identified : 'Unknown food',
    calories_per_100g: cal,
    protein_per_100g:  prot,
    fat_per_100g:      typeof data.fat_per_100g   === 'number' ? data.fat_per_100g   : null,
    carbs_per_100g:    typeof data.carbs_per_100g === 'number' ? data.carbs_per_100g : null,
    confidence:        data.confidence === 'high' || data.confidence === 'low' ? data.confidence : 'medium',
  }
}
