// Vercel Edge Function — Groq Vision proxy for photo-based nutrition analysis
// GROQ_API_KEY lives server-side only (no VITE_ prefix → never bundled to browser)
import { verifySupabaseToken } from './_auth.js'

export const config = { runtime: 'edge' }

declare const process: { env: Record<string, string | undefined> }

// ── Rate limiting (in-memory per edge instance) ───────────────────────────────
const _rl = new Map<string, { count: number; resetAt: number }>()
const RL_MAX    = 5          // requests (vision costs more than text)
const RL_WINDOW = 86_400_000 // per 24 hours

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = _rl.get(ip)
  if (!entry || now > entry.resetAt) {
    _rl.set(ip, { count: 1, resetAt: now + RL_WINDOW })
    return true
  }
  if (entry.count >= RL_MAX) return false
  entry.count++
  return true
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

// Max base64 payload: ~4MB decoded ≈ 5.4MB base64 (768px JPEG)
const MAX_B64_LEN = 5_500_000

function buildSystemPrompt(lang: 'he' | 'en'): string {
  const nameLang = lang === 'he' ? 'Hebrew' : 'English'
  return `You are a nutrition analysis assistant. First determine what type of image this is:

TYPE A — NUTRITION FACTS LABEL: a printed nutrition table on packaging (any language/country).
TYPE B — FOOD DISH/ITEM: actual food, a meal, ingredients, or a packaged product without a visible nutrition table.

If TYPE A (nutrition label):
- Read the exact numeric values from the table.
- Prefer the "per 100g" or "per 100ml" column. If only "per serving" is shown, also read the serving size in grams/ml and calculate per-100g values yourself (value / serving_g * 100).
- If energy is in kJ only, convert to kcal: divide by 4.184.
- The label may be in any language — always output numbers.
- Set "source" to "label" and "confidence" to "high".
- Set "identified" to the product name visible on the label, or "Unknown product" if not visible.

If TYPE B (food/dish):
- Estimate the food name and nutritional values per 100g from visual appearance.
- Set "source" to "dish".
- Set "confidence" to "high" for clearly identifiable single ingredients, "medium" for common dishes, "low" for mixed/unclear/restaurant food.

Return ONLY valid JSON (no markdown, no extra text):
{"source":"label"|"dish","identified":"name in ${nameLang}","calories_per_100g":number,"protein_per_100g":number,"fat_per_100g":number,"carbs_per_100g":number,"confidence":"high"|"medium"|"low"}`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── JWT authentication ─────────────────────────────────────────────────────
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const isValid = await verifySupabaseToken(token)
  if (!isValid) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-Quota-Exceeded': 'groq-free-tier',
        'Retry-After': '86400',
      },
    })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return json({ error: 'Vision analysis not configured' }, 503)
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { imageBase64: string; lang?: string; hint?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { imageBase64, hint } = body
  const lang: 'he' | 'en' = body.lang === 'he' ? 'he' : 'en'

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return json({ error: 'Missing imageBase64' }, 400)
  }
  if (imageBase64.length > MAX_B64_LEN) {
    return json({ error: 'Image too large. Resize to under 512×512 before sending.' }, 413)
  }

  // Strip data URI prefix if present, validate it's base64
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64Data.slice(0, 100))) {
    return json({ error: 'Invalid base64 image data' }, 400)
  }

  const safeHint = hint
    ? String(hint).slice(0, 80).replace(/[\x00-\x1F\x7F"\\]/g, '').trim()
    : null

  const userContent: unknown[] = [
    {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${base64Data}` },
    },
    {
      type: 'text',
      text: safeHint
        ? `This food is "${safeHint}". Estimate the nutrition per 100g.`
        : 'What food is this? Estimate the nutrition per 100g.',
    },
  ]

  // ── Groq Vision call ───────────────────────────────────────────────────────
  let groqRes: Response
  try {
    groqRes = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(lang) },
          { role: 'user',   content: userContent },
        ],
        temperature: 0,
        max_tokens: 160,
      }),
    })
  } catch {
    return json({ error: 'Network error reaching vision service' }, 502)
  }

  if (groqRes.status === 429) {
    return new Response(JSON.stringify({ error: 'Vision quota exceeded' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-Quota-Exceeded': 'groq-free-tier',
      },
    })
  }
  if (!groqRes.ok) {
    return json({ error: 'Vision service error' }, 502)
  }

  let groqData: unknown
  try {
    groqData = await groqRes.json()
  } catch {
    return json({ error: 'Invalid response from vision service' }, 502)
  }

  const text = (groqData as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content?.trim()

  if (!text) {
    return json({ error: 'Empty response from vision model' }, 502)
  }

  // ── Parse vision response ──────────────────────────────────────────────────
  const jsonMatch = text.match(/\{[^{}]+\}/)
  if (!jsonMatch) {
    return json({ error: 'Could not parse vision response' }, 422)
  }

  let parsed: {
    source?: unknown
    identified?: unknown
    calories_per_100g?: unknown
    protein_per_100g?: unknown
    fat_per_100g?: unknown
    carbs_per_100g?: unknown
    confidence?: unknown
  }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return json({ error: 'Invalid JSON from vision model' }, 422)
  }

  const cal  = parsed.calories_per_100g
  const prot = parsed.protein_per_100g
  if (typeof cal !== 'number' || typeof prot !== 'number' || cal < 0 || prot < 0) {
    return json({ error: 'Incomplete nutrition data from vision model' }, 422)
  }

  const confidence = parsed.confidence === 'high' || parsed.confidence === 'low'
    ? parsed.confidence
    : 'medium'

  const source = parsed.source === 'label' ? 'label' : 'dish'

  return json({
    source,
    identified:        typeof parsed.identified === 'string' ? parsed.identified : (source === 'label' ? 'Unknown product' : 'Unknown food'),
    calories_per_100g: Math.round(cal),
    protein_per_100g:  Math.round((prot as number) * 10) / 10,
    fat_per_100g:      typeof parsed.fat_per_100g   === 'number' ? Math.round((parsed.fat_per_100g as number)   * 10) / 10 : null,
    carbs_per_100g:    typeof parsed.carbs_per_100g === 'number' ? Math.round((parsed.carbs_per_100g as number) * 10) / 10 : null,
    confidence,
  }, 200)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
